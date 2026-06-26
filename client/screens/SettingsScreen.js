import { makeButton, drawButton, buttonRows } from '../ui/Button.js';
import { makeSlider, drawSlider, sliderRows } from '../ui/Slider.js';
import { textRow } from '../ui/Transition.js';
import { theme } from '../ui/colors.js';
import { vScale } from '../ui/viewport.js';

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

    // Slider/BACK Y positions. Offsets from center scale with vScale so the group
    // spreads proportionally when the window height changes (=== 1 at the load height).
    _layout() {
        const cy = this.canvas.height / 2;
        const vs = vScale(this.canvas);
        const sy = cy + SLIDERS_Y * vs;
        return {
            sliderYs: [sy - SLIDER_SPACING * vs, sy, sy + SLIDER_SPACING * vs],
            backY: cy + BACK_GAP * vs,
        };
    }

    enter() {
        this.ui.clear();

        const cx = this.canvas.width / 2;
        const L = this._layout();

        this.ui.sliders.push(makeSlider('MASTER VOLUME', cx, L.sliderYs[0], 0, 100, 80, null, false, '%'));
        this.ui.sliders.push(makeSlider('SFX VOLUME', cx, L.sliderYs[1], 0, 100, 80, null, false, '%'));
        this.ui.sliders.push(makeSlider('MUSIC VOLUME', cx, L.sliderYs[2], 0, 100, 50, null, false, '%'));

        this.ui.buttons.push(makeButton('BACK', cx, L.backY, () => this.onBack(), { blocksInput: true }));
    }

    // Re-place sliders + BACK for a new canvas height (resize re-fit), in place.
    relayout() {
        const L = this._layout();
        this.ui.sliders.forEach((s, i) => { if (L.sliderYs[i] != null) s.y = L.sliderYs[i]; });
        const back = this.ui.buttons.find(b => b.label === 'BACK');
        if (back) back.y = L.backY;
    }

    // Flat list of row segments for the screen-transition feed (grouped by Y).
    getTypeables() {
        const cx = this.canvas.width / 2;
        return [
            textRow('SETTINGS', cx, TITLE_Y * vScale(this.canvas), `${TITLE_SIZE}px "IBMVGA"`, 'center', 'top', theme.fg),
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
        ctx.fillText('SETTINGS', cx, TITLE_Y * vScale(this.canvas));

        this.ui.sliders.forEach(s => {
            drawSlider(ctx, s, this.ui.elapsed, FONT_SIZE);
        });

        this.ui.buttons.forEach(btn => {
            drawButton(ctx, btn, this.ui.elapsed, FONT_SIZE);
        });
    }
}