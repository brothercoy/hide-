const { Room } = require('colyseus');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
const TOTAL_CHARS = 80;
const TICK_RATE = 50;
const SPEED_SCALE = 0.2;

class GameRoom extends Room {
    onCreate() {
        console.log('Room created');

        this.roomCode = this.generateRoomCode();
        this.timeLeft = 30;
        this.round = 1;
        this.players = {};
        this.taps = [];
        this.chars = this.generateChars();
        this.lastTick = Date.now();
        this.timeUpHandled = false;
        this.gameOver = false;
        this.gameStarted = false;

        this.onMessage('tap', (client, message) => {
            if (!this.players[client.sessionId].alive) return;
            if (this.taps.find(t => t.id === client.sessionId)) return;
        
            this.taps.push({
                id: client.sessionId,
                time: Date.now()
            });

            const totalPlayers = Object.keys(this.players).filter(id => this.players[id].alive).length;

            this.broadcast('playerTapped', {
                id: client.sessionId,
                tapNumber: this.taps.length
            });

            if (totalPlayers >= 2 && this.taps.length === totalPlayers - 1) {
                const tappedIds = this.taps.map(t => t.id);
                const eliminatedId = Object.keys(this.players).find(id => this.players[id].alive && !tappedIds.includes(id));

                this.broadcast('roundOver', {
                    eliminatedId: eliminatedId,
                    taps: this.taps
                });

                this.players[eliminatedId].alive = false;
                this.startNextRound();
            }
        });

        this.onMessage('clientReady', (client) => {
            client.send('gameState', {
                chars: this.chars,
                targetChar: this.targetChar,
                timeLeft: this.timeLeft,
                round: this.round
            });
        });

        this.onMessage('startGame', (client) => {
            if (client.sessionId !== Object.keys(this.players)[0]) return;
            this.gameStarted = true;
            this.lastTick = Date.now();
            this.broadcast('gameStarted');
        });

        this.setSimulationInterval(() => {
            if (!this.gameStarted) return;
            if (this.gameOver) return;

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
        const alivePlayers = Object.keys(this.players).filter(id => this.players[id].alive);
        const untappedPlayers = alivePlayers.filter(id => !tappedIds.includes(id));
        
        if (untappedPlayers.length === 0) {
            this.startNextRound();
            return;
        }

        untappedPlayers.forEach(id => {
            this.players[id].alive = false;
        });

        this.broadcast('timeUp', {
            eliminatedIds: untappedPlayers,
            round: this.round
        });

        this.startNextRound();
    }

    generateChars() {
        const chars = [];
        this.targetChar = LETTERS[Math.floor(Math.random() * LETTERS.length)];

        for (let i = 0; i < TOTAL_CHARS - 1; i++) {
            let char;
            do {
                char = LETTERS[Math.floor(Math.random() * LETTERS.length)];
            } while (char === this.targetChar);
            chars.push(this.createChar(char, false));
        }

        const targetIndex = Math.floor(Math.random() * TOTAL_CHARS);
        chars.splice(targetIndex, 0, this.createChar(this.targetChar, true));

        return chars;
    }

    createChar(char, isTarget) {
        return {
            char: char,
            isTarget: isTarget,
            x: (Math.random() - 0.5) * 1.8,
            y: (Math.random() - 0.5) * 1.8,
            speedX: (Math.random() - 0.5) * SPEED_SCALE,
            speedY: (Math.random() - 0.5) * SPEED_SCALE,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: Math.random() < 0.05 ? 0 : (Math.random() - 0.5) * 2
        };
    }

    updateChars(delta) {
        this.chars.forEach(c => {
            c.x += c.speedX * delta;
            c.y += c.speedY * delta;
            c.rotation += c.rotationSpeed * delta;

            const r = 0.012;
            if (c.x < -0.995 + r) { c.speedX = Math.abs(c.speedX); c.x = -0.995 + r; }
            if (c.x > 0.995 - r) { c.speedX = -Math.abs(c.speedX); c.x = 0.995 - r; }
            if (c.y < -0.98 + r) { c.speedY = Math.abs(c.speedY); c.y = -0.98 + r; }
            if (c.y > 0.98 - r) { c.speedY = -Math.abs(c.speedY); c.y = 0.98 - r; }
        });
    }

    startNextRound() {
        const alivePlayers = Object.keys(this.players).filter(id => this.players[id].alive);

        this.timeUpHandled = false;
        
        if (alivePlayers.length <= 1) {
            this.gameOver = true;
            const winner = alivePlayers[0] ? this.players[alivePlayers[0]] : null;
            this.broadcast('gameOver', { 
                winnerId: alivePlayers[0] || null,
                winnerName: winner ? winner.name : 'Nobody'
            });
            return;
        }

        this.round += 1;
        this.taps = [];
        this.timeLeft = 30;
        this.chars = this.generateChars();

        this.broadcast('newRound', {
            round: this.round,
            targetChar: this.targetChar,
            chars: this.chars
        });
    }

    onJoin(client, options) {
        console.log(client.sessionId, 'joined as', options.playerName);
        this.players[client.sessionId] = {
            id: client.sessionId,
            name: options.playerName || 'Anonymous',
            alive: true
        };
        client.send('roomCode', { code: this.roomCode });
        client.send('existingPlayers', { players: Object.values(this.players) });
        this.broadcast('playerJoined', {
            id: client.sessionId,
            name: options.playerName || 'Anonymous'
        });
    }

    onLeave(client) {
        console.log(client.sessionId, 'left');
        delete this.players[client.sessionId];
        this.broadcast('playerLeft', { id: client.sessionId });
    }
}

module.exports = GameRoom;