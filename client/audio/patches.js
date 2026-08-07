// patches.js — the game's sound bank. Pure data, edited via the Sound Lab (button-test.html).
//
// Values are ear-tuned in the Sound Lab (last import: 2026-08-07). Drum patches were
// originally synthesized from the three mechanical events measured in CRT_sample.mp3:
//   E1 clack — instant bright attack (~5.4 kHz centroid), body ringing at ~100/400/510 Hz
//   E2 thud  — 76% of energy under 100 Hz (peak ~41 Hz), faint 7–9 kHz spring-rattle tail
//   E3 tink  — short metallic ping, partials ~1030/2650/4840 Hz decaying into ~510 Hz
// (Some patches have since evolved away from the measured recipe by ear — the export wins.)

export const PATCHES = {

    // ── UI / terminal ────────────────────────────────────────────────────────
    KEY_CLICK: {
        name: 'KEY_CLICK', desc: 'VT100-style electronic keyclick (per keystroke)',
        vary: { freq: 0.095, gain: 0.2 },
        voices: [
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.025, gain: 0.254, filter: { type: 'lowpass', cutoff: 2762, q: 20 } },
            { wave: 'square', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.005, gain: 0.254, filter: { type: 'highpass', cutoff: 337, q: 0.989 } },
        ],
    },
    TELETYPE_TICK: {
        name: 'TELETYPE_TICK', desc: 'Very quiet per-character tick while text paints in',
        vary: { freq: 0.3, gain: 0.5 },
        voices: [
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.005, gain: 0.1, filter: { type: 'bandpass', cutoff: 762, q: 0.3 } },
        ],
    },
    BEL: {
        name: 'BEL', desc: 'ASCII 7 — the terminal bell. Message complete / attention',
        voices: [
            { wave: 'square', freq: 8000, freqEnd: null, delay: 0, attack: 0.001, decay: 1.033, gain: 0.152, filter: { type: 'bandpass', cutoff: 12000, q: 2.569 } },
            { wave: 'triangle', freq: 1038, freqEnd: null, delay: 0, attack: 0.001, decay: 1.033, gain: 0.027, filter: null },
        ],
    },
    BTN_PRESS: {
        name: 'BTN_PRESS', desc: 'Button pressed down (low chunk)',
        vary: { freq: 0.02, gain: 0.08 },
        voices: [
            { wave: 'sine', freq: 28, freqEnd: 1426, delay: 0, attack: 0.03, decay: 0.209, gain: 0.223, filter: { type: 'lowpass', cutoff: 337, q: 0.958 } },
            { wave: 'square', freq: 54, freqEnd: 1086, delay: 0, attack: 0.008, decay: 0.087, gain: 0.098, filter: { type: 'bandpass', cutoff: 319, q: 0.885 } },
        ],
    },
    BTN_CONFIRM: {
        name: 'BTN_CONFIRM', desc: 'Button click confirmed (rising fifth)',
        voices: [
            { wave: 'square', freq: 1709, freqEnd: 4640, delay: 0.33, attack: 0.011, decay: 1.316, gain: 0.083, filter: { type: 'lowpass', cutoff: 2000, q: 1 } },
            { wave: 'sine', freq: 42, freqEnd: 469, delay: 0, attack: 0.002, decay: 0.636, gain: 0.519, filter: { type: 'highpass', cutoff: 157, q: 1.005 } },
            { wave: 'triangle', freq: 4142, freqEnd: 4335, delay: 0.33, attack: 0.001, decay: 1.166, gain: 0.091, filter: { type: 'highpass', cutoff: 12000, q: 16.789 } },
        ],
    },
    ERROR: {
        name: 'ERROR', desc: 'Descending buzz — invalid action / startError',
        voices: [
            { wave: 'square', freq: 53, freqEnd: 48, delay: 0.127, attack: 0.005, decay: 0.28, gain: 0.2, filter: { type: 'lowpass', cutoff: 1000, q: 1 } },
            { wave: 'sawtooth', freq: 151, freqEnd: 153, delay: 0, attack: 0.005, decay: 0.28, gain: 0.273, filter: { type: 'lowpass', cutoff: 1000, q: 1 } },
        ],
    },
    COUNTDOWN: {
        name: 'COUNTDOWN', desc: 'Round countdown blip',
        voices: [
            { wave: 'square', freq: 1671, freqEnd: null, delay: 0, attack: 0.001, decay: 0.18, gain: 0.18, filter: { type: 'lowpass', cutoff: 4042, q: 1.296 } },
            { wave: 'sawtooth', freq: 82, freqEnd: null, delay: 0, attack: 0.001, decay: 0.961, gain: 0.019, filter: { type: 'lowpass', cutoff: 4042, q: 1.296 } },
        ],
    },
    ROUND_START: {
        name: 'ROUND_START', desc: 'Round begins (rising sweep)',
        voices: [
            { wave: 'sawtooth', freq: 326, freqEnd: null, delay: 0, attack: 0.001, decay: 0.55, gain: 0.117, filter: { type: 'highpass', cutoff: 122, q: 1 } },
            { wave: 'square', freq: 3227, freqEnd: null, delay: 0, attack: 0.001, decay: 0.176, gain: 0.114, filter: { type: 'lowpass', cutoff: 5403, q: 1 } },
        ],
    },

    // ── Drums (synthesized from CRT_sample.mp3, then ear-tuned in the Sound Lab) ──
    KICK: {
        name: 'KICK', desc: 'Deep mechanical thud — E2: sine drop to ~41 Hz + spring rattle',
        vary: { freq: 0.03, gain: 0.08 },
        voices: [
            { wave: 'sine', freq: 110, freqEnd: 41, delay: 0, attack: 0.002, decay: 0.28, gain: 0.621, filter: null },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.013, gain: 0.5, filter: { type: 'lowpass', cutoff: 1019, q: 0.7 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.005, decay: 0.039, gain: 0.04, filter: { type: 'bandpass', cutoff: 8000, q: 1 } },
        ],
    },
    CLACK: {
        name: 'CLACK', desc: 'Bright mechanical clack (snare) — E1: noise snap + 400/510 Hz body',
        voices: [
            { wave: 'square', freq: 3015, freqEnd: null, delay: 0, attack: 0.001, decay: 0.224, gain: 0.5, filter: { type: 'bandpass', cutoff: 5500, q: 0.8 } },
            { wave: 'sawtooth', freq: 37, freqEnd: null, delay: 0.157, attack: 0.08, decay: 0.005, gain: 0.5, filter: { type: 'bandpass', cutoff: 5500, q: 0.8 } },
        ],
    },
    HAT: {
        name: 'HAT', desc: 'Closed hat — E3: short metallic tick',
        vary: { freq: 0.06, gain: 0.15 },
        voices: [
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.04, gain: 0.3, filter: { type: 'highpass', cutoff: 6800, q: 0.7 } },
            { wave: 'square', freq: 4840, freqEnd: null, delay: 0, attack: 0.001, decay: 0.03, gain: 0.05, filter: { type: 'bandpass', cutoff: 5000, q: 2 } },
        ],
    },
    HAT_OPEN: {
        name: 'HAT_OPEN', desc: 'Open hat — E3 with the ~510 Hz chassis ring let breathe',
        voices: [
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.18, gain: 0.25, filter: { type: 'highpass', cutoff: 6500, q: 0.7 } },
        ],
    },

    // ── CRT ambience (from the deep-research pass) ───────────────────────────
    DEGAUSS: {
        name: 'DEGAUSS', desc: 'Cold power-on fwoomp: detuned mains pair beating at 4 Hz, multi-second decay',
        voices: [
            { wave: 'sawtooth', freq: 58, freqEnd: null, delay: 0, attack: 0.04, decay: 1.8, gain: 0.5, filter: { type: 'bandpass', cutoff: 120, q: 1.2 } },
            { wave: 'sawtooth', freq: 62, freqEnd: null, delay: 0, attack: 0.04, decay: 1.6, gain: 0.4, filter: { type: 'bandpass', cutoff: 120, q: 1.2 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.03, decay: 1.2, gain: 0.15, filter: { type: 'lowpass', cutoff: 400, q: 0.7 } },
        ],
    },
    HUM: {
        name: 'HUM', desc: 'Idle transformer hum bed — 120 Hz + harmonics, continuous',
        sustain: true,
        voices: [
            { wave: 'sine', freq: 120, freqEnd: null, delay: 0, attack: 0.5, decay: 1, gain: 0.045, filter: null, lfo: { rate: 0.5, depth: 0.25 } },
            { wave: 'sine', freq: 240, freqEnd: null, delay: 0, attack: 0.5, decay: 1, gain: 0.016, filter: null },
            { wave: 'square', freq: 120, freqEnd: null, delay: 0, attack: 0.5, decay: 1, gain: 0.008, filter: { type: 'lowpass', cutoff: 2000, q: 0.7 }, lfo: { rate: 1.3, depth: 0.3 } },
        ],
    },
    POWER_OFF: {
        name: 'POWER_OFF', desc: 'HV collapse — pitch drop + static tick',
        voices: [
            { wave: 'sine', freq: 200, freqEnd: 40, delay: 0, attack: 0.002, decay: 0.15, gain: 0.4, filter: null },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.02, gain: 0.15, filter: { type: 'highpass', cutoff: 4000, q: 0.7 } },
            { wave: 'square', freq: 254, freqEnd: 28, delay: 0.074, attack: 0.001, decay: 0.266, gain: 0.095, filter: { type: 'lowpass', cutoff: 203, q: 0.549 } },
        ],
    },
};
