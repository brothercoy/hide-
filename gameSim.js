// Core game SIMULATION — pure, networking-free. Shared by BOTH sides: the server (server/GameRoom.js)
// runs it authoritatively for multiplayer; the client runs the SAME code locally for the offline solo
// campaign (so an exported mobile app can play with no internet, and the two can never drift).
//
// Everything here operates on plain values passed in (game mode config, settings, round, char list) —
// no `this`, no Colyseus, no timers, no broadcasts. Callers own the state and the tick loop.
import { confusionDecoys, pickConfusionTarget, TEST_PAIRS_IN_ORDER, nextTestPair } from './confusables.js';

// The full visible printable-ASCII set (33 '!' … 126 '~') — every glyph a target/field char can be.
// Shared by ALL game modes (generateField draws from here).
export const LETTERS = Array.from({ length: 126 - 33 + 1 }, (_, i) => String.fromCharCode(33 + i)).join('');

// Glyphs that look like each other when a character rotates/flips. Enforced TARGET-FIRST and
// PER-ROUND: the target can be any glyph, but if it belongs to a group, that group's OTHER members
// are kept out of THAT round's field (so a look-alike can't be mistaken for the target). List a
// 3+-way look-alike as one group. (Empty = no rule.)
const CONFLICT_GROUPS = [
    ["'", ','],   // apostrophe / comma
    ['n', 'u'],
    ['[', ']'],
    ['<', '>'],
    ['(', ')'],
    ['{', '}'],
    ['-', '_'],
];
// glyph -> glyphs it must not share a round with (derived once from the groups above)
export const CONFLICTS = {};
for (const group of CONFLICT_GROUPS) for (const c of group) CONFLICTS[c] = group.filter(x => x !== c);

// ACK (Frequency) difficulty ramp. Round 1 uses the player's SETTING as-is; the ramp climbs linearly
// to a harder END reached at the MAX round count (the rounds slider max, 20). For charCount/speed the
// END adds the FULL slider RANGE to the setting — so the easy-end DEFAULT (setting = slider min)
// reaches the slider MAX at round 20, and a higher starting setting scales PAST the max, clamped to a
// reasonable ceiling. roundTime shrinks toward a fraction of the setting, floored.
const ACK_RAMP = {
    charCount:  { kind: 'plusRange', cap: 200 },              // → slider max (150) at 20 rounds; up to 200
    speedScale: { kind: 'plusRange', cap: 0.6 },              // → slider max (0.4/Fast) at 20 rounds; up to 0.6
    roundTime:  { kind: 'shrink', mult: 1 / 3, floor: 5 },    // 30s → 10s at 20 rounds; floor 5s
};
// Spawn confusion: fraction of the field filled with the target's look-alikes (vs random noise). Ramps
// 0 (round 1) → this at the final round. 1.0 means the final round is PURE camouflage.
const CONFUSION_MAX = 1.0;

// Server-side tap validation (anti-cheat): the server — not the client — decides whether a tap
// actually hit the target. Because the client renders the field slightly in the past (the
// interpolation delay + its ping), we keep a short history of the TARGET's position and accept a tap
// if it lands within the target's radius anywhere in that window. (Solo runs the same check locally.)
export const TARGET_HISTORY = 8;    // ticks kept (~400ms at 50ms) — covers the render delay + ping
const TAP_TOLERANCE = 0.1;          // normalized padding added to the glyph's own radius (forgiving)

// The effective value of a ramped setting for `round` (1-based) in Frequency. The ramp climbs linearly
// from the SETTING (round 1) to the slider max, reached at the MAX round count (20). So FEWER rounds end
// the climb early — a genuinely easier game. A given round is the same difficulty regardless of the
// chosen round count. charCount/roundTime rounded.
export function ackRoundValue(gameMode, settings, param, round) {
    const start = settings[param];
    const cfg = ACK_RAMP[param];
    const ref = gameMode.settingsOptions.rounds.max;   // full ramp spans the MAX round count (20)
    const p = ref > 1 ? (round - 1) / (ref - 1) : 0;
    let v;
    if (cfg.kind === 'plusRange') {
        const opt = gameMode.settingsOptions[param];
        const range = opt.options ? (opt.options[opt.options.length - 1] - opt.options[0]) : (opt.max - opt.min);
        v = Math.min(cfg.cap, start + range * p);      // hits the slider max at round `ref`, then climbs to the cap
    } else {   // 'shrink' — toward a fraction of the setting, floored
        v = Math.max(cfg.floor, start + (start * cfg.mult - start) * p);
    }
    return param === 'speedScale' ? v : Math.round(v);
}
// Per-round effective values — ramped in Frequency, the flat setting in every other mode.
export function effCharCount(gameMode, settings, round) {
    return gameMode.id === 'frequency' ? ackRoundValue(gameMode, settings, 'charCount', round) : settings.charCount;
}
export function effSpeed(gameMode, settings, round) {
    return gameMode.id === 'frequency' ? ackRoundValue(gameMode, settings, 'speedScale', round) : settings.speedScale;
}
export function effRoundTime(gameMode, settings, round) {
    return gameMode.id === 'frequency' ? ackRoundValue(gameMode, settings, 'roundTime', round) : settings.roundTime;
}
// Fraction of the field to fill with the target's look-alikes this round (0 outside Frequency and on
// round 1, ramping to CONFUSION_MAX at the FINAL round). UNLIKE the other axes, confusion scales to the
// CHOSEN round count — so every game, long or short, ends on a pure two-option field.
export function effConfusion(gameMode, settings, round) {
    if (gameMode.id !== 'frequency') return 0;
    const ref = settings.rounds;
    // A 1-round game IS its own final round — treat it as p=1 (full confusion), not p=0.
    const p = ref > 1 ? Math.min(1, (round - 1) / (ref - 1)) : 1;
    return p * CONFUSION_MAX;
}

// One field character. Per-char collision radius (normalized) is stored on it so the bounce reads it
// directly. Falls back to a small default until a client's radii table arrives. Spawns anywhere the
// whole glyph fits inside the field (so it never starts overlapping the frame).
export function createChar(char, isTarget, charRadii, speed) {
    const rr = charRadii[char] || { rx: 0.03, ry: 0.05 };
    return {
        char,
        isTarget,
        rx: rr.rx,
        ry: rr.ry,
        x: (Math.random() * 2 - 1) * (1 - rr.rx),
        y: (Math.random() * 2 - 1) * (1 - rr.ry),
        speedX: (Math.random() - 0.5) * speed,
        speedY: (Math.random() - 0.5) * speed,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: Math.random() < 0.05 ? 0 : (Math.random() - 0.5) * 2
    };
}

// Build a round's field. Pure — returns { chars, targetChar, targetObj }. The caller assigns those to
// its state and clears its own target-position history for the new round.
export function generateField({ gameMode, settings, currentRound, charRadii }) {
    const chars = [];
    // TEST: on a Frequency FINAL round with TEST_PAIRS_IN_ORDER on, walk the tier-2 pairs in order
    // (target = pair[0], field = copies of pair[1]) so every pair can be reviewed once. See confusables.js.
    const testWalk = (TEST_PAIRS_IN_ORDER && gameMode.id === 'frequency'
        && currentRound >= settings.rounds) ? nextTestPair() : null;
    // Frequency's target: early rounds from ALL glyphs, but a rising chance (→100% by the final round) to
    // instead draw a glyph grouped at the current confusion tier. Other modes use the full set uniformly.
    const targetChar = testWalk
        ? testWalk.pair[0]
        : (gameMode.id === 'frequency'
            ? pickConfusionTarget(currentRound, settings.rounds, LETTERS)
            : LETTERS[Math.floor(Math.random() * LETTERS.length)]);
    const charCount = effCharCount(gameMode, settings, currentRound);

    // This round's field pool: every glyph EXCEPT the target and its rotation look-alikes.
    const forbidden = new Set(CONFLICTS[targetChar] || []);
    forbidden.add(targetChar);
    const pool = [...LETTERS].filter(c => !forbidden.has(c));
    // The target's visual near-twins for THIS round: the confusion tier narrows with difficulty, minus
    // the rotation-conflicts already barred above. `confusion` of the field is filled with them.
    const totalRounds = gameMode.id === 'frequency' ? settings.rounds : 0;
    const twins = testWalk
        ? [testWalk.pair[1]]
        : confusionDecoys(targetChar, currentRound, totalRounds).filter(c => !forbidden.has(c));
    const confusion = testWalk ? 1 : (twins.length ? effConfusion(gameMode, settings, currentRound) : 0);
    if (testWalk) {
        const barred = (CONFLICTS[testWalk.pair[0]] || []).includes(testWalk.pair[1]);
        console.log(`[ACK TEST] pair ${testWalk.idx + 1}/${testWalk.total}${testWalk.reversed ? ' (reverse)' : ' (forward)'}: '${testWalk.pair[0]}' hidden among '${testWalk.pair[1]}'${barred ? '  (conflict-filtered in real play)' : ''}`);
    }

    const speed = effSpeed(gameMode, settings, currentRound);   // same magnitude for the whole field
    for (let i = 0; i < charCount - 1; i++) {
        const char = (confusion && Math.random() < confusion)
            ? twins[Math.floor(Math.random() * twins.length)]         // a near-twin (camouflage)
            : pool[Math.floor(Math.random() * pool.length)];          // random noise
        chars.push(createChar(char, false, charRadii, speed));
    }

    const targetIndex = Math.floor(Math.random() * charCount);
    const targetObj = createChar(targetChar, true, charRadii, speed);
    chars.splice(targetIndex, 0, targetObj);

    return { chars, targetChar, targetObj };
}

// Advance the field one tick: move + rotate each char, bouncing its EDGE off the field walls (±1 maps
// to the frame's inner edge) using its own stored radius so each glyph hits the brackets exactly.
export function updateChars(chars, delta) {
    chars.forEach(c => {
        c.x += c.speedX * delta;
        c.y += c.speedY * delta;
        c.rotation += c.rotationSpeed * delta;

        const rx = c.rx, ry = c.ry;
        if (c.x < -1 + rx) { c.speedX = Math.abs(c.speedX);  c.x = -1 + rx; }
        if (c.x >  1 - rx) { c.speedX = -Math.abs(c.speedX); c.x =  1 - rx; }
        if (c.y < -1 + ry) { c.speedY = Math.abs(c.speedY);  c.y = -1 + ry; }
        if (c.y >  1 - ry) { c.speedY = -Math.abs(c.speedY); c.y =  1 - ry; }
    });
}

// True if a tap (normalized coords) lands on the target now OR anywhere in its recent history window —
// so a delayed render still registers. Authoritative for multiplayer; solo runs the same check.
export function tapHitsTarget(targetObj, targetHistory, data) {
    const tgt = targetObj;
    if (!tgt || !data || typeof data.nx !== 'number' || typeof data.ny !== 'number') return false;
    const rad = Math.max(tgt.rx, tgt.ry) + TAP_TOLERANCE;
    const r2 = rad * rad;
    let dx = data.nx - tgt.x, dy = data.ny - tgt.y;   // newest (live) position
    if (dx * dx + dy * dy <= r2) return true;
    for (const h of targetHistory) {                  // ...and the recorded past window
        if (h.t < 0) continue;
        dx = data.nx - h.x; dy = data.ny - h.y;
        if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
}

// Round-start payload: only char + isTarget are static per round; positions move every tick.
export function charInit(chars) {
    return chars.map(c => ({ char: c.char, isTarget: c.isTarget, x: c.x, y: c.y, rotation: c.rotation }));
}
// Flat [x, y, rotation, ...] — much smaller than the full objects, and ONE array to (de)serialize.
export function charPositions(chars) {
    const n = chars.length;
    const p = new Array(n * 3);
    for (let i = 0; i < n; i++) {
        const c = chars[i];
        p[i * 3] = c.x; p[i * 3 + 1] = c.y; p[i * 3 + 2] = c.rotation;
    }
    return p;
}
