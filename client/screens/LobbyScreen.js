import { makeButton, drawButton } from '../ui/Button.js';
import { makeSlider, drawSlider } from '../ui/Slider.js';
import { makeBracketButton, drawBracketButton } from '../ui/BracketButton.js';
import { GAME_MODES } from '../../gameModes.js';
import { theme } from '../ui/colors.js';

const FONT_SIZE = 32;
const TITLE_FONT = 96;   // big room code
const LIST_FONT = 28;
const LABEL_FONT = 24;
const DESC_FONT = 24;

// --- Layout (tweak these) ---
const ROOMCODE_Y = 20;       // big room code top edge
const COPY_Y = 150;          // COPY CODE bracket button center
const COL_OFFSET = 440;      // left/right column distance from screen center
const COL_TOP = 240;         // top of the three columns
const TITLE_GAP = 30;        // underline below a column title
const MODE_GAP = 70;         // gap from underline to first mode button
const MODE_SPACING = 90;     // between mode buttons / CUSTOM
const PREVIEW_W = 18;        // preview box width in chars
const PREVIEW_H = 8;         // preview box height in rows
const SETTING_SLIDER_GAP = 78;
const SETTING_OPTION_GAP = 95;
const ACTION_GAP = 40;       // START GAME below the center content
const ACTION_SPACING = 90;   // MAIN MENU below START GAME
const PLAYER_GAP = 60;       // first player row below the underline
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
        this.customOpen = false;
        this.rebuild();
    }

    // --- setters from game.js (server-driven) ---
    setRoomCode(code) { this.roomCode = code; }            // drawn live, no rebuild
    setPlayers(players) { this.players = players; this.dirty = true; }
    setHost(isHost) { if (this.isHost !== isHost) { this.isHost = isHost; this.dirty = true; } }

    applyRemoteSettings(mode, settings) {
        this.modeId = mode;
        this.settings = { ...settings };
        this.dirty = true;
    }

    // --- internal control actions ---
    selectMode(modeId) {
        if (!this.isHost || this.modeId === modeId) return;
        this.modeId = modeId;
        const mode = GAME_MODES[modeId];
        this.settings = {};
        Object.entries(mode.settingsOptions).forEach(([k, s]) => { this.settings[k] = s.default; });
        this.dirty = true;
        this.onUpdateSettings(this.modeId, { ...this.settings });
    }

    _toggleCustom() {
        if (!this.modeId) { this.onModal('?INVALID GAME MODE'); return; }   // need a mode selected to customize its settings
        this.customOpen = !this.customOpen;
        this.customToggledAt = this.ui.elapsed;  // start the hover-anim pause (on or off)
        this.dirty = true;
    }

    _sliderChange(key, v) {
        this.settings[key] = v;
        this.onUpdateSettings(this.modeId, { ...this.settings });   // no rebuild during drag
    }

    _optionChange(key, v) {
        this.settings[key] = v;
        this.dirty = true;                                          // discrete -> rebuild next frame
        this.onUpdateSettings(this.modeId, { ...this.settings });
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
        this.texts.push({ text, x, y, align: 'center', font: LABEL_FONT, color: theme.fg });
        // Column-header rule: stretch the tildes across the column width.
        this.ctx.font = `${LABEL_FONT}px "IBMVGA"`;
        const count = Math.max(text.length, Math.round(UNDERLINE_W / this.ctx.measureText('~').width));
        this.texts.push({ text: '~'.repeat(count), x, y: y + TITLE_GAP, align: 'center', font: LABEL_FONT, color: theme.fg });
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
        const off = Math.min(W * 0.27, COL_OFFSET);
        const leftX = cx - off;
        const rightX = cx + off;

        // --- HEADER: COPY CODE bracket button (room code is drawn live) ---
        this.copyBtn = makeBracketButton('COPY CODE', cx, COPY_Y, () => this._copyCode());
        this.ui.buttons.push(this.copyBtn);

        // --- LEFT COLUMN: GAME MODE ---
        this._title('GAME MODE', leftX, COL_TOP);
        let ly = COL_TOP + TITLE_GAP + MODE_GAP;
        Object.values(GAME_MODES).forEach((mode) => {
            this.ui.buttons.push(makeButton(mode.name.toUpperCase(), leftX, ly,
                () => this.selectMode(mode.id),
                { active: this.modeId === mode.id, disabled: !this.isHost, fireOnRelease: true }));
            ly += MODE_SPACING;
        });
        // CUSTOM toggle (bracket button)
        this.customBtn = makeBracketButton('CUSTOM', leftX, ly, () => this._toggleCustom(), { active: this.customOpen, toggle: true, toggledAt: this.customToggledAt });
        this.ui.buttons.push(this.customBtn);
        ly += MODE_SPACING;
        // description (unchanged behavior, under the column)
        if (this.modeId) {
            const lines = this._wrap(GAME_MODES[this.modeId].description, 420, `${DESC_FONT}px "IBMVGA"`);
            lines.forEach((ln, i) =>
                this.texts.push({ text: ln, x: leftX, y: ly + i * 28, align: 'center', font: DESC_FONT, color: theme.fg }));
        }

        // --- CENTER: settings editor (CUSTOM on) or preview box; then actions ---
        let centerBottom;
        if (this.customOpen && this.modeId) {
            this.previewBox = null;
            let ry = COL_TOP;
            const mode = GAME_MODES[this.modeId];
            Object.entries(mode.settingsOptions).forEach(([key, setting]) => {
                const value = this.settings[key] !== undefined ? this.settings[key] : setting.default;
                if (setting.options) {
                    this.texts.push({ text: setting.label, x: cx, y: ry, align: 'center', font: LABEL_FONT, color: theme.fg });
                    const n = setting.options.length;
                    const spacing = 120;
                    const startX = cx - spacing * (n - 1) / 2;
                    setting.options.forEach((val, i) => {
                        this.ui.buttons.push(makeButton(setting.labels[i], startX + i * spacing, ry + 45,
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
            this.previewBox = { cx, top: COL_TOP, w: PREVIEW_W, h: PREVIEW_H };
            centerBottom = COL_TOP + PREVIEW_H * FONT_SIZE;
        }

        // START / BACK below the center content
        let by = centerBottom + ACTION_GAP;
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
                this.ui.buttons.push(makeButton('[MAKE HOST]', rightX + 110, rowY + LIST_FONT / 2,
                    () => this.onMakeHost(p.id), { plain: true }));
            }
        });

        // Restore preserved animation onto the recreated buttons (matched by label).
        for (const b of this.ui.buttons) {
            const p = prevAnim[b.label];
            if (p) Object.assign(b, p);
        }
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
        ctx.fillStyle = theme.fg;
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

        // player rows
        ctx.font = `${LIST_FONT}px "IBMVGA"`;
        const { listX, startY, rowH, rowW } = this.playerLayout;
        this.players.forEach((p, i) => {
            const rowY = startY + i * rowH;
            ctx.globalAlpha = p.connected ? 1 : 0.4;
            ctx.textAlign = 'left';
            ctx.fillStyle = theme.fg;
            ctx.fillText(p.name, listX, rowY);
            if (!(this.isHost && !p.isHost && p.connected)) {
                ctx.textAlign = 'right';
                ctx.fillStyle = theme.fg;
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
            if (b.bracket) drawBracketButton(ctx, b, this.ui.elapsed, FONT_SIZE);
            else drawButton(ctx, b, this.ui.elapsed, FONT_SIZE);
        });
    }
}
