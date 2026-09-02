// Campaign chapters as ASCII flags. A flag = a constant BORDER + an INTERIOR that reflects lock state:
//   - locked   → a dim '?' placeholder
//   - unlocked → the country's fixed ASCII art (bright)
// Everything is plain text on the character grid, so the whole flag TYPES IN row-by-row with the
// screen transition. The border never changes between states, so unlocking is just swapping '?' → art.
//
// Every flag is FLAG_W × FLAG_H chars; the interior is (FLAG_W-2) × (FLAG_H-2). `art` (when set) must be
// exactly INNER_H rows of INNER_W chars.
//
// A flag may also carry `overlays`: [{ ch, x, y, s }] — FREEFORM glyphs drawn on top of the grid art
// for shapes the uniform grid can't express (a star twice the size of the others, a glyph between
// cells). x/y are fractional INTERIOR cell coords measured from the interior's top-left corner, the
// glyph is drawn CENTERED at that point, and `s` scales the flag font (default 1). Overlays render
// only on unlocked flags and pop in after the flag's rows have typed in.
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
    // GREECE — negative-space cross, all blue drawn as vertical-bar fence texture, whites as line
    // glyphs: '_' draws at a cell's BOTTOM edge, '¯' (macron) at its TOP — so the horizontal arm's
    // lips can sit exactly on its boundaries. AUDITION: c3 is a TEMPORARY variant for live
    // comparison; the winner keeps c2 and the spare reverts to a locked placeholder.
    { id: 'c2', name: 'GREECE', art: [       // A — 3-row canton (V2 layout): the arm's line moved
        '|||   ||| ||||||||||',               //     to its TOP layer (¯), stripes under the canton
        '¯¯¯   ¯¯¯ __________',
        '|||   ||| ||||||||||',
        '____________________',
        '||||||||||||||||||||',
    ] },
    { id: 'c3', name: 'GREECE', art: [       // B — full-height canton, cross dead-center: _ lip
        '|||   ||| ||||||||||',               //     above the arm, ¯ lip below, open in between;
        '___   ___ __________',               //     the arm rides the middle BLUE stripe
        '          ||||||||||',
        '¯¯¯   ¯¯¯ __________',
        '|||   ||| ||||||||||',
    ] },
    { id: 'c4', name: 'CHAPTER 4', art: null },
    { id: 'c5', name: 'CHAPTER 5', art: null },
    // CHINA — the LAST chapter. Proof of `overlays`: the big star is a '*' drawn at over twice the
    // grid size, the four small ones arc beside it at fractional positions — none of which the
    // uniform character grid could place. The field stays empty: nothing but the stars.
    { id: 'c6', name: 'CHINA', art: [
        '                    ',
        '                    ',
        '                    ',
        '                    ',
        '                    ',
    ], overlays: [
        { ch: '*', x: 3.0, y: 1.4, s: 2.2 },
        { ch: '*', x: 6.5, y: 0.45, s: 0.75 },
        { ch: '*', x: 7.8, y: 1.2, s: 0.75 },
        { ch: '*', x: 7.8, y: 2.1, s: 0.75 },
        { ch: '*', x: 6.5, y: 2.85, s: 0.75 },
    ] },
];
