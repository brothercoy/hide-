// What beating the campaign unlocks.
//
// Kept separate from progress.js so the settings screens don't need to know how progress is
// stored — they just ask "is this locked?". The win screen's "NEW THEME UNLOCKED" line and the
// dimmed option in Settings are two views of this one condition.
import { FLAGS } from './flags.js';
import { isLevelComplete, LEVELS } from './progress.js';

// Themes that have to be earned. Everything not listed is always available.
const REWARD_THEMES = new Set(['cosmic']);

// True once every DESIGNED chapter has its final level beaten — the same test the campaign-win
// screen fires on, so the two can never disagree.
export function campaignComplete() {
    return FLAGS.every(f => !f.art || isLevelComplete(f.id, LEVELS - 1));
}

export function themeLocked(id) {
    return REWARD_THEMES.has(id) && !campaignComplete();
}

// ── The main menu's @ $ © ! ! row ────────────────────────────────────────────
// Each is an easter egg locked behind the USA level whose TARGET it is (levels.js plants them on
// levels 2/4/6/8 — the two !'s are deliberate twins, one per level). Locked: pressing just gives a
// quiet error. Unlocked: it presses and glows like a button, and rests brighter. © has no level
// yet and stays locked until it gets one. Order here IS the row's draw order on the menu.
export const SECRET_CHARS = [
    { char: '@', chapter: 'c1', level: 1 },   // USA level 2
    { char: '$', chapter: 'c1', level: 3 },   // USA level 4
    { char: '©', chapter: null, level: null },
    { char: '!', chapter: 'c1', level: 5 },   // USA level 6
    { char: '!', chapter: 'c1', level: 7 },   // USA level 8
];

export function secretUnlocked(i) {
    const s = SECRET_CHARS[i];
    return !!s?.chapter && isLevelComplete(s.chapter, s.level);
}

// Is this level one that unlocks a secret? (The level's FIRST clear plays the unlock sound.)
export function isSecretLevel(chapterId, levelIdx) {
    return SECRET_CHARS.some(s => s.chapter === chapterId && s.level === levelIdx);
}
