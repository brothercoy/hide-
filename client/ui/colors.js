// Central theme. Everything reads off `theme`; the shades below derive from it,
// so re-theming the whole UI is a matter of changing these few base colors.
// Helpers read `theme` at call time, so a runtime theme switch takes effect live.
export const theme = {
    fg: '#00ff41',      // foreground — text, borders, the main color
    bg: '#000000',      // background
    glowHi: '#aaffba',  // bright end of the click-glow pulse (rgb 170,255,186)
};

// Selectable palettes (Settings → Theme). Each sets the foreground and the click-glow's bright end;
// the background stays black for all. Every derived shade (dim/disabled/placeholder), the click glow,
// and the CRT phosphor tint (recomputed each frame from theme.fg) follow automatically — so applying
// a theme re-colours the ENTIRE game live, no other wiring needed.
export const THEMES = {
    green:  { fg: '#00ff41', glowHi: '#aaffba' },  // phosphor green (default)
    orange: { fg: '#ff8a00', glowHi: '#ffd296' },  // amber/orange
    white:  { fg: '#a6abb3', glowHi: '#ffffff' },  // cool blue-grey — pushed toward grey for the cold
                                                   // CRT phosphor look; well below pure white so it
                                                   // isn't blinding and the click-glow reads on press
    // The campaign reward: not a fixed colour but a slow drift around the hue wheel in PASTELS —
    // pale lilac, butter, peach, mint — over a background tinted the same hue but nearly black,
    // so it colours the monitor without ever competing with the glyphs. `cycle` hands it to
    // tickTheme(); since every shade, the glow and the CRT phosphor tint derive from theme.fg at
    // call time, the WHOLE game drifts together. The values here are just where it starts.
    rainbow: { fg: '#f0b4c8', glowHi: '#fbe6ee', bg: '#090000', cycle: true },
};

// The rainbow background is DECOUPLED from the foreground hue: it drifts between a very dark red,
// green and blue on its own slower clock, so the two never move in lockstep. Every other theme
// uses pure black, so these sit just barely above it — a tint you notice only as a mood, never as
// a colour competing with the glyphs.
// The three are NOT the same numbers: the eye weights green ~3× red and ~11× blue for brightness,
// so equal channel values would make the green phase glaringly the brightest. These are picked to
// land at roughly equal PERCEIVED darkness instead.
const BG_ANCHORS = [
    [9, 0, 0],     // very dark red
    [0, 3, 0],     // very dark green  (lowest — green reads brightest)
    [0, 0, 15],    // very dark blue   (highest — blue reads darkest)
];
const BG_PERIOD_MS = 63000;   // one full red→green→blue→red trip (deliberately not 42s)

// PERFORMANCE: GameScreen bakes a canvas tile per glyph and throws the whole cache away whenever
// theme.fg changes (each rebuild is a createElement + an opentype path render, per glyph). A
// colour that moved every frame would re-rasterise the entire field 60×/s. So the hue is
// QUANTISED: it only actually changes on a step boundary — ~3×/s instead of 60 — which is a ~2.6°
// hue move in pastel shades, far too small to see, but 20× less cache churn.
const RAINBOW_PERIOD_MS = 42000;   // one full trip around the wheel
const RAINBOW_STEPS = 140;         // ≈2.6° and ~300ms per step
let cycling = false;
let lastHueStep = -1;

// Switch the active palette in place. Mutates `theme` (not reassigns) so every module that imported
// the object sees the change; helpers read it at call time, so the swap is immediate and global.
export function applyTheme(id) {
    const t = THEMES[id] || THEMES.green;
    theme.fg = t.fg;
    theme.glowHi = t.glowHi;
    theme.bg = t.bg || '#000000';
    cycling = !!t.cycle;
    lastHueStep = -1;        // force the next tick to land on the live colour
    if (cycling) tickTheme();
}

function hslHex(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(255 * v).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// Called once per frame from the game loop. A no-op for the fixed palettes; for `rainbow` it walks
// the hue so the entire UI drifts through the spectrum together. Returns early unless the hue
// actually moved a step — that early-out is what keeps the glyph caches from thrashing.
export function tickTheme(nowMs = performance.now()) {
    if (!cycling) return;

    // BACKGROUND: crossfades red → green → blue on its own clock. Free to move every frame —
    // nothing caches on theme.bg, it's only ever a fillRect colour.
    const bp = (nowMs / BG_PERIOD_MS) * BG_ANCHORS.length;
    const i = Math.floor(bp) % BG_ANCHORS.length;
    const f = bp - Math.floor(bp);
    const a = BG_ANCHORS[i], b = BG_ANCHORS[(i + 1) % BG_ANCHORS.length];
    const ch = (n) => Math.round(a[n] + (b[n] - a[n]) * f).toString(16).padStart(2, '0');
    theme.bg = `#${ch(0)}${ch(1)}${ch(2)}`;

    // FOREGROUND: quantised, because a changed theme.fg throws away every baked glyph tile.
    const step = Math.floor(nowMs / RAINBOW_PERIOD_MS * RAINBOW_STEPS) % RAINBOW_STEPS;
    if (step === lastHueStep) return;
    lastHueStep = step;
    const h = step * 360 / RAINBOW_STEPS;
    theme.fg = hslHex(h, 0.62, 0.78);      // pastel — pale enough to read as "light rainbow"
    theme.glowHi = hslHex(h, 0.5, 0.92);   // the click-glow's bright end, same hue
}

function rgbOf(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Foreground at reduced opacity. Default ≈ the old #007a1f (disabled). Other
// low-emphasis shades are just different alphas of the same color.
export function dim(alpha = 0.48) {
    const [r, g, b] = rgbOf(theme.fg);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
export const placeholderColor = () => dim(0.24); // input placeholder (≈ #003d0f)
export const plainIdle = () => dim(0.66);         // plain button, not hovered (≈ #00aa2a)

// Disabled widgets AND the non-host lobby — the only place a viewer sees the UI differently
// from the host. Kept SEPARATE from dim() so the input fields (which use dim() when
// unfocused, and are already faint) stay put when this is tuned.
export const disabledColor = () => dim(0.3);

// Disconnected player rows — an ABSOLUTE opacity (applied via globalAlpha over a solid fg)
// so it reads the same for host and non-host. A distinct disconnect symbol carries the rest
// of the signal, so this needn't be too low.
export const DISCONNECTED_ALPHA = 0.22;

// Disconnected players show an animated "bouncing dot" beside their name (drawn at the name's own
// dim alpha — never brighter). It's a sequence of glyphs, each held for its OWN duration so the
// motion eases in and out (lingering at the top/bottom of the bounce, quick through the middle)
// instead of ticking uniformly. Time-driven so every disconnected player animates in sync. Tune any
// single frame's glyph or its ms freely — [glyph, ms].
const DC_FRAMES = [
    ['.', 150],   // resting low — lingers
    ['!', 200],    // shooting up
    ["^", 300],    // apex, passing quick
    ['O', 150],   // top of the bounce — lingers
    ['o', 100],    // dropping
    ['_', 60],   // near the bottom
];
const DC_TOTAL = DC_FRAMES.reduce((sum, f) => sum + f[1], 0);
export function disconnectGlyph(now = Date.now()) {
    let t = now % DC_TOTAL;
    for (const [glyph, ms] of DC_FRAMES) {
        if (t < ms) return glyph;
        t -= ms;
    }
    return DC_FRAMES[0][0];
}

// Background at reduced opacity (modal / overlay scrims).
export function bgAlpha(alpha) {
    const [r, g, b] = rgbOf(theme.bg);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Click-glow pulse colour: lerp fg -> glowHi by t (0..1). Reproduces the old
// rgb(t*170, 255, 65 + t*121) when fg = #00ff41 and glowHi = #aaffba.
export function glow(t) {
    const a = rgbOf(theme.fg), b = rgbOf(theme.glowHi);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r}, ${g}, ${bl})`;
}
