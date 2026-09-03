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
        ['Δ', 'Λ', 'λ', 'γ'], ['κ', 'χ'],
        ['Γ', 'τ'], ['Π', 'π', 'η'], ['ι', 'τ'],
        ['Ω', 'ω'], ['Ψ', 'ψ'], ['ω', 'ψ'], ['μ', 'ν', 'υ', 'η'],
        ['Ξ', 'Σ'],
    ],
    // ---- Tier 2: pairs (the final-level "two options") — only the CLOSEST pairings survive here
    // (Γ/τ and Ξ/Σ demoted to tier 1; ι/τ, θ/σ, γ/λ, η/μ promoted in).
    [
        ['Θ', 'Φ'], ['θ', 'φ'], ['θ', 'σ'], ['σ', 'δ'], ['α', 'δ'],
        ['ζ', 'ς'], ['ε', 'ξ'], ['β', 'ρ'],
        ['ν', 'υ'], ['ω', 'ψ'], ['ι', 'τ'], ['γ', 'λ'], ['η', 'μ'],
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

export const CHARSETS = {
    c2: {
        glyphs: GREEK_GLYPHS,
        conflicts: buildConflicts(GREEK_CONFLICT_GROUPS),
        confusion: makeConfusion(GREEK_TIERS),
    },
};
