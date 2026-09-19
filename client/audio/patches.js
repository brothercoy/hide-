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
        name: 'BTN_PRESS', desc: 'Firm press-down — snap + deep sinking thunk (120→36 Hz)',
        vary: { freq: 0, gain: 0.1 },
        voices: [
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.022, gain: 0.4, filter: { type: 'bandpass', cutoff: 2200, q: 1.2 } },
            { wave: 'sine', freq: 120, freqEnd: 36, delay: 0, attack: 0.002, decay: 0.09, gain: 0.55, filter: null },
        ],
    },
    BTN_CONFIRM: {
        name: 'BTN_CONFIRM', desc: 'The release: quick mirrored rise, then a glitter-burst of crack+ping sparks over the button glow',
        voices: [
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.02, gain: 0.3, filter: { type: 'bandpass', cutoff: 2800, q: 1.2 } },
            { wave: 'sine', freq: 45, freqEnd: 150, delay: 0, attack: 0.003, decay: 0.09, gain: 0.48, filter: null },
            { wave: 'triangle', freq: 510, freqEnd: null, delay: 0, attack: 0.001, decay: 0.07, gain: 0.04, filter: null },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.24, attack: 0.001, decay: 0.03, gain: 0.05, filter: { type: 'bandpass', cutoff: 5200, q: 6 } },
            { wave: 'square', freq: 2489, freqEnd: null, delay: 0.24, attack: 0.003, decay: 0.2, gain: 0.04, filter: { type: 'bandpass', cutoff: 2500, q: 8 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.34, attack: 0.001, decay: 0.03, gain: 0.04, filter: { type: 'bandpass', cutoff: 7400, q: 6 } },
            { wave: 'square', freq: 3620, freqEnd: null, delay: 0.35, attack: 0.003, decay: 0.18, gain: 0.03, filter: { type: 'bandpass', cutoff: 3600, q: 8 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.47, attack: 0.001, decay: 0.025, gain: 0.03, filter: { type: 'bandpass', cutoff: 9500, q: 6 } },
            { wave: 'square', freq: 5230, freqEnd: null, delay: 0.48, attack: 0.003, decay: 0.16, gain: 0.022, filter: { type: 'bandpass', cutoff: 5200, q: 8 } },
            { wave: 'square', freq: 6989, freqEnd: null, delay: 0.62, attack: 0.005, decay: 0.22, gain: 0.012, filter: { type: 'bandpass', cutoff: 6900, q: 8 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.3, attack: 0.001, decay: 0.03, gain: 0.04, filter: { type: 'bandpass', cutoff: 4200, q: 6 } },
            { wave: 'square', freq: 1666, freqEnd: null, delay: 0.3, attack: 0.003, decay: 0.18, gain: 0.025, filter: { type: 'bandpass', cutoff: 1700, q: 8 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.41, attack: 0.001, decay: 0.025, gain: 0.035, filter: { type: 'bandpass', cutoff: 8600, q: 6 } },
            { wave: 'square', freq: 4433, freqEnd: null, delay: 0.42, attack: 0.003, decay: 0.15, gain: 0.02, filter: { type: 'bandpass', cutoff: 4400, q: 8 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.55, attack: 0.001, decay: 0.02, gain: 0.025, filter: { type: 'bandpass', cutoff: 11000, q: 6 } },
            { wave: 'square', freq: 8214, freqEnd: null, delay: 0.56, attack: 0.003, decay: 0.14, gain: 0.018, filter: { type: 'bandpass', cutoff: 8200, q: 8 } },
            { wave: 'square', freq: 9956, freqEnd: null, delay: 0.74, attack: 0.005, decay: 0.2, gain: 0.008, filter: { type: 'bandpass', cutoff: 9900, q: 8 } },
        ],
    },
    ERROR: {
        name: 'ERROR', desc: 'Descending buzz — invalid action / startError',
        voices: [
            { wave: 'square', freq: 53, freqEnd: 48, delay: 0.127, attack: 0.005, decay: 0.28, gain: 0.2, filter: { type: 'lowpass', cutoff: 1000, q: 1 } },
            { wave: 'sawtooth', freq: 151, freqEnd: 153, delay: 0, attack: 0.005, decay: 0.28, gain: 0.273, filter: { type: 'lowpass', cutoff: 1000, q: 1 } },
        ],
    },
    ERROR2: {
        name: 'ERROR2', desc: 'Miss-glitch: ERROR buzz wearing BTN_CONFIRM glitter — sour sparks in beating detuned pairs, all bending DOWN, dying out low',
        vary: { freq: 0.04, gain: 0.15 },
        voices: [
            // The ERROR body, shortened — buzz with a downward sag
            { wave: 'sawtooth', freq: 151, freqEnd: 138, delay: 0, attack: 0.005, decay: 0.18, gain: 0.22, filter: { type: 'lowpass', cutoff: 1000, q: 1 } },
            { wave: 'square', freq: 53, freqEnd: 44, delay: 0.02, attack: 0.005, decay: 0.2, gain: 0.14, filter: { type: 'lowpass', cutoff: 800, q: 1 } },
            // Sour glitter: noise chirp + a semitone-clashing ping pair per spark, pitch bending down
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.05, attack: 0.001, decay: 0.03, gain: 0.045, filter: { type: 'bandpass', cutoff: 5200, q: 6 } },
            { wave: 'sawtooth', freq: 2489, freqEnd: 2114, delay: 0.05, attack: 0.003, decay: 0.13, gain: 0.03, filter: { type: 'bandpass', cutoff: 2500, q: 8 } },
            { wave: 'square', freq: 2637, freqEnd: 2240, delay: 0.055, attack: 0.003, decay: 0.12, gain: 0.018, filter: { type: 'bandpass', cutoff: 2600, q: 8 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.14, attack: 0.001, decay: 0.03, gain: 0.04, filter: { type: 'bandpass', cutoff: 7400, q: 6 } },
            { wave: 'sawtooth', freq: 3520, freqEnd: 2992, delay: 0.14, attack: 0.003, decay: 0.12, gain: 0.026, filter: { type: 'bandpass', cutoff: 3500, q: 8 } },
            { wave: 'square', freq: 3729, freqEnd: 3169, delay: 0.145, attack: 0.003, decay: 0.11, gain: 0.015, filter: { type: 'bandpass', cutoff: 3700, q: 8 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.23, attack: 0.001, decay: 0.028, gain: 0.035, filter: { type: 'bandpass', cutoff: 4200, q: 6 } },
            { wave: 'sawtooth', freq: 1760, freqEnd: 1496, delay: 0.23, attack: 0.003, decay: 0.12, gain: 0.026, filter: { type: 'bandpass', cutoff: 1800, q: 8 } },
            { wave: 'square', freq: 1865, freqEnd: 1585, delay: 0.235, attack: 0.003, decay: 0.11, gain: 0.015, filter: { type: 'bandpass', cutoff: 1900, q: 8 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.32, attack: 0.001, decay: 0.025, gain: 0.028, filter: { type: 'bandpass', cutoff: 8600, q: 6 } },
            { wave: 'sawtooth', freq: 4978, freqEnd: 4231, delay: 0.32, attack: 0.003, decay: 0.1, gain: 0.018, filter: { type: 'bandpass', cutoff: 5000, q: 8 } },
            // Dying ember — a last low sour pair, sagging away
            { wave: 'sawtooth', freq: 1245, freqEnd: 1058, delay: 0.4, attack: 0.004, decay: 0.14, gain: 0.02, filter: { type: 'bandpass', cutoff: 1250, q: 8 } },
            { wave: 'square', freq: 1319, freqEnd: 1121, delay: 0.405, attack: 0.004, decay: 0.13, gain: 0.012, filter: { type: 'bandpass', cutoff: 1350, q: 8 } },
        ],
    },
    CHAPTER_CLEAR: {
        name: 'CHAPTER_CLEAR', desc: 'Chapter complete — the confirm thunk opening into a rising C-major arpeggio with IN-TUNE glitter (the anti-ERROR2)',
        voices: [
            // The confirm's release thunk opens it
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.02, gain: 0.25, filter: { type: 'bandpass', cutoff: 2800, q: 1.2 } },
            { wave: 'sine', freq: 45, freqEnd: 150, delay: 0, attack: 0.003, decay: 0.09, gain: 0.45, filter: null },
            // Rising arpeggio: C5 E5 G5 C6
            { wave: 'triangle', freq: 523, freqEnd: null, delay: 0.05, attack: 0.004, decay: 0.4, gain: 0.11, filter: null },
            { wave: 'triangle', freq: 659, freqEnd: null, delay: 0.19, attack: 0.004, decay: 0.4, gain: 0.11, filter: null },
            { wave: 'triangle', freq: 784, freqEnd: null, delay: 0.33, attack: 0.004, decay: 0.45, gain: 0.11, filter: null },
            { wave: 'triangle', freq: 1046, freqEnd: null, delay: 0.47, attack: 0.004, decay: 0.9, gain: 0.13, filter: null },
            { wave: 'square', freq: 2093, freqEnd: null, delay: 0.47, attack: 0.005, decay: 0.35, gain: 0.022, filter: { type: 'bandpass', cutoff: 2100, q: 6 } },
            // Glitter, but harmonic — sparks on chord tones climbing away
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.62, attack: 0.001, decay: 0.03, gain: 0.04, filter: { type: 'bandpass', cutoff: 5200, q: 6 } },
            { wave: 'square', freq: 1319, freqEnd: null, delay: 0.62, attack: 0.003, decay: 0.2, gain: 0.03, filter: { type: 'bandpass', cutoff: 1300, q: 8 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.72, attack: 0.001, decay: 0.03, gain: 0.035, filter: { type: 'bandpass', cutoff: 7400, q: 6 } },
            { wave: 'square', freq: 1568, freqEnd: null, delay: 0.72, attack: 0.003, decay: 0.2, gain: 0.026, filter: { type: 'bandpass', cutoff: 1600, q: 8 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.82, attack: 0.001, decay: 0.025, gain: 0.03, filter: { type: 'bandpass', cutoff: 9500, q: 6 } },
            { wave: 'square', freq: 2093, freqEnd: null, delay: 0.82, attack: 0.003, decay: 0.18, gain: 0.022, filter: { type: 'bandpass', cutoff: 2100, q: 8 } },
            { wave: 'square', freq: 2637, freqEnd: null, delay: 0.95, attack: 0.005, decay: 0.22, gain: 0.014, filter: { type: 'bandpass', cutoff: 2600, q: 8 } },
        ],
    },
    SCORE_SUM: {
        name: 'SCORE_SUM', desc: 'The ACK scoreboard totalling up — an adding-machine clack, three digits rolling up, and the total locking in',
        vary: { freq: 0.01, gain: 0.08 },
        voices: [
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.035, gain: 0.22, filter: { type: 'bandpass', cutoff: 2400, q: 1.6 } },   // the mechanism
            { wave: 'sine', freq: 140, freqEnd: 95, delay: 0, attack: 0.002, decay: 0.13, gain: 0.16, filter: null },                                             // its thunk
            // the digits rolling up
            { wave: 'triangle', freq: 523, freqEnd: null, delay: 0.01, attack: 0.002, decay: 0.11, gain: 0.1, filter: null },
            { wave: 'triangle', freq: 659, freqEnd: null, delay: 0.06, attack: 0.002, decay: 0.11, gain: 0.095, filter: null },
            { wave: 'triangle', freq: 784, freqEnd: null, delay: 0.11, attack: 0.002, decay: 0.12, gain: 0.09, filter: null },
            // the total landing
            { wave: 'triangle', freq: 1046, freqEnd: null, delay: 0.17, attack: 0.003, decay: 0.42, gain: 0.11, filter: null },
            { wave: 'square', freq: 2093, freqEnd: null, delay: 0.17, attack: 0.004, decay: 0.2, gain: 0.022, filter: { type: 'bandpass', cutoff: 2100, q: 7 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.17, attack: 0.001, decay: 0.03, gain: 0.05, filter: { type: 'bandpass', cutoff: 7000, q: 5 } },
        ],
    },
    WINNER_FANFARE: {
        name: 'WINNER_FANFARE', desc: 'Herald trumpets announcing a king — three crisp calls, a rising triad, then a held proclamation chord. Sawtooth brass with a lowpass sweeping up through each attack (the blat)',
        vary: { freq: 0.006, gain: 0.06 },
        voices: [
            // "ta — ta — ta": the herald's call, three crisp notes on G
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.03, gain: 0.06, filter: { type: 'bandpass', cutoff: 3000, q: 2 } },
            { wave: 'sawtooth', freq: 392, freqEnd: null, delay: 0, attack: 0.01, decay: 0.15, gain: 0.14, filter: { type: 'lowpass', cutoff: 1500, cutoffEnd: 3400, q: 1.2 } },
            { wave: 'sawtooth', freq: 392, freqEnd: null, delay: 0.18, attack: 0.01, decay: 0.15, gain: 0.14, filter: { type: 'lowpass', cutoff: 1500, cutoffEnd: 3400, q: 1.2 } },
            { wave: 'sawtooth', freq: 392, freqEnd: null, delay: 0.36, attack: 0.01, decay: 0.15, gain: 0.14, filter: { type: 'lowpass', cutoff: 1500, cutoffEnd: 3400, q: 1.2 } },
            // the rise — C, E, G climbing to the proclamation
            { wave: 'sawtooth', freq: 523, freqEnd: null, delay: 0.54, attack: 0.012, decay: 0.17, gain: 0.14, filter: { type: 'lowpass', cutoff: 1700, cutoffEnd: 3800, q: 1.2 } },
            { wave: 'sawtooth', freq: 659, freqEnd: null, delay: 0.7, attack: 0.012, decay: 0.17, gain: 0.135, filter: { type: 'lowpass', cutoff: 1900, cutoffEnd: 4200, q: 1.2 } },
            { wave: 'sawtooth', freq: 784, freqEnd: null, delay: 0.86, attack: 0.012, decay: 0.22, gain: 0.13, filter: { type: 'lowpass', cutoff: 2100, cutoffEnd: 4600, q: 1.2 } },
            // the proclamation — full C-major chord, held and ringing out
            { wave: 'noise', freq: 440, freqEnd: null, delay: 1.08, attack: 0.001, decay: 0.05, gain: 0.07, filter: { type: 'bandpass', cutoff: 3400, q: 2 } },
            { wave: 'sawtooth', freq: 1046, freqEnd: null, delay: 1.08, attack: 0.02, decay: 1.9, gain: 0.14, filter: { type: 'lowpass', cutoff: 2400, cutoffEnd: 5200, q: 1.2 } },
            { wave: 'sawtooth', freq: 784, freqEnd: null, delay: 1.085, attack: 0.022, decay: 1.9, gain: 0.1, filter: { type: 'lowpass', cutoff: 2200, cutoffEnd: 4800, q: 1.2 } },
            { wave: 'sawtooth', freq: 659, freqEnd: null, delay: 1.09, attack: 0.022, decay: 1.85, gain: 0.09, filter: { type: 'lowpass', cutoff: 2000, cutoffEnd: 4400, q: 1.2 } },
            { wave: 'sawtooth', freq: 523, freqEnd: null, delay: 1.09, attack: 0.022, decay: 1.9, gain: 0.11, filter: { type: 'lowpass', cutoff: 1800, cutoffEnd: 4200, q: 1.2 } },
            { wave: 'triangle', freq: 131, freqEnd: null, delay: 1.08, attack: 0.02, decay: 1.9, gain: 0.13, filter: null },   // the low body under it
            { wave: 'square', freq: 2093, freqEnd: null, delay: 1.1, attack: 0.03, decay: 0.85, gain: 0.02, filter: { type: 'bandpass', cutoff: 2100, q: 6 } },
        ],
    },
    TADA: {
        name: 'TADA', desc: 'Trumpet ta-da — a short G pickup into a sustained C-major triad, sawtooth brass with a rising filter sweep for the blat and an air chirp on each attack',
        vary: { freq: 0.008, gain: 0.08 },
        voices: [
            // "ta" — the short pickup, G4
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.04, gain: 0.08, filter: { type: 'bandpass', cutoff: 3000, q: 2 } },
            { wave: 'sawtooth', freq: 392, freqEnd: null, delay: 0, attack: 0.012, decay: 0.16, gain: 0.15, filter: { type: 'lowpass', cutoff: 1600, cutoffEnd: 3600, q: 1.2 } },
            { wave: 'sawtooth', freq: 196, freqEnd: null, delay: 0, attack: 0.012, decay: 0.16, gain: 0.08, filter: { type: 'lowpass', cutoff: 1800, q: 1 } },
            { wave: 'square', freq: 784, freqEnd: null, delay: 0, attack: 0.012, decay: 0.14, gain: 0.034, filter: { type: 'lowpass', cutoff: 4000, q: 1 } },
            // "daaa" — the landing chord, C major, held long and ringing out
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.17, attack: 0.001, decay: 0.05, gain: 0.09, filter: { type: 'bandpass', cutoff: 3400, q: 2 } },
            { wave: 'sawtooth', freq: 523, freqEnd: null, delay: 0.17, attack: 0.02, decay: 2.2, gain: 0.165, filter: { type: 'lowpass', cutoff: 1800, cutoffEnd: 4200, q: 1.2 } },
            { wave: 'sawtooth', freq: 659, freqEnd: null, delay: 0.175, attack: 0.022, decay: 2.1, gain: 0.12, filter: { type: 'lowpass', cutoff: 2000, cutoffEnd: 4400, q: 1.2 } },
            { wave: 'sawtooth', freq: 784, freqEnd: null, delay: 0.18, attack: 0.022, decay: 2.3, gain: 0.115, filter: { type: 'lowpass', cutoff: 2200, cutoffEnd: 4800, q: 1.2 } },
            { wave: 'sawtooth', freq: 1046, freqEnd: null, delay: 0.185, attack: 0.025, decay: 2, gain: 0.07, filter: { type: 'lowpass', cutoff: 3000, cutoffEnd: 6000, q: 1 } },
            { wave: 'square', freq: 1568, freqEnd: null, delay: 0.19, attack: 0.03, decay: 1.6, gain: 0.024, filter: { type: 'bandpass', cutoff: 1600, q: 4 } },
            // low body under the chord, so it lands with weight and keeps the room full
            { wave: 'triangle', freq: 131, freqEnd: null, delay: 0.17, attack: 0.02, decay: 2.3, gain: 0.14, filter: null },
            { wave: 'triangle', freq: 65, freqEnd: null, delay: 0.17, attack: 0.03, decay: 2.3, gain: 0.1, filter: null },
        ],
    },
    CHAPTER_REVEAL: {
        name: 'CHAPTER_REVEAL', desc: 'Snappy harp-like flourish as a chapter unlocks — a fast pentatonic run up, plucked triangles with square harmonics and noise chirps so it reads as a terminal, not an orchestra',
        vary: { freq: 0.015, gain: 0.1 },
        voices: [
            // The pluck that opens it — a chirp of noise, like a head hitting the platter
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.03, gain: 0.07, filter: { type: 'bandpass', cutoff: 3200, q: 3 } },
            // Ascending C-pentatonic run (C5→C7), ~78ms apart so it unspools across the whole
            // reveal wave; strings ring far longer than the gap, so they still pile into a
            // glissando instead of reading as separate beeps.
            { wave: 'triangle', freq: 523, freqEnd: null, delay: 0, attack: 0.002, decay: 0.52, gain: 0.075, filter: null },
            { wave: 'triangle', freq: 587, freqEnd: null, delay: 0.078, attack: 0.002, decay: 0.52, gain: 0.072, filter: null },
            { wave: 'triangle', freq: 659, freqEnd: null, delay: 0.156, attack: 0.002, decay: 0.5, gain: 0.069, filter: null },
            { wave: 'triangle', freq: 784, freqEnd: null, delay: 0.234, attack: 0.002, decay: 0.5, gain: 0.065, filter: null },
            { wave: 'triangle', freq: 880, freqEnd: null, delay: 0.312, attack: 0.002, decay: 0.48, gain: 0.061, filter: null },
            { wave: 'triangle', freq: 1046, freqEnd: null, delay: 0.39, attack: 0.002, decay: 0.48, gain: 0.057, filter: null },
            { wave: 'triangle', freq: 1175, freqEnd: null, delay: 0.468, attack: 0.002, decay: 0.46, gain: 0.053, filter: null },
            { wave: 'triangle', freq: 1319, freqEnd: null, delay: 0.546, attack: 0.002, decay: 0.46, gain: 0.049, filter: null },
            { wave: 'triangle', freq: 1568, freqEnd: null, delay: 0.624, attack: 0.002, decay: 0.44, gain: 0.045, filter: null },
            { wave: 'triangle', freq: 1760, freqEnd: null, delay: 0.702, attack: 0.002, decay: 0.46, gain: 0.042, filter: null },
            { wave: 'triangle', freq: 2093, freqEnd: null, delay: 0.78, attack: 0.002, decay: 1, gain: 0.05, filter: null },   // the landing, left ringing
            // Square harmonics dusted over the run — the digital glint on the strings
            { wave: 'square', freq: 1046, freqEnd: null, delay: 0, attack: 0.003, decay: 0.12, gain: 0.012, filter: { type: 'bandpass', cutoff: 1050, q: 8 } },
            { wave: 'square', freq: 1760, freqEnd: null, delay: 0.312, attack: 0.003, decay: 0.12, gain: 0.01, filter: { type: 'bandpass', cutoff: 1800, q: 8 } },
            { wave: 'square', freq: 2637, freqEnd: null, delay: 0.624, attack: 0.003, decay: 0.14, gain: 0.009, filter: { type: 'bandpass', cutoff: 2650, q: 8 } },
            { wave: 'square', freq: 4186, freqEnd: null, delay: 0.78, attack: 0.004, decay: 0.35, gain: 0.008, filter: { type: 'bandpass', cutoff: 4200, q: 8 } },
            // A last airy chirp as the top note lands
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0.78, attack: 0.001, decay: 0.05, gain: 0.03, filter: { type: 'bandpass', cutoff: 9000, q: 4 } },
        ],
    },
    FANFARE: {
        name: 'FANFARE', desc: 'Anthem-jingle lead — the CHAPTER_CLEAR triangle voice as a tracker instrument (authored at C5)',
        voices: [
            { wave: 'triangle', freq: 523, freqEnd: null, delay: 0, attack: 0.005, decay: 0.35, gain: 0.13, filter: null },
            { wave: 'square', freq: 2093, freqEnd: null, delay: 0, attack: 0.005, decay: 0.12, gain: 0.015, filter: { type: 'bandpass', cutoff: 2100, q: 6 } },
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
            { wave: 'sine', freq: 110, freqEnd: 41, delay: 0, attack: 0.002, decay: 0.28, gain: 0.326, filter: null },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.013, gain: 0.5, filter: { type: 'lowpass', cutoff: 1019, q: 0.7 } },
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.005, decay: 0.039, gain: 0.598, filter: { type: 'bandpass', cutoff: 8000, q: 1 } },
        ],
    },
    CLACK: {
        name: 'CLACK', desc: 'Bright mechanical clack (snare) — E1: noise snap + 400/510 Hz body',
        vary: { freq: 0.05, gain: 0.12 },
        voices: [
            { wave: 'sawtooth', freq: 144, freqEnd: null, delay: 0, attack: 0.002, decay: 0.027, gain: 0.545, filter: { type: 'lowpass', cutoff: 1115, q: 20 } },
            { wave: 'noise', freq: 37, freqEnd: null, delay: 0, attack: 0.002, decay: 0.011, gain: 1, filter: { type: 'lowpass', cutoff: 199, q: 3.764 } },
            { wave: 'noise', freq: 37, freqEnd: null, delay: 0, attack: 0.001, decay: 0.111, gain: 0.981, filter: { type: 'lowpass', cutoff: 369, q: 0.743 } },
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
    CRASH: {
        name: 'CRASH', desc: 'Cymbal crash — strike, a long shimmering wash and a low body thump. For song-ending impacts, where HAT_OPEN is far too short',
        vary: { freq: 0.02, gain: 0.06 },
        voices: [
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.07, gain: 0.5, filter: { type: 'highpass', cutoff: 3000, q: 0.7 } },    // the strike
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.003, decay: 1.5, gain: 0.3, filter: { type: 'highpass', cutoff: 5200, q: 0.7 } },     // the wash
            { wave: 'noise', freq: 440, freqEnd: null, delay: 0, attack: 0.001, decay: 0.75, gain: 0.16, filter: { type: 'bandpass', cutoff: 9500, q: 1.2 } },   // sizzle on top
            { wave: 'sine', freq: 95, freqEnd: 58, delay: 0, attack: 0.002, decay: 0.26, gain: 0.26, filter: null },                                             // body — the weight behind it
        ],
    },

    // ── Tracker instruments (authored at A4 = 440 Hz; the tracker pitches them per note) ──
    LEAD: {
        name: 'LEAD', desc: 'Tracker lead — square wave. Tune it here, the tracker transposes it',
        voices: [
            { wave: 'square', freq: 440, freqEnd: null, delay: 0, attack: 0.003, decay: 0.18, gain: 0.095, filter: { type: 'lowpass', cutoff: 5000, q: 1 } },
            { wave: 'noise', freq: 3301, freqEnd: null, delay: 0, attack: 0.016, decay: 0.021, gain: 0.16, filter: { type: 'lowpass', cutoff: 5000, q: 1 } },
        ],
    },
    BASS: {
        name: 'BASS', desc: 'Tracker bass — tuned by ear; tracker pitches notes relative to voice 1',
        voices: [
            { wave: 'triangle', freq: 31, freqEnd: null, delay: 0, attack: 0.004, decay: 2.036, gain: 0.045, filter: { type: 'lowpass', cutoff: 2500, q: 0.7 } },
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
    // The main menu's secret: a special character held DOWN. BTN_PRESS's sinking sine thunk
    // (120→36 Hz) pitched up and frozen at the top of its fall, with a fast tremolo so it reads
    // as the glyph vibrating. Sustained — started by holdSfx, one per held character, each
    // transposed to a chord tone, so the chord builds as more are held.
    SECRET_HOLD: {
        name: 'SECRET_HOLD', desc: 'Held special char — BTN_PRESS body pitched up, continuous, vibrating (one per chord tone)',
        sustain: true,
        voices: [
            { wave: 'sine', freq: 240, freqEnd: null, delay: 0, attack: 0.03, decay: 0.2, gain: 0.05, filter: null, lfo: { rate: 16, depth: 0.45 } },
            { wave: 'square', freq: 240, freqEnd: null, delay: 0, attack: 0.03, decay: 0.2, gain: 0.01, filter: { type: 'lowpass', cutoff: 900, q: 0.7 }, lfo: { rate: 16, depth: 0.45 } },
        ],
    },
    HUM: {
        name: 'HUM', desc: 'Idle transformer hum bed — 120 Hz + harmonics, continuous',
        sustain: true,
        voices: [
            { wave: 'sine', freq: 120, freqEnd: null, delay: 0, attack: 0.5, decay: 1, gain: 0, filter: null, lfo: { rate: 0.5, depth: 0.25 } },
            { wave: 'noise', freq: 240, freqEnd: null, delay: 0, attack: 0.5, decay: 3, gain: 0.008, filter: { type: 'lowpass', cutoff: 965, q: 0.3 } },
            { wave: 'square', freq: 67, freqEnd: null, delay: 0, attack: 0.5, decay: 3, gain: 0.015, filter: { type: 'lowpass', cutoff: 100, q: 0.3 }, lfo: { rate: 1.3, depth: 0.3 } },
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
