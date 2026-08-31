// SoundEngine.js — Web Audio synthesis engine, shared by the game and the Sound Lab.
//
// Every sound is a "patch": pure data, no code. The Sound Lab edits patches; the game
// plays them. What you hear in the lab is exactly what ships.
//
//   patch = {
//     name:    'KICK',
//     sustain: false,          // true = continuous (hum/ambience) — toggled on/off, not one-shot
//     vary:    { freq: 0.05, gain: 0.15 },  // per-trigger humanization: ± fraction of pitch/level,
//                                           // rolled once per trigger (whole hit shifts together).
//                                           // Omit or 0s = identical every time (pure VT100 style).
//     voices:  [voice, ...],   // stacked layers, all start together (unless delayed)
//   }
//   voice = {
//     wave:    'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise',
//     freq:    440,            // Hz (ignored for noise)
//     freqEnd: null,           // Hz — exponential pitch slide over the voice's lifetime, null = no slide
//     delay:   0,              // s — offset from patch start
//     attack:  0.001,          // s — 0 → gain
//     decay:   0.1,            // s — gain → silence (ignored while sustaining)
//     gain:    0.3,            // 0..1
//     filter:  null,           // { type: 'lowpass'|'highpass'|'bandpass', cutoff: Hz, q: number,
//                              //   cutoffEnd: Hz|null }  — cutoffEnd sweeps the filter over the
//                              //   voice's lifetime (rising whooshes, spreading shimmers)
//     lfo:     null,           // { rate: Hz, depth: 0..1 } — amplitude flutter (hum "aliveness")
//   }

let ctx = null;
let master = null;
let analyser = null;
let noiseBuf = null;

const EPS = 0.0001; // exponentialRamp can't reach 0

// Create (or resume) the AudioContext. Must be called from a user gesture the first time.
export function initAudio() {
    if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.8;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        master.connect(analyser);
        analyser.connect(ctx.destination);

        // 2s of white noise, looped by noise voices
        const len = ctx.sampleRate * 2;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}

export function audioReady() { return ctx !== null && ctx.state === 'running'; }
export function now() { return ctx ? ctx.currentTime : 0; }
export function setMasterVolume(v) { if (master) master.gain.value = v; }
export function getMasterVolume() { return master ? master.gain.value : 0.8; }
export function getAnalyser() { return analyser; }

// ── Voice scheduling ─────────────────────────────────────────────────────────

function buildVoice(voice, t0, hold, mods = { freqMul: 1, gainMul: 1 }) {
    const start = t0 + (voice.delay || 0);
    const attack = Math.max(0.001, voice.attack || 0.001);
    const decay = Math.max(0.005, voice.decay || 0.1);
    // sustainFor holds the note at full level before the decay runs — the tracker's
    // held notes. 0 = the patch's natural one-shot shape.
    const sus = Math.max(0, mods.sustainFor || 0);
    const endAt = start + attack + sus + decay;
    const stopAt = endAt + 0.05;

    // Source
    let src;
    if (voice.wave === 'noise') {
        src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        // Noise has no oscillator frequency — pitch variation shifts the grain rate instead
        src.playbackRate.value = mods.freqMul;
    } else {
        src = ctx.createOscillator();
        src.type = voice.wave || 'square';
        const f0 = Math.max(1, (voice.freq || 440) * mods.freqMul);
        src.frequency.setValueAtTime(f0, start);
        if (voice.freqEnd) {
            src.frequency.exponentialRampToValueAtTime(
                Math.max(1, voice.freqEnd * mods.freqMul), endAt);
        }
    }

    // Envelope
    const env = ctx.createGain();
    const g = Math.max(EPS, Math.min(1, (voice.gain ?? 0.3) * mods.gainMul));
    env.gain.setValueAtTime(EPS, start);
    env.gain.linearRampToValueAtTime(g, start + attack);
    if (!hold) {
        if (sus > 0) env.gain.setValueAtTime(g, start + attack + sus);
        env.gain.exponentialRampToValueAtTime(EPS, endAt);
    }

    // Optional amplitude LFO (flutter)
    let lfo = null, lfoGain = null;
    if (voice.lfo && voice.lfo.rate > 0 && voice.lfo.depth > 0) {
        lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = voice.lfo.rate;
        lfoGain = ctx.createGain();
        lfoGain.gain.value = g * voice.lfo.depth;
        lfo.connect(lfoGain);
        lfoGain.connect(env.gain);
        lfo.start(start);
    }

    // Optional filter
    let out = env;
    if (voice.filter && voice.filter.type) {
        const filt = ctx.createBiquadFilter();
        filt.type = voice.filter.type;
        // For noise voices the filter IS the pitch — move the cutoff with the vary roll
        const cutMul = voice.wave === 'noise' ? mods.freqMul : 1;
        filt.frequency.setValueAtTime((voice.filter.cutoff || 2000) * cutMul, start);
        // Optional cutoff sweep — rising noise whooshes, spreading shimmers
        if (voice.filter.cutoffEnd) {
            filt.frequency.exponentialRampToValueAtTime(
                Math.max(1, voice.filter.cutoffEnd * cutMul), endAt);
        }
        filt.Q.value = voice.filter.q || 1;
        src.connect(filt);
        filt.connect(env);
    } else {
        src.connect(env);
    }
    out.connect(master);

    if (voice.wave === 'noise') {
        // Random read offset — no two noise hits share the same grains
        src.start(start, Math.random() * noiseBuf.duration);
    } else {
        src.start(start);
    }
    if (!hold) {
        src.stop(stopAt);
        if (lfo) lfo.stop(stopAt);
    }
    return { src, env, lfo, start, attack };
}

// ── Public playback API ──────────────────────────────────────────────────────

// One-shot. Returns the patch's total length in seconds.
// opts.freqMul / opts.gainMul transpose/scale the whole patch (used by the tracker
// to pitch instrument patches per note); they compose with the vary roll.
// opts.sustainFor holds the note at full level for that many seconds before the
// patch's own decay runs — how the tracker lengthens a single note.
export function playPatch(patch, when = 0, opts = {}) {
    if (!ctx) return 0;
    const t0 = ctx.currentTime + when;
    // Humanization: one roll per trigger so the whole hit shifts together
    const vary = patch.vary || {};
    const sus = Math.max(0, opts.sustainFor || 0);
    const mods = {
        freqMul: (1 + (Math.random() * 2 - 1) * (vary.freq || 0)) * (opts.freqMul || 1),
        gainMul: (1 + (Math.random() * 2 - 1) * (vary.gain || 0)) * (opts.gainMul || 1),
        sustainFor: sus,
    };
    let total = 0;
    for (const v of patch.voices) {
        buildVoice(v, t0, false, mods);
        total = Math.max(total, (v.delay || 0) + (v.attack || 0) + sus + (v.decay || 0.1));
    }
    return total;
}

// Continuous sound (hum, ambience). Returns a handle: call .stop() to fade out.
export function startSustain(patch, fadeOut = 0.4) {
    if (!ctx) return null;
    const t0 = ctx.currentTime;
    const handles = patch.voices.map(v => buildVoice(v, t0, true));
    let stopped = false;
    return {
        stop() {
            if (stopped) return;
            stopped = true;
            const t = ctx.currentTime;
            for (const h of handles) {
                h.env.gain.cancelScheduledValues(t);
                h.env.gain.setValueAtTime(h.env.gain.value, t);
                h.env.gain.exponentialRampToValueAtTime(EPS, t + fadeOut);
                h.src.stop(t + fadeOut + 0.05);
                if (h.lfo) h.lfo.stop(t + fadeOut + 0.05);
            }
        },
    };
}
