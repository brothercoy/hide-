import { Room } from '@colyseus/core';
import { GAME_MODES } from '../gameModes.js';
import { COUNTDOWN_MS, LIFE_LOSS_INTRO_MS, LIFE_LOSS_ENTRY_MS, LIFE_LOSS_WORD_MS, LIFE_LOSS_ELIM_MS, MATCH_OVER_MS, roundResultMs } from '../timings.js';
import { confusionDecoys, pickConfusionTarget, TEST_PAIRS_IN_ORDER, nextTestPair } from '../confusables.js';

// The full visible printable-ASCII set (33 '!' … 126 '~') — every glyph a target/field char can
// be. Shared by ALL game modes (generateChars draws from here). Which confusable glyphs may not
// co-exist in one game (rotation look-alikes) is layered on top separately.
const LETTERS = Array.from({ length: 126 - 33 + 1 }, (_, i) => String.fromCharCode(33 + i)).join('');

// Glyphs that look like each other when a character rotates/flips. Enforced TARGET-FIRST and
// PER-ROUND: the target can be any glyph, but if it belongs to a group, that group's OTHER members
// are kept out of THAT round's field (so a look-alike can't be mistaken for the target). It's never
// the reverse — every glyph is still free to be the target on any round, so nothing is banished for
// the whole game (e.g. 6 as target one round doesn't stop 9 from being the target later).
// Populate from the confusable-glyph list; list a 3+-way look-alike as one group. (Empty = no rule.)
const CONFLICT_GROUPS = [
    ["'", ','],   // apostrophe / comma
    ['n', 'u'],
    ['[', ']'],
    ['<', '>'],
    ['(', ')'],
    ['{', '}'],
    ['-', '_'],
];
// glyph -> glyphs it must not share a round with (derived once from the groups above)
const CONFLICTS = {};
for (const group of CONFLICT_GROUPS) for (const c of group) CONFLICTS[c] = group.filter(x => x !== c);
const TICK_RATE = 50;
const LOBBY_TIMEOUT = 1000 * 60 * 10;

// ACK (Frequency) difficulty ramp. Round 1 uses the player's SETTING as-is; the ramp climbs linearly
// to a harder END reached at the MAX round count (the rounds slider max, 20). For charCount/speed the
// END adds the FULL slider RANGE to the setting — so the easy-end DEFAULT (setting = slider min)
// reaches the slider MAX at round 20, and a higher starting setting scales PAST the max, clamped to a
// reasonable ceiling. roundTime shrinks toward a fraction of the setting, floored. So the scaling is
// dynamic and setting-driven, never a fixed target. Defaults (chars 30, speed 0.1/Slow, time 30s) give
// 30→150 chars, slow→fast, 30s→10s over 20 rounds — so a default 10-round game lands on the midpoint.
const ACK_RAMP = {
    charCount:  { kind: 'plusRange', cap: 200 },              // → slider max (150) at 20 rounds; up to 200
    speedScale: { kind: 'plusRange', cap: 0.6 },              // → slider max (0.4/Fast) at 20 rounds; up to 0.6
    roundTime:  { kind: 'shrink', mult: 1 / 3, floor: 5 },    // 30s → 10s at 20 rounds; floor 5s
};
// Spawn confusion: fraction of the field filled with the target's look-alikes (vs random noise). Ramps
// 0 (round 1) → this at the final round. 1.0 means the final round is PURE camouflage — the field is
// nothing but the target's nearest twins (the "two options"), no random noise.
const CONFUSION_MAX = 1.0;

const DEFAULT_MODE = GAME_MODES.redacted;

// Round-over pacing. The next round waits for the client's life-loss animation:
// one beat per player who lost a life (must match LifeLossCallout ENTRY_MS on the
// client), plus a short hold on the final value.
const ROUND_OVER_HOLD_MS = 1300; // cursor blinks on the last player for this long before advancing
// The post-match hold is DERIVED from the client's match-over animation phases (timings.js), so it
// always lasts exactly as long as the animation — no separate display time to keep in sync.
const MATCH_OVER_DISPLAY_MS = MATCH_OVER_MS;

// Server-side tap validation (anti-cheat): the server — not the client — decides whether a tap
// actually hit the target. Because the client renders the field slightly in the past (the
// interpolation delay + its ping), we keep a short history of the TARGET's position and accept
// a tap if it lands within the target's radius anywhere in that window. This stops the trivial
// exploit of sending `tap` with no/false coordinates to auto-win.
const TARGET_HISTORY = 8;    // ticks kept (~400ms at 50ms) — covers the render delay + ping
const TAP_TOLERANCE = 0.1;   // normalized padding added to the glyph's own radius (forgiving)

class GameRoom extends Room {
    onCreate() {
        this.autoDispose = false;
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
        this.targetHistory = Array.from({ length: TARGET_HISTORY }, () => ({ x: 0, y: 0, t: -1 }));
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
                totalMatches: this.settings.matches,
                totalRounds: this.settings.rounds,   // Frequency: total rounds for the "Round X/N" label
                mode: this.selectedMode || 'redacted'
            });
            this.broadcastPlayerList();
            this.startRoundCountdown();
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
                this.targetHistIdx = (this.targetHistIdx + 1) % TARGET_HISTORY;
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

    sendPlayerState(client) {
        client.send('roomCode', { code: this.roomCode });
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

    // The effective value of a ramped setting for `round` (1-based) in Frequency. The ramp climbs
    // linearly from the SETTING (round 1) to the slider max, reached at the MAX round count (the rounds
    // slider max, 20). So FEWER rounds end the climb early — a genuinely easier game; e.g. a default
    // 10-round game stops at the midpoint — and only a full 20-round game reaches the top. A given
    // round is the same difficulty regardless of the chosen round count. charCount/roundTime rounded.
    _ackRoundValue(param, round) {
        const start = this.settings[param];
        const cfg = ACK_RAMP[param];
        const ref = this.gameMode.settingsOptions.rounds.max;   // full ramp spans the MAX round count (20)
        const p = ref > 1 ? (round - 1) / (ref - 1) : 0;
        let v;
        if (cfg.kind === 'plusRange') {
            const opt = this.gameMode.settingsOptions[param];
            const range = opt.options ? (opt.options[opt.options.length - 1] - opt.options[0]) : (opt.max - opt.min);
            v = Math.min(cfg.cap, start + range * p);      // hits the slider max at round `ref`, then climbs to the cap
        } else {   // 'shrink' — toward a fraction of the setting, floored
            v = Math.max(cfg.floor, start + (start * cfg.mult - start) * p);
        }
        return param === 'speedScale' ? v : Math.round(v);
    }
    // Per-round effective values — ramped in Frequency, the flat setting in every other mode.
    _effCharCount() {
        return this.gameMode.id === 'frequency' ? this._ackRoundValue('charCount', this.currentRound) : this.settings.charCount;
    }
    _effSpeed() {
        return this.gameMode.id === 'frequency' ? this._ackRoundValue('speedScale', this.currentRound) : this.settings.speedScale;
    }
    _effRoundTime() {
        return this.gameMode.id === 'frequency' ? this._ackRoundValue('roundTime', this.currentRound) : this.settings.roundTime;
    }
    // Fraction of the field to fill with the target's look-alikes this round (0 outside Frequency and on
    // round 1, ramping to CONFUSION_MAX at the FINAL round). UNLIKE the other axes, confusion scales to
    // the CHOSEN round count — so every game, long or short, ends on a pure two-option field.
    _effConfusion() {
        if (this.gameMode.id !== 'frequency') return 0;
        const ref = this.settings.rounds;
        // A 1-round game IS its own final round — treat it as p=1 (full confusion), not p=0, so the
        // single round still delivers the two-option climax instead of the easy round-1 noise field.
        const p = ref > 1 ? Math.min(1, (this.currentRound - 1) / (ref - 1)) : 1;
        return p * CONFUSION_MAX;
    }
    // --------------------------------------------------------------------------------------------

    generateChars() {
        const chars = [];
        // TEST: on a Frequency FINAL round with TEST_PAIRS_IN_ORDER on, walk the tier-2 pairs in order
        // instead of picking randomly (target = pair[0], field = copies of pair[1]) so every pair can be
        // reviewed once, in order, by playing 1-round games back to back. See confusables.js.
        const testWalk = (TEST_PAIRS_IN_ORDER && this.gameMode.id === 'frequency'
            && this.currentRound >= this.settings.rounds) ? nextTestPair() : null;
        // Frequency's target: early rounds from ALL glyphs, but a rising chance (→100% by the final
        // round) to instead draw a glyph grouped at the current confusion tier — so the last round always
        // lands on one with a pair twin. Other modes use the full set uniformly.
        this.targetChar = testWalk
            ? testWalk.pair[0]
            : (this.gameMode.id === 'frequency'
                ? pickConfusionTarget(this.currentRound, this.settings.rounds, LETTERS)
                : LETTERS[Math.floor(Math.random() * LETTERS.length)]);
        const charCount = this._effCharCount();   // ramps up per round in Frequency; flat setting otherwise

        // This round's field pool: every glyph EXCEPT the target and its rotation look-alikes.
        // Pre-filtered once (no per-character re-roll loop).
        const forbidden = new Set(CONFLICTS[this.targetChar] || []);
        forbidden.add(this.targetChar);
        const pool = [...LETTERS].filter(c => !forbidden.has(c));
        // The target's visual near-twins for THIS round: the confusion tier narrows with difficulty
        // (broad family → subgroup → nearest pair), minus the rotation-conflicts already barred above.
        // `confusion` of the field is filled with them to camouflage the target; the rest is random
        // noise. Both scale to the CHOSEN round count, so the final round is always the nearest pair at
        // 100% (0 on round 1 / in Redacted — confusionDecoys narrows against the same round count).
        const totalRounds = this.gameMode.id === 'frequency' ? this.settings.rounds : 0;
        // TEST walk: force this pair's partner as the sole decoy at full confusion, bypassing the
        // conflict filter so even normally-barred pairs (6/9, M/W…) render as a clean two-option field.
        const twins = testWalk
            ? [testWalk.pair[1]]
            : confusionDecoys(this.targetChar, this.currentRound, totalRounds).filter(c => !forbidden.has(c));
        const confusion = testWalk ? 1 : (twins.length ? this._effConfusion() : 0);
        if (testWalk) {
            const barred = (CONFLICTS[testWalk.pair[0]] || []).includes(testWalk.pair[1]);
            console.log(`[ACK TEST] pair ${testWalk.idx + 1}/${testWalk.total}${testWalk.reversed ? ' (reverse)' : ' (forward)'}: '${testWalk.pair[0]}' hidden among '${testWalk.pair[1]}'${barred ? '  (conflict-filtered in real play)' : ''}`);
        }

        for (let i = 0; i < charCount - 1; i++) {
            const char = (confusion && Math.random() < confusion)
                ? twins[Math.floor(Math.random() * twins.length)]         // a near-twin (camouflage)
                : pool[Math.floor(Math.random() * pool.length)];          // random noise
            chars.push(this.createChar(char, false));
        }

        const targetIndex = Math.floor(Math.random() * charCount);
        const target = this.createChar(this.targetChar, true);
        chars.splice(targetIndex, 0, target);

        this.targetObj = target;                       // reference for server-side tap validation
        for (const h of this.targetHistory) h.t = -1;  // clear last round's positions

        return chars;
    }

    // True if the tap (normalized coords from the client) lands on the target at any point in
    // its recent history — server-authoritative, so a client can't just claim a hit. The
    // history window absorbs the client's render delay + ping without needing to know either.
    _tapHitsTarget(data) {
        const tgt = this.targetObj;
        if (!tgt || !data || typeof data.nx !== 'number' || typeof data.ny !== 'number') return false;
        const rad = Math.max(tgt.rx, tgt.ry) + TAP_TOLERANCE;
        const r2 = rad * rad;
        let dx = data.nx - tgt.x, dy = data.ny - tgt.y;   // newest (live) position
        if (dx * dx + dy * dy <= r2) return true;
        for (const h of this.targetHistory) {             // ...and the recorded past window
            if (h.t < 0) continue;
            dx = data.nx - h.x; dy = data.ny - h.y;
            if (dx * dx + dy * dy <= r2) return true;
        }
        return false;
    }

    createChar(char, isTarget) {
        // Per-char collision radius (normalized), stored on the char so the bounce
        // reads it directly — no recompute. Falls back to a small default until a
        // client's radii table arrives. Spawn anywhere the whole glyph fits inside
        // the field (so it never starts overlapping the frame).
        const rr = this.charRadii[char] || { rx: 0.03, ry: 0.05 };
        const speed = this._effSpeed();   // ramps up per round in Frequency; flat setting otherwise
        return {
            char: char,
            isTarget: isTarget,
            rx: rr.rx,
            ry: rr.ry,
            x: (Math.random() * 2 - 1) * (1 - rr.rx),
            y: (Math.random() * 2 - 1) * (1 - rr.ry),
            speedX: (Math.random() - 0.5) * speed,
            speedY: (Math.random() - 0.5) * speed,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: Math.random() < 0.05 ? 0 : (Math.random() - 0.5) * 2
        };
    }

    // Only char + isTarget are static per round; positions move every tick. Round-start
    // messages carry these (with the initial positions) via charInit(); the per-tick
    // charUpdate carries only the moving numbers via charPositions().
    charInit() {
        return this.chars.map(c => ({ char: c.char, isTarget: c.isTarget, x: c.x, y: c.y, rotation: c.rotation }));
    }
    // Flat [x, y, rotation, ...] — ~70% smaller than the full objects, and ONE array to
    // (de)serialize each tick instead of ~150 objects (much less GC on both ends).
    charPositions() {
        const n = this.chars.length;
        const p = new Array(n * 3);
        for (let i = 0; i < n; i++) {
            const c = this.chars[i];
            p[i * 3] = c.x; p[i * 3 + 1] = c.y; p[i * 3 + 2] = c.rotation;
        }
        return p;
    }

    updateChars(delta) {
        this.chars.forEach(c => {
            c.x += c.speedX * delta;
            c.y += c.speedY * delta;
            c.rotation += c.rotationSpeed * delta;

            // Bounce the char's EDGE off the field walls (±1 maps to the frame's inner
            // edge on the client), using its own stored radius so each glyph hits the
            // brackets/equals exactly.
            const rx = c.rx, ry = c.ry;
            if (c.x < -1 + rx) { c.speedX = Math.abs(c.speedX);  c.x = -1 + rx; }
            if (c.x >  1 - rx) { c.speedX = -Math.abs(c.speedX); c.x =  1 - rx; }
            if (c.y < -1 + ry) { c.speedY = Math.abs(c.speedY);  c.y = -1 + ry; }
            if (c.y >  1 - ry) { c.speedY = -Math.abs(c.speedY); c.y =  1 - ry; }
        });
    }

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
        this.sendPlayerState(client);
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
        this.sendPlayerState(client);
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
    }
}

export { GameRoom };