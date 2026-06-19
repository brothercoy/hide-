import { makeButton, drawButton, drawButtonPartial, buttonRows, drawChar, GLOW_SPEED, Z_FLOAT_MIN } from '../ui/Button.js';
import { charWidth } from '../ui/Font.js';

const FONT_SIZE = 54;

// hide row
const HIDE_SIZE = 250;
const HIDE_SPACING = 150;
const HIDE_Y = 130;
const HIDE_Z = 1.0;

// @$©!! row
const SPECIAL_SIZE = 46;
const SPECIAL_SPACING = 230;
const SPECIAL_Y = 250;
const SPECIAL_Z = 1.3;          // resting depth
const SPECIAL_Z_PRESSED = 2.5;  // depth when held
const SPECIAL_Z_GLOW    = 1.0;  // overshoot target on release — glow fires here, then returns to SPECIAL_Z
const SPECIAL_PRESS_SPEED  = 0.005; // z units per ms while held
const SPECIAL_RETURN_SPEED = 0.005; // z units per ms when returning

// intro animation
const HIDE_INTRO_DURATION = 1.2;
const MIN_STAGGER_RATIO = 0.1;
const INTRO_DELAY = 0.5;       // pause after hide before buttons start typing
const BTN_CHAR_DELAY = 0.02;    // seconds per character — tune for terminal speed
const SPECIAL_INTRO_DURATION = 3.0; // total seconds for all special chars to finish appearing
const SPECIAL_MIN_STAGGER_RATIO = 0.1; // minimum gap between chars as fraction of total
const SPECIAL_GLOW_SPEED = 0.0013;   // glow cycle speed for special chars — lower = slower

function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
}

function moveToward(current, target, step) {
    if (Math.abs(target - current) <= step) return target;
    return current + Math.sign(target - current) * step;
}

function makeSpecialChar(char) {
    return {
        char,
        releasePhase: null, // null | 'releasing' | 'glowing' | 'returning'
        glowT: 0,
        rect: null,
        z: SPECIAL_Z,
        introComplete: false,
        appeared: false, // has begun its entrance — clickable from this point
    };
}

// Returns the full ordered character sequence for a button, matching drawButton's draw order
function getBtnChars(btn) {
    const cw = charWidth(FONT_SIZE);
    const labelW = btn.label.length * cw;
    const padX = cw * 2;
    const innerWidth = labelW + padX * 2;
    const dashCount = Math.floor(innerWidth / cw);

    const topB = '+' + '-'.repeat(dashCount) + '+';
    const botB = '+' + '-'.repeat(dashCount) + '+';
    const mid = ['|', ...btn.label.split(''), '|'];
    return [...topB.split(''), ...mid, ...botB.split('')];
}

export class MainMenu {
    constructor(canvas, ctx, uiManager, onPlay, onSettings) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ui = uiManager;
        this.onPlay = onPlay;
        this.onSettings = onSettings;
        this.introStart = null;
        this.introDone = false;
        this.specialChars = ['@', '$', '©', '!', '!'].map(makeSpecialChar);
        this._bindSpecialClick   = this._onCanvasClick.bind(this);
        this._bindSpecialRelease = this._onCanvasRelease.bind(this);
        this._bindSpecialMove    = this._onCanvasMove.bind(this);
        this._mouseDown = false;
        this._mouseX = 0;
        this._mouseY = 0;
        this._pressedSpecialChar = null;
    }

    // opts.typed === true when entered via the typed-scroll transition (returning
    // to Main from another screen). In that case the row-based feed handles the
    // entrance, so the bespoke first-load intro is skipped and draw() shows the
    // steady state immediately. Without it (first load), the bespoke intro plays.
    enter(opts = {}) {
        this.ui.clear();
        this.typed = !!opts.typed;
        this.releasedDuringIntro = new Set();
        this.ui.blocked = true;

        this.specialChars.forEach(sc => {
            sc.releasePhase = null;
            sc.glowT = 0;
            sc.rect = null;
            sc.z = SPECIAL_Z;
            sc.introComplete = this.typed; // typed: already settled; intro: animate in
            sc.appeared = this.typed;
        });
        this._mouseDown = false;
        this._pressedSpecialChar = null;

        this.canvas.removeEventListener('mousedown', this._bindSpecialClick);
        this.canvas.removeEventListener('mouseup',   this._bindSpecialRelease);
        this.canvas.removeEventListener('mousemove', this._bindSpecialMove);
        this.canvas.addEventListener('mousedown', this._bindSpecialClick);
        this.canvas.addEventListener('mouseup',   this._bindSpecialRelease);
        this.canvas.addEventListener('mousemove', this._bindSpecialMove);

        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const btnHeight = FONT_SIZE * 2.5;
        const gap = 20;
        const btnSpacing = btnHeight + gap;
        const startY = cy + 60;

        this.ui.buttons.push(makeButton('PLAY', cx, startY, () => this.onPlay(), { blocksInput: true }));
        this.ui.buttons.push(makeButton('SETTINGS', cx, startY + btnSpacing, () => this.onSettings(), { blocksInput: true }));

        if (this.typed) {
            // Steady state from the first frame; the feed already typed it in.
            this.introStart = null;
            this.introDone = true;
            return;
        }

        // --- First-load bespoke intro setup ---
        this.introStart = null;
        this.introDone = false;

        // Precompute hide timestamps
        const chars = 4;
        const minGap = HIDE_INTRO_DURATION * MIN_STAGGER_RATIO;
        const reserved = minGap * (chars - 1);
        const free = HIDE_INTRO_DURATION - reserved;
        const gaps = [];
        let remaining = free;
        for (let i = 0; i < chars - 1; i++) {
            const isLast = i === chars - 2;
            const gap = isLast ? remaining : Math.random() * remaining;
            gaps.push(minGap + gap);
            remaining -= gap;
        }
        for (let i = gaps.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [gaps[i], gaps[j]] = [gaps[j], gaps[i]];
        }
        this.hideTimestamps = [0];
        for (let i = 0; i < gaps.length; i++) {
            this.hideTimestamps.push(this.hideTimestamps[i] + gaps[i]);
        }

        // Each special char gets a random start offset within SPECIAL_INTRO_DURATION
        const maxStart = SPECIAL_INTRO_DURATION * (1 - SPECIAL_MIN_STAGGER_RATIO);
        this.specialOffsets = this.specialChars.map(() =>
            SPECIAL_INTRO_DURATION * SPECIAL_MIN_STAGGER_RATIO + Math.random() * maxStart
        );

        this.btnTypeStart = [];
        this.btnCharCount = [];
        let cursor = HIDE_INTRO_DURATION + INTRO_DELAY;
        this.ui.buttons.forEach(btn => {
            this.btnTypeStart.push(cursor);
            const count = getBtnChars(btn).length;
            this.btnCharCount.push(count);
            cursor += count * BTN_CHAR_DELAY;
        });
        this.allBtnsFinishTime = cursor;
    }

    // Row segments for the typed-scroll transition (hide, special chars, buttons).
    // Positions match the steady-state draw so the feed hands off seamlessly.
    getTypeables() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;
        const rows = [];

        // hide + special chars are interwoven into ONE typed row so they type
        // in alternating order (@, h, $, i, ©, d, !, e, !). They share a group Y
        // (so the feed treats them as one row) but each glyph draws at its own
        // size/position — `x` here is only the type-order key, not a coordinate.
        ctx.font = `${HIDE_SIZE}px "IBMVGA"`;
        const hideCharW = ctx.measureText('M').width;
        const hideChars = ['h', 'i', 'd', 'e'];
        const hideTotal = hideChars.length * hideCharW + (hideChars.length - 1) * HIDE_SPACING;
        const hideX0 = cx - hideTotal / 2;

        ctx.font = `${SPECIAL_SIZE}px "IBMVGA"`;
        const spCharW = ctx.measureText('M').width;
        const sp = this.specialChars;
        const spTotal = sp.length * spCharW + (sp.length - 1) * SPECIAL_SPACING;
        const spX0 = cx - spTotal / 2;

        const GROUP_Y = SPECIAL_Y; // anchors the merged row (lowest element)
        let order = 0;
        const pushGlyph = (char, drawX, drawY, size, z) => {
            rows.push({
                y: GROUP_Y, x: order++, cost: 1,
                draw: (c, n) => { if (n >= 1) drawChar(c, char, drawX, drawY, z, '#00ff41', size); }
            });
        };
        const maxLen = Math.max(hideChars.length, sp.length);
        for (let i = 0; i < maxLen; i++) {
            if (i < sp.length) pushGlyph(sp[i].char, spX0 + i * (spCharW + SPECIAL_SPACING), SPECIAL_Y, SPECIAL_SIZE, SPECIAL_Z);
            if (i < hideChars.length) pushGlyph(hideChars[i], hideX0 + i * (hideCharW + HIDE_SPACING), HIDE_Y, HIDE_SIZE, HIDE_Z);
        }

        // buttons (3 rows each)
        for (const btn of this.ui.buttons) rows.push(...buttonRows(btn, FONT_SIZE));

        return rows;
    }

    _getEventPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        let mx = e.clientX - rect.left;
        let my = e.clientY - rect.top;
        if (this.ui.coordTransform) ({ x: mx, y: my } = this.ui.coordTransform(mx, my));
        return { mx, my };
    }

    _onCanvasClick(e) {
        const { mx, my } = this._getEventPos(e);
        this._mouseDown = true;
        this._mouseX = mx;
        this._mouseY = my;
        this._pressedSpecialChar = null;
        this.specialChars.forEach(sc => {
            // Clickable once it has appeared, even mid-intro (like the buttons).
            if (!sc.rect || (!sc.introComplete && !sc.appeared)) return;
            if (mx >= sc.rect.x && mx <= sc.rect.x + sc.rect.w &&
                my >= sc.rect.y && my <= sc.rect.y + sc.rect.h) {
                this._pressedSpecialChar = sc;
                // Graduate from the intro to interactive — the press lifecycle
                // takes over from the char's current z (no snap), like a button.
                if (!sc.introComplete) sc.introComplete = true;
                sc.releasePhase = null;
                sc.glowT = 0;
            }
        });
    }

    _onCanvasMove(e) {
        const { mx, my } = this._getEventPos(e);
        this._mouseX = mx;
        this._mouseY = my;
    }

    _onCanvasRelease(e) {
        const { mx, my } = this._getEventPos(e);
        this._mouseDown = false;
        const sc = this._pressedSpecialChar;
        this._pressedSpecialChar = null;
        if (sc && sc.rect &&
            mx >= sc.rect.x && mx <= sc.rect.x + sc.rect.w &&
            my >= sc.rect.y && my <= sc.rect.y + sc.rect.h) {
            sc.releasePhase = 'releasing';
        }
        // released off-char: z drifts back to SPECIAL_Z naturally in _updateSpecialChars
    }

    _updateSpecialChars(dt) {
        this.specialChars.forEach(sc => {
            if (!sc.introComplete) return;

            const isOver = sc.rect &&
                this._mouseX >= sc.rect.x && this._mouseX <= sc.rect.x + sc.rect.w &&
                this._mouseY >= sc.rect.y && this._mouseY <= sc.rect.y + sc.rect.h;
            const isActivelyPressed = this._mouseDown && sc === this._pressedSpecialChar && isOver;

            if (isActivelyPressed) {
                sc.z = moveToward(sc.z, SPECIAL_Z_PRESSED, dt * SPECIAL_PRESS_SPEED);
            } else if (sc.releasePhase === 'releasing') {
                sc.z = moveToward(sc.z, SPECIAL_Z_GLOW, dt * SPECIAL_RETURN_SPEED);
                if (sc.z === SPECIAL_Z_GLOW) {
                    sc.releasePhase = 'glowing';
                    sc.glowT = 0;
                }
            } else if (sc.releasePhase === 'glowing') {
                sc.glowT += dt * SPECIAL_GLOW_SPEED;
                if (sc.glowT >= 1.0) {
                    sc.glowT = 0;
                    sc.releasePhase = 'returning';
                }
            } else if (sc.releasePhase === 'returning') {
                sc.z = moveToward(sc.z, SPECIAL_Z, dt * SPECIAL_RETURN_SPEED);
                if (sc.z === SPECIAL_Z) sc.releasePhase = null;
            } else if (sc.z !== SPECIAL_Z) {
                // released off-char — drift back
                sc.z = moveToward(sc.z, SPECIAL_Z, dt * SPECIAL_RETURN_SPEED);
            }
        });
    }

    _checkIntroDone(elapsed) {
        if (this.introDone) return;
        if (this.introStart === null) return;
        if (elapsed - this.introStart > this.allBtnsFinishTime) {
            this.introDone = true;
        }
    }

    _drawHide(ctx, cx, elapsed) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const chars = ['h', 'i', 'd', 'e'];
        ctx.font = `${HIDE_SIZE}px "IBMVGA"`;
        const charW = ctx.measureText('M').width;
        let visibleCount;
        if (this.introDone) {
            visibleCount = chars.length; // steady / typed mode — all visible
        } else {
            const t = this.introStart === null ? 0 : elapsed - this.introStart;
            visibleCount = 0;
            for (let i = 0; i < this.hideTimestamps.length; i++) {
                if (t >= this.hideTimestamps[i]) visibleCount = i + 1;
            }
        }
        const visible = chars.slice(0, visibleCount);
        const totalW = visible.length * charW + (visible.length - 1) * HIDE_SPACING;
        let x = cx - totalW / 2;
        visible.forEach(char => {
            drawChar(ctx, char, x, HIDE_Y, HIDE_Z, '#00ff41', HIDE_SIZE);
            ctx.font = `${HIDE_SIZE}px "IBMVGA"`;
            x += charW + HIDE_SPACING;
        });
        ctx.globalAlpha = 1;
    }

    _drawSpecial(ctx, cx, elapsed) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = `${SPECIAL_SIZE}px "IBMVGA"`;
        const charW = ctx.measureText('M').width;
        const totalW = this.specialChars.length * charW + (this.specialChars.length - 1) * SPECIAL_SPACING;
        let x = cx - totalW / 2;

        const specialStart = HIDE_INTRO_DURATION + INTRO_DELAY;
        const t = this.introStart === null ? 0 : (elapsed - this.introStart) - specialStart;

        this.specialChars.forEach((sc, i) => {
            sc.rect = { x, y: SPECIAL_Y, w: charW, h: SPECIAL_SIZE };

            // Drive sc.z from the intro easeOut until complete
            if (!sc.introComplete) {
                const offset = this.specialOffsets ? this.specialOffsets[i] : 0;
                const localT = Math.max(0, Math.min(1, (t - offset) / SPECIAL_INTRO_DURATION));
                if (localT > 0) sc.appeared = true; // clickable from the moment it starts
                sc.z = 3.0 + (SPECIAL_Z - 3.0) * easeOut(localT);
                if (localT >= 1) { sc.introComplete = true; sc.z = SPECIAL_Z; }
            }

            const z = sc.z;

            let color = '#00ff41';
            if (sc.releasePhase === 'glowing' && sc.glowT > 0) {
                const g = sc.glowT < 0.5 ? sc.glowT * 2 : (1 - sc.glowT) * 2;
                color = `rgb(${Math.round(g * 170)}, 255, ${Math.round(65 + g * 121)})`;
            }

            // Single brightened-color draw — identical to the button glow.
            // (The old second-draw overlay is no longer needed now that the glow
            // sits at z = 1.0 / full opacity, same as buttons.)
            drawChar(ctx, sc.char, x, SPECIAL_Y, z, color, SPECIAL_SIZE);
            ctx.font = `${SPECIAL_SIZE}px "IBMVGA"`;

            x += charW + SPECIAL_SPACING;
        });
        ctx.globalAlpha = 1;
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;
        const elapsed = this.ui.elapsed;
        const dt = (performance.now() - (this._lastDrawTime || performance.now()));
        this._lastDrawTime = performance.now();

        if (this.introStart === null && !this.introDone) {
            this.introStart = elapsed;
        }

        if (this.ui.blocked && this.introStart !== null) {
            if (elapsed - this.introStart >= HIDE_INTRO_DURATION) {
                this.ui.blocked = false;
                this.ui.lastTime = performance.now();
            }
        }

        this._checkIntroDone(elapsed);
        this._updateSpecialChars(dt);

        this._drawHide(ctx, cx, elapsed);
        this._drawSpecial(ctx, cx, elapsed);

        const t = this.introStart === null ? 0 : elapsed - this.introStart;

        this.ui.buttons.forEach((btn, i) => {
            if (this.introDone || this.releasedDuringIntro.has(i)) {
                drawButton(ctx, btn, elapsed, FONT_SIZE);
                return;
            }

            if (btn._isPressed || btn.releasePhase !== null) {
                this.releasedDuringIntro.add(i);
                drawButton(ctx, btn, elapsed, FONT_SIZE);
                return;
            }

            const typeStart = this.btnTypeStart[i];
            const elapsed_since = t - typeStart;

            if (elapsed_since < 0) return;

            const visibleChars = Math.floor(elapsed_since / BTN_CHAR_DELAY);
            drawButtonPartial(ctx, btn, visibleChars, elapsed, FONT_SIZE);
        });
    }
}
