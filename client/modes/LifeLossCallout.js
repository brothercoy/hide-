// Animated "lost a life" callout. For each player who lost a life this round it shows
// "NAME: <old> Lives", then a block cursor (same as the input box, scaled to the font)
// backspaces the number and types the new value — one player at a time.
//   • To exactly ONE life: the word is re-typed instead of flipping — a pause, the caret
//     walks right across " Lives" (inverting each cell), backspaces "ves" → "Li", types
//     "fe" → "Life".
//   • To ZERO (eliminated): the word stays "Life" (never flips to "Lives"); after a pause
//     the whole "0 Life" value is consumed left-to-right input-field style (each cell
//     inverted as it deletes), then after a beat "DELETED" is typed.
// The player list is held at the old values and patched per entry as the cursor finishes
// each entry (onEntryDone) — for a morphing entry, only once its final word ("Life" /
// "DELETED") is fully typed, so the side panel flips in step with the callout.
import { theme } from '../ui/colors.js';
// Shared with the server (timings.js) so the animation length and the server's wait before
// advancing can't drift apart.
import {
    LIFE_LOSS_INTRO_MS as INTRO_PAUSE_MS,
    LIFE_LOSS_HOLD_MS as HOLD_MS,
    LIFE_LOSS_DEL_MS as DEL_MS,
    LIFE_LOSS_GAP_MS as GAP_MS,
    LIFE_LOSS_TYPE_MS as TYPE_MS,
    LIFE_LOSS_WORD_PAUSE_MS as WORD_PAUSE_MS,
    LIFE_LOSS_WORD_MOVE_MS as WORD_MOVE_MS,
    LIFE_LOSS_WORD_DEL_MS as WORD_DEL_MS,
    LIFE_LOSS_WORD_GAP_MS as WORD_GAP_MS,
    LIFE_LOSS_WORD_TYPE_MS as WORD_TYPE_MS,
    LIFE_LOSS_ELIM_DEL_MS as ELIM_DEL_MS,
    LIFE_LOSS_ELIM_TYPE_MS as ELIM_TYPE_MS,
    LIFE_LOSS_ENTRY_MS as ENTRY_MS,
    LIFE_LOSS_WORD_MS as WORD_MS,
    LIFE_LOSS_ELIM_MS as ELIM_MS,
} from '../../timings.js';

const LINE_GAP = 12;    // extra px between entry lines (purely visual — not synced)
const BLINK_MS = 500;   // cursor on/off half-period when parked (anchored to the last edit)
const NUM_END = HOLD_MS + DEL_MS + GAP_MS + TYPE_MS;   // ms into an entry when its number is fully typed
const MOVE_CELLS = 6;          // caret steps across " Lives" — space + L i v e s
const ELIM_VALUE = '0 Life';   // what an elimination consumes, cell by cell (6 cells)
const DELETED = 'DELETED';     // ...and then types

export class LifeLossCallout {
    constructor() {
        this.entries = [];      // [{ id, name, oldLives, newLives }]
        this.startTime = 0;
        this.active = false;
        this._done = 0;
        this.onEntryDone = null; // (entry) => void — when an entry's final value is fully typed
        this.onComplete = null;  // () => void — when every entry is done
    }

    isActive() { return this.active; }

    begin(entries, now) {
        this.entries = entries || [];
        this.startTime = now;
        this.active = this.entries.length > 0;
        this._done = 0;
    }

    clear() { this.entries = []; this.active = false; this._done = 0; }

    lineHeight(fontSize) { return fontSize + LINE_GAP; }

    // A morphing entry runs longer than a plain "lost a life": to-1-life adds the word re-type
    // (WORD_MS); elimination adds the consume + "DELETED" (ELIM_MS). Offsets, the total, and
    // the server's wait all derive from these so the pieces can't drift.
    _isToOne(e) { return e && e.newLives === 1; }
    _isElim(e)  { return e && e.newLives === 0; }
    _extra(e)   { return this._isToOne(e) ? WORD_MS : this._isElim(e) ? ELIM_MS : 0; }
    _entryDur(e) { return ENTRY_MS + this._extra(e); }
    _entryStart(i) { let s = 0; for (let j = 0; j < i; j++) s += this._entryDur(this.entries[j]); return s; }
    _totalDur() { let s = 0; for (const e of this.entries) s += this._entryDur(e); return s; }
    // When this entry's list value applies: number-done normally, but not until the morph's
    // final word ("Life" / "DELETED") is fully typed.
    _doneAt(i) {
        const e = this.entries[i];
        return INTRO_PAUSE_MS + this._entryStart(i) + NUM_END + this._extra(e);
    }

    update(now) {
        if (!this.active) return;
        const elapsed = now - this.startTime;
        while (this._done < this.entries.length && elapsed >= this._doneAt(this._done)) {
            const e = this.entries[this._done];
            this._done++;
            if (this.onEntryDone) this.onEntryDone(e);
        }
        if (elapsed >= INTRO_PAUSE_MS + this._totalDur()) {
            this.active = false;
            if (this.onComplete) this.onComplete();
        }
    }

    // The number string for entry i at `local` ms into that entry.
    _numStr(i, local) {
        const oldS = String(this.entries[i].oldLives);
        const newS = String(this.entries[i].newLives);
        if (local < HOLD_MS) return oldS;                                   // park on old
        if (local < HOLD_MS + DEL_MS) {
            const p = (local - HOLD_MS) / DEL_MS;
            return oldS.slice(0, Math.ceil(oldS.length * (1 - p)));         // backspacing
        }
        if (local < HOLD_MS + DEL_MS + GAP_MS) return '';
        if (local < NUM_END) {
            const p = (local - HOLD_MS - DEL_MS - GAP_MS) / TYPE_MS;
            return newS.slice(0, Math.min(newS.length, Math.ceil(newS.length * p))); // typing
        }
        return newS;                                                       // settled
    }

    _finalValue(e) { return this._isElim(e) ? DELETED : `${e.newLives} ${e.newLives === 1 ? 'Life' : 'Lives'}`; }
    _oldValue(e)   { return `${e.oldLives} ${e.oldLives === 1 ? 'Life' : 'Lives'}`; }

    // Display state for the ACTIVE entry at `local` ms in:
    //   value      — the text drawn after "NAME: "
    //   caretIndex — cell in `value` the block cursor sits at (>= length ⇒ block after value)
    //   invert     — draw value[caretIndex] in bg (inverted, like the input caret over a char)
    //   since      — ms since the last edit (drives the parked blink; 0 = solid)
    _entryState(i, local) {
        const e = this.entries[i];
        const isToOne = this._isToOne(e);
        const isElim = this._isElim(e);

        // Number phase (every entry). to-1 keeps "Lives" (morphs later); elim keeps "Life"
        // (never flips to "Lives"); others use the plain plural.
        if (local < NUM_END) {
            const num = this._numStr(i, local);
            const word = isToOne ? 'Lives' : isElim ? 'Life' : (num === '1' ? 'Life' : 'Lives');
            const delEnd = HOLD_MS + DEL_MS, typeStart = delEnd + GAP_MS;
            let since;
            if (local < HOLD_MS) since = local;                 // parked on old — anchored to landing
            else if (local < delEnd) since = 0;                 // backspacing — solid
            else if (local < typeStart) since = local - delEnd; // empty beat
            else since = 0;                                     // typing — solid
            return { value: `${num} ${word}`, caretIndex: num.length, invert: false, since };
        }

        // Settled, non-morphing entry (lost a life to 2+): park after the number.
        if (!isToOne && !isElim) {
            const newS = String(e.newLives);
            return { value: `${newS} ${newS === '1' ? 'Life' : 'Lives'}`, caretIndex: newS.length, invert: false, since: local - NUM_END };
        }

        const w = local - NUM_END;

        if (isToOne) {
            const pauseEnd = WORD_PAUSE_MS;
            const moveEnd = pauseEnd + WORD_MOVE_MS;
            const delEnd = moveEnd + WORD_DEL_MS;
            const gapEnd = delEnd + WORD_GAP_MS;
            const typeEnd = gapEnd + WORD_TYPE_MS;
            const after = (word) => `1 ${word}`.length;   // caret just after the word
            if (w < pauseEnd) return { value: '1 Lives', caretIndex: 1, invert: false, since: w };
            if (w < moveEnd) {
                const step = Math.min(MOVE_CELLS - 1, Math.floor((w - pauseEnd) / WORD_MOVE_MS * MOVE_CELLS));
                return { value: '1 Lives', caretIndex: 1 + step, invert: true, since: 0 };   // caret ON " Lives"[step]
            }
            if (w < delEnd) {                                    // backspace s, e, v → "Li"
                const word = 'Lives'.slice(0, Math.max(2, Math.ceil(5 - 3 * (w - moveEnd) / WORD_DEL_MS)));
                return { value: `1 ${word}`, caretIndex: after(word), invert: false, since: 0 };
            }
            if (w < gapEnd) return { value: '1 Li', caretIndex: 4, invert: false, since: w - delEnd };  // rest at "Li|"
            if (w < typeEnd) {                                   // type f, e → "Life"
                const word = 'Life'.slice(0, Math.min(4, 2 + Math.ceil(2 * (w - gapEnd) / WORD_TYPE_MS)));
                return { value: `1 ${word}`, caretIndex: after(word), invert: false, since: 0 };
            }
            return { value: '1 Life', caretIndex: 6, invert: false, since: w - typeEnd };  // settled on "Life"
        }

        // Elimination: pause on "0 Life" → consume it left-to-right (each cell inverted) → a
        // beat at the empty caret → type "DELETED".
        const pauseEnd = WORD_PAUSE_MS;
        const delEnd = pauseEnd + ELIM_DEL_MS;
        const gapEnd = delEnd + WORD_GAP_MS;
        const typeEnd = gapEnd + ELIM_TYPE_MS;
        if (w < pauseEnd) return { value: ELIM_VALUE, caretIndex: 1, invert: false, since: w };  // park on "0 Life", caret after "0"
        if (w < delEnd) {                                        // consume "0 Life" one cell at a time
            const eaten = Math.min(ELIM_VALUE.length, Math.floor((w - pauseEnd) / ELIM_DEL_MS * ELIM_VALUE.length));
            const value = ELIM_VALUE.slice(eaten);
            return { value, caretIndex: 0, invert: value.length > 0, since: 0 };  // block on the leftmost remaining cell
        }
        if (w < gapEnd) return { value: '', caretIndex: 0, invert: false, since: w - delEnd };  // brief rest at the empty caret
        if (w < typeEnd) {                                       // type "DELETED"
            const typed = Math.min(DELETED.length, Math.ceil((w - gapEnd) / ELIM_TYPE_MS * DELETED.length));
            const value = DELETED.slice(0, typed);
            return { value, caretIndex: value.length, invert: false, since: 0 };
        }
        return { value: DELETED, caretIndex: DELETED.length, invert: false, since: w - typeEnd };  // settled on "DELETED"
    }

    // Render the entries stacked, centered around (cx, cy).
    draw(ctx, cx, cy, fontSize, now) {
        if (!this.entries.length) return;
        const anim = (now - this.startTime) - INTRO_PAUSE_MS; // animation clock — negative during the intro pause
        const n = this.entries.length;

        // Which entry is animating, and how far into it — walk the (variable-length) entries.
        // Clamps to the last entry, which then holds (blinking) until the round advances.
        let activeIndex = -1, local = 0;
        if (anim >= 0) {
            let acc = 0, i = 0;
            for (; i < n - 1; i++) {
                const dur = this._entryDur(this.entries[i]);
                if (anim < acc + dur) break;
                acc += dur;
            }
            activeIndex = i;
            local = anim - acc;
        }

        ctx.font = `${fontSize}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const cw = ctx.measureText('M').width;
        const lineH = this.lineHeight(fontSize);
        const topY = cy - (n * lineH) / 2;

        this.entries.forEach((e, i) => {
            let value, caretIndex = -1, invert = false, showCursor = false;
            if (i < activeIndex)      value = this._finalValue(e);   // done
            else if (i > activeIndex) value = this._oldValue(e);     // pending / intro
            else {                                                   // the active one
                const st = this._entryState(i, local);
                value = st.value; caretIndex = st.caretIndex; invert = st.invert;
                showCursor = Math.floor(st.since / BLINK_MS) % 2 === 0;
            }
            const prefix = `${e.name}: `;
            // Anchor on the old-number line so the prefix stays put while the value is edited.
            const refW = ctx.measureText(`${prefix}${e.oldLives} Lives`).width;
            const x = cx - refW / 2;
            const y = topY + i * lineH;
            ctx.fillStyle = theme.fg;

            if (showCursor && invert && caretIndex >= 0 && caretIndex < value.length) {
                // Caret sitting ON a cell — draw around it, the block over it, then that char
                // in bg so it reads inverted (exactly like the input box).
                const pre = prefix + value.slice(0, caretIndex);
                const caretChar = value[caretIndex];
                const post = value.slice(caretIndex + 1);
                const caretX = x + ctx.measureText(pre).width;
                ctx.fillText(pre, x, y);
                ctx.fillText(post, caretX + ctx.measureText(caretChar).width, y);
                ctx.fillRect(caretX, y + 2, cw - 2, fontSize - 4);
                ctx.fillStyle = theme.bg;
                ctx.fillText(caretChar, caretX, y);
                ctx.fillStyle = theme.fg;
            } else {
                ctx.fillText(prefix + value, x, y);
                if (showCursor && caretIndex >= 0) {
                    const caretX = x + ctx.measureText(prefix + value.slice(0, caretIndex)).width;
                    ctx.fillRect(caretX, y + 2, cw - 2, fontSize - 4);
                }
            }
        });
    }
}
