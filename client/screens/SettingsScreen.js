import { makeButton, drawButton, buttonRows } from '../ui/Button.js';
import { makeBracketButton, drawBracketButton, bracketButtonRows } from '../ui/BracketButton.js';
import { makeSlider, drawSlider, sliderRows } from '../ui/Slider.js';
import { textRow } from '../ui/Transition.js';
import { theme, applyTheme } from '../ui/colors.js';
import { vScale, bandTop } from '../ui/viewport.js';
import { getPref, setPref } from '../prefs.js';

// Preference keys + their defaults (persisted per-browser via prefs.js/localStorage).
const PREF_THEME = 'theme';
const VOLUME_PREFS = [
    { label: 'MASTER VOLUME', key: 'volume.master', default: 100 },
    { label: 'SFX VOLUME',    key: 'volume.sfx',    default: 100 },
    { label: 'MUSIC VOLUME',  key: 'volume.music',  default: 100 },
];

// --- Size & spacing (tweak these) ---
const FONT_SIZE = 36;       // sliders + BACK button font size
const TITLE_SIZE = 96;      // SETTINGS title font size
const TITLE_Y = 80;         // title top edge (px from top)
const SLIDER_SPACING = 100;  // vertical gap between sliders
const BACK_GAP = 300;       // BACK button distance below screen center

// --- Theme selector (top of settings) — mirrors the lobby's Speed option setting ---
const THEME_UNDERLINE_GAP = 34; // 'Theme' header TOP → the ~~~~ rule TOP (like the lobby's TITLE_GAP)
const THEME_OPT_GAP = 34;       // ~~~~ rule TOP → the options' CENTER
const THEME_SECTION_GAP = 120;  // options' CENTER → the first slider's track (bigger than the
                                // slider-to-slider spacing, to set the Theme section apart)
const THEME_UNDERLINE_W = 160;  // px width of the ~~~~ rule under 'Theme'
const THEME_BTN_SPACING = 180;  // horizontal gap between options (matches lobby Speed)
// Ink-extent estimates used to balance the block's top/bottom margins against the title and BACK
// (text baselines don't map to visible edges 1:1). Tune if the margins look uneven.
const TITLE_CAP_FRAC = 0.78;   // caps height as a fraction of TITLE_SIZE → title's ink bottom
const BTN_HALF_H = 1.25;       // BACK button half-height in FONT_SIZE units (button box ≈ 2.5×font)
const THEME_OPTIONS = [
    { id: 'green', label: 'Green' },
    { id: 'orange', label: 'Orange' },
    { id: 'white', label: 'White' },
];

export class SettingsScreen {
    constructor(canvas, ctx, uiManager, onBack) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ui = uiManager;
        this.onBack = onBack;
        // Green by default (like Speed's NORMAL). Loaded from localStorage so a chosen theme
        // survives closing the tab / coming back tomorrow — not just this session.
        this.selectedTheme = getPref(PREF_THEME, 'green');
    }

    _themeLabelY() { return this._layout().themeLabelY; }
    _themeButtonY() { return this._layout().themeButtonY; }

    // The ~~~~ rule string under 'Theme', sized to ~THEME_UNDERLINE_W (like the lobby's _title).
    _themeUnderline() {
        this.ctx.font = `${FONT_SIZE}px "IBMVGA"`;
        const count = Math.max(5, Math.round(THEME_UNDERLINE_W / this.ctx.measureText('~').width));
        return '~'.repeat(count);
    }

    // Y positions for the Theme header, its ~~~~ rule, its option buttons, the three sliders, and BACK.
    //
    // The Theme section stacks: header → (UNDERLINE_GAP) ~~~~ rule → (OPT_GAP) options, then a
    // deliberately LARGER gap (THEME_SECTION_GAP) down to the first slider, so the header+rule read
    // as titling the options rather than being just another evenly-spaced row. The three sliders keep
    // their own SLIDER_SPACING. A slider's `y` is its TRACK center with the ink drawn FONT_SIZE/2
    // below it (drawChar), so the section gap is measured to that ink line (hence the − FONT_SIZE/2).
    //
    // The whole block is centered so the visible gap below the SETTINGS title equals the gap above
    // BACK — balancing the ink edges (title cap-bottom, last track-bottom, BACK box-top), not the
    // raw text baselines, so the margins actually LOOK equal.
    _layout() {
        const cy = this.canvas.height / 2;
        const vs = vScale(this.canvas);
        const backY = cy + BACK_GAP * vs;
        const sp = SLIDER_SPACING * vs;
        const uGap = THEME_UNDERLINE_GAP * vs;
        const oGap = THEME_OPT_GAP * vs;
        const secGap = THEME_SECTION_GAP * vs;

        const titleInkBottom = bandTop(this.canvas) + TITLE_Y + TITLE_CAP_FRAC * TITLE_SIZE;
        const backInkTop = backY - BTN_HALF_H * FONT_SIZE;

        // Fixed distance from the header TOP down to the last slider's track center.
        const toLastSlider = uGap + oGap + secGap - FONT_SIZE / 2 + 2 * sp;
        // Balance: (headerTop − titleInkBottom) === (backInkTop − lastTrackInkBottom ≈ slider3.y + FONT_SIZE).
        const themeLabelY = (backInkTop + titleInkBottom - toLastSlider - FONT_SIZE) / 2;
        const themeUnderlineY = themeLabelY + uGap;
        const themeButtonY = themeUnderlineY + oGap;
        const slider1Y = themeButtonY + secGap - FONT_SIZE / 2;
        return {
            themeLabelY,
            themeUnderlineY,
            themeButtonY,
            sliderYs: [slider1Y, slider1Y + sp, slider1Y + 2 * sp],
            backY,
        };
    }

    enter() {
        this.ui.clear();

        const cx = this.canvas.width / 2;
        const L = this._layout();

        // Theme selector: a header + three bracket-button options, exactly like the lobby's Speed
        // setting — the selected option is `active` (held inner, no hover), the rest rest outward
        // and are clickable. NOT a toggle: there's always exactly one selected.
        const btnY = L.themeButtonY;
        const n = THEME_OPTIONS.length;
        const startX = cx - THEME_BTN_SPACING * (n - 1) / 2;
        THEME_OPTIONS.forEach((opt, i) => {
            const btn = makeBracketButton(opt.label.toUpperCase(), startX + i * THEME_BTN_SPACING, btnY,
                () => this._selectTheme(opt.id),
                { active: this.selectedTheme === opt.id });
            btn.themeId = opt.id;   // tag so _selectTheme / relayout can find them
            this.ui.buttons.push(btn);
        });

        // Volume sliders — initial value loaded from localStorage; onChange saves back on every
        // drag step, so a level set today is still there tomorrow.
        VOLUME_PREFS.forEach((v, i) => {
            this.ui.sliders.push(makeSlider(v.label, cx, L.sliderYs[i], 0, 100,
                getPref(v.key, v.default), (val) => setPref(v.key, val), false, '%'));
        });

        this.ui.buttons.push(makeButton('BACK', cx, L.backY, () => this.onBack(), { blocksInput: true }));
    }

    // Pick a theme option — mirrors the lobby's _optionChange: no-op if already selected, else
    // flip which button is `active` (held inner). Bracket buttons read `active` each draw, so no
    // rebuild is needed. (Wiring this to the actual game colors comes later.)
    _selectTheme(id) {
        if (this.selectedTheme === id) return;   // already selected — no toggle-off
        this.selectedTheme = id;
        applyTheme(id);                          // recolour the whole game live
        setPref(PREF_THEME, id);                 // persist across sessions
        for (const b of this.ui.buttons) {
            if (b.themeId) b.active = (b.themeId === id);
        }
    }

    // Re-place theme options + sliders + BACK for a new canvas height (resize re-fit), in place.
    relayout() {
        // Re-center X as well as Y so a canvas-width change (mobile portrait gate ↔ landscape)
        // can never leave the group off-center.
        const cx = this.canvas.width / 2;
        const L = this._layout();
        const btnY = L.themeButtonY;
        const n = THEME_OPTIONS.length;
        const startX = cx - THEME_BTN_SPACING * (n - 1) / 2;
        let ti = 0;
        this.ui.buttons.forEach(b => { if (b.themeId) { b.x = startX + ti * THEME_BTN_SPACING; b.y = btnY; ti++; } });
        this.ui.sliders.forEach((s, i) => { if (L.sliderYs[i] != null) { s.x = cx; s.y = L.sliderYs[i]; } });
        const back = this.ui.buttons.find(b => b.label === 'BACK');
        if (back) { back.x = cx; back.y = L.backY; }
    }

    // Flat list of row segments for the screen-transition feed (grouped by Y).
    getTypeables() {
        const cx = this.canvas.width / 2;
        const L = this._layout();
        const hf = `${FONT_SIZE}px "IBMVGA"`;
        // Pass null (not theme.fg) for the text colours so textRow reads theme.fg LIVE at draw time
        // instead of freezing the colour captured here at transition start — otherwise switching the
        // theme mid-scroll recolours the sliders (drawn live) but not these typed-in texts.
        return [
            textRow('SETTINGS', cx, bandTop(this.canvas) + TITLE_Y, `${TITLE_SIZE}px "IBMVGA"`, 'center', 'top', null),
            textRow('Theme', cx, L.themeLabelY, hf, 'center', 'top', null),
            textRow(this._themeUnderline(), cx, L.themeUnderlineY, hf, 'center', 'top', null),
            ...this.ui.sliders.flatMap(s => sliderRows(s, FONT_SIZE)),
            ...this.ui.buttons.flatMap(b => b.bracket ? bracketButtonRows(b, FONT_SIZE) : buttonRows(b, FONT_SIZE)),
        ];
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;
        const L = this._layout();

        ctx.fillStyle = theme.fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `${TITLE_SIZE}px "IBMVGA"`;
        ctx.fillText('SETTINGS', cx, bandTop(this.canvas) + TITLE_Y);

        // Theme header — same size as the slider headers (FONT_SIZE), like the lobby's 'Speed' — with
        // a ~~~~ rule under it (like the lobby column headers) so it titles the options below.
        ctx.font = `${FONT_SIZE}px "IBMVGA"`;
        ctx.fillText('Theme', cx, L.themeLabelY);
        ctx.fillText(this._themeUnderline(), cx, L.themeUnderlineY);

        this.ui.sliders.forEach(s => {
            drawSlider(ctx, s, this.ui.elapsed, FONT_SIZE);
        });

        this.ui.buttons.forEach(btn => {
            if (btn.bracket) drawBracketButton(ctx, btn, this.ui.elapsed, FONT_SIZE);
            else drawButton(ctx, btn, this.ui.elapsed, FONT_SIZE);
        });
    }
}