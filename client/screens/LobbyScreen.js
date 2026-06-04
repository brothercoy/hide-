import { makeButton, drawButton } from '../ui/Button.js';
import { makeSlider, drawSlider } from '../ui/Slider.js';
import { GAME_MODES } from '../../gameModes.js';

const FONT_SIZE = 32;
const TITLE_FONT = 96;
const LIST_FONT = 28;
const LABEL_FONT = 24;
const DESC_FONT = 24;

const GREEN = '#00ff41';
const DIM = '#007a1f';

export class LobbyScreen {
    constructor(canvas, ctx, uiManager, onUpdateSettings, onMakeHost, onStart, onMainMenu) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ui = uiManager;
        this.onUpdateSettings = onUpdateSettings;
        this.onMakeHost = onMakeHost;
        this.onStart = onStart;
        this.onMainMenu = onMainMenu;

        this.roomCode = '';
        this.players = [];
        this.modeId = null;
        this.settings = {};
        this.isHost = false;

        this.dirty = false;
        this.texts = [];
        this.copyBtn = null;
        this.previewRect = null;
        this.playerLayout = { listX: 0, startY: 0, rowH: 36, rowW: 440 };
    }

    enter() {
        this.dirty = false;
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
            setTimeout(() => { if (btn.label === 'COPIED!') btn.label = '[ COPY CODE ]'; }, 1500);
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

    rebuild() {
        this.ui.clear();
        this.texts = [];

        const cx = this.canvas.width / 2;
        const W = this.canvas.width;
        const leftX = cx - Math.min(W * 0.28, 480);
        const rightX = cx + Math.min(W * 0.28, 480);

        // copy-code affordance (top center, under the room code)
        this.copyBtn = makeButton('[ COPY CODE ]', cx, 162, () => this._copyCode(), { plain: true });
        this.ui.buttons.push(this.copyBtn);

        // --- player list (top center) ---
        const listTop = 200;
        this.playerLayout = { listX: cx - 180, startY: listTop, rowH: 32, rowW: 360 };
        this.players.forEach((p, i) => {
            const rowY = listTop + i * 32;
            if (this.isHost && !p.isHost && p.connected) {
                this.ui.buttons.push(makeButton('[MAKE HOST]', cx + 110, rowY + LIST_FONT / 2,
                    () => this.onMakeHost(p.id), { plain: true }));
            }
        });
        const listBottom = listTop + Math.max(this.players.length, 1) * 32 + 30;

        // --- LEFT COLUMN: game mode ---
        this.texts.push({ text: 'GAME MODE', x: leftX, y: 200, align: 'center', font: LABEL_FONT, color: GREEN });
        let ly = 250;
        Object.values(GAME_MODES).forEach((mode) => {
            this.ui.buttons.push(makeButton(mode.name.toUpperCase(), leftX, ly,
                () => this.selectMode(mode.id),
                { active: this.modeId === mode.id, disabled: !this.isHost }));
            ly += 90;
        });
        if (this.modeId) {
            const lines = this._wrap(GAME_MODES[this.modeId].description, 420, `${DESC_FONT}px "IBMVGA"`);
            lines.forEach((ln, i) =>
                this.texts.push({ text: ln, x: leftX, y: ly + i * 28, align: 'center', font: DESC_FONT, color: DIM }));
        }

        // --- RIGHT COLUMN: settings ---
        this.texts.push({ text: 'SETTINGS', x: rightX, y: 200, align: 'center', font: LABEL_FONT, color: GREEN });
        let ry = 255;
        if (this.modeId) {
            const mode = GAME_MODES[this.modeId];
            Object.entries(mode.settingsOptions).forEach(([key, setting]) => {
                const value = this.settings[key] !== undefined ? this.settings[key] : setting.default;
                if (setting.options) {
                    this.texts.push({ text: setting.label, x: rightX, y: ry, align: 'center', font: LABEL_FONT, color: GREEN });
                    const n = setting.options.length;
                    const spacing = 120;
                    const startX = rightX - spacing * (n - 1) / 2;
                    setting.options.forEach((val, i) => {
                        this.ui.buttons.push(makeButton(setting.labels[i], startX + i * spacing, ry + 45,
                            () => this._optionChange(key, val),
                            { active: value === val, disabled: !this.isHost }));
                    });
                    ry += 100;
                } else {
                    this.ui.sliders.push(makeSlider(setting.label, rightX, ry + 25,
                        setting.min, setting.max, value,
                        (v) => this._sliderChange(key, v), !this.isHost, setting.unit || ''));
                    ry += 85;
                }
            });
        }

        // --- CENTER: preview box, then Start / Main Menu ---
        const previewW = 320, previewH = 240;
        const previewY = Math.max(listBottom, 285);
        this.previewRect = { x: cx - previewW / 2, y: previewY, w: previewW, h: previewH };

        let by = previewY + previewH + 55;
        if (this.isHost) {
            this.ui.buttons.push(makeButton('START GAME', cx, by, () => this.onStart()));
            by += 95;
        }
        this.ui.buttons.push(makeButton('MAIN MENU', cx, by, () => this.onMainMenu()));
    }

    draw() {
        if (this.dirty) { this.rebuild(); this.dirty = false; }

        const ctx = this.ctx;
        const cx = this.canvas.width / 2;

        ctx.fillStyle = GREEN;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `${TITLE_FONT}px "IBMVGA"`;
        ctx.fillText('HIDE', cx, 20);

        ctx.font = `${FONT_SIZE}px "IBMVGA"`;
        ctx.fillText('ROOM CODE: ' + (this.roomCode || '------'), cx, 125);

        // player rows
        ctx.font = `${LIST_FONT}px "IBMVGA"`;
        const { listX, startY, rowH, rowW } = this.playerLayout;
        this.players.forEach((p, i) => {
            const rowY = startY + i * rowH;
            ctx.globalAlpha = p.connected ? 1 : 0.4;
            ctx.textAlign = 'left';
            ctx.fillStyle = GREEN;
            ctx.fillText(p.name, listX, rowY);
            if (!(this.isHost && !p.isHost && p.connected)) {
                ctx.textAlign = 'right';
                ctx.fillStyle = DIM;
                ctx.fillText(p.isHost ? 'HOST' : 'PLAYER', listX + rowW, rowY);
            }
        });
        ctx.globalAlpha = 1;

        // preview box (placeholder for now)
        if (this.previewRect) {
            const r = this.previewRect;
            ctx.strokeStyle = DIM;
            ctx.lineWidth = 2;
            ctx.strokeRect(r.x, r.y, r.w, r.h);
            ctx.fillStyle = DIM;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${LABEL_FONT}px "IBMVGA"`;
            ctx.fillText('PREVIEW', r.x + r.w / 2, r.y + r.h / 2);
        }

        // labels / description
        this.texts.forEach(t => {
            ctx.font = `${t.font}px "IBMVGA"`;
            ctx.fillStyle = t.color;
            ctx.textAlign = t.align;
            ctx.textBaseline = 'top';
            ctx.fillText(t.text, t.x, t.y);
        });

        this.ui.sliders.forEach(s => drawSlider(ctx, s, this.ui.elapsed, FONT_SIZE));
        this.ui.buttons.forEach(b => drawButton(ctx, b, this.ui.elapsed, FONT_SIZE));
    }
}