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
    // GREECE level 12 — the level-1 target returns: γ hiding in a sea of υ's. Ladder position
    // already makes the final level a pure sea, so only the twin needs pinning.
    'c2:11': { target: 'γ', twin: 'υ' },
};
