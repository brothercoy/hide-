// A looping, scripted preview of a game mode, drawn INSIDE the lobby preview box. That box is the
// game's play box scaled down (same 35×10 grid), so we render the field at the SAME char-to-box
// ratio the real game uses — it reads as a shrunk-down game box. DEL only for now; ACK will add
// its own script later. This is step 1: the "Find: X" intro, then 80 chars bounce like the game.
import { theme } from '../ui/colors.js';
import { GLOW_SPEED } from '../ui/Button.js';   // share the buttons'/game target's glow length
import { LifeLossCallout } from '../modes/LifeLossCallout.js';   // reuse the game's life-loss animation
import { LIFE_LOSS_INTRO_MS, LIFE_LOSS_ENTRY_MS } from '../../timings.js';

// Real-game reference: bouncing chars are drawn at GAME_FONT inside a border frame at GAME_FRAME,
// so char font ÷ frame font is the ratio we reproduce at whatever font the preview frame uses.
const GAME_FONT  = 32;
const GAME_FRAME = 76;

const DEL_COUNT  = 80;              // field size — matches the game's default charCount
const DEL_TARGET = 'X';            // the "Find: X" target — literally X (same every time)
const DEL_POOL   = 'ABCDEFGHKLMNPQRSTUVWYZabcdeghkmnpqrstuvwyz0123456789#%&$';   // no X/x — only the target is X
// --- Beat timing — tweak these to re-pace the loop ---
const INTRO_MS      = 1200;   // ms: "Find: X" holds before the field pops in
const FIELD_HOLD_MS = 1200;   // ms: field bounces at 1× (whole box) before the camera zooms
const ZOOM_MS       = 900;    // ms: zoom-in duration
const ZOOM          = 3.2;    // zoom factor — how tightly we crop into X (higher = closer)
const CROSS_LEAD_MS = 1500;    // ms after the zoom lands that X crosses the camera-window center
const DEL_TARGET_SPEED = 0.14; // fixed drift speed of X (normalized units/sec) — same every time

// Target tap — mirrors GameScreen's press feedback exactly (same constants/timing): a quick click
// dims to PRESS_ALPHA, then un-dims while a triangle glow pulses, then back to normal. Fires as X
// crosses the camera-window center.
const TARGET_PRESS_ALPHA = 0.25;
const TARGET_PRESS_MS    = 100;
const TARGET_GLOW_MS     = 1 / GLOW_SPEED;
// X reaches the camera-window center at INTRO+FIELD+ZOOM+CROSS_LEAD. The glow peaks PRESS_MS + half
// the glow triangle into the tap, so subtract that to peak on center — then TAP_PEAK_LEAD_MS pulls
// the whole tap EARLIER so the flare happens sooner (raise it to fire earlier still).
const TAP_PEAK_LEAD_MS = 300;
const TAP_AT = INTRO_MS + FIELD_HOLD_MS + ZOOM_MS + CROSS_LEAD_MS
             - TAP_PEAK_LEAD_MS - (TARGET_PRESS_MS + TARGET_GLOW_MS / 2);

// --- Post-tap beats: zoom back out to the box + a dimmed player list, then zoom the top-right
// corner and light up Player 1 (who "found" the target). All tunable. ---
const ZOOM_HOLD_MS   = 800;    // hold zoomed on X after it crosses (lets the glow finish)
const ZOOMOUT_MS     = 800;    // zoom back out to the full box
const LIST_HOLD_MS   = 1100;   // hold on the full box with the player list dimmed
const CORNER_ZOOM_MS = 900;    // zoom into the top-right player list
const P1_SNAP_MS     = 400;    // beat AFTER the corner zoom lands before Player 1 snaps to full
const HIGHLIGHT_MS   = 1400;   // hold on Player 1 lit before the loop restarts
const CORNER_ZOOM    = ZOOM;   // zoom the list corner the SAME amount as the field
const LIST_DIM       = 0.3;    // dimmed player-row alpha
// Push the corner window as far TOP-RIGHT as it can go while staying on-field (it can't center on
// the list, which is fine). _lim = the largest camera-center offset that keeps the window on-field.
const _lim          = 1 - 1 / CORNER_ZOOM;
const CORNER_TARGET = { x: _lim, y: -_lim };
const LIST_ANCHOR   = { x: _lim, y: -0.8 };   // list block sits in the top-right of the box
// "Name....X Lives" dot-leader rows, matching the game's player list.
const LIST_COLS = 22;
const _leaderRow = (name, val) => name + '.'.repeat(Math.max(1, LIST_COLS - name.length - val.length)) + val;
const LIST_ROW1 = _leaderRow('PLAYER 1', '3 Lives');
const LIST_ROW2 = _leaderRow('PLAYER 2', '3 Lives');

// Final beat: zoom back out, freeze + dim the field (round-over), then a life-loss callout (Player 2
// loses a life: "Player 2: 3 Lives", cursor deletes the 3 and types 2), matching the game. Then loop.
const ROUND_OVER_CHAR_DIM = 0.15;   // field dims to this for the round-over (matches GameScreen)
const LOSS_HOLD_MS = 900;           // hold after the callout settles, before the loop restarts
const LOSS_MS = LIFE_LOSS_INTRO_MS + LIFE_LOSS_ENTRY_MS + LOSS_HOLD_MS;   // callout duration + hold

// Phase boundaries (ms from the animation start).
const P_ZOOMIN  = INTRO_MS + FIELD_HOLD_MS;                 // zoom into X starts
const P_HOLD    = P_ZOOMIN + ZOOM_MS;                       // zoomed hold (X crosses at +CROSS_LEAD)
const P_ZOOMOUT = P_HOLD + CROSS_LEAD_MS + ZOOM_HOLD_MS;    // zoom back out starts
const P_LIST    = P_ZOOMOUT + ZOOMOUT_MS;                   // full box + dimmed list
const P_CORNER  = P_LIST + LIST_HOLD_MS;                    // zoom into the list corner starts
const P_HIGH    = P_CORNER + CORNER_ZOOM_MS;                // corner zoom lands
const P_SNAP    = P_HIGH + P1_SNAP_MS;                      // Player 1 snaps to full
const P_OUT2    = P_SNAP + HIGHLIGHT_MS;                    // final zoom-out back to the box starts
const P_LOSS    = P_OUT2 + ZOOMOUT_MS;                      // full box, field frozen+dimmed, callout plays
const P_END     = P_LOSS + LOSS_MS;                         // loop restarts here

// --- ACK preview: 3 "Find: X" rounds, each the same zoom+glow as DEL, escalating from a normal
// field → lots of lookalike lowercase 'x's mixed in → ONLY x's, with a "Final Round!" banner on the
// last one. No player list / life-loss. ---
const ACK_X_FRAC = [0, 0.5, 1];   // fraction of the field that is a lookalike lowercase 'x', per round
const ACK_ROUND_HOLD_MS = 900;    // pause on the zoomed-out field after each round, before the next "Find: X"
const ACK_ROUND_MS = INTRO_MS + FIELD_HOLD_MS + ZOOM_MS + CROSS_LEAD_MS + ZOOM_HOLD_MS + ZOOMOUT_MS + ACK_ROUND_HOLD_MS;

// The target's click animation at `t` ms since it fired: dim in over PRESS_MS, then un-dim +
// triangle glow over GLOW_MS (a press+release, not a hold). Returns null outside that window.
function _tapState(t) {
    if (t < 0) return null;
    if (t < TARGET_PRESS_MS) return { alpha: 1 - (1 - TARGET_PRESS_ALPHA) * (t / TARGET_PRESS_MS), glow: 0 };
    const rel = t - TARGET_PRESS_MS;
    if (rel >= TARGET_GLOW_MS) return null;
    const gt = rel / TARGET_GLOW_MS;
    return {
        alpha: TARGET_PRESS_ALPHA + (1 - TARGET_PRESS_ALPHA) * Math.min(1, rel / TARGET_PRESS_MS),
        glow: gt < 0.5 ? gt * 2 : (1 - gt) * 2,
    };
}

// Ease for the zoom (easeInOutCubic).
function _easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

// Straight zoom-into-a-point: at progress e (0..1) the world point (tx,ty) slides straight to
// screen center as the view scales to maxZ. Dividing the remaining gap by the zoom keeps the point's
// on-screen offset ∝ (1-e) — no swoop. Returns { zoom, camX, camY }. (Shared by DEL and ACK.)
function _zoomInto(tx, ty, maxZ, e) {
    const zoom = 1 + (maxZ - 1) * e;
    const f = 1 - (1 - e) / zoom;
    return { zoom, camX: tx * f, camY: ty * f };
}

// Ink bounds of a glyph at font size fs (px offsets from the fillText origin, textBaseline 'top').
// Used to inset the play area to the frame's real INK line — the '=' ink sits mid-cell, so a full
// cell inset left too much dead space top/bottom vs. the sides. Cached once IBMVGA is loaded.
const _inkCache = {};
function inkBounds(ch, fs) {
    const key = ch + '|' + fs;
    if (_inkCache[key]) return _inkCache[key];
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
    const res = x1 < 0
        ? { top: 0, bottom: fs, left: 0, right: fs }                       // blank glyph
        : { top: y0 - pad, bottom: y1 - pad + 1, left: x0 - pad, right: x1 - pad + 1 };
    if (document.fonts.check(`${fs}px "IBMVGA"`)) _inkCache[key] = res;
    return res;
}

export class ModePreview {
    constructor() {
        this.mode  = null;
        this.chars = null;
        this.start = 0;
        this.last  = 0;
        this.targetIndex = -1;             // index of the target 'X' in this.chars
        this.camTarget = { x: 0, y: 0 };   // the spot on X's path the camera zooms into (set per round)
        this.lifeCallout = new LifeLossCallout();   // the final round-over life-loss animation (DEL)
        this._lossStarted = false;         // has this loop's callout been kicked off yet?
        this.rounds = null;                // ACK: the 3 pre-built rounds
        this.ackRound = 0;                 // ACK: which round is currently on screen
    }

    // Build this.chars (+ target/rounds) for the given mode. null for a mode with no preview yet.
    _initMode(modeId) {
        this.lifeCallout.clear(); this._lossStarted = false;
        if (modeId === 'redacted')  return this._initDEL();
        if (modeId === 'frequency') return this._initACK();
        return null;
    }

    // Point the preview at the selected mode (no-op if unchanged). Safe to call every frame.
    setMode(modeId) {
        if (modeId === this.mode) return;
        this.mode  = modeId;
        this.start = performance.now();
        this.last  = this.start;
        this.chars = this._initMode(modeId);
    }

    // Replay the whole sequence from the very start with fresh fields — called when the preview box
    // reappears (e.g. after the CUSTOM settings editor, which hides the box, is closed).
    restart(now = performance.now()) {
        this.start = now;      // use the CALLER's timestamp so the beat clock starts at exactly 0
        this.last  = now;      // (re-reading performance.now() here made it go slightly negative)
        this.chars = this._initMode(this.mode);
    }

    // A field of DEL_COUNT bouncing chars; pickCh(i) supplies each glyph (lets ACK seed 'x's).
    _makeChars(pickCh) {
        const chars = [];
        for (let i = 0; i < DEL_COUNT; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 0.12 + Math.random() * 0.20;         // normalized units / second
            chars.push({
                ch: pickCh(i),
                nx: (Math.random() * 2 - 1) * 0.9,           // start inside the walls
                ny: (Math.random() * 2 - 1) * 0.9,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                rot: Math.random() * Math.PI * 2,
                vr: (Math.random() * 2 - 1) * 1.1,           // rad / second
                isTarget: false,
            });
        }
        return chars;
    }

    // Turn one char into the target 'X' and launch it at a FIXED speed toward a RANDOM zoom-in spot
    // (NOT the box center, so it varies each round) so it reaches that spot exactly as the zoom
    // settles — the camera zooms onto the spot and X crosses the camera-window center there. Returns
    // { targetIndex, camTarget }.
    _placeTarget(chars) {
        const ti = (Math.random() * chars.length) | 0;
        const t  = chars[ti];
        const crossSec = (INTRO_MS + FIELD_HOLD_MS + ZOOM_MS + CROSS_LEAD_MS) / 1000;
        const travel = DEL_TARGET_SPEED * crossSec;          // distance X covers before it crosses
        const lim = (1 - 1 / ZOOM) * 0.9;                    // keep the zoom window (and its center) on-field
        let ang, sx, sy, cam;
        for (let k = 0; k < 40; k++) {
            cam = { x: (Math.random() * 2 - 1) * lim, y: (Math.random() * 2 - 1) * lim };
            ang = Math.random() * Math.PI * 2;
            sx = cam.x - Math.cos(ang) * travel;
            sy = cam.y - Math.sin(ang) * travel;
            if (Math.abs(sx) <= 0.95 && Math.abs(sy) <= 0.95) break;
        }
        t.ch = DEL_TARGET;
        t.isTarget = true;
        t.nx = sx; t.ny = sy;
        t.vx = Math.cos(ang) * DEL_TARGET_SPEED;
        t.vy = Math.sin(ang) * DEL_TARGET_SPEED;
        t.vr = (Math.random() * 2 - 1) * 0.25;               // gentle spin
        return { targetIndex: ti, camTarget: cam };
    }

    _initDEL() {
        const chars = this._makeChars(() => DEL_POOL[(Math.random() * DEL_POOL.length) | 0]);
        const p = this._placeTarget(chars);
        this.targetIndex = p.targetIndex;
        this.camTarget = p.camTarget;
        return chars;
    }

    // Three rounds, each a field with a rising fraction of lookalike lowercase 'x's (see ACK_X_FRAC).
    _initACK() {
        this.rounds = ACK_X_FRAC.map((xFrac) => {
            const chars = this._makeChars(() => Math.random() < xFrac ? 'x' : DEL_POOL[(Math.random() * DEL_POOL.length) | 0]);
            const p = this._placeTarget(chars);
            return { chars, targetIndex: p.targetIndex, camTarget: p.camTarget };
        });
        this.ackRound = 0;
        this.targetIndex = this.rounds[0].targetIndex;
        this.camTarget = this.rounds[0].camTarget;
        return this.rounds[0].chars;
    }

    _step(dt) {
        for (const c of this.chars) {
            c.nx += c.vx * dt; c.ny += c.vy * dt; c.rot += c.vr * dt;
            if (c.nx < -1) { c.nx = -1; c.vx = -c.vx; } else if (c.nx > 1) { c.nx = 1; c.vx = -c.vx; }
            if (c.ny < -1) { c.ny = -1; c.vy = -c.vy; } else if (c.ny > 1) { c.ny = 1; c.vy = -c.vy; }
        }
    }

    // Camera (zoom + center) at time t: zoom into X's spot, hold (X crosses + tap), zoom back out to
    // the full box, hold on the dimmed list, then zoom the top-right corner. Each leg is a straight
    // zoom-into-a-point (on-screen offset ∝ 1-e, no swoop). Returns { zoom, camX, camY }.
    _camera(t) {
        const c = this.camTarget;
        const to = (tx, ty, maxZ, e) => {
            const zoom = 1 + (maxZ - 1) * e;
            const f = 1 - (1 - e) / zoom;
            return { zoom, camX: tx * f, camY: ty * f };
        };
        if (t < P_ZOOMIN)  return { zoom: 1, camX: 0, camY: 0 };
        if (t < P_HOLD)    return to(c.x, c.y, ZOOM, _easeInOut((t - P_ZOOMIN) / ZOOM_MS));
        if (t < P_ZOOMOUT) return to(c.x, c.y, ZOOM, 1);                                    // zoomed hold
        if (t < P_LIST)    return to(c.x, c.y, ZOOM, 1 - _easeInOut((t - P_ZOOMOUT) / ZOOMOUT_MS));  // zoom out
        if (t < P_CORNER)  return { zoom: 1, camX: 0, camY: 0 };                            // full box + list
        if (t < P_HIGH)    return to(CORNER_TARGET.x, CORNER_TARGET.y, CORNER_ZOOM, _easeInOut((t - P_CORNER) / CORNER_ZOOM_MS));
        if (t < P_OUT2)    return to(CORNER_TARGET.x, CORNER_TARGET.y, CORNER_ZOOM, 1);      // corner hold (Player 1 lit)
        if (t < P_LOSS)    return to(CORNER_TARGET.x, CORNER_TARGET.y, CORNER_ZOOM, 1 - _easeInOut((t - P_OUT2) / ZOOMOUT_MS));  // zoom back out
        return { zoom: 1, camX: 0, camY: 0 };                                              // full box, life-loss callout
    }

    // Draw the active preview inside the box; returns true if it drew (caller then skips "PREVIEW").
    // box = { cx, top, w, h } in cells; frameFont = the box's border font (px); color = fg or dim.
    draw(ctx, box, frameFont, color) {
        if (!this.chars) return false;
        if (this.mode === 'frequency') return this._drawACK(ctx, box, frameFont, color);
        if (this.mode !== 'redacted') return false;

        const now = performance.now();
        if (now - this.start >= P_END) this.restart(now);       // loop the whole sequence
        const tt = now - this.start;                            // beat clock (resets to ~0 right after a loop)
        if (tt < P_OUT2) this._step(Math.min(0.05, (now - this.last) / 1000));   // field FREEZES for the round-over
        this.last = now;

        ctx.fillStyle = color;
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const cyBox = box.top + (box.h * frameFont) / 2;   // vertical center of the box

        // Intro: "Find: <target>" at the frame font, before the field appears.
        if (tt < INTRO_MS) {
            ctx.font = `${frameFont}px "IBMVGA"`;
            ctx.fillText('Find: ' + DEL_TARGET, box.cx, cyBox);
            return true;
        }

        // Camera through all the beats (see _camera): zoom into X's spot → hold (X crosses + tap) →
        // zoom back out to the box → hold on the dimmed list → zoom the top-right corner. The zoom-
        // into-a-point math keeps the target spot sliding straight to center (no swoop); chars
        // outside the window clip at the box edges (they still live in the full field).
        const { zoom, camX, camY } = this._camera(tt);

        // Field, drawn through the camera and clipped to the box interior.
        ctx.font = `${frameFont}px "IBMVGA"`;
        const cw = ctx.measureText('M').width;
        const charFont = Math.max(6, Math.round(frameFont * GAME_FONT / GAME_FRAME));
        // Sides: one border cell in (looks right — leave it). Top/bottom: hug the actual drawn '='
        // ink with the SAME px gap the sides have from the ']' ink, instead of a full font cell.
        const innerHalfW = (box.w * cw) / 2 - cw;
        const eq = inkBounds('=', frameFont), rb = inkBounds(']', frameFont);
        const sideGap = cw - rb.right;                        // play edge → ']' ink = the side gap
        const vInset = Math.max(eq.bottom, frameFont - eq.top) + sideGap;
        const innerHalfH = (box.h * frameFont) / 2 - vInset;

        ctx.save();
        ctx.beginPath();
        ctx.rect(box.cx - innerHalfW, cyBox - innerHalfH, innerHalfW * 2, innerHalfH * 2);
        ctx.clip();

        const halfW = innerHalfW - charFont * 0.5;           // keep glyphs a touch off the border at 1×
        const halfH = innerHalfH - charFont * 0.5;
        // Fixed base size + a per-glyph scale transform (crisp at full zoom, smoothly scaled otherwise)
        // so the font size never steps frame-to-frame — that stepping was the shimmer.
        const baseCharFont = Math.max(6, Math.round(charFont * ZOOM));
        const cScale = zoom / ZOOM;
        ctx.font = `${baseCharFont}px "IBMVGA"`;
        // Round-over dim: the whole field fades to ROUND_OVER_CHAR_DIM during the final zoom-out.
        const fieldDim = tt < P_OUT2 ? 1
            : ROUND_OVER_CHAR_DIM + (1 - ROUND_OVER_CHAR_DIM) * (1 - Math.min(1, (tt - P_OUT2) / ZOOMOUT_MS));
        ctx.globalAlpha = fieldDim;
        const tap = _tapState(tt - TAP_AT);   // X's click feedback as it crosses center
        for (let i = 0; i < this.chars.length; i++) {
            const c = this.chars[i];
            ctx.save();
            ctx.translate(box.cx + (c.nx - camX) * halfW * zoom, cyBox + (c.ny - camY) * halfH * zoom);
            ctx.rotate(c.rot);
            ctx.scale(cScale, cScale);
            if (i === this.targetIndex && tap) {
                ctx.globalAlpha = tap.alpha;                          // dim on press, un-dim on release
                ctx.fillText(c.ch, 0, 0);
                if (tap.glow > 0) {                                   // glow overlay (glowHi over the base)
                    ctx.globalAlpha = tap.glow;
                    ctx.fillStyle = theme.glowHi;
                    ctx.fillText(c.ch, 0, 0);
                }
            } else {
                ctx.fillText(c.ch, 0, 0);
            }
            ctx.restore();
        }

        // Player list — fades in over the top-right once we start zooming back out; Player 1 then
        // brightens on the corner zoom-in (they "found" the target), Player 2 stays dimmed. Drawn in
        // the same camera space as the field, so it zooms/scales with everything.
        if (tt >= P_ZOOMOUT && tt < P_LOSS) {   // list shows from the first zoom-out until the round-over
            const fadeIn  = Math.min(1, (tt - P_ZOOMOUT) / ZOOMOUT_MS);
            const fadeOut = tt < P_OUT2 ? 1 : Math.max(0, 1 - (tt - P_OUT2) / ZOOMOUT_MS);   // out on the final zoom-out
            const fade = fadeIn * fadeOut;
            const p1 = tt >= P_SNAP ? 1 : LIST_DIM;      // Player 1 SNAPS to full a beat after the corner zoom
            const lx = box.cx + (LIST_ANCHOR.x - camX) * halfW * zoom;
            const ly = cyBox + (LIST_ANCHOR.y - camY) * halfH * zoom;
            // Render at a FIXED base size and scale via the canvas transform — NOT by re-rounding the
            // font each frame (that stepped the centered text's width and made it jitter as it zoomed).
            const baseFont = Math.max(6, Math.round(charFont * 0.9 * CORNER_ZOOM));   // crisp at full corner zoom
            const rowH = baseFont * 1.15;
            ctx.save();
            ctx.translate(lx, ly);
            ctx.scale(zoom / CORNER_ZOOM, zoom / CORNER_ZOOM);
            ctx.font = `${baseFont}px "IBMVGA"`;
            ctx.fillStyle = color;
            ctx.globalAlpha = p1 * fade;       ctx.fillText(LIST_ROW1, 0, -rowH / 2);
            ctx.globalAlpha = LIST_DIM * fade; ctx.fillText(LIST_ROW2, 0, rowH / 2);
            ctx.restore();
            ctx.globalAlpha = 1;
        }

        // Final beat: the round-over life-loss callout — field is frozen + dimmed and "Player 2: 3
        // Lives" plays out with the cursor deleting the 3 and typing 2 (reuses the game's callout).
        if (tt >= P_LOSS) {
            ctx.globalAlpha = 1;
            if (!this._lossStarted) {
                this.lifeCallout.begin([{ id: 'p2', name: 'PLAYER 2', oldLives: 3, newLives: 2 }], now);
                this._lossStarted = true;
            }
            this.lifeCallout.update(now);
            this.lifeCallout.draw(ctx, box.cx, cyBox, Math.max(10, Math.round(charFont * 1.6)), now);
        }

        ctx.restore();
        return true;
    }

    // ACK round camera (round-local time rt): 1× while the field bounces, zoom into X, hold (X
    // crosses + tap), zoom back out to 1×. Same zoom-into-a-point as DEL.
    _ackCamera(rt) {
        const c = this.camTarget;
        const P0 = INTRO_MS + FIELD_HOLD_MS;                    // zoom-in starts
        const P1 = P0 + ZOOM_MS;                                // zoomed hold (X crosses at +CROSS_LEAD)
        const P2 = P1 + CROSS_LEAD_MS + ZOOM_HOLD_MS;           // zoom-out starts
        const P3 = P2 + ZOOMOUT_MS;                             // back at 1×
        if (rt < P0) return { zoom: 1, camX: 0, camY: 0 };
        if (rt < P1) return _zoomInto(c.x, c.y, ZOOM, _easeInOut((rt - P0) / ZOOM_MS));
        if (rt < P2) return _zoomInto(c.x, c.y, ZOOM, 1);
        if (rt < P3) return _zoomInto(c.x, c.y, ZOOM, 1 - _easeInOut((rt - P2) / ZOOMOUT_MS));
        return { zoom: 1, camX: 0, camY: 0 };
    }

    // ACK preview: 3 "Find: X" rounds back-to-back (each = DEL's field + zoom + glow), escalating in
    // lookalike-'x' density, with a "Final Round!" banner on round 3. Then loops.
    _drawACK(ctx, box, frameFont, color) {
        const now = performance.now();
        if (now - this.start >= 3 * ACK_ROUND_MS) this.restart(now);   // loop after 3 rounds
        const tt = now - this.start;
        const r  = Math.max(0, Math.min(2, Math.floor(tt / ACK_ROUND_MS)));   // current round 0..2 (never -1)
        const rt = tt - r * ACK_ROUND_MS;                           // round-local time
        if (r !== this.ackRound) {                                  // switch to this round's field
            this.ackRound = r;
            this.chars = this.rounds[r].chars;
            this.targetIndex = this.rounds[r].targetIndex;
            this.camTarget = this.rounds[r].camTarget;
        }
        this._step(Math.min(0.05, (now - this.last) / 1000));
        this.last = now;

        ctx.fillStyle = color;
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cyBox = box.top + (box.h * frameFont) / 2;

        // Intro: "Find: X" (round 3 adds a "Final Round!" banner above it, like the game).
        if (rt < INTRO_MS) {
            if (r === 2) {
                ctx.font = `${Math.round(frameFont * 1.5)}px "IBMVGA"`;
                ctx.fillText('Final Round!', box.cx, cyBox - frameFont * 0.8);
                ctx.font = `${frameFont}px "IBMVGA"`;
                ctx.fillText('Find: ' + DEL_TARGET, box.cx, cyBox + frameFont * 0.65);
            } else {
                ctx.font = `${frameFont}px "IBMVGA"`;
                ctx.fillText('Find: ' + DEL_TARGET, box.cx, cyBox);
            }
            return true;
        }

        // Field through the round camera, clipped to the box interior (same rendering as DEL).
        const { zoom, camX, camY } = this._ackCamera(rt);
        ctx.font = `${frameFont}px "IBMVGA"`;
        const cw = ctx.measureText('M').width;
        const charFont = Math.max(6, Math.round(frameFont * GAME_FONT / GAME_FRAME));
        const innerHalfW = (box.w * cw) / 2 - cw;
        const eq = inkBounds('=', frameFont), rb = inkBounds(']', frameFont);
        const sideGap = cw - rb.right;
        const vInset = Math.max(eq.bottom, frameFont - eq.top) + sideGap;
        const innerHalfH = (box.h * frameFont) / 2 - vInset;

        ctx.save();
        ctx.beginPath();
        ctx.rect(box.cx - innerHalfW, cyBox - innerHalfH, innerHalfW * 2, innerHalfH * 2);
        ctx.clip();

        const halfW = innerHalfW - charFont * 0.5;
        const halfH = innerHalfH - charFont * 0.5;
        const baseCharFont = Math.max(6, Math.round(charFont * ZOOM));
        const cScale = zoom / ZOOM;
        ctx.font = `${baseCharFont}px "IBMVGA"`;
        const tap = _tapState(rt - TAP_AT);   // X's click feedback as it crosses center
        for (let i = 0; i < this.chars.length; i++) {
            const c = this.chars[i];
            ctx.save();
            ctx.translate(box.cx + (c.nx - camX) * halfW * zoom, cyBox + (c.ny - camY) * halfH * zoom);
            ctx.rotate(c.rot);
            ctx.scale(cScale, cScale);
            if (i === this.targetIndex && tap) {
                ctx.globalAlpha = tap.alpha;
                ctx.fillText(c.ch, 0, 0);
                if (tap.glow > 0) {
                    ctx.globalAlpha = tap.glow;
                    ctx.fillStyle = theme.glowHi;
                    ctx.fillText(c.ch, 0, 0);
                }
            } else {
                ctx.fillText(c.ch, 0, 0);
            }
            ctx.restore();
        }
        ctx.restore();
        return true;
    }
}
