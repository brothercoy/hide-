import { LifeLossCallout } from './LifeLossCallout.js';

// Render characters INTERP_DELAY_MS behind the latest server snapshot, interpolating between
// the two buffered snapshots that straddle that time. This ~2-tick buffer absorbs the JITTER
// in charUpdate arrival (Node's 50ms tick + network are never perfectly even) that otherwise
// made the letters freeze-then-jump: the old code interpolated toward the LATEST snapshot over
// a fixed 50ms and stalled whenever an update landed early or late.
const INTERP_DELAY_MS = 100;

// Flat [x, y, rotation, ...] from a round-start char list (mirrors the server's charPositions).
function posFromChars(chars) {
    const p = new Array(chars.length * 3);
    for (let i = 0; i < chars.length; i++) { const c = chars[i]; p[i * 3] = c.x; p[i * 3 + 1] = c.y; p[i * 3 + 2] = c.rotation; }
    return p;
}

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
        this.snapshots = [];       // [{ chars, time }] — recent server snapshots for interpolation
        this._lastInterp = null;   // last {a,b,t} computed in draw(), reused by hitTest so taps match the render
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
        this.countdownMs = 6500;       // total countdown length, sent by the server in roundCountdown
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

    // Snapshots hold the flat [x, y, rotation, ...] position array from each charUpdate. The
    // static char/isTarget list lives in this.chars (set at round start). a/b are those flat
    // arrays; the render reads positions by index and the glyph from this.chars[i].
    _pushSnapshot(pos) {
        this.snapshots.push({ pos, time: performance.now() });
        if (this.snapshots.length > 6) this.snapshots.shift();  // small ring buffer
    }
    _resetSnapshots(chars) {
        this.snapshots = [{ pos: posFromChars(chars), time: performance.now() }];  // seed from round-start positions
    }
    // The two snapshots straddling (now - INTERP_DELAY_MS) and the blend factor between them.
    _interp() {
        const buf = this.snapshots;
        if (buf.length === 0) return { a: [], b: [], t: 0 };
        if (buf.length === 1) return { a: buf[0].pos, b: buf[0].pos, t: 0 };
        const rt = performance.now() - INTERP_DELAY_MS;
        if (rt <= buf[0].time) return { a: buf[0].pos, b: buf[0].pos, t: 0 };
        const last = buf[buf.length - 1];
        if (rt >= last.time) return { a: buf[buf.length - 2].pos, b: last.pos, t: 1 }; // buffer ran dry — hold newest
        for (let i = 0; i < buf.length - 1; i++) {
            if (rt >= buf[i].time && rt < buf[i + 1].time) {
                const span = buf[i + 1].time - buf[i].time || 1;
                return { a: buf[i].pos, b: buf[i + 1].pos, t: (rt - buf[i].time) / span };
            }
        }
        return { a: last.pos, b: last.pos, t: 0 };
    }

    onMessage(type, data) {
        switch (type) {
            case 'roundCountdown':
                this.targetChar = data.targetChar;
                this.chars = data.chars;
                this._resetSnapshots(data.chars);
                this.currentRound = data.round;
                this.currentMatch = data.match;
                this.countdownActive = true;
                this.countdownStartTime = Date.now() - ((data.elapsedSeconds || 0) * 1000);
                this.countdownMs = data.countdownMs || this.countdownMs;
                if (data.timeLeft != null) this.timeLeft = data.timeLeft;   // full round time, so the box timer shows it during the countdown
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
                this._resetSnapshots(data.chars);
                this.currentRound = data.round;
                this.currentMatch = data.match;
                this.timeLeft = data.timeLeft;
                this.countdownActive = false;
                this.lastUpdateTime = Date.now();
                break;

            case 'gameState':
                this.chars = data.chars;
                this._resetSnapshots(data.chars);
                this.targetChar = data.targetChar;
                this.timeLeft = data.timeLeft;
                this.currentRound = data.round;
                this.currentMatch = data.match;
                this.lastUpdateTime = Date.now();
                break;

            case 'charUpdate':
                // Only positions this tick (flat array); the static char list stays put.
                this.timeLeft = data.timeLeft;
                this._pushSnapshot(data.pos);
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
                // On the FINAL match the server fires gameOver immediately after this, so showing
                // the match-over summary would flash for a frame before the winner screen. Skip it
                // and let the round-over state ride straight into game over.
                if (data.match >= data.totalMatches) break;
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
                    this._resetSnapshots(data.chars);
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
        const { a, b, t } = this._interp();
        this._lastInterp = { a, b, t };   // reuse for hitTest so a tap matches what's on screen
        gameScreen.draw({
            chars: this.chars,   // static char/isTarget list
            posA: a,
            posB: b,
            charT: t,
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
            countdownMs: this.countdownMs,
            lastUpdateTime: this.lastUpdateTime,
            winnerId: this.winnerId
        });
    }

    hitTest(gameScreen, clickX, clickY) {
        // Hit-test against the SAME interpolated positions the player sees, not the latest
        // server ones (which are INTERP_DELAY_MS ahead) — tap where you see it.
        const { a, b, t } = this._lastInterp || this._interp();
        return gameScreen.hitTest(clickX, clickY, this.chars, a, b, t, this.countdownActive);
    }

    reset() {
        this.chars = [];
        this.prevChars = [];
        this.snapshots = [];
        this._lastInterp = null;
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