const TICK_RATE = 50;

export class GameScreen {
    constructor(canvas, ctx, isMobile) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.isMobile = isMobile;
        this.FONT_SIZE = isMobile ? 36 : 32;
    }

    get boxW() { return this.canvas.width - 192; }
    get boxH() { return this.canvas.height - 192; }

    _getMetrics(char) {
        this.ctx.font = `${this.FONT_SIZE}px "IBMVGA"`;
        const m = this.ctx.measureText(char);
        const width = m.width;
        const height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
        const radius = Math.sqrt(width * width + height * height) / 2;
        const ascent = m.actualBoundingBoxAscent;
        return { width, height, radius, ascent };
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
            showRoundOver, showMatchOver, matchOverData, eliminatedName,
            countdownActive, countdownStartTime, lastUpdateTime, winnerId
        } = state;

        const ctx = this.ctx;
        const FS = this.FONT_SIZE;

        ctx.save();
        ctx.translate(this.canvas.width / 2, this.canvas.height / 2);

        ctx.strokeStyle = '#00ff41';
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.boxW / 2, -this.boxH / 2, this.boxW, this.boxH);

        if (countdownActive) {
            this._drawCountdown(ctx, FS, chars, prevChars, targetChar, countdownStartTime, lastUpdateTime);
        } else {
            this._drawGame(ctx, FS, chars, prevChars, targetChar, playerList, timeLeft,
                currentRound, currentMatch, totalMatches,
                showRoundOver, showMatchOver, matchOverData, eliminatedName,
                winnerId, lastUpdateTime);
        }

        ctx.restore();
    }

    _drawCountdown(ctx, FS, chars, prevChars, targetChar, countdownStartTime, lastUpdateTime) {
        const elapsed = (Date.now() - countdownStartTime) / 1000;

        ctx.font = `${FS}px "IBMVGA"`;
        ctx.fillStyle = 'black';
        ctx.globalAlpha = 0;
        chars.forEach((c, i) => {
            const prev = prevChars[i] || c;
            const t = lastUpdateTime ? Math.min((Date.now() - lastUpdateTime) / TICK_RATE, 1) : 0;
            const ix = prev.x + (c.x - prev.x) * t;
            const iy = prev.y + (c.y - prev.y) * t;
            const { px, py } = this._toPixels(ix, iy);
            const m = this._getMetrics(c.char);
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(c.rotation);
            ctx.fillText(c.char, -m.width / 2, m.ascent - m.height / 2);
            ctx.restore();
        });
        ctx.globalAlpha = 1;

        ctx.textAlign = 'center';
        ctx.font = '32px "IBMVGA"';
        ctx.fillStyle = '#00ff41';
        ctx.fillText('Find:', 0, -60);
        ctx.font = '96px "IBMVGA"';
        ctx.fillText(targetChar, 0, 40);

        if (elapsed > 1) {
            const secondsLeft = 3 - Math.floor(elapsed - 1);
            if (secondsLeft > 0) {
                ctx.font = '48px "IBMVGA"';
                ctx.fillText(secondsLeft, 0, 120);
            }
        }
    }

    _drawGame(ctx, FS, chars, prevChars, targetChar, playerList, timeLeft,
              currentRound, currentMatch, totalMatches,
              showRoundOver, showMatchOver, matchOverData, eliminatedName,
              winnerId, lastUpdateTime) {

        const now = Date.now();
        const t = lastUpdateTime ? Math.min((now - lastUpdateTime) / TICK_RATE, 1) : 0;

        ctx.font = `${FS}px "IBMVGA"`;
        ctx.fillStyle = '#00ff41'

        chars.forEach((c, i) => {
            const prev = prevChars[i] || c;
            const ix = prev.x + (c.x - prev.x) * t;
            const iy = prev.y + (c.y - prev.y) * t;
            const { px, py } = this._toPixels(ix, iy);
            const m = this._getMetrics(c.char);
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(c.rotation);
            ctx.fillText(c.char, -m.width / 2, m.ascent - m.height / 2);
            ctx.restore();
        });

        // player list
        ctx.textAlign = 'right';
        ctx.font = '32px "IBMVGA"';
        const listX = this.boxW / 2 - 10;
        let listY = -this.boxH / 2 + 30;
        playerList.forEach(p => {
            ctx.globalAlpha = p.tapped ? 1 : 0.3;
            if (!p.alive) ctx.globalAlpha = 0.1;
            ctx.fillStyle = '#00ff41'
            const winsText = totalMatches > 1 ? ` (${p.matchWins || 0})` : '';
            const disconnectText = !p.connected ? ' %' : '';
            const livesText = p.lives !== null && p.lives !== undefined
                ? ' ' + '♥'.repeat(Math.max(0, p.lives))
                : ': Spectator';
            ctx.fillText(p.name + winsText + livesText + disconnectText, listX, listY);
            listY += 24;
        });
        ctx.globalAlpha = 1;

        // round / timer / target
        ctx.font = '32px "IBMVGA"';
        ctx.fillStyle = '#00ff41'
        ctx.textAlign = 'center';
        if (totalMatches > 1) {
            ctx.fillText(`Match ${currentMatch}/${totalMatches} · Round ${currentRound}`, 0, -this.boxH / 2 - 50);
        } else {
            ctx.fillText('Round ' + currentRound, 0, -this.boxH / 2 - 50);
        }
        ctx.fillText(Math.ceil(timeLeft) + 's', 0, -this.boxH / 2 - 20);
        ctx.fillText('Find: ' + targetChar, 0, this.boxH / 2 + 40);

        // overlays
        if (winnerId) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(-200, -60, 400, 120);
            ctx.fillStyle = '#00ff41';
            ctx.font = '32px "IBMVGA"';
            ctx.fillText('Winner: ' + winnerId, 0, 10);
        } else if (showMatchOver && matchOverData) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(-200, -80, 400, 160);
            ctx.fillStyle = '#00ff41';
            ctx.font = '32px "IBMVGA"';
            ctx.fillText(`Match ${matchOverData.match} Over!`, 0, -40);
            ctx.fillText('Winner: ' + matchOverData.matchWinnerName, 0, 0);
            let scoreY = 30;
            Object.entries(matchOverData.matchWins || {}).forEach(([name, wins]) => {
                ctx.fillText(`${name}: ${wins} win${wins !== 1 ? 's' : ''}`, 0, scoreY);
                scoreY += 24;
            });
        } else if (showRoundOver) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(-200, -60, 400, 120);
            ctx.fillStyle = '#00ff41';
            ctx.font = '32px "IBMVGA"';
            ctx.fillText(eliminatedName, 0, 10);
        }
    }
}