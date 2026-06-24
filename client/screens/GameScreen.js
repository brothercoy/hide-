import { theme, bgAlpha } from '../ui/colors.js';

const TICK_RATE = 50;

export class GameScreen {
    constructor(canvas, ctx, isMobile) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.isMobile = isMobile;
        this.FONT_SIZE = isMobile ? 36 : 32;
        this._metricsCache = new Map();
    }

    get boxW() { return this.canvas.width - 192; }
    get boxH() { return this.canvas.height - 192; }

    _getMetrics(char) {
        if (this._metricsCache.has(char)) return this._metricsCache.get(char);
        this.ctx.font = `${this.FONT_SIZE}px "IBMVGA"`;
        const m = this.ctx.measureText(char);
        const width = m.width;
        const height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
        const radius = Math.sqrt(width * width + height * height) / 2;
        const ascent = m.actualBoundingBoxAscent;
        const metrics = { width, height, radius, ascent };
        this._metricsCache.set(char, metrics);
        return metrics;
    }

    _toPixels(nx, ny) {
        return { px: nx * this.boxW / 2, py: ny * this.boxH / 2 };
    }

    _toNormalized(px, py) {
        return { nx: px / (this.boxW / 2), ny: py / (this.boxH / 2) };
    }

    hitTest(clickX, clickY, chars, countdownActive) {
        if (countdownActive) return null;
        for (const c of chars) {
            if (!c.isTarget) continue;
            const { px, py } = this._toPixels(c.x, c.y);
            const m = this._getMetrics(c.char);
            const centerY = py - m.ascent + m.height / 2;
            const dist = Math.sqrt((clickX - px) ** 2 + (clickY - centerY) ** 2);
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
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        // draw box
        ctx.strokeStyle = theme.fg;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - this.boxW / 2, cy - this.boxH / 2, this.boxW, this.boxH);

        if (countdownActive) {
            this._drawCountdown(ctx, FS, chars, prevChars, targetChar, countdownStartTime, lastUpdateTime, cx, cy);
        } else {
            this._drawGame(ctx, FS, chars, prevChars, targetChar, playerList, timeLeft,
                currentRound, currentMatch, totalMatches,
                showRoundOver, showMatchOver, matchOverData, eliminatedName, lifeCallout,
                winnerId, lastUpdateTime, cx, cy);
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
        const halfW = this.boxW / 2;
        const halfH = this.boxH / 2;

        ctx.font = `${FS}px "IBMVGA"`;
        ctx.fillStyle = theme.fg;
        ctx.textBaseline = 'alphabetic';

        // draw all characters using setTransform instead of save/restore
        chars.forEach((c, i) => {
            const prev = prevChars[i] || c;
            const ix = prev.x + (c.x - prev.x) * t;
            const iy = prev.y + (c.y - prev.y) * t;
            const px = ix * halfW + cx;
            const py = iy * halfH + cy;
            const m = this._getMetrics(c.char);
            const cos = Math.cos(c.rotation);
            const sin = Math.sin(c.rotation);
            ctx.setTransform(cos, sin, -sin, cos, px, py);
            ctx.fillText(c.char, -m.width / 2, m.ascent - m.height / 2);
        });

        // reset transform once after all characters
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // player list
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '32px "IBMVGA"';
        const listX = cx + halfW - 10;
        let listY = cy - halfH + 30;
        playerList.forEach(p => {
            ctx.globalAlpha = p.tapped ? 1 : 0.3;
            if (!p.alive) ctx.globalAlpha = 0.1;
            ctx.fillStyle = theme.fg;
            const winsText = totalMatches > 1 ? ` (${p.matchWins || 0})` : '';
            const disconnectText = !p.connected ? ' %' : '';
            const lifeCount = Math.max(0, p.lives);
            const livesText = p.lives !== null && p.lives !== undefined
                ? ` ${lifeCount} ${lifeCount === 1 ? 'Life' : 'Lives'}`
                : ' Spectator';
            ctx.fillText(p.name + ':' + winsText + livesText + disconnectText, listX, listY);
            listY += 24;
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