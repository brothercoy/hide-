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
// INFINITE LIVES (the main menu's secret solved): the three hearts are replaced by a single
// infinity sign, right-aligned where the last heart sat. The font's own ∞ glyph is a poor thing
// at this size, so it's an 8 turned on its side — rotated about its INK centre so it sits
// exactly where a glyph would.
import { theme, dim } from '../ui/colors.js';
import { bandTop } from '../ui/viewport.js';
import { getLives, MAX_LIVES, isInfinite } from './lives.js';

const HEART = '♥';
const INFINITY = '8';   // drawn sideways
const FONT = 52;
const GAP = 1.45;      // heart pitch, in character widths
const MARGIN_X = 64;   // from the right edge
const MARGIN_Y = 18;   // from the top of the safe band
const SPENT_ALPHA = 0.22;

// LOSING A HEART (time up on a level): the heart just spent doesn't simply go dim — it blinks,
// fading out and back three times, and stays off after the last fade. The store is already
// updated when this starts (the heart IS spent); the blink is an override on how it draws until
// it's done, ending exactly on the spent shade so there's no step at the hand-off.
const BLINK_HALF_MS = 420;   // one fade (out, or back in) — the TIMES UP! banner holds long enough for all five
const BLINK_DIPS = 3;        // fades OUT — with a fade back in between each, so 5 halves in all
let loss = null;             // { index, at } while a heart is blinking off

export function blinkLostHeart(index) {
    loss = { index, at: performance.now() };
}
// The blinking heart's alpha right now, or null once the blink has finished.
function blinkAlpha(now) {
    const phase = (now - loss.at) / BLINK_HALF_MS;
    if (phase >= 2 * BLINK_DIPS - 1) { loss = null; return null; }
    const k = phase % 2;
    const bright = k < 1 ? 1 - k : k - 1;   // 1→0 on even halves, 0→1 on odd
    return SPENT_ALPHA + (1 - SPENT_ALPHA) * bright;
}

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
        if (n > 0) drawSideways8(ctx, g.left, g.y);
        return;
    }
    const lives = getLives();
    const spent = MAX_LIVES - lives;   // the first `spent` hearts are the ones already used
    const blink = loss ? blinkAlpha(performance.now()) : null;
    for (let i = 0; i < Math.min(n, MAX_LIVES); i++) {
        ctx.fillStyle = (blink != null && loss && i === loss.index) ? dim(blink)
            : i < spent ? dim(SPENT_ALPHA) : theme.fg;
        ctx.fillText(HEART, g.left + i * g.step, g.y);
    }
}

// The infinity sign: an 8 turned 90° about the centre of its own ink, so the turn doesn't shove it
// off the spot the cell gives it. Its ink box comes from the canvas's own measurement (with
// textBaseline 'top' the ascent is measured from the cell's top edge); if a context can't
// measure ink, it turns about the cell centre instead.
function drawSideways8(ctx, left, y) {
    const m = ctx.measureText(INFINITY);
    const cw = m.width;
    const inkCX = left + (Number.isFinite(m.actualBoundingBoxRight) && Number.isFinite(m.actualBoundingBoxLeft)
        ? (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 : cw / 2);
    const inkCY = y + (Number.isFinite(m.actualBoundingBoxDescent) && Number.isFinite(m.actualBoundingBoxAscent)
        ? (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2 : FONT / 2);
    ctx.save();
    ctx.translate(inkCX, inkCY);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = theme.fg;
    ctx.fillText(INFINITY, left - inkCX, y - inkCY);
    ctx.restore();
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
