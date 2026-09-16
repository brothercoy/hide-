// Per-chapter character sets for the solo campaign. Each country's rounds use ONLY glyphs unique
// to that chapter — nothing that appears in (or is pixel-identical to) another chapter's set.
//
// The Greek pool was built empirically: every Greek letter whose OUTLINE in PxPlus_IBM_VGA_8x16
// is byte-identical to an ASCII glyph was excluded (Α=A Β=B Ε=E Ζ=Z Η=H Ι=I Κ=K Μ=M Ν=N Ο=O Ρ=P
// Τ=T Υ=Y Χ=X, ο=o), leaving 34 truly-unique glyphs.
//
// A charset = { glyphs, conflicts, confusion }:
//   glyphs     — the chapter's full pool (a string; field noise draws from it)
//   conflicts  — rotation look-alikes: a group's members never share a round with each other
//   confusion  — makeConfusion(tiers): the chapter's ACK-style look-alike ladder
// Chapters without an entry (USA) fall back to the ASCII set built into gameSim/confusables.
import { makeConfusion } from './confusables.js';

// ---- GREECE (chapter c2) ------------------------------------------------------------------------
// (Γ is in the pool as noise but appears in NO pair/subgroup tiers — its font rendering doesn't
// genuinely resemble anything, so it must never be the camouflage.)
const GREEK_GLYPHS = 'ΓΔΘΛΞΠΣΦΨΩαβγδεζηθικλμνξπρσςτυφχψω';

// Perception tiers, same shape as confusables.js's ASCII CONFUSION_TIERS:
// tier 0 broad families → tier 1 subgroups → tier 2 near-identical pairs.
const GREEK_TIERS = [
    // ---- Tier 0: broad families ----
    [
        ['Θ', 'Φ', 'θ', 'φ', 'σ', 'ς', 'δ', 'β', 'ρ', 'α', 'ε'],   // rounds / bowls
        ['Δ', 'Λ', 'λ', 'χ'],                                       // angular strokes
        ['Γ', 'Π', 'π', 'τ', 'η', 'ι'],                             // stems & bars
        ['Ω', 'Ψ', 'ω', 'ψ', 'μ', 'υ', 'ν', 'γ'],                   // prongs / open bowls
        ['Ξ', 'Σ', 'ζ', 'ξ', 'κ'],                                  // zigzags / stacked strokes
    ],
    // ---- Tier 1: subgroups ----
    [
        ['Θ', 'Φ'], ['θ', 'φ'], ['θ', 'σ'], ['σ', 'ς', 'δ'], ['ε', 'ξ', 'ζ'], ['β', 'ρ'], ['α', 'δ'],
        ['Δ', 'Λ', 'λ'], ['κ', 'χ'],
        ['Π', 'π', 'η'], ['ι', 'τ'],
        ['Ω', 'ω'], ['Ψ', 'ψ'], ['ω', 'ψ'], ['μ', 'ν', 'υ', 'η'],
        ['Ξ', 'Σ'],
    ],
    // ---- Tier 2: pairs (the final-level "two options") — only the CLOSEST pairings survive here
    // (Ξ/Σ demoted to tier 1; ι/τ, θ/σ, η/μ promoted in). γ/λ turned out to look nothing alike
    // (γ renders as a ribbon twist) — that pairing lives on as the authored LEVEL 1 sea instead.
    [
        ['Θ', 'Φ'], ['θ', 'φ'], ['θ', 'σ'], ['σ', 'δ'], ['α', 'δ'],
        ['ζ', 'ς'], ['ε', 'ξ'], ['β', 'ρ'],
        ['ν', 'υ'], ['ω', 'ψ'], ['ι', 'τ'], ['η', 'μ'],
        ['Δ', 'Λ'], ['Π', 'π'],
    ],
];

// Rotation-ambiguous pairs: NONE for Greek — γ/λ and η/μ were considered, judged distinct enough
// upside down, and instead promoted to tier-2 decoy pairs (Greece's level 12 is γ among λ's).
const GREEK_CONFLICT_GROUPS = [];

function buildConflicts(groups) {
    const m = {};
    for (const g of groups) for (const c of g) m[c] = g.filter(x => x !== c);
    return m;
}

// ---- RUSSIA (chapter c3) ------------------------------------------------------------------------
// 43 glyphs; excluded as outline-identical to ASCII or the Greek pool: А=A В=B Е=E К=K М=M Н=H
// О=O Р=P С=C Т=T Х=X, Г=Γ П=Π Ф=Φ, а е о р с у х. (Л, У, З all survived — their VGA outlines
// genuinely differ from Λ, Y, 3.)
const CYRILLIC_GLYPHS = 'БДЖЗИЙЛУЦЧШЩЪЫЬЭЮЯбвгджзийклмнптфцчшщъыьэюя';

const CYRILLIC_TIERS = [
    // ---- Tier 0: broad families ----
    [
        ['Ш', 'Щ', 'ш', 'щ', 'Ц', 'ц'],                         // combs (multi-stem + tails)
        ['И', 'Й', 'и', 'й', 'п', 'н', 'Л', 'л', 'Д', 'д', 'м'],// stems / gates / legs
        ['Ъ', 'Ы', 'Ь', 'ъ', 'ы', 'ь', 'Б', 'б', 'в'],          // signs — bowls on stems
        ['З', 'з', 'Э', 'э'],                                   // з/э curves
        ['Ж', 'ж', 'к', 'У', 'Ч', 'ч'],                         // spiky / crossed
        ['Ю', 'ю', 'ф'],                                        // round with attachments
        ['Я', 'я'],                                             // mirrored R
        ['г', 'т'],                                             // small bars
    ],
    // ---- Tier 1: subgroups ----
    [
        ['Ш', 'Щ', 'ш', 'щ'], ['Ц', 'ц', 'щ'],
        ['И', 'Й', 'и', 'й'], ['п', 'н', 'м'], ['Л', 'л', 'Д', 'д'], ['м', 'л'],
        ['Ъ', 'Ы', 'Ь', 'ъ', 'ы', 'ь'], ['Б', 'в', 'Ь', 'б'],
        ['З', 'з', 'Э', 'э'],
        ['Ж', 'ж', 'к'], ['У', 'Ч', 'ч'],
        ['Ю', 'ю'], ['Я', 'я'], ['г', 'т'],
    ],
    // ---- Tier 2: pairs (the final-level "two options") ----
    [
        ['Ш', 'Щ'], ['ш', 'щ'], ['Ц', 'ц'],
        ['И', 'Й'], ['и', 'й'], ['п', 'н'], ['Л', 'л'], ['Д', 'д'],
        ['Ы', 'Ь'], ['ъ', 'ь'], ['Б', 'Ь'],
        ['З', 'Э'], ['з', 'э'],
        ['Ж', 'ж'], ['Ч', 'ч'], ['Ю', 'ю'], ['Я', 'я'],
    ],
];

// ---- ISRAEL (chapter c5) ------------------------------------------------------------------------
// All 27 Hebrew glyphs (22 letters + 5 final forms) are outline-unique against ASCII, Greek and
// Cyrillic — the whole alphabet ships. No cases; the confusables are Hebrew's classic mix-ups.
const HEBREW_GLYPHS = 'אבגדהוזחטיכךלמםנןסעפףצץקרשת';

const HEBREW_TIERS = [
    // ---- Tier 0: broad families ----
    [
        ['ו', 'ן', 'ז', 'י', 'ל'],            // bare stems (vav/final-nun/zayin/yod/lamed)
        ['ד', 'ר', 'ך'],                       // top-corner shapes
        ['ח', 'ה', 'ת', 'ק'],                  // gates (two legs under a roof)
        ['ב', 'כ', 'נ', 'ג'],                  // bent-bottom shapes
        ['ם', 'ס', 'ט', 'מ'],                  // boxes (closed / near-closed)
        ['ע', 'צ', 'ץ', 'א', 'ש'],             // branchy / diagonal
        ['פ', 'ף'],                            // pe curls
        ['ך', 'ן', 'ף', 'ץ', 'ק'],             // descenders (the final forms + qof)
    ],
    // ---- Tier 1: subgroups ----
    [
        ['ו', 'ז', 'ן'], ['י', 'ו'],
        ['ד', 'ר'], ['ד', 'ך'],
        ['ח', 'ה', 'ת'], ['ה', 'ק'],
        ['ב', 'כ', 'נ'], ['ג', 'נ'],
        ['ם', 'ס'], ['ט', 'מ'],
        ['ע', 'צ'], ['צ', 'ץ'],
        ['פ', 'ף'], ['ך', 'ן', 'ף', 'ץ'],
    ],
    // ---- Tier 2: pairs (the final-level "two options") — Hebrew's canonical look-alikes ----
    [
        ['ד', 'ר'], ['ך', 'ד'],
        ['ח', 'ה'], ['ה', 'ת'],
        ['ב', 'כ'], ['ג', 'נ'],
        ['ם', 'ס'], ['ט', 'מ'],
        ['ו', 'ן'], ['ז', 'ו'],
        ['ע', 'צ'], ['פ', 'ף'],
    ],
];

export const CHARSETS = {
    c2: {
        glyphs: GREEK_GLYPHS,
        conflicts: buildConflicts(GREEK_CONFLICT_GROUPS),
        confusion: makeConfusion(GREEK_TIERS),
    },
    c3: {
        glyphs: CYRILLIC_GLYPHS,
        conflicts: buildConflicts([]),   // none yet — playtesting decides
        confusion: makeConfusion(CYRILLIC_TIERS),
    },
    c5: {
        glyphs: HEBREW_GLYPHS,
        conflicts: buildConflicts([]),   // none yet — playtesting decides
        confusion: makeConfusion(HEBREW_TIERS),
    },
};
