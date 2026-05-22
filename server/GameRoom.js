import { Room } from '@colyseus/core';
import { GAME_MODES } from '../gameModes.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
const TICK_RATE = 50;
const LOBBY_TIMEOUT = 1000 * 60 * 10;

const DEFAULT_MODE = GAME_MODES.redacted;

class GameRoom extends Room {
    onCreate() {
        console.log('Room created');

        this.autoDispose = false;
        this.roomCode = this.generateRoomCode();
        this.gameMode = DEFAULT_MODE;
        this.settings = { ...DEFAULT_MODE.defaultSettings };

        // match/round tracking
        this.currentMatch = 1;
        this.currentRound = 1;
        this.matchWins = {};       // { playerId: winCount }

        this.timeLeft = this.settings.roundTime;
        this.players = {};
        this.activePlayers = {};
        this.taps = [];
        this.chars = this.generateChars();
        this.lastTick = Date.now();
        this.timeUpHandled = false;
        this.gameOver = false;
        this.gameStarted = false;

        this.clock.setTimeout(() => {
            if (!this.gameStarted) this.disconnect();
        }, LOBBY_TIMEOUT);

        this.onMessage('tap', (client) => {
            const player = this.activePlayers[client.sessionId];
            if (!player || !player.alive) return;
            if (this.taps.find(t => t.id === client.sessionId)) return;

            this.taps.push({ id: client.sessionId, time: Date.now() });
            this.broadcastPlayerList();

            const totalAlive = this.getAlivePlayers().length;
            if (totalAlive >= this.settings.minPlayers && this.taps.length === totalAlive - 1) {
                const tappedIds = this.taps.map(t => t.id);
                const eliminatedId = this.getAlivePlayers().find(id => !tappedIds.includes(id));
                this.activePlayers[eliminatedId].alive = false;
                this.broadcast('roundOver', {
                    eliminatedName: this.activePlayers[eliminatedId].name
                });
                this.startNextRound();
            }
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
            
            // if this was the host, assign new host
            const playerIds = Object.keys(this.players);
            if (playerIds[0] === client.sessionId && playerIds.length > 1) {
                this.broadcast('newHost', { id: playerIds[1] });
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
                client.send('startError', { message: `Need at least ${this.settings.minPlayers} players to start.` });
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
                this.activePlayers[id] = { ...this.players[id], tapped: false };
                this.matchWins[id] = 0;
            });

            this.currentMatch = 1;
            this.currentRound = 1;
            this.timeLeft = this.settings.roundTime;
            this.chars = this.generateChars();
            this.gameStarted = true;
            this.lastTick = Date.now();

            this.broadcast('gameStarted', {
                chars: this.chars,
                targetChar: this.targetChar,
                timeLeft: this.timeLeft,
                round: this.currentRound,
                match: this.currentMatch,
                totalMatches: this.settings.matches
            });
            this.broadcastPlayerList();
        });

        this.setSimulationInterval(() => {
            if (!this.gameStarted || this.gameOver) return;

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
        this.broadcast('playerList', {
            players: Object.values(this.players).map(p => ({
                id: p.id,
                name: p.name,
                connected: p.connected,
                alive: this.activePlayers[p.id] ? this.activePlayers[p.id].alive : true,
                tapped: tappedIds.includes(p.id),
                matchWins: this.matchWins[p.id] || 0
            }))
        });
    }

    sendPlayerState(client) {
        client.send('roomCode', { code: this.roomCode });
        this.broadcastPlayerList();
        if (this.gameStarted) {
            client.send('reconnected', {
                chars: this.chars,
                targetChar: this.targetChar,
                timeLeft: this.timeLeft,
                round: this.currentRound,
                match: this.currentMatch,
                totalMatches: this.settings.matches,
                gameStarted: true,
                gameOver: this.gameOver,
                winnerName: this.gameOver ? this.lastWinnerName : null
            });
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

        untapped.forEach(id => {
            this.activePlayers[id].alive = false;
        });

        this.broadcast('timeUp', {
            eliminatedNames: untapped.map(id => this.activePlayers[id].name)
        });

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

    startNextRound() {
        this.timeUpHandled = false;
        const alivePlayers = this.getAlivePlayers();

        // match is over when 1 or 0 players remain
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

            // check if all matches are done
            if (this.currentMatch >= this.settings.matches) {
                this.endGame();
                return;
            }

            // start next match
            this.currentMatch += 1;
            this.currentRound = 1;
            this.taps = [];
            this.timeLeft = this.settings.roundTime;

            // reset all active players to alive for new match
            Object.keys(this.activePlayers).forEach(id => {
                this.activePlayers[id].alive = true;
            });

            this.chars = this.generateChars();

            this.broadcast('newMatch', {
                match: this.currentMatch,
                totalMatches: this.settings.matches,
                round: this.currentRound,
                targetChar: this.targetChar,
                chars: this.chars,
                matchWins: Object.fromEntries(
                    Object.entries(this.matchWins).map(([id, wins]) => [
                        this.activePlayers[id]?.name || id, wins
                    ])
                )
            });

            this.broadcastPlayerList();
            return;
        }

        // continue current match with next round
        this.currentRound += 1;
        this.taps = [];
        this.timeLeft = this.settings.roundTime;
        this.chars = this.generateChars();

        this.broadcast('newRound', {
            round: this.currentRound,
            match: this.currentMatch,
            targetChar: this.targetChar,
            chars: this.chars
        });

        this.broadcastPlayerList();
    }

    endGame() {
        this.gameOver = true;

        const sortedPlayers = Object.entries(this.matchWins)
            .sort(([, a], [, b]) => b - a);

        const topWins = sortedPlayers[0]?.[1] || 0;
        const topPlayers = sortedPlayers.filter(([, wins]) => wins === topWins);

        this.lastWinnerName = topPlayers.length === 1
            ? this.activePlayers[topPlayers[0][0]]?.name || 'Nobody'
            : 'Tie';

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
        this.matchWins = {};

        const connected = this.getConnectedPlayers();
        this.activePlayers = {};
        connected.forEach(id => {
            this.activePlayers[id] = { ...this.players[id], tapped: false };
            this.matchWins[id] = 0;
        });

        this.chars = this.generateChars();
        this.lastTick = Date.now();

        this.broadcast('gameRestarted', {
            chars: this.chars,
            targetChar: this.targetChar,
            timeLeft: this.timeLeft,
            round: this.currentRound,
            match: this.currentMatch,
            totalMatches: this.settings.matches
        });
        this.broadcastPlayerList();
    }

    onJoin(client, options) {
        console.log(client.sessionId, 'joined as', options.playerName);
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
        console.log(client.sessionId, 'dropped');
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
        console.log(client.sessionId, 'reconnected');
        this.players[client.sessionId].connected = true;
        this.sendPlayerState(client);
        if (this.gameOver) {
            this.checkPlayAgainVotes();
            this.checkReturnToLobbyVotes();
        }
    }

    onLeave(client, code) {
        console.log(client.sessionId, 'left. code:', code);
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