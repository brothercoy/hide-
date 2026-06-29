import { theme } from '../ui/colors.js';
import { otFont } from '../ui/Font.js';

const TICK_RATE = 50;

// Play-box border as a character grid, matching the lobby preview box (= top/bottom,
// ] [ sides) but drawn at the game font. The box is a FIXED BOX_COLS × BOX_ROWS grid
// — tune these two to resize the play field.
const BOX_COLS = 35;
const BOX_ROWS = 10;
const BOX_LEFT_MARGIN = 80;   // box is left-aligned this far from the canvas's left edge
const PLAYER_LIST_GAP = 12;   // gap from the box's right edge ([ ) to the player list
const LIST_FONT_SIZE = 28;    // player-list text
const LIST_ROW_H = 30;        // tight row pitch so ~10 players fit the top half (spectators below)
const ROOMCODE_TOP = 16;      // room code top edge (top-left corner of the screen)
const COPY_GAP = 28;          // COPY CODE button center, px below the room code's ink bottom
                              // (gives a small ~15px visible gap — less than the lobby's)

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
    }

    setRoomCode(code) { this.roomCode = (code || '').toUpperCase(); }

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
        const codeBottom = ROOMCODE_TOP + (code.bottom >= 0 ? code.bottom : this.FRAME_SIZE * 0.78);
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

    hitTest(clickX, clickY, chars, countdownActive) {
        if (countdownActive) return null;
        for (const c of chars) {
            if (!c.isTarget) continue;
            // The glyph is drawn ink-centered on its position, so the collision circle
            // shares that center — no ascent/height fudge needed.
            const { px, py } = this._toPixels(c.x, c.y);
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
            chars, prevChars, targetChar,
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
        ctx.fillText(this.roomCode, BOX_LEFT_MARGIN, ROOMCODE_TOP);

        // player list persists across the countdown (drawn here, not inside _drawGame)
        this._drawPlayerList(ctx, playerList, totalMatches, cx, cy);

        if (countdownActive) {
            this._drawCountdown(ctx, FS, chars, prevChars, targetChar, countdownStartTime, lastUpdateTime, cx, cy, countdownMs);
        } else {
            this._drawGame(ctx, FS, chars, prevChars, targetChar, playerList, timeLeft,
                currentRound, currentMatch, totalMatches,
                showRoundOver, showMatchOver, matchOverData, eliminatedName, lifeCallout,
                winnerId, lastUpdateTime, cx, cy);
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
    _drawPlayerList(ctx, playerList, totalMatches, cx, cy) {
        const halfW = this.boxW / 2;
        const halfH = this.boxH / 2;
        ctx.textBaseline = 'top';
        ctx.font = `${LIST_FONT_SIZE}px "IBMVGA"`;
        const listX = cx + halfW + PLAYER_LIST_GAP;     // name left edge — PLAYER_LIST_GAP past the [
        const rightEdge = BOX_LEFT_MARGIN + (this._totalCols - 1) * this._frameCW(); // the right ]'s left edge
        const listRightX = rightEdge - PLAYER_LIST_GAP; // lives right edge — same inset as the name's
        const cwList = ctx.measureText('M').width;
        const colChars = Math.max(8, Math.floor((listRightX - listX) / cwList));
        let playerY = cy - halfH + this.FRAME_SIZE + 8;     // below the top edge / PLAYERS title
        let specY = cy - halfH + 6 * this.FRAME_SIZE + 8;   // below the SPECTATORS title (row 5)
        playerList.forEach(p => {
            ctx.globalAlpha = p.tapped ? 1 : 0.3;
            if (!p.alive) ctx.globalAlpha = 0.1;
            ctx.fillStyle = theme.fg;
            const winsText = totalMatches > 1 ? ` (${p.matchWins || 0})` : '';
            const disconnectText = !p.connected ? ' %' : '';
            const nameStr = p.name + winsText + disconnectText;
            if (p.lives === null || p.lives === undefined) {
                ctx.textAlign = 'left';
                ctx.fillText(nameStr, listX, specY);
                specY += LIST_ROW_H;
            } else {
                const lifeCount = Math.max(0, p.lives);
                const livesStr = `${lifeCount} ${lifeCount === 1 ? 'Life' : 'Lives'}`;
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
            // Line 2 — type 3, backspace, type 2, backspace, type 1 (stays); CENTERED.
            let line2 = '';
            if (elapsed >= T3) {
                const di = Math.min(2, Math.floor((elapsed - T3) / slot));   // 0,1,2 → 3,2,1
                const digit = 3 - di;
                const within = (elapsed - T3) - di * slot;
                line2 = (digit === 1 || within < SHOW_S) ? String(digit) : '';  // 3/2 backspace; 1 stays
            }
            ctx.textAlign = 'center';
            ctx.fillText(line2, cx, y2);
            cursorBlock(cx + ctx.measureText(line2).width / 2, y2);   // cursor after the centered digit
        }
    }

    _drawGame(ctx, FS, chars, prevChars, targetChar, playerList, timeLeft,
              currentRound, currentMatch, totalMatches,
              showRoundOver, showMatchOver, matchOverData, eliminatedName, lifeCallout,
              winnerId, lastUpdateTime, cx, cy) {

        const now = Date.now();
        const t = lastUpdateTime ? Math.min((now - lastUpdateTime) / TICK_RATE, 1) : 0;
        const halfW = this.boxW / 2;   // frame edge — HUD (player list / header / footer)
        const halfH = this.boxH / 2;
        const phw = this.playHalfW;    // play area — character positions
        const phh = this.playHalfH;

        // Draw every character by blitting its pre-rendered tile (drawImage) under a
        // per-char rotation transform. The tile is centered, so drawImage at (-w/2,-h/2)
        // puts the glyph centered on the rotation origin.
        chars.forEach((c, i) => {
            const prev = prevChars[i] || c;
            const ix = prev.x + (c.x - prev.x) * t;
            const iy = prev.y + (c.y - prev.y) * t;
            const px = ix * phw + cx;
            const py = iy * phh + cy;
            const g = this._getGlyph(c.char);
            const cos = Math.cos(c.rotation);
            const sin = Math.sin(c.rotation);
            ctx.setTransform(cos, sin, -sin, cos, px, py);
            ctx.drawImage(g.canvas, -g.w / 2, -g.h / 2);
        });

        // reset transform once after all characters
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Find target (TOP) and round / timer (BOTTOM), centered on the whole screen
        // rather than the left-aligned box.
        const screenCx = this.canvas.width / 2;
        ctx.fillStyle = theme.fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        // Find target — big (frame font, like the room code / PLAYERS title). The gap
        // above the box scales with the top margin: ~25px at fullscreen, tighter (sits
        // closer to the top row) when the window is just maximized.
        ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
        const findGap = Math.max(10, (cy - halfH) * 0.16);
        ctx.fillText('Find: ' + targetChar, screenCx, cy - halfH - findGap);

        // Round/match — centered just below the box. Under textBaseline:'top' this font
        // leaves blank space ABOVE its ink that the alphabetic-baselined Find up top
        // doesn't have — subtract that measured ink offset so the bottom gap matches the
        // Find's gap (findGap) at every size.
        ctx.textBaseline = 'top';
        const inkTop = Math.max(0, this._inkBounds('M0').top);
        const bottomY = cy + halfH + findGap - inkTop;
        const roundLabel = totalMatches > 1
            ? `Match: ${currentMatch}/${totalMatches} & Round: ${currentRound}`
            : 'Round: ' + currentRound;
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
        ctx.textAlign = 'center';
        ctx.fillText(clock, fLeft + (COMP_COLS / 2) * cw, clockY); // clock centered between the bars
        ctx.textAlign = 'left';
        ctx.fillText('='.repeat(COMP_COLS), fLeft, botEqY);

        // overlays
        if (winnerId) {
            // Winner — big (frame font), centered on the box and sat HIGH in it so it
            // clears the game-over buttons below (which are also box-centered, in game.js).
            const winnerText = 'Winner: ' + winnerId + '!';
            const wy = cy - 100;
            ctx.font = `${this.FRAME_SIZE}px "IBMVGA"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = theme.fg;
            ctx.fillText(winnerText, cx, wy);
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
                lifeCallout.draw(ctx, cx, cy, 32, Date.now());
            } else if (eliminatedName) {
                ctx.fillStyle = theme.fg;
                ctx.font = '32px "IBMVGA"';
                ctx.textAlign = 'center';
                ctx.fillText(eliminatedName, cx, cy + 10);
            }
        }
    }
}