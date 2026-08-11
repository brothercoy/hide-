// MusicPlayer.js — tracker-song playback, shared by the Sound Lab and the game.
//
// Song format (pure data, autosaved/exported by the lab's TRACKER tab):
//   song = {
//     name: 'THEME',
//     bpm: 110,                       // steps are 16th notes: stepDur = 60/bpm/4
//     instruments: ['LEAD', 'BASS'],  // patch keys for channels 0 and 1
//     patterns: [ { len: 16|32, ch: [ [cell...], [cell...], [cell...] ] } ],
//     order: [0, 0, 1],               // pattern chain; loops
//   }
//   Channels 0/1 cells: MIDI note number (60 = C-4) or null.
//   Channel  2  cells: drum patch key ('KICK' | 'CLACK' | 'HAT' | 'HAT_OPEN') or null.
//
// Instrument patches are authored at A4 = 440 Hz; notes transpose them via freqMul.

import { playPatch, now } from './SoundEngine.js';

export const DRUM_KEYS = ['KICK', 'CLACK', 'HAT', 'HAT_OPEN'];

export function midiFreqMul(midi) { return Math.pow(2, (midi - 69) / 12); }

// Notes are pitched relative to the instrument's OWN first-voice frequency, so the
// patch can be authored/tuned at any register in the SFX editor and tracker notes
// still land at true pitch (C-4 always sounds at 261.6 Hz on voice 1).
export function instrumentFreqMul(inst, midi) {
    const base = inst?.voices?.[0]?.freq || 440;
    return 440 * midiFreqMul(midi) / base;
}

// resolve: patchKey -> patch object. The lab passes its edited bank so songs play
// with the user's tuned instruments; the game passes the shipped PATCHES.
export function createPlayer(resolve) {
    const TICK_MS = 25;      // scheduler wakeup
    const AHEAD = 0.12;      // schedule audio this far into the future

    let timer = null;
    let song = null, loop = true, patternOnly = null;
    let orderIdx = 0, row = 0, nextTime = 0;
    let posQueue = [];       // [{ t, orderIdx, pat, row }] for UI playhead

    function currentPattern() {
        return patternOnly !== null
            ? song.patterns[patternOnly]
            : song.patterns[song.order[orderIdx]];
    }

    function scheduleRow(t) {
        const pat = currentPattern();
        for (let c = 0; c < 2; c++) {
            const midi = pat.ch[c][row];
            if (midi != null) {
                const inst = resolve(song.instruments[c]);
                if (inst) playPatch(inst, t - now(), { freqMul: instrumentFreqMul(inst, midi) });
            }
        }
        const drum = pat.ch[2][row];
        if (drum) {
            const d = resolve(drum);
            if (d) playPatch(d, t - now());
        }
        posQueue.push({
            t,
            orderIdx: patternOnly !== null ? -1 : orderIdx,
            pat: patternOnly !== null ? patternOnly : song.order[orderIdx],
            row,
        });
    }

    function advance() {
        row++;
        if (row >= currentPattern().len) {
            row = 0;
            if (patternOnly === null) {
                orderIdx++;
                if (orderIdx >= song.order.length) {
                    orderIdx = 0;
                    if (!loop) stop();
                }
            }
        }
    }

    function tick() {
        const stepDur = 60 / song.bpm / 4;
        while (timer && nextTime < now() + AHEAD) {
            scheduleRow(nextTime);
            advance();
            nextTime += stepDur;
        }
        while (posQueue.length > 1 && posQueue[1].t <= now()) posQueue.shift();
    }

    function play(s, opts = {}) {
        stop();
        song = s;
        loop = opts.loop !== false;
        patternOnly = opts.patternOnly ?? null;
        orderIdx = Math.min(opts.startOrder || 0, s.order.length - 1);
        row = 0;
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

    // Current audible position for the UI playhead (null when stopped / not yet audible)
    function position() {
        if (!timer || !posQueue.length) return null;
        return posQueue[0].t <= now() + 0.03 ? posQueue[0] : null;
    }

    return { play, stop, playing, position };
}
