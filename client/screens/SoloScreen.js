// Solo (single-player campaign) home. A GRID OF FLAGS (chapters), centered. Each flag is a bordered
// ASCII rectangle; LOCKED flags are dim with a '?', UNLOCKED flags show their country art and act
// EXACTLY like the game's buttons — hover fills the border, holding dims them and swaps the side | for
// } { brackets, and releasing glows before opening that chapter's level page. Flags type in with the
// screen transition.
import { makeButton, zToAlpha } from '../ui/Button.js';
import { theme, disabledColor, glow } from '../ui/colors.js';
import { FLAGS, FLAG_W, FLAG_H, flagRows } from '../solo/flags.js';
import { isChapterUnlocked } from '../solo/progress.js';
import { sfx, feedTick } from '../audio/sfx.js';

const FLAG_FONT = 44;        // flag glyph size
const FLAG_COLS = 3;         // flags per row (grid wraps after this)
const FLAG_GAP = 60;         // horizontal gap between flags
const FLAG_ROW_GAP = 50;     // vertical gap between grid rows

export class SoloScreen {
    constructor(canvas, ctx, uiManager, onSelectChapter) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ui = uiManager;
        this.onSelectChapter = onSelectChapter;
        this.flagButtons = [];   // one uiManager button per UNLOCKED flag (null for locked), by flag index
        this.unlock = null;      // chapter-unlock ceremony: { idx, start, lastN, lastM, done, consumed }
    }

    // Arm the unlock ceremony for the chapter AFTER `afterChapterId` — call BEFORE showScreen('solo').
    // The flag types in still-locked ('?'), then startUnlock() (fired when the screen transition
    // lands) types its art in with teletype ticks, pops its overlays, and rings the BEL.
    beginUnlock(afterChapterId) {
        const idx = FLAGS.findIndex(f => f.id === afterChapterId) + 1;
        this.unlock = (idx > 0 && idx < FLAGS.length && FLAGS[idx].art)
            ? { idx, start: null, lastN: 0, lastM: 0, done: false, consumed: false }
            : null;
    }

    startUnlock() {
        if (this.unlock && !this.unlock.done) this.unlock.start = performance.now();
    }

    // A flag reads as unlocked only once its ceremony (if pending) has finished.
    _isUnlocked(i) {
        if (this.unlock && !this.unlock.done && i === this.unlock.idx) return false;
        return isChapterUnlocked(FLAGS, i);
    }

    enter() {
        this.ui.clear();
        // A pending ceremony survives its own screen entry; any LATER entry clears it.
        if (this.unlock) {
            if (this.unlock.consumed) this.unlock = null;
            else this.unlock.consumed = true;
        }
        // Real uiManager buttons (normal — so onClick fires at the end of the glow, like every button).
        // We don't draw them; we draw the flag using their press/glow state. Rects are set each frame.
        this.flagButtons = FLAGS.map((f, i) =>
            this._isUnlocked(i) ? makeButton('', 0, 0, () => this.onSelectChapter(f, i), { blocksInput: true }) : null);
        this.flagButtons.forEach(b => { if (b) this.ui.buttons.push(b); });
    }

    // Grid positions for every flag — centered both ways. Also parks each unlocked flag's button rect
    // over its bounds so uiManager hit-tests it. Shared by draw() and getTypeables().
    _flagLayout() {
        const ctx = this.ctx;
        ctx.font = `${FLAG_FONT}px "IBMVGA"`;
        const cw = ctx.measureText('M').width;
        const lh = FLAG_FONT;
        const flagW = FLAG_W * cw;
        const flagH = FLAG_H * lh;
        const cols = Math.min(FLAG_COLS, FLAGS.length);
        const numRows = Math.ceil(FLAGS.length / cols);
        const gridW = cols * flagW + (cols - 1) * FLAG_GAP;
        const gridH = numRows * flagH + (numRows - 1) * FLAG_ROW_GAP;
        const startX = this.canvas.width / 2 - gridW / 2;
        const top0 = this.canvas.height / 2 - gridH / 2;
        const placed = FLAGS.map((f, i) => {
            const col = i % cols, r = Math.floor(i / cols);
            const x = startX + col * (flagW + FLAG_GAP), top = top0 + r * (flagH + FLAG_ROW_GAP);
            const btn = this.flagButtons[i];
            if (btn) btn.rect = { x, y: top, w: flagW, h: flagH };
            return { flag: f, unlocked: this._isUnlocked(i), x, top, btn };
        });
        return { placed, lh, cw };
    }

    // The unlock ceremony frame: bright borders, the art TYPING in char-by-char with teletype
    // ticks, then overlays popping one by one, then the BEL — and only then the flag becomes a
    // button. Runs inside draw() once startUnlock() has fired.
    _drawUnlockAnim(flag, x, top, cw, lh) {
        const ctx = this.ctx;
        const u = this.unlock;
        const CHAR_MS = 12;     // art reveal speed (per interior character)
        const OV_MS = 130;      // per overlay pop
        const INNER_W = FLAG_W - 2, INNER_H = FLAG_H - 2;
        const totalArt = INNER_W * INNER_H;
        const elapsed = performance.now() - u.start;
        const n = Math.min(totalArt, Math.floor(elapsed / CHAR_MS));
        if (n > u.lastN) { feedTick(n - u.lastN, 2); u.lastN = n; }

        ctx.font = `${FLAG_FONT}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.fg;
        const full = flagRows(flag, true, 0, false);
        ctx.fillText(full[0], x, top);                                  // top border
        ctx.fillText(full[FLAG_H - 1], x, top + (FLAG_H - 1) * lh);     // bottom border
        for (let r = 0; r < INNER_H; r++) {
            const vis = Math.max(0, Math.min(INNER_W, n - r * INNER_W));
            const row = '|' + full[r + 1].slice(1, 1 + vis) + (vis === INNER_W ? '|' : '');
            ctx.fillText(row, x, top + (r + 1) * lh);
        }

        const ovCount = flag.overlays?.length || 0;
        let m = 0;
        if (n >= totalArt) {
            m = Math.min(ovCount, Math.floor((elapsed - totalArt * CHAR_MS) / OV_MS));
            if (m > u.lastM) { feedTick(m - u.lastM, 1); u.lastM = m; }
            if (m > 0) this._drawOverlays(flag, x, top, cw, lh, { alpha: 1, color: theme.fg }, m);
        }

        // Ceremony complete: BEL, and the flag becomes a real button.
        if (n >= totalArt && m >= ovCount) {
            u.done = true;
            sfx('BEL');
            const i = u.idx;
            const btn = makeButton('', 0, 0, () => this.onSelectChapter(FLAGS[i], i), { blocksInput: true });
            this.flagButtons[i] = btn;
            this.ui.buttons.push(btn);
        }
    }

    // Freeform overlay glyphs (flag.overlays) — drawn on top of the grid art at fractional cell
    // positions with per-glyph size (see flags.js). First `n` only, so the type-in can pop them
    // one by one after the flag's rows. Resets font/align state for the caller's grid drawing.
    _drawOverlays(flag, x, top, cw, lh, st, n = Infinity) {
        const ctx = this.ctx;
        const list = flag.overlays || [];
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = st.alpha;
        ctx.fillStyle = st.color;
        for (let i = 0; i < Math.min(n, list.length); i++) {
            const o = list[i];
            ctx.font = `${Math.round(FLAG_FONT * (o.s || 1))}px "IBMVGA"`;
            ctx.fillText(o.ch, x + cw + o.x * cw, top + lh + o.y * lh);
        }
        ctx.font = `${FLAG_FONT}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = 1;
    }

    // Live render state for a flag from its button lifecycle — alpha (z→dim on press), colour (glow on
    // release), border-hover fill, and pressed brackets. Shared by draw() AND the type-in feed, so the
    // flag animates the same while it scrolls in as it does at rest (matching how buttons behave).
    _flagState(unlocked, btn) {
        if (!unlocked) return { alpha: 1, color: disabledColor(), hover: 0, pressed: false };
        if (!btn) return { alpha: 1, color: theme.fg, hover: 0, pressed: false };
        const hover = btn.hoverProgress || 0;
        const pressed = !!btn._isPressed;
        const phase = btn.releasePhase;
        const active = pressed || phase === 'releasing' || phase === 'glowing';
        let color = theme.fg;
        if (phase === 'glowing' && btn.glowT > 0) {
            const g = btn.glowT < 0.5 ? btn.glowT * 2 : (1 - btn.glowT) * 2;
            color = glow(g);
        }
        return { alpha: active ? zToAlpha(btn.z) : 1, color, hover, pressed };
    }

    // One typeable per flag row (grouped by Y so flags in a grid row type together). Each draw reads the
    // LIVE flag state, so hovering/pressing during the scroll-in animates just like it does at rest.
    getTypeables() {
        const { placed, lh, cw } = this._flagLayout();
        const font = `${FLAG_FONT}px "IBMVGA"`;
        const rows = [];
        for (const { flag, unlocked, x, top, btn } of placed) {
            for (let i = 0; i < FLAG_H; i++) {
                const y = top + i * lh;
                rows.push({
                    y, x, cost: FLAG_W,
                    draw: (ctx, n) => {
                        if (n <= 0) return;
                        const st = this._flagState(unlocked, btn);
                        ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                        ctx.globalAlpha = st.alpha; ctx.fillStyle = st.color;
                        ctx.fillText(flagRows(flag, unlocked, st.hover, st.pressed)[i].slice(0, n), x, y);
                        ctx.globalAlpha = 1;
                    },
                });
            }
            // Each overlay glyph is its own typeable AT ITS OWN HEIGHT, so it types in with the
            // rows as the scan passes it instead of popping in after the flag.
            if (unlocked && flag.overlays?.length) {
                flag.overlays.forEach((o) => {
                    rows.push({
                        y: top + lh + o.y * lh, x: x + cw + o.x * cw, cost: 1,
                        draw: (ctx, n) => {
                            if (n <= 0) return;
                            const st = this._flagState(unlocked, btn);
                            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                            ctx.globalAlpha = st.alpha; ctx.fillStyle = st.color;
                            ctx.font = `${Math.round(FLAG_FONT * (o.s || 1))}px "IBMVGA"`;
                            ctx.fillText(o.ch, x + cw + o.x * cw, top + lh + o.y * lh);
                            ctx.globalAlpha = 1;
                        },
                    });
                });
            }
        }
        return rows;
    }

    draw() {
        const ctx = this.ctx;
        const { placed, lh, cw } = this._flagLayout();
        ctx.font = `${FLAG_FONT}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (let i = 0; i < placed.length; i++) {
            const { flag, unlocked, x, top, btn } = placed[i];
            // The flag mid-ceremony draws its own reveal instead of the standard states.
            if (this.unlock && !this.unlock.done && i === this.unlock.idx && this.unlock.start != null) {
                this._drawUnlockAnim(flag, x, top, cw, lh);
                continue;
            }
            const st = this._flagState(unlocked, btn);
            ctx.globalAlpha = st.alpha;
            ctx.fillStyle = st.color;
            flagRows(flag, unlocked, st.hover, st.pressed).forEach((r, ri) => ctx.fillText(r, x, top + ri * lh));
            if (unlocked && flag.overlays?.length) this._drawOverlays(flag, x, top, cw, lh, st);
        }
        ctx.globalAlpha = 1;
    }
}
