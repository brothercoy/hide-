// MusicPlayer.js — tracker-song playback, shared by the Sound Lab and the game.
//
// Song format (pure data, autosaved/exported by the lab's TRACKER tab):
//   song = {
//     name: 'THEME',
//     bpm: 110,                       // steps are 16th notes: stepDur = 60/bpm/4
//     instruments: ['LEAD', 'BASS'],  // patch keys for channels 0 and 1
//     patterns: [ { len: 16|32|64, ch: [ [cell...], [cell...], [cell...] ] } ],
//     chains: [ [1,1,2], [1,1,2], [0] ],   // ONE PATTERN CHAIN PER CHANNEL
//   }
//   Channels 0/1 cells: MIDI note number (60 = C-4) or null.
//   Channel  2  cells: drum patch key ('KICK' | 'CLACK' | 'HAT' | 'HAT_OPEN') or null.
//
// Each channel walks its OWN chain independently and loops it. A one-pattern drum
// chain therefore repeats forever underneath a lead chain that moves through
// sections — edit the drum pattern once and every bar updates. Chains of unequal
// total length simply phase against each other, which is a feature; the lab shows
// each chain's total step count so you can keep them aligned when you want to.
//
// Instrument notes are pitched relative to the instrument patch's OWN first-voice
// frequency, so a patch can be ear-tuned at any register and notes still land at
// true pitch.

import { playPatch, now } from './SoundEngine.js';

export const DRUM_KEYS = ['KICK', 'CLACK', 'HAT', 'HAT_OPEN'];
export const CHANNEL_NAMES = ['LEAD', 'BASS', 'DRUM'];

export function midiFreqMul(midi) { return Math.pow(2, (midi - 69) / 12); }

export function instrumentFreqMul(inst, midi) {
    const base = inst?.voices?.[0]?.freq || 440;
    return 440 * midiFreqMul(midi) / base;
}

// Upgrade a song written before per-channel chains (single `order` array).
export function normalizeSong(song) {
    if (!song.chains) {
        const order = song.order?.length ? song.order.slice() : [0];
        song.chains = [order.slice(), order.slice(), order.slice()];
    }
    delete song.order;
    return song;
}

// Total steps in one full pass of a channel's chain.
export function chainTotal(song, c) {
    let n = 0;
    for (const p of song.chains[c]) n += song.patterns[p]?.len || 0;
    return n;
}

// Where channel c sits at global step s: which pattern, which row, which chain slot.
// Pure, so playback and the UI agree and it can be tested directly.
export function locate(song, c, s, patternOnly = null) {
    if (patternOnly !== null) {
        const len = song.patterns[patternOnly]?.len || 0;
        if (!len) return null;
        return { pat: patternOnly, row: ((s % len) + len) % len, slot: -1 };
    }
    const chain = song.chains[c];
    const total = chainTotal(song, c);
    if (!total) return null;
    let pos = ((s % total) + total) % total;
    for (let i = 0; i < chain.length; i++) {
        const len = song.patterns[chain[i]]?.len || 0;
        if (pos < len) return { pat: chain[i], row: pos, slot: i };
        pos -= len;
    }
    return null;
}

export function createPlayer(resolve) {
    const TICK_MS = 25;      // scheduler wakeup
    const AHEAD = 0.12;      // schedule audio this far into the future

    let timer = null;
    let song = null, loop = true, patternOnly = null;
    let step = 0, endStep = Infinity, nextTime = 0;
    let posQueue = [];       // [{ t, chans: [loc|null, loc|null, loc|null] }]

    function scheduleStep(s, t) {
        const chans = [];
        for (let c = 0; c < 3; c++) {
            const loc = locate(song, c, s, patternOnly);
            chans.push(loc);
            if (!loc) continue;
            const cell = song.patterns[loc.pat]?.ch[c][loc.row];
            if (cell == null) continue;
            if (c === 2) {
                const d = resolve(cell);
                if (d) playPatch(d, t - now());
            } else {
                const inst = resolve(song.instruments[c]);
                if (inst) playPatch(inst, t - now(), { freqMul: instrumentFreqMul(inst, cell) });
            }
        }
        posQueue.push({ t, chans });
    }

    function tick() {
        const stepDur = 60 / song.bpm / 4;
        while (timer && step < endStep && nextTime < now() + AHEAD) {
            scheduleStep(step, nextTime);
            step++;
            nextTime += stepDur;
        }
        if (step >= endStep && now() > nextTime) { stop(); return; }
        while (posQueue.length > 1 && posQueue[1].t <= now()) posQueue.shift();
    }

    function play(s, opts = {}) {
        stop();
        song = normalizeSong(s);
        loop = opts.loop !== false;
        patternOnly = opts.patternOnly ?? null;
        step = opts.startStep || 0;
        endStep = Infinity;
        if (!loop) {
            endStep = patternOnly !== null
                ? (song.patterns[patternOnly]?.len || 0)
                : Math.max(chainTotal(song, 0), chainTotal(song, 1), chainTotal(song, 2));
        }
        nextTime = now() + 0.06;
        posQueue = [];
        timer = setInterval(tick, TICK_MS);
        tick();
    }

    function stop() {
        if (timer) { clearInterval(timer); timer = null; }
        posQueue = [];
    }

    function playing() { return timer !== null; }

    // Audible position for the UI playhead: { chans: [loc|null x3] } or null.
    function position() {
        if (!timer || !posQueue.length) return null;
        return posQueue[0].t <= now() + 0.03 ? posQueue[0] : null;
    }

    return { play, stop, playing, position };
}
