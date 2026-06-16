import { makeButton, drawButton, drawChar } from '../ui/Button.js';

const FONT_SIZE = 54;

// hide row
const HIDE_SIZE = 250;
const HIDE_SPACING = 150;  // extra gap between each letter of hide
const HIDE_Y = 100;        // how far from top
const HIDE_Z = 1.0;       // z depth (1.0 = fully visible)

// @$©!! row
const SPECIAL_SIZE = 72;
const SPECIAL_SPACING = 250; // extra gap between each special character
const SPECIAL_Y = 250;       // how far from top (set close to HIDE_Y to overlay)
const SPECIAL_Z = 2.5;       // z depth (higher = smaller and dimmer)

export class MainMenu {
    constructor(canvas, ctx, uiManager, onPlay, onSettings) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ui = uiManager;
        this.onPlay = onPlay;
        this.onSettings = onSettings;
    }

    enter() {
        this.ui.clear();

        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        const btnHeight = FONT_SIZE * 2.5;
        const gap = 20;
        const btnSpacing = btnHeight + gap;
        const startY = cy + 60;

        this.ui.buttons.push(makeButton('PLAY', cx, startY, () => this.onPlay(), { blocksInput: true }));
        this.ui.buttons.push(makeButton('SETTINGS', cx, startY + btnSpacing, () => this.onSettings(), { blocksInput: true }));
    }

    _drawHide(ctx, cx) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const chars = ['h', 'i', 'd', 'e'];
        ctx.font = `${HIDE_SIZE}px "IBMVGA"`;
        const charW = ctx.measureText('M').width;
        const totalW = chars.length * charW + (chars.length - 1) * HIDE_SPACING;
        let x = cx - totalW / 2;
        chars.forEach(char => {
            drawChar(ctx, char, x, HIDE_Y, HIDE_Z, '#00ff41', HIDE_SIZE);
            ctx.font = `${HIDE_SIZE}px "IBMVGA"`;
            x += charW + HIDE_SPACING;
        });
        ctx.globalAlpha = 1;
    }

    _drawSpecial(ctx, cx) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const chars = ['@', '$', '©', '!', '!'];
        ctx.font = `${SPECIAL_SIZE}px "IBMVGA"`;
        const charW = ctx.measureText('M').width; // monospace — all chars same width
        const totalW = chars.length * charW + (chars.length - 1) * SPECIAL_SPACING;
        let x = cx - totalW / 2;
        chars.forEach(char => {
            drawChar(ctx, char, x, SPECIAL_Y, SPECIAL_Z, '#00ff41', SPECIAL_SIZE);
            ctx.font = `${SPECIAL_SIZE}px "IBMVGA"`;
            x += charW + SPECIAL_SPACING;
        });
        ctx.globalAlpha = 1;
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;

        this._drawHide(ctx, cx);
        this._drawSpecial(ctx, cx);

        this.ui.buttons.forEach(btn => {
            drawButton(ctx, btn, this.ui.elapsed, FONT_SIZE);
        });
    }
}