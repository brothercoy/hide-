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
    // The campaign reward: every character rides a shared colour cycle from its own random point
    // (see charColor below); theme.fg here is just the global fallback the UI still uses. The
    // background is pure black like every other theme. What differs is `ambient`: the fixed
    // themes' CRT haze and screen grain are their fg colour at low intensity, but this theme's
    // fg is a moving rainbow — so the shader takes a fixed blue for those screen-wide terms
    // instead. Same mechanism, same intensity, just a chosen colour rather than the text's.
    // NOTE the blue is FULL brightness, built like green (#00ff41: one channel at 255, a small
    // secondary). The shader's 0.09 haze factor is what makes it dark on screen — handing it a
    // hex that's already dark darkens it twice and the glow all but vanishes.
    cosmic: { fg: '#f0b4c8', glowHi: '#fbe6ee', ambient: '#0055ff', cycle: true },
};

// PERFORMANCE: GameScreen bakes a canvas tile per glyph and throws the whole cache away whenever
// theme.fg changes (each rebuild is a createElement + an opentype path render, per glyph). A
// colour that moved every frame would re-rasterise the entire field 60×/s. So the hue is
// QUANTISED: it only actually changes on a step boundary — ~3×/s instead of 60 — which is a ~2.6°
// hue move in pastel shades, far too small to see, but 20× less cache churn.
const RAINBOW_PERIOD_MS = 12000;   // the GLOBAL theme.fg cycle (UI text, until that goes per-char)
const RAINBOW_STEPS = 140;         // ≈2.6° per step

// The two candidate looks, one-word switch. 'pastel' reads as a coloured hue without shouting;
// 'saturated' is built like green/orange (one channel full, one empty) — the form the CRT shader
// preserves intact, where it washes pastels toward white. Evaluate by eye; flip to compare.
export const RAINBOW_PALETTE = 'pastel';
const PALETTES = {
    pastel:    { s: 0.62, l: 0.78, glowS: 0.5, glowL: 0.92 },
    saturated: { s: 1.0,  l: 0.5,  glowS: 0.6, glowL: 0.85 },
};
let cycling = false;
let lastHueStep = -1;

// Switch the active palette in place. Mutates `theme` (not reassigns) so every module that imported
// the object sees the change; helpers read it at call time, so the swap is immediate and global.
export function applyTheme(id) {
    const t = THEMES[id] || THEMES.green;
    theme.id = THEMES[id] ? id : 'green';   // caches key on THIS, not on fg (rainbow's fg moves)
    theme.fg = t.fg;
    theme.glowHi = t.glowHi;
    theme.bg = t.bg || '#000000';
    theme.ambient = t.ambient || null;   // shader's screen-wide phosphor; null = use fg (fixed themes)
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

    // FOREGROUND (the UI's global colour): quantised so it doesn't churn caches keyed on fg.
    const step = Math.floor(nowMs / RAINBOW_PERIOD_MS * RAINBOW_STEPS) % RAINBOW_STEPS;
    if (step === lastHueStep) return;
    lastHueStep = step;
    const h = step * 360 / RAINBOW_STEPS;
    const p = PALETTES[RAINBOW_PALETTE];
    theme.fg = hslHex(h, p.s, p.l);
    theme.glowHi = hslHex(h, p.glowS, p.glowL);
}

// ── Per-CHARACTER colour (rainbow) ───────────────────────────────────────────
// ONE shared cycle; each character sits at its own random point on it (phase 0..1) and rides
// round independently. The cycle is quantised into CHAR_STEPS colours so the field's tile cache
// is bounded and shared: every character indexes the same CHAR_STEPS tiles per glyph, just at
// different offsets — so after warm-up, per-character colour costs nothing per frame.
const CHAR_PERIOD_MS = 4000;   // one trip round the wheel — per character
const CHAR_STEPS = 60;         // 6° per step; at this speed a character moves a step every ~4 frames
const _stepFg = [], _stepGlow = [];
function bakeSteps() {
    if (_stepFg.length) return;
    const p = PALETTES[RAINBOW_PALETTE];
    for (let i = 0; i < CHAR_STEPS; i++) {
        const h = i * 360 / CHAR_STEPS;
        _stepFg.push(hslHex(h, p.s, p.l));
        _stepGlow.push(hslHex(h, p.glowS, p.glowL));
    }
}
export function isCycling() { return cycling; }
function charStep(phase, nowMs) {
    const s = Math.floor((nowMs / CHAR_PERIOD_MS + phase) * CHAR_STEPS) % CHAR_STEPS;
    return s < 0 ? s + CHAR_STEPS : s;
}
// The colour a character with this phase shows right now — and its click-glow's bright end.
export function charColor(phase, nowMs = performance.now()) { bakeSteps(); return _stepFg[charStep(phase, nowMs)]; }
export function charGlow(phase, nowMs = performance.now()) { bakeSteps(); return _stepGlow[charStep(phase, nowMs)]; }

// A COARSE colour for the miss-glitch. While the field scrambles, every character swaps to a
// random glyph each frame — and the game's glyph tiles are cached per (glyph, colour), so the
// full palette turns a chapter's alphabet into alphabet × CHAR_STEPS tiles to bake. China's 130
// glyphs alone blew past the cache cap, which then flushed and re-baked everything: the lag.
// Snapping to every COARSE_STRIDE'th step cuts that ~6× — and because these are the same entries
// from the same table, the tiles are ones the field has already cached, not new ones. The shift
// is at most half a stride of hue, in pastels, during a scramble: invisible.
const COARSE_STRIDE = 6;   // 60 steps -> 10 colours
export function charColorCoarse(phase, nowMs = performance.now()) {
    bakeSteps();
    const s = charStep(phase, nowMs);
    return _stepFg[(Math.round(s / COARSE_STRIDE) * COARSE_STRIDE) % CHAR_STEPS];
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
