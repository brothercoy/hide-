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
                    72, h, 74, h,          // o'er the
                    76, h, 77, h,          // land of
                    77, h,                 // the
                    79, h, h, h, h,        // FREE —
                    h, h, h, h, h,         //   (held)
                    77, h, 76, h,          // and the
                    74, h, 76, h,          // home of
                    74, h,                 // the
                    72, h, h, h, h,        // BRAVE —
                    h, h, h, h, h,         //   (held)
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
