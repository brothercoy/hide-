import { makeButton, drawButton, drawChar, GLOW_SPEED, zToScale } from '../ui/Button.js';

const FONT_SIZE = 54;

// hide row
const HIDE_SIZE = 250;
const HIDE_SPACING = 150;
const HIDE_Y = 130;
const HIDE_Z = 1.0;

// @$©!! row
const SPECIAL_SIZE = 72;
const SPECIAL_SPACING = 230;
const SPECIAL_Y = 250;
const SPECIAL_Z = 2.5;

// intro animation
const INTRO_DURATION = 3.0;
const HIDE_INTRO_DURATION = 1.2;
const MIN_STAGGER_RATIO = 0.1;
const INTRO_DELAY = 0.5;
const INTRO_Z_START = 3.0;

function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
}

function makeSpecialChar(char) {
    return {
        char,
        releasePhase: null,
        glowT: 0,
        rect: null,
    };
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
        this._bindSpecialClick = this._onCanvasClick.bind(this);
    }

    enter() {
        this.ui.clear();
        this.introStart = null;
        this.introDone = false;
        this.releasedDuringIntro = new Set();
        this.ui.blocked = true;

        // Reset special char glow state
        this.specialChars.forEach(sc => {
            sc.releasePhase = null;
            sc.glowT = 0;
            sc.rect = null;
        });

        // Remove any previous listener before adding new one
        this.canvas.removeEventListener('mousedown', this._bindSpecialClick);
        this.canvas.addEventListener('mousedown', this._bindSpecialClick);

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

        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const btnHeight = FONT_SIZE * 2.5;
        const gap = 20;
        const btnSpacing = btnHeight + gap;
        const startY = cy + 60;

        this.ui.buttons.push(makeButton('PLAY', cx, startY, () => this.onPlay(), { blocksInput: true }));
        this.ui.buttons.push(makeButton('SETTINGS', cx, startY + btnSpacing, () => this.onSettings(), { blocksInput: true }));
    }

    _onCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        let mx = e.clientX - rect.left;
        let my = e.clientY - rect.top;
        // Apply coord transform if present (CRT curve correction)
        if (this.ui.coordTransform) {
            ({ x: mx, y: my } = this.ui.coordTransform(mx, my));
        }
        this.specialChars.forEach(sc => {
            if (!sc.rect) return;
            if (mx >= sc.rect.x && mx <= sc.rect.x + sc.rect.w &&
                my >= sc.rect.y && my <= sc.rect.y + sc.rect.h) {
                // Start glow — same as button release into glowing
                sc.releasePhase = 'glowing';
                sc.glowT = 0;
            }
        });
    }

    _updateSpecialChars(dt) {
        this.specialChars.forEach(sc => {
            if (sc.releasePhase === 'glowing') {
                sc.glowT += dt * GLOW_SPEED;
                if (sc.glowT >= 1.0) {
                    sc.glowT = 0;
                    sc.releasePhase = null;
                }
            }
        });
    }

    _introZ(targetZ, elapsed) {
        if (this.introDone) return targetZ;
        if (this.introStart === null) return INTRO_Z_START;
        const restStart = HIDE_INTRO_DURATION + INTRO_DELAY;
        const t = elapsed - this.introStart;
        const localT = Math.max(0, Math.min(1, (t - restStart) / INTRO_DURATION));
        return INTRO_Z_START + (targetZ - INTRO_Z_START) * easeOut(localT);
    }

    _checkIntroDone(elapsed) {
        if (this.introDone) return;
        if (this.introStart === null) return;
        const restStart = HIDE_INTRO_DURATION + INTRO_DELAY;
        if (elapsed - this.introStart > restStart + INTRO_DURATION) {
            this.introDone = true;
        }
    }

    _drawHide(ctx, cx, elapsed) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const chars = ['h', 'i', 'd', 'e'];
        ctx.font = `${HIDE_SIZE}px "IBMVGA"`;
        const charW = ctx.measureText('M').width;
        const t = this.introStart === null ? 0 : elapsed - this.introStart;
        let visibleCount = 0;
        for (let i = 0; i < this.hideTimestamps.length; i++) {
            if (t >= this.hideTimestamps[i]) visibleCount = i + 1;
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

        this.specialChars.forEach((sc, i) => {
            const z = this._introZ(SPECIAL_Z, elapsed);

            // Glow color — same formula as drawButton
            let color = '#00ff41';
            if (sc.releasePhase === 'glowing' && sc.glowT > 0) {
                const g = sc.glowT < 0.5 ? sc.glowT * 2 : (1 - sc.glowT) * 2;
                color = `rgb(${Math.round(g * 170)}, 255, ${Math.round(65 + g * 121)})`;
            }

            drawChar(ctx, sc.char, x, SPECIAL_Y, z, color, SPECIAL_SIZE);
            ctx.font = `${SPECIAL_SIZE}px "IBMVGA"`;

            // Glow overlay — drawn on top at boosted alpha, full size, no z scaling
            if (sc.releasePhase === 'glowing' && sc.glowT > 0) {
                const g = sc.glowT < 0.5 ? sc.glowT * 2 : (1 - sc.glowT) * 2;
                const glowColor = `rgb(${Math.round(g * 170)}, 255, ${Math.round(65 + g * 121)})`;
                const scale = zToScale(z);
                const scaledSize = SPECIAL_SIZE * scale;
                ctx.font = `${SPECIAL_SIZE}px "IBMVGA"`;
                const fw = ctx.measureText('M').width;
                ctx.font = `${scaledSize}px "IBMVGA"`;
                const sw = ctx.measureText('M').width;
                const xShift = (fw - sw) / 2;
                const yShift = (SPECIAL_SIZE - scaledSize) * 0.5;
                ctx.save();
                ctx.globalAlpha = g * 0.133;
                ctx.fillStyle = glowColor;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(sc.char, x + xShift, SPECIAL_Y + yShift);
                ctx.restore();
            }

            // Store hit rect for click detection — full slot width, full char height
            sc.rect = { x, y: SPECIAL_Y, w: charW, h: SPECIAL_SIZE };

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

        this.ui.buttons.forEach((btn, i) => {
            if (!this.introDone && !this.releasedDuringIntro.has(i)) {
                if (btn._isPressed || btn.releasePhase !== null) {
                    this.releasedDuringIntro.add(i);
                }
            }
            if (!this.introDone && !this.releasedDuringIntro.has(i)) {
                btn.z = this._introZ(1.3, elapsed);
            }
            drawButton(ctx, btn, elapsed, FONT_SIZE);
        });
    }
}