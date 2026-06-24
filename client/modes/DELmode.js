import { LifeLossCallout } from './LifeLossCallout.js';

export class DELMode {
    constructor(canvas, ctx, uiManager, room, callbacks) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.uiManager = uiManager;
        this.room = room;
        this.onGameOver = callbacks.onGameOver;

        this.targetChar = null;
        this.chars = [];
        this.prevChars = [];
        this.lastUpdateTime = null;
        this.currentRound = 1;
        this.currentMatch = 1;
        this.totalMatches = 1;
        this.eliminatedName = null;
        this.winnerId = null;
        this.playerList = [];
        this.showRoundOver = false;
        this.showMatchOver = false;
        this.matchOverData = null;
        this.timeLeft = 30;
        this.countdownActive = false;
        this.countdownStartTime = null;
        this.lastUpdateTime = null;

        // Life-loss callout: holds the player list at the old values during the
        // decrement animation, patching each player as the cursor retypes them.
        this.lifeCallout = new LifeLossCallout();
        this.pendingPlayerList = null;
        this.lifeCallout.onEntryDone = (e) => {
            const p = this.playerList && this.playerList.find(pl => pl.id === e.id);
            if (p) { p.lives = e.newLives; if (e.newLives <= 0) p.alive = false; }
        };
        this.lifeCallout.onComplete = () => {
            if (this.pendingPlayerList) { this.playerList = this.pendingPlayerList; this.pendingPlayerList = null; }
        };
    }

    onMessage(type, data) {
        switch (type) {
            case 'roundCountdown':
                this.targetChar = data.targetChar;
                this.chars = data.chars;
                this.prevChars = data.chars.map(c => ({ ...c }));
                this.currentRound = data.round;
                this.currentMatch = data.match;
                this.countdownActive = true;
                this.countdownStartTime = Date.now() - ((data.elapsedSeconds || 0) * 1000);
                // New round: end any life-loss callout and flush the held list.
                this.lifeCallout.clear();
                if (this.pendingPlayerList) { this.playerList = this.pendingPlayerList; this.pendingPlayerList = null; }
                this.showRoundOver = false;
                this.showMatchOver = false;
                this.eliminatedName = null;
                this.matchOverData = null;
                this.lastUpdateTime = Date.now();
                break;

            case 'roundStart':
                this.targetChar = data.targetChar;
                this.chars = data.chars;
                this.prevChars = data.chars.map(c => ({ ...c }));
                this.currentRound = data.round;
                this.currentMatch = data.match;
                this.timeLeft = data.timeLeft;
                this.countdownActive = false;
                this.lastUpdateTime = Date.now();
                break;

            case 'gameState':
                this.chars = data.chars;
                this.prevChars = data.chars.map(c => ({ ...c }));
                this.targetChar = data.targetChar;
                this.timeLeft = data.timeLeft;
                this.currentRound = data.round;
                this.currentMatch = data.match;
                this.lastUpdateTime = Date.now();
                break;

            case 'charUpdate':
                this.prevChars = this.chars.map(c => ({ ...c }));
                this.chars = data.chars;
                this.timeLeft = data.timeLeft;
                this.lastUpdateTime = Date.now();
                break;

            case 'playerList':
                // While the life-loss callout runs, hold the old list and apply
                // the new one only once the animation finishes (per-entry patches
                // happen via onEntryDone).
                if (this.lifeCallout.isActive()) this.pendingPlayerList = data.players;
                else this.playerList = data.players;
                break;

            case 'roundOver': {
                const entries = data.lostLife
                    ? [{ id: data.id, name: data.lostLifeName, oldLives: data.livesRemaining + 1, newLives: data.livesRemaining }]
                    : [{ id: data.id, name: data.eliminatedName, oldLives: 1, newLives: 0 }];
                this.lifeCallout.begin(entries, Date.now());
                this.showRoundOver = true;
                break;
            }

            case 'timeUp': {
                const entries = [];
                (data.lostLifePlayers || []).forEach(p =>
                    entries.push({ id: p.id, name: p.name, oldLives: p.livesRemaining + 1, newLives: p.livesRemaining }));
                (data.eliminated || []).forEach(p =>
                    entries.push({ id: p.id, name: p.name, oldLives: 1, newLives: 0 }));
                this.lifeCallout.begin(entries, Date.now());
                this.showRoundOver = true;
                break;
            }

            case 'matchOver':
                this.showMatchOver = true;
                this.matchOverData = data;
                this.showRoundOver = false;
                this.eliminatedName = null;
                break;

            case 'gameOver':
                this.winnerId = data.winnerName || 'Nobody';
                this.countdownActive = false;
                this.onGameOver(this.winnerId);
                break;

            case 'reconnected':
                if (!this.countdownActive) {
                    this.chars = data.chars;
                    this.prevChars = data.chars.map(c => ({ ...c }));
                    this.targetChar = data.targetChar;
                }
                this.timeLeft = data.timeLeft;
                this.currentRound = data.round;
                this.currentMatch = data.match;
                this.totalMatches = data.totalMatches;
                this.lastUpdateTime = Date.now();
                if (data.gameOver) {
                    this.winnerId = data.winnerName || 'Nobody';
                    this.onGameOver(this.winnerId);
                }
                break;
        }
    }

    draw(gameScreen) {
        this.lifeCallout.update(Date.now());
        gameScreen.draw({
            chars: this.chars,
            prevChars: this.prevChars,
            targetChar: this.targetChar,
            playerList: this.playerList,
            timeLeft: this.timeLeft,
            currentRound: this.currentRound,
            currentMatch: this.currentMatch,
            totalMatches: this.totalMatches,
            showRoundOver: this.showRoundOver,
            showMatchOver: this.showMatchOver,
            matchOverData: this.matchOverData,
            eliminatedName: this.eliminatedName,
            lifeCallout: this.lifeCallout,
            countdownActive: this.countdownActive,
            countdownStartTime: this.countdownStartTime,
            lastUpdateTime: this.lastUpdateTime,
            winnerId: this.winnerId
        });
    }

    hitTest(gameScreen, clickX, clickY) {
        return gameScreen.hitTest(clickX, clickY, this.chars, this.countdownActive);
    }

    reset() {
        this.chars = [];
        this.prevChars = [];
        this.targetChar = null;
        this.winnerId = null;
        this.eliminatedName = null;
        this.showRoundOver = false;
        this.showMatchOver = false;
        this.matchOverData = null;
        this.playerList = [];
        this.currentRound = 1;
        this.currentMatch = 1;
        this.totalMatches = 1;
        this.timeLeft = 30;
        this.countdownActive = false;
        this.countdownStartTime = null;
        this.lastUpdateTime = null;
    }
}