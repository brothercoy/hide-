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
    // The flag types in still-locked ('?'); startUnlock() (fired once the screen transition has
    // fully landed) then runs the reveal wave — see _drawUnlockAnim.
    beginUnlock(afterChapterId) {
        const idx = FLAGS.findIndex(f => f.id === afterChapterId) + 1;
        this.unlock = (idx > 0 && idx < FLAGS.length && FLAGS[idx].art)
            ? { idx, start: null, ticked: 0, done: false, consumed: false, tick: -1, scr: null }
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

    // The flag's finished interior (art + overlays), CLIPPED to a horizontal slice — the reveal
    // wave draws the settled region with one clip and each crossfading column with its own.
    _drawInteriorSlice(flag, x, top, cw, lh, left, right, alpha) {
        if (right <= left || alpha <= 0) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, right - left, FLAG_H * lh);
        ctx.clip();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.fg;
        ctx.font = `${FLAG_FONT}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const full = flagRows(flag, true, 0, false);
        for (let r = 1; r < FLAG_H - 1; r++) ctx.fillText(full[r], x, top + r * lh);
        if (flag.overlays?.length) this._drawOverlays(flag, x, top, cw, lh, { alpha, color: theme.fg });
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    // The unlock reveal: the box sits locked for a beat after the screen lands, then a column of
    // SCRAMBLING glyphs erupts at the interior's center and rolls outward in both directions.
    // Behind the wave front the static crossfades into the flag's real glyphs, so the country
    // forms out of the noise from the middle out. Runs inside draw() once startUnlock() fired.
    _drawUnlockAnim(flag, x, top, cw, lh) {
        const ctx = this.ctx;
        const u = this.unlock;
        const PRE_MS = 300;      // beat after the screen lands, before the static erupts
        const WAVE_MS = 1150;    // center → past the edges
        const BAND = 1.6;        // columns of pure scramble at the wave front
        const FADE = 1.3;        // columns of scramble→glyph crossfade behind it
        const SWAP_MS = 55;      // scramble re-roll rate (the flicker)
        // The static is NOT on the 5-row character grid: the flags are drawn as free-positioned
        // overlay lines (5–11 per flag, typically ~0.4 cells apart) whose ink reaches BEYOND the
        // nominal interior — they're drawn 'middle'-baselined, so a line at cell y inks from
        // y−0.31 to y+0.25, putting Greece's top stripe above the interior top and Russia's
        // bottom stripe below its floor. The scramble spans that true extent at the same density,
        // filling it top to bottom with the empty regions included.
        const SCR_GAP = 0.4;     // cells between scramble lines
        const INNER_W = FLAG_W - 2, INNER_H = FLAG_H - 2;

        const t = performance.now() - u.start;
        const ix0 = x + cw;               // interior's left edge (past the border column)
        const iy0 = top + lh;             // interior's top row
        const half = INNER_W / 2;
        const centerX = ix0 + half * cw;

        // The opening beat: still locked, exactly as it looked before.
        if (t < PRE_MS) {
            const st = this._flagState(false, null);
            ctx.font = `${FLAG_FONT}px "IBMVGA"`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.globalAlpha = st.alpha;
            ctx.fillStyle = st.color;
            flagRows(flag, false, 0, false).forEach((r, ri) => ctx.fillText(r, x, top + ri * lh));
            ctx.globalAlpha = 1;
            return;
        }

        // The flourish rings once, exactly as the static erupts.
        if (!u.flurried) { u.flurried = true; sfx('CHAPTER_REVEAL'); }

        // Wave front distance from center, in columns. It travels past the edge by the band +
        // fade widths so the outermost columns get to finish settling.
        const travel = half + BAND + FADE;
        const w = Math.min(travel, (t - PRE_MS) / WAVE_MS * travel);

        // Borders: the box itself is already on screen and just brightens — only the interior
        // transforms, so the frame is drawn whole and bright underneath the wave.
        ctx.font = `${FLAG_FONT}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.fg;
        const full = flagRows(flag, true, 0, false);
        ctx.fillText(full[0], x, top);
        ctx.fillText(full[FLAG_H - 1], x, top + (FLAG_H - 1) * lh);
        for (let r = 1; r < FLAG_H - 1; r++) {
            ctx.fillText(full[r][0], x, top + r * lh);
            ctx.fillText(full[r][FLAG_W - 1], x + (FLAG_W - 1) * cw, top + r * lh);
        }

        // Settled core: everything more than BAND+FADE behind the front is simply the flag.
        const settled = Math.max(0, Math.min(half, w - BAND - FADE));
        this._drawInteriorSlice(flag, x, top, cw, lh,
            centerX - settled * cw, centerX + settled * cw, 1);

        // Re-roll the scramble on its own clock so the static flickers independent of frame rate.
        // Scramble line heights, in the SAME coordinate space the overlays use (cells from the
        // interior top, 'middle'-baselined) — from this flag's highest content to its lowest,
        // always covering the full interior so empty bands scramble too.
        if (!u.rows) {
            const ys = (flag.overlays || []).map(o => o.y);
            const lo = Math.min(0, ...ys), hi = Math.max(INNER_H, ...ys);
            const n = Math.max(2, Math.round((hi - lo) / SCR_GAP) + 1);
            u.rows = Array.from({ length: n }, (_, r) => lo + r * (hi - lo) / (n - 1));
        }
        const tick = Math.floor(t / SWAP_MS);
        if (u.tick !== tick) {
            u.tick = tick;
            u.scr = Array.from({ length: INNER_W * u.rows.length },
                () => String.fromCharCode(33 + ((Math.random() * 94) | 0)));
        }

        // Per-column: crossfade the real glyphs in behind the front, static on top of the front.
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (let c = 0; c < INNER_W; c++) {
            const dist = Math.abs(c + 0.5 - half);
            const age = w - dist;                     // how far the wave has passed this column
            if (age < 0 || age >= BAND + FADE) continue;
            const k = age < BAND ? 0 : (age - BAND) / FADE;   // 0 = pure static, 1 = pure glyph
            if (k > 0) {
                this._drawInteriorSlice(flag, x, top, cw, lh,
                    ix0 + c * cw, ix0 + (c + 1) * cw, k);
            }
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = theme.fg;
            ctx.font = `${FLAG_FONT}px "IBMVGA"`;
            ctx.textBaseline = 'middle';   // same baseline as the overlay lines it replaces
            for (let r = 0; r < u.rows.length; r++)
                ctx.fillText(u.scr[r * INNER_W + c], ix0 + c * cw, iy0 + u.rows[r] * lh);
            ctx.textBaseline = 'top';
        }
        ctx.globalAlpha = 1;

        // A tick per column as it locks in — quiet enough to sit under the anthem.
        const lockedCols = Math.floor(settled * 2);
        if (lockedCols > u.ticked) { feedTick(lockedCols - u.ticked, 1); u.ticked = lockedCols; }

        // Wave has run off both edges: the flag is whole, and becomes a real button.
        if (w >= travel) {
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
