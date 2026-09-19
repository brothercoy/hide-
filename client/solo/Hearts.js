// The solo campaign's lives, drawn top-right on every solo screen (flag grid, level page, and the
// game itself). One module so the three can't drift apart in position or style.
//
// A spent life stays in place as a DIM heart rather than disappearing, so the row never changes
// width and "2 of 3" reads at a glance. The glyph is CP437's ♥ (the font has no hollow heart, and
// the dim treatment is the same one locked levels and disabled buttons already use).
//
// They spend LEFT TO RIGHT: the leftmost heart dims first, so the remaining lives stay bunched at
// the right-hand end.
//
// INFINITE LIVES (the main menu's secret solved): the three hearts are replaced by a single ∞,
// right-aligned where the last heart sat.
import { theme, dim } from '../ui/colors.js';
import { bandTop } from '../ui/viewport.js';
import { getLives, MAX_LIVES, isInfinite } from './lives.js';

const HEART = '♥';
const INFINITY = '∞';
const FONT = 52;
const GAP = 1.45;      // heart pitch, in character widths
const MARGIN_X = 64;   // from the right edge
const MARGIN_Y = 18;   // from the top of the safe band

// Where the row sits and how wide each step is. The y is above every screen's own content, which
// is also what makes the hearts type in FIRST: the transition feeds rows top-down.
export function heartsGeom(canvas, ctx) {
    ctx.font = `${FONT}px "IBMVGA"`;
    const cw = ctx.measureText('M').width;
    const step = cw * GAP;
    const count = isInfinite() ? 1 : MAX_LIVES;   // ∞ is one glyph, sitting where the last heart would
    const width = step * (count - 1) + cw;
    const left = canvas.width - MARGIN_X - width;
    return { left, y: bandTop(canvas) + MARGIN_Y, step, cw, width, count };
}

// Draws the first `n` hearts (n defaults to all) — full for a life still held, dim for a spent one.
export function drawHearts(ctx, canvas, n = MAX_LIVES) {
    const g = heartsGeom(canvas, ctx);
    ctx.font = `${FONT}px "IBMVGA"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 1;
    if (isInfinite()) {
        if (n > 0) { ctx.fillStyle = theme.fg; ctx.fillText(INFINITY, g.left, g.y); }
        return;
    }
    const lives = getLives();
    const spent = MAX_LIVES - lives;   // the first `spent` hearts are the ones already used
    for (let i = 0; i < Math.min(n, MAX_LIVES); i++) {
        ctx.fillStyle = i < spent ? dim(0.22) : theme.fg;
        ctx.fillText(HEART, g.left + i * g.step, g.y);
    }
}

// One typeable row for the screen-transition feed — the hearts appear one at a time like any other
// typed text. Sitting at the topmost y, this row types before the rest of the screen.
export function heartsRow(canvas, ctx) {
    const g = heartsGeom(canvas, ctx);
    return {
        y: g.y,
        x: g.left,
        cost: g.count,
        draw: (c, n) => { if (n > 0) drawHearts(c, canvas, n); },
    };
}
