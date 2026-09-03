// Authored campaign-level targets — overrides layered ON TOP of the seeded generation. The key is
// the level's seed id (`chapterId:levelIdx`, 0-based level); the value forces that level's TARGET.
// Everything else (twin choice, field composition, confusion fraction) still comes from the level's
// seed + ladder position, so the level stays the same shared puzzle for every player — the twin is
// the target's closest look-alike from the confusables tiers (M's pair is W, ! pairs with |).
//
// The @ / $ / ! / ! run through USA is deliberate sequence-planting for a later idea.
export const LEVEL_TARGETS = {
    'c1:1': '@',    // USA level 2
    'c1:5': '$',    // USA level 6
    'c1:8': '!',    // USA level 9
    'c1:10': '!',   // USA level 11
    'c1:11': 'M',   // USA level 12 — M in a sea of W's
};
