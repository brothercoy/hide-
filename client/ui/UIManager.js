import { updateButtonZ, CHAR_ROT_SPEED, CHAR_ROT_MAX } from './Button.js';
import { charWidth } from './Font.js';

// The input overlays are opacity:1 (so the native selection/context menu shows) but render nothing —
// this hides the native ::selection highlight too, since we draw our own on the canvas. Injected once.
let _overlayStyleInjected = false;
function _ensureOverlayStyle() {
    if (_overlayStyleInjected) return;
    _overlayStyleInjected = true;
    const s = document.createElement('style');
    s.textContent = '.ui-input-overlay::selection{background:transparent;color:transparent}'
                  + '.ui-input-overlay::-moz-selection{background:transparent;color:transparent}';
    document.head.appendChild(s);
}

export class UIManager {
    constructor(canvas, ctx, isMobile = false) {
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

        // Canvas inputs aren't real editable elements, so on their own they can't raise the phone
        // keyboard OR show the browser's native copy/paste menu (right-click / long-press). So we lay
        // a REAL but see-through <input> exactly over each canvas field on EVERY platform: the tap/
        // click lands on it, the browser natively focuses it (raising the keyboard on mobile) and
        // owns typing, selection, and the native copy/paste menu; its value + caret are mirrored into
        // the canvas field, which draws the visible text/cursor/selection. The window keydown/paste
        // paths below stand down whenever an overlay has focus.
        this.isMobile = !!isMobile;
        this.useInputOverlay = true;
        this._overlays = new Map();   // canvas input -> its transparent DOM <input> overlay
        this._touchActive = false;
        this._pendingFloor = null;    // mobile: { el, x } — a just-tapped overlay whose caret to re-floor
        this._drag = null;            // desktop: { el, anchor } — an in-progress inclusive drag-select

        this._bindEvents();
    }

    _bindEvents() {
        this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        this.canvas.addEventListener('mouseup', e => this._onMouseUp(e));
        this.canvas.addEventListener('dblclick', e => this._onDoubleClick(e));
        window.addEventListener('keydown', e => this._onKeyDown(e));
        window.addEventListener('paste', e => this._onPaste(e));
        // Touch: mobile browsers only EMULATE mouse events for taps, never for drags — so sliders
        // (which need a drag) never update. Drive the same handlers from real touch events instead.
        this.canvas.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', e => this._onTouchEnd(e), { passive: false });
        // Live caret/selection from the focused overlay <input> — fires continuously (incl. mid-drag),
        // so click-to-position and native/keyboard selection update the canvas in real time.
        document.addEventListener('selectionchange', () => this._mirrorOverlaySelection());
        // Desktop inclusive drag-select (see _onOverlayMouseDown): extend/finish it from anywhere.
        document.addEventListener('mousemove', (e) => this._onOverlayDrag(e));
        document.addEventListener('mouseup', () => { this._drag = null; });
    }

    // Overlay mousedown. Mobile: let the browser position the caret (rounded) and re-floor it in the
    // mirror. Desktop: take over so a click floors onto the clicked char and a drag selects the game's
    // INCLUSIVE char range (both endpoints), then reflect that as the native selection for copy/delete.
    _onOverlayMouseDown(e, el) {
        if (this.isMobile) { this._pendingFloor = { el, x: e.clientX }; return; }
        if (e.button !== 0) return;                        // right/middle → native context menu
        e.preventDefault();                                 // no native rounded caret / native drag-select
        el.focus();
        const a = this._overlayCharIndex(el, e.clientX);
        this._drag = { el, anchor: a };
        try { el.setSelectionRange(a, a); } catch (_) { /* noop */ }
        this._mirrorOverlaySelection();
    }

    _onOverlayDrag(e) {
        const d = this._drag;
        if (!d) return;
        const el = d.el;
        const c = this._overlayCharIndex(el, e.clientX);
        try {
            if (c === d.anchor) {
                el.setSelectionRange(d.anchor, d.anchor);   // back to a caret — no selection
            } else {
                const lo = Math.min(d.anchor, c), hi = Math.max(d.anchor, c);   // INCLUSIVE chars…
                el.setSelectionRange(lo, hi + 1, c < d.anchor ? 'backward' : 'forward'); // …→ boundaries [lo, hi+1]
            }
        } catch (_) { /* noop */ }
        this._mirrorOverlaySelection();
    }

    // Floor a click X to the character index within the overlay's centered IBMVGA run — so the block
    // cursor lands on the character you clicked, matching the old _getCharIndex (which used floor).
    _overlayCharIndex(el, clientX) {
        const r = el.getBoundingClientRect();
        const adv = charWidth(parseFloat(el.style.fontSize) || 16);
        if (!adv) return el.value.length;
        const runStart = r.left + r.width / 2 - (el.value.length * adv) / 2;   // text is centered
        return Math.max(0, Math.min(el.value.length, Math.floor((clientX - runStart) / adv)));
    }

    // Copy the focused overlay's native caret/selection onto its canvas field so it's DRAWN, and so
    // copy/cut act on the right span. No-op unless one of our overlays is the active element.
    _mirrorOverlaySelection() {
        const el = document.activeElement;
        for (const [inp, o] of this._overlays) {
            if (o !== el) continue;
            // A fresh click positioned a COLLAPSED caret by rounding to the nearest gap; re-floor it
            // onto the clicked character (the block cursor covers that char). Done here — on the
            // positioning's selectionchange — so it's corrected before the frame paints (no flash).
            if (this._pendingFloor && this._pendingFloor.el === el && el.selectionStart === el.selectionEnd) {
                const x = this._pendingFloor.x;
                this._pendingFloor = null;   // clear before re-setting so the recursive change doesn't loop
                const idx = this._overlayCharIndex(el, x);
                if (idx !== el.selectionStart) { try { el.setSelectionRange(idx, idx); } catch (_) { /* noop */ } }
            }
            const len = el.value.length;
            if (el.selectionStart === el.selectionEnd) {          // collapsed caret
                const p = Math.min(len, el.selectionStart == null ? len : el.selectionStart);
                inp.selStart = p; inp.selEnd = p; inp.cursorPos = p;
            } else {                                              // range — the native end is EXCLUSIVE
                const s = Math.min(len, el.selectionStart);       // (the gap after the last char), but the
                const e = Math.min(len, el.selectionEnd);         // canvas highlight is INCLUSIVE of both
                inp.selStart = s; inp.selEnd = e - 1; inp.cursorPos = e - 1;   // ends → drop the trailing char
            }
            inp.cursorVisible = true;
            inp.lastBlink = performance.now();
            return;
        }
    }

    _onTouchStart(e) {
        if (this.blocked) return;
        const t = e.touches[0];
        if (!t) return;
        this._onMouseDown({ clientX: t.clientX, clientY: t.clientY });
        // Own the gesture when a button/slider is grabbed: preventDefault stops the page scrolling
        // and suppresses the emulated mouse/click; for a slider, jump the value to the touch point.
        // Input taps never reach here — they land on the transparent DOM overlay instead — and EMPTY
        // taps pass through so game.js's HUD/game handlers still fire.
        if (this.pressedButton || this.draggingSlider) {
            if (this.draggingSlider) this._onMouseMove({ clientX: t.clientX, clientY: t.clientY });
            this._touchActive = true;
            e.preventDefault();
        }
    }

    _onTouchMove(e) {
        if (!this._touchActive) return;
        const t = e.touches[0];
        if (!t) return;
        this._onMouseMove({ clientX: t.clientX, clientY: t.clientY });
        e.preventDefault();
    }

    _onTouchEnd(e) {
        if (!this._touchActive) return;
        const t = e.changedTouches[0];
        this._onMouseUp({ clientX: t ? t.clientX : 0, clientY: t ? t.clientY : 0 });
        this._touchActive = false;
        e.preventDefault();
    }

    // Build the transparent, real <input> that sits over one canvas field. Tapping it natively
    // focuses it (raising the keyboard); typing mirrors into the canvas field, which draws the
    // visible text/cursor. Positioned/sized each frame by _syncInputOverlays.
    _makeInputOverlay(inp) {
        _ensureOverlayStyle();
        const el = document.createElement('input');
        el.className = 'ui-input-overlay';
        el.type = 'text';
        el.autocomplete = 'off';
        el.autocapitalize = 'characters';
        el.setAttribute('autocorrect', 'off');
        el.spellcheck = false;
        el.maxLength = inp.maxLength;
        el.value = inp.value;
        // Genuinely present but see-through. opacity:1 (NOT 0) so the browser's native selection +
        // copy/paste menu (right-click / long-press) actually shows; everything is transparent
        // (text, caret, background, and the ::selection highlight via _ensureOverlayStyle) so nothing
        // is visible over the canvas — we draw the text/cursor/selection ourselves. 16px font stops
        // iOS zooming the page on focus; user-select/touch-callout keep the native menu enabled.
        Object.assign(el.style, {
            position: 'fixed', margin: '0', padding: '0', border: '0', outline: 'none',
            background: 'transparent', color: 'transparent', caretColor: 'transparent',
            opacity: '1', zIndex: '2147483000', fontSize: '16px', borderRadius: '0',
            WebkitAppearance: 'none', textAlign: 'center', fontFamily: 'IBMVGA', letterSpacing: '0',
            userSelect: 'text', WebkitUserSelect: 'text', WebkitTouchCallout: 'default'
        });

        el.addEventListener('focus', () => {
            for (const i of this.inputs) i.focused = (i === inp);
            this.focusedInput = inp;
            inp.cursorPos = inp.selStart = inp.selEnd = inp.value.length;
            inp.cursorVisible = true;
            inp.lastBlink = performance.now();
            // Mobile: park the caret at the end on tap-focus. Desktop: leave the native caret where
            // the click landed (mirrorSel picks it up) so click-to-position works.
            if (this.isMobile) { try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) { /* noop */ } }
        });
        el.addEventListener('input', () => {
            const v = el.value.toUpperCase().slice(0, inp.maxLength);
            el.value = v;                              // reflect casing/clamp back into the overlay
            inp.value = v;
            this._mirrorOverlaySelection();
        });
        // Click/drag: floor onto the clicked char (block cursor) and select the INCLUSIVE char range
        // on desktop; on mobile re-floor the native caret in the mirror. (See _onOverlayMouseDown.)
        el.addEventListener('mousedown', (e) => this._onOverlayMouseDown(e, el));
        el.addEventListener('mouseup',   ()  => { this._pendingFloor = null; });
        // Desktop double-click selects the whole field (mobile keeps native word-select).
        if (!this.isMobile) el.addEventListener('dblclick', (e) => {
            e.preventDefault(); el.focus();
            if (el.value.length) { this._drag = null; el.setSelectionRange(0, el.value.length); this._mirrorOverlaySelection(); }
        });
        // Soft-keyboard Enter bubbles to window, but _onKeyDown early-returns on mobile, so fire the
        // default button here.
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                const btn = this.buttons.find(b => b.isDefault);
                if (btn) btn.onClick();
            }
        });
        el.addEventListener('blur', () => {
            inp.focused = false;
            if (this.focusedInput === inp) this.focusedInput = null;
        });
        document.body.appendChild(el);
        return el;
    }

    // Keep one transparent overlay per canvas input, aligned to where the field is drawn. Called
    // every frame on mobile. Torn down during blocking transitions (which also drops the keyboard).
    _syncInputOverlays() {
        if (!this.useInputOverlay) return;
        if (this.blocked) { this._clearOverlays(); return; }

        const cr = this.canvas.getBoundingClientRect();
        const sx = cr.width / this.canvas.width;      // canvas.width is the logical width (1920)
        const sy = cr.height / this.canvas.height;
        const PAD = 10;                               // grow the hit area a touch for easy tapping

        // Drop overlays whose input no longer exists.
        for (const [inp, el] of this._overlays) {
            if (!this.inputs.includes(inp)) { el.remove(); this._overlays.delete(inp); }
        }
        // Create/position an overlay over each current field. inp.rect is set during draw; the field
        // is drawn at rect.y + offsetY. The CRT curve (a shader on top) is ignored — negligible near
        // centre, and PAD absorbs it.
        for (const inp of this.inputs) {
            if (!inp.rect) continue;
            let el = this._overlays.get(inp);
            if (!el) { el = this._makeInputOverlay(inp); this._overlays.set(inp, el); }
            el.maxLength = inp.maxLength;
            // Reflect programmatic value changes (e.g. a prefilled name) unless the user is typing.
            if (document.activeElement !== el && el.value !== inp.value) el.value = inp.value;
            // Match the canvas font (IBMVGA at the field's size, scaled to screen px) so the native
            // input's character metrics line up with what we draw → click/drag land on the right char.
            // Clamped to 16px so iOS doesn't zoom the page on focus.
            el.style.fontSize = Math.max(16, (inp.fontSize || 54) * sx) + 'px';
            el.style.left   = (cr.left + inp.rect.x * sx - PAD) + 'px';
            el.style.top    = (cr.top + (inp.rect.y + this.offsetY) * sy - PAD) + 'px';
            el.style.width  = (inp.rect.w * sx + PAD * 2) + 'px';
            el.style.height = (inp.rect.h * sy + PAD * 2) + 'px';
        }
    }

    _clearOverlays() {
        if (!this._overlays.size) return;
        for (const [, el] of this._overlays) el.remove();
        this._overlays.clear();
    }

    // True when one of our transparent input overlays has focus — i.e. the real <input> is handling
    // typing / selection / paste natively, so the canvas keydown & paste paths must stand down.
    _overlayFocused() {
        const a = document.activeElement;
        for (const [, el] of this._overlays) if (el === a) return true;
        return false;
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

        // The transparent DOM overlays own input focus/caret/selection natively (a tap/click lands on
        // them, not the canvas), so the canvas never hit-tests inputs. This block is the fallback for
        // when overlays are off.
        if (!this.useInputOverlay) {
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
        }

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
        // When an overlay <input> has focus it handles typing/shortcuts natively and mirrors in via
        // its `input`/selection events; ignore the bubbled keydown so nothing is inserted twice.
        if (this._overlayFocused()) return;

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
            // Do NOT preventDefault: let the browser fire its native `paste` event, which _onPaste
            // handles via e.clipboardData. That path needs no async-clipboard permission, so it
            // works in privacy browsers (DuckDuckGo) that block navigator.clipboard.readText().
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

    // Insert text at the cursor (replacing any selection), uppercased and clamped to maxLength.
    _insertText(inp, text) {
        const clean = text.replace(/[\r\n\t]/g, '').trim().toUpperCase();
        if (!clean) return;
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
    }

    // Native paste event — reads e.clipboardData synchronously, which needs no async-clipboard
    // permission, so Ctrl+V works even in privacy browsers (DuckDuckGo) that block readText().
    _onPaste(e) {
        if (this._overlayFocused()) return;   // the focused overlay <input> mirrors pastes via its input event
        if (this.blocked || !this.focusedInput) return;
        const data = e.clipboardData || window.clipboardData;
        if (!data) return;
        const text = data.getData('text');
        if (!text) return;
        e.preventDefault();
        this._insertText(this.focusedInput, text);
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

        // Keep the mobile keyboard overlays aligned to their fields (and torn down when blocked).
        this._syncInputOverlays();

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
        this._clearOverlays();   // remove field overlays / close the keyboard on screen change
    }
}