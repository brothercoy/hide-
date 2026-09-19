// The daily level's RESULT page — shown once the day's attempt ends (found, timed out, or walked
// out of). The number, the day's alphabet, the time and misses, a SHARE button that copies the
// pasteable result, and BACK to the main menu (where DAILY now sits dimmed until tomorrow).
import { makeButton, drawButton, buttonRows } from '../ui/Button.js';
import { makeBracketButton, drawBracketButton, bracketButtonRows } from '../ui/BracketButton.js';
import { textRow } from '../ui/Transition.js';
import { theme, dim } from '../ui/colors.js';
import { bandTop } from '../ui/viewport.js';
import { sfx } from '../audio/sfx.js';
import { shareText } from '../solo/daily.js';

const TITLE_FONT = 120;     // DAILY #12
const TITLE_Y = 50;
const LINE_FONT = 54;
const CHAPTER_Y = 230;      // the day's alphabet
const RESULT_Y = 330;       // FOUND IN 7.42S / TIMES UP
const MISSES_Y = 400;       // 2 MISSES
const SHARE_Y = 540;        // } SHARE {
const BACK_Y = 660;
const COPIED_MS = 1500;     // SHARE reads COPIED for this long

export class DailyScreen {
    constructor(canvas, ctx, uiManager, onBack) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ui = uiManager;
        this.onBack = onBack;
        this.result = null;
        this.shareBtn = null;
        this._copiedAt = 0;
    }

    setResult(r) { this.result = r; }

    _lines() {
        const r = this.result;
        if (!r) return { title: 'DAILY', chapter: '', result: '', misses: '' };
        return {
            title: `DAILY #${r.num}`,
            chapter: r.chapter,
            result: r.won ? `FOUND IN ${r.time.toFixed(2)}S` : 'TIMES UP',
            misses: `${r.misses} ${r.misses === 1 ? 'MISS' : 'MISSES'}`,
        };
    }

    _y(offset) { return bandTop(this.canvas) + offset; }

    enter() {
        this.ui.clear();
        const cx = this.canvas.width / 2;
        this.shareBtn = makeBracketButton('SHARE', cx, this._y(SHARE_Y), () => this._share(), {});
        this.ui.buttons.push(this.shareBtn);
        this.ui.buttons.push(makeButton('BACK', cx, this._y(BACK_Y), () => this.onBack(), { blocksInput: true }));
        this._copiedAt = 0;
    }

    relayout() {
        const cx = this.canvas.width / 2;
        for (const b of this.ui.buttons) {
            b.x = cx;
            b.y = b.bracket ? this._y(SHARE_Y) : this._y(BACK_Y);
        }
    }

    // Copy the result to the clipboard. The async clipboard API needs a secure page (https or
    // localhost); a hidden textarea + execCommand is the fallback for anything older.
    _share() {
        if (!this.result) return;
        const text = shareText(this.result, location.origin);
        const done = () => { this._copiedAt = performance.now(); sfx('BTN_CONFIRM'); };
        const fallback = () => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
                done();
            } catch { /* nothing to do — the button just doesn't flip */ }
        };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
        else fallback();
    }

    _shareLabel() {
        return this._copiedAt && performance.now() - this._copiedAt < COPIED_MS ? 'COPIED' : 'SHARE';
    }

    getTypeables() {
        const cx = this.canvas.width / 2;
        const L = this._lines();
        const rows = [
            textRow(L.title, cx, this._y(TITLE_Y), `${TITLE_FONT}px "IBMVGA"`, 'center', 'top', null),
            textRow(L.chapter, cx, this._y(CHAPTER_Y), `${LINE_FONT}px "IBMVGA"`, 'center', 'top', dim(0.66)),
            textRow(L.result, cx, this._y(RESULT_Y), `${LINE_FONT}px "IBMVGA"`, 'center', 'top', null),
            textRow(L.misses, cx, this._y(MISSES_Y), `${LINE_FONT}px "IBMVGA"`, 'center', 'top', null),
        ];
        for (const b of this.ui.buttons) {
            rows.push(...(b.bracket ? bracketButtonRows(b, LINE_FONT) : buttonRows(b, LINE_FONT)));
        }
        return rows;
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;
        const L = this._lines();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = theme.fg;
        ctx.font = `${TITLE_FONT}px "IBMVGA"`;
        ctx.fillText(L.title, cx, this._y(TITLE_Y));
        ctx.font = `${LINE_FONT}px "IBMVGA"`;
        ctx.fillStyle = dim(0.66);
        ctx.fillText(L.chapter, cx, this._y(CHAPTER_Y));
        ctx.fillStyle = theme.fg;
        ctx.fillText(L.result, cx, this._y(RESULT_Y));
        ctx.fillText(L.misses, cx, this._y(MISSES_Y));
        if (this.shareBtn) this.shareBtn.label = this._shareLabel();
        for (const b of this.ui.buttons) {
            if (b.bracket) drawBracketButton(ctx, b, this.ui.elapsed, LINE_FONT);
            else drawButton(ctx, b, this.ui.elapsed, LINE_FONT);
        }
    }
}
