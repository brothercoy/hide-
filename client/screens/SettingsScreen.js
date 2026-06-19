import { makeButton, drawButton, buttonRows } from '../ui/Button.js';
import { makeSlider, drawSlider, sliderRows } from '../ui/Slider.js';
import { textRow } from '../ui/Transition.js';

// --- Size & spacing (tweak these) ---
const FONT_SIZE = 32;       // sliders + BACK button font size
const TITLE_SIZE = 96;      // SETTINGS title font size
const TITLE_Y = 80;         // title top edge (px from top)
const SLIDER_SPACING = 80;  // vertical gap between sliders
const BACK_GAP = 200;       // BACK button distance below screen center

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

        this.ui.sliders.push(makeSlider('MASTER VOLUME', cx, cy - SLIDER_SPACING, 0, 100, 80));
        this.ui.sliders.push(makeSlider('SFX VOLUME', cx, cy, 0, 100, 80));
        this.ui.sliders.push(makeSlider('MUSIC VOLUME', cx, cy + SLIDER_SPACING, 0, 100, 50));

        this.ui.buttons.push(makeButton('BACK', cx, cy + BACK_GAP, () => this.onBack(), { blocksInput: true }));
    }

    // Flat list of row segments for the screen-transition feed (grouped by Y).
    getTypeables() {
        const cx = this.canvas.width / 2;
        return [
            textRow('SETTINGS', cx, TITLE_Y, `${TITLE_SIZE}px "IBMVGA"`, 'center', 'top', '#00ff41'),
            ...this.ui.sliders.flatMap(s => sliderRows(s, FONT_SIZE)),
            ...this.ui.buttons.flatMap(b => buttonRows(b, FONT_SIZE)),
        ];
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;

        ctx.fillStyle = '#00ff41';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `${TITLE_SIZE}px "IBMVGA"`;
        ctx.fillText('SETTINGS', cx, TITLE_Y);

        this.ui.sliders.forEach(s => {
            drawSlider(ctx, s, this.ui.elapsed, FONT_SIZE);
        });

        this.ui.buttons.forEach(btn => {
            drawButton(ctx, btn, this.ui.elapsed, FONT_SIZE);
        });
    }
}