import { makeButton, drawButton, buttonRows } from '../ui/Button.js';
import { makeSlider, drawSlider, sliderRows } from '../ui/Slider.js';
import { makeBracketButton, drawBracketButton, bracketButtonRows, BRACKET_REST } from '../ui/BracketButton.js';
import { textRow } from '../ui/Transition.js';
import { GAME_MODES } from '../../gameModes.js';
import { theme, dim } from '../ui/colors.js';

const FONT_SIZE = 28;
const TITLE_FONT = 96;   // big room code
const LIST_FONT = 28;
const HEADER_FONT = 24;  // column title + ~~~~ underline (GAME MODE / PLAYER LIST)
const LABEL_FONT = 24;
const DESC_FONT = 24;

// --- Layout (tweak these) ---
const ROOMCODE_Y = 20;       // big room code top edge
const COPY_Y = 150;          // COPY CODE bracket button center
const COL_OFFSET = 600;      // left/right column distance from screen center (cap)
const COL_TOP = 240;         // top of the three columns
const TITLE_GAP = 30;        // underline below a column title
const MODE_GAP = 70;         // gap from underline to first mode button
const MODE_SPACING = 90;     // between mode buttons / CUSTOM
const PREVIEW_W = 35;        // preview box width in chars
const PREVIEW_H = 10;        // preview box height in rows (a touch taller than the true
                            // play-box ratio — reads better in the lobby)
const SETTING_SLIDER_GAP = 78;
const SETTING_OPTION_GAP = 95;
const ACTION_GAP = 40;         // START GAME below the settings editor (CUSTOM)
const PREVIEW_ACTION_GAP = 70; // START GAME below the preview box (sits lower — gap under it)
const ACTION_SPACING = 90;   // MAIN MENU below START GAME
const PLAYER_GAP = 70;       // first player row below the underline (= MODE_GAP, so the
                             // first player lines up with the first mode button's label)
const PLAYER_ROW_H = 32;
const UNDERLINE_W = 360;     // px width of a column header rule (~ spans the column)


export class LobbyScreen {
    constructor(canvas, ctx, uiManager, onUpdateSettings, onMakeHost, onStart, onMainMenu, onModal) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ui = uiManager;
        this.onUpdateSettings = onUpdateSettings;
        this.onMakeHost = onMakeHost;
        this.onStart = onStart;
        this.onMainMenu = onMainMenu;
        this.onModal = onModal;

        this.roomCode = '';
        this.players = [];
        this.modeId = null;
        this.settings = {};
        this.isHost = false;
        this.customOpen = false;
        this.customToggledAt = null;  // elapsed time CUSTOM was last toggled (either way)

        this.dirty = false;
        this.texts = [];
        this.copyBtn = null;
        this.previewBox = null;
        this.playerLayout = { listX: 0, startY: 0, rowH: PLAYER_ROW_H, rowW: 360 };
    }

    enter() {
        this.dirty = false;
        // Host enters fresh: preview shown, settings back to the mode defaults (so
        // e.g. returning from a game doesn't keep the last game's CUSTOM values). A
        // joining non-host instead mirrors the host via applyRemoteSettings, so we
        // leave theirs alone.
        if (this.isHost) {
            this.customOpen = false;
            this._resetSettingsToDefault();
            if (this.modeId) this.onUpdateSettings(this.modeId, { ...this.settings }, this.customOpen);
        }
        this.rebuild();
    }

    // --- setters from game.js (server-driven) ---
    setRoomCode(code) { this.roomCode = code; }            // drawn live, no rebuild
    setPlayers(players) { this.players = players; this.dirty = true; }
    setHost(isHost) { if (this.isHost !== isHost) { this.isHost = isHost; this.dirty = true; } }

    applyRemoteSettings(mode, settings, customOpen) {
        this.modeId = mode;
        this.settings = { ...settings };
        if (customOpen !== undefined) this.customOpen = customOpen; // mirror the host's CUSTOM view
        this.dirty = true;
    }

    // --- internal control actions ---
    _resetSettingsToDefault() {
        const mode = GAME_MODES[this.modeId];
        if (!mode) return;
        this.settings = {};
        Object.entries(mode.settingsOptions).forEach(([k, s]) => { this.settings[k] = s.default; });
    }

    selectMode(modeId) {
        if (!this.isHost || this.modeId === modeId) return;
        this.modeId = modeId;
        this._resetSettingsToDefault();
        // Update the live buttons' selected state immediately so it shows even
        // mid-typeout (the full rebuild — description/preview — waits for dirty).
        for (const b of this.ui.buttons) if (b._modeId) b.active = b._modeId === modeId;
        this.dirty = true;
        this.onUpdateSettings(this.modeId, { ...this.settings }, this.customOpen);
    }

    _toggleCustom() {
        if (!this.modeId) { this.onModal('?INVALID GAME MODE'); return; }   // need a mode selected to customize its settings
        this.customOpen = !this.customOpen;
        this.customToggledAt = this.ui.elapsed;  // start the hover-anim pause (on or off)
        if (this.customBtn) this.customBtn.active = this.customOpen; // reflect on the live button (the editor swap waits for dirty)
        if (!this.customOpen) this._resetSettingsToDefault(); // deselecting CUSTOM reverts to default settings
        this.onUpdateSettings(this.modeId, { ...this.settings }, this.customOpen); // sync the CUSTOM view + values to non-hosts
        this.dirty = true;
    }

    _sliderChange(key, v) {
        this.settings[key] = v;
        this.onUpdateSettings(this.modeId, { ...this.settings }, this.customOpen);   // no rebuild during drag
    }

    _optionChange(key, v) {
        if (this.settings[key] === v) return;   // already selected — no toggle-off / no-op
        this.settings[key] = v;
        this.dirty = true;                                          // discrete -> rebuild next frame
        this.onUpdateSettings(this.modeId, { ...this.settings }, this.customOpen);
    }

    _copyCode() {
        if (!navigator.clipboard || !this.roomCode) return;
        navigator.clipboard.writeText(this.roomCode).then(() => {
            const btn = this.copyBtn;
            if (!btn) return;
            btn.label = 'COPIED!';
            btn.active = true; // hold the brackets inner while showing COPIED!
            setTimeout(() => {
                if (btn.label === 'COPIED!') { btn.label = 'COPY CODE'; btn.active = false; }
            }, 1500);
        }).catch(() => {});
    }

    _wrap(text, maxWidth, font) {
        this.ctx.font = font;
        const words = text.split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
            const test = line ? line + ' ' + w : w;
            if (this.ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
            else line = test;
        }
        if (line) lines.push(line);
        return lines;
    }

    _title(text, x, y) {
        this.texts.push({ text, x, y, align: 'center', font: HEADER_FONT, color: theme.fg });
        // Column-header rule: stretch the tildes across the column width.
        this.ctx.font = `${HEADER_FONT}px "IBMVGA"`;
        const count = Math.max(text.length, Math.round(UNDERLINE_W / this.ctx.measureText('~').width));
        this.texts.push({ text: '~'.repeat(count), x, y: y + TITLE_GAP, align: 'center', font: HEADER_FONT, color: theme.fg });
    }

    rebuild() {
        // Preserve in-flight button animation (glow/press/hover) across the rebuild,
        // keyed by label, so a freshly-selected mode button keeps glowing in the
        // background instead of being reset by the recreation.
        const prevAnim = {};
        for (const b of this.ui.buttons) {
            if (b.label == null) continue;
            prevAnim[b.label] = {
                releasePhase: b.releasePhase, glowT: b.glowT, z: b.z,
                charZ: b.charZ, charRot: b.charRot, charPhases: b.charPhases,
                hoverProgress: b.hoverProgress, _over: b._over, _flashStart: b._flashStart,
            };
        }

        this.ui.clear();
        this.texts = [];

        const cx = this.canvas.width / 2;
        const W = this.canvas.width;
        const off = Math.min(W * 0.375, COL_OFFSET); // ~200px from each edge on a 1600 canvas
        const leftX = cx - off;
        const rightX = cx + off;

        // --- HEADER: COPY CODE bracket button (room code is drawn live) ---
        this.copyBtn = makeBracketButton('COPY CODE', cx, COPY_Y, () => this._copyCode(), { hitPad: 30 });
        this.ui.buttons.push(this.copyBtn);

        // --- LEFT COLUMN: GAME MODE ---
        this._title('GAME MODE', leftX, COL_TOP);
        let ly = COL_TOP + TITLE_GAP + MODE_GAP;
        Object.values(GAME_MODES).forEach((mode) => {
            const b = makeButton(mode.name.toUpperCase(), leftX, ly,
                () => this.selectMode(mode.id),
                { active: this.modeId === mode.id, disabled: !this.isHost, fireOnRelease: true, noGlow: true, corner: '*' });
            b._modeId = mode.id;
            this.ui.buttons.push(b);
            ly += MODE_SPACING;
        });
        // CUSTOM toggle (bracket button)
        this.customBtn = makeBracketButton('CUSTOM', leftX, ly, () => this._toggleCustom(), { active: this.customOpen, toggle: true, toggledAt: this.customToggledAt, disabled: !this.isHost });
        this.ui.buttons.push(this.customBtn);
        ly += MODE_SPACING;
        // description (unchanged behavior, under the column)
        if (this.modeId) {
            // Extend the wrap past the column (underline) width by the same amount
            // MAKE HOST's bracket overhangs its column edge — on each side. That
            // overhang = the rest gap + half a bracket glyph at LIST_FONT.
            this.ctx.font = `${LIST_FONT}px "IBMVGA"`;
            const overhang = BRACKET_REST + this.ctx.measureText('M').width / 2;
            const lines = this._wrap(GAME_MODES[this.modeId].description, UNDERLINE_W + 2 * overhang, `${DESC_FONT}px "IBMVGA"`);
            const descColor = this.isHost ? theme.fg : dim();
            lines.forEach((ln, i) =>
                this.texts.push({ text: ln, x: leftX, y: ly + i * 28, align: 'center', font: DESC_FONT, color: descColor }));
        }

        // --- CENTER: settings editor (CUSTOM on) or preview box; then actions ---
        let centerBottom;
        let actionGap = ACTION_GAP;
        if (this.customOpen && this.modeId) {
            this.previewBox = null;
            let ry = COL_TOP;
            const mode = GAME_MODES[this.modeId];
            // Option-type settings (e.g. Speed) first, then the sliders.
            const entries = Object.entries(mode.settingsOptions)
                .sort((a, b) => (b[1].options ? 1 : 0) - (a[1].options ? 1 : 0));
            entries.forEach(([key, setting]) => {
                const value = this.settings[key] !== undefined ? this.settings[key] : setting.default;
                if (setting.options) {
                    // Match the slider titles (FONT_SIZE); dim for non-host like the rest.
                    this.texts.push({ text: setting.label, x: cx, y: ry, align: 'center', font: FONT_SIZE, color: this.isHost ? theme.fg : dim() });
                    const n = setting.options.length;
                    const spacing = 180; // wider than plain labels — bracket buttons need room
                    const startX = cx - spacing * (n - 1) / 2;
                    setting.options.forEach((val, i) => {
                        // Bracket buttons: the selected option is `active` (held inner,
                        // no hover/interaction — there's always exactly one selected, so
                        // it's NOT a toggle). The others rest outward and are clickable.
                        this.ui.buttons.push(makeBracketButton(setting.labels[i].toUpperCase(), startX + i * spacing, ry + 45,
                            () => this._optionChange(key, val),
                            { active: value === val, disabled: !this.isHost }));
                    });
                    ry += SETTING_OPTION_GAP;
                } else {
                    this.ui.sliders.push(makeSlider(setting.label, cx, ry + 25,
                        setting.min, setting.max, value,
                        (v) => this._sliderChange(key, v), !this.isHost, setting.unit || ''));
                    ry += SETTING_SLIDER_GAP;
                }
            });
            centerBottom = ry;
        } else {
            // Top aligned with the column underlines (tildes); buttons sit lower.
            const previewTop = COL_TOP + TITLE_GAP;
            this.previewBox = { cx, top: previewTop, w: PREVIEW_W, h: PREVIEW_H };
            centerBottom = previewTop + PREVIEW_H * FONT_SIZE;
            actionGap = PREVIEW_ACTION_GAP;
        }

        // START / BACK below the center content
        let by = centerBottom + actionGap;
        if (this.isHost) {
            this.ui.buttons.push(makeButton('START GAME', cx, by, () => this.onStart(), { blocksInput: true }));
            by += ACTION_SPACING;
        }
        this.ui.buttons.push(makeButton('BACK', cx, by, () => this.onMainMenu(), { blocksInput: true }));

        // --- RIGHT COLUMN: PLAYER LIST ---
        this._title('PLAYER LIST', rightX, COL_TOP);
        const listTop = COL_TOP + TITLE_GAP + PLAYER_GAP;
        this.playerLayout = { listX: rightX - 180, startY: listTop, rowH: PLAYER_ROW_H, rowW: 360 };
        this.players.forEach((p, i) => {
            const rowY = listTop + i * PLAYER_ROW_H;
            if (this.isHost && !p.isHost && p.connected) {
                // Align the 'HOST' word of MAKE HOST under the 'HOST'/'PLAYER' role label
                // above: same font (LIST_FONT), and the label's right edge sits at the
                // same right-aligned x as the role text, so the words stack exactly.
                const roleRightX = this.playerLayout.listX + this.playerLayout.rowW;
                this.ctx.font = `${LIST_FONT}px "IBMVGA"`;
                const labelW = this.ctx.measureText('MAKE HOST').width;
                const mh = makeBracketButton('MAKE HOST', roleRightX - labelW / 2, rowY,
                    () => this.onMakeHost(p.id));
                mh.fontSize = LIST_FONT;
                this.ui.buttons.push(mh);
            }
        });

        // Restore preserved animation onto the recreated buttons (matched by label).
        for (const b of this.ui.buttons) {
            const p = prevAnim[b.label];
            if (p) Object.assign(b, p);
        }
    }

    // Row segments for the typed-scroll transition. rebuild() has already laid the
    // screen out (from whatever state has loaded), so we decompose those live
    // elements; each row's fully-typed frame matches the steady draw.
    getTypeables() {
        const rows = [];
        const cx = this.canvas.width / 2;

        // big room code (center top)
        rows.push(textRow(this.roomCode || '------', cx, ROOMCODE_Y,
            `${TITLE_FONT}px "IBMVGA"`, 'center', 'top', theme.fg));

        // titles, underlines, description, setting labels (already built in texts[])
        for (const t of this.texts) {
            rows.push(textRow(t.text, t.x, t.y, `${t.font}px "IBMVGA"`, t.align, 'top', t.color));
        }

        // every button — bordered (modes / START / BACK) and bracket (COPY/CUSTOM/
        // speed/MAKE HOST)
        for (const b of this.ui.buttons) {
            if (b.bracket) rows.push(...bracketButtonRows(b, b.fontSize || FONT_SIZE));
            else rows.push(...buttonRows(b, FONT_SIZE));
        }

        // sliders (CUSTOM settings editor)
        for (const s of this.ui.sliders) rows.push(...sliderRows(s, FONT_SIZE));

        // preview box
        if (this.previewBox) rows.push(...this._previewRows(this.previewBox));

        // player rows (name + role; MAKE HOST handled above as a button)
        const { listX, startY, rowH, rowW } = this.playerLayout;
        const playerColor = this.isHost ? theme.fg : dim();
        this.players.forEach((p, i) => {
            const rowY = startY + i * rowH;
            rows.push(textRow(p.name, listX, rowY, `${LIST_FONT}px "IBMVGA"`, 'left', 'middle', playerColor));
            if (!(this.isHost && !p.isHost && p.connected)) {
                rows.push(textRow(p.isHost ? 'HOST' : 'PLAYER', listX + rowW, rowY,
                    `${LIST_FONT}px "IBMVGA"`, 'right', 'middle', playerColor));
            }
        });

        // Cluster segments whose Y is within ROW_BAND into one row, so each band
        // types left-to-right across all three columns in a single sweep instead
        // of as many stepped per-element rows. Only the grouping `y` changes — each
        // segment still DRAWS at its real position.
        const ROW_BAND = 20;
        const ordered = [...rows].sort((a, b) => a.y - b.y);
        let bandY = null;
        for (const seg of ordered) {
            if (bandY === null || seg.y - bandY > ROW_BAND) bandY = seg.y;
            seg.y = bandY;
        }
        return rows;
    }

    // Box outline as typeable rows: the `=` top/bottom type across; each `]   [`
    // side row types just its two brackets; the PREVIEW label types centered.
    _previewRows(box) {
        const ctx = this.ctx;
        ctx.font = `${FONT_SIZE}px "IBMVGA"`;
        const cw = ctx.measureText('M').width;
        const lh = FONT_SIZE;
        const left = box.cx - (box.w * cw) / 2;
        const rightX = left + (box.w - 1) * cw;
        const topRow = '='.repeat(box.w);
        const fg = this.isHost ? theme.fg : dim();
        const rows = [];
        for (let i = 0; i < box.h; i++) {
            const y = box.top + i * lh;
            const edge = i === 0 || i === box.h - 1;
            rows.push({
                y, x: left, cost: edge ? box.w : 2,
                draw: (c, n) => {
                    c.font = `${FONT_SIZE}px "IBMVGA"`;
                    c.textAlign = 'left'; c.textBaseline = 'top';
                    c.fillStyle = fg; c.globalAlpha = 1;
                    if (edge) { c.fillText(topRow.slice(0, n), left, y); }
                    else { if (n >= 1) c.fillText(']', left, y); if (n >= 2) c.fillText('[', rightX, y); }
                }
            });
        }
        rows.push(textRow('PREVIEW', box.cx, box.top + (box.h * lh) / 2,
            `${LABEL_FONT}px "IBMVGA"`, 'center', 'middle', fg));
        return rows;
    }

    _drawPreviewBox(ctx, box) {
        ctx.font = `${FONT_SIZE}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const cw = ctx.measureText('M').width;
        const lh = FONT_SIZE;
        const left = box.cx - (box.w * cw) / 2;
        const topRow = '='.repeat(box.w);
        const midRow = ']' + ' '.repeat(box.w - 2) + '[';
        ctx.fillStyle = this.isHost ? theme.fg : dim();
        for (let i = 0; i < box.h; i++) {
            ctx.fillText(i === 0 || i === box.h - 1 ? topRow : midRow, left, box.top + i * lh);
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${LABEL_FONT}px "IBMVGA"`;
        ctx.fillText('PREVIEW', box.cx, box.top + (box.h * lh) / 2);
    }

    draw() {
        if (this.dirty) { this.rebuild(); this.dirty = false; }

        const ctx = this.ctx;
        const cx = this.canvas.width / 2;

        // room code (big, center top — replaces HIDE)
        ctx.fillStyle = theme.fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `${TITLE_FONT}px "IBMVGA"`;
        ctx.fillText(this.roomCode || '------', cx, ROOMCODE_Y);

        // player rows — center-baselined so rowY is the row's center (matches the
        // mode buttons' center-Y, so columns share a row line for the transition).
        ctx.font = `${LIST_FONT}px "IBMVGA"`;
        ctx.textBaseline = 'middle';
        const { listX, startY, rowH, rowW } = this.playerLayout;
        const playerColor = this.isHost ? theme.fg : dim();
        this.players.forEach((p, i) => {
            const rowY = startY + i * rowH;
            ctx.globalAlpha = p.connected ? 1 : 0.4;
            ctx.textAlign = 'left';
            ctx.fillStyle = playerColor;
            ctx.fillText(p.name, listX, rowY);
            if (!(this.isHost && !p.isHost && p.connected)) {
                ctx.textAlign = 'right';
                ctx.fillStyle = playerColor;
                ctx.fillText(p.isHost ? 'HOST' : 'PLAYER', listX + rowW, rowY);
            }
        });
        ctx.globalAlpha = 1;

        // center preview box (when not customizing)
        if (this.previewBox) this._drawPreviewBox(ctx, this.previewBox);

        // labels / underlines / description
        this.texts.forEach(t => {
            ctx.font = `${t.font}px "IBMVGA"`;
            ctx.fillStyle = t.color;
            ctx.textAlign = t.align;
            ctx.textBaseline = 'top';
            ctx.fillText(t.text, t.x, t.y);
        });

        this.ui.sliders.forEach(s => drawSlider(ctx, s, this.ui.elapsed, FONT_SIZE));
        this.ui.buttons.forEach(b => {
            if (b.bracket) drawBracketButton(ctx, b, this.ui.elapsed, b.fontSize || FONT_SIZE);
            else drawButton(ctx, b, this.ui.elapsed, FONT_SIZE);
        });
    }
}
