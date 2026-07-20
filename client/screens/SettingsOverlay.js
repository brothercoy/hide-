// In-game settings OVERLAY — a centered, dimmed-backdrop modal opened from the HUD gear. Holds the
// Theme selector + volume sliders (like SettingsScreen) with a single MAIN MENU button where the
// full screen has BACK. Draws over whatever screen is active and blocks interaction behind it.
//
// VISUAL PASS: this renders the overlay with the real button/slider styling, but the components are
// NOT interactive yet (open/close via the gear, or click outside the box). Wiring — MAIN MENU leave,
// live theme/volume — comes next.
import { makeButton, drawButton, updateButtonZ } from '../ui/Button.js';
import { makeBracketButton, drawBracketButton } from '../ui/BracketButton.js';
import { makeSlider, drawSlider } from '../ui/Slider.js';
import { theme, bgAlpha, applyTheme } from '../ui/colors.js';
import { getPref, setPref } from '../prefs.js';

const PREF_THEME = 'theme';

const FONT_SIZE = 36;        // content font (sliders, buttons, theme options) — matches SettingsScreen
const BORDER_FONT = 36;      // box border glyphs (= and ] [)
const BACKDROP_ALPHA = 0.9;  // how much the background is dimmed (higher = darker)

// Box size (fixed; centered on screen). Sized to hold the content stack below with small margins.
// BOX_H is a whole number of border rows (17 × 36) so the bottom '=' lands cleanly clear of the
// MAIN MENU button (which is ~2.5×font tall).
const BOX_W = 680;
const BOX_H = 612;
const PAD_TOP = 40;          // content inset from the box's top edge

// Vertical stack offsets from the content top ('Theme' header top = 0).
const UNDERLINE_GAP   = 34;  // 'Theme' header top → ~~~~ rule top
const OPT_GAP         = 48;  // ~~~~ rule top → theme options' center
const THEME_TO_SLIDER = 100; // theme options → first slider track
const SLIDER_SPACING  = 90;  // between slider tracks
const SLIDER_TO_BTN   = 95;  // last slider → MAIN MENU

const THEME_BTN_SPACING = 180; // horizontal gap between theme options (matches lobby/settings)
const THEME_UNDERLINE_W = 160; // px width of the ~~~~ rule under 'Theme'
const THEME_OPTIONS = [
    { id: 'green', label: 'Green' },
    { id: 'orange', label: 'Orange' },
    { id: 'white', label: 'White' },
];
const VOLUME_PREFS = [
    { label: 'MASTER VOLUME', key: 'volume.master', default: 100 },
    { label: 'SFX VOLUME',    key: 'volume.sfx',    default: 100 },
    { label: 'MUSIC VOLUME',  key: 'volume.music',  default: 100 },
];

export class SettingsOverlay {
    constructor(canvas, ctx, callbacks = {}) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.boxRect = { x: 0, y: 0, w: 0, h: 0 };
        this.selectedTheme = getPref('theme', 'green');

        // Press/drag state for the overlay's OWN controls — uiManager is blocked behind the modal, so
        // the overlay drives its buttons' and sliders' input itself (see onMouseDown/Up/update).
        this._pressed = null;
        this._mouseDown = false;
        this._draggingSlider = null;

        // Build components once (positions set each frame in _layout). All wired exactly like the
        // settings SCREEN: theme options switch the theme live + persist; sliders persist volume.
        this.themeButtons = THEME_OPTIONS.map(opt => {
            const b = makeBracketButton(opt.label.toUpperCase(), 0, 0, () => this._selectTheme(opt.id),
                { active: this.selectedTheme === opt.id });
            b.themeId = opt.id;
            return b;
        });
        this.sliders = VOLUME_PREFS.map(v =>
            makeSlider(v.label, 0, 0, 0, 100, getPref(v.key, v.default), (val) => setPref(v.key, val), false, '%'));
        this.mainMenuBtn = makeButton('MAIN MENU', 0, 0, callbacks.onMainMenu || (() => {}), { blocksInput: true });
    }

    // Pick a theme — identical to SettingsScreen._selectTheme: recolour live + persist, flip actives.
    _selectTheme(id) {
        if (this.selectedTheme === id) return;
        this.selectedTheme = id;
        applyTheme(id);
        setPref(PREF_THEME, id);
        this.themeButtons.forEach(b => { b.active = (b.themeId === id); });
    }

    // Re-read persisted state so the overlay reflects changes made on the settings SCREEN (and vice
    // versa) — both read/write the same prefs. Called on open.
    refresh() {
        this.selectedTheme = getPref(PREF_THEME, 'green');
        this.themeButtons.forEach(b => { b.active = (b.themeId === this.selectedTheme); });
        this.sliders.forEach((s, i) => { s.value = getPref(VOLUME_PREFS[i].key, VOLUME_PREFS[i].default); });
    }

    _hit(r, x, y) { return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

    // Clear transient control state (call on open so a reopen never shows a stale mid-press/glow).
    reset() {
        this._pressed = null;
        this._mouseDown = false;
        this._draggingSlider = null;
        const b = this.mainMenuBtn;
        b._isPressed = false; b._over = false; b._fireClick = false;
        b.releasePhase = null; b.glowT = 0; b.hoverProgress = 0;
        b.charZ = null; b.charRot = null;
        this.themeButtons.forEach(t => { t._over = false; t._flashStart = null; });
    }

    // Set a slider's value from the mouse x (clamped to the track), persisting via onChange.
    _dragSlider(s, mx) {
        const r = s.rect;
        if (!r) return;
        const t = Math.max(0, Math.min(1, (mx - r.left) / r.trackWidth));
        const v = Math.round(s.min + t * (s.max - s.min));
        if (v !== s.value) { s.value = v; if (s.onChange) s.onChange(v); }
    }

    // --- Input for the overlay's own controls (mirrors uiManager's button/slider lifecycle) ---
    onMouseDown(mx, my) {
        // Sliders take precedence — start a drag if the press lands on a track, jumping the handle to
        // the press position immediately (click-to-set), then dragging from there — same as uiManager.
        for (const s of this.sliders) {
            if (this._hit(s.rect, mx, my)) { this._draggingSlider = s; this._dragSlider(s, mx); return; }
        }
        // Then buttons: MAIN MENU (normal, press→glow) and the theme options (plain, fire-on-release).
        for (const btn of [this.mainMenuBtn, ...this.themeButtons]) {
            if (!btn.disabled && this._hit(btn.rect, mx, my)) {
                this._pressed = btn;
                this._mouseDown = true;
                if (!btn.plain) {
                    btn._isPressed = true;
                    if (btn.releasePhase === 'returning') { btn.releasePhase = null; btn.charZ = null; btn.charRot = null; }
                }
                return;
            }
        }
    }

    onMouseUp(mx, my) {
        this._draggingSlider = null;
        const btn = this._pressed;
        this._pressed = null;
        this._mouseDown = false;
        if (!btn) return;
        if (!btn.plain) btn._isPressed = false;
        if (this._hit(btn.rect, mx, my)) {
            // Plain (theme options) fire immediately on release; normal (MAIN MENU) overshoot into the
            // glow and fire onClick at its end (updateButtonZ sets _fireClick) — same as uiManager.
            if (btn.plain) btn.onClick();
            else { btn.releasePhase = 'releasing'; btn.glowT = 0; }
        }
    }

    // Advance drag + hover + press/glow each frame. mx/my are canvas coords; elapsed is the UI clock.
    update(dt, mx, my, elapsed) {
        // Slider drag (polled from the live mouse position, like uiManager's mousemove handler).
        if (this._draggingSlider) this._dragSlider(this._draggingSlider, mx);

        // Theme options: hover drives the bracket flash (drawBracketButton reads _over).
        for (const b of this.themeButtons) b._over = this._hit(b.rect, mx, my);

        // MAIN MENU: hover fill/lift + press/glow lifecycle.
        const btn = this.mainMenuBtn;
        btn._over = this._hit(btn.rect, mx, my);
        btn.hoverProgress = btn._over ? Math.min(1, btn.hoverProgress + dt / 333) : Math.max(0, btn.hoverProgress - dt / 333);
        updateButtonZ(btn, dt, elapsed, this._pressed, this._mouseDown, mx, my);
        if (btn._fireClick) { btn._fireClick = false; btn.onClick(); }
    }

    // The ~~~~ rule string under 'Theme', sized to ~THEME_UNDERLINE_W.
    _themeUnderline() {
        this.ctx.font = `${FONT_SIZE}px "IBMVGA"`;
        const count = Math.max(5, Math.round(THEME_UNDERLINE_W / this.ctx.measureText('~').width));
        return '~'.repeat(count);
    }

    // Position the box + all content, centered on the screen. Returns the Y anchors used by draw.
    _layout() {
        const cx = this.canvas.width / 2;
        const boxTop = this.canvas.height / 2 - BOX_H / 2;
        const boxLeft = cx - BOX_W / 2;
        this.boxRect = { x: boxLeft, y: boxTop, w: BOX_W, h: BOX_H };

        const contentTop = boxTop + PAD_TOP;
        const themeHeaderY = contentTop;
        const underlineY = themeHeaderY + UNDERLINE_GAP;
        const themeBtnY = underlineY + OPT_GAP;
        const slider1Y = themeBtnY + THEME_TO_SLIDER;
        const mainMenuY = slider1Y + 2 * SLIDER_SPACING + SLIDER_TO_BTN;

        const n = this.themeButtons.length;
        const startX = cx - THEME_BTN_SPACING * (n - 1) / 2;
        this.themeButtons.forEach((b, i) => { b.x = startX + i * THEME_BTN_SPACING; b.y = themeBtnY; });
        this.sliders.forEach((s, i) => { s.x = cx; s.y = slider1Y + i * SLIDER_SPACING; });
        this.mainMenuBtn.x = cx; this.mainMenuBtn.y = mainMenuY;

        return { cx, boxTop, boxLeft, themeHeaderY, underlineY };
    }

    // ASCII border box (= top/bottom, ] [ sides), matching the game/lobby frame style.
    _drawBox(ctx, boxLeft, boxTop) {
        ctx.font = `${BORDER_FONT}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = theme.fg;
        const cw = ctx.measureText('M').width;
        const lh = BORDER_FONT;
        const cols = Math.round(BOX_W / cw);
        const rows = Math.round(BOX_H / lh);
        const edge = '='.repeat(cols);
        const rightX = boxLeft + (cols - 1) * cw;
        for (let i = 0; i < rows; i++) {
            const y = boxTop + i * lh;
            if (i === 0 || i === rows - 1) {
                ctx.fillText(edge, boxLeft, y);
            } else {
                ctx.fillText(']', boxLeft, y);
                ctx.fillText('[', rightX, y);
            }
        }
    }

    draw(elapsed) {
        const ctx = this.ctx;
        const L = this._layout();

        // Dim everything behind the overlay.
        ctx.fillStyle = bgAlpha(BACKDROP_ALPHA);
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this._drawBox(ctx, L.boxLeft, L.boxTop);

        // Theme header + ~~~~ rule.
        ctx.fillStyle = theme.fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `${FONT_SIZE}px "IBMVGA"`;
        ctx.fillText('Theme', L.cx, L.themeHeaderY);
        ctx.fillText(this._themeUnderline(), L.cx, L.underlineY);

        // Components (static styling this pass).
        this.themeButtons.forEach(b => drawBracketButton(ctx, b, elapsed, FONT_SIZE));
        this.sliders.forEach(s => drawSlider(ctx, s, elapsed, FONT_SIZE));
        drawButton(ctx, this.mainMenuBtn, elapsed, FONT_SIZE);
    }
}
