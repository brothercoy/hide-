// lab.js — SOUND LAB (served at /button-test.html under `npm run dev`).
// Stage 1: SFX patch editor + oscilloscope. Tracker (music) is stage 2.
//
// Workflow: click a preset to hear it → tweak sliders (replays on release) →
// press E / click EXPORT to copy the whole edited bank as JSON → paste it back
// into client/audio/patches.js (or hand it to Claude).

import { initAudio, audioReady, playPatch, startSustain, setMasterVolume, getMasterVolume, getAnalyser } from './SoundEngine.js';
import { PATCHES } from './patches.js';
import { createPlayer, instrumentFreqMul, normalizeSong, chainTotal, noteSteps, CHANNEL_NAMES, HOLD } from './MusicPlayer.js';
import { SONGS as COMMITTED_SONGS } from './songs.js';

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
//
// The save is VERSION-AWARE: it records what each default looked like at save time.
// On load, if a patch's committed default has changed since the save (new sounds
// were committed), the new default wins and the stale saved copy is dropped.
// If the default is unchanged, the saved tweak wins. No more stale shadowing.
const SAVE_KEY = 'soundlab_bank_v2';
const bank = structuredClone(PATCHES);
let staleDropped = [];
try {
    const v2 = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (v2?.patches) {
        for (const k of Object.keys(v2.patches)) {
            if (!bank[k]) continue;
            const defNow = JSON.stringify(PATCHES[k]);
            if (v2.defaults?.[k] !== undefined && v2.defaults[k] !== defNow) {
                staleDropped.push(k);          // default updated since this save → default wins
            } else {
                bank[k] = v2.patches[k];       // default unchanged → user tweak wins
            }
        }
    } else {
        // One-time migration from the old un-versioned save: keep entries as tweaks,
        // EXCEPT the two known-stale pre-promotion button patches.
        const v1 = JSON.parse(localStorage.getItem('soundlab_bank_v1') || 'null');
        if (v1) {
            for (const k of Object.keys(v1)) {
                if (!bank[k]) continue;
                if (k === 'BTN_PRESS' || k === 'BTN_CONFIRM') { staleDropped.push(k); continue; }
                bank[k] = v1[k];
            }
        }
    }
    localStorage.removeItem('soundlab_bank_v1');
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
    localStorage.setItem(SAVE_KEY, JSON.stringify({
        patches: bank,
        defaults: Object.fromEntries(keys.map(k => [k, JSON.stringify(PATCHES[k])])),
    }));
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

// ── Tracker state ────────────────────────────────────────────────────────────
// Songs autosave to localStorage on every edit (unlike SFX patches, which use S).
const SONGS_KEY = 'soundlab_songs_v1';
let tab = 'sfx';                     // 'sfx' | 'tracker'
const DRUM_SHORT = { KICK: 'KCK', CLACK: 'CLK', HAT: 'HAT', HAT_OPEN: 'OPN', CRASH: 'CRS' };
const NN = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const noteName = m => NN[m % 12] + (Math.floor(m / 12) - 1);
// Two-row piano: Z..M = lower octave, Q..I = upper (FastTracker convention)
const NOTE_KEYS = {
    z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12,
    q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23, i: 24,
};
const DRUM_ENTRY = { z: 'KICK', x: 'CLACK', c: 'HAT', v: 'HAT_OPEN', b: 'CRASH', 1: 'KICK', 2: 'CLACK', 3: 'HAT', 4: 'HAT_OPEN', 5: 'CRASH' };

function newPattern(len) {
    return { len, ch: [Array(len).fill(null), Array(len).fill(null), Array(len).fill(null)] };
}
function defaultSong(name) {
    return {
        name, bpm: 110, instruments: ['LEAD', 'BASS'],
        patterns: [newPattern(16)],
        chains: [[0], [0], [0]],   // one independent pattern chain per channel
    };
}

let songs = null, songIdx = 0, committedSnap = null;
try {
    const s = JSON.parse(localStorage.getItem(SONGS_KEY) || 'null');
    if (s?.songs?.length) {
        songs = s.songs;
        songIdx = Math.min(s.songIdx || 0, s.songs.length - 1);
        committedSnap = s.snap || null;   // committed songs as they were at save time
    }
} catch { /* corrupt save — start fresh */ }
if (!songs) songs = [defaultSong('THEME')];
songs.forEach(normalizeSong);   // upgrade songs written before per-channel chains
// COMMITTED-song sync (mirrors the patch bank's stale-save rule): a song added straight to
// songs.js appears in the tracker; and when a committed song CHANGED since this autosave was
// made (e.g. a correction committed to a hand-drafted anthem), the committed version displaces
// the stale saved copy. In-progress lab edits survive as long as the committed version hasn't
// changed underneath them.
{
    const snap = committedSnap || {};
    for (const key of Object.keys(COMMITTED_SONGS)) {
        const c = COMMITTED_SONGS[key];
        const cStr = JSON.stringify(c);
        const i = songs.findIndex(s => s.name === c.name);
        if (i < 0) songs.push(normalizeSong(JSON.parse(cStr)));
        else if (snap[c.name] !== cStr && JSON.stringify(songs[i]) !== cStr) {
            songs[i] = normalizeSong(JSON.parse(cStr));   // committed changed since the save — it wins
        }
    }
}
// What the committed songs look like RIGHT NOW — stored with every save so the next load can
// tell "user edited this" apart from "a newer committed version landed".
const committedNow = Object.fromEntries(
    Object.keys(COMMITTED_SONGS).map(k => [COMMITTED_SONGS[k].name, JSON.stringify(COMMITTED_SONGS[k])]));

let editPat = 0, octave = 4;
let chainSel = [0, 0, 0];       // selected slot within each channel's chain
let cur = { row: 0, ch: 0 };
const player = createPlayer(k => bank[k]);   // plays the EDITED bank — lab tweaks are heard live
function touchSongs() { localStorage.setItem(SONGS_KEY, JSON.stringify({ songs, songIdx, snap: committedNow })); }

// ── Snapshots: the safety net for experimenting ──────────────────────────────
// Every tracker edit autosaves immediately, so without this there's no way back from a session
// of messing around. A snapshot is a manual (or auto-on-export) copy of a song kept separately
// from the autosave; SHIFT+R restores it. EXPORTING auto-snapshots, so "back to my original"
// always means "back to what I last exported". With no snapshot, revert falls back to the
// version committed in songs.js.
const SNAP_KEY = 'soundlab_song_snaps_v1';
let snaps = {};
try { snaps = JSON.parse(localStorage.getItem(SNAP_KEY) || '{}') || {}; } catch { snaps = {}; }
function writeSnaps() {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(snaps)); } catch { /* quota/private mode */ }
}
function snapshotSong(song) {
    snaps[song.name] = JSON.stringify(song);
    writeSnaps();
    flash(`SNAPSHOT SAVED — ${song.name}  (SHIFT+R RESTORES IT)`);
}
function snapshotAll() {
    for (const s of songs) snaps[s.name] = JSON.stringify(s);
    writeSnaps();
}
// What SHIFT+R would restore: the manual/export snapshot, else the committed version.
function revertSource(song) {
    if (snaps[song.name]) return { json: snaps[song.name], what: 'SNAPSHOT' };
    const c = Object.values(COMMITTED_SONGS).find(x => x.name === song.name);
    return c ? { json: JSON.stringify(c), what: 'COMMITTED VERSION' } : null;
}
let revertArmed = 0;
function revertSong() {
    const song = songs[songIdx];
    const src = revertSource(song);
    if (!src) { flash(`NO SNAPSHOT FOR ${song.name} — SHIFT+S TAKES ONE`, 2600); return; }
    if (src.json === JSON.stringify(song)) { flash(`ALREADY MATCHES ITS ${src.what}`, 2200); return; }
    if (performance.now() > revertArmed) {          // destructive — confirm with a second press
        revertArmed = performance.now() + 3000;
        flash(`DISCARD CHANGES TO ${song.name}, BACK TO ${src.what}? SHIFT+R AGAIN`, 3000);
        return;
    }
    revertArmed = 0;
    player.stop();
    songs[songIdx] = normalizeSong(JSON.parse(src.json));
    editPat = 0; cur.row = 0; cur.ch = 0; chainSel = [0, 0, 0];
    touchSongs();
    flash(`REVERTED ${songs[songIdx].name} TO ITS ${src.what}`);
}

function exportSongs() {
    snapshotAll();   // the exported state IS the checkpoint — SHIFT+R always returns here
    const json = JSON.stringify({ songs }, null, 2);
    console.log(json);
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(json)
            .then(() => flash('SONGS COPIED TO CLIPBOARD'))
            .catch(() => flash('CLIPBOARD BLOCKED — JSON IN CONSOLE'));
    } else {
        flash('NO CLIPBOARD — JSON IN CONSOLE');
    }
}

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
    let tx = 40 + cw * 12;
    for (const [lbl, id] of [['SFX EDITOR', 'sfx'], ['TRACKER', 'tracker']]) {
        const sel = tab === id;
        const disp = sel ? `[ ${lbl} ]` : `  ${lbl}  `;
        text(disp, tx, 24, sel ? BRIGHT : MID);
        addHit(tx, 24, cw * disp.length, LH, () => { tab = id; });
        tx += cw * (disp.length + 1);
    }
    text('BOARD', tx + cw, 24, DIM);

    // SAVE / EXPORT buttons (right side). EXPORT is contextual: bank on SFX, songs on TRACKER.
    const exStr = '[ EXPORT ]';
    const exX = canvas.width - 40 - cw * (exStr.length + 22);
    text(exStr, exX, 24, BRIGHT);
    addHit(exX, 24, cw * exStr.length, LH, () => tab === 'sfx' ? exportBank() : exportSongs());
    const svStr = '[ SAVE ]';
    const svX = exX - cw * (svStr.length + 2);
    if (tab === 'sfx') {
        text(svStr, svX, 24, BRIGHT);
        addHit(svX, 24, cw * svStr.length, LH, saveBank);
    } else {
        text('AUTOSAVED', svX - cw, 24, DIM);
    }

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

// ── Tracker tab ──────────────────────────────────────────────────────────────
function resetTrackerView() { editPat = 0; chainSel = [0, 0, 0]; cur = { row: 0, ch: 0 }; }
function switchSong(d) {
    player.stop();
    songIdx = (songIdx + d + songs.length) % songs.length;
    resetTrackerView();
    touchSongs();
}
function newSong() {
    songs.push(defaultSong('SONG' + (songs.length + 1)));
    songIdx = songs.length - 1;
    resetTrackerView();
    touchSongs();
}
function renameSong() {
    const n = prompt('SONG NAME:', songs[songIdx].name);
    if (n) { songs[songIdx].name = n.toUpperCase().slice(0, 12); touchSongs(); }
}
function deleteSong() {
    if (songs.length <= 1) { flash('CANNOT DELETE THE LAST SONG'); return; }
    if (!confirm(`DELETE ${songs[songIdx].name}?`)) return;
    player.stop();
    songs.splice(songIdx, 1);
    songIdx = Math.max(0, songIdx - 1);
    resetTrackerView();
    touchSongs();
}
// Patterns can be any length, so a loop ends exactly where the idea ends instead
// of being padded out to the next power of two. Shrinking discards the rows past
// the new end, so ask first if any of them actually hold notes.
const MAX_LEN = 128;
function setPatGain(pat, g) {
    g = Math.round(Math.max(0.1, Math.min(2, g)) * 100) / 100;
    if (g === 1) delete pat.gain; else pat.gain = g;
    touchSongs();
}
function setPatLen(pat, n) {
    n = Math.max(1, Math.min(MAX_LEN, Math.round(n)));
    if (!n || n === pat.len) return;
    if (n < pat.len) {
        const losing = pat.ch.some(c => c.slice(n, pat.len).some(v => v != null));
        if (losing && !confirm(`SHRINK TO ${n}? ROWS ${n}-${pat.len - 1} HOLD NOTES AND WILL BE DELETED.`)) return;
        for (let i = 0; i < 3; i++) pat.ch[i] = pat.ch[i].slice(0, n);
    } else {
        for (const c of pat.ch) while (c.length < n) c.push(null);
    }
    pat.len = n;
    if (cur.row >= n) cur.row = n - 1;
    touchSongs();
}

function drawTracker() {
    const cw = charW();
    const song = songs[songIdx];
    if (editPat >= song.patterns.length) editPat = 0;
    for (let c = 0; c < 3; c++) if (chainSel[c] >= song.chains[c].length) chainSel[c] = 0;
    const x0 = 40;
    let y = 64;

    const pos = player.position();

    // ── Row 1: song / bpm / transport ──
    text('SONG', x0, y, MID);
    let x = x0 + cw * 5;
    text('<', x, y, MID); addHit(x, y, cw, LH, () => switchSong(-1)); x += cw * 2;
    text(song.name, x, y, BRIGHT); x += cw * (song.name.length + 1);
    text('>', x, y, MID); addHit(x, y, cw, LH, () => switchSong(1)); x += cw * 2;
    for (const [lbl, fn] of [['[NEW]', newSong], ['[REN]', renameSong], ['[DEL]', deleteSong]]) {
        text(lbl, x, y, MID); addHit(x, y, cw * lbl.length, LH, fn); x += cw * (lbl.length + 1);
    }
    x += cw;
    const N = 14;
    text(`BPM ${String(song.bpm).padStart(3)}`, x, y, MID);
    const tX = x + cw * 8;
    const bidx = Math.round((song.bpm - 60) / 140 * (N - 1));
    let track = '';
    for (let i = 0; i < N; i++) track += i === bidx ? '#' : (i < bidx ? '=' : '-');
    text('|' + track + '|', tX, y, MID);
    addHit(tX + cw, y, cw * N, LH, null, mx => {
        song.bpm = Math.round(60 + Math.max(0, Math.min(1, (mx - tX - cw) / (cw * N))) * 140);
        touchSongs();
    });
    x = tX + cw * (N + 3);
    text(player.playing() ? '[STOP]' : '[PLAY]', x, y, BRIGHT);
    addHit(x, y, cw * 6, LH, () => {
        if (player.playing()) player.stop();
        else player.play(song, { loop: true });
    });
    x += cw * 7;
    text('[PAT]', x, y, MID);
    addHit(x, y, cw * 5, LH, () => {
        if (player.playing()) player.stop();
        else player.play(song, { patternOnly: editPat });
    });
    x += cw * 6;
    if (song.loopStep) { text(`LOOP@${song.loopStep}`, x, y, DIM); x += cw * 10; }
    if (song.tensionStep != null) text(`TENSE@${song.tensionStep}`, x, y, DIM);
    y += LH + 2;

    // ── Rows 2-4: one independent pattern chain per channel ──
    // Each chain loops on its own, so a 1-pattern DRUM chain repeats forever under
    // a LEAD chain that walks through sections. (n) is the chain's total step count.
    const nPat = song.patterns.length;
    // A slot whose pattern holds nothing for THIS channel plays silence — the usual
    // cause of "my drums cut out". Drawn dim so an accidental empty slot is obvious.
    const slotHasNotes = (p, c) => !!song.patterns[p]?.ch[c].some(v => v != null);
    for (let c = 0; c < 3; c++) {
        const chain = song.chains[c];
        text(CHANNEL_NAMES[c], x0, y, cur.ch === c ? BRIGHT : MID);
        x = x0 + cw * 5;
        let slotStart = 0;
        chain.forEach((p, i) => {
            const sel = i === chainSel[c];
            // '>' marks the loop point, '*' the tension section, where they land in this chain
            const atLoop = song.loopStep && slotStart === song.loopStep;
            const atTense = song.tensionStep != null && slotStart === song.tensionStep;
            const lbl = (atLoop ? '>' : '') + (atTense ? '*' : '') + (sel ? `[${p}]` : `${p}`);
            const live = pos && pos.chans[c] && pos.chans[c].slot === i;
            text(lbl, x, y, live ? '#aaffaa' : (sel ? BRIGHT : (slotHasNotes(p, c) ? MID : DIM)));
            addHit(x, y, cw * lbl.length, LH, () => { chainSel[c] = i; editPat = p; cur.ch = c; });
            x += cw * (lbl.length + 0.7);
            slotStart += song.patterns[p]?.len || 0;
        });
        x += cw;
        const sel = () => chainSel[c];
        for (const [lbl, fn] of [
            ['+', () => { chain.splice(sel() + 1, 0, chain[sel()]); chainSel[c]++; touchSongs(); }],
            ['-', () => { if (chain.length > 1) { chain.splice(sel(), 1); chainSel[c] = Math.max(0, sel() - 1); touchSongs(); } }],
            ['<', () => { chain[sel()] = (chain[sel()] + nPat - 1) % nPat; editPat = chain[sel()]; touchSongs(); }],
            ['>', () => { chain[sel()] = (chain[sel()] + 1) % nPat; editPat = chain[sel()]; touchSongs(); }],
        ]) { text(lbl, x, y, MID); addHit(x, y, cw, LH, fn); x += cw * 2; }
        text(`(${chainTotal(song, c)})`, x, y, DIM);
        x += cw * 6;
        // Live position, so a channel visibly keeps running even while the grid is
        // showing some other pattern. Format is PATTERN:ROW.
        if (pos && pos.chans[c]) {
            const l = pos.chans[c];
            text(`>${l.pat}:${String(l.row).padStart(2, '0')}`, x, y,
                l.pat === editPat ? '#aaffaa' : MID);
        }
        x += cw * 7;
        text('[=ALL]', x, y, DIM);
        addHit(x, y, cw * 6, LH, () => {
            // Destructive and easy to hit by accident: it replaces the other two chains.
            if (!confirm(`OVERWRITE THE OTHER CHANNELS' CHAINS WITH ${CHANNEL_NAMES[c]}'S?\n\n`
                + `This replaces them entirely. A DRUM chain that should stay one\n`
                + `looping slot would be overwritten too.`)) return;
            for (let o = 0; o < 3; o++) if (o !== c) song.chains[o] = chain.slice();
            chainSel = [chainSel[c], chainSel[c], chainSel[c]];
            flash(CHANNEL_NAMES[c] + ' CHAIN COPIED TO ALL CHANNELS');
            touchSongs();
        });
        y += LH;
    }
    y += 2;

    // ── Row 3: patterns / length / octave ──
    text('PAT', x0, y, MID);
    x = x0 + cw * 6;
    song.patterns.forEach((_, i) => {
        const lbl = i === editPat ? `[${i}]` : `${i}`;
        text(lbl, x, y, i === editPat ? BRIGHT : MID);
        addHit(x, y, cw * lbl.length, LH, () => { editPat = i; });
        x += cw * (lbl.length + 0.7);
    });
    x += cw;
    text('[+NEW]', x, y, MID);
    addHit(x, y, cw * 6, LH, () => { song.patterns.push(newPattern(16)); editPat = song.patterns.length - 1; touchSongs(); });
    x += cw * 7;
    text('[DUP]', x, y, MID);
    addHit(x, y, cw * 5, LH, () => { song.patterns.push(structuredClone(song.patterns[editPat])); editPat = song.patterns.length - 1; touchSongs(); });
    x += cw * 6;
    const pat = song.patterns[editPat];
    text(`LEN:${String(pat.len).padStart(3)}`, x, y, MID);
    addHit(x, y, cw * 7, LH, () => {
        const v = prompt(`PATTERN LENGTH IN STEPS (1-${MAX_LEN}):`, pat.len);
        if (v !== null && v.trim() !== '' && !isNaN(+v)) setPatLen(pat, +v);
    });
    x += cw * 8;
    for (const [lbl, d] of [['-', -1], ['+', 1]]) {
        text(lbl, x, y, MID);
        addHit(x, y, cw, LH, () => setPatLen(pat, pat.len + d));
        x += cw * 2;
    }
    const beats = pat.len / 4;
    text(`(${Number.isInteger(beats) ? beats : beats.toFixed(2)} BEATS)`, x, y, DIM);
    x += cw * 12;
    // Per-pattern mix level — scales every note this pattern triggers.
    const pg = Math.round((pat.gain ?? 1) * 100);
    text(`GAIN:${String(pg).padStart(3)}%`, x, y, pg === 100 ? MID : BRIGHT);
    addHit(x, y, cw * 9, LH, () => {
        const v = prompt('PATTERN GAIN % (10-200):', pg);
        if (v !== null && v.trim() !== '' && !isNaN(+v)) setPatGain(pat, +v / 100);
    });
    x += cw * 10;
    for (const [lbl, d] of [['-', -0.1], ['+', 0.1]]) {
        text(lbl, x, y, MID);
        addHit(x, y, cw, LH, () => setPatGain(pat, (pat.gain ?? 1) + d));
        x += cw * 2;
    }
    text(`OCT:${octave}`, x, y, MID);
    y += LH + 8;

    if (cur.row >= pat.len) cur.row = 0;

    // ── Grid ──
    // Rows are sized for a comfortable ~32-row view; patterns longer than fits
    // scroll to keep the playhead (or the cursor when stopped) centred.
    const gridBottom = canvas.height - 185;
    const rowH = Math.max(13, Math.min(26, Math.floor((gridBottom - y - 26) / Math.min(pat.len, 32))));
    const gfs = Math.min(20, rowH - 1);
    const gcw = charW(gfs);
    const colX = [x0 + gcw * 4, x0 + gcw * 10, x0 + gcw * 16];
    // Header marks a channel that is currently playing a DIFFERENT pattern than the
    // one on screen — that is why its playhead is missing from this grid.
    CHANNEL_NAMES.forEach((n, c) => {
        text(n, colX[c], y, cur.ch === c ? BRIGHT : MID, gfs);
        const l = pos && pos.chans[c];
        if (l && l.pat !== editPat) text(`>${l.pat}`, colX[c] + gcw * 4, y, DIM, gfs);
    });
    const gy0 = y + rowH + 4;
    const visible = Math.max(4, Math.floor((gridBottom - gy0) / rowH));
    let top = 0;
    if (pat.len > visible) {
        let focus = cur.row;
        if (pos) {
            for (let c = 0; c < 3; c++) {
                if (pos.chans[c] && pos.chans[c].pat === editPat) { focus = pos.chans[c].row; break; }
            }
        }
        top = Math.max(0, Math.min(pat.len - visible, focus - Math.floor(visible / 2)));
        if (top > 0) text(`^ ${top} MORE`, x0, gy0 - rowH, DIM, 14);
        const below = pat.len - (top + visible);
        if (below > 0) text(`v ${below} MORE`, x0, gridBottom + 2, DIM, 14);
    }
    for (let r = top; r < Math.min(pat.len, top + visible); r++) {
        const ry = gy0 + (r - top) * rowH;
        text(String(r).padStart(2, '0'), x0, ry, r % 4 === 0 ? MID : DIM, gfs);
        for (let c = 0; c < 3; c++) {
            // Channels run their own chains, so each one gets its own playhead mark
            if (pos && pos.chans[c] && pos.chans[c].pat === editPat && pos.chans[c].row === r) {
                ctx.fillStyle = '#0a2912';
                ctx.fillRect(colX[c] - 4, ry - 2, gcw * 5, rowH);
            }
            const cell = pat.ch[c][r];
            const disp = cell === HOLD ? ' | '
                : c === 2 ? (cell ? DRUM_SHORT[cell] : '...')
                : (cell != null ? noteName(cell) : '...');
            if (cur.row === r && cur.ch === c) {
                ctx.fillStyle = BRIGHT;
                ctx.fillRect(colX[c] - 2, ry - 1, gcw * 4, rowH - 1);
                text(disp, colX[c], ry, '#000000', gfs);
            } else {
                text(disp, colX[c], ry, cell === HOLD ? MID : (cell != null ? BRIGHT : DIM), gfs);
            }
            const rr = r, cc = c;
            addHit(colX[c] - 2, ry - 1, gcw * 5, rowH, () => { cur = { row: rr, ch: cc }; });
        }
    }

    // ── Key help ──
    const hx = x0 + gcw * 26;
    let hy = gy0;
    for (const line of [
        'Z-M / Q-I ..... NOTES (2 OCTAVES)',
        '[ ] ........... OCTAVE DOWN/UP',
        '- ............. HOLD (LENGTHEN NOTE ABOVE)',
        'Z X C V B ..... KCK CLK HAT OPN CRS (DRUM COL)',
        'DEL / . ....... CLEAR CELL',
        'ARROWS ........ MOVE CURSOR',
        'SPACE ......... PLAY/STOP SONG',
        'SHIFT+SPACE ... LOOP THIS PATTERN',
        'ENTER ......... PLAY SONG FROM CURSOR',
        'L ............. LOOP POINT AT SELECTED SLOT',
        '                (intro plays once, song then',
        '                cycles from the > marker; L',
        '                there again clears it)',
        'F ............. TENSION SECTION AT SLOT (*):',
        '                a round\'s final seconds play',
        '                only [here, end), sped up',
        'SHIFT+S ....... SNAPSHOT THIS SONG',
        'SHIFT+R ....... REVERT IT TO THE SNAPSHOT',
        '                (press twice to confirm)',
        '',
        'SAFE TO EXPERIMENT: edits autosave instantly,',
        'but EXPORTING also takes a snapshot — so',
        'SHIFT+R always walks back to what you last',
        'exported. SHIFT+S checkpoints mid-session.',
        'Never snapshotted? Revert falls back to the',
        'version committed in songs.js.',
        '',
        'GAIN = this pattern\'s mix level: every',
        'note it triggers is scaled by it (tame a',
        'boomy bass pattern, push a chorus).',
        '',
        'HOLD = the DAW "drag note longer". A note',
        'plus three | rings four steps, then decays.',
        'No holds = the patch\'s natural length.',
        '',
        'LEN is any number of steps (1-128), so a',
        'loop can end exactly where the idea ends —',
        'click it to type a length, or use - / +.',
        '',
        'THE GRID SHOWS ONE PATTERN, but channels',
        'can be on different ones at once. A column',
        'marked >2 is playing pattern 2 right now, so',
        'its playhead is not in this grid. The >P:RR',
        'on each chain row is its live position.',
        'A DIM slot number = that pattern has nothing',
        'for that channel (it will play silence).',
        '',
        'EACH CHANNEL HAS ITS OWN CHAIN and loops',
        'it independently. Leave DRUM on one pattern',
        'so it repeats forever, and give LEAD a longer',
        'chain that moves through sections over it.',
        'Edit that one drum pattern and every bar',
        'updates. (n) = the chain total in steps —',
        'keep them multiples to stay in step.',
        '',
        '+ - add/remove a slot   < > repoint a slot',
        '[=ALL] copies that chain to all channels.',
        'PAT = which pattern the grid is editing.',
        'LEAD/BASS instruments tune in SFX EDITOR.',
        'EDITS AUTOSAVE. EXPORT = COPY SONGS JSON.',
    ]) { text(line, hx, hy, DIM, 16); hy += 24; }
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
    if (tab === 'sfx') {
        drawPresetList();
        drawEditor();
    } else {
        drawTracker();
    }
    drawScope();
    requestAnimationFrame(loop);
}
document.fonts.ready.then(() => {
    if (staleDropped.length) flash('NEWER COMMITTED SOUNDS RESTORED: ' + staleDropped.join(', '), 6000);
    loop();
});

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
        if (dragging.onDrag && dragging.x > 300 && tab === 'sfx') auditionChange();
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

// The cursor's absolute step within the song: where the edited pattern sits in the
// cursor channel's chain (preferring the selected slot), plus the cursor row. Lets
// playback drop in mid-song instead of always starting from the top.
function cursorSongStep(song) {
    const chain = song.chains[cur.ch];
    let slot = chainSel[cur.ch];
    if (chain[slot] !== editPat) {
        const idx = chain.indexOf(editPat);
        if (idx < 0) return cur.row;   // pattern isn't in this chain — best effort
        slot = idx;
    }
    let s = 0;
    for (let i = 0; i < slot; i++) s += song.patterns[chain[i]]?.len || 0;
    return s + cur.row;
}

function trackerKey(e) {
    const song = songs[songIdx];
    if (editPat >= song.patterns.length) editPat = 0;
    const pat = song.patterns[editPat];
    const advanceCur = () => { cur.row = (cur.row + 1) % pat.len; };

    if (e.code === 'Space') {
        e.preventDefault();
        if (player.playing()) player.stop();
        else if (e.shiftKey) player.play(song, { patternOnly: editPat });
        else player.play(song, { loop: true });
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        // Play the SONG from the cursor's position (restarts there if already playing).
        player.play(song, { loop: true, startStep: cursorSongStep(song) });
        return;
    }
    // L — set the song's loop point at the selected slot's start (the intro before
    // it plays once; the song then cycles from here). L on the same spot clears it.
    if (e.key === 'l' || e.key === 'L') {
        const s = cursorSongStep(song) - cur.row;   // slot start, row ignored
        if (song.loopStep === s || s === 0) delete song.loopStep;
        else song.loopStep = s;
        flash(song.loopStep ? `LOOP POINT @ STEP ${s} — INTRO PLAYS ONCE` : 'LOOP POINT CLEARED');
        touchSongs();
        return;
    }
    // F — mark the TENSION section at the selected slot's start: in a round's
    // final seconds the game plays only [here, end), sped up. F there again clears.
    if (e.key === 'f' || e.key === 'F') {
        const s = cursorSongStep(song) - cur.row;
        if (song.tensionStep === s) delete song.tensionStep;
        else song.tensionStep = s;
        flash(song.tensionStep != null ? `TENSION SECTION @ STEP ${s} — FINAL-SECONDS LOOP` : 'TENSION SECTION CLEARED');
        touchSongs();
        return;
    }
    // SHIFT+S / SHIFT+R — snapshot & revert. Checked BEFORE note entry, since s and r are both
    // piano keys (they'd otherwise type a note instead).
    if (e.shiftKey && (e.key === 'S' || e.key === 'R')) {
        e.preventDefault();
        if (e.key === 'S') snapshotSong(song); else revertSong();
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();

    if (e.key === 'ArrowUp') { e.preventDefault(); cur.row = (cur.row - 1 + pat.len) % pat.len; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); advanceCur(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); cur.ch = (cur.ch + 2) % 3; }
    else if (e.key === 'ArrowRight') { e.preventDefault(); cur.ch = (cur.ch + 1) % 3; }
    else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '.') {
        pat.ch[cur.ch][cur.row] = null; advanceCur(); touchSongs();
    }
    else if (k === '[') octave = Math.max(1, octave - 1);
    else if (k === ']') octave = Math.min(7, octave + 1);
    // '-' extends the note above by one step (LEAD/BASS only — drums are one-shots)
    else if (k === '-' && cur.ch !== 2) {
        pat.ch[cur.ch][cur.row] = HOLD;
        advanceCur(); touchSongs();
    }
    else if (cur.ch === 2) {
        const d = DRUM_ENTRY[k];
        if (d) { pat.ch[2][cur.row] = d; playPatch(bank[d], 0, { gainMul: pat.gain ?? 1 }); advanceCur(); touchSongs(); }
    }
    else if (NOTE_KEYS[k] !== undefined) {
        const midi = (octave + 1) * 12 + NOTE_KEYS[k];
        pat.ch[cur.ch][cur.row] = midi;
        const inst = bank[song.instruments[cur.ch]];
        // Preview at the length and mix level it will actually play at, holds included
        const extra = (noteSteps(pat, cur.ch, cur.row) - 1) * (60 / song.bpm / 4);
        playPatch(inst, 0, { freqMul: instrumentFreqMul(inst, midi), sustainFor: extra, gainMul: pat.gain ?? 1 });
        advanceCur(); touchSongs();
    }
}

window.addEventListener('keydown', e => {
    initAudio();
    if (tab === 'tracker') { trackerKey(e); return; }
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
