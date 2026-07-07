import { theme } from '../ui/colors.js';
import { otFont } from '../ui/Font.js';
import { bandTop } from '../ui/viewport.js';
import { GLOW_SPEED } from '../ui/Button.js';   // share the buttons'/specials' glow length

const TICK_RATE = 50;

// Play-box border as a character grid, matching the lobby preview box (= top/bottom,
// ] [ sides) but drawn at the game font. The box is a FIXED BOX_COLS × BOX_ROWS grid
// — tune these two to resize the play field.
const BOX_COLS = 35;
const BOX_ROWS = 10;
const BOX_LEFT_MARGIN = 80;   // box is left-aligned this far from the canvas's left edge
const PLAYER_LIST_GAP = 12;   // gap from the box's right edge ([ ) to the player list
const LIST_FONT_SIZE = 28;    // player-list text
const LIFE_LOSS_FONT = 52;    // end-of-round life-loss callout — bigger than list text, below Find:X (76)
const LIST_ROW_H = 30;        // tight row pitch so ~10 players fit the top half (spectators below)
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
        this._targetPressStart = -1;      // when the target was pressed (mousedown on it), or -1 if not held
        this._targetReleaseStart = -1e9;  // when it was released (mouseup) → glow
    }

    setRoomCode(code) { this.roomCode = (code || '').toUpperCase(); }
    setMode(modeId) { this.modeId = modeId || 'redacted'; }

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

    // Actual rendered ink bounds (top/bottom px offsets from a textBaseline:'top' draw y)
    // for a string at the FRAME font — measured, since this bitmap font's metrics and
    // canvas baselines don't line up. Cached once the font is loaded.
    _inkBounds(text) {
        const hit = this._inkCache.get(text);
        if (hit) return hit;
        const fs = this.FRAME_SIZE;
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(fs * text.length) + 4;
        cv.height = Math.ceil(fs * 1.6);
        const g = cv.getContext('2d');
        g.font = `${fs}px "IBMVGA"`;
        g.textBaseline = 'top';
        g.fillStyle = '#fff';
        g.fillText(text, 2, 0);
        const { data } = g.getImageData(0, 0, cv.width, cv.height);
        let top = -1, bottom = -1;
        for (let y = 0; y < cv.height; y++) {
            for (let x = 0; x < cv.width; x++) {
                if (data[(y * cv.width + x) * 4 + 3] > 0) { if (top < 0) top = y; bottom = y; break; }
            }
        }
        const res = { top, bottom };
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

    // Play area = the frame INNER edge (one border cell in). [-1,1] maps here, so a
    // char whose center sits at ±(1 - radius) has its edge exactly on the inner edge
    // of the ] [ / = border — which is how the server bounces them.
    get playHalfW() { return this.boxW / 2 - this._frameCW(); }
    get playHalfH() { return this.boxH / 2 - this.FRAME_SIZE; }

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
            playerList, timeLeft, currentRound, currentMatch, totalMatches,
            showRoundOver, showMatchOver, matchOverData, eliminatedName, lifeCallout,
            countdownActive, countdownStartTime, countdownMs, lastUpdateTime, winnerId
        } = state;

        const ctx = this.ctx;
        const FS = this.FONT_SIZE;
        const cx = this.boxCenterX;            // box is left-aligned
        const cy = this.canvas.height / 2;

        // draw the shared frame (game box + player column, continuous top/bottom edges)
        this._drawFrame(ctx, cx, cy);

        // room code — top-left, big (frame font), all caps. The COPY CODE button is a
        // uiManager bracket button parked under it by game.js (copyBtnX/Y).
        ctx.fillStyle = theme.fg;
        ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(this.roomCode, BOX_LEFT_MARGIN, bandTop(this.canvas) + ROOMCODE_TOP);

        // player list persists across the countdown (drawn here, not inside _drawGame)
        this._drawPlayerList(ctx, playerList, totalMatches, cx, cy, winnerId);

        if (countdownActive) {
            this._drawCountdown(ctx, FS, chars, null, targetChar, countdownStartTime, lastUpdateTime, cx, cy, countdownMs);
        } else {
            this._drawGame(ctx, FS, chars, posA, posB, targetChar, playerList, timeLeft,
                currentRound, currentMatch, totalMatches,
                showRoundOver, showMatchOver, matchOverData, eliminatedName, lifeCallout,
                winnerId, charT, cx, cy);
        }
    }

    // ASCII border frame: `=` top/bottom rows, `]   [` sides — same construction as
    // the lobby preview box, sized BOX_COLS × BOX_ROWS at the game font.
    // The play box and the player column share ONE frame: the = top/bottom edges run
    // continuously across both. The game box keeps its ] (left) and [ (right); the
    // player column is closed on the far right with a ] and has no left border (it
    // opens off the game box).
    _drawFrame(ctx, cx, cy) {
        const lh = this.FRAME_SIZE;
        const left = cx - this.boxW / 2;       // game box left edge
        const top = cy - this.boxH / 2;
        const total = this._totalCols;
        ctx.fillStyle = theme.fg;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
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
        const topRow = topEdge.join('');

        const mid = new Array(total).fill(' ');
        mid[0] = ']';              // game box left
        mid[BOX_COLS - 1] = '[';   // game box right
        mid[total - 1] = ']';      // player column right (mirrors the game box's side)
        const midRow = mid.join('');
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
    _drawPlayerList(ctx, playerList, totalMatches, cx, cy, winnerId) {
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
        playerList.forEach(p => {
            ctx.globalAlpha = p.tapped ? 1 : 0.3;
            if (!p.alive) ctx.globalAlpha = 0.1;
            if (gameOver && maxWins > 0 && (p.matchWins || 0) === maxWins) ctx.globalAlpha = 1; // winner
            ctx.fillStyle = theme.fg;
            const disconnectText = !p.connected ? ' %' : '';
            if (p.lives === null || p.lives === undefined) {
                // Spectator: name only (no lives, no match wins) + a dot leader that ends in
                // the SAME spot the players' "Lives" ends (right-aligned at listRightX).
                const specName = p.name + disconnectText;
                ctx.textAlign = 'left';
                ctx.fillText(specName, listX, specY);
                ctx.textAlign = 'right';
                ctx.fillText('.'.repeat(Math.max(1, colChars - specName.length)), listRightX, specY);
                specY += LIST_ROW_H;
            } else {
                const winsText = totalMatches > 1 ? ` (${p.matchWins || 0})` : '';
                const nameStr = p.name + winsText + disconnectText;
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

    _drawCountdown(ctx, FS, chars, prevChars, targetChar, countdownStartTime, lastUpdateTime, cx, cy, countdownMs) {
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

    _drawGame(ctx, FS, chars, posA, posB, targetChar, playerList, timeLeft,
              currentRound, currentMatch, totalMatches,
              showRoundOver, showMatchOver, matchOverData, eliminatedName, lifeCallout,
              winnerId, charT, cx, cy) {

        const now = Date.now();
        const t = charT || 0;   // interpolation factor between the two buffered snapshots (from DELMode)
        const halfW = this.boxW / 2;   // frame edge — HUD (player list / header / footer)
        const halfH = this.boxH / 2;
        const phw = this.playHalfW;    // play area — character positions
        const phh = this.playHalfH;

        // Draw every character by blitting its pre-rendered tile (drawImage) under a
        // per-char rotation transform. The tile is centered, so drawImage at (-w/2,-h/2)
        // puts the glyph centered on the rotation origin.
        const nChars = Math.min(chars.length, (posA.length / 3) | 0, (posB.length / 3) | 0);
        // Miss glitch: while active, show a random glyph per char, re-rolled every GLITCH_SWAP_MS
        // (same cached tiles — only the chosen letter changes, so it's near-free).
        const glitching = now < this.glitchUntil;
        if (glitching && now - this._glitchSwapAt >= GLITCH_SWAP_MS) {
            this._glitchSwapAt = now;
            for (let i = 0; i < nChars; i++) {
                this._glitchGlyphs[i] = chars[(Math.random() * nChars) | 0].char;  // a letter already on screen
            }
        }
        // A round/match over dims the field so the life-loss list reads over it. Game over
        // instead uses a full-screen scrim (drawn in game.js), so DON'T pre-dim the characters
        // there — let that scrim dim the whole screen uniformly.
        const roundOverlay = showRoundOver || showMatchOver;
        const overlayDim = roundOverlay || winnerId;   // any overlay suppresses tap interaction
        // Target tap press/glow — live play only (not during a glitch or an overlay).
        const tap = (!overlayDim && !glitching) ? this._targetState(now) : null;
        for (let i = 0; i < nChars; i++) {
            const j = i * 3;
            const ix = posA[j]     + (posB[j]     - posA[j])     * t;
            const iy = posA[j + 1] + (posB[j + 1] - posA[j + 1]) * t;
            const rot = posA[j + 2] + (posB[j + 2] - posA[j + 2]) * t;
            const px = ix * phw + cx;
            const py = iy * phh + cy;
            const ch = glitching ? (this._glitchGlyphs[i] || chars[i].char) : chars[i].char;
            const tgt = tap && chars[i].isTarget;
            const cos = Math.cos(rot), sin = Math.sin(rot);
            ctx.setTransform(cos, sin, -sin, cos, px, py);
            ctx.globalAlpha = roundOverlay ? ROUND_OVER_CHAR_DIM : (tgt ? tap.alpha : 1);
            const g = this._getGlyph(ch);
            ctx.drawImage(g.canvas, -g.w / 2, -g.h / 2);
            if (tgt && tap.glow > 0) {                       // glow-colour overlay on the tapped target
                ctx.globalAlpha = tap.glow;
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
            : `Round ${currentRound}`;
        ctx.textAlign = 'center';
        ctx.fillText(roundLabel, screenCx, bottomY);

        // Timer compartment — the MM:SS clock flanked by a single | on each side (in line
        // with the digits), with the game box's bottom = edge above and a matching = line
        // the same small gap (T_GAP) below — a compact attachment on the box's bottom-LEFT.
        const T_GAP = 20;    // vertical gap: box edge → timer, and timer → bottom = line
        const fLeft = cx - halfW;       // game box left edge (column 0, where the ] sits)
        const fTop = cy - halfH;
        const lh = this.FRAME_SIZE;
        const totalSec = Math.max(0, Math.ceil(timeLeft));
        const clock = `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;
        const eqB = this._inkBounds('=');
        const codeB = this._inkBounds('M0');
        ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = theme.fg;
        const boxEqInkBot = fTop + (BOX_ROWS - 1) * lh + eqB.bottom;   // bottom of box's bottom = ink
        const clockY = boxEqInkBot + T_GAP - codeB.top;               // timer ink T_GAP below it
        const botEqY = clockY + codeB.bottom + T_GAP - eqB.top;       // bottom = ink T_GAP below timer
        // 8-cell compartment: | at column 0, | one column past the clock, the clock
        // pixel-centered between them, and a matching 8-wide = line below.
        const cw = this._frameCW();
        const COMP_COLS = 8;
        ctx.fillText('|', fLeft, clockY);                          // left bar (column 0)
        ctx.fillText('|', fLeft + (COMP_COLS - 1) * cw, clockY);   // right bar (one column over)
        // Clock digits: dim normally; in the final 10s they pulse — as each new number
        // appears the opacity smoothly BRIGHTENS up to full over the first slice of the
        // second, then smoothly eases back DOWN to the dim floor over the rest (both
        // directions interpolate — no snap). Keyed off the actual displayed-number change
        // (not raw timeLeft, which the server only steps every 50ms) so the peak isn't
        // missed and there's no flash at the 10s boundary.
        const TIMER_DIM = 0.3;    // dim floor — "not too dim"
        const TIMER_RISE = 0.22;  // fraction of the second spent brightening up before the fade
        const sec = Math.ceil(timeLeft);
        if (sec !== this._timerSec) { this._timerSec = sec; this._timerSecAt = now; }
        const tp = Math.min(1, (now - this._timerSecAt) / 1000);   // 0..1 through the current second
        let pulse = tp < TIMER_RISE
            ? 0.5 - 0.5 * Math.cos(Math.PI * tp / TIMER_RISE)                        // ease up 0→1
            : 0.5 + 0.5 * Math.cos(Math.PI * (tp - TIMER_RISE) / (1 - TIMER_RISE));  // ease down 1→0
        if (sec > 10) pulse = 0;
        ctx.globalAlpha = TIMER_DIM + (1 - TIMER_DIM) * pulse;
        ctx.textAlign = 'center';
        ctx.fillText(clock, fLeft + (COMP_COLS / 2) * cw, clockY); // clock centered between the bars
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
        ctx.fillText('='.repeat(COMP_COLS), fLeft, botEqY);

        // overlays
        if (winnerId) {
            // Game over is drawn as a full-screen modal in game.js (a scrim + the winner and vote
            // buttons centered on the whole screen), so nothing is drawn here — this branch only
            // suppresses the match/round overlays below during game over.
        } else if (showMatchOver && matchOverData) {
            ctx.fillStyle = theme.fg;
            ctx.font = '32px "IBMVGA"';
            ctx.textAlign = 'center';
            ctx.fillText(`Match ${matchOverData.match} Over!`, cx, cy - 40);
            ctx.fillText('Winner: ' + matchOverData.matchWinnerName, cx, cy);
            let scoreY = cy + 30;
            Object.entries(matchOverData.matchWins || {}).forEach(([name, wins]) => {
                ctx.fillText(`${name}: ${wins} win${wins !== 1 ? 's' : ''}`, cx, scoreY);
                scoreY += 24;
            });
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