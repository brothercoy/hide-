// Types a keyed row's text in one character at a time — the same page-load feel as the screen
// transition — the FIRST time a key shows up after the initial batch. The initial roster (the first
// non-empty sync, or anything present right after reset) is shown instantly, so a list that a screen
// transition already types in doesn't re-type; only rows that appear later (a player joining, a new
// spectator) animate.
const TYPE_CHAR_MS = 20;   // matches Transition's base per-char rate

export class RowReveal {
    constructor() { this.seen = new Map(); this.primed = false; }

    // Register the currently-visible row keys — call once per update (lobby) or per frame (game).
    // Keys in the first non-empty batch are marked already-shown; keys that appear after that get a
    // start time and type in. Vanished keys are dropped so a re-join re-animates.
    sync(keys, now = Date.now()) {
        for (const k of keys) {
            if (!this.seen.has(k)) this.seen.set(k, this.primed ? now : 0);   // 0 = show instantly
        }
        for (const k of [...this.seen.keys()]) {
            if (!keys.includes(k)) this.seen.delete(k);
        }
        if (keys.length) this.primed = true;   // only prime once a real roster has been seen
    }

    // The visible prefix of `str` for `key` this frame — the whole string once typing is done, or for
    // any key that was part of the initial batch.
    text(key, str, now = Date.now()) {
        const t0 = this.seen.get(key);
        if (!t0) return str;   // unknown key, or 0 (initial batch) → full
        const n = Math.floor((now - t0) / TYPE_CHAR_MS);
        return n >= str.length ? str : str.slice(0, n);
    }

    // How many characters (columns) of a row have been revealed for `key` this frame; Infinity for an
    // initial-batch / unknown key (fully shown). Feed to drawRevealSegments to type a whole row.
    count(key, now = Date.now()) {
        const t0 = this.seen.get(key);
        if (!t0) return Infinity;   // unknown key, or 0 (initial batch) → fully shown
        return Math.floor((now - t0) / TYPE_CHAR_MS);
    }

    reset() { this.seen.clear(); this.primed = false; }
}

// Draw a monospace row as left-aligned segments revealed left-to-right by COLUMN, so the name, the
// dot-leader/gap, and the trailing label/value all type in as one continuous sweep. Each segment is
// { text, x, col } where `col` is its starting column (chars from the row's left edge); `n` is the
// revealed column count from RowReveal.count(). A right-aligned element is passed as a left-aligned
// segment at its left-edge x, so a fully-revealed row looks identical to a plain right-aligned draw.
export function drawRevealSegments(ctx, segments, n, y) {
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const s of segments) {
        const shown = Math.min(s.text.length, n - s.col);
        if (shown > 0) ctx.fillText(s.text.slice(0, shown), s.x, y);
    }
    ctx.textAlign = prevAlign;
}
