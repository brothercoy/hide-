import { makeButton, drawButton } from '../ui/Button.js';

const FONT_SIZE = 32;

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

        this.ui.buttons.push(makeButton('PLAY', cx, cy - 40, () => this.onPlay()));
        this.ui.buttons.push(makeButton('SETTINGS', cx, cy + 40, () => this.onSettings()));
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;

        ctx.fillStyle = '#00ff41';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `96px "IBMVGA"`;
        ctx.fillText('HIDE', cx, 80);

        this.ui.buttons.forEach(btn => {
            drawButton(ctx, btn, this.ui.elapsed, FONT_SIZE);
        });
    }
}