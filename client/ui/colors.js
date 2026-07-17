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
};

// Switch the active palette in place. Mutates `theme` (not reassigns) so every module that imported
// the object sees the change; helpers read it at call time, so the swap is immediate and global.
export function applyTheme(id) {
    const t = THEMES[id] || THEMES.green;
    theme.fg = t.fg;
    theme.glowHi = t.glowHi;
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
