// Visual look-alike TIERS for ACK's (Frequency) spawn-difficulty ramp. Same idea as before — the field
// camouflages the target with its near-twins as the rounds climb — but now the similarity NARROWS with
// difficulty: broad families early, tighter subgroups mid, down to the closest PAIRS ("two options") at
// the hardest rounds.
//
//   CONFUSION_TIERS[0] = broadest groups   (loose resemblance)
//   CONFUSION_TIERS[1] = subgroups         (clearly similar)
//   CONFUSION_TIERS[2] = pairs             (near-identical — the final-round "two options")
//
// Groups may OVERLAP within/across tiers (that's how 'm' can live in both [n,m,h,r] and the pair [w,m]).
// A glyph's decoys at a tier = the UNION of that tier's groups containing it. `confusionDecoys` walks
// from the target tier back toward broad, so a glyph missing from a deep tier falls back to a broader
// group. Rotation-AMBIGUOUS pairs (CONFLICT_GROUPS in GameRoom) are filtered out of the decoys
// separately, so listing them here is harmless. Pure perception data — edit freely.
export const CONFUSION_TIERS = [
    // ---- Tier 0: broad families -------------------------------------------------------------------
    [
        ['O', '0', 'o', 'Q', 'D', 'C', 'G', 'c', 'e', 'a', '@'],                 // round / curved
        ['l', 'I', '1', '|', 'i', 'j', '!'],                                // thin verticals
        ['S', '5', 's', '$', 'B', '8', '3', 'Z', '2', 'z', '6', '9', 'g', 'q', 'b', 'p', 'd'], // s-curves / round digits
        ['n', 'm', 'h', 'r', 'w', 'v', 'u', 'M', 'N', 'W', 'U', 'V', 'y', 'Y'],           // humps / points
        ['E', 'F', 'P', 'R', 'H', '#'],                                     // stems + bars
        ['T', '7', 'A', '4'],                                               // pointed tops
        ['(', '[', '{', '<'],                                               // left brackets
        [')', ']', '}', '>'],                                               // right brackets
        ['-', '_', '~', '='],                                              // horizontals
        ['.', ',', "'", '`', ':', ';'],                                              // low marks
        ['/', '\\', '+', 't', 'x', 'X', '*', 'k'],                                    // crosses / x
        ['%', '&'],
        ['?', '2'],
    ],
    // ---- Tier 1: subgroups ------------------------------------------------------------------------
    [
        ['O', '0', 'o', 'Q', ','], ['C', 'G', 'c', 'e', '@'], ['D', 'O'], ['a', 'o'],
        ['l', 'I', '1', '|'], ['i', 'j', '!'],
        ['S', '5', 's', '$'], ['B', '8', '3'], ['Z', '2', 'z'], ['6', '9', 'g', 'p', 'b', 'q', 'd'],
        ['n', 'm', 'h', 'r'], ['w', 'v'], ['M', 'N', 'W'], ['u', 'U', 'V'], ['y', 'Y', 'v'],
        ['E', 'F'], ['P', 'R'], ['H', '#'],
        ['T', '7'], ['A', '4'],
        ['(', '['], ['{', '<'], [')', ']'], ['}', '>'],
        ['-', '_', '~'],
        ['.', ','], ["'", '`'],
        [':', ';'],
        ['/', '\\'],
        ['+', 't'], ['x', 'X', 'k'],
        ['%', '&'], ['?', '2'],
    ],
    // ---- Tier 2: pairs (the final-round "two options") --------------------------------------------
    [
        ['l', '['], ['^', '>'], ['-', '/'], ['.', ','], [':', ';'], ['/', '\\'],
        ['x', 'X'], ['o', 'c'], ['6', 'G'], ['c', 'e'], ['A', 'V'],
        ['l', '1'], ['I', 'l'], ['i', 'j'], ['|', '_'], ['!', '|'],
        ['S', '5'], ['B', '8'], ['g', '6'], ['g', 'q'], ['b', 'q'], ['p', 'd'],
        ['n', 'h'], ['w', 'm'], ['M', 'W'], ['N', 'H'], ['u', 'h'], ['U', 'V'],
        ['E', 'F'], ['P', 'R'], ['L', '7']
    ],
];

// Per-tier glyph -> its decoys (union of that tier's groups containing it).
function buildTierMaps(tiers) {
    return tiers.map(groups => {
        const m = {};
        for (const g of groups) for (const c of g) {
            const set = m[c] || (m[c] = new Set());
            for (const o of g) if (o !== c) set.add(o);
        }
        for (const c of Object.keys(m)) m[c] = [...m[c]];
        return m;
    });
}

// Ramp progress + confusion tier for a round. p: 0 on round 1 → 1 on the final round (scaled to the
// game's chosen round count). tier: 0 (broad) → deepest (pairs) as p climbs. A 1-round game has no ramp
// — its single round IS the final round, so it's treated as p=1 (the full two-option field), not p=0.
function rampTier(maps, round, totalRounds) {
    const p = totalRounds > 1 ? Math.min(1, (round - 1) / (totalRounds - 1)) : 1;
    return { p, tier: Math.min(maps.length - 1, Math.floor(p * maps.length)) };
}

// A confusion SET for any alphabet: pass tier data shaped like CONFUSION_TIERS and get back the
// pickTarget/decoys pair bound to it. The solo campaign builds one per country charset
// (charsets.js); the ASCII default below keeps the original exports working unchanged.
export function makeConfusion(tiers) {
    const maps = buildTierMaps(tiers);
    return {
        // A round's target. Early rounds draw from ALL glyphs (`allGlyphs`); as the ramp climbs,
        // the chance to instead draw a glyph grouped at the CURRENT tier rises to 100% by the
        // final round — so the last round always lands on a glyph with a pair twin (a real "two
        // options" field). `rng` (default Math.random) makes the pick deterministic — solo's
        // predetermined levels pass a seeded rng; multiplayer callers omit it.
        pickTarget(round, totalRounds, allGlyphs, rng = Math.random) {
            const { p, tier } = rampTier(maps, round, totalRounds);
            const pool = rng() < p ? Object.keys(maps[tier]) : [...allGlyphs];
            return pool[Math.floor(rng() * pool.length)];
        },
        // The target's decoys for a round: the CURRENT tier's group for the glyph (falling back
        // toward broad if it isn't grouped that deep), collapsed to a single twin at the pair tier
        // so the final round is the target among copies of one glyph. [] if no look-alikes.
        decoys(glyph, round, totalRounds, rng = Math.random) {
            const { tier } = rampTier(maps, round, totalRounds);
            const deepest = maps.length - 1;
            for (let t = tier; t >= 0; t--) {
                const set = maps[t][glyph];
                if (set) return t === deepest ? [set[Math.floor(rng() * set.length)]] : set;
            }
            return [];
        },
    };
}

const DEFAULT_CONFUSION = makeConfusion(CONFUSION_TIERS);

export function pickConfusionTarget(round, totalRounds, allGlyphs, rng = Math.random) {
    return DEFAULT_CONFUSION.pickTarget(round, totalRounds, allGlyphs, rng);
}

export function confusionDecoys(glyph, round, totalRounds, rng = Math.random) {
    return DEFAULT_CONFUSION.decoys(glyph, round, totalRounds, rng);
}

// ---- TEST HARNESS: walk the tier-2 pairs in order ----------------------------------------------
// The final-round "two options" pairs, exposed so a test build can step through them one at a time.
export const CONFUSION_PAIRS = CONFUSION_TIERS[CONFUSION_TIERS.length - 1];

// Flip to TRUE to review pairs: each Frequency FINAL round then walks the pairs in order instead of
// picking randomly, and IGNORES the rotation-conflict filter so every pair shows. Each pair is shown
// BOTH ways before advancing — first A hidden among B, then the reverse (B hidden among A) — since
// difficulty is often asymmetric. Play 1-round games back to back; the walk restarts whenever the
// server restarts (e.g. when you edit this file). >>> SET BACK TO false FOR NORMAL PLAY. <<<
export const TEST_PAIRS_IN_ORDER = false;

let _testStep = -1;
export function nextTestPair() {
    const total = CONFUSION_PAIRS.length;
    _testStep = (_testStep + 1) % (total * 2);        // two steps per pair: forward, then reverse
    const idx = Math.floor(_testStep / 2);
    const reversed = _testStep % 2 === 1;
    const [a, b] = CONFUSION_PAIRS[idx];
    return { idx, total, reversed, pair: reversed ? [b, a] : [a, b] };   // pair[0] = target, pair[1] = decoy
}
