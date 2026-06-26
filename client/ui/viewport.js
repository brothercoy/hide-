// Vertical layout scaling. The canvas height is fixed to the window at load (the
// "base" height). When the window height later changes (e.g. fullscreen), screens
// multiply their vertical positions by vScale = canvas.height / baseHeight so every
// gap grows/shrinks by the same ratio — the layout stays evenly distributed instead
// of leaving the extra space at the bottom. At the load height vScale === 1, so the
// layout there is untouched. Horizontal positions are never scaled (width is fixed).
let baseHeight = 1080;

export function setBaseHeight(h) { baseHeight = h; }

export function vScale(canvas) { return canvas.height / baseHeight; }
