import { Room } from '@colyseus/core';
import { GAME_MODES } from '../gameModes.js';
import { COUNTDOWN_MS, GAME_INTRO_MS, LIFE_LOSS_INTRO_MS, LIFE_LOSS_ENTRY_MS, LIFE_LOSS_WORD_MS, LIFE_LOSS_ELIM_MS, MATCH_OVER_MS, roundResultMs } from '../timings.js';
// Core simulation (field generation, physics, tap validation, difficulty ramp) lives in the shared,
// networking-free ../gameSim.js so the CLIENT can run the SAME code for offline solo. This room owns
// the state + tick loop + broadcasts and delegates the pure math to `sim`.
import * as sim from '../gameSim.js';

const TICK_RATE = 50;
const LOBBY_TIMEOUT = 1000 * 60 * 10;

const DEFAULT_MODE = GAME_MODES.redacted;

// Round-over pacing. The next round waits for the client's life-loss animation:
// one beat per player who lost a life (must match LifeLossCallout ENTRY_MS on the
// client), plus a short hold on the final value.
const ROUND_OVER_HOLD_MS = 1300; // cursor blinks on the last player for this long before advancing
// The post-match hold is DERIVED from the client's match-over animation phases (timings.js), so it
// always lasts exactly as long as the animation — no separate display time to keep in sync.
const MATCH_OVER_DISPLAY_MS = MATCH_OVER_MS;

class GameRoom extends Room {
    onCreate() {
        this.autoDispose = false;
        this.maxClients = 10;      // cap total connections (players + mid-game spectators) per lobby
        this.isPrivate = false;    // Public by default: discoverable by QUICK JOIN matchmaking. Private
                                   // rooms call setPrivate(true) → hidden from matchmaking, code-join only.
        this.roomCode = this.generateRoomCode();
        this.gameMode = DEFAULT_MODE;
        this.settings = { ...DEFAULT_MODE.defaultSettings };
        this.selectedMode = null;
        this.selectedSettingsData = null;
        this.customOpen = false; // host's CUSTOM (settings editor) view, mirrored to non-hosts

        this.currentMatch = 1;
        this.currentRound = 1;
        this.matchWins = {};
        this.timeLeft = this.settings.roundTime;
        this.players = {};
        this.activePlayers = {};
        this.taps = [];
        this.charRadii = {}; // char -> { rx, ry } normalized collision radii (sent by clients)
        this.targetObj = null;   // reference to the current target char, for tap validation
        this.targetHistIdx = 0;
        this.targetHistory = Array.from({ length: sim.TARGET_HISTORY }, () => ({ x: 0, y: 0, t: -1 }));
        this.chars = this.generateChars();
        this.lastTick = Date.now();
        this.timeUpHandled = false;
        this.gameOver = false;
        this.gameStarted = false;
        this.roundActive = false;
        this.inCountdown = false;
        this.countdownStartTime = null;
        this.currentRoundOverMessage = null;

        this.clock.setTimeout(() => {
            if (!this.gameStarted) this.disconnect();
        }, LOBBY_TIMEOUT);

        // Clients send the per-char normalized collision radii — computed from the
        // font (opentype) + the play-box size, which only the client knows. Stored
        // once and stamped onto each char at creation; the bounce never recomputes.
        this.onMessage('charRadii', (client, data) => {
            if (data) this.charRadii = data;
        });

        this.onMessage('tap', (client, data) => {
            if (this.inCountdown) return;
            if (!this.roundActive) return;
            const player = this.activePlayers[client.sessionId];
            if (!player || !player.alive) return;
            if (this.taps.find(t => t.id === client.sessionId)) return;
            if (!this._tapHitsTarget(data)) return;   // server decides the hit — the client isn't trusted

            if (this.gameMode.id === 'frequency') { this._frequencyTap(client.sessionId); return; }

            this.taps.push({ id: client.sessionId, time: Date.now() });
            this.broadcastPlayerList();

            const totalAlive = this.getAlivePlayers().length;
            if (totalAlive >= this.settings.minPlayers && this.taps.length === totalAlive - 1) {
                const tappedIds = this.taps.map(t => t.id);
                const eliminatedId = this.getAlivePlayers().find(id => !tappedIds.includes(id));
                this.activePlayers[eliminatedId].lives -= 1;

                let roundOverMsg;
                if (this.activePlayers[eliminatedId].lives <= 0) {
                    this.activePlayers[eliminatedId].alive = false;
                    roundOverMsg = {
                        id: eliminatedId,
                        eliminatedName: this.activePlayers[eliminatedId].name,
                        lostLife: false
                    };
                } else {
                    roundOverMsg = {
                        id: eliminatedId,
                        lostLifeName: this.activePlayers[eliminatedId].name,
                        livesRemaining: this.activePlayers[eliminatedId].lives,
                        lostLife: true
                    };
                }

                this.currentRoundOverMessage = roundOverMsg;
                this.broadcast('roundOver', roundOverMsg);
                this.startNextRound(1, roundOverMsg.lostLife && roundOverMsg.livesRemaining === 1 ? 1 : 0,
                    roundOverMsg.lostLife ? 0 : 1);
            }
        });

        this.onMessage('updateSettings', (client, data) => {
            if (client.sessionId !== Object.keys(this.players)[0]) return;
            this.selectedMode = data.mode;
            this.selectedSettingsData = data.settings;
            this.customOpen = !!data.customOpen; // host's CUSTOM view, mirrored to non-hosts
            this.broadcast('settingsUpdated', data);
        });

        this.onMessage('setPrivacy', (client, data) => {
            if (client.sessionId !== Object.keys(this.players)[0]) return;   // host only
            const priv = data.private === true;
            this.isPrivate = priv;
            this.setPrivate(priv);   // Colyseus: private rooms drop out of matchmaking (QUICK JOIN),
                                     // but stay joinable by code. Public rooms are matchmakeable.
            this.broadcast('privacyUpdated', { private: priv });
        });

        this.onMessage('makeHost', (client, data) => {
            if (client.sessionId !== Object.keys(this.players)[0]) return;
            if (!this.players[data.targetId]) return;
            if (!this.players[data.targetId].connected) return;

            const playerIds = Object.keys(this.players);
            const hostIndex = playerIds.indexOf(client.sessionId);
            const targetIndex = playerIds.indexOf(data.targetId);
            if (hostIndex === -1 || targetIndex === -1) return;

            playerIds.splice(hostIndex, 1);
            playerIds.splice(0, 0, data.targetId);
            playerIds.splice(targetIndex + (targetIndex < hostIndex ? 1 : 0), 1);
            playerIds.splice(1, 0, client.sessionId);

            const reordered = {};
            playerIds.forEach(id => {
                reordered[id] = this.players[id];
            });
            this.players = reordered;
            this.broadcastPlayerList();
        });

        this.onMessage('clientReady', (client) => {
            client.send('gameState', {
                chars: this.charInit(),
                targetChar: this.targetChar,
                timeLeft: this.timeLeft,
                round: this.currentRound,
                match: this.currentMatch
            });
        });

        this.playAgainVotes = new Set();
        this.returnToLobbyVotes = new Set();

        this.onMessage('votePlayAgain', (client) => {
            if (!this.players[client.sessionId]) return;
            if (this.playAgainVotes.has(client.sessionId)) {
                this.playAgainVotes.delete(client.sessionId);
            } else {
                this.playAgainVotes.add(client.sessionId);
                this.returnToLobbyVotes.delete(client.sessionId);
            }
            this.checkPlayAgainVotes();
            this.checkReturnToLobbyVotes();
        });

        this.onMessage('voteReturnToLobby', (client) => {
            if (!this.players[client.sessionId]) return;
            if (this.returnToLobbyVotes.has(client.sessionId)) {
                this.returnToLobbyVotes.delete(client.sessionId);
            } else {
                this.returnToLobbyVotes.add(client.sessionId);
                this.playAgainVotes.delete(client.sessionId);
            }
            this.checkPlayAgainVotes();
            this.checkReturnToLobbyVotes();
        });

        this.onMessage('leaveToMenu', (client) => {
            const player = this.players[client.sessionId];
            if (!player) return;

            const playerIds = Object.keys(this.players);
            if (playerIds[0] === client.sessionId && playerIds.length > 1) {
                this.broadcast('newHost', { id: playerIds[1] });
            }

            this._removeFromMatchMidGame(client.sessionId);   // re-evaluate the round/match, then DQ them
            client.leave(1000);
        });

        this.onMessage('startGame', (client, data) => {
            if (client.sessionId !== Object.keys(this.players)[0]) return;
            const connected = this.getConnectedPlayers();
            if (connected.length < this.settings.minPlayers) {
                client.send('startError', { message: `?INVALID PLAYER COUNT` });
                return;
            }

            // Resolve the actual game mode (the room only tracked the selection until now) and build
            // its settings generically — each mode exposes a different set of keys, so we start from
            // its defaults and override with any provided value. minPlayers is always the mode default.
            const modeId = this.selectedMode || 'redacted';
            this.gameMode = GAME_MODES[modeId] || DEFAULT_MODE;
            const provided = data.settings || {};
            this.settings = { ...this.gameMode.defaultSettings };
            for (const key of Object.keys(this.gameMode.defaultSettings)) {
                if (provided[key] != null) this.settings[key] = provided[key];
            }
            this.settings.minPlayers = this.gameMode.defaultSettings.minPlayers;

            const isFreq = this.gameMode.id === 'frequency';
            this.activePlayers = {};
            connected.forEach(id => {
                this.activePlayers[id] = {
                    ...this.players[id], tapped: false,
                    lives: isFreq ? null : this.settings.lives,   // Frequency has no lives
                    score: 0, roundScore: 0, place: null
                };
                this.matchWins[id] = 0;
            });

            this.currentMatch = 1;
            this.currentRound = 1;
            this.timeLeft = this.settings.roundTime;
            this.gameStarted = true;
            this.roundActive = false;
            this.currentRoundOverMessage = null;
            this.lastTick = Date.now();

            this.broadcast('gameStarted', {
                match: this.currentMatch,
                timeLeft: this.timeLeft,             // full round time, so the box timer is right from the first frame
                totalMatches: this.settings.matches,
                totalRounds: this.settings.rounds,   // Frequency: total rounds for the "Round X/N" label
                mode: this.selectedMode || 'redacted'
            });
            this.broadcastPlayerList();
            // Hold the FIRST countdown while the clients type the game screen in (the lobby
            // scrolls off, the frame types), so "Find: X" starts as the feed lands. Later
            // rounds don't wait — the screen is already up. Same constant both sides.
            this.clock.setTimeout(() => this.startRoundCountdown(), GAME_INTRO_MS);
        });

        this.setSimulationInterval(() => {
            if (!this.gameStarted || this.gameOver || !this.roundActive) return;

            const now = Date.now();
            const delta = (now - this.lastTick) / 1000;
            this.lastTick = now;

            this.updateChars(delta);
            // Record the target's position for lag-compensated tap validation.
            if (this.targetObj) {
                const h = this.targetHistory[this.targetHistIdx];
                h.x = this.targetObj.x; h.y = this.targetObj.y; h.t = now;
                this.targetHistIdx = (this.targetHistIdx + 1) % sim.TARGET_HISTORY;
            }
            this.timeLeft -= delta;

            let timeUp = false;
            if (this.timeLeft <= 0 && !this.timeUpHandled) {
                this.timeLeft = 0;
                this.timeUpHandled = true;
                timeUp = true;
            }

            // Broadcast this tick (timeLeft = 0 on the final one) BEFORE handling time-up:
            // handleTimeUp() → startNextRound() resets this.timeLeft to the full round time,
            // so broadcasting after it would send the full time and the client clock would
            // snap from 00:00 back up to the full duration.
            this.broadcast('charUpdate', {
                pos: this.charPositions(),
                timeLeft: this.timeLeft
            });

            if (timeUp) this.handleTimeUp();
        }, TICK_RATE);
    }

    getAlivePlayers() {
        return Object.keys(this.activePlayers).filter(id => this.activePlayers[id].alive);
    }

    getConnectedPlayers() {
        return Object.keys(this.players).filter(id => this.players[id].connected);
    }

    broadcastPlayerList() {
        const tappedIds = this.taps.map(t => t.id);
        const hostId = Object.keys(this.players)[0];
        this.broadcast('playerList', {
            players: Object.values(this.players).map(p => ({
                id: p.id,
                name: p.name,
                connected: p.connected,
                alive: this.activePlayers[p.id] ? this.activePlayers[p.id].alive : true,
                tapped: tappedIds.includes(p.id),
                matchWins: this.matchWins[p.id] || 0,
                isHost: p.id === hostId,
                lives: this.activePlayers[p.id] ? this.activePlayers[p.id].lives : null,
                score: this.activePlayers[p.id] ? (this.activePlayers[p.id].score || 0) : 0,   // Frequency
                // Frequency: points gained THIS round. The frozen side-list score everyone shows is
                // score - roundScore (the round-start total), so it's fully server-derivable — a
                // reconnecting client computes the same value instead of guessing from a stale snapshot.
                roundScore: this.activePlayers[p.id] ? (this.activePlayers[p.id].roundScore || 0) : 0,
                spectator: !this.activePlayers[p.id]   // joined after the game started → spectates
            }))
        });
    }

    // `resumed` — true only when this client's session is being RESTORED (onReconnect), false
    // for a fresh arrival (onJoin), including someone joining a live game as a spectator. It
    // can't be derived from the state here: a reconnecting spectator and a new spectator look
    // identical, so only the call site knows. The client uses it to decide whether the game
    // screen types in (fresh) or just loads mid-round (resumed).
    sendPlayerState(client, resumed = false) {
        client.send('roomCode', { code: this.roomCode });
        client.send('privacyUpdated', { private: this.isPrivate });   // reflect current lobby visibility
        if (this.selectedMode) {
            client.send('settingsUpdated', {
                mode: this.selectedMode,
                settings: this.selectedSettingsData,
                customOpen: this.customOpen
            });
        }
        if (this.gameStarted) {
            client.send('reconnected', {
                chars: this.inCountdown ? [] : this.charInit(),
                targetChar: this.inCountdown ? null : this.targetChar,
                timeLeft: this.timeLeft,
                round: this.currentRound,
                match: this.currentMatch,
                totalMatches: this.settings.matches,
                totalRounds: this.settings.rounds,
                gameStarted: true,
                resumed,
                gameOver: this.gameOver,
                winnerName: this.gameOver ? this.lastWinnerName : null,
                mode: this.selectedMode || 'redacted'
            });

            this.broadcastPlayerList();

            if (this.inCountdown) {
                const elapsed = (Date.now() - this.countdownStartTime) / 1000;
                client.send('roundCountdown', {
                    targetChar: this.targetChar,
                    round: this.currentRound,
                    match: this.currentMatch,
                    chars: this.charInit(),
                    elapsedSeconds: elapsed
                });
            } else if (this.currentRoundOverMessage && !this.roundActive) {
                client.send(this.gameMode.id === 'frequency' ? 'roundResult' : 'roundOver', this.currentRoundOverMessage);
            }
        } else {
            this.broadcastPlayerList();
        }
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    handleTimeUp() {
        if (this.gameMode.id === 'frequency') { this._endFrequencyRound(); return; }

        const tappedIds = this.taps.map(t => t.id);
        const untapped = this.getAlivePlayers().filter(id => !tappedIds.includes(id));

        const eliminated = [];
        const lostLife = [];

        untapped.forEach(id => {
            this.activePlayers[id].lives -= 1;
            if (this.activePlayers[id].lives <= 0) {
                this.activePlayers[id].alive = false;
                eliminated.push({ id, name: this.activePlayers[id].name });
            } else {
                lostLife.push({ id, name: this.activePlayers[id].name, livesRemaining: this.activePlayers[id].lives });
            }
        });

        const timeUpMsg = {
            eliminated,
            lostLifePlayers: lostLife
        };

        this.currentRoundOverMessage = timeUpMsg;
        this.broadcast('timeUp', timeUpMsg);
        this.startNextRound(eliminated.length + lostLife.length,
            lostLife.filter(p => p.livesRemaining === 1).length,
            eliminated.length);
    }

    // ---- Frequency (ACK) mode ------------------------------------------------------------------
    // No lives: every player keeps hunting until the round ends (all found, or time up). A valid tap
    // scores immediately by finishing order, so the side list's running total ticks up live.

    _frequencyTap(id) {
        const active = this.getAlivePlayers();
        const place = this.taps.length + 1;                 // 1 = first to find it this round
        this.taps.push({ id, time: Date.now() });
        const pts = this._pointsFor(place, this.currentRound, active.length);
        const p = this.activePlayers[id];
        p.score = (p.score || 0) + pts;
        p.roundScore = (p.roundScore || 0) + pts;
        p.place = place;
        // Broadcast so the side list LIGHTS this player up (found-the-target), like Redacted. The
        // SCORE stays frozen on the client — it shows round-start scores and ignores the live value —
        // so only the lit/dim state moves during the round; totals move on the round-end scoreboard.
        this.broadcastPlayerList();
        // Round ends the moment every ACTIVE player has found it (stale taps from players who left
        // mid-round don't count).
        const tappedActive = this.taps.filter(t => this.activePlayers[t.id] && this.activePlayers[t.id].alive).length;
        if (tappedActive >= active.length) this._endFrequencyRound();
    }

    // Points for finishing in `place` (1-based) out of `n` players this round; a miss scores 0
    // (simply never awarded). See _roundMultiplier for the per-round scaling.
    _pointsFor(place, round, n) {
        return Math.max(0, n - place + 1) * this._roundMultiplier(round);
    }

    // Per-round multiplier: points scale by the round NUMBER (round 1 = ×1 … round R = ×R), so late
    // rounds matter more and the final round is already the single biggest prize (×R). We tested an
    // EXTRA ×3 on the final (Monte Carlo, scratchpad/ack_final_mult.mjs): it flipped the pre-final
    // leader >50% of the time and lowered fairness — the last round counted too much — so it's OUT.
    // To bring it back: `return round === this.settings.rounds ? round * 3 : round;`.
    _roundMultiplier(round) {
        return round;
    }

    // End the current Frequency round (all found, or time up): freeze the tick loop, broadcast the
    // scoreboard beat (points gained + running totals), then advance once the client has shown it.
    _endFrequencyRound() {
        if (!this.roundActive) return;
        this.roundActive = false;
        this.timeUpHandled = true;
        const active = this.getAlivePlayers();
        const msg = {
            round: this.currentRound,
            totalRounds: this.settings.rounds,
            isFinal: this.currentRound >= this.settings.rounds,
            multiplier: this._roundMultiplier(this.currentRound),
            players: active.map(id => {
                const p = this.activePlayers[id];
                return { id, name: p.name, gained: p.roundScore || 0, total: p.score || 0,
                         place: p.place || null, found: !!p.place };
            })
        };
        this.currentRoundOverMessage = msg;
        this.broadcast('roundResult', msg);
        // Wait exactly as long as the client's cursor takes to type "+points" down every row — which
        // depends on each player's gain (how many digits), so derive it from the actual points.
        this.clock.setTimeout(() => this._advanceFrequency(), roundResultMs(msg.players.map(p => p.gained)));
    }

    // After the scoreboard beat: end the game if that was the last round, else reset per-round state
    // and count down the next round.
    _advanceFrequency() {
        if (this.gameOver) return;
        this.taps = [];
        this.timeUpHandled = false;
        if (this.currentRound >= this.settings.rounds) { this._endFrequencyGame(); return; }
        this.currentRound += 1;
        this.timeLeft = this._effRoundTime();   // shorter each round in Frequency
        Object.keys(this.activePlayers).forEach(id => {
            this.activePlayers[id].roundScore = 0;
            this.activePlayers[id].place = null;
        });
        this.broadcastPlayerList();
        this.startRoundCountdown();
    }

    // Game over after the final round — highest total score wins (tie → 'Tie', nobody scored → 'Nobody').
    _endFrequencyGame() {
        this.gameOver = true;
        const ranked = Object.keys(this.activePlayers)
            .map(id => [id, this.activePlayers[id].score || 0])
            .sort(([, a], [, b]) => b - a);
        const topScore = ranked[0] ? ranked[0][1] : 0;
        const topPlayers = ranked.filter(([, s]) => s === topScore);
        this.lastWinnerName =
            ranked.length === 0 ? 'Nobody'
            // A lone remaining player (everyone else left / was disqualified) wins even with 0 points.
            : ranked.length === 1 ? (this.activePlayers[ranked[0][0]]?.name || 'Nobody')
            : topScore === 0 ? 'Nobody'
            : topPlayers.length === 1 ? (this.activePlayers[topPlayers[0][0]]?.name || 'Nobody')
            : 'Tie';
        // The final scoreboard beat has already played, so clear this round's gains — the frozen side
        // list (score - roundScore) then shows the FULL final totals at game over.
        Object.keys(this.activePlayers).forEach(id => { this.activePlayers[id].roundScore = 0; });
        this.broadcastPlayerList();
        this.broadcast('gameOver', {
            winnerName: this.lastWinnerName,
            scores: Object.fromEntries(ranked.map(([id, s]) => [this.activePlayers[id]?.name || id, s])),
            isTie: topPlayers.length > 1
        });
        this.checkPlayAgainVotes();
        this.checkReturnToLobbyVotes();
    }

    // Per-round effective values — ramped in Frequency, the flat setting elsewhere. Delegated to the
    // shared sim (see gameSim.js) so multiplayer and solo compute difficulty identically.
    _effRoundTime() { return sim.effRoundTime(this.gameMode, this.settings, this.currentRound); }
    // --------------------------------------------------------------------------------------------

    // --- Simulation (delegated to the shared, networking-free gameSim.js) --------------------------
    // Build this round's field, then own the results: stash the target refs and clear last round's
    // position history (both live on this room, not the pure sim).
    generateChars() {
        const { chars, targetChar, targetObj } = sim.generateField({
            gameMode: this.gameMode, settings: this.settings,
            currentRound: this.currentRound, charRadii: this.charRadii,
        });
        this.targetChar = targetChar;
        this.targetObj = targetObj;
        for (const h of this.targetHistory) h.t = -1;   // clear last round's positions
        return chars;
    }
    _tapHitsTarget(data) { return sim.tapHitsTarget(this.targetObj, this.targetHistory, data); }
    charInit() { return sim.charInit(this.chars); }
    charPositions() { return sim.charPositions(this.chars); }
    updateChars(delta) { sim.updateChars(this.chars, delta); }

    startRoundCountdown() {
        if (this.gameOver) return;

        this.chars = this.generateChars();
        this.currentRoundOverMessage = null;
        this.inCountdown = true;
        this.countdownStartTime = Date.now();

        this.broadcast('roundCountdown', {
            targetChar: this.targetChar,
            round: this.currentRound,
            match: this.currentMatch,
            chars: this.charInit(),
            countdownMs: COUNTDOWN_MS,
            timeLeft: this.timeLeft   // full round time — the client shows it on the box timer during the countdown
        });

        this.clock.setTimeout(() => {
            if (this.gameOver) return;
            this.inCountdown = false;
            this.roundActive = true;
            this.lastTick = Date.now();
            this.broadcast('roundStart', {
                targetChar: this.targetChar,
                round: this.currentRound,
                match: this.currentMatch,
                chars: this.charInit(),
                timeLeft: this.timeLeft
            });
        }, COUNTDOWN_MS);
    }

    // lossCount = how many players lost a life this round; the next round waits for that
    // many client animations to finish before counting down. Morphing entries run longer:
    // toOneCount (dropped to exactly one life → "Lives → Life", +WORD_MS each) and elimCount
    // (dropped to zero → consume + "DELETED", +ELIM_MS each).
    startNextRound(lossCount = 1, toOneCount = 0, elimCount = 0) {
        this.timeUpHandled = false;
        this.roundActive = false;
        this.taps = [];
        const alivePlayers = this.getAlivePlayers();
        const animMs = LIFE_LOSS_INTRO_MS + Math.max(1, lossCount) * LIFE_LOSS_ENTRY_MS
            + toOneCount * LIFE_LOSS_WORD_MS + elimCount * LIFE_LOSS_ELIM_MS + ROUND_OVER_HOLD_MS;

        if (alivePlayers.length <= 1) {
            const matchWinnerId = alivePlayers[0] || null;
            if (matchWinnerId) {
                this.matchWins[matchWinnerId] = (this.matchWins[matchWinnerId] || 0) + 1;
            }
            // Let the final life-loss animation finish before showing the result.
            this.clock.setTimeout(() => {
                this.broadcast('matchOver', {
                    matchWinnerName: matchWinnerId ? this.activePlayers[matchWinnerId].name : 'Nobody',
                    matchWins: Object.fromEntries(
                        Object.entries(this.matchWins).map(([id, wins]) => [
                            this.activePlayers[id]?.name || id, wins
                        ])
                    ),
                    match: this.currentMatch,
                    totalMatches: this.settings.matches
                });

                if (this.currentMatch >= this.settings.matches) {
                    this.endGame();
                    return;
                }

                this.currentMatch += 1;
                this.currentRound = 1;
                this.timeLeft = this.settings.roundTime;
                Object.keys(this.activePlayers).forEach(id => {
                    this.activePlayers[id].alive = true;
                    this.activePlayers[id].lives = this.settings.lives;
                });
                this.broadcastPlayerList();
                this.clock.setTimeout(() => this.startRoundCountdown(), MATCH_OVER_DISPLAY_MS);
            }, animMs);
            return;
        }

        this.currentRound += 1;
        this.timeLeft = this.settings.roundTime;
        this.broadcastPlayerList();
        // Wait for the life-loss animation(s) to play, then count down the next round.
        this.clock.setTimeout(() => this.startRoundCountdown(), animMs);
    }

    endGame() {
        this.gameOver = true;

        const sortedPlayers = Object.entries(this.matchWins)
            .sort(([, a], [, b]) => b - a);

        const topWins = sortedPlayers[0]?.[1] || 0;
        const topPlayers = sortedPlayers.filter(([, wins]) => wins === topWins);

        this.lastWinnerName =
            sortedPlayers.length === 0 ? 'Nobody'
            // A lone remaining player (everyone else left / was disqualified) wins the match.
            : sortedPlayers.length === 1 ? (this.activePlayers[sortedPlayers[0][0]]?.name || 'Nobody')
            : topWins === 0 ? 'Nobody'
            : topPlayers.length === 1 ? (this.activePlayers[topPlayers[0][0]]?.name || 'Nobody')
            : 'Tie';

        this.broadcastPlayerList();

        this.broadcast('gameOver', {
            winnerName: this.lastWinnerName,
            matchWins: Object.fromEntries(
                Object.entries(this.matchWins).map(([id, wins]) => [
                    this.activePlayers[id]?.name || id, wins
                ])
            ),
            isTie: topPlayers.length > 1
        });

        this.checkPlayAgainVotes();
        this.checkReturnToLobbyVotes();
    }

    checkPlayAgainVotes() {
        const activePlayers = Object.keys(this.players).filter(id => this.players[id].connected);
        this.broadcast('playAgainVotes', {
            votes: this.playAgainVotes.size,
            total: activePlayers.length,
            voterIds: Array.from(this.playAgainVotes),
            canStart: activePlayers.length >= this.settings.minPlayers
        });
        if (this.playAgainVotes.size >= activePlayers.length && activePlayers.length >= this.settings.minPlayers) {
            this.playAgainVotes.clear();
            this.restartGame();
        }
    }

    checkReturnToLobbyVotes() {
        const activePlayers = Object.keys(this.players).filter(id => this.players[id].connected);
        this.broadcast('returnToLobbyVotes', {
            votes: this.returnToLobbyVotes.size,
            total: activePlayers.length,
            voterIds: Array.from(this.returnToLobbyVotes)
        });
        if (this.returnToLobbyVotes.size >= activePlayers.length && activePlayers.length > 0) {
            this.returnToLobbyVotes.clear();
            this.playAgainVotes.clear();
            this.returnToLobby();
        }
    }

    returnToLobby() {
        this.gameStarted = false;
        this.gameOver = false;
        this.currentMatch = 1;
        this.currentRound = 1;
        this.taps = [];
        this.matchWins = {};
        this.timeUpHandled = false;
        this.currentRoundOverMessage = null;

        Object.keys(this.players).forEach(id => {
            this.players[id].alive = true;
        });

        this.activePlayers = {};
        this.broadcast('returnedToLobby');
        this.broadcastPlayerList();
    }

    restartGame() {
        this.currentMatch = 1;
        this.currentRound = 1;
        this.taps = [];
        this.timeLeft = this.settings.roundTime;
        this.timeUpHandled = false;
        this.gameOver = false;
        this.roundActive = false;
        this.currentRoundOverMessage = null;
        this.matchWins = {};

        const isFreq = this.gameMode.id === 'frequency';
        const connected = this.getConnectedPlayers();
        this.activePlayers = {};
        connected.forEach(id => {
            this.activePlayers[id] = {
                ...this.players[id], tapped: false,
                lives: isFreq ? null : this.settings.lives,
                score: 0, roundScore: 0, place: null
            };
            this.matchWins[id] = 0;
        });

        this.lastTick = Date.now();

        this.broadcast('gameRestarted', {
            match: this.currentMatch,
            totalMatches: this.settings.matches,
            totalRounds: this.settings.rounds
        });
        this.broadcastPlayerList();
        this.startRoundCountdown();
    }

    onJoin(client, options) {
        this.players[client.sessionId] = {
            id: client.sessionId,
            name: options.playerName || 'Anonymous',
            alive: true,
            connected: true
        };
        this.sendPlayerState(client, false);   // fresh arrival — a live game types in for them
        if (this.gameOver) {
            this.checkPlayAgainVotes();
            this.checkReturnToLobbyVotes();
        }
    }

    // Out of the match entirely — gone from the player list, the score/winner ranking, and match wins.
    // Used both for an intentional leave (disqualified) and for a disconnect that never reconnected.
    // Doesn't broadcast; the caller decides when.
    _dropFromMatch(sid) {
        delete this.players[sid];
        delete this.activePlayers[sid];
        delete this.matchWins[sid];
        this.playAgainVotes.delete(sid);
        this.returnToLobbyVotes.delete(sid);
    }

    // A player exits the match mid-game — an intentional leave OR a disconnect whose reconnection window
    // expired. Re-evaluate the round/match exactly as if they were eliminated, THEN remove them:
    //   • Frequency: if everyone still in the round has now found the target, end the round (and the game
    //     if it was the final round).
    //   • DEL: if only one player is left, they win the match; otherwise if the exit leaves exactly one
    //     player yet to find the target, that player loses a life and the round ends.
    _removeFromMatchMidGame(sid) {
        if (this.gameStarted && !this.gameOver && this.activePlayers[sid]) {
            this.activePlayers[sid].alive = false;
            if (this.gameMode.id === 'frequency') {
                // No lives/elimination — they just drop out of the round. If they were the last one
                // still searching, the round can now end.
                this.broadcastPlayerList();
                const active = this.getAlivePlayers();
                if (this.roundActive && active.length >= 1) {
                    const tappedActive = this.taps.filter(t => this.activePlayers[t.id] && this.activePlayers[t.id].alive).length;
                    if (tappedActive >= active.length) this._endFrequencyRound();
                }
            } else {
                this.activePlayers[sid].lives = 0;
                this.broadcastPlayerList();

                const alivePlayers = this.getAlivePlayers();

                if (alivePlayers.length <= 1) {
                    this.taps = [];
                    this.inCountdown = false;
                    this.roundActive = false;
                    this.timeUpHandled = true;
                    this.startNextRound();
                } else if (this.roundActive) {
                    const tappedIds = this.taps.map(t => t.id);
                    const tappedAlive = tappedIds.filter(id =>
                        this.activePlayers[id] && this.activePlayers[id].alive
                    ).length;

                    if (tappedAlive >= alivePlayers.length - 1) {
                        const eliminatedId = alivePlayers.find(id => !tappedIds.includes(id));
                        if (eliminatedId) {
                            this.activePlayers[eliminatedId].lives -= 1;
                            if (this.activePlayers[eliminatedId].lives <= 0) {
                                this.activePlayers[eliminatedId].alive = false;
                            }
                            const msg = {
                                id: eliminatedId,
                                lostLifeName: this.activePlayers[eliminatedId].name,
                                eliminatedName: this.activePlayers[eliminatedId].name,
                                livesRemaining: this.activePlayers[eliminatedId].lives,
                                lostLife: this.activePlayers[eliminatedId].lives > 0
                            };
                            this.currentRoundOverMessage = msg;
                            this.broadcast('roundOver', msg);
                            this.startNextRound(1, msg.lostLife && msg.livesRemaining === 1 ? 1 : 0,
                                msg.lostLife ? 0 : 1);
                        }
                    }
                }
            }
        }

        this._dropFromMatch(sid);   // out of the match entirely
        this.broadcastPlayerList();
    }

    // Unexpected disconnect (connection dropped, NOT an intentional leave). Keep the player IN the match
    // — flagged disconnected so the client shows the disconnected icon and they still appear on the
    // player list / round-complete screen — and give them a window to reconnect. If it expires, onLeave
    // (below) fires and removes them.
    onDrop(client) {
        const sid = client.sessionId;
        // An intentional leaveToMenu already removed this player, then called client.leave() which
        // re-enters here — nothing to disconnect, no reconnection to allow.
        if (!this.players[sid]) return;
        this.playAgainVotes.delete(sid);
        this.returnToLobbyVotes.delete(sid);
        this.players[sid].connected = false;
        this.broadcastPlayerList();
        if (this.gameOver) {
            this.checkPlayAgainVotes();
            this.checkReturnToLobbyVotes();
        }
        this.allowReconnection(client, 60);
    }

    onReconnect(client) {
        const sid = client.sessionId;
        if (!this.players[sid]) return;
        this.players[sid].connected = true;
        this.sendPlayerState(client, true);    // session restored — load straight into the round, no type-in
        this.broadcastPlayerList();
        if (this.gameOver) {
            this.checkPlayAgainVotes();
            this.checkReturnToLobbyVotes();
        }
    }

    // Fires after an intentional leave (leaveToMenu already removed them — just re-check votes) OR after
    // a disconnected player's reconnection window expires (remove them from the match for good).
    onLeave(client, code) {
        const sid = client.sessionId;
        if (this.players[sid]) {
            // Disconnected and never reconnected → treat exactly like a mid-game leave: re-evaluate the
            // round/match (end it / dock a life as appropriate), then remove them.
            this._removeFromMatchMidGame(sid);
        } else {
            // Intentional leave — leaveToMenu already handled + removed them; just clear stale votes.
            this.playAgainVotes.delete(sid);
            this.returnToLobbyVotes.delete(sid);
            this.broadcastPlayerList();
        }
        if (this.gameOver) {
            this.checkPlayAgainVotes();
            this.checkReturnToLobbyVotes();
        }

        // Dispose the room once truly empty. autoDispose is off (so the room survives brief drops /
        // the reconnection window — disconnected players stay in `players` until their window expires),
        // so we clean up manually here. Without this, empty public rooms would linger forever and
        // QUICK JOIN could matchmake someone into a dead, playerless lobby.
        if (Object.keys(this.players).length === 0) this.disconnect();
    }
}

export { GameRoom };