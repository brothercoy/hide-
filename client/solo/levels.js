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
    'c2:1': 'β',    // GREECE level 2 — an unused glyph (seeded roll was μ, reserved as 12's sea)
    'c2:6': 'Ψ',    // GREECE level 7 — the trident (was η, which duplicated level 12's target)
    'c2:8': { target: 'ι', twin: 'τ' },   // GREECE level 9 — hunt the bare stem among τ's
    'c2:9': { target: 'σ', twin: 'δ' },   // GREECE level 10 — σ hiding among δ's
    'c2:10': { target: 'ω', twin: 'ε' },  // GREECE level 11 — ω among ε's (a spinning ω reads as a 3/E)
    // GREECE level 12 — η hiding in a pure sea of μ's. Ladder position already makes the final
    // level full camouflage, so only the twin needs pinning.
    'c2:11': { target: 'η', twin: 'μ' },
    // RUSSIA: З moved from level 5 up to 9; the levels between shift back one to fill the gap.
    'c3:4': 'З',    // level 5 — З in the loose Э/э mix
    'c3:5': 'И',    // level 6
    'c3:6': 'з',    // level 7
    'c3:7': { target: 'и', twin: 'й' },   // level 8 — find the plain и among breve-topped й's
    'c3:8': 'т',    // level 9 — т at pair depth: hiding among г's
    // ISRAEL: the seed dealt duplicate targets (3/12 ט, 5/7 צ, 8/11 כ); the LOWER level of each
    // pair gets an unused target from the same visual family, keeping its field feel.
    'c5:2': 'ס',    // level 3 — samekh keeps the boxes-family field (was ט, 12's finale target)
    'c5:4': 'ד',    // level 5 — dalet among resh/final-kaf corners (was צ, duplicating 7)
    'c5:7': 'נ',    // level 8 — nun keeps the bent-bottom field (was כ, duplicating 11)
};
