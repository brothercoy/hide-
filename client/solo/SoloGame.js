// Single-player level controller — the OFFLINE counterpart to the multiplayer mode drivers
// (client/modes/*). Same interface GameScreen expects — draw(gameScreen) / hitTest / countdownActive
// — but driven by a LOCAL tick + the shared gameSim instead of server messages. No networking: this
// runs entirely in the browser, so it plays with the server down / no internet.
//
// A "level" is literally one round of DEL: the "Find: X" countdown, then find the target before the
// timer expires. Win = tap the target. Lose = time runs out. A miss just glitches (handled in game.js),
// no penalty — the timer is the only pressure.
import * as sim from '../../gameSim.js';
import { GAME_MODES } from '../../gameModes.js';
import { COUNTDOWN_MS } from '../../timings.js';
import { theme } from '../ui/colors.js';

const RESULT_MS = 1600;      // hold the COMPLETE / TIME UP banner before returning to the menu
const RESULT_FONT = 104;

export class SoloGame {
    // level: { mode: 'redacted', settings: { charCount, speedScale, roundTime, ... } }
    // callbacks: { onEnd(won) }
    constructor(canvas, ctx, level, charRadii, callbacks) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.onEnd = callbacks.onEnd;

        this.gameMode = GAME_MODES[level.mode] || GAME_MODES.redacted;
        this.settings = { ...this.gameMode.defaultSettings, ...(level.settings || {}) };
        this.currentRound = 1;

        const field = sim.generateField({
            gameMode: this.gameMode, settings: this.settings, currentRound: 1, charRadii: charRadii || {},
        });
        this.chars = field.chars;          // live sim objects (char, isTarget, x, y, rotation, …)
        this.targetChar = field.targetChar;

        this.timeLeft = this.settings.roundTime;
        this.phase = 'countdown';          // 'countdown' → 'round' → 'done'
        this.won = false;
        this.countdownStartTime = Date.now();
        this.countdownMs = COUNTDOWN_MS;
        this.lastUpdateTime = Date.now();
        this._doneAt = 0;
        this._ended = false;

        // Fields the shared tap/draw path in game.js + GameScreen read off the "mode" — all inert
        // for solo (no rounds-over / matches / winner), so those overlays never trigger.
        this.currentMatch = 1;
        this.totalMatches = 1;
        this.totalRounds = 0;
        this.winnerId = null;
        this.showRoundOver = false;
        this.showMatchOver = false;
        this.showRoundResult = false;
    }

    get countdownActive() { return this.phase === 'countdown'; }

    // Local tick — no server. Runs the countdown, then the round's physics + timer, then holds the
    // result before ending. dtMs is unused (we use wall-clock deltas, like the server's tick).
    update() {
        const now = Date.now();
        if (this.phase === 'countdown') {
            if (now - this.countdownStartTime >= this.countdownMs) {
                this.phase = 'round';
                this.timeLeft = this.settings.roundTime;
                this.lastUpdateTime = now;
            }
            return;
        }
        if (this.phase === 'round') {
            const delta = (now - this.lastUpdateTime) / 1000;
            this.lastUpdateTime = now;
            sim.updateChars(this.chars, delta);
            this.timeLeft -= delta;
            if (this.timeLeft <= 0) { this.timeLeft = 0; this._finish(false); }
            return;
        }
        if (this.phase === 'done' && !this._ended && now - this._doneAt >= RESULT_MS) {
            this._ended = true;
            this.onEnd(this.won);
        }
    }

    _finish(won) {
        this.phase = 'done';
        this.won = won;
        this._doneAt = Date.now();
    }

    // Tapped the target (game.js calls this when GameScreen.hitTest reports a hit) → level complete.
    win() { if (this.phase === 'round') this._finish(true); }

    // Reuse GameScreen's own hit-test against the live positions (no interpolation — solo is local, so
    // what's drawn IS the current position: posA === posB, t = 0).
    hitTest(gameScreen, clickX, clickY) {
        const pos = sim.charPositions(this.chars);
        return gameScreen.hitTest(clickX, clickY, this.chars, pos, pos, 0, this.phase === 'countdown');
    }

    draw(gameScreen) {
        const pos = sim.charPositions(this.chars);
        gameScreen.draw({
            chars: this.chars, posA: pos, posB: pos, charT: 0,
            targetChar: this.targetChar,
            playerList: [], timeLeft: this.timeLeft,
            currentRound: this.currentRound, currentMatch: 1, totalMatches: 1, totalRounds: 0,
            showRoundOver: false, showMatchOver: false, matchOverData: null,
            eliminatedName: null, lifeCallout: null,
            showRoundResult: false, roundResult: null, roundResultStart: 0,
            countdownActive: this.phase === 'countdown',
            countdownStartTime: this.countdownStartTime,
            countdownMs: this.countdownMs,
            lastUpdateTime: this.lastUpdateTime,
            winnerId: null,
        });

        if (this.phase === 'done') {
            const ctx = this.ctx;
            ctx.font = `${RESULT_FONT}px "IBMVGA"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = theme.fg;
            ctx.fillText(this.won ? 'COMPLETE!' : 'TIME UP', gameScreen.boxCenterX, this.canvas.height / 2);
        }
    }

    reset() {}
}
