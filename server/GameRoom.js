import { Room } from '@colyseus/core';
import { GAME_MODES } from '../gameModes.js';
import { COUNTDOWN_MS, LIFE_LOSS_INTRO_MS, LIFE_LOSS_ENTRY_MS, LIFE_LOSS_WORD_MS, LIFE_LOSS_ELIM_MS } from '../timings.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
const TICK_RATE = 50;
const LOBBY_TIMEOUT = 1000 * 60 * 10;

const DEFAULT_MODE = GAME_MODES.redacted;

// Round-over pacing. The next round waits for the client's life-loss animation:
// one beat per player who lost a life (must match LifeLossCallout ENTRY_MS on the
// client), plus a short hold on the final value.
const ROUND_OVER_HOLD_MS = 1300; // cursor blinks on the last player for this long before advancing
const MATCH_OVER_DISPLAY_MS = 3000;

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

            if (this.gameStarted && !this.gameOver && this.activePlayers[client.sessionId]) {
                this.activePlayers[client.sessionId].alive = false;
                this.activePlayers[client.sessionId].lives = 0;
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

            delete this.players[client.sessionId];
            this.broadcastPlayerList();
            this.returnToLobbyVotes.delete(client.sessionId);
            this.playAgainVotes.delete(client.sessionId);
            client.leave(1000);
        });

        this.onMessage('startGame', (client, data) => {
            if (client.sessionId !== Object.keys(this.players)[0]) return;
            const connected = this.getConnectedPlayers();
            if (connected.length < this.settings.minPlayers) {
                client.send('startError', { message: `?INVALID PLAYER COUNT` });
                return;
            }

            this.settings = {
                ...this.gameMode.defaultSettings,
                lives: data.settings.lives || this.gameMode.defaultSettings.lives,
                roundTime: data.settings.roundTime || this.gameMode.defaultSettings.roundTime,
                speedScale: data.settings.speedScale || this.gameMode.defaultSettings.speedScale,
                charCount: data.settings.charCount || this.gameMode.defaultSettings.charCount,
                matches: data.settings.matches || this.gameMode.defaultSettings.matches,
                minPlayers: this.gameMode.defaultSettings.minPlayers
            };

            this.activePlayers = {};
            connected.forEach(id => {
                this.activePlayers[id] = { ...this.players[id], tapped: false, lives: this.settings.lives };
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
                lives: this.activePlayers[p.id] ? this.activePlayers[p.id].lives : null
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
                client.send('roundOver', this.currentRoundOverMessage);
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

    generateChars() {
        const chars = [];
        this.targetChar = LETTERS[Math.floor(Math.random() * LETTERS.length)];

        for (let i = 0; i < this.settings.charCount - 1; i++) {
            let char;
            do {
                char = LETTERS[Math.floor(Math.random() * LETTERS.length)];
            } while (char === this.targetChar);
            chars.push(this.createChar(char, false));
        }

        const targetIndex = Math.floor(Math.random() * this.settings.charCount);
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
        return {
            char: char,
            isTarget: isTarget,
            rx: rr.rx,
            ry: rr.ry,
            x: (Math.random() * 2 - 1) * (1 - rr.rx),
            y: (Math.random() * 2 - 1) * (1 - rr.ry),
            speedX: (Math.random() - 0.5) * this.settings.speedScale,
            speedY: (Math.random() - 0.5) * this.settings.speedScale,
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
            countdownMs: COUNTDOWN_MS
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

        this.lastWinnerName = topWins === 0
            ? 'Nobody'
            : topPlayers.length === 1
                ? this.activePlayers[topPlayers[0][0]]?.name || 'Nobody'
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

        const connected = this.getConnectedPlayers();
        this.activePlayers = {};
        connected.forEach(id => {
            this.activePlayers[id] = { ...this.players[id], tapped: false, lives: this.settings.lives };
            this.matchWins[id] = 0;
        });

        this.lastTick = Date.now();

        this.broadcast('gameRestarted', {
            match: this.currentMatch,
            totalMatches: this.settings.matches
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

    onDrop(client) {
        this.playAgainVotes.delete(client.sessionId);
        this.returnToLobbyVotes.delete(client.sessionId);
        this.players[client.sessionId].connected = false;
        this.broadcastPlayerList();
        if (this.gameOver) {
            this.checkPlayAgainVotes();
            this.checkReturnToLobbyVotes();
        }
        this.allowReconnection(client, 60);
    }

    onReconnect(client) {
        this.players[client.sessionId].connected = true;
        this.sendPlayerState(client);
        if (this.gameOver) {
            this.checkPlayAgainVotes();
            this.checkReturnToLobbyVotes();
        }
    }

    onLeave(client, code) {
        this.playAgainVotes.delete(client.sessionId);
        this.returnToLobbyVotes.delete(client.sessionId);
        if (this.gameOver) {
            this.checkPlayAgainVotes();
            this.checkReturnToLobbyVotes();
        }
        delete this.players[client.sessionId];
        this.broadcastPlayerList();
    }
}

export { GameRoom };