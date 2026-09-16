// songs.js — tracker songs composed in the Sound Lab (button-test.html, TRACKER tab).
//
// Regenerated from a lab export; edit songs in the tracker, not here. See
// MusicPlayer.js for the format. 'n' is an empty cell and 'h' is a HOLD, kept
// short so patterns stay readable.

const n = null;
const h = '~';

export const SONGS = {
    // HAND-DRAFTED (not from a lab export — the lab merges it into the tracker for tuning):
    // the last phrase of The Star-Spangled Banner, "O'er the land of the free and the home of
    // the brave", approximated by ear for the USA chapter-clear jingle. Adjust notes/bpm in the
    // tracker; the next songs export carries the tuned version.
    "ANTHEM_USA": {
        name: 'ANTHEM_USA', bpm: 130,
        instruments: ['FANFARE', 'BASS'],
        chains: [[0], [0], [0]],
        patterns: [
        // pattern 0 — 40 steps
        {
            len: 40,
            ch: [
                /* LEAD */ [
                    67, h, 67, h,          // o'er the      (G4 G4)
                    72, h, 74, h,          // land of       (C5 D5)
                    76, h,                 // the           (E5)
                    79, h, h, h, h,        // FREE —        (G5, held)
                    h, h, h, h, h,
                    72, h, 76, h,          // and the       (C5 E5)
                    76, h, 77, h,          // home of       (E5 F5)
                    74, h,                 // the           (D5)
                    72, h, h, h, h,        // BRAVE —       (C5, held)
                    h, h, h, h, h,
                ],
                /* BASS */ [
                    48, h, h, h,
                    h, h, h, h,
                    h, h,
                    43, h, h, h, h,
                    h, h, h, h, h,
                    41, h, h, h,
                    h, h, h, h,
                    h, h,
                    36, h, h, h, h,
                    h, h, h, h, h,
                ],
                /* DRUM */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n,
                    n, n, n, n, n,
                    n, n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n,
                    n, n, n, n, n,
                    n, n, n, n, n,
                ],
            ],
        },
        ],
    },
    // GREECE — Hymn to Liberty ending (C major): E C5 | B B A A G G | F A A G E | F D → C.
    // Pitches verified against two independent sources (bitmidi melody track in F, 8notes voice
    // arrangement in C — identical transposed). Rhythm approximated; tune in the tracker.
    "ANTHEM_GREECE": {
        name: 'ANTHEM_GREECE', bpm: 150,
        instruments: ['FANFARE', 'BASS'],
        chains: [[0], [0], [0]],
        patterns: [
        {
            len: 40,
            ch: [
                /* LEAD */ [
                    64, h, 72, h,
                    71, h, 71, h,
                    69, h, 69, h,
                    67, h, 67, h,
                    65, h, 69, h,
                    69, h, 67, h,
                    64, h, 65, h,
                    62, h,
                    60, h, h, h,
                    h, h, h, h, h, h,
                ],
                /* BASS */ [
                    48, h, h, h,
                    h, h, h, h,
                    h, h, h, h,
                    h, h, h, h,
                    43, h, h, h,
                    h, h, h, h,
                    h, h, h, h,
                    h, h,
                    48, h, h, h,
                    h, h, h, h, h, h,
                ],
                /* DRUM */ [
                    n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n,
                ],
            ],
        },
        ],
    },
    // RUSSIA — state anthem chorus ending (C major): A A C5 B A G | C C G A B → C5.
    // Melody track identical in two independent MIDI transcriptions.
    "ANTHEM_RUSSIA": {
        name: 'ANTHEM_RUSSIA', bpm: 130,
        instruments: ['FANFARE', 'BASS'],
        chains: [[0], [0], [0]],
        patterns: [
        {
            len: 36,
            ch: [
                /* LEAD */ [
                    69, h, 69, h,
                    72, h, 71, h,
                    69, h, 67, h,
                    60, h, 60, h,
                    67, h, 69, h,
                    71, h,
                    72, h, h, h,
                    h, h, h, h, h, h, h, h, h, h,
                ],
                /* BASS */ [
                    45, h, h, h,
                    h, h, h, h,
                    h, h, h, h,
                    48, h, h, h,
                    h, h, h, h,
                    h, h,
                    36, h, h, h,
                    h, h, h, h, h, h, h, h, h, h,
                ],
                /* DRUM */ [
                    n, n, n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n, n, n,
                ],
            ],
        },
        ],
    },
    // JAPAN — Kimigayo ending (D dorian): A C5 D5— | C5 D5 A G | A G E → D—.
    // Verified against the MIT ABC archive AND a Commons MIDI (identical). Traditionally
    // near-monophonic, so no bass line.
    "ANTHEM_JAPAN": {
        name: 'ANTHEM_JAPAN', bpm: 100,
        instruments: ['FANFARE', 'BASS'],
        chains: [[0], [0], [0]],
        patterns: [
        {
            len: 36,
            ch: [
                /* LEAD */ [
                    69, h, 72, h,
                    74, h, h, h, h, h,
                    72, h, 74, h,
                    69, h, 67, h,
                    69, h, 67, h,
                    64, h,
                    62, h, h, h,
                    h, h, h, h, h, h, h, h,
                ],
                /* BASS */ [
                    n, n, n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n, n, n,
                ],
                /* DRUM */ [
                    n, n, n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n, n, n,
                ],
            ],
        },
        ],
    },
    // ISRAEL — Hatikvah ending (D minor): G G G E | F F F F | E D E F | → D—.
    // Verified against Wikipedia's embedded LilyPond score AND two Commons MIDIs.
    "ANTHEM_ISRAEL": {
        name: 'ANTHEM_ISRAEL', bpm: 120,
        instruments: ['FANFARE', 'BASS'],
        chains: [[0], [0], [0]],
        patterns: [
        {
            len: 36,
            ch: [
                /* LEAD */ [
                    67, h, 67, h,
                    67, h, 64, h,
                    65, h, 65, h,
                    65, h, 65, h,
                    64, h, 62, h,
                    64, h, 65, h,
                    62, h, h, h,
                    h, h, h, h, h, h, h, h,
                ],
                /* BASS */ [
                    50, h, h, h,
                    h, h, h, h,
                    43, h, h, h,
                    h, h, h, h,
                    45, h, h, h,
                    h, h, h, h,
                    38, h, h, h,
                    h, h, h, h, h, h, h, h,
                ],
                /* DRUM */ [
                    n, n, n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n, n, n,
                ],
            ],
        },
        ],
    },
    // CHINA — March of the Volunteers ending (G major): B. G D5 D5 D5 | B G | then the rising
    // "qian jin!" D4→G4 three times into the final held G. From Wikipedia's embedded LilyPond
    // score of the official notation.
    "ANTHEM_CHINA": {
        name: 'ANTHEM_CHINA', bpm: 140,
        instruments: ['FANFARE', 'BASS'],
        chains: [[0], [0], [0]],
        patterns: [
        {
            len: 40,
            ch: [
                /* LEAD */ [
                    71, h, h, 67,
                    74, h, 74, h,
                    74, h,
                    71, h, 67, h,
                    62, h, 67, h,
                    62, h, 67, h,
                    62, h, 67, h,
                    67, h, h, h,
                    h, h, h, h,
                    h, h, h, h, h, h,
                ],
                /* BASS */ [
                    43, h, h, h,
                    h, h, h, h,
                    h, h,
                    h, h, h, h,
                    38, h, h, h,
                    h, h, h, h,
                    h, h, h, h,
                    43, h, h, h,
                    h, h, h, h,
                    h, h, h, h, h, h,
                ],
                /* DRUM */ [
                    n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n,
                    n, n, n, n, n, n, n, n, n, n,
                ],
            ],
        },
        ],
    },
    "THEME": {
        name: 'THEME', bpm: 120,
        instruments: ['LEAD', 'BASS'],
        chains: [[0, 0, 3, 3, 3, 3], [0, 0, 0, 0, 1, 1], [0]],
        patterns: [
        // pattern 0 — 33 steps
        {
            len: 33,
            ch: [
                /* LEAD */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
                /* BASS */ [
                    36, h, n, h,
                    n, n, n, n,
                    n, n, n, n,
                    48, h, n, h,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
                /* DRUM */ [
                    'KICK', n, n, n,
                    n, n, 'CLACK', n,
                    'HAT', 'HAT_OPEN', 'HAT', n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, 'CLACK',
                    n, 'HAT', 'HAT_OPEN', 'HAT',
                    n, 'KICK', n, n,
                    n,
                ],
            ],
        },
        // pattern 1 — 33 steps
        {
            len: 33,
            ch: [
                /* LEAD */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
                /* BASS */ [
                    38, h, n, h,
                    n, n, n, n,
                    n, n, n, n,
                    50, h, n, h,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
                /* DRUM */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
            ],
        },
        // pattern 2 — 33 steps
        {
            len: 33,
            ch: [
                /* LEAD */ [
                    n, n, 76, n,
                    n, n, n, n,
                    n, n, n, n,
                    72, n, n, n,
                    n, n, n, n,
                    69, n, n, n,
                    n, 65, 64, 72,
                    74, 75, n, n,
                    n,
                ],
                /* BASS */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
                /* DRUM */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
            ],
        },
        // pattern 3 — 33 steps
        {
            len: 33,
            ch: [
                /* LEAD */ [
                    n, n, 76, n,
                    n, n, n, n,
                    n, n, n, n,
                    72, n, n, n,
                    n, n, n, n,
                    69, n, n, n,
                    n, 65, 64, n,
                    n, n, n, n,
                    n,
                ],
                /* BASS */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
                /* DRUM */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
            ],
        },
        // pattern 4 — 33 steps
        {
            len: 33,
            ch: [
                /* LEAD */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
                /* BASS */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
                /* DRUM */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n,
                ],
            ],
        },
        ],
    },
    "BATTLE": {
        name: 'BATTLE', bpm: 120, tensionStep: 16,
        instruments: ['LEAD', 'BASS'],
        chains: [[0, 1], [0], [0]],
        patterns: [
        // pattern 0 — 16 steps
        {
            len: 16,
            ch: [
                /* LEAD */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
                /* BASS */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
                /* DRUM */ [
                    'KICK', n, n, n,
                    n, n, 'CLACK', n,
                    'HAT', 'HAT_OPEN', 'HAT', n,
                    n, n, n, n,
                ],
            ],
        },
        // pattern 1 — 16 steps
        {
            len: 16,
            ch: [
                /* LEAD */ [
                    n, n, 76, n,
                    72, n, 69, n,
                    65, n, 64, n,
                    n, n, n, n,
                ],
                /* BASS */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
                /* DRUM */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
            ],
        },
        ],
    },
    "THEME2": {
        name: 'THEME2', bpm: 120, loopStep: 256,
        instruments: ['LEAD', 'BASS'],
        chains: [[0, 0, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 3, 3], [0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], [0]],
        patterns: [
        // pattern 0 — 32 steps
        {
            len: 32,
            ch: [
                /* LEAD */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
                /* BASS */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
                /* DRUM */ [
                    'CLACK', n, n, n,
                    'HAT_OPEN', 'HAT', 'HAT_OPEN', n,
                    'KICK', n, n, n,
                    'CLACK', n, n, n,
                    n, n, n, n,
                    'CLACK', n, n, n,
                    n, n, n, n,
                    'HAT_OPEN', 'HAT', 'HAT_OPEN', n,
                ],
            ],
        },
        // pattern 1 — 32 steps
        {
            len: 32,
            ch: [
                /* LEAD */ [
                    60, n, n, n,
                    72, n, n, n,
                    64, n, n, n,
                    67, n, n, n,
                    n, n, n, n,
                    62, n, n, n,
                    n, n, n, n,
                    64, n, n, n,
                ],
                /* BASS */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
                /* DRUM */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
            ],
        },
        // pattern 2 — 32 steps
        {
            len: 32, gain: 0.3,
            ch: [
                /* LEAD */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
                /* BASS */ [
                    n, n, n, n,
                    76, n, n, n,
                    n, n, n, n,
                    72, n, n, n,
                    n, n, n, n,
                    71, n, n, n,
                    n, n, n, n,
                    79, n, n, n,
                ],
                /* DRUM */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
            ],
        },
        // pattern 3 — 32 steps
        {
            len: 32,
            ch: [
                /* LEAD */ [
                    64, n, n, n,
                    76, n, n, n,
                    67, n, n, n,
                    71, n, n, n,
                    n, n, n, n,
                    65, n, n, n,
                    n, n, n, n,
                    67, n, n, n,
                ],
                /* BASS */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
                /* DRUM */ [
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
            ],
        },
        ],
    },
};

export const THEME = SONGS['THEME'];
