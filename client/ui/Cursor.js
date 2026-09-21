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
// Under COSMIC it also leaves an iridescent trail — after-images of the arrow itself, each taking
// its own random point on the colour cycle exactly as the sparkles do, so the tail is a scatter of
// prism colours rather than an ordered sweep through them.
import { theme, isCycling, charColor } from './colors.js';

// Tip at (0,0), tracing clockwise: down the left edge, into the notch, out along the tail, back up.
const SHAPE = [[0, 0], [0, 16.5], [4.2, 12.8], [7.1, 19], [9.6, 17.9], [6.7, 11.8], [12, 11.8]];
const SCALE = 1.25;      // a little larger than life — the shader's bloom softens fine edges
const OUTLINE = 1.5;     // px of dark border, so it stays legible over a glowing character

// The trail. Ghosts are dropped by DISTANCE, not per frame: per frame they would spread out on a
// fast sweep and pile into a blob when the pointer crawls, whereas by distance the spacing is the
// same at any speed and a pointer standing still drops none at all.
const GHOST_STEP = 12;       // px of travel between after-images
const GHOST_LIFE_MS = 330;  // how long one takes to fade from full to gone
const GHOST_PEAK = 0.33;     // faint: these are solid shapes, so they need less alpha than a line
const GHOST_BREAK = 140;     // px — a longer step is a jump, not a stroke; drop the tail instead
// A SAFETY VALVE, not a design knob — and the difference matters. Every ghost must die by AGEING,
// so it fades on its own from the moment it appears. Being dropped off the end of a list instead
// deletes it instantly at whatever opacity it had, and the tail then reads as a solid band that
// never fades while you move and only starts dissolving once you stop. A cap of 40 was doing
// exactly that at any speed above a crawl. Set high enough that ordinary movement never reaches
// it, so it only ever catches something pathological.
const GHOST_MAX = 12;

// ── Sparkle trail — EXPERIMENTAL, alongside the ghosts ───────────────────────
// The cursor also sheds the button sparkles as it travels. The difference from the earlier attempt
// is WHERE they land: scattered across a patch the size of the cursor rather than all stacking on
// its tip, which is what made that version read as a clump hanging off the point. Otherwise they
// behave exactly as the button sparkles do — same glyphs, each on its own random point of the
// colour cycle, same twinkle of faint-and-small → full → gone.
//
// Self-contained on purpose: flip SPARK_ON to false, or delete this block and the two calls that
// use it, and nothing else changes.
const SPARK_ON = true;
const SPARK_GLYPHS = ['*', '+', '.', "'"];
const SPARK_STEP = 16;        // px of travel between sparkles — independent of the ghosts' spacing
const SPARK_W = 16, SPARK_H = 24;   // the patch they scatter over: the arrow's own footprint
const SPARK_LIFE_MS = 620;
const SPARK_PEAK = 0.85;      // brighter than a ghost — these are thin glyphs, not solid shapes
// Safety valve only. Same rule as the ghosts: a sparkle must die by AGEING so it twinkles out,
// never by being pushed off the end of the list, which would kill it mid-twinkle. 60 would have
// been reached at around 1500 px/s, which is an ordinary flick of the wrist.
const SPARK_MAX = 220;
const SPARK_RISE = 0.3;       // fraction of life spent growing in, as the button sparkles do
const R = (a, b) => a + Math.random() * (b - a);
let sparks = [];
let lastSX = null, lastSY = null;

function emitSpark(x, y) {
    if (lastSX !== null) {
        const dx = x - lastSX, dy = y - lastSY;
        if (dx * dx + dy * dy < SPARK_STEP * SPARK_STEP) return;
        if (dx * dx + dy * dy > GHOST_BREAK * GHOST_BREAK) sparks.length = 0;   // teleported
    }
    lastSX = x; lastSY = y;
    // The arrow hangs DOWN and RIGHT of its tip, so the patch is offset the same way and the
    // sparkles land on the cursor's body instead of ringing the point it stands on.
    sparks.push({
        x: x + R(0, SPARK_W), y: y + R(0, SPARK_H),
        born: performance.now(),
        ch: SPARK_GLYPHS[(Math.random() * SPARK_GLYPHS.length) | 0],
        hue: Math.random(),
        size: R(11, 18),
    });
    if (sparks.length > SPARK_MAX) sparks.splice(0, sparks.length - SPARK_MAX);
}

function drawSparks(ctx, now) {
    if (!sparks.length) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of sparks) {
        const k = (now - s.born) / SPARK_LIFE_MS;
        if (k >= 1) continue;
        // The twinkle: faint and small, up to full, then away again.
        const env = k < SPARK_RISE ? k / SPARK_RISE : 1 - (k - SPARK_RISE) / (1 - SPARK_RISE);
        ctx.globalAlpha = env * SPARK_PEAK;
        ctx.fillStyle = charColor(s.hue, now);
        ctx.font = `${Math.round(s.size * (0.45 + 0.55 * env))}px "IBMVGA"`;
        ctx.fillText(s.ch, s.x, s.y);
    }
    sparks = sparks.filter(s => now - s.born < SPARK_LIFE_MS);
}

let trail = [];
let lastX = null, lastY = null;

function tracePath(ctx) {
    ctx.beginPath();
    ctx.moveTo(SHAPE[0][0], SHAPE[0][1]);
    for (let i = 1; i < SHAPE.length; i++) ctx.lineTo(SHAPE[i][0], SHAPE[i][1]);
    ctx.closePath();
}

// Call every frame while the pointer is over the window.
export function emitCursorTrail(x, y) {
    if (!isCycling()) {        // cosmic only
        trail.length = 0; sparks.length = 0; lastX = null; lastSX = null;
        return;
    }
    if (SPARK_ON) emitSpark(x, y);   // its own spacing, so the two trails are independent
    if (lastX !== null) {
        const dx = x - lastX, dy = y - lastY;
        if (dx * dx + dy * dy < GHOST_STEP * GHOST_STEP) return;
        if (dx * dx + dy * dy > GHOST_BREAK * GHOST_BREAK) trail.length = 0;   // teleported
    }
    lastX = x; lastY = y;
    // Its own random point on the cycle, the way each sparkle picks one.
    trail.push({ x, y, born: performance.now(), hue: Math.random() });
    if (trail.length > GHOST_MAX) trail.splice(0, trail.length - GHOST_MAX);
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
        ctx.save();
        ctx.translate(gh.x, gh.y);
        ctx.scale(SCALE, SCALE);
        tracePath(ctx);
        // Age alone, and LINEARLY: a ghost starts dimming the instant it is laid down and keeps
        // going at the same rate, so the tail is a smooth gradient from the pointer back however
        // fast you move. A curve that held near full and then dropped (1 - age²) looked constant
        // for half its life and then vanished, which is the opposite of gradual.
        // Position in the tail is NOT used — ghosts are laid down as you move, so age already
        // orders them, and fading by both at once buried the far end.
        // No dark border on a ghost, it would only muddy something this faint.
        ctx.globalAlpha = GHOST_PEAK * (1 - age);
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
    if (SPARK_ON) drawSparks(ctx, now);   // over the ghosts, under the arrow
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
