// Quick-join "searching" overlay — dims the screen while we wait for an available public lobby to
// join. Shows LOADING with a typewriter dot cycle (LOADING → LOADING... → back) and a blinking
// cursor at the end, plus a { CANCEL } bracket button. uiManager is blocked behind it, so the
// overlay drives the CANCEL button's input itself (same pattern as SettingsOverlay).
import { makeBracketButton, drawBracketButton } from '../ui/BracketButton.js';
import { theme, bgAlpha } from '../ui/colors.js';

const BACKDROP_ALPHA = 0.9;   // dim strength (matches the settings overlay)
const LOADING_FONT = 64;
const CANCEL_FONT = 36;
const DOT_MS = 250;           // per dot while typing/deleting (< CURSOR_MS, so the caret stays solid then)
const PAUSE_MS = 1000;        // hold at each end (0 dots and 3 dots) — the caret blinks during these
const CURSOR_MS = 500;        // caret blink half-period: solid for this long after a change, then blinks
const LOADING_ABOVE = 40;     // LOADING text this far above screen center
const CANCEL_GAP = 120;       // CANCEL button this far below the LOADING text
// Dot timeline as [durationMs, dots]: hold empty, type up to 3, hold full, delete back — loops. Each
// segment begins with a dot change, so (like the game's carets) the caret is solid right after a
// change (during typing) and blinks through the holds.
const DOT_SEGMENTS = [[PAUSE_MS, 0], [DOT_MS, 1], [DOT_MS, 2], [PAUSE_MS, 3], [DOT_MS, 2], [DOT_MS, 1]];
const DOT_CYCLE = DOT_SEGMENTS.reduce((s, seg) => s + seg[0], 0);

export class QuickJoinOverlay {
    constructor(canvas, ctx, callbacks = {}) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.cancelBtn = makeBracketButton('CANCEL', 0, 0, callbacks.onCancel || (() => {}), {});
        this.cancelBtn.fontSize = CANCEL_FONT;
        this._pressed = null;
    }

    _hit(r, x, y) { return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

    reset() {
        this._pressed = null;
        this.cancelBtn._over = false;
        this.cancelBtn._flashStart = null;
    }

    onMouseDown(mx, my) {
        if (this._hit(this.cancelBtn.rect, mx, my)) this._pressed = this.cancelBtn;
    }

    onMouseUp(mx, my) {
        const b = this._pressed;
        this._pressed = null;
        if (b && this._hit(b.rect, mx, my)) b.onClick();   // plain bracket → fire on release
    }

    update(dt, mx, my) {
        this.cancelBtn._over = this._hit(this.cancelBtn.rect, mx, my);   // drives the bracket hover flash
    }

    draw(elapsed) {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        ctx.fillStyle = bgAlpha(BACKDROP_ALPHA);
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // LOADING + dot cycle, CENTERED — the whole line re-centers as the dots type/clear, like the
        // match-over line. `elapsed` is relative to when the search began, so it always STARTS at
        // "LOADING" (0 dots) and types up. A blinking BLOCK caret sits just past the text — drawn with
        // textBaseline 'top' + (top + 2) exactly like the round-start (countdown) caret, so it lines up
        // with the ink the same way (cw-2 × FONT-4).
        ctx.font = `${LOADING_FONT}px "IBMVGA"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = theme.fg;
        // Walk the dot timeline: find the current segment (its dot count) and when it started, so the
        // caret can be solid right after each dot change and blink through the holds.
        const tc = (elapsed * 1000) % DOT_CYCLE;
        let acc = 0, dots = 0, segStart = 0;
        for (const [dur, d] of DOT_SEGMENTS) {
            if (tc < acc + dur) { dots = d; segStart = acc; break; }
            acc += dur;
        }
        const cursorOn = Math.floor((tc - segStart) / CURSOR_MS) % 2 === 0;

        const textTop = cy - LOADING_ABOVE - LOADING_FONT / 2;   // LOADING_ABOVE = center offset; derive the top
        const shown = 'LOADING' + '.'.repeat(dots);
        ctx.fillText(shown, cx, textTop);
        if (cursorOn) {
            const cw = ctx.measureText('M').width;
            ctx.fillRect(cx + ctx.measureText(shown).width / 2 + 2, textTop + 2, cw - 2, LOADING_FONT - 4);
        }

        // { CANCEL } below (positioned relative to the LOADING text's center).
        this.cancelBtn.x = cx;
        this.cancelBtn.y = cy - LOADING_ABOVE + CANCEL_GAP;
        drawBracketButton(ctx, this.cancelBtn, elapsed, CANCEL_FONT);
    }
}
