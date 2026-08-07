// lab.js — SOUND LAB (served at /button-test.html under `npm run dev`).
// Stage 1: SFX patch editor + oscilloscope. Tracker (music) is stage 2.
//
// Workflow: click a preset to hear it → tweak sliders (replays on release) →
// press E / click EXPORT to copy the whole edited bank as JSON → paste it back
// into client/audio/patches.js (or hand it to Claude).

import { initAudio, audioReady, playPatch, startSustain, setMasterVolume, getMasterVolume, getAnalyser } from './SoundEngine.js';
import { PATCHES } from './patches.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resize();
window.addEventListener('resize', resize);

const FS = 22;                       // font size
const LH = 30;                       // line height
const BRIGHT = '#00ff41';
const MID    = '#007a1f';
const DIM    = '#003d0f';

// ── Editable bank (deep clone — presets in patches.js stay pristine) ─────────
// Three tiers: DEFAULTS = patches.js on disk · SAVE (S) = localStorage, survives
// refresh · EXPORT (E) = clipboard JSON, paste back into patches.js to commit.
const SAVE_KEY = 'soundlab_bank_v1';
const bank = structuredClone(PATCHES);
try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (saved) for (const k of Object.keys(saved)) if (bank[k]) bank[k] = saved[k];
} catch { /* corrupt save — fall back to defaults */ }
const keys = Object.keys(bank);
let currentKey = 'KICK';
let voiceIdx = 0;
const voiceSel = {};                 // per-patch memory of the last selected voice tab
function setVoiceIdx(i) { voiceIdx = i; voiceSel[currentKey] = i; }
const activeSustains = new Map();    // key -> handle from startSustain

function isModified(key) {
    return JSON.stringify(bank[key]) !== JSON.stringify(PATCHES[key]);
}
function saveBank() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(bank));
    flash('SAVED — SURVIVES REFRESH');
}
function resetPatch() {
    bank[currentKey] = structuredClone(PATCHES[currentKey]);
    setVoiceIdx(0);
    flash(currentKey + ' RESET TO DEFAULT');
}
function resetAll() {
    localStorage.removeItem(SAVE_KEY);
    for (const k of keys) { bank[k] = structuredClone(PATCHES[k]); delete voiceSel[k]; }
    voiceIdx = 0;
    flash('ALL PATCHES RESET TO DEFAULTS');
}

let flashMsg = '', flashUntil = 0;
function flash(msg, ms = 2000) { flashMsg = msg; flashUntil = performance.now() + ms; }

// ── Param rows ───────────────────────────────────────────────────────────────
const WAVES = ['sine', 'square', 'triangle', 'sawtooth', 'noise'];
const FILTERS = [null, 'lowpass', 'highpass', 'bandpass'];

const fmtHz = v => v >= 1000 ? (v / 1000).toFixed(2) + 'KHZ' : Math.round(v) + 'HZ';
const fmtT  = v => v >= 1 ? v.toFixed(2) + 'S' : Math.round(v * 1000) + 'MS';

function paramRows(v) {
    const isNoise = v.wave === 'noise';
    const rows = [
        { kind: 'cycle', label: 'WAVE', options: WAVES,
          get: () => v.wave, set: x => { v.wave = x; } },
        { kind: 'slider', label: 'FREQ', min: 20, max: 8000, log: true, fmt: fmtHz, dim: isNoise,
          get: () => v.freq || 440, set: x => { v.freq = Math.round(x); } },
        { kind: 'slider', label: 'SLIDE', min: 20, max: 8000, log: true, nullable: true, dim: isNoise,
          fmt: x => x ? fmtHz(x) : 'OFF',
          get: () => v.freqEnd, set: x => { v.freqEnd = x === null ? null : Math.round(x); } },
        { kind: 'slider', label: 'DELAY', min: 0, max: 0.5, fmt: fmtT,
          get: () => v.delay || 0, set: x => { v.delay = round3(x); } },
        { kind: 'slider', label: 'ATTACK', min: 0.001, max: 0.5, log: true, fmt: fmtT,
          get: () => v.attack || 0.001, set: x => { v.attack = round3(x); } },
        { kind: 'slider', label: 'DECAY', min: 0.005, max: 3, log: true, fmt: fmtT,
          get: () => v.decay || 0.1, set: x => { v.decay = round3(x); } },
        { kind: 'slider', label: 'GAIN', min: 0, max: 1, fmt: x => x.toFixed(2),
          get: () => v.gain ?? 0.3, set: x => { v.gain = round3(x); } },
        { kind: 'cycle', label: 'FILTER', options: FILTERS,
          get: () => v.filter ? v.filter.type : null,
          set: x => { v.filter = x === null ? null : { type: x, cutoff: v.filter?.cutoff || 2000, q: v.filter?.q || 1 }; } },
    ];
    if (v.filter) {
        rows.push(
            { kind: 'slider', label: 'CUTOFF', min: 100, max: 12000, log: true, fmt: fmtHz,
              get: () => v.filter.cutoff, set: x => { v.filter.cutoff = Math.round(x); } },
            { kind: 'slider', label: 'CUT-END', min: 100, max: 12000, log: true, nullable: true,
              fmt: x => x ? fmtHz(x) : 'OFF',
              get: () => v.filter.cutoffEnd ?? null,
              set: x => { v.filter.cutoffEnd = x === null ? null : Math.round(x); } },
            { kind: 'slider', label: 'Q', min: 0.3, max: 20, log: true, fmt: x => x.toFixed(1),
              get: () => v.filter.q, set: x => { v.filter.q = round3(x); } },
        );
    }
    return rows;
}
const round3 = x => Math.round(x * 1000) / 1000;

function posToVal(row, pos) {
    pos = Math.max(0, Math.min(1, pos));
    if (row.nullable && pos < 0.03) return null;
    if (row.log) return row.min * Math.pow(row.max / row.min, pos);
    return row.min + pos * (row.max - row.min);
}
function valToPos(row, val) {
    if (val === null || val === undefined) return 0;
    if (row.log) return Math.log(Math.max(row.min, val) / row.min) / Math.log(row.max / row.min);
    return (val - row.min) / (row.max - row.min);
}

// ── Playback ─────────────────────────────────────────────────────────────────
function playCurrent() {
    if (!audioReady()) return;
    const patch = bank[currentKey];
    if (patch.sustain) {
        const h = activeSustains.get(currentKey);
        if (h) { h.stop(); activeSustains.delete(currentKey); }
        else activeSustains.set(currentKey, startSustain(patch));
    } else {
        playPatch(patch);
    }
}
// After a slider tweak: one-shots replay; active sustains restart so you hear the change.
function auditionChange() {
    if (!audioReady()) return;
    const patch = bank[currentKey];
    if (patch.sustain) {
        const h = activeSustains.get(currentKey);
        if (h) { h.stop(); activeSustains.set(currentKey, startSustain(patch)); }
    } else {
        playPatch(patch);
    }
}

function exportBank() {
    const json = JSON.stringify(bank, null, 2);
    console.log(json);
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(json)
            .then(() => flash('BANK COPIED TO CLIPBOARD'))
            .catch(() => flash('CLIPBOARD BLOCKED — JSON IN CONSOLE'));
    } else {
        flash('NO CLIPBOARD — JSON IN CONSOLE');
    }
}

// ── Hit regions (rebuilt every frame) ────────────────────────────────────────
let hits = [];   // { x, y, w, h, onDown(mx), onDrag(mx)? }
function addHit(x, y, w, h, onDown, onDrag) { hits.push({ x, y, w, h, onDown, onDrag }); }

// ── Drawing ──────────────────────────────────────────────────────────────────
function text(str, x, y, color = BRIGHT, fs = FS) {
    ctx.font = `${fs}px "IBMVGA"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
}
function charW(fs = FS) {
    ctx.font = `${fs}px "IBMVGA"`;
    return ctx.measureText('M').width;
}

function drawHeader() {
    const cw = charW();
    text('SOUND LAB', 40, 24, BRIGHT);
    text('[ SFX EDITOR ]', 40 + cw * 12, 24, BRIGHT);
    text('TRACKER', 40 + cw * 28, 24, DIM);
    text('BOARD', 40 + cw * 37, 24, DIM);

    // SAVE / EXPORT buttons (right side)
    const exStr = '[ EXPORT ]';
    const exX = canvas.width - 40 - cw * (exStr.length + 22);
    text(exStr, exX, 24, BRIGHT);
    addHit(exX, 24, cw * exStr.length, LH, exportBank);
    const svStr = '[ SAVE ]';
    const svX = exX - cw * (svStr.length + 2);
    text(svStr, svX, 24, BRIGHT);
    addHit(svX, 24, cw * svStr.length, LH, saveBank);

    // Master volume mini-slider (far right)
    const mvRow = { min: 0, max: 1 };
    const N = 12;
    const mvX = canvas.width - 40 - cw * (N + 8);
    const vol = getMasterVolume();
    const idx = Math.round(vol * (N - 1));
    let track = '';
    for (let i = 0; i < N; i++) track += i === idx ? '#' : (i < idx ? '=' : '-');
    text('VOL |' + track + '|', mvX, 24, MID);
    const trackX = mvX + cw * 5;
    addHit(trackX, 24, cw * N, LH, null, mx => {
        setMasterVolume(Math.max(0, Math.min(1, (mx - trackX) / (cw * N))));
    });

    if (performance.now() < flashUntil) {
        ctx.textAlign = 'center';
        ctx.fillStyle = BRIGHT;
        ctx.fillText(flashMsg, canvas.width / 2, 60);
        ctx.textAlign = 'left';
    }
    if (!audioReady()) {
        ctx.textAlign = 'center';
        ctx.fillStyle = MID;
        ctx.fillText('CLICK ANYWHERE TO POWER ON AUDIO', canvas.width / 2, 60);
        ctx.textAlign = 'left';
    }
}

function drawPresetList() {
    const cw = charW();
    const x = 40;
    let y = 100;
    text('-- PATCH BANK --', x, y, MID); y += LH + 6;
    for (const key of keys) {
        const sel = key === currentKey;
        const on = activeSustains.has(key);
        const label = (sel ? '> ' : '  ') + key + (isModified(key) ? '*' : '')
            + (bank[key].sustain ? (on ? ' <ON>' : ' <..>') : '');
        text(label, x, y, sel ? BRIGHT : MID);
        const w = cw * (label.length + 2);
        const yy = y;
        addHit(x, yy, w, LH, () => {
            if (currentKey !== key) { currentKey = key; voiceIdx = voiceSel[key] ?? 0; }
            playCurrent();
        });
        y += LH;
    }
    y += 10;
    text('SPACE=PLAY  T=TYPE TEST', x, y, DIM); y += LH * 0.8;
    text('S=SAVE  E=EXPORT  1-9=VOICE', x, y, DIM); y += LH * 0.8;
    text('R=RESET PATCH  SHIFT+R=ALL', x, y, DIM); y += LH * 0.8;
    text('* = EDITED (DIFFERS FROM DEFAULT)', x, y, DIM);
}

function drawEditor() {
    const cw = charW();
    const x = Math.max(420, Math.floor(canvas.width * 0.34));
    let y = 100;
    const patch = bank[currentKey];

    text(patch.name, x, y, BRIGHT); y += LH;
    text(patch.desc || '', x, y, DIM); y += LH + 8;

    // Voice tabs
    let vx = x;
    text('VOICE:', vx, y, MID); vx += cw * 7;
    patch.voices.forEach((_, i) => {
        const lbl = i === voiceIdx ? `[${i + 1}]` : `${i + 1}`;
        text(lbl, vx, y, i === voiceIdx ? BRIGHT : MID);
        const xx = vx;
        addHit(xx, y, cw * lbl.length, LH, () => { setVoiceIdx(i); });
        vx += cw * (lbl.length + 0.7);
    });
    vx += cw;
    text('+ADD', vx, y, MID);
    addHit(vx, y, cw * 4, LH, () => {
        if (patch.voices.length >= 24) return;
        patch.voices.push(structuredClone(patch.voices[voiceIdx]));
        setVoiceIdx(patch.voices.length - 1);
    });
    vx += cw * 6;
    text('-DEL', vx, y, patch.voices.length > 1 ? MID : DIM);
    addHit(vx, y, cw * 4, LH, () => {
        if (patch.voices.length <= 1) return;
        patch.voices.splice(voiceIdx, 1);
        setVoiceIdx(Math.min(voiceIdx, patch.voices.length - 1));
    });
    y += LH + 12;

    // Param rows
    if (voiceIdx >= patch.voices.length) setVoiceIdx(0);
    const v = patch.voices[voiceIdx];
    const N = 24;                          // slider track cells
    const labelW = 8, valueW = 8;

    function renderRow(row) {
        const color = row.dim ? DIM : MID;
        const valColor = row.dim ? DIM : BRIGHT;
        text(row.label.padEnd(labelW), x, y, color);

        if (row.kind === 'cycle') {
            const cur = row.get();
            const disp = `< ${String(cur === null ? 'NONE' : cur).toUpperCase()} >`;
            text(disp, x + cw * labelW, y, valColor);
            const xx = x + cw * labelW, yy = y;
            addHit(xx, yy, cw * disp.length, LH, () => {
                const opts = row.options;
                const next = opts[(opts.indexOf(cur) + 1) % opts.length];
                row.set(next);
                auditionChange();
            });
        } else {
            const val = row.get();
            const pos = valToPos(row, val);
            const idx = Math.round(pos * (N - 1));
            let track = '';
            for (let i = 0; i < N; i++) track += i === idx ? '#' : (i < idx ? '=' : '-');
            text(String(row.fmt(val)).padStart(valueW), x + cw * labelW, y, valColor);
            const trackX = x + cw * (labelW + valueW + 1);
            text('|' + track + '|', trackX, y, color);
            const innerX = trackX + cw;
            const yy = y;
            addHit(innerX - cw, yy, cw * (N + 2), LH, null, mx => {
                row.set(posToVal(row, (mx - innerX) / (cw * N)));
            });
        }
        y += LH;
    }

    for (const row of paramRows(v)) renderRow(row);

    // Patch-level humanization — rolled once per trigger, applied to the whole hit
    y += 6;
    text('-- PER-TRIGGER VARY (WHOLE PATCH) --', x, y, DIM); y += LH;
    const pct = x2 => Math.round(x2 * 100) + '%';
    renderRow({ kind: 'slider', label: 'V-PITCH', min: 0, max: 0.3, fmt: pct,
        get: () => patch.vary?.freq || 0,
        set: val => { patch.vary = patch.vary || {}; patch.vary.freq = round3(val); } });
    renderRow({ kind: 'slider', label: 'V-GAIN', min: 0, max: 0.5, fmt: pct,
        get: () => patch.vary?.gain || 0,
        set: val => { patch.vary = patch.vary || {}; patch.vary.gain = round3(val); } });
    y += 8;
    const total = Math.max(...patch.voices.map(vv => (vv.delay || 0) + (vv.attack || 0) + (vv.decay || 0.1)));
    text(`LENGTH ${fmtT(total)}   ${patch.sustain ? 'SUSTAIN (CLICK NAME TO TOGGLE)' : 'ONE-SHOT'}`, x, y, DIM);
}

function drawScope() {
    const an = getAnalyser();
    const x0 = 40, x1 = canvas.width - 40;
    const yMid = canvas.height - 105;
    const half = 65;
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, yMid - half, x1 - x0, half * 2);
    text('SCOPE', x0 + 8, yMid - half - LH + 4, DIM, 16);
    if (!an) return;
    const data = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(data);
    ctx.strokeStyle = BRIGHT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
        const px = x0 + (i / (data.length - 1)) * (x1 - x0);
        const py = yMid - data[i] * half * 1.8;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
}

// ── Main loop ────────────────────────────────────────────────────────────────
function loop() {
    hits = [];
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawHeader();
    drawPresetList();
    drawEditor();
    drawScope();
    requestAnimationFrame(loop);
}
document.fonts.ready.then(loop);

// ── Input ────────────────────────────────────────────────────────────────────
let dragging = null;      // hit region being dragged
let draggedSinceDown = false;

function mxy(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
}

canvas.addEventListener('mousedown', e => {
    initAudio();
    const [mx, my] = mxy(e);
    draggedSinceDown = false;
    for (const h of hits) {
        if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
            if (h.onDrag) { dragging = h; h.onDrag(mx); draggedSinceDown = true; }
            else if (h.onDown) h.onDown(mx);
            return;
        }
    }
});
canvas.addEventListener('mousemove', e => {
    if (!dragging) return;
    const [mx] = mxy(e);
    dragging.onDrag(mx);
});
window.addEventListener('mouseup', () => {
    if (dragging && draggedSinceDown) {
        // param sliders live inside the editor — replay so the tweak is heard
        if (dragging.onDrag && dragging.x > 300) auditionChange();
    }
    dragging = null;
});

// Simulated burst of typing — 8 triggers with human-jittered gaps, to judge variation
function typeTest() {
    if (!audioReady() || bank[currentKey].sustain) return;
    let t = 0;
    for (let i = 0; i < 8; i++) {
        playPatch(bank[currentKey], t);
        t += 0.05 + Math.random() * 0.09;
    }
}

window.addEventListener('keydown', e => {
    initAudio();
    if (e.code === 'Space') { e.preventDefault(); playCurrent(); }
    else if (e.key === 'e' || e.key === 'E') exportBank();
    else if (e.key === 't' || e.key === 'T') typeTest();
    else if (e.key === 's' || e.key === 'S') saveBank();
    else if (e.key === 'R') resetAll();          // shift+R
    else if (e.key === 'r') { resetPatch(); auditionChange(); }
    else if (/^[1-9]$/.test(e.key)) {
        const i = parseInt(e.key, 10) - 1;
        if (i < bank[currentKey].voices.length) setVoiceIdx(i);
    }
});

// Touch (rough support so it at least works on a tablet)
canvas.addEventListener('touchstart', e => {
    initAudio();
    const t = e.touches[0];
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY }));
}, { passive: true });
canvas.addEventListener('touchmove', e => {
    const t = e.touches[0];
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }));
}, { passive: true });
window.addEventListener('touchend', () => window.dispatchEvent(new MouseEvent('mouseup')));
