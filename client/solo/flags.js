// Campaign chapters as ASCII flags. A flag = a constant BORDER + an INTERIOR that reflects lock state:
//   - locked   → a dim '?' placeholder
//   - unlocked → the country's fixed ASCII art (bright)
// Everything is plain text on the character grid, so the whole flag TYPES IN row-by-row with the
// screen transition. The border never changes between states, so unlocking is just swapping '?' → art.
//
// Every flag is FLAG_W × FLAG_H chars; the interior is (FLAG_W-2) × (FLAG_H-2). `art` (when set) must be
// exactly INNER_H rows of INNER_W chars.
export const FLAG_W = 22;
export const FLAG_H = 7;
const INNER_W = FLAG_W - 2;   // 20
const INNER_H = FLAG_H - 2;   // 5

const blankInterior = () => Array.from({ length: INNER_H }, () => ' '.repeat(INNER_W));

// Top/bottom border. At rest it's `+----+`; on hover the '-' fill converts to '+' inward from the
// corners (0..1), exactly like our buttons' border animation, so a hovered flag reads as a button.
function borderRow(hover = 0) {
    // ceil() so an odd width's middle char is its own final fill step (matches the button fix).
    const plus = Math.floor(Math.ceil(INNER_W / 2) * Math.max(0, Math.min(1, hover)));
    const mid = '-'.repeat(INNER_W).split('');
    for (let i = 0; i < plus; i++) { mid[i] = '+'; mid[INNER_W - 1 - i] = '+'; }
    return '+' + mid.join('') + '+';
}

function lockedInterior() {
    const rows = blankInterior();
    const midR = Math.floor(INNER_H / 2);
    const midC = Math.floor((INNER_W - 1) / 2);
    const r = rows[midR].split(''); r[midC] = '?'; rows[midR] = r.join('');
    return rows;
}

// Full FLAG_H display rows for a flag. `hover` (0..1) animates the top/bottom border like a button;
// `pressed` swaps the side | for the button's held brackets } {. Both default off (locked / typed-in).
export function flagRows(flag, unlocked, hover = 0, pressed = false) {
    const interior = unlocked ? (flag.art || blankInterior()) : lockedInterior();
    const b = borderRow(hover);
    const ls = pressed ? '}' : '|', rs = pressed ? '{' : '|';
    return [b, ...interior.map(r => ls + r + rs), b];
}

// 6 chapters. `art` is the interior (INNER_H rows × INNER_W chars) or null until designed.
export const FLAGS = [
    { id: 'c1', name: 'USA', art: [
        '* * * * *|==========',
        ' * * * * |==========',
        '----------==========',
        '====================',
        '====================',
    ] },
    // GREECE — canton (white cross on blue) + the 9 stripes reduced to our 5 rows.
    // AUDITION: c3–c5 are TEMPORARY variants of the same flag so they can be compared live on this
    // screen (type-in, hover, press all real). Once one wins, its art moves here and c3–c5 revert
    // to locked placeholders.
    { id: 'c2', name: 'GREECE', art: [       // V1 — US-style: solid '=' stripes, dashed canton bottom
        '    |    |==========',
        '====+====|==========',
        '    |    |==========',
        '----------==========',
        '====================',
    ] },
    { id: 'c3', name: 'GREECE', art: [       // V2 — alternating stripes, whites as '-'
        '    |    |==========',
        '====+====|----------',
        '    |    |==========',
        '--------------------',
        '====================',
    ] },
    { id: 'c4', name: 'GREECE', art: [       // V3 — alternating stripes, whites blank
        '    |    |==========',
        '====+====|          ',
        '    |    |==========',
        '                    ',
        '====================',
    ] },
    { id: 'c5', name: 'GREECE', art: [       // V4 — like V1 but the cross joint is '|' not '+'
        '    |    |==========',
        '====|====|==========',
        '    |    |==========',
        '----------==========',
        '====================',
    ] },
    { id: 'c6', name: 'CHAPTER 6', art: null },
];
