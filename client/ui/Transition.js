// Screen transition — terminal feed typeout.
//
// Moving from screen A to screen B: B is typed in one HORIZONTAL ROW at a time,
// exactly like a terminal. All content sharing a Y (e.g. the top borders of two
// side-by-side buttons) forms one row; its segments type left-to-right. While a
// row types, the vertical scroll is frozen. Only when the row finishes and the
// next row begins does the composite scroll up ("enter"). A larger vertical gap
// between rows scrolls farther, so it reads as one or more empty enters. When
// the feed finishes, B sits exactly at its true layout and A has scrolled off.
//
// Screens supply a flat array of row segments via getTypeables(), each
// { y, x, cost, draw(ctx, n, elapsed) }: `y` groups segments into rows, `x`
// orders them left-to-right within a row, `cost` is the segment's char count,
// and `draw` renders its first `n` characters at natural layout coordinates.

const TYPE_CHAR_MS = 20;       // ms per character while typing a row
const ROW_PX = 30;             // pixels per "enter" step — smaller = more bumps per gap
const SCROLL_PER_ROW_MS = 10;  // ms per enter step (one bump: move + pause)
const STEP_MOVE_FRAC = 0.1;    // fraction of each step spent moving (rest is a pause)
const SCROLL_ONLY_MS = 600;    // duration of a plain scroll-off (e.g. into MainMenu)

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// --- Typeable factory: static text -----------------------------------------
// (Element rows come from buttonRows/inputRows/sliderRows in the ui modules.)
// `groupY` optionally overrides the row-grouping Y while the text still draws at
// `y` — use it to type a glyph as part of a row it isn't vertically centered on.
export function textRow(text, x, y, font, align, baseline, color, groupY) {
    return {
        y: groupY !== undefined ? groupY : y,
        x,
        cost: text.length,
        draw(ctx, n) {
            ctx.font = font;
            ctx.textAlign = align || 'left';
            ctx.textBaseline = baseline || 'top';
            ctx.fillStyle = color || '#00ff41';
            ctx.globalAlpha = 1;
            ctx.fillText(text.slice(0, n), x, y);
        }
    };
}

export class Transition {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;

        this.fromCanvas = document.createElement('canvas');
        this.fromCtx = this.fromCanvas.getContext('2d');

        this.active = false;
        this.scrollOnly = false;
        this.elapsedMs = 0;
        this.totalDur = 0;
        this.H = 0;
        this.rows = [];      // [{ y, cost, segs:[{x,cost,draw}] }] sorted by y
        this.phases = [];    // ordered { kind:'scroll'|'type', start, dur, ... }
        this.onComplete = null;
    }

    isActive() { return this.active; }

    _snapshot() {
        const w = this.canvas.width, h = this.canvas.height;
        if (this.fromCanvas.width !== w) this.fromCanvas.width = w;
        if (this.fromCanvas.height !== h) this.fromCanvas.height = h;
        this.fromCtx.clearRect(0, 0, w, h);
        this.fromCtx.drawImage(this.canvas, 0, 0);
        this.H = h;
    }

    // Group flat segments into rows by Y, sort rows top-to-bottom, segments
    // left-to-right within each row.
    _buildRows(segments) {
        const groups = new Map();
        for (const seg of segments) {
            const key = Math.round(seg.y);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(seg);
        }
        return [...groups.keys()].sort((a, b) => a - b).map(key => {
            const segs = groups.get(key).sort((a, b) => a.x - b.x);
            return { y: key, segs, cost: segs.reduce((s, seg) => s + seg.cost, 0) };
        });
    }

    // Typeout feed: type B in row by row while A scrolls off in steps.
    begin({ typeables, onComplete }) {
        this._snapshot();
        const H = this.H;

        this.rows = this._buildRows(typeables || []);
        this.scrollOnly = false;
        this.onComplete = onComplete || null;
        this.elapsedMs = 0;

        // Feed line sits at the last (bottom-most) row's Y so the final row is
        // typed exactly where it belongs (offset 0). Each row types at the feed
        // line, then the stack scrolls up to bring the next row down to it.
        const yLast = this.rows.length ? this.rows[this.rows.length - 1].y : 0;
        this.rows.forEach(r => { r.offset = yLast - r.y; });

        // Timeline: scroll-to then type, per row. First scroll starts with A
        // filling the screen (offset = H).
        this.phases = [];
        let cursor = 0;
        let prevOffset = H;
        for (let k = 0; k < this.rows.length; k++) {
            const r = this.rows[k];
            const dist = Math.abs(prevOffset - r.offset);
            // Break the gap into ROW_PX-sized "enter" steps; each step is one bump.
            const steps = Math.max(1, Math.round(dist / ROW_PX));
            const sdur = steps * SCROLL_PER_ROW_MS;
            this.phases.push({ kind: 'scroll', from: prevOffset, to: r.offset, start: cursor, dur: sdur, steps });
            cursor += sdur;

            const tdur = Math.max(1, r.cost * TYPE_CHAR_MS);
            this.phases.push({ kind: 'type', row: k, start: cursor, dur: tdur });
            cursor += tdur;

            prevOffset = r.offset;
        }
        this.totalDur = Math.max(1, cursor);
        this.active = true;
    }

    // Scroll A off the top over a fixed duration, revealing whatever the
    // incoming screen draws underneath (its own intro animation).
    beginScrollOnly({ durationMs, onComplete } = {}) {
        this._snapshot();
        this.rows = [];
        this.phases = [];
        this.scrollOnly = true;
        this.totalDur = durationMs || SCROLL_ONLY_MS;
        this.onComplete = onComplete || null;
        this.elapsedMs = 0;
        this.active = true;
    }

    update(dtMs) {
        if (!this.active) return;
        this.elapsedMs += dtMs;
        if (this.elapsedMs >= this.totalDur) this._finish();
    }

    _finish() {
        this.active = false;
        const cb = this.onComplete;
        this.onComplete = null;
        if (cb) cb();
    }

    cancelToEnd() {
        if (!this.active) return;
        this.elapsedMs = this.totalDur;
        this._finish();
    }

    // Current vertical offset of the incoming screen at the current time.
    _sampleOffset() {
        const e = this.elapsedMs;
        for (let i = this.phases.length - 1; i >= 0; i--) {
            const p = this.phases[i];
            if (e < p.start) continue;
            if (p.kind === 'scroll') {
                // Stepped: bump one ROW_PX-sized chunk at a time, pausing between.
                const stepDur = p.dur / p.steps;
                const et = e - p.start;
                const i = Math.min(p.steps - 1, Math.floor(et / stepDur));
                const within = et - i * stepDur;
                const moveT = STEP_MOVE_FRAC <= 0 ? 1 : Math.min(1, within / (stepDur * STEP_MOVE_FRAC));
                const stepSize = (p.to - p.from) / p.steps;
                const segStart = p.from + i * stepSize;
                return segStart + stepSize * easeInOut(moveT);
            }
            return this.rows[p.row].offset;
        }
        return this.rows.length ? this.H : 0;
    }

    // Characters revealed for a row at the current time (0..row.cost).
    _rowReveal(k) {
        const p = this.phases[k * 2 + 1]; // type phase for row k
        if (!p) return 0;
        const e = this.elapsedMs;
        if (e >= p.start + p.dur) return this.rows[k].cost;
        if (e >= p.start) return Math.floor((e - p.start) / TYPE_CHAR_MS);
        return 0;
    }

    render(elapsed, drawSteady) {
        const ctx = this.ctx;
        const H = this.H;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        let offset;
        if (this.scrollOnly) {
            const feed = Math.min(1, this.elapsedMs / this.totalDur);
            offset = H * (1 - feed);
            if (drawSteady) drawSteady();
        } else {
            offset = this._sampleOffset();
            ctx.save();
            ctx.translate(0, offset);
            for (let k = 0; k < this.rows.length; k++) {
                let remaining = this._rowReveal(k);
                if (remaining <= 0) continue;
                for (const seg of this.rows[k].segs) {
                    if (remaining <= 0) break;
                    const n = Math.min(seg.cost, remaining);
                    seg.draw(ctx, n, elapsed);
                    remaining -= n;
                }
            }
            ctx.restore();
        }

        // Outgoing screen A rides the same offset, scrolling up and off.
        ctx.drawImage(this.fromCanvas, 0, offset - H);
    }
}
