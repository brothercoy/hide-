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

        this._bindEvents();
    }

    _bindEvents() {
        this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        this.canvas.addEventListener('mouseup', () => this._onMouseUp());
        this.canvas.addEventListener('click', e => this._onClick(e));
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

        let clickedInput = null;
        this.inputs.forEach(inp => {
            if (inp.rect && this._hitTest(inp.rect, x, y)) {
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
            if (s.rect && this._hitTest(s.rect, x, y)) {
                this.draggingSlider = s;
            }
        });
    }

    _onMouseUp() {
        this.draggingSlider = null;
        if (this.focusedInput) this.focusedInput.selecting = false;
    }

    _onClick(e) {
        console.log('click fired', this.blocked, this.buttons.length);
        if (this.blocked) return;

        const { x, y } = this._getPos(e);
        this.buttons.forEach(btn => {
            if (btn.disabled) return;
            if (btn.rect && this._hitTest(btn.rect, x, y)) {
                btn.onClick();
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
        } else if (e.key === 'Delete') {
            if (hasSelection) {
                this._deleteSelection(inp);
            } else if (inp.cursorPos < inp.value.length) {
                inp.value = inp.value.slice(0, inp.cursorPos) + inp.value.slice(inp.cursorPos + 1);
                inp.selStart = inp.cursorPos;
                inp.selEnd = inp.cursorPos;
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            inp.cursorPos = Math.max(0, inp.cursorPos - 1);
            if (e.shiftKey) {
                inp.selEnd = inp.cursorPos;
            } else {
                inp.selStart = inp.cursorPos;
                inp.selEnd = inp.cursorPos;
            }
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            inp.cursorPos = Math.min(inp.value.length, inp.cursorPos + 1);
            if (e.shiftKey) {
                inp.selEnd = inp.cursorPos;
            } else {
                inp.selStart = inp.cursorPos;
                inp.selEnd = inp.cursorPos;
            }
        } else if (e.key === 'Tab' || e.key === 'ArrowDown') {
            e.preventDefault();
            this._focusNextInput(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._focusNextInput(-1);
        } else if (e.key === 'Enter') {
            // Trigger focused button if any
            const btn = this.buttons.find(b => b.isDefault);
            if (btn) btn.onClick();
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            if (hasSelection) {
                this._deleteSelection(inp);
            }
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
        inp.value = inp.value.slice(0, selMin) + inp.value.slice(selMax);
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
        let closest = 0;
        let closestDist = Infinity;
        for (let i = 0; i <= inp.value.length; i++) {
            const x = textStartX + this.ctx.measureText(inp.value.slice(0, i)).width;
            const dist = Math.abs(mx - x);
            if (dist < closestDist) {
                closestDist = dist;
                closest = i;
            }
        }
        return closest;
    }

    update(now) {
        if (this.blocked) return;

        const dt = now - this.lastTime;
        this.lastTime = now;
        this.elapsed += dt / 1000;

        this.buttons.forEach(btn => {
            if (btn.disabled) { btn.hoverProgress = 0; return; }
            const inside = btn.rect && this._hitTest(btn.rect, this.mouseX, this.mouseY);
            if (inside) {
                btn.hoverProgress = Math.min(1, btn.hoverProgress + dt / 333);
            } else {
                btn.hoverProgress = Math.max(0, btn.hoverProgress - dt / 333);
            }
        });

        this.inputs.forEach(inp => {
            if (inp.focused && now - inp.lastBlink > 500) {
                inp.cursorVisible = !inp.cursorVisible;
                inp.lastBlink = now;
            }
        });
    }

    clear() {
        this.buttons = [];
        this.sliders = [];
        this.inputs = [];
        this.focusedInput = null;
        this.draggingSlider = null;
    }
}