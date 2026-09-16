// Authored campaign levels — overrides layered ON TOP of the seeded generation, keyed by the
// level's seed id (`chapterId:levelIdx`, 0-based level). A STRING value forces just the TARGET
// (twin/composition/confusion still come from the seed + ladder position); an OBJECT can also pin
//   twin      — the single camouflage glyph
//   confusion — the camouflage fraction (1 = the whole field is the twin), overriding the ladder
// so a "sea" level can live anywhere on the ladder. Either way the level stays the same shared
// puzzle for every player.
//
// The @ / $ / ! / ! run through USA is deliberate sequence-planting for a later idea.
export const LEVEL_TARGETS = {
    'c1:1': '@',    // USA level 2
    'c1:5': '$',    // USA level 6
    'c1:8': '!',    // USA level 9
    'c1:10': '!',   // USA level 11
    'c1:11': 'M',   // USA level 12 — M in a sea of W's
    'c2:0': 'γ',    // GREECE level 1 — normal noise level, γ (the ribbon twist) as the target
    'c2:1': 'Ψ',    // GREECE level 2 — seeded roll was μ, which is reserved as level 12's sea
    'c2:8': { target: 'ω', twin: 'ε' },   // GREECE level 9 — ω among ε's (a spinning ω reads as a 3/E)
    'c2:9': { target: 'ι', twin: 'τ' },   // GREECE level 10 — swapped: hunt the bare stem among τ's
    'c2:10': { target: 'σ', twin: 'δ' },  // GREECE level 11 — σ hiding among δ's
    // GREECE level 12 — η hiding in a pure sea of μ's. Ladder position already makes the final
    // level full camouflage, so only the twin needs pinning.
    'c2:11': { target: 'η', twin: 'μ' },
};
