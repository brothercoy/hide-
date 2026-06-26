import { theme, bgAlpha } from '../ui/colors.js';
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
            countdownActive, countdownStartTime, lastUpdateTime, winnerId
        } = state;

        const ctx = this.ctx;
        const FS = this.FONT_SIZE;
        const cx = this.boxCenterX;            // box is left-aligned
        const cy = this.canvas.height / 2;

        // draw the shared frame (game box + player column, continuous top/bottom edges)
        this._drawFrame(ctx, cx, cy);

        if (countdownActive) {
            this._drawCountdown(ctx, FS, chars, prevChars, targetChar, countdownStartTime, lastUpdateTime, cx, cy);
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

        // Top edge carries the PLAYERS title centered in the player-column section. The
        // brackets sit one cell in from the section's bounding [ / ] (so one = outside
        // each, symmetric); the word is centered between them (spaces ok).
        const topEdge = edgeRow.split('');
        const word = 'PLAYERS';
        const bracketL = BOX_COLS;     // one cell right of the game box [ (2nd from the left)
        const bracketR = total - 2;    // one cell left of the player ]  (2nd from the right)
        for (let i = bracketL; i <= bracketR; i++) topEdge[i] = ' ';
        topEdge[bracketL] = '[';
        topEdge[bracketR] = ']';
        const innerStart = bracketL + 1;
        const wordStart = innerStart + Math.floor((bracketR - innerStart - word.length) / 2);
        for (let k = 0; k < word.length; k++) topEdge[wordStart + k] = word[k];
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
    }

    _drawCountdown(ctx, FS, chars, prevChars, targetChar, countdownStartTime, lastUpdateTime, cx, cy) {
        const elapsed = (Date.now() - countdownStartTime) / 1000;
        const now = Date.now();
        const t = lastUpdateTime ? Math.min((now - lastUpdateTime) / TICK_RATE, 1) : 0;

        // draw chars invisible (keeps layout stable, skipped entirely since alpha 0 is wasteful)
        // just skip drawing them during countdown — they're hidden anyway

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '32px "IBMVGA"';
        ctx.fillStyle = theme.fg;
        ctx.fillText('Find:', cx, cy - 60);
        ctx.font = '96px "IBMVGA"';
        ctx.fillText(targetChar, cx, cy + 40);

        if (elapsed > 1) {
            const secondsLeft = 3 - Math.floor(elapsed - 1);
            if (secondsLeft > 0) {
                ctx.font = '48px "IBMVGA"';
                ctx.fillText(secondsLeft, cx, cy + 120);
            }
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

        // player list — "NAME....X Lives" dot-leader rows. Name hard-left at PLAYER_LIST_GAP
        // past the [; the dots+lives are right-aligned to the SAME inset before the ], so
        // the left and right gaps match exactly.
        ctx.textBaseline = 'top';
        ctx.font = `${LIST_FONT_SIZE}px "IBMVGA"`;
        const listX = cx + halfW + PLAYER_LIST_GAP;     // name left edge — PLAYER_LIST_GAP past the [
        const rightEdge = BOX_LEFT_MARGIN + (this._totalCols - 1) * this._frameCW(); // the right ]'s left edge
        const listRightX = rightEdge - PLAYER_LIST_GAP; // lives right edge — same inset as the name's
        const cwList = ctx.measureText('M').width;
        const colChars = Math.max(8, Math.floor((listRightX - listX) / cwList));
        let listY = cy - halfH + this.FRAME_SIZE + 8;   // a touch lower so it lines up with the bracket tops
        playerList.forEach(p => {
            ctx.globalAlpha = p.tapped ? 1 : 0.3;
            if (!p.alive) ctx.globalAlpha = 0.1;
            ctx.fillStyle = theme.fg;
            const winsText = totalMatches > 1 ? ` (${p.matchWins || 0})` : '';
            const disconnectText = !p.connected ? ' %' : '';
            const lifeCount = Math.max(0, p.lives);
            const livesStr = p.lives !== null && p.lives !== undefined
                ? `${lifeCount} ${lifeCount === 1 ? 'Life' : 'Lives'}`
                : 'Spectator';
            const nameStr = p.name + winsText + disconnectText;
            const dots = Math.max(1, colChars - nameStr.length - livesStr.length);
            ctx.textAlign = 'left';
            ctx.fillText(nameStr + '.'.repeat(dots), listX, listY);   // dots start right after the name
            ctx.textAlign = 'right';
            ctx.fillText(livesStr, listRightX, listY);
            listY += LIST_ROW_H;
        });
        ctx.globalAlpha = 1;

        // round / timer / target
        ctx.font = '32px "IBMVGA"';
        ctx.fillStyle = theme.fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        if (totalMatches > 1) {
            ctx.fillText(`Match ${currentMatch}/${totalMatches} · Round ${currentRound}`, cx, cy - halfH - 50);
        } else {
            ctx.fillText('Round ' + currentRound, cx, cy - halfH - 50);
        }
        ctx.fillText(Math.ceil(timeLeft) + 's', cx, cy - halfH - 20);
        ctx.fillText('Find: ' + targetChar, cx, cy + halfH + 40);

        // overlays
        if (winnerId) {
            ctx.fillStyle = bgAlpha(0.85);
            ctx.fillRect(cx - 200, cy - 60, 400, 120);
            ctx.fillStyle = theme.fg;
            ctx.font = '32px "IBMVGA"';
            ctx.textAlign = 'center';
            ctx.fillText('Winner: ' + winnerId, cx, cy + 10);
        } else if (showMatchOver && matchOverData) {
            ctx.fillStyle = bgAlpha(0.85);
            ctx.fillRect(cx - 200, cy - 80, 400, 160);
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
                const lineH = lifeCallout.lineHeight(32);
                const boxH = Math.max(120, lifeCallout.entries.length * lineH + 40);
                ctx.fillStyle = bgAlpha(0.85);
                ctx.fillRect(cx - 260, cy - boxH / 2, 520, boxH);
                lifeCallout.draw(ctx, cx, cy, 32, Date.now());
            } else if (eliminatedName) {
                ctx.fillStyle = bgAlpha(0.85);
                ctx.fillRect(cx - 200, cy - 60, 400, 120);
                ctx.fillStyle = theme.fg;
                ctx.font = '32px "IBMVGA"';
                ctx.textAlign = 'center';
                ctx.fillText(eliminatedName, cx, cy + 10);
            }
        }
    }
}