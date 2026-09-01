// MusicPlayer.js — tracker-song playback, shared by the Sound Lab and the game.
//
// Song format (pure data, autosaved/exported by the lab's TRACKER tab):
//   song = {
//     name: 'THEME',
//     bpm: 110,                       // steps are 16th notes: stepDur = 60/bpm/4
//     instruments: ['LEAD', 'BASS'],  // patch keys for channels 0 and 1
//     patterns: [ { len: 16|32|64, gain: 1, ch: [ [cell...], [cell...], [cell...] ] } ],
//     chains: [ [1,1,2], [1,1,2], [0] ],   // ONE PATTERN CHAIN PER CHANNEL
//   }
//   A pattern's optional `gain` (default 1) scales every note it triggers — a
//   per-section mixer knob (quiet intro, pushed chorus, tamed bass pattern).
//   Channels 0/1 cells: MIDI note number (60 = C-4), HOLD, or null.
//   Channel  2  cells: drum patch key ('KICK' | 'CLACK' | 'HAT' | 'HAT_OPEN') or null.
//
// HOLD ('~') extends the note above it by one step — the tracker equivalent of
// dragging a note longer in a DAW. A note followed by three HOLDs rings for four
// steps at full level, then decays with its patch's own decay. Without HOLDs a
// note just plays its natural one-shot shape, so songs written before holds
// existed sound exactly the same.
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
export const HOLD = '~';

// How many steps a note at (pat, row) rings for: itself plus any HOLD rows under
// it. Holds stop at the end of the pattern.
export function noteSteps(pattern, c, row) {
    let n = 1;
    while (row + n < pattern.len && pattern.ch[c][row + n] === HOLD) n++;
    return n;
}

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
    let pending = null;      // song queued to take over at the next drum-loop boundary
    let tempoScale = 1;      // 1 = song bpm; >1 = faster. Ramped toward tempoTarget.
    let tempoTarget = 1, tempoRate = 0;

    // The musical switching quantum: one full pass of the song's drum chain.
    function quantum() {
        return chainTotal(song, 2) || song.patterns[0]?.len || 16;
    }

    function scheduleStep(s, t, stepDur) {
        const chans = [];
        for (let c = 0; c < 3; c++) {
            const loc = locate(song, c, s, patternOnly);
            chans.push(loc);
            if (!loc) continue;
            const pattern = song.patterns[loc.pat];
            const cell = pattern?.ch[c][loc.row];
            if (cell == null || cell === HOLD) continue;   // HOLD rows retrigger nothing
            const pg = pattern.gain ?? 1;                  // per-pattern mix level
            if (c === 2) {
                const d = resolve(cell);
                if (d) playPatch(d, t - now(), { bus: 'music', gainMul: pg });
            } else {
                const inst = resolve(song.instruments[c]);
                if (!inst) continue;
                // Held notes ring for their extra steps before the patch decay runs
                const extra = (noteSteps(pattern, c, loc.row) - 1) * stepDur;
                playPatch(inst, t - now(), {
                    freqMul: instrumentFreqMul(inst, cell),
                    sustainFor: extra,
                    bus: 'music',
                    gainMul: pg,
                });
            }
        }
        posQueue.push({ t, chans });
    }

    function tick() {
        // Ease the tempo toward its target (rate set by setTempo's ramp length).
        if (tempoScale !== tempoTarget && tempoRate > 0) {
            const d = tempoRate * (TICK_MS / 1000);
            tempoScale = tempoScale < tempoTarget
                ? Math.min(tempoTarget, tempoScale + d)
                : Math.max(tempoTarget, tempoScale - d);
        }
        while (timer && step < endStep && nextTime < now() + AHEAD) {
            // A queued song takes over exactly at a drum-loop boundary, inheriting
            // the beat grid (nextTime carries straight on) — the "vertical" handoff.
            if (pending && step > 0 && step % quantum() === 0) {
                song = pending;
                pending = null;
                step = 0;
                posQueue = [];
            }
            const stepDur = 60 / song.bpm / 4 / tempoScale;
            scheduleStep(step, nextTime, stepDur);
            step++;
            nextTime += stepDur;
        }
        if (step >= endStep && now() > nextTime) { stop(); return; }
        while (posQueue.length > 1 && posQueue[1].t <= now()) posQueue.shift();
    }

    // Queue a song to take over at the end of the current song's drum-loop pass —
    // the theme finishes its full measure, then the next song enters on the beat.
    // Falls back to an immediate play when nothing is running.
    function queue(s) {
        if (!timer || !song) { play(s, { loop: true }); return; }
        const next = normalizeSong(s);
        if (next === song) { pending = null; return; }
        pending = next;
    }

    // Scale playback speed without touching pitch. rampS eases there over that many
    // seconds (0 = jump). 1 restores the song's own bpm.
    function setTempo(target, rampS = 2) {
        tempoTarget = Math.max(0.25, Math.min(4, target));
        tempoRate = rampS > 0 ? Math.abs(tempoTarget - tempoScale) / rampS : Infinity;
    }

    function play(s, opts = {}) {
        stop();
        song = normalizeSong(s);
        loop = opts.loop !== false;
        patternOnly = opts.patternOnly ?? null;
        tempoScale = 1; tempoTarget = 1; tempoRate = 0;
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
        pending = null;
    }

    function playing() { return timer !== null; }

    // Audible position for the UI playhead: { chans: [loc|null x3] } or null.
    function position() {
        if (!timer || !posQueue.length) return null;
        return posQueue[0].t <= now() + 0.03 ? posQueue[0] : null;
    }

    return { play, queue, setTempo, stop, playing, position };
}
