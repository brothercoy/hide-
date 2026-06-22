import { makeButton, drawButton, buttonRows } from '../ui/Button.js';
import { makeSlider, drawSlider, sliderRows } from '../ui/Slider.js';
import { textRow } from '../ui/Transition.js';
import { theme } from '../ui/colors.js';

// --- Size & spacing (tweak these) ---
const FONT_SIZE = 36;       // sliders + BACK button font size
const TITLE_SIZE = 96;      // SETTINGS title font size
const TITLE_Y = 80;         // title top edge (px from top)
const SLIDERS_Y = 0;        // vertical offset of the slider group from screen center (- = up)
const SLIDER_SPACING = 100;  // vertical gap between sliders
const BACK_GAP = 300;       // BACK button distance below screen center

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
        const sy = cy + SLIDERS_Y; // center of the slider group

        this.ui.sliders.push(makeSlider('MASTER VOLUME', cx, sy - SLIDER_SPACING, 0, 100, 80, null, false, '%'));
        this.ui.sliders.push(makeSlider('SFX VOLUME', cx, sy, 0, 100, 80, null, false, '%'));
        this.ui.sliders.push(makeSlider('MUSIC VOLUME', cx, sy + SLIDER_SPACING, 0, 100, 50, null, false, '%'));

        this.ui.buttons.push(makeButton('BACK', cx, cy + BACK_GAP, () => this.onBack(), { blocksInput: true }));
    }

    // Flat list of row segments for the screen-transition feed (grouped by Y).
    getTypeables() {
        const cx = this.canvas.width / 2;
        return [
            textRow('SETTINGS', cx, TITLE_Y, `${TITLE_SIZE}px "IBMVGA"`, 'center', 'top', theme.fg),
            ...this.ui.sliders.flatMap(s => sliderRows(s, FONT_SIZE)),
            ...this.ui.buttons.flatMap(b => buttonRows(b, FONT_SIZE)),
        ];
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;

        ctx.fillStyle = theme.fg;
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