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
    // USA canton: SOLID '#' block via packed overlays (audition), like Russia's blue band —
    // 0.48 spacing so the 0.56-tall # ink fuses, flush from the interior top down to the canton's
    // dash line. The starfield version, to revert to (no overlays):
    //   '* * * * *|==========',
    //   ' * * * * |==========',
    { id: 'c1', name: 'USA', art: [
        '         ===========',
        '         ===========',
        '====================',
        '====================',
        '====================',
    ], overlays: [
        { ch: '#########', x: 4.5, y: 0.0 },
        { ch: '#########', x: 4.5, y: 0.48 },
        { ch: '#########', x: 4.5, y: 0.96 },
        { ch: '#########', x: 4.5, y: 1.44 },
        { ch: '#########', x: 4.5, y: 1.92 },
    ] },
    // GREECE — negative-space cross, all blue drawn as vertical-bar fence texture, whites as line
    // glyphs: '_' draws at a cell's BOTTOM edge, '¯' (macron) at its TOP — so the horizontal arm's
    // lips can sit exactly on its boundaries. AUDITION: c3 is a TEMPORARY variant for live
    // comparison; the winner keeps c2 and the spare reverts to a locked placeholder.
    // Stripes are OVERLAY '=' lines at the row BOUNDARIES (integer y, from the top seam y=0 to the
    // bottom seam y=5) — the empty space a solid block of grid '=' rows leaves between its rows —
    // so each stripe's double line straddles the seam instead of sitting at a cell's center.
    // The whole flag is overlay '=' lines. Stripes sit on the row seams (integer y, top edge y=0 to
    // bottom edge y=5); the CANTON is a DENSE field of lines at HALF-cell spacing (y=0, .5, 1.5, 2)
    // whose half-height lines align with the white gaps of the stripes beside it. The cross is pure
    // NEGATIVE SPACE in that field: the horizontal arm is the missing y=1 line (the second blue
    // stripe's height), the vertical arm the missing middle column of every canton line.
    { id: 'c2', name: 'GREECE', art: [
        '                    ',
        '                    ',
        '                    ',
        '                    ',
        '                    ',
    ], overlays: [
        // '#' = blue ('=' stays red, as on the USA stripes; blank = white)
        { ch: '#### ###############', x: 10, y: 0 },   // stripe 1: full width, vertical-arm gap
        { ch: '#### ####', x: 4.5, y: 0.5 },           // canton density lines at the white-gap
        { ch: '###########', x: 14.5, y: 1 },          //   heights of the stripes beside them;
        { ch: '#### ####', x: 4.5, y: 1.5 },           //   stripe 2 hugs the canton edge (col 9)
        { ch: '#### ###############', x: 10, y: 2 },   // stripe 3: full width, arm's bottom opened
        { ch: '####################', x: 10, y: 3 },
        { ch: '####################', x: 10, y: 4 },
        { ch: '####################', x: 10, y: 5 },
    ] },
    // RUSSIA — the tricolor via texture-as-color: blank = white, '#' = blue, '=' = red (matching
    // USA's red stripes). Overlay lines at sub-cell spacing pack each band SOLID — # ink is 0.56
    // cells tall so 0.55 spacing closes the blue; = ink is 0.25 so red needs ~0.24 spacing. Bands
    // are exact thirds of the interior (0–1.67 / 1.67–3.33 / 3.33–5).
    { id: 'c3', name: 'RUSSIA', art: [
        '                    ',
        '                    ',
        '                    ',
        '                    ',
        '                    ',
    ], overlays: [
        { ch: '####################', x: 10, y: 1.9 },
        { ch: '####################', x: 10, y: 2.5 },
        { ch: '####################', x: 10, y: 3.1 },
        { ch: '====================', x: 10, y: 3.75 },
        { ch: '====================', x: 10, y: 4.05 },
        { ch: '====================', x: 10, y: 4.35 },
        { ch: '====================', x: 10, y: 4.65 },
        { ch: '====================', x: 10, y: 4.95 },
        { ch: '====================', x: 10, y: 5.25 },
    ] },
    // JAPAN — the sun disc: packed '#' rows (0.48 spacing, like the USA canton block) whose widths
    // trace a circle. Cells are 2:1 tall, so 7 columns × ~3.4 rows of ink reads as ROUND. Centered.
    { id: 'c4', name: 'JAPAN', art: [
        '                    ',
        '                    ',
        '                    ',
        '                    ',
        '                    ',
    ], overlays: [
        { ch: '####', x: 10, y: 1.06 },
        { ch: '######', x: 10, y: 1.54 },
        { ch: '#######', x: 10, y: 2.02 },
        { ch: '#######', x: 10, y: 2.5 },
        { ch: '#######', x: 10, y: 2.98 },
        { ch: '######', x: 10, y: 3.46 },
        { ch: '####', x: 10, y: 3.94 },
    ] },
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
        // Big star centered on the small-star arc's middle pair (their y midpoint = its y), the
        // whole formation raised toward the top-left, arc pulled in tight around the big star.
        { ch: '*', x: 3.4, y: 1.15, s: 2.6 },
        { ch: '*', x: 6.0, y: 0.10, s: 0.95 },
        { ch: '*', x: 7.5, y: 0.70, s: 0.95 },
        { ch: '*', x: 7.5, y: 1.60, s: 0.95 },
        { ch: '*', x: 6.0, y: 2.20, s: 0.95 },
    ] },
];
