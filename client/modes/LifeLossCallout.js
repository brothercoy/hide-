// Animated "lost a life" callout. For each player who lost a life this round it
// shows "NAME: <old> Lives", then a block cursor (same as the input box, scaled to
// the font) backspaces the number and types the new value — one player at a time.
// The player list is held at the old values and patched per entry as the cursor
// finishes it (via onEntryDone), so the list updates in step with the animation.
import { theme } from '../ui/colors.js';

const INTRO_PAUSE_MS = 350; // text shows first, brief pause, THEN the cursor appears
const HOLD_MS = 500;    // cursor parks on the old number
const DEL_MS = 160;     // backspace the old number
const GAP_MS = 130;     // empty beat
const TYPE_MS = 160;    // type the new number
const SETTLE_MS = 550;  // cursor parks on the new number before moving on
const ENTRY_MS = HOLD_MS + DEL_MS + GAP_MS + TYPE_MS + SETTLE_MS; // 1500 — must match server LIFE_LOSS_ENTRY_MS
const LINE_GAP = 12;    // extra px between entry lines

const typeDoneAt = (i) => INTRO_PAUSE_MS + i * ENTRY_MS + HOLD_MS + DEL_MS + GAP_MS + TYPE_MS;

export class LifeLossCallout {
    constructor() {
        this.entries = [];      // [{ name, oldLives, newLives }]
        this.startTime = 0;
        this.active = false;
        this._done = 0;
        this.onEntryDone = null; // (entry) => void — when an entry finishes typing
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

    update(now) {
        if (!this.active) return;
        const elapsed = now - this.startTime;
        while (this._done < this.entries.length && elapsed >= typeDoneAt(this._done)) {
            const e = this.entries[this._done];
            this._done++;
            if (this.onEntryDone) this.onEntryDone(e);
        }
        if (elapsed >= INTRO_PAUSE_MS + this.entries.length * ENTRY_MS) {
            this.active = false;
            if (this.onComplete) this.onComplete();
        }
    }

    // The number string shown for the ACTIVE entry at the current time.
    _numStr(i, elapsed) {
        const local = elapsed - i * ENTRY_MS;
        const oldS = String(this.entries[i].oldLives);
        const newS = String(this.entries[i].newLives);
        if (local < HOLD_MS) return oldS;                                   // park on old
        if (local < HOLD_MS + DEL_MS) {
            const p = (local - HOLD_MS) / DEL_MS;
            return oldS.slice(0, Math.ceil(oldS.length * (1 - p)));         // backspacing
        }
        if (local < HOLD_MS + DEL_MS + GAP_MS) return '';
        if (local < HOLD_MS + DEL_MS + GAP_MS + TYPE_MS) {
            const p = (local - HOLD_MS - DEL_MS - GAP_MS) / TYPE_MS;
            return newS.slice(0, Math.min(newS.length, Math.ceil(newS.length * p))); // typing
        }
        return newS;                                                       // settled (last entry holds here)
    }

    // Render the entries stacked, centered around (cx, cy).
    draw(ctx, cx, cy, fontSize, now) {
        if (!this.entries.length) return;
        const elapsed = now - this.startTime;
        const anim = elapsed - INTRO_PAUSE_MS; // animation clock — negative during the intro pause
        const intro = anim < 0;                // text is up, cursor hasn't appeared yet
        const n = this.entries.length;
        // The cursor is on this entry; once the last entry is reached it stays
        // there. The cursor is SOLID for the whole run (every player's backspace/
        // type) and only blinks once every player is done — parked on the last one
        // until the round/game advances.
        const activeIndex = intro ? -1 : Math.min(Math.floor(anim / ENTRY_MS), n - 1);
        const animDone = anim >= n * ENTRY_MS;
        const blinkOn = Math.floor(now / 500) % 2 === 0; // matches the input cursor blink

        ctx.font = `${fontSize}px "IBMVGA"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const cw = ctx.measureText('M').width;
        const lineH = this.lineHeight(fontSize);
        const topY = cy - (n * lineH) / 2;

        this.entries.forEach((e, i) => {
            let num, showCursor = false;
            if (i < activeIndex) num = String(e.newLives);       // done — no cursor
            else if (i > activeIndex) num = String(e.oldLives);  // pending / intro — no cursor
            else {
                num = this._numStr(i, anim);
                showCursor = animDone ? blinkOn : true;          // solid while running, blink at the end
            }
            const plural = num === '1' ? 'Life' : 'Lives';
            const prefix = `${e.name}: `;
            // Anchor on the old-number line so the prefix stays put while the number
            // is edited (the suffix shifts — natural typing, no re-centering jiggle).
            const refW = ctx.measureText(`${prefix}${e.oldLives} Lives`).width;
            const x = cx - refW / 2;
            const y = topY + i * lineH;
            ctx.fillStyle = theme.fg;
            ctx.fillText(`${prefix}${num} ${plural}`, x, y);
            if (showCursor) {
                // Block cursor, same as the input box (sized to the font).
                const cursorX = x + ctx.measureText(prefix + num).width;
                ctx.fillRect(cursorX, y + 2, cw - 2, fontSize - 4);
            }
        });
    }
}
