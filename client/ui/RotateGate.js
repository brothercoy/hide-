import { theme } from './colors.js';

// The "rotate device" prompt shown in portrait on mobile. A tight clockwise loop built from
// ( ) - < and an apostrophe, each glyph placed by its ACTUAL INK (not its cell) so the shape is
// exact. [char, x, y] offsets are fractions of the icon size S: x = left(-)/right(+),
// y = up(-)/down(+). Because it's ink-centered, symmetric x-values are truly equidistant and
// same-y values sit level. (Tuned in client/button-test.html.)
const ROTATE_PARTS = [
    ['.', -0.40, -0.42],   // top-left
    ['-',  0.00, -0.55],   // top
    ['.',  0.40, -0.42],   // top-right
    ['(', -0.66,  0.00],   // left side
    [')',  0.66,  0.00],   // right side
    ['<', -0.35,  0.66],   // bottom-left  (arrow)
    ['-',  0.00,  0.66],   // bottom
    ["'",  0.40,  0.48],   // bottom-right
];

// Ink-center offset from a glyph's fillText origin (textBaseline 'top'), measured offscreen and
// cached only once IBMVGA is confirmed loaded — so an early fallback measurement can't get stuck.
const _inkOffsetCache = {};
function inkOffset(ch, fs) {
    const key = ch + '|' + fs;
    if (_inkOffsetCache[key]) return _inkOffsetCache[key];
    const pad = Math.ceil(fs), w = pad * 3, h = pad * 3;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.font = `${fs}px "IBMVGA"`;
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = '#fff';
    g.fillText(ch, pad, pad);
    const d = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) { x0 = x1 = pad; y0 = y1 = pad; }   // blank glyph
    const res = { cx: (x0 + x1) / 2 - pad, cy: (y0 + y1) / 2 - pad };
    if (document.fonts.check(`${fs}px "IBMVGA"`)) _inkOffsetCache[key] = res;
    return res;
}

function drawRotateIcon(ctx, cx, cy, S, color) {
    ctx.font = `${S}px "IBMVGA"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;
    for (const [ch, x, y] of ROTATE_PARTS) {
        const o = inkOffset(ch, S);
        ctx.fillText(ch, cx + x * S - o.cx, cy + y * S - o.cy);   // place ink center at (x,y)
    }
}

// Fill the canvas with the portrait "ROTATE DEVICE" prompt (loop icon + label, centered).
export function drawRotateGate(ctx, w, h) {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);

    const S = Math.round(Math.min(w, h) * 0.26);   // icon size relative to the screen
    const iconCY = Math.round(h / 2 - S * 0.35);   // icon sits a little above center; label below
    drawRotateIcon(ctx, Math.round(w / 2), iconCY, S, theme.fg);

    ctx.font = `${Math.round(S * 0.5)}px "IBMVGA"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = theme.fg;
    ctx.globalAlpha = 1;
    ctx.fillText('ROTATE DEVICE', Math.round(w / 2), Math.round(iconCY + S * 1.15));
}
