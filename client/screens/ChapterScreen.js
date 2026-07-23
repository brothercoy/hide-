// A chapter's level page — reached by selecting a flag on the SOLO screen. Shows the chapter title
// (the flag's country) and a grid of numbered LEVEL buttons; selecting one launches that solo level.
// BACK returns to the flag grid. (Per-level lock/complete states come later; all levels are open now.)
import { makeButton, drawButton, buttonRows } from '../ui/Button.js';
import { textRow } from '../ui/Transition.js';
import { theme } from '../ui/colors.js';
import { bandTop } from '../ui/viewport.js';

export const LEVELS = 12;

const TITLE_SIZE = 160;      // chapter (country) title
const TITLE_Y = 50;
const LEVEL_FONT = 54;       // level-button font
const LEVEL_COLS = 4;
const LEVEL_GAP_X = 250;     // between level-button centers
const LEVEL_GAP_Y = 185;
const GRID_TOP = 280;        // first level row top
const BACK_GAP = 0;        // BACK below the grid (lower)

export class ChapterScreen {
    constructor(canvas, ctx, uiManager, onSelectLevel, onBack) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ui = uiManager;
        this.onSelectLevel = onSelectLevel;
        this.onBack = onBack;
        this.chapter = null;
        this.chapterIdx = 0;
    }

    setChapter(flag, idx) { this.chapter = flag; this.chapterIdx = idx; }

    _layout() {
        const cx = this.canvas.width / 2;
        const rows = Math.ceil(LEVELS / LEVEL_COLS);
        const gridW = (LEVEL_COLS - 1) * LEVEL_GAP_X;
        const startX = cx - gridW / 2;
        const top = bandTop(this.canvas) + GRID_TOP;
        const levelPos = [];
        for (let i = 0; i < LEVELS; i++) {
            const c = i % LEVEL_COLS, r = Math.floor(i / LEVEL_COLS);
            levelPos.push({ x: startX + c * LEVEL_GAP_X, y: top + r * LEVEL_GAP_Y });
        }
        return { levelPos, backY: top + rows * LEVEL_GAP_Y + BACK_GAP };
    }

    enter() {
        this.ui.clear();
        const L = this._layout();
        for (let i = 0; i < LEVELS; i++) {
            this.ui.buttons.push(makeButton(String(i + 1), L.levelPos[i].x, L.levelPos[i].y,
                () => this.onSelectLevel(this.chapterIdx, i), { blocksInput: true }));
        }
        this.ui.buttons.push(makeButton('BACK', this.canvas.width / 2, L.backY, () => this.onBack(), { blocksInput: true }));
    }

    relayout() {
        const L = this._layout();
        const cx = this.canvas.width / 2;
        let li = 0;
        for (const b of this.ui.buttons) {
            if (b.label === 'BACK') { b.x = cx; b.y = L.backY; }
            else { b.x = L.levelPos[li].x; b.y = L.levelPos[li].y; li++; }
        }
    }

    getTypeables() {
        const cx = this.canvas.width / 2;
        const rows = [textRow(this.chapter ? this.chapter.name : '', cx, bandTop(this.canvas) + TITLE_Y,
            `${TITLE_SIZE}px "IBMVGA"`, 'center', 'top', null)];
        for (const b of this.ui.buttons) rows.push(...buttonRows(b, LEVEL_FONT));
        return rows;
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;
        ctx.fillStyle = theme.fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `${TITLE_SIZE}px "IBMVGA"`;
        ctx.fillText(this.chapter ? this.chapter.name : '', cx, bandTop(this.canvas) + TITLE_Y);
        this.ui.buttons.forEach(b => drawButton(ctx, b, this.ui.elapsed, LEVEL_FONT));
    }
}
