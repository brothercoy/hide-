// Sparkles.js — tiny ASCII sparkles that burst from an element on confirm. Cosmic theme only.
//
// Anywhere the BTN_CONFIRM sound rings, spawnSparkles(rect) is called beside it, so the two are
// one gesture: every glowing button (menu, settings, lobby, flags, chapter levels), the found
// target in the field, the overlay's MAIN MENU, the main-menu easter egg, the Enter-key default.
//
// Each sparkle is one glyph on the element's border, twinkling: it starts faint and small, grows
// to full opacity and size, then fades — all within the button's own glow animation, which is
// the beat the screen transition already waits for. Colours are the same pastel cycle the game's
// characters wear under this theme, each sparkle at its own point on it.
import { isCycling, charColor } from './colors.js';
import { GLOW_SPEED } from './Button.js';

const GLYPHS = ['*', '+', '.', "'"];
const COUNT = 14;
// The whole burst lives exactly as long as the glow: the glow phase is 1/GLOW_SPEED ms, plus a
// hair for the release that precedes it.
const LIFE_MS = 1 / GLOW_SPEED + 40;
const RISE = 0.35;              // fraction of a sparkle's life spent growing in
const STAGGER = 0.3;            // sparkles start over the first 30% of the burst, so it twinkles

let bits = [];
const R = (a, b) => a + Math.random() * (b - a);

// rect: { x, y, w, h } in canvas coords — the element the sparkles surround.
// anchor (optional): () => { x, y } | null — the element's LIVE centre. A moving element (the
// found target keeps drifting after it's found) passes one, and the burst rides with it: each
// sparkle is stored as an offset from the anchor and re-based on it every frame. Buttons don't
// move, so they pass nothing and the burst is static.
export function spawnSparkles(rect, anchor = null) {
    if (!isCycling() || !rect) return;
    const now = performance.now();
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const a0 = anchor ? anchor() : null;               // where the anchor is right now
    for (let i = 0; i < COUNT; i++) {
        // A point on the border, chosen so all four sides get sparkles.
        const t = Math.random(), side = i % 4;
        const x = side === 0 || side === 2 ? rect.x + t * rect.w : (side === 1 ? rect.x + rect.w : rect.x);
        const y = side === 1 || side === 3 ? rect.y + t * rect.h : (side === 0 ? rect.y : rect.y + rect.h);
        const ang = Math.atan2(y - cy, x - cx);            // outward from the element's centre
        const speed = R(12, 36);                           // px/s — a gentle drift, not a burst
        const delay = R(0, STAGGER) * LIFE_MS;
        bits.push({
            x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed - 8,
            // Anchored: remember the offset from the anchor at spawn, and the anchor itself.
            anchor: a0 ? anchor : null, ax: a0 ? x - a0.x : 0, ay: a0 ? y - a0.y : 0, last: a0,
            born: now + delay,
            life: LIFE_MS - delay,                         // every sparkle is gone when the glow ends
            ch: GLYPHS[(Math.random() * GLYPHS.length) | 0],
            phase: Math.random(),                          // its own point on the colour cycle
            size: R(14, 22),
        });
    }
}

// offsetY: the screen transition's current scroll offset. Buttons pressed mid-transition sit at
// their SETTLED rect while being drawn shifted by this — and they keep scrolling after the press —
// so the shift is applied here, per frame, and the sparkles ride along with the element. Zero
// outside a transition.
export function drawSparkles(ctx, now = performance.now(), offsetY = 0) {
    if (!bits.length) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const keep = [];
    for (const b of bits) {
        const age = now - b.born;
        if (age < 0) { keep.push(b); continue; }          // not started yet (staggered)
        const k = age / b.life;
        if (k >= 1) continue;                              // done — dropped
        keep.push(b);
        // The twinkle: faint and small → full → fades away.
        const env = k < RISE ? k / RISE : 1 - (k - RISE) / (1 - RISE);
        const s = age / 1000;
        // Anchored sparkles re-base on the element's live position; if the anchor goes away
        // (new round), they hold its last known spot.
        let bx = b.x, by = b.y;
        if (b.anchor) {
            const p = b.anchor() || b.last;
            if (p) { b.last = p; bx = p.x + b.ax; by = p.y + b.ay; }
        }
        ctx.globalAlpha = env;
        ctx.fillStyle = charColor(b.phase, now);
        ctx.font = `${Math.round(b.size * (0.45 + 0.55 * env))}px "IBMVGA"`;
        ctx.fillText(b.ch, bx + b.vx * s, by + b.vy * s + offsetY);
    }
    bits = keep;
    ctx.restore();
    ctx.globalAlpha = 1;
}
