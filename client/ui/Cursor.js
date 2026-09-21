// Cursor.js — the game draws its own pointer instead of letting the operating system draw one.
//
// Doing it this way puts the pointer INSIDE the screen: it goes through the CRT shader with
// everything else, so it takes the theme's colour, picks up the bloom and scanlines, and bends
// with the curve rather than gliding flat across the glass on top of it.
//
// The shape is the ORDINARY arrow, traced from the system pointer's own proportions so it reads as
// the cursor rather than as a game asset. Tracing it beats loading a PNG on every count: no file,
// no blur at any size, and it takes the theme colour for free.
//
// Under COSMIC it also leaves an iridescent trail — after-images of the arrow itself, each one a
// step further along the colour wheel, like white light fanned through a prism. The order matters:
// stepping the wheel gives a spectrum, whereas random colours would just be confetti.
import { theme, isCycling, charColor } from './colors.js';

// Tip at (0,0), tracing clockwise: down the left edge, into the notch, out along the tail, back up.
const SHAPE = [[0, 0], [0, 16.5], [4.2, 12.8], [7.1, 19], [9.6, 17.9], [6.7, 11.8], [12, 11.8]];
const SCALE = 1.25;      // a little larger than life — the shader's bloom softens fine edges
const OUTLINE = 1.5;     // px of dark border, so it stays legible over a glowing character

// The trail. Ghosts are dropped by DISTANCE, not per frame: per frame they would spread out on a
// fast sweep and pile into a blob when the pointer crawls, whereas by distance the spacing is the
// same at any speed and a pointer standing still drops none at all.
const GHOST_STEP = 13;       // px of travel between after-images
const GHOSTS = 12;           // how many follow the pointer
const GHOST_LIFE_MS = 380;   // and how long one lives, so a halted pointer's tail drains away
const GHOST_SPREAD = 0.5;    // how much of the colour wheel the tail fans across — the prism angle
const GHOST_PEAK = 0.38;     // faint: these are solid shapes, so they need less alpha than a line
const GHOST_BREAK = 140;     // px — a longer step is a jump, not a stroke; drop the tail instead

let trail = [];
let lastX = null, lastY = null;
let hueWalk = 0;             // walks the wheel, so consecutive ghosts are consecutive colours

function tracePath(ctx) {
    ctx.beginPath();
    ctx.moveTo(SHAPE[0][0], SHAPE[0][1]);
    for (let i = 1; i < SHAPE.length; i++) ctx.lineTo(SHAPE[i][0], SHAPE[i][1]);
    ctx.closePath();
}

// Call every frame while the pointer is over the window.
export function emitCursorTrail(x, y) {
    if (!isCycling()) { trail.length = 0; lastX = null; return; }   // cosmic only
    if (lastX !== null) {
        const dx = x - lastX, dy = y - lastY;
        if (dx * dx + dy * dy < GHOST_STEP * GHOST_STEP) return;
        if (dx * dx + dy * dy > GHOST_BREAK * GHOST_BREAK) trail.length = 0;   // teleported
    }
    lastX = x; lastY = y;
    hueWalk += GHOST_SPREAD / GHOSTS;
    trail.push({ x, y, born: performance.now(), hue: hueWalk });
    if (trail.length > GHOSTS) trail.splice(0, trail.length - GHOSTS);
}

// Drawn every frame whether or not the pointer is over the window, so a tail left behind on the
// way out drains away instead of freezing mid-air.
function drawTrail(ctx, now) {
    if (!trail.length) return;
    // Oldest first, so the newest after-image lies over the faded ones rather than under them.
    for (let i = 0; i < trail.length; i++) {
        const gh = trail[i];
        const age = (now - gh.born) / GHOST_LIFE_MS;
        if (age >= 1) continue;
        const along = (i + 1) / trail.length;    // 0 at the tail, 1 just behind the pointer
        ctx.save();
        ctx.translate(gh.x, gh.y);
        ctx.scale(SCALE, SCALE);
        tracePath(ctx);
        // Fades along the tail AND with age: brightest nearest the pointer, and the whole tail
        // drains once you stop moving. No dark border on a ghost — it would only muddy it.
        ctx.globalAlpha = GHOST_PEAK * along * (1 - age);
        ctx.fillStyle = charColor(gh.hue, now);
        ctx.fill();
        ctx.restore();
    }
    trail = trail.filter(p => now - p.born < GHOST_LIFE_MS);
}

// x, y: the pointer in CANVAS coordinates — already mapped back through the CRT curve by
// UIManager, so drawing here and letting the shader bend the result lands it under the real
// pointer. `showArrow` false keeps the tail draining while the pointer is outside the window.
export function drawCursor(ctx, x, y, showArrow = true, now = performance.now()) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    drawTrail(ctx, now);
    if (showArrow) {
        ctx.save();
        ctx.translate(x, y);   // the tip lands exactly on the pointer, as the system arrow's does
        ctx.scale(SCALE, SCALE);
        tracePath(ctx);
        // A real pointer is a light body inside a dark border so it reads over anything it
        // crosses. Same here, in the screen's own two colours. Stroke FIRST, then fill over it: a
        // stroke straddles the path, so filling afterwards leaves the border entirely outside.
        ctx.globalAlpha = 1;
        ctx.lineWidth = (OUTLINE * 2) / SCALE;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = theme.bg;
        ctx.stroke();
        ctx.fillStyle = theme.fg;
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
}
