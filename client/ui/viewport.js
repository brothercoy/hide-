// Vertical layout scaling. The canvas height is fixed to the window at load (the
// "base" height). When the window height later changes (e.g. fullscreen), screens
// multiply their vertical positions by vScale = canvas.height / baseHeight so every
// gap grows/shrinks by the same ratio — the layout stays evenly distributed instead
// of leaving the extra space at the bottom. At the load height vScale === 1, so the
// layout there is untouched. Horizontal positions are never scaled (width is fixed).
let baseHeight = 1080;

export function setBaseHeight(h) { baseHeight = h; }

export function vScale(canvas) { return canvas.height / baseHeight; }

// The "content band": the maximized viewport height. When the canvas is TALLER than this
// (fullscreen), the game's edge-anchored elements (room code, HUD) stay within this centered
// band, so leaving fullscreen — which crops back to the maximized height — still shows them.
// The margins above/below the band are just shaded CRT background, never bars.
let bandHeight = 1080;
export function setBandHeight(h) { bandHeight = h; }
// Top of the centered band within the canvas (0 when the canvas == the band, i.e. maximized).
export function bandTop(canvas) { return Math.max(0, (canvas.height - bandHeight) / 2); }
