import { Room } from '@colyseus/core';
import { GAME_MODES } from '../gameModes.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
const TICK_RATE = 50;
const LOBBY_TIMEOUT = 1000 * 60 * 10;

const DEFAULT_MODE = GAME_MODES.redacted;

class GameRoom extends Room {
    onCreate() {
        this.autoDispose = false;
        this.roomCode = this.generateRoomCode();
        this.gameMode = DEFAULT_MODE;
        this.settings = { ...DEFAULT_MODE.defaultSettings };
        this.selectedMode = null;
        this.selectedSettingsData = null;

        this.currentMatch = 1;
        this.currentRound = 1;
        this.matchWins = {};
        this.timeLeft = this.settings.roundTime;
        this.players = {};
        this.activePlayers = {};
        this.taps = [];
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

        this.onMessage('tap', (client) => {
            if (this.inCountdown) return;
            if (!this.roundActive) return;
            const player = this.activePlayers[client.sessionId];
            if (!player || !player.alive) return;
            if (this.taps.find(t => t.id === client.sessionId)) return;

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
                        eliminatedName: this.activePlayers[eliminatedId].name,
                        lostLife: false
                    };
                } else {
                    roundOverMsg = {
                        lostLifeName: this.activePlayers[eliminatedId].name,
                        livesRemaining: this.activePlayers[eliminatedId].lives,
                        lostLife: true
                    };
                }

                this.currentRoundOverMessage = roundOverMsg;
                this.broadcast('roundOver', roundOverMsg);
                this.startNextRound();
            }
        });

        this.onMessage('updateSettings', (client, data) => {
            if (client.sessionId !== Object.keys(this.players)[0]) return;
            this.selectedMode = data.mode;
            this.selectedSettingsData = data.settings;
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
                chars: this.chars,
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
                                lostLifeName: this.activePlayers[eliminatedId].name,
                                eliminatedName: this.activePlayers[eliminatedId].name,
                                lostLife: this.activePlayers[eliminatedId].lives > 0
                            };
                            this.currentRoundOverMessage = msg;
                            this.broadcast('roundOver', msg);
                            this.startNextRound();
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
            this.timeLeft -= delta;

            if (this.timeLeft <= 0 && !this.timeUpHandled) {
                this.timeLeft = 0;
                this.timeUpHandled = true;
                this.handleTimeUp();
            }

            this.broadcast('charUpdate', {
                chars: this.chars,
                timeLeft: this.timeLeft
            });
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
                settings: this.selectedSettingsData
            });
        }
        if (this.gameStarted) {
            client.send('reconnected', {
                chars: this.inCountdown ? [] : this.chars,
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
                    chars: this.chars,
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
                eliminated.push(this.activePlayers[id].name);
            } else {
                lostLife.push({ name: this.activePlayers[id].name, livesRemaining: this.activePlayers[id].lives });
            }
        });

        const timeUpMsg = {
            eliminatedNames: eliminated,
            lostLifePlayers: lostLife
        };

        this.currentRoundOverMessage = timeUpMsg;
        this.broadcast('timeUp', timeUpMsg);
        this.startNextRound();
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
        chars.splice(targetIndex, 0, this.createChar(this.targetChar, true));

        return chars;
    }

    createChar(char, isTarget) {
        return {
            char: char,
            isTarget: isTarget,
            x: (Math.random() - 0.5) * 1.8,
            y: (Math.random() - 0.5) * 1.8,
            speedX: (Math.random() - 0.5) * this.settings.speedScale,
            speedY: (Math.random() - 0.5) * this.settings.speedScale,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: Math.random() < 0.05 ? 0 : (Math.random() - 0.5) * 2
        };
    }

    updateChars(delta) {
        const r = 0.012;
        this.chars.forEach(c => {
            c.x += c.speedX * delta;
            c.y += c.speedY * delta;
            c.rotation += c.rotationSpeed * delta;

            if (c.x < -0.995 + r) { c.speedX = Math.abs(c.speedX); c.x = -0.995 + r; }
            if (c.x > 0.995 - r) { c.speedX = -Math.abs(c.speedX); c.x = 0.995 - r; }
            if (c.y < -0.98 + r) { c.speedY = Math.abs(c.speedY); c.y = -0.98 + r; }
            if (c.y > 0.98 - r) { c.speedY = -Math.abs(c.speedY); c.y = 0.98 - r; }
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
            chars: this.chars
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
                chars: this.chars,
                timeLeft: this.timeLeft
            });
        }, 4000);
    }

    startNextRound() {
        this.timeUpHandled = false;
        const alivePlayers = this.getAlivePlayers();

        if (alivePlayers.length <= 1) {
            const matchWinnerId = alivePlayers[0] || null;

            if (matchWinnerId) {
                this.matchWins[matchWinnerId] = (this.matchWins[matchWinnerId] || 0) + 1;
            }

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
            this.taps = [];
            this.timeLeft = this.settings.roundTime;
            this.roundActive = false;

            Object.keys(this.activePlayers).forEach(id => {
                this.activePlayers[id].alive = true;
                this.activePlayers[id].lives = this.settings.lives;
            });

            this.broadcastPlayerList();
            this.clock.setTimeout(() => {
                this.startRoundCountdown();
            }, 3000);
            return;
        }

        this.currentRound += 1;
        this.taps = [];
        this.timeLeft = this.settings.roundTime;
        this.roundActive = false;
        this.broadcastPlayerList();
        this.clock.setTimeout(() => {
            this.startRoundCountdown();
        }, 3000);
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