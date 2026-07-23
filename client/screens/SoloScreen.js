// Solo (single-player campaign) home. A GRID OF FLAGS (chapters), centered. Each flag is a bordered
// ASCII rectangle; LOCKED flags are dim with a '?', UNLOCKED flags show their country art and act
// EXACTLY like the game's buttons — hover fills the border, holding dims them and swaps the side | for
// } { brackets, and releasing glows before opening that chapter's level page. Flags type in with the
// screen transition.
import { makeButton, zToAlpha } from '../ui/Button.js';
import { theme, disabledColor, glow } from '../ui/colors.js';
import { getPref } from '../prefs.js';
import { FLAGS, FLAG_W, FLAG_H, flagRows } from '../solo/flags.js';

const FLAG_FONT = 44;        // flag glyph size
const FLAG_COLS = 3;         // flags per row (grid wraps after this)
const FLAG_GAP = 60;         // horizontal gap between flags
const FLAG_ROW_GAP = 50;     // vertical gap between grid rows

const PREF_UNLOCKED = 'campaign.unlocked';
const DEFAULT_UNLOCKED = 1;

export class SoloScreen {
    constructor(canvas, ctx, uiManager, onSelectChapter) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ui = uiManager;
        this.onSelectChapter = onSelectChapter;
        this.flagButtons = [];   // one uiManager button per UNLOCKED flag (null for locked), by flag index
    }

    _unlockedCount() { return getPref(PREF_UNLOCKED, DEFAULT_UNLOCKED); }

    enter() {
        this.ui.clear();
        const unlocked = this._unlockedCount();
        // Real uiManager buttons (normal — so onClick fires at the end of the glow, like every button).
        // We don't draw them; we draw the flag using their press/glow state. Rects are set each frame.
        this.flagButtons = FLAGS.map((f, i) =>
            i < unlocked ? makeButton('', 0, 0, () => this.onSelectChapter(f, i), { blocksInput: true }) : null);
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
        const unlocked = this._unlockedCount();
        const placed = FLAGS.map((f, i) => {
            const col = i % cols, r = Math.floor(i / cols);
            const x = startX + col * (flagW + FLAG_GAP), top = top0 + r * (flagH + FLAG_ROW_GAP);
            const btn = this.flagButtons[i];
            if (btn) btn.rect = { x, y: top, w: flagW, h: flagH };
            return { flag: f, unlocked: i < unlocked, x, top, btn };
        });
        return { placed, lh };
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
        const { placed, lh } = this._flagLayout();
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
        }
        return rows;
    }

    draw() {
        const ctx = this.ctx;
        const { placed, lh } = this._flagLayout();
        ctx.font = `${FLAG_FONT}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (const { flag, unlocked, x, top, btn } of placed) {
            const st = this._flagState(unlocked, btn);
            ctx.globalAlpha = st.alpha;
            ctx.fillStyle = st.color;
            flagRows(flag, unlocked, st.hover, st.pressed).forEach((r, i) => ctx.fillText(r, x, top + i * lh));
        }
        ctx.globalAlpha = 1;
    }
}
