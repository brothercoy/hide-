import { updateButtonZ, CHAR_ROT_SPEED, CHAR_ROT_MAX } from './Button.js';

export class UIManager {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.buttons = [];
        this.sliders = [];
        this.inputs = [];
        this.focusedInput = null;
        this.draggingSlider = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.elapsed = 0;
        this.lastTime = performance.now();
        this.blocked = false;
        this.coordTransform = null;
        this.pressedButton = null;
        this.mouseIsDown = false;
        // Vertical offset of the elements during a screen transition (they're drawn
        // at rect.y + offsetY). Subtracted from the cursor Y when hit-testing so you
        // interact with elements where you SEE them mid-scroll. 0 when not animating.
        this.offsetY = 0;

        this._bindEvents();
    }

    _bindEvents() {
        this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        this.canvas.addEventListener('mouseup', e => this._onMouseUp(e));
        this.canvas.addEventListener('dblclick', e => this._onDoubleClick(e));
        window.addEventListener('keydown', e => this._onKeyDown(e));
    }

    _getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;
        if (this.coordTransform) ({ x, y } = this.coordTransform(x, y));
        return { x, y };
    }

    _onMouseMove(e) {
        const { x, y } = this._getPos(e);
        this.mouseX = x;
        this.mouseY = y;

        if (this.draggingSlider) {
            const s = this.draggingSlider;
            const r = s.rect;
            const t = Math.max(0, Math.min(1, (x - r.left) / r.trackWidth));
            s.value = Math.round(s.min + t * (s.max - s.min));
            if (s.onChange) s.onChange(s.value);
        }

        if (this.focusedInput && this.focusedInput.selecting) {
            const idx = this._getCharIndex(this.focusedInput, x);
            this.focusedInput.selEnd = idx;
            this.focusedInput.cursorPos = idx;
        }
    }

    _onMouseDown(e) {
        if (this.blocked) return;

        const { x, y } = this._getPos(e);
        const hy = y - this.offsetY; // hit-test against where elements are drawn
        this.mouseIsDown = true;
        this.pressedButton = null;

        // Set pressedButton only if mousedown starts on a button
        this.buttons.forEach(btn => {
            if (btn.disabled) return;
            if (btn.rect && this._hitTest(btn.rect, x, hy)) {
                this.pressedButton = btn;
                btn._isPressed = true;
            }
        });

        let clickedInput = null;
        this.inputs.forEach(inp => {
            if (inp.rect && this._hitTest(inp.rect, x, hy)) {
                clickedInput = inp;
            }
        });

        this.inputs.forEach(inp => {
            inp.focused = inp === clickedInput;
            if (inp === clickedInput) {
                const idx = this._getCharIndex(inp, x);
                inp.cursorPos = idx;
                inp.selStart = idx;
                inp.selEnd = idx;
                inp.selecting = true;
            }
            inp.cursorVisible = true;
            inp.lastBlink = performance.now();
        });
        this.focusedInput = clickedInput;

        this.sliders.forEach(s => {
            if (s.disabled) return;
            if (s.rect && this._hitTest(s.rect, x, hy)) {
                this.draggingSlider = s;
            }
        });
    }

    _onMouseUp(e) {
        const { x, y } = this._getPos(e);
        const hy = y - this.offsetY;
        this.mouseIsDown = false;

        if (this.pressedButton) {
            const btn = this.pressedButton;
            const stillOver = btn.rect && this._hitTest(btn.rect, x, hy);
            if (stillOver && !btn.disabled) {
                if (btn.plain) {
                    btn.onClick();
                } else {
                    btn.releasePhase = 'releasing';
                    btn.glowT = 0;
                    // Normal buttons fire onClick at the end of the glow cycle.
                    // fireOnRelease buttons fire now; the glow then plays as a background visual.
                    btn._fireClick = btn.fireOnRelease === true;
                    if (btn.charPhases) {
                        btn.charRot = btn.charPhases.map(phase => Math.sin(this.elapsed * CHAR_ROT_SPEED + phase + Math.PI) * CHAR_ROT_MAX);
                    }
                    if (btn.blocksInput) {
                        this.blocked = true;
                        this.lastTime = performance.now();
                    }
                }
            }
            btn._isPressed = false;
            this.pressedButton = null;
        }

        this.draggingSlider = null;
        if (this.focusedInput) this.focusedInput.selecting = false;
    }

    _onDoubleClick(e) {
        const { x, y } = this._getPos(e);
        this.inputs.forEach(inp => {
            if (inp.rect && this._hitTest(inp.rect, x, y)) {
                if (inp.value.length > 0) {
                    inp.selStart = 0;
                    inp.selEnd = inp.value.length;
                    inp.cursorPos = inp.value.length;
                }
            }
        });
    }

    _onKeyDown(e) {
        if (this.blocked) return;

        const inp = this.focusedInput;
        if (!inp) return;
        const hasSelection = inp.selStart !== inp.selEnd;

        const mod = e.ctrlKey || e.metaKey;
        if (mod && (e.key === 'a' || e.key === 'A')) {
            e.preventDefault();
            inp.selStart = 0;
            inp.selEnd = inp.value.length;
            inp.cursorPos = inp.value.length;
            return;
        }
        if (mod && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            if (hasSelection && navigator.clipboard) {
                const a = Math.min(inp.selStart, inp.selEnd);
                const b = Math.max(inp.selStart, inp.selEnd);
                navigator.clipboard.writeText(inp.value.slice(a, b)).catch(() => {});
            }
            return;
        }
        if (mod && (e.key === 'x' || e.key === 'X')) {
            e.preventDefault();
            if (hasSelection) {
                const a = Math.min(inp.selStart, inp.selEnd);
                const b = Math.max(inp.selStart, inp.selEnd);
                if (navigator.clipboard) navigator.clipboard.writeText(inp.value.slice(a, b)).catch(() => {});
                this._deleteSelection(inp);
            }
            return;
        }
        if (mod && (e.key === 'v' || e.key === 'V')) {
            e.preventDefault();
            if (!navigator.clipboard || !navigator.clipboard.readText) return;
            navigator.clipboard.readText().then(text => {
                if (!text) return;
                const clean = text.replace(/[\r\n\t]/g, '').trim().toUpperCase();
                if (inp.selStart !== inp.selEnd) this._deleteSelection(inp);
                const space = inp.maxLength - inp.value.length;
                if (space <= 0) return;
                const toInsert = clean.slice(0, space);
                inp.value = inp.value.slice(0, inp.cursorPos) + toInsert + inp.value.slice(inp.cursorPos);
                inp.cursorPos += toInsert.length;
                inp.selStart = inp.cursorPos;
                inp.selEnd = inp.cursorPos;
                inp.cursorVisible = true;
                inp.lastBlink = performance.now();
            }).catch(() => {});
            return;
        }

        if (e.key === 'Backspace') {
            if (hasSelection) {
                this._deleteSelection(inp);
            } else if (inp.cursorPos > 0) {
                inp.value = inp.value.slice(0, inp.cursorPos - 1) + inp.value.slice(inp.cursorPos);
                inp.cursorPos--;
                inp.selStart = inp.cursorPos;
                inp.selEnd = inp.cursorPos;
            }
            inp.cursorVisible = true;
            inp.lastBlink = performance.now();
        } else if (e.key === 'Delete') {
            if (hasSelection) {
                this._deleteSelection(inp);
            } else if (inp.cursorPos < inp.value.length) {
                inp.value = inp.value.slice(0, inp.cursorPos) + inp.value.slice(inp.cursorPos + 1);
                inp.selStart = inp.cursorPos;
                inp.selEnd = inp.cursorPos;
            }
            inp.cursorVisible = true;
            inp.lastBlink = performance.now();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            inp.cursorPos = Math.max(0, inp.cursorPos - 1);
            if (e.shiftKey) { inp.selEnd = inp.cursorPos; }
            else { inp.selStart = inp.cursorPos; inp.selEnd = inp.cursorPos; }
            inp.cursorVisible = true;
            inp.lastBlink = performance.now();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            inp.cursorPos = Math.min(inp.value.length, inp.cursorPos + 1);
            if (e.shiftKey) { inp.selEnd = inp.cursorPos; }
            else { inp.selStart = inp.cursorPos; inp.selEnd = inp.cursorPos; }
            inp.cursorVisible = true;
            inp.lastBlink = performance.now();
        } else if (e.key === 'Tab' || e.key === 'ArrowDown') {
            e.preventDefault();
            this._focusNextInput(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._focusNextInput(-1);
        } else if (e.key === 'Enter') {
            const btn = this.buttons.find(b => b.isDefault);
            if (btn) btn.onClick();
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            if (hasSelection) this._deleteSelection(inp);
            if (inp.value.length < inp.maxLength) {
                inp.value = inp.value.slice(0, inp.cursorPos) + e.key.toUpperCase() + inp.value.slice(inp.cursorPos);
                inp.cursorPos++;
                inp.selStart = inp.cursorPos;
                inp.selEnd = inp.cursorPos;
            }
            inp.cursorVisible = true;
            inp.lastBlink = performance.now();
        }
    }

    _deleteSelection(inp) {
        const selMin = Math.min(inp.selStart, inp.selEnd);
        const selMax = Math.max(inp.selStart, inp.selEnd);
        inp.value = inp.value.slice(0, selMin) + inp.value.slice(selMax + 1);
        inp.cursorPos = selMin;
        inp.selStart = selMin;
        inp.selEnd = selMin;
    }

    _focusNextInput(dir) {
        const idx = this.inputs.indexOf(this.focusedInput);
        const next = this.inputs[(idx + dir + this.inputs.length) % this.inputs.length];
        if (this.focusedInput) this.focusedInput.focused = false;
        next.focused = true;
        next.cursorVisible = true;
        next.lastBlink = performance.now();
        this.focusedInput = next;
    }

    _hitTest(rect, x, y) {
        return x >= rect.x && x <= rect.x + rect.w &&
               y >= rect.y && y <= rect.y + rect.h;
    }

    _getCharIndex(inp, mx) {
        if (!inp.rect) return 0;
        const textStartX = inp.rect.textStartX;
        const cw = inp.rect.charWidth;
        return Math.max(0, Math.min(inp.value.length, Math.floor((mx - textStartX) / cw)));
    }

    update(now) {
        const dt = now - this.lastTime;
        this.lastTime = now;

        this.elapsed += dt / 1000;

        const my = this.mouseY - this.offsetY; // hit-test against where elements are drawn

        this.buttons.forEach(btn => {
            if (btn.disabled) { btn.hoverProgress = 0; btn._over = false; return; }
            // While a modal is up, background buttons are inert: treat them as
            // not hovered/pressed so they decay to rest and can only start
            // building hover again once the modal closes (no jump-to-hovered).
            const inside = !this.blocked && btn.rect && this._hitTest(btn.rect, this.mouseX, my);
            btn._over = inside;            // immediate hover state (for snap timing)
            btn.hoverProgress = inside
                ? Math.min(1, btn.hoverProgress + dt / 333)
                : Math.max(0, btn.hoverProgress - dt / 333);

            updateButtonZ(btn, dt, this.elapsed,
                this.blocked ? null : this.pressedButton,
                this.blocked ? false : this.mouseIsDown,
                this.mouseX, my);

            if (btn._fireClick) {
                btn._fireClick = false;
                btn.onClick();
            }
        });

        if (this.blocked) return;

        this.inputs.forEach(inp => {
            if (inp.focused && now - inp.lastBlink > 500) {
                inp.cursorVisible = !inp.cursorVisible;
                inp.lastBlink = now;
            }
            updateButtonZ(inp, dt, this.elapsed, null, false, this.mouseX, my);
        });

        this.sliders.forEach(s => {
            updateButtonZ(s, dt, this.elapsed, null, false, this.mouseX, my);
        });
    }

    clear() {
        this.buttons = [];
        this.sliders = [];
        this.inputs = [];
        this.focusedInput = null;
        this.draggingSlider = null;
        this.pressedButton = null;
        this.mouseIsDown = false;
        this.blocked = false;
        this.offsetY = 0;
        this.lastTime = performance.now();
    }
}