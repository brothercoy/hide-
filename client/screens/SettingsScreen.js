import { makeButton, drawButton } from '../ui/Button.js';
import { makeSlider, drawSlider } from '../ui/Slider.js';

const FONT_SIZE = 32;

export class SettingsScreen {
    constructor(canvas, ctx, uiManager, onBack) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ui = uiManager;
        this.onBack = onBack;
    }

    enter() {
        this.ui.clear();

        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        this.ui.sliders.push(makeSlider('MASTER VOLUME', cx, cy - 80, 0, 100, 80));
        this.ui.sliders.push(makeSlider('SFX VOLUME', cx, cy, 0, 100, 80));
        this.ui.sliders.push(makeSlider('MUSIC VOLUME', cx, cy + 80, 0, 100, 50));

        this.ui.buttons.push(makeButton('BACK', cx, cy + 200, () => this.onBack()));
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;

        ctx.fillStyle = '#00ff41';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `96px "IBMVGA"`;
        ctx.fillText('SETTINGS', cx, 80);

        this.ui.sliders.forEach(s => {
            drawSlider(ctx, s, this.ui.elapsed, FONT_SIZE);
        });

        this.ui.buttons.forEach(btn => {
            drawButton(ctx, btn, this.ui.elapsed, FONT_SIZE);
        });
    }
}