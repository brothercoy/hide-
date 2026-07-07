import { theme, dim } from './colors.js';

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

// ── Dim-step spin animation ──────────────────────────────────────────────────────
// A bright window SNAPS around the loop in discrete steps (no gradient): all bright (held long)
// → all dim → a GROUP-wide window sliding clockwise around the ring, starting on '(' and ending
// on '<' → all dim → repeat. Tuned in client/button-test.html.
const GROUP         = 2;      // glyphs lit in the sliding window
const STEP_MS       = 260;    // hold per step, ms (higher = slower)
const ALL_BRIGHT_MS = 1400;   // how long the fully-bright frame lingers before the cycle restarts
const DIM_MIN       = 0.18;   // dim-glyph brightness (0..1) — an alpha of fg over the black gate
const START_CHAR    = '(';    // glyph the window starts on; it ends one before it going clockwise

// Clockwise position [0,1) of an (x,y) offset around the loop, starting from the top.
function loopPos(x, y) {
    return ((Math.atan2(x, -y) / (Math.PI * 2)) + 1) % 1;
}

// Ring slots ordered CLOCKWISE, rotated so slot 0 is START_CHAR ('('). _slotOf[i] = the ring slot
// of ROTATE_PARTS[i] — this is what makes the window start on '(' and end on the bottom-left '<'.
const _cw = ROTATE_PARTS
    .map(([ch, x, y], i) => ({ i, p: loopPos(x, y) }))
    .sort((a, b) => a.p - b.p)
    .map(o => o.i);
const _startAt = _cw.indexOf(ROTATE_PARTS.findIndex(([ch]) => ch === START_CHAR));
const _cwOrder = _cw.slice(_startAt).concat(_cw.slice(0, _startAt));
const _slotOf = [];
_cwOrder.forEach((partIdx, slot) => { _slotOf[partIdx] = slot; });

// Ordered lit-slot sets, one per step. null = ALL lit; [] = all dim.
const _steps = (() => {
    const n = ROTATE_PARTS.length, steps = [null, []];      // all bright, then all dim
    for (let head = 0; head <= n + GROUP - 1; head++) {     // width-GROUP window slides in and out
        const set = [];
        for (let k = 0; k < GROUP; k++) { const s = head - k; if (s >= 0 && s < n) set.push(s); }
        steps.push(set);                                    // final iteration is [] → "last glyph now dim"
    }
    return steps;
})();
const _durations = _steps.map((s, i) => (i === 0 ? ALL_BRIGHT_MS : STEP_MS));
const _cycleMs = _durations.reduce((a, b) => a + b, 0);

// The lit-set active right now (self-timed off wall-clock; the gate only draws while portrait).
function _currentStep() {
    let t = performance.now() % _cycleMs;
    for (let i = 0; i < _steps.length; i++) {
        if (t < _durations[i]) return _steps[i];
        t -= _durations[i];
    }
    return _steps[_steps.length - 1];
}

function drawRotateIcon(ctx, cx, cy, S) {
    ctx.font = `${S}px "IBMVGA"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 1;
    const step = _currentStep();
    const litColor = theme.fg, dimColor = dim(DIM_MIN);
    ROTATE_PARTS.forEach(([ch, x, y], i) => {
        const o = inkOffset(ch, S);
        const lit = step === null || step.includes(_slotOf[i]);
        ctx.fillStyle = lit ? litColor : dimColor;                  // snap: bright or dim
        ctx.fillText(ch, cx + x * S - o.cx, cy + y * S - o.cy);     // place ink center at (x,y)
    });
}

// Fill the canvas with the portrait "ROTATE DEVICE" prompt (loop icon + label, centered).
export function drawRotateGate(ctx, w, h) {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);

    const S = Math.round(Math.min(w, h) * 0.26);   // icon size relative to the screen
    const iconCY = Math.round(h / 2 - S * 0.35);   // icon sits a little above center; label below
    drawRotateIcon(ctx, Math.round(w / 2), iconCY, S);

    ctx.font = `${Math.round(S * 0.5)}px "IBMVGA"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = theme.fg;
    ctx.globalAlpha = 1;
    ctx.fillText('ROTATE DEVICE', Math.round(w / 2), Math.round(iconCY + S * 1.15));
}
