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
import { COUNTDOWN_MS, GAME_INTRO_MS } from '../../timings.js';
import { theme } from '../ui/colors.js';
import { sfx, tickBurst } from '../audio/sfx.js';
import { setMusic } from '../audio/music.js';

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
        // First clear of the chapter's final level: winning plays the fanfare on the banner
        // (game.js then runs the flag-unlock ceremony). Replays stay quiet.
        this.isFinal = !!level.ceremony;

        // A campaign level is PREDETERMINED: the seed fixes the target, its twin and the field
        // composition identically for every player ("level 12" is one shared puzzle), while spawn
        // positions/speeds reroll every attempt. Ad-hoc solo (no campaign) stays fully random.
        const field = (level.campaign && level.seed)
            ? sim.generateSoloField({
                level: level.campaign.level, totalLevels: level.campaign.totalLevels,
                settings: this.settings, charRadii: charRadii || {},
                rng: sim.seededRng(level.seed),
                // Authored overrides (client/solo/levels.js), if any:
                forceTarget: level.authored?.target,
                forceTwin: level.authored?.twin,
                forceConfusion: level.authored?.confusion,
                charset: level.charset,      // the chapter's own alphabet (charsets.js), if any
            })
            : sim.generateField({
                gameMode: this.gameMode, settings: this.settings, currentRound: 1, charRadii: charRadii || {},
            });
        this.chars = field.chars;          // live sim objects (char, isTarget, x, y, rotation, …)
        this.targetChar = field.targetChar;

        this.timeLeft = this.settings.roundTime;
        this.phase = 'countdown';          // 'countdown' → 'round' → 'done'
        this.won = false;
        // The countdown is HELD while the game's frame types in (game.js typeGameIn), exactly like
        // the server holding the first multiplayer countdown for the intro: it starts when the feed
        // lands, and draw() passes null until then so the prompt doesn't show early.
        this.countdownStartTime = Date.now() + GAME_INTRO_MS;
        this.countdownMs = COUNTDOWN_MS;
        this.lastUpdateTime = Date.now();
        this._doneAt = 0;
        this._ended = false;

        // Fields the shared tap/draw path in game.js + GameScreen read off the "mode" — inert
        // for solo (no matches / winner), so those overlays never trigger. showRoundOver is a
        // GETTER below: true once the level ends, which blocks the tap path (no selection
        // press/confirm sounds on a target you can no longer select).
        this.currentMatch = 1;
        this.totalMatches = 1;
        this.totalRounds = 0;
        this.winnerId = null;
        this.showMatchOver = false;
        this.showRoundResult = false;
    }

    get countdownActive() { return this.phase === 'countdown'; }

    // True once the level has ended (won OR lost) — game.js's tap gate reads this, so taps on
    // the field during the COMPLETE!/TIMES UP! result play no selection sounds and do nothing.
    get showRoundOver() { return this.phase === 'done'; }

    // Local tick — no server. Runs the countdown, then the round's physics + timer, then holds the
    // result before ending. dtMs is unused (we use wall-clock deltas, like the server's tick).
    update() {
        const now = Date.now();
        if (this.phase === 'countdown') {
            if (now - this.countdownStartTime >= this.countdownMs) {
                this.phase = 'round';
                this.timeLeft = this.settings.roundTime;
                this.lastUpdateTime = now;
                sfx('ROUND_START');                 // same round-open as multiplayer
                setMusic('BATTLE');                 // music runs only while the round is live
                tickBurst(this.chars?.length);      // the field types in
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
        setMusic(null);   // the result screen is silent, win or lose
        // Time's up — the round-open sound dropped low (a power-down).
        if (!won) sfx('ROUND_START', { freqMul: 0.45 });
        // Chapter completed — the fanfare rings over the COMPLETE! banner.
        else if (this.isFinal) sfx('CHAPTER_CLEAR');
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
            // A LOST level shows the round-over treatment: the field dims hard and the missed
            // target glows (GameScreen's solo branch), so the player sees where it was.
            showRoundOver: this.phase === 'done' && !this.won, showMatchOver: false, matchOverData: null,
            eliminatedName: null, lifeCallout: null,
            showRoundResult: false, roundResult: null, roundResultStart: 0,
            countdownActive: this.phase === 'countdown',
            countdownStartTime: Date.now() < this.countdownStartTime ? null : this.countdownStartTime,
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
            ctx.fillText(this.won ? 'COMPLETE!' : "TIMES UP!", gameScreen.boxCenterX, this.canvas.height / 2);
        }
    }

    reset() {}
}
