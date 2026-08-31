// songs.js — tracker songs composed in the Sound Lab (button-test.html, TRACKER tab).
//
// Regenerated from a lab export; edit songs in the tracker, not here. See
// MusicPlayer.js for the format. 'n' is an empty cell and 'h' is a HOLD, kept
// short so patterns stay readable.

const n = null;
const h = '~';

export const SONGS = {
    "THEME": {
        name: 'THEME', bpm: 120,
        instruments: ['LEAD', 'BASS'],
        chains: [[3, 3, 2], [0, 0, 0, 0, 1, 1], [0]],
        patterns: [
        // pattern 0 — 36 steps
        {
            len: 36,
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
                    n, n, n, n,
                ],
                /* BASS */ [
                    36, h, n, h,
                    n, n, n, n,
                    n, n, n, n,
                    n, 48, h, n,
                    h, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                ],
                /* DRUM */ [
                    'KICK', n, n, n,
                    n, n, n, 'CLACK',
                    n, 'HAT', 'HAT_OPEN', 'HAT',
                    n, n, n, n,
                    n, n, n, n,
                    n, n, n, n,
                    n, 'CLACK', n, 'HAT',
                    'HAT_OPEN', 'HAT', n, n,
                    'KICK', n, n, n,
                ],
            ],
        },
        // pattern 1 — 36 steps
        {
            len: 36,
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
                    n, n, n, n,
                ],
                /* BASS */ [
                    38, h, n, h,
                    n, n, n, n,
                    n, n, n, n,
                    n, 50, h, n,
                    h, n, n, n,
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
                    n, n, n, n,
                ],
            ],
        },
        // pattern 2 — 16 steps
        {
            len: 16,
            ch: [
                /* LEAD */ [
                    n, n, n, n,
                    n, n, 112, n,
                    108, n, 105, n,
                    101, n, 100, n,
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
        // pattern 3 — 16 steps
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
