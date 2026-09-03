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
    // GREECE level 1 — γ in a full sea of λ's: they look nothing alike in this font (γ reads as a
    // ribbon twist), so the pairing is the INTRO — it also teaches the sea-of-one-glyph concept.
    'c2:0': { target: 'γ', twin: 'λ', confusion: 1 },
};
