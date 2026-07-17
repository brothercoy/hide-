import { theme, disconnectGlyph } from '../ui/colors.js';
import { RowReveal, drawRevealSegments } from '../ui/RowReveal.js';
import { otFont } from '../ui/Font.js';
import { bandTop } from '../ui/viewport.js';
import { textRow } from '../ui/Transition.js';
import { GLOW_SPEED } from '../ui/Button.js';   // share the buttons'/specials' glow length
import { MO_HOLD_MS, MO_TYPE_MS, MO_CURSOR_MS, RR_TITLE_MS, RR_TITLE_HOLD_MS, RR_COMPLETE_TYPE_MS, RR_COMPLETE_TEXT, RR_GAP_MS, rrRowMs, rrPlus, RR_ROW_MOVE_MS, RR_TYPE_MS, RR_PAUSE_MS } from '../../timings.js';   // shared so the server's holds derive from these

const TICK_RATE = 50;

// Play-box border as a character grid, matching the lobby preview box (= top/bottom,
// ] [ sides) but drawn at the game font. The box is a FIXED BOX_COLS × BOX_ROWS grid
// — tune these two to resize the play field.
const BOX_COLS = 35;
const BOX_ROWS = 10;
const BOX_LEFT_MARGIN = 80;   // box is left-aligned this far from the canvas's left edge
const PLAY_EDGE_GAP = 6;      // px gap between the frame's INK line and how close a char may get,
                              // the SAME on all four sides (lower = characters hug the box tighter)
const PLAYER_LIST_GAP = 12;   // gap from the box's right edge ([ ) to the player list
const LIST_FONT_SIZE = 28;    // player-list text
const LIFE_LOSS_FONT = 52;    // end-of-round life-loss callout — bigger than list text, below Find:X (76)
const LIST_ROW_H = 30;        // tight row pitch so ~10 players fit the top half (spectators below)

// Match-over sequence timing lives in timings.js (shared with the server, which derives its
// post-match hold from the same phases — see the imports above).
const ROOMCODE_TOP = 16;      // room code top edge (top-left corner of the screen)
const COPY_GAP = 28;          // COPY CODE button center, px below the room code's ink bottom
                              // (gives a small ~15px visible gap — less than the lobby's)

// "Hack" glitch shown to a player who taps inside the field but misses the target — every
// char flickers to a random one of the letters ALREADY on screen so spam-clicking can't
// reveal the target. Purely visual and local to the misser; the real positions/target never
// change. Cheap: it reuses the cached glyph tiles, just picking a different existing letter
// (re-rolled every GLITCH_SWAP_MS).
const GLITCH_MS = 500;         // how long a miss scrambles the field
const GLITCH_SWAP_MS = 60;     // re-roll the random glyphs this often (flicker rate)

// Field dims to this alpha while a round is over, so the life-loss list reads clearly on top
// (replaces the old low-opacity black backdrop).
const ROUND_OVER_CHAR_DIM = 0.15;
// At game over the field brightens from ROUND_OVER_CHAR_DIM up to full over this long — matched to
// game.js's GO_SCRIM_MS so the characters fade uniformly WITH the scrim instead of vanishing under it.
const GO_CHAR_RISE_MS = 1000;
const ROUND_OVER_TARGET_HI = 0.4;     // the round-over target PULSES up to this (vs the dim floor) so everyone sees it
const ROUND_OVER_PULSE_MS = 1200;     // full pulse period while the round-over is showing
const ROUND_OVER_DIM_FADE_MS = 300;   // after the found target's glow, how long it eases into the pulse
// Target tap feedback — modeled on the main-menu buttons/special chars: hold to press (dims
// while held), release to glow. The press is HELD (not a fixed animation), and the glow length
// matches the buttons/specials (GLOW_SPEED) rather than an arbitrary number.
const TARGET_PRESS_ALPHA = 0.25;         // target dims to this while held (≈ the specials' pressed alpha)
const TARGET_PRESS_MS = 250;             // press-dim eases in over this, then holds; also the un-dim time on release
const TARGET_GLOW_MS = 1 / GLOW_SPEED;   // release glow length — same as the buttons/special chars (~770ms)

export class GameScreen {
    constructor(canvas, ctx, isMobile) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.isMobile = isMobile;
        this.FONT_SIZE = isMobile ? 36 : 32;  // bouncing-character font — kept small so many fit
        this.FRAME_SIZE = 76;                 // border-frame font — independent of the chars; sets box size
        this._metricsCache = new Map();
        this._glyphCache = new Map(); // char -> pre-rendered glyph tile (atlas)
        this._glyphColor = null;      // theme color the tiles were baked in
        this._cw = null;              // cached monospace char width at the FRAME font
        this.roomCode = '';           // shown top-left at the frame font; COPY CODE sits under it
        this._inkCache = new Map();   // measured ink bounds per string at the FRAME font
        this.modeId = 'redacted';     // 'redacted' hides the Round; other modes show it
        this.glitchUntil = 0;         // scramble the play field until this timestamp (miss feedback)
        this._glitchGlyphs = [];      // per-char random glyph while glitching
        this._glitchSwapAt = 0;       // last time the glitch glyphs were re-rolled
        this._glowCache = new Map();  // char -> glowHi-colored tile (target tap glow overlay)
        this._glowColor = null;       // theme color the glow tiles were baked in
        this._matchOverStart = null;  // when the match-over screen first appeared → drives its animation
        this._moShowing = false;      // rising-edge tracker for the match-over screen
        this._winnerStart = null;     // when the game-over screen first appeared → drives the field brighten
        this._winnerShowing = false;  // rising-edge tracker for game over
        this._targetPressStart = -1;      // when the target was pressed (mousedown on it), or -1 if not held
        this._targetReleaseStart = -1e9;  // when it was released (mouseup) → glow
        // Types in a player/spectator row that appears after the game is underway (a mid-game joiner);
        // the roster present at game start is the initial batch and shows instantly.
        this.rowReveal = new RowReveal();
    }

    setRoomCode(code) { this.roomCode = (code || '').toUpperCase(); }
    setMode(modeId) { this.modeId = modeId || 'redacted'; this.rowReveal.reset(); }

    // Start (or extend) the miss glitch — called when a tap lands inside the field but not on
    // the target. Spam-clicking keeps re-triggering it, so the scramble stays continuous.
    triggerGlitch() { this.glitchUntil = Date.now() + GLITCH_MS; }

    // True if a click (relative to the box center, as game.js passes it) is inside the play area.
    isInPlayField(clickX, clickY) {
        return Math.abs(clickX) <= this.playHalfW && Math.abs(clickY) <= this.playHalfH;
    }

    // The player pressed the target (mousedown on it): start the held press-dim, and clear any
    // active miss-glitch (you found it). The tap itself is sent by game.js on mousedown, so a
    // hold still counts even as the target slides out from under the cursor.
    pressTarget() { this._targetPressStart = Date.now(); this.glitchUntil = 0; }

    // Released (mouseup): end the press and fire the glow. No-op if it wasn't being held.
    releaseTarget() {
        if (this._targetPressStart < 0) return;
        this._targetPressStart = -1;
        this._targetReleaseStart = Date.now();
    }

    // { alpha, glow } for the target — the held press-dim, then the release glow — or null at rest.
    _targetState(now) {
        if (this._targetPressStart >= 0) {                 // held: dim toward PRESS_ALPHA, then hold
            const p = Math.min(1, (now - this._targetPressStart) / TARGET_PRESS_MS);
            return { alpha: 1 - (1 - TARGET_PRESS_ALPHA) * p, glow: 0 };
        }
        const rel = now - this._targetReleaseStart;
        if (rel >= 0 && rel < TARGET_GLOW_MS) {            // released: un-dim + glow pulse
            const alpha = TARGET_PRESS_ALPHA + (1 - TARGET_PRESS_ALPHA) * Math.min(1, rel / TARGET_PRESS_MS);
            const gt = rel / TARGET_GLOW_MS;
            const glow = gt < 0.5 ? gt * 2 : (1 - gt) * 2;  // triangle 0→1→0, same shape as the specials
            return { alpha, glow };
        }
        return null;
    }

    // The target's treatment during a round-over. EVERYONE sees it PULSE between the dim floor and
    // a brighter peak (wall-clock timed, so all clients show it roughly in phase) — so players who
    // didn't find it can still see what it was. The release GLOW, though, is INDIVIDUAL: it comes
    // from THIS client's own recent tap (_targetReleaseStart), so only the player who found the
    // target sees their target glow, then it eases into the shared pulse. { alpha, glow }.
    _roundOverTargetState(now) {
        const phase = (now % ROUND_OVER_PULSE_MS) / ROUND_OVER_PULSE_MS;
        const osc = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);                       // 0 → 1 → 0, smooth
        const pulseAlpha = ROUND_OVER_CHAR_DIM + (ROUND_OVER_TARGET_HI - ROUND_OVER_CHAR_DIM) * osc;

        const rel = now - this._targetReleaseStart;   // this client's own tap; huge for players who didn't tap
        if (rel >= 0 && rel < TARGET_GLOW_MS) {
            const gt = rel / TARGET_GLOW_MS;
            return { alpha: 1, glow: gt < 0.5 ? gt * 2 : (1 - gt) * 2 };             // individual glow (I found it)
        }
        if (rel >= TARGET_GLOW_MS && rel < TARGET_GLOW_MS + ROUND_OVER_DIM_FADE_MS) {
            const fade = (rel - TARGET_GLOW_MS) / ROUND_OVER_DIM_FADE_MS;
            return { alpha: 1 + (pulseAlpha - 1) * fade, glow: 0 };                  // ease my glow → the pulse
        }
        return { alpha: pulseAlpha, glow: 0 };                                       // everyone else: pulse only
    }

    // Actual rendered ink bounds (px offsets from the glyph's textBaseline:'top', left-aligned
    // draw origin) for a string at the FRAME font — measured, since this bitmap font's metrics and
    // canvas baselines don't line up. top/bottom are vertical, left/right horizontal. Cached.
    _inkBounds(text) {
        const hit = this._inkCache.get(text);
        if (hit) return hit;
        const fs = this.FRAME_SIZE;
        const ORIGIN_X = 2;                 // draw x (a little inset so nothing clips at the edge)
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(fs * text.length) + 4;
        cv.height = Math.ceil(fs * 1.6);
        const g = cv.getContext('2d');
        g.font = `${fs}px "IBMVGA"`;
        g.textBaseline = 'top';
        g.fillStyle = '#fff';
        g.fillText(text, ORIGIN_X, 0);
        const { data } = g.getImageData(0, 0, cv.width, cv.height);
        let top = -1, bottom = -1, left = -1, right = -1;
        for (let y = 0; y < cv.height; y++) {
            for (let x = 0; x < cv.width; x++) {
                if (data[(y * cv.width + x) * 4 + 3] > 0) {
                    if (top < 0) top = y; bottom = y;
                    if (left < 0 || x < left) left = x;
                    if (x > right) right = x;
                }
            }
        }
        const res = { top, bottom, left: left - ORIGIN_X, right: right - ORIGIN_X };  // relative to draw origin
        if (bottom >= 0) this._inkCache.set(text, res);  // only cache once the font has rendered
        return res;
    }

    // Where game.js parks the COPY CODE bracket button — centered under the room code, a
    // fixed COPY_GAP below the room code's measured ink bottom (so it sits just under the
    // code). Clamped so on short windows it can't reach the box top row's `=` ink.
    get copyBtnX() { return BOX_LEFT_MARGIN + (this.roomCode.length || 6) * this._frameCW() / 2; }
    get copyBtnY() {
        const code = this._inkBounds('M0');   // caps + digit (room code charset)
        const eq = this._inkBounds('=');      // box top row glyph
        const codeBottom = bandTop(this.canvas) + ROOMCODE_TOP + (code.bottom >= 0 ? code.bottom : this.FRAME_SIZE * 0.78);
        const boxTop = this.canvas.height / 2 - this.boxH / 2;
        const rowInkTop = boxTop + (eq.top >= 0 ? eq.top : this.FRAME_SIZE * 0.4);
        return Math.min(codeBottom + COPY_GAP, rowInkTop - 16);
    }

    // The y the COPY CODE button is GROUPED at in the type-in feed — just above the box's top
    // row, so it types right after the room code. Its real draw y (copyBtnY) sits a hair lower,
    // on the top row's = ink, which by raw y-sort alone would land it just AFTER that row.
    get copyFeedY() { return this.canvas.height / 2 - this.boxH / 2 - 1; }

    // Char width at the FRAME font — the box is a grid of frame-font cells.
    _frameCW() {
        if (this._cw == null) {
            this.ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
            this._cw = this.ctx.measureText('M').width;
        }
        return this._cw;
    }

    // A character pre-rendered to its own canvas tile, so the hot loop can blit it
    // with drawImage (cheap) instead of re-rasterizing for ~150 chars every frame.
    // The glyph is drawn from its opentype VECTOR path (not canvas fillText), sized
    // and positioned from the reliable glyph bounding box so its ink-box center sits
    // exactly at the tile center — matching the collision circle. Rebuilt on theme.
    _getGlyph(char) {
        if (this._glyphColor !== theme.fg) { this._glyphCache.clear(); this._glyphColor = theme.fg; }
        let g = this._glyphCache.get(char);
        if (g) return g;
        const m = this._getMetrics(char);
        const PAD = 4;
        const w = Math.max(1, Math.ceil(m.width) + 2 * PAD);
        const h = Math.max(1, Math.ceil(m.height) + 2 * PAD);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const g2d = cv.getContext('2d');
        // getPath(char, originX, baselineY, FS): ink center lands at the tile center.
        const path = otFont.getPath(char, w / 2 - m.inkCX, h / 2 + m.inkCY, this.FONT_SIZE);
        path.fill = theme.fg;
        path.draw(g2d);
        g = { canvas: cv, w, h };
        this._glyphCache.set(char, g);
        return g;
    }

    // Same tile as _getGlyph but baked in the glow colour (theme.glowHi) — overlaid on the
    // target during its tap animation. Identical layout/size, so it drops onto the normal tile
    // with no position shift.
    _getGlowGlyph(char) {
        if (this._glowColor !== theme.glowHi) { this._glowCache.clear(); this._glowColor = theme.glowHi; }
        let g = this._glowCache.get(char);
        if (g) return g;
        const m = this._getMetrics(char);
        const PAD = 4;
        const w = Math.max(1, Math.ceil(m.width) + 2 * PAD);
        const h = Math.max(1, Math.ceil(m.height) + 2 * PAD);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const path = otFont.getPath(char, w / 2 - m.inkCX, h / 2 + m.inkCY, this.FONT_SIZE);
        path.fill = theme.glowHi;
        path.draw(cv.getContext('2d'));
        g = { canvas: cv, w, h };
        this._glowCache.set(char, g);
        return g;
    }

    // Outer frame size (used to draw the border and to position the HUD around it).
    get boxW() { return BOX_COLS * this._frameCW(); }
    get boxH() { return BOX_ROWS * this.FRAME_SIZE; }

    // Box center X — left-aligned (not canvas-centered), leaving room on the right for
    // the player list. Used for drawing the box/chars/HUD AND for click hit-testing.
    get boxCenterX() { return BOX_LEFT_MARGIN + this.boxW / 2; }

    // Total frame width in cells (game box + player column), spanning from the box's
    // left margin to a symmetric right margin.
    get _totalCols() {
        const avail = this.canvas.width - 2 * BOX_LEFT_MARGIN;
        return Math.max(BOX_COLS + 2, Math.floor(avail / this._frameCW()));
    }

    // Play area = just inside the frame's actual INK line + PLAY_EDGE_GAP, measured from the real
    // rendered glyphs (NOT the full border cell) so the gap is the same on all four sides. Reserving
    // a whole cell made the top/bottom (cell height) inset double the sides (cell width) — this
    // hugs the thin `=` / `] [` lines instead. [-1,1] maps here; a char's edge (circle radius) then
    // reaches this line. Cached — depends only on the (fixed) font + box.
    _playInset() {
        if (this._playInsetCache) return this._playInsetCache;
        const cw = this._frameCW(), fs = this.FRAME_SIZE;
        const eq = this._inkBounds('=');
        if (eq.bottom < 0) return { w: cw, h: fs };   // font not rendered yet → old inset; don't cache
        const rb = this._inkBounds(']'), lb = this._inkBounds('[');
        // Distance from the box's outer edge to the inner edge of the border ink, + the gap. `max`
        // of the two sides keeps it symmetric around the box center even if a glyph's ink isn't.
        const vInset = Math.max(eq.bottom, fs - eq.top) + PLAY_EDGE_GAP;   // top `=` bottom / bottom `=` top
        const hInset = Math.max(rb.right, cw - lb.left) + PLAY_EDGE_GAP;   // left `]` right / right `[` left
        const res = { w: hInset, h: vInset };
        this._playInsetCache = res;
        return res;
    }
    get playHalfW() { return this.boxW / 2 - this._playInset().w; }
    get playHalfH() { return this.boxH / 2 - this._playInset().h; }

    // Per-char collision radius normalized to the play half-size (pixel radius is the
    // same for everyone since the box is a fixed size). Sent to the server so its
    // wall bounce keeps each glyph's edge off the frame. Computed once from cached
    // opentype metrics — covers printable ASCII, which includes the server's charset.
    charRadii() {
        const phw = this.playHalfW, phh = this.playHalfH;
        const table = {};
        for (let code = 33; code <= 126; code++) {
            const ch = String.fromCharCode(code);
            const r = this._getMetrics(ch).radius;
            table[ch] = { rx: r / phw, ry: r / phh };
        }
        return table;
    }

    // Pre-render every printable-ASCII glyph tile into the atlas, so the first round
    // doesn't hitch as each new character is rasterized from its vector path on first
    // draw (matches the charset covered by charRadii()/the server). Spread across idle
    // callbacks so it never blocks a transition/animation; a single `_prewarming` guard
    // keeps repeat calls (e.g. reconnect) from starting a second loop.
    prewarmGlyphs() {
        if (this._prewarming) return;
        this._prewarming = true;
        let code = 33;
        const run = (deadline) => {
            // With an idle deadline, fill until the slot is nearly spent; on the
            // setTimeout fallback (no deadline) do a small fixed chunk per tick.
            let budget = deadline ? Infinity : 6;
            while (code <= 126 && budget-- > 0 && (!deadline || deadline.timeRemaining() > 3)) {
                this._getGlyph(String.fromCharCode(code++));
            }
            if (code <= 126) schedule();
            else this._prewarming = false;
        };
        const schedule = () => (typeof requestIdleCallback === 'function'
            ? requestIdleCallback(run, { timeout: 2000 })
            : setTimeout(() => run(null), 0));
        schedule();
    }

    // Reliable per-char metrics from the font's actual glyph outline (opentype),
    // NOT canvas measureText().actualBoundingBox, which this bitmap font reports
    // unreliably. Returns the ink box size, its encapsulating-circle radius, and the
    // ink-box center offset from the glyph's draw origin (right of left edge / above
    // baseline) used to center both the rendered tile and the collision circle.
    _getMetrics(char) {
        if (this._metricsCache.has(char)) return this._metricsCache.get(char);
        const scale = this.FONT_SIZE / otFont.unitsPerEm;
        const bbox = otFont.charToGlyph(char).getBoundingBox();
        const width = (bbox.x2 - bbox.x1) * scale;
        const height = (bbox.y2 - bbox.y1) * scale;
        const radius = Math.sqrt(width * width + height * height) / 2;
        const inkCX = (bbox.x1 + bbox.x2) / 2 * scale;
        const inkCY = (bbox.y1 + bbox.y2) / 2 * scale;
        const metrics = { width, height, radius, inkCX, inkCY };
        this._metricsCache.set(char, metrics);
        return metrics;
    }

    _toPixels(nx, ny) {
        return { px: nx * this.playHalfW, py: ny * this.playHalfH };
    }

    _toNormalized(px, py) {
        return { nx: px / this.playHalfW, ny: py / this.playHalfH };
    }

    hitTest(clickX, clickY, chars, posA, posB, t, countdownActive) {
        if (countdownActive) return null;
        const n = Math.min(chars.length, (posA.length / 3) | 0, (posB.length / 3) | 0);
        for (let i = 0; i < n; i++) {
            const c = chars[i];
            if (!c.isTarget) continue;
            // Interpolate to the SAME position the frame drew (posA → posB at t), so a tap
            // lands on where the target visibly is.
            const j = i * 3;
            const ix = posA[j]     + (posB[j]     - posA[j])     * t;
            const iy = posA[j + 1] + (posB[j + 1] - posA[j + 1]) * t;
            // The glyph is drawn ink-centered on its position, so the collision circle
            // shares that center — no ascent/height fudge needed.
            const { px, py } = this._toPixels(ix, iy);
            const m = this._getMetrics(c.char);
            const dist = Math.sqrt((clickX - px) ** 2 + (clickY - py) ** 2);
            if (dist < m.radius + (this.isMobile ? 40 : 20)) {
                return this._toNormalized(clickX, clickY);
            }
        }
        return null;
    }

    draw(state) {
        const {
            chars, posA, posB, charT, targetChar,
            playerList, timeLeft, currentRound, currentMatch, totalMatches, totalRounds,
            showRoundOver, showMatchOver, matchOverData, eliminatedName, lifeCallout,
            showRoundResult, roundResult, roundResultStart,
            countdownActive, countdownStartTime, countdownMs, lastUpdateTime, winnerId
        } = state;

        const ctx = this.ctx;
        const FS = this.FONT_SIZE;
        const cx = this.boxCenterX;            // box is left-aligned
        const cy = this.canvas.height / 2;

        // Stamp when the match-over screen first appears (rising edge) so its animation is timed.
        if (showMatchOver && !this._moShowing) { this._moShowing = true; this._matchOverStart = Date.now(); }
        else if (!showMatchOver) this._moShowing = false;

        // Stamp when game over first appears (rising edge) so the field can brighten in sync with the scrim.
        if (winnerId && !this._winnerShowing) { this._winnerShowing = true; this._winnerStart = Date.now(); }
        else if (!winnerId) this._winnerShowing = false;

        // During the match-over screen the server has already incremented the winner's matchWins, but
        // we hold the player-list count at its OLD value until the winner's name finishes typing —
        // then it ticks up to the new count.
        let heldWinName = null;
        if (showMatchOver && matchOverData) {
            const nm = matchOverData.matchWinnerName || 'Nobody';
            const typeEnd = MO_HOLD_MS + nm.length * MO_TYPE_MS;
            const el = this._matchOverStart != null ? (Date.now() - this._matchOverStart) : 1e9;
            if (el < typeEnd) heldWinName = matchOverData.matchWinnerName;
        }

        // draw the shared frame (game box + player column, continuous top/bottom edges)
        this._drawFrame(ctx, cx, cy);

        // room code — top-left, big (frame font), all caps. The COPY CODE button is a
        // uiManager bracket button parked under it by game.js (copyBtnX/Y).
        ctx.fillStyle = theme.fg;
        ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(this.roomCode, BOX_LEFT_MARGIN, bandTop(this.canvas) + ROOMCODE_TOP);

        // player list persists across the countdown (drawn here, not inside _drawGame). Frequency
        // shows running SCORES; the lives/match-wins list is Redacted's.
        if (this.modeId === 'frequency') this._drawScoreList(ctx, playerList, cx, cy, winnerId);
        else this._drawPlayerList(ctx, playerList, totalMatches, cx, cy, winnerId, heldWinName);

        // Timer is part of the box background — drawn in BOTH the countdown and the live round
        // (during the countdown timeLeft is the full round time, sent in roundCountdown).
        this._drawTimer(ctx, cx, cy, timeLeft, countdownActive);

        if (countdownActive) {
            const isFinalRound = this.modeId === 'frequency' && !!totalRounds && currentRound >= totalRounds;
            this._drawCountdown(ctx, FS, chars, null, targetChar, countdownStartTime, lastUpdateTime, cx, cy, countdownMs, isFinalRound);
        } else {
            this._drawGame(ctx, FS, chars, posA, posB, targetChar, playerList, timeLeft,
                currentRound, currentMatch, totalMatches, totalRounds,
                showRoundOver, showMatchOver, matchOverData, eliminatedName, lifeCallout,
                showRoundResult, roundResult, roundResultStart,
                winnerId, charT, cx, cy);
        }
    }

    // ASCII border frame: `=` top/bottom rows, `]   [` sides — same construction as
    // the lobby preview box, sized BOX_COLS × BOX_ROWS at the game font.
    // The play box and the player column share ONE frame: the = top/bottom edges run
    // continuously across both. The game box keeps its ] (left) and [ (right); the
    // player column is closed on the far right with a ] and has no left border (it
    // opens off the game box).
    // The frame's three row strings + the player column's bracket columns. Shared by the
    // drawn frame and the transition feed that types it in, so the two can't drift.
    _frameStrings() {
        const total = this._totalCols;
        const edgeRow = '='.repeat(total);

        // Top edge: the player section gets symmetric [ ] brackets — one cell in from the
        // section's bounding [ / ], so one = outside each — with spaces between them. The
        // PLAYERS word is NOT placed in the grid; it's drawn separately below, pixel-
        // centered between the brackets, so its margins are equal even when the gap isn't
        // a whole number of characters.
        const topEdge = edgeRow.split('');
        const bracketL = BOX_COLS;     // one cell right of the game box [ (2nd from the left)
        const bracketR = total - 2;    // one cell left of the player ]  (2nd from the right)
        for (let i = bracketL; i <= bracketR; i++) topEdge[i] = ' ';
        topEdge[bracketL] = '[';
        topEdge[bracketR] = ']';

        const mid = new Array(total).fill(' ');
        mid[0] = ']';              // game box left
        mid[BOX_COLS - 1] = '[';   // game box right
        mid[total - 1] = ']';      // player column right (mirrors the game box's side)

        return { edgeRow, topRow: topEdge.join(''), midRow: mid.join(''), bracketL, bracketR };
    }

    // Row segments for the transition feed — the game's STATIC furniture types in like every
    // other screen: the room code (top-left, so it goes first), then the frame row by row, then
    // the timer compartment. Everything that can't be typed — the bouncing characters, the
    // player list, the "Find: X" intro — pops in when the feed lands and the live screen takes
    // over. `timeLeft` sets the typed clock so it matches the live timer that replaces it.
    getTypeables({ timeLeft } = {}) {
        const lh = this.FRAME_SIZE;
        const cw = this._frameCW();
        const cx = this.boxCenterX, cy = this.canvas.height / 2;
        const left = cx - this.boxW / 2;
        const top = cy - this.boxH / 2;
        const font = `${lh}px "IBMVGA"`;
        const { edgeRow, topRow, midRow, bracketL, bracketR } = this._frameStrings();
        const colCenterX = left + (bracketL + 1 + bracketR) / 2 * cw;
        const row = (text, x, y, align) => textRow(text, x, y, font, align || 'left', 'top', theme.fg);

        const out = [];
        if (this.roomCode) out.push(row(this.roomCode, BOX_LEFT_MARGIN, bandTop(this.canvas) + ROOMCODE_TOP));

        for (let i = 0; i < BOX_ROWS; i++) {
            const y = top + i * lh;
            if (i === 0) {
                // The top edge reads left-to-right as ONE sweep: the game-box = edge, the player
                // section's [ , PLAYERS in the gap, its ] , then the trailing =. Split at those
                // x's (same y → one row, ordered by x) so PLAYERS types AS the sweep reaches its
                // gap — not the whole = line finishing first and PLAYERS filling in afterward.
                out.push(row(topRow.slice(0, bracketL), left, y));                        // leading =
                out.push(row('[', left + bracketL * cw, y));
                out.push(row('PLAYERS', colCenterX, y, 'center'));
                out.push(row(']', left + bracketR * cw, y));
                out.push(row(topRow.slice(bracketR + 1), left + (bracketR + 1) * cw, y)); // trailing =
            } else if (i === BOX_ROWS - 1) {
                out.push(row(edgeRow, left, y));   // solid bottom =
            } else {
                // A bracket row is three glyphs in a sea of spaces. Typed as one string it would
                // cost a full row's characters to show three, so feed the glyphs (same y, ordered
                // by x). SPECTATORS rides row 5, appearing mid-sweep at the column's midpoint.
                out.push(row(midRow[0], left, y));
                out.push(row(midRow[BOX_COLS - 1], left + (BOX_COLS - 1) * cw, y));
                out.push(row(midRow[midRow.length - 1], left + (midRow.length - 1) * cw, y));
                if (i === 5) out.push(row('SPECTATORS', colCenterX, y, 'center'));
            }
        }

        // Timer compartment: | clock | on one row, its = underline on the next (the HUD buttons
        // are grouped onto that = row by game.js via hudFeedY, so they type together).
        const tg = this._timerGeom(timeLeft, cx, cy);
        out.push(row('|', tg.fLeft, tg.clockY));
        out.push(row(tg.clock, tg.fLeft + (tg.COMP_COLS / 2) * cw, tg.clockY, 'center'));
        out.push(row('|', tg.fLeft + (tg.COMP_COLS - 1) * cw, tg.clockY));
        out.push(row('='.repeat(tg.COMP_COLS), tg.fLeft, tg.botEqY));

        return out;
    }

    _drawFrame(ctx, cx, cy) {
        const lh = this.FRAME_SIZE;
        const left = cx - this.boxW / 2;       // game box left edge
        const top = cy - this.boxH / 2;
        ctx.fillStyle = theme.fg;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
        const { edgeRow, topRow, midRow, bracketL, bracketR } = this._frameStrings();
        for (let i = 0; i < BOX_ROWS; i++) {
            const row = i === 0 ? topRow : (i === BOX_ROWS - 1 ? edgeRow : midRow);
            ctx.fillText(row, left, top + i * lh);
        }

        // PLAYERS (top edge) and SPECTATORS (the 5th bracket row down) centered in REAL
        // PIXELS on the column's midpoint, so each has equal margins. The 5th row splits
        // the column into a PLAYERS half (above) and a SPECTATORS half (below).
        const cw = this._frameCW();
        const colCenterX = left + (bracketL + 1 + bracketR) / 2 * cw;
        ctx.textAlign = 'center';
        ctx.fillText('PLAYERS', colCenterX, top);
        ctx.fillText('SPECTATORS', colCenterX, top + 5 * lh);
    }

    // Player list — drawn every frame (game AND countdown), so it never flashes out.
    // "NAME....X Lives" dot-leader rows; PLAYERS in the top half, SPECTATORS below the
    // row-5 divider, same spacing. Name hard-left at PLAYER_LIST_GAP past the [; the
    // dots+lives are right-aligned to the SAME inset before the ], so the gaps match.
    _drawPlayerList(ctx, playerList, totalMatches, cx, cy, winnerId, heldWinName = null) {
        const halfW = this.boxW / 2;
        const halfH = this.boxH / 2;
        ctx.textBaseline = 'top';
        ctx.font = `${LIST_FONT_SIZE}px "IBMVGA"`;
        const listX = cx + halfW + PLAYER_LIST_GAP;     // name left edge — PLAYER_LIST_GAP past the [
        const rightEdge = BOX_LEFT_MARGIN + (this._totalCols - 1) * this._frameCW(); // the right ]'s left edge
        const listRightX = rightEdge - PLAYER_LIST_GAP; // lives right edge — same inset as the name's
        const cwList = ctx.measureText('M').width;
        const colChars = Math.max(8, Math.floor((listRightX - listX) / cwList));
        // At game over the game winner (most match wins) is ALWAYS full opacity — even if
        // they didn't find the target or were eliminated (e.g. won on a match-win tiebreak).
        const gameOver = !!winnerId;
        let maxWins = 0;
        if (gameOver) for (const p of playerList) maxWins = Math.max(maxWins, p.matchWins || 0);
        let playerY = cy - halfH + this.FRAME_SIZE + 8;     // below the top edge / PLAYERS title
        let specY = cy - halfH + 6 * this.FRAME_SIZE + 8;   // below the SPECTATORS title (row 5)
        this.rowReveal.sync(playerList.map(p => p.id));
        playerList.forEach(p => {
            ctx.globalAlpha = p.tapped ? 1 : 0.3;
            if (!p.alive) ctx.globalAlpha = 0.1;
            if (gameOver && maxWins > 0 && (p.matchWins || 0) === maxWins) ctx.globalAlpha = 1; // winner
            ctx.fillStyle = theme.fg;
            const disconnectText = !p.connected ? ' ' + disconnectGlyph() : '';
            if (p.lives === null || p.lives === undefined) {
                // Spectator: name + a dot leader to the same right inset as the players' "Lives". A
                // mid-game joiner types the whole row in — name then dots — as one left-to-right sweep.
                const specName = p.name + disconnectText;
                const dots = '.'.repeat(Math.max(1, colChars - specName.length));
                drawRevealSegments(ctx, [
                    { text: specName, x: listX, col: 0 },
                    { text: dots, x: listX + specName.length * cwList, col: specName.length },
                ], this.rowReveal.count(p.id), specY);
                specY += LIST_ROW_H;
            } else {
                // Hold the winner's count one behind until their name finishes typing on the match-over screen.
                const shownWins = p.name === heldWinName ? Math.max(0, (p.matchWins || 0) - 1) : (p.matchWins || 0);
                const winsText = totalMatches > 1 ? ` (${shownWins})` : '';
                const nameStr = this.rowReveal.text(p.id, p.name) + winsText + disconnectText;
                const lifeCount = Math.max(0, p.lives);
                // Eliminated players read "DELETED" instead of "0 Lives" (matches the callout).
                const livesStr = lifeCount <= 0 ? 'DELETED' : `${lifeCount} ${lifeCount === 1 ? 'Life' : 'Lives'}`;
                const dots = Math.max(1, colChars - nameStr.length - livesStr.length);
                ctx.textAlign = 'left';
                ctx.fillText(nameStr + '.'.repeat(dots), listX, playerY);   // dots right after the name
                ctx.textAlign = 'right';
                ctx.fillText(livesStr, listRightX, playerY);
                playerY += LIST_ROW_H;
            }
        });
        ctx.globalAlpha = 1;
    }

    // Frequency player list — same "NAME.....VALUE" dot-leader + PLAYERS/SPECTATORS split as
    // Redacted's, but the right column is the SCORE (nobody has lives / is eliminated). The mode hands
    // this list already sorted high→low and FROZEN to the round-start scores (it does not tick live —
    // scores only move on the round-end scoreboard). Mid-game joiners come through as spectators (name
    // only, below the row-5 divider). At game over the leader(s) stay lit and everyone else dims.
    _drawScoreList(ctx, playerList, cx, cy, winnerId) {
        const halfH = this.boxH / 2;
        ctx.textBaseline = 'top';
        ctx.font = `${LIST_FONT_SIZE}px "IBMVGA"`;
        const listX = cx + this.boxW / 2 + PLAYER_LIST_GAP;
        const rightEdge = BOX_LEFT_MARGIN + (this._totalCols - 1) * this._frameCW();
        const listRightX = rightEdge - PLAYER_LIST_GAP;
        const cwList = ctx.measureText('M').width;   // monospace column width at LIST_FONT
        const colChars = Math.max(8, Math.floor((listRightX - listX) / cwList));
        const gameOver = !!winnerId;
        let maxScore = 0;
        if (gameOver) for (const p of playerList) if (!p.spectator) maxScore = Math.max(maxScore, p.score || 0);
        let playerY = cy - halfH + this.FRAME_SIZE + 8;      // below the PLAYERS title
        let specY = cy - halfH + 6 * this.FRAME_SIZE + 8;    // below the SPECTATORS title (row 5)
        ctx.fillStyle = theme.fg;
        this.rowReveal.sync(playerList.map(p => p.id));
        playerList.forEach(p => {
            const disconnectText = !p.connected ? ' ' + disconnectGlyph() : '';
            if (p.spectator) {
                ctx.globalAlpha = 0.3;
                const specName = p.name + disconnectText;
                const dots = '.'.repeat(Math.max(1, colChars - specName.length));
                drawRevealSegments(ctx, [
                    { text: specName, x: listX, col: 0 },
                    { text: dots, x: listX + specName.length * cwList, col: specName.length },
                ], this.rowReveal.count(p.id), specY);
                specY += LIST_ROW_H;
            } else {
                ctx.globalAlpha = gameOver
                    ? (maxScore > 0 && (p.score || 0) === maxScore ? 1 : 0.4)   // leader(s) lit at game over
                    : (p.tapped ? 1 : 0.3);                                     // dim; lights up when they find the target (like Redacted)
                const nameStr = this.rowReveal.text(p.id, p.name) + disconnectText;
                const scoreStr = String(p.score || 0);
                const dots = Math.max(1, colChars - nameStr.length - scoreStr.length);
                ctx.textAlign = 'left';
                ctx.fillText(nameStr + '.'.repeat(dots), listX, playerY);
                ctx.textAlign = 'right';
                ctx.fillText(scoreStr, listRightX, playerY);
                playerY += LIST_ROW_H;
            }
        });
        ctx.globalAlpha = 1;
    }

    _drawCountdown(ctx, FS, chars, prevChars, targetChar, countdownStartTime, lastUpdateTime, cx, cy, countdownMs, isFinal) {
        // No start time = the screen is up but the server hasn't started the countdown yet (it's
        // waiting out the game's type-in). The furniture above has already drawn; the round intro
        // begins the moment roundCountdown lands. Parking here keeps the LIVE-round layout off
        // screen in the meantime — see game.js's gameStarted handler.
        if (countdownStartTime == null) return;
        const elapsed = (Date.now() - countdownStartTime) / 1000;

        // Typewriter countdown at the frame font. ADAPTIVE: the intro is fixed and the
        // three 3/2/1 digits fill whatever time is left, so it always lands exactly when the
        // server ends the countdown. Tune the total in ONE place: COUNTDOWN_MS (timings.js).
        const T_FIND = 1.0;       // s — "Find: " blinks before the char types
        const LINE1_HOLD = 1.4;   // s — "Find: X" holds on line 1 before the cursor drops
        const PRE_DIGIT = 0.5;    // s — pause on line 2 before "3" types
        const GAP_S = 0.32;       // s — empty beat between a backspace and the next digit
        const BLINK_HALF = 0.5;   // s — cursor on for this long, off for this long (phase resets on each keystroke)

        const T_CHAR = T_FIND;
        const T_NL = T_CHAR + LINE1_HOLD;          // cursor drops to line 2
        const T3 = T_NL + PRE_DIGIT;               // "3" appears
        const total = (countdownMs || 7500) / 1000;
        const SHOW_S = Math.max(0.3, (total - T3 - 2 * GAP_S) / 3);   // 3 shows + 2 gaps fill the rest
        const slot = SHOW_S + GAP_S;
        const T1 = T3 + 2 * slot;                  // "1" appears

        ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = theme.fg;
        const cw = this._frameCW();
        const y1 = cy - this.FRAME_SIZE - 6;       // line 1 top (Find: X)
        const y2 = cy + 6;                         // line 2 top (countdown digit)

        // Final round of a Frequency match: announce it — bigger than the countdown text (but smaller
        // than the game-over winner), vertically centered between the box's top row and the Find: prompt.
        if (isFinal) {
            const FINAL_FONT = 104;
            const midY = ((cy - this.boxH / 2 + this.FRAME_SIZE) + y1) / 2;
            ctx.font = `${FINAL_FONT}px "IBMVGA"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Final Round!', cx, midY);
            ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;   // restore for the rest of the countdown
            ctx.textBaseline = 'top';
        }

        // Cursor blink ANCHORED to the last keystroke — like a real terminal: the instant it
        // types or moves (incl. dropping to the new line) it's solid, then it blinks on/off
        // every BLINK_HALF *from there*, so it's never caught mid-off right after a keystroke.
        // t=0 (the prompt appearing) counts as the first. Same block proportions as the input
        // box / life-loss cursor (cw-2 × FRAME_SIZE-4).
        const keystrokes = [0, T_CHAR, T_NL, T3, T3 + SHOW_S, T3 + slot, T3 + slot + SHOW_S, T1];
        let lastKey = 0;
        for (const k of keystrokes) if (elapsed >= k) lastKey = k;
        const cursorOn = Math.floor((elapsed - lastKey) / BLINK_HALF) % 2 === 0;
        const cursorBlock = (x, lineY) => { if (cursorOn) ctx.fillRect(x, lineY + 2, cw - 2, this.FRAME_SIZE - 4); };

        // Line 1 — "Find: " then the target char once typed (left-aligned, centered as a block).
        ctx.textAlign = 'left';
        const line1 = 'Find: ' + (elapsed >= T_CHAR ? targetChar : '');
        const x0 = cx - ctx.measureText('Find: X').width / 2;
        ctx.fillText(line1, x0, y1);

        if (elapsed < T_NL) {
            cursorBlock(x0 + ctx.measureText(line1).width, y1);   // cursor parked at end of line 1
        } else {
            // Line 2 — type 3, backspace, type 2, backspace, type 1 (stays). The digit sits
            // in a FIXED centered slot; only the cursor moves — right once a digit is typed,
            // back to the slot when it's backspaced (one char typed/deleted in place, so the
            // line never re-centers itself).
            let line2 = '';
            if (elapsed >= T3) {
                const di = Math.min(2, Math.floor((elapsed - T3) / slot));   // 0,1,2 → 3,2,1
                const digit = 3 - di;
                const within = (elapsed - T3) - di * slot;
                line2 = (digit === 1 || within < SHOW_S) ? String(digit) : '';  // 3/2 backspace; 1 stays
            }
            ctx.textAlign = 'left';
            const digitX = cx - cw / 2;                               // single digit centered; position fixed
            ctx.fillText(line2, digitX, y2);
            cursorBlock(digitX + ctx.measureText(line2).width, y2);   // right of the digit, or the empty slot
        }
    }

    // Timer compartment — the MM:SS clock in an 8-cell "| clock |" box attached under the game
    // box's bottom-left, with a matching = line below. Drawn as part of the box background (from
    // draw()) so it's present during the countdown too, not only once the round starts. Dims to a
    // floor; in the final 10s each new second pulses brighter then eases back.
    // Timer compartment geometry — the | clock | box under the game box's bottom-left and its
    // = underline. Shared by _drawTimer and the transition feed (getTypeables) so the typed-in
    // timer lands exactly where the live one draws. 8-cell compartment: | at column 0, | one
    // column past the clock, the clock pixel-centered between them, = underline below.
    _timerGeom(timeLeft, cx, cy) {
        const halfW = this.boxW / 2, halfH = this.boxH / 2;
        const T_GAP = 20;    // vertical gap: box edge → timer, and timer → bottom = line
        const fLeft = cx - halfW;       // game box left edge (column 0, where the ] sits)
        const fTop = cy - halfH;
        const lh = this.FRAME_SIZE;
        const totalSec = Math.max(0, Math.ceil(timeLeft || 0));
        const clock = `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;
        const eqB = this._inkBounds('=');
        const codeB = this._inkBounds('M0');
        const cw = this._frameCW();
        const COMP_COLS = 8;
        const boxEqInkBot = fTop + (BOX_ROWS - 1) * lh + eqB.bottom;   // bottom of box's bottom = ink
        const clockY = boxEqInkBot + T_GAP - codeB.top;               // timer ink T_GAP below it
        const botEqY = clockY + codeB.bottom + T_GAP - eqB.top;       // bottom = ink T_GAP below timer
        return { fLeft, cw, COMP_COLS, clock, clockY, botEqY };
    }

    // The y the game's HUD (settings/fullscreen) is grouped onto in the type-in feed, so it
    // types as ONE row with the timer's = underline instead of popping in after everything.
    hudFeedY(timeLeft) {
        return this._timerGeom(timeLeft, this.boxCenterX, this.canvas.height / 2).botEqY;
    }

    _drawTimer(ctx, cx, cy, timeLeft, countdownActive) {
        const now = Date.now();
        const { fLeft, cw, COMP_COLS, clock, clockY, botEqY } = this._timerGeom(timeLeft, cx, cy);
        ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = theme.fg;
        ctx.fillText('|', fLeft, clockY);                          // left bar (column 0)
        ctx.fillText('|', fLeft + (COMP_COLS - 1) * cw, clockY);   // right bar (one column over)
        // Clock digits: dim normally; in the final 10s they pulse — brighten up over the first
        // slice of the second, then ease back to the dim floor (keyed off the displayed-second
        // change so the peak isn't missed and there's no flash at the 10s boundary).
        const TIMER_DIM = 0.3;    // dim floor — "not too dim"
        const TIMER_RISE = 0.22;  // fraction of the second spent brightening up before the fade
        // Pulse only during the LIVE round's final 10s — NEVER during the countdown (where the timer
        // just sits at the full time). Otherwise a 10s round flashes once as the countdown appears.
        // Skipping the _timerSec update while counting down also lets "10" pulse fresh at round start.
        let alpha = TIMER_DIM;
        if (!countdownActive) {
            const sec = Math.ceil(timeLeft);
            if (sec !== this._timerSec) { this._timerSec = sec; this._timerSecAt = now; }
            const tp = Math.min(1, (now - this._timerSecAt) / 1000);   // 0..1 through the current second
            let pulse = tp < TIMER_RISE
                ? 0.5 - 0.5 * Math.cos(Math.PI * tp / TIMER_RISE)                        // ease up 0→1
                : 0.5 + 0.5 * Math.cos(Math.PI * (tp - TIMER_RISE) / (1 - TIMER_RISE));  // ease down 1→0
            if (sec > 10) pulse = 0;
            alpha = TIMER_DIM + (1 - TIMER_DIM) * pulse;
        }
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.fillText(clock, fLeft + (COMP_COLS / 2) * cw, clockY); // clock centered between the bars
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
        ctx.fillText('='.repeat(COMP_COLS), fLeft, botEqY);
    }

    // Match-over screen: "Match X: " holds, then types the match winner's name (or 'Tie'/'Nobody'),
    // centered on the game box so the line re-centers as it types. Timed off _matchOverStart.
    _drawMatchOver(ctx, cx, cy, data) {
        const t = (this._matchOverStart != null) ? (Date.now() - this._matchOverStart) : 1e9;

        const prefix = `Match ${data.match}: `;
        const name = data.matchWinnerName || 'Nobody';   // winner name, 'Tie', or 'Nobody' (from server)
        const typeStart = MO_HOLD_MS;
        const typeEnd = typeStart + name.length * MO_TYPE_MS;
        let shown = name.length;
        if (t < typeStart) shown = 0;
        else if (t < typeEnd) shown = Math.floor((t - typeStart) / MO_TYPE_MS);
        const text = prefix + name.slice(0, shown);

        // Centered on the box center; the whole line re-centers (drifts) as the name types in.
        ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = theme.fg;
        ctx.fillText(text, cx, cy);

        // Blinking block cursor just past the text — same block dimensions as the other cursors
        // (cw-2 × FRAME_SIZE-4). Solid while the name is typing.
        const cursorOn = (t >= typeStart && t < typeEnd) || (Math.floor(t / MO_CURSOR_MS) % 2 === 0);
        if (cursorOn) {
            const cw = ctx.measureText('M').width;
            const chH = this.FRAME_SIZE - 4;
            const curX = cx + ctx.measureText(text).width / 2 + 2;
            ctx.fillStyle = theme.fg;
            ctx.fillRect(curX, cy - chH / 2, cw - 2, chH);
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    // Frequency round-end screen — styled like the match-over ("Match X: …"): a centered "Round X:"
    // title with the player list stacked underneath (whole block centered on the box), while the field
    // is dimmed and the target pulses (Redacted's round-over treatment). The list shows every player
    // with a dot leader and their PREVIOUS (pre-round) score the whole time. After the title holds, the
    // cursor drops to the centered gap, then SNAPS down the list row by row typing "+points" (this
    // round's gain) to the right of each score. Once it's typed every row and rested (RR_PAUSE_MS), the
    // "+points" clear from ALL rows at once and each score snaps to its new total. Durations come from
    // the shared RR_* constants so the server's between-round wait matches.
    _drawRoundResult(ctx, cx, cy, data, startTime) {
        const rows = [...(data.players || [])].sort((a, b) => (b.total || 0) - (a.total || 0));
        const N = rows.length;
        const t = startTime != null ? (Date.now() - startTime) : 1e9;
        const TITLE_FONT = this.FRAME_SIZE, ROW_FONT = 36, ROW_H = 46, TITLE_GAP = 40;
        const SCORE_COL = 19, PLUS_GAP = 0;   // "name...score" field width (chars); +points butts right up to the score
        const rowsStart = RR_TITLE_MS + RR_GAP_MS;          // per-row stepping begins
        // Each row takes exactly its arrival beat + its own typing time (no shared fixed budget), so the
        // cursor steps at the pace it actually types. rowStarts[i] = when row i begins; [N] = when done.
        const rowStarts = [rowsStart];
        for (let k = 0; k < N; k++) rowStarts.push(rowStarts[k] + rrRowMs(rows[k].gained || 0));
        const rowsEnd = rowStarts[N];                       // all "+points" typed
        const updateAt = rowsEnd + RR_PAUSE_MS;             // "+points" clear and scores snap to new totals
        const beforeUpdate = t < updateAt;
        const blink = Math.floor(t / MO_CURSOR_MS) % 2 === 0;

        const blockH = TITLE_FONT + TITLE_GAP + N * ROW_H;
        const top = cy - blockH / 2;                        // center the whole title+list block
        const listTop = top + TITLE_FONT + TITLE_GAP;
        ctx.fillStyle = theme.fg;
        ctx.textBaseline = 'top';

        // Cursor block = the game's standard size (cw-2 wide × FONT-4 tall), but vertically CENTERED on
        // the glyph ink (measured from caps+digits at the frame font, scaled per size) so it sits ON the
        // text like the input/other screens rather than riding high on the emptier line box.
        const capInk = this._inkBounds('M0');
        const inkMidFr = (capInk.bottom >= 0 ? (capInk.top + capInk.bottom) / 2 : this.FRAME_SIZE * 0.5) / this.FRAME_SIZE;
        const inkTopFr = (capInk.bottom >= 0 ? capInk.top : this.FRAME_SIZE * 0.16) / this.FRAME_SIZE;
        const curY = (drawY, fs) => drawY + inkMidFr * fs - (fs - 4) / 2;   // top of a FONT-4 block centered on the ink

        // Title — "Round X:" then " COMPLETED" TYPES in (match-over style) during the title phase, then
        // holds; it stays "Round X: COMPLETED" (centered) through the rest of the animation. The cursor
        // is solid while typing, blinks once done. This all happens INSIDE the existing RR_TITLE_MS
        // window, so every downstream phase (and the server's total wait) is unchanged.
        ctx.textAlign = 'left';
        ctx.font = `${TITLE_FONT}px "IBMVGA"`;
        const COMPLETE = RR_COMPLETE_TEXT;
        // Beat on "Round X:" (RR_TITLE_HOLD_MS), type " COMPLETED" (RR_COMPLETE_TYPE_MS/char), then beat
        // on "Round X: COMPLETED" until RR_TITLE_MS — then the cursor drops.
        const nComplete = Math.max(0, Math.min(COMPLETE.length, Math.floor((t - RR_TITLE_HOLD_MS) / RR_COMPLETE_TYPE_MS)));
        const title = `Round ${data.round}:` + COMPLETE.slice(0, nComplete);
        const titleW = ctx.measureText(title).width;
        const titleX = cx - titleW / 2;   // re-centers as COMPLETED types in
        ctx.fillText(title, titleX, top);
        if (t < RR_TITLE_MS) {
            const typeEnd = RR_TITLE_HOLD_MS + COMPLETE.length * RR_COMPLETE_TYPE_MS;
            const typing = t >= RR_TITLE_HOLD_MS && t < typeEnd;   // cursor solid while typing, blinks during both beats
            if (typing || blink) {
                const cwT = ctx.measureText('M').width;   // TITLE_FONT cell width
                ctx.fillRect(titleX + titleW + 6, curY(top, TITLE_FONT), cwT - 2, TITLE_FONT - 4);
            }
        }

        // Row layout: "NAME......SCORE" leader centered on the box (score right-aligned in SCORE_COL),
        // with the typed "+points" one gap to its right. The leader stays put, so when "+points" clear
        // the score just changes value in place.
        ctx.font = `${ROW_FONT}px "IBMVGA"`;
        const cw = ctx.measureText('M').width;
        const leaderLeft = cx - (SCORE_COL * cw) / 2;
        const plusX = leaderLeft + (SCORE_COL + PLUS_GAP) * cw;
        const leaderStr = (p, score) => {
            const nm = (p.name || '').slice(0, 12);
            const s = String(score);
            return nm + '.'.repeat(Math.max(2, SCORE_COL - nm.length - s.length)) + s;
        };
        // "+points" on row i: empty until the cursor snaps in AND waits out the arrival beat
        // (RR_ROW_MOVE_MS) — so the drop and the typing read as two separate moves, not one snap — then a
        // char every RR_TYPE_MS. Full once the cursor has stepped on to a later row.
        const shownPlus = (i) => {
            const full = rrPlus(rows[i].gained || 0);
            if (t >= rowStarts[i + 1]) return full;                 // cursor has stepped past this row
            const typeT = t - rowStarts[i] - RR_ROW_MOVE_MS;        // typing starts after the arrival beat
            if (typeT >= 0) return full.slice(0, Math.min(full.length, Math.floor(typeT / RR_TYPE_MS)));
            return '';
        };

        rows.forEach((p, i) => {
            const y = listTop + i * ROW_H;
            const score = beforeUpdate ? ((p.total || 0) - (p.gained || 0)) : (p.total || 0);
            ctx.globalAlpha = p.found ? 1 : 0.5;
            ctx.fillText(leaderStr(p, score), leaderLeft, y);
            if (beforeUpdate) {
                const plus = shownPlus(i);
                if (plus) ctx.fillText(plus, plusX, y);
            }
        });
        ctx.globalAlpha = 1;

        // Cursor — the game's standard cw-2 × FONT-4 block, at the ROW font here. Vertically centered
        // in the VISIBLE gap between the title's ink and the first row, then on the active/last row just
        // right of its "+points" (solid while typing, else blink); after the update it rests just right
        // of the last row's NEW score.
        ctx.fillStyle = theme.fg;
        const rowH = ROW_FONT - 4;
        if (t >= RR_TITLE_MS && t < rowsStart) {
            // Gap cursor — horizontally centered, vertically centered in the VISIBLE gap between the
            // title's measured ink bottom and the first row's ink top.
            if (blink) {
                const ib = this._inkBounds(title);
                const titleInkBottom = top + (ib.bottom >= 0 ? ib.bottom : TITLE_FONT * 0.78);
                const rowInkTop = listTop + inkTopFr * ROW_FONT;
                const gapCenter = (titleInkBottom + rowInkTop) / 2;
                ctx.fillRect(cx - (cw - 2) / 2, gapCenter - rowH / 2, cw - 2, rowH);
            }
        } else if (t >= rowsStart) {
            let i;
            if (!beforeUpdate || t >= rowsEnd) i = N - 1;
            else { i = 0; while (i < N - 1 && t >= rowStarts[i + 1]) i++; }   // the row the cursor is currently on
            const yTop = curY(listTop + i * ROW_H, ROW_FONT);   // same ink-centered line before AND after the update
            let curX, solid;
            if (beforeUpdate) {
                curX = plusX + ctx.measureText(shownPlus(i)).width + 3;   // at the "+points" (or its start during the arrival beat)
                const typeEnd = RR_ROW_MOVE_MS + rrPlus(rows[i].gained || 0).length * RR_TYPE_MS;
                solid = t - rowStarts[i] < typeEnd && t < rowsEnd;   // solid through arrival + typing; blinks while it lingers before stepping on
            } else {
                curX = leaderLeft + ctx.measureText(leaderStr(rows[i], rows[i].total || 0)).width + 4;   // right of the NEW score
                solid = false;
            }
            if (solid || blink) ctx.fillRect(curX, yTop, cw - 2, rowH);
        }
        ctx.textBaseline = 'alphabetic';
    }

    _drawGame(ctx, FS, chars, posA, posB, targetChar, playerList, timeLeft,
              currentRound, currentMatch, totalMatches, totalRounds,
              showRoundOver, showMatchOver, matchOverData, eliminatedName, lifeCallout,
              showRoundResult, roundResult, roundResultStart,
              winnerId, charT, cx, cy) {

        const now = Date.now();
        const t = charT || 0;   // interpolation factor between the two buffered snapshots (from DELMode)
        const halfH = this.boxH / 2;   // frame edge (top/bottom) — the timer that used halfW moved to _drawTimer
        const phw = this.playHalfW;    // play area — character positions
        const phh = this.playHalfH;

        // Draw every character by blitting its pre-rendered tile (drawImage) under a
        // per-char rotation transform. The tile is centered, so drawImage at (-w/2,-h/2)
        // puts the glyph centered on the rotation origin.
        const nChars = Math.min(chars.length, (posA.length / 3) | 0, (posB.length / 3) | 0);
        // Miss glitch: while active, show a random glyph per char, re-rolled every GLITCH_SWAP_MS
        // (all printable-ASCII tiles are prewarmed, so any letter is near-free). Pick from the FULL
        // charset (33-126), NOT the letters on screen — otherwise a confusion round (target + one twin)
        // would scramble into just those two glyphs instead of true noise.
        const glitching = now < this.glitchUntil;
        if (glitching && now - this._glitchSwapAt >= GLITCH_SWAP_MS) {
            this._glitchSwapAt = now;
            for (let i = 0; i < nChars; i++) {
                this._glitchGlyphs[i] = String.fromCharCode(33 + ((Math.random() * 94) | 0));  // any printable ASCII
            }
        }
        // A round/match over dims the field so the life-loss list reads over it. Game over
        // instead uses a full-screen scrim (drawn in game.js), so DON'T pre-dim the characters
        // there — let that scrim dim the whole screen uniformly.
        const roundOverlay = showRoundOver || showMatchOver || showRoundResult;
        const overlayDim = roundOverlay || winnerId;   // any overlay suppresses live tap interaction
        // Game over: brighten the field from the round-over dim up to FULL in step with the scrim fading
        // in (game.js GO_SCRIM_MS), so the whole scene dims uniformly under the scrim instead of the
        // already-dim characters vanishing while brighter elements linger.
        const goAlpha = winnerId
            ? ROUND_OVER_CHAR_DIM + (1 - ROUND_OVER_CHAR_DIM) * Math.min(1, (now - (this._winnerStart || now)) / GO_CHAR_RISE_MS)
            : 1;
        // Target animation: the live press/release glow during play, OR — when a player FOUND the target
        // to end the round — its send-off glow that fades to the round-over dim. The Frequency scoreboard
        // beat reuses the same pulse. At game over the target stops pulsing and brightens with the field.
        let targetAnim = null;
        if (!overlayDim && !glitching) targetAnim = this._targetState(now);
        else if ((showRoundOver || showRoundResult) && !showMatchOver && !glitching && !winnerId) targetAnim = this._roundOverTargetState(now);
        for (let i = 0; i < nChars; i++) {
            const j = i * 3;
            const ix = posA[j]     + (posB[j]     - posA[j])     * t;
            const iy = posA[j + 1] + (posB[j + 1] - posA[j + 1]) * t;
            const rot = posA[j + 2] + (posB[j + 2] - posA[j + 2]) * t;
            const px = ix * phw + cx;
            const py = iy * phh + cy;
            const ch = glitching ? (this._glitchGlyphs[i] || chars[i].char) : chars[i].char;
            const anim = (chars[i].isTarget && targetAnim) ? targetAnim : null;
            const cos = Math.cos(rot), sin = Math.sin(rot);
            ctx.setTransform(cos, sin, -sin, cos, px, py);
            ctx.globalAlpha = anim ? anim.alpha : (winnerId ? goAlpha : (roundOverlay ? ROUND_OVER_CHAR_DIM : 1));
            const g = this._getGlyph(ch);
            ctx.drawImage(g.canvas, -g.w / 2, -g.h / 2);
            if (anim && anim.glow > 0) {                     // glow-colour overlay on the target
                ctx.globalAlpha = anim.glow;
                const gg = this._getGlowGlyph(ch);
                ctx.drawImage(gg.canvas, -gg.w / 2, -gg.h / 2);
            }
        }
        ctx.globalAlpha = 1;

        // reset transform once after all characters
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Find target (TOP) and round / timer (BOTTOM), centered on the whole screen
        // rather than the left-aligned box.
        const screenCx = this.canvas.width / 2;
        ctx.fillStyle = theme.fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        // Find target — big (frame font, like the room code / PLAYERS title). The gap
        // above the box scales with the top margin WITHIN THE BAND (not the raw canvas), so it
        // stays identical between maximized and fullscreen — the extra fullscreen height is
        // margin above the band, not layout space.
        ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
        const findGap = Math.max(10, (cy - halfH - bandTop(this.canvas)) * 0.16);
        ctx.fillText('Find: ' + targetChar, screenCx, cy - halfH - findGap);

        // Round/match — centered just below the box. Under textBaseline:'top' this font
        // leaves blank space ABOVE its ink that the alphabetic-baselined Find up top
        // doesn't have — subtract that measured ink offset so the bottom gap matches the
        // Find's gap (findGap) at every size.
        ctx.textBaseline = 'top';
        const inkTop = Math.max(0, this._inkBounds('M0').top);
        const bottomY = cy + halfH + findGap - inkTop;
        // Redacted has matches (no rounds); the other modes have rounds (no matches).
        const roundLabel = this.modeId === 'redacted'
            ? `Match ${currentMatch}/${totalMatches}`
            : `Round ${currentRound}${totalRounds ? '/' + totalRounds : ''}`;
        ctx.textAlign = 'center';
        ctx.fillText(roundLabel, screenCx, bottomY);

        // Timer is drawn as part of the box background in draw() (via _drawTimer) so it's up during
        // the countdown too, not only once the round starts.

        // overlays
        if (winnerId) {
            // Game over is drawn as a full-screen modal in game.js (a scrim + the winner and vote
            // buttons centered on the whole screen), so nothing is drawn here — this branch only
            // suppresses the match/round overlays below during game over.
        } else if (showMatchOver && matchOverData) {
            this._drawMatchOver(ctx, cx, cy, matchOverData);
        } else if (showRoundResult && roundResult) {
            this._drawRoundResult(ctx, cx, cy, roundResult, roundResultStart);
        } else if (showRoundOver) {
            if (lifeCallout && lifeCallout.entries.length) {
                lifeCallout.draw(ctx, cx, cy, LIFE_LOSS_FONT, Date.now());
            } else if (eliminatedName) {
                ctx.fillStyle = theme.fg;
                ctx.font = '32px "IBMVGA"';
                ctx.textAlign = 'center';
                ctx.fillText(eliminatedName, cx, cy + 10);
            }
        }
    }
}