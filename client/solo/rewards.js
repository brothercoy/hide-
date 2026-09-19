// What beating the campaign unlocks.
//
// Kept separate from progress.js so the settings screens don't need to know how progress is
// stored — they just ask "is this locked?". The win screen's "NEW THEME UNLOCKED" line and the
// dimmed option in Settings are two views of this one condition.
import { FLAGS } from './flags.js';
import { isLevelComplete, LEVELS } from './progress.js';
import { getPref, setPref } from '../prefs.js';

// True once every DESIGNED chapter has its final level beaten — the same test the campaign-win
// screen fires on, so the two can never disagree.
export function campaignComplete() {
    return FLAGS.every(f => !f.art || isLevelComplete(f.id, LEVELS - 1));
}

// Themes that have to be earned, each by beating a chapter (its final level). Everything not
// listed is always available. The settings screens list themes in this unlock order.
const chapterBeaten = (id) => isLevelComplete(id, LEVELS - 1);
const REWARD_THEMES = {
    white:  { chapter: 'c2', earned: () => chapterBeaten('c2') },   // GREECE
    orange: { chapter: 'c4', earned: () => chapterBeaten('c4') },   // JAPAN
    cosmic: { chapter: null, earned: campaignComplete },           // the whole campaign (the win screen announces it)
};

export function themeLocked(id) {
    const r = REWARD_THEMES[id];
    return !!r && !r.earned();
}

// The theme a chapter's clear hands out, or null — so the clear ceremony can say so.
export function themeForChapter(chapterId) {
    return Object.keys(REWARD_THEMES).find(id => REWARD_THEMES[id].chapter === chapterId) || null;
}

// ── The main menu's @ $ © ! ! row — the INFINITE LIVES secret ────────────────
// Each is an easter egg locked behind USA. Four are the TARGET of a level (levels.js plants them
// on 2/4/6/8 — the two !'s are deliberate twins, one per level) and unlock on that level's first
// clear. © is different: it's PLANTED in level 5's noise, and pressing it there (instead of the
// target) is the find — recorded here, since it isn't a level win. Locked: pressing just gives a
// quiet error. Unlocked: it presses like a button. Hold all five down at once on the menu and the
// campaign's lives become infinite. Order here IS the row's draw order.
export const SECRET_CHARS = [
    { char: '@', chapter: 'c1', level: 1 },   // USA level 2
    { char: '$', chapter: 'c1', level: 3 },   // USA level 4
    { char: '©', found: true },               // USA level 5 — pressed in the field, not won
    { char: '!', chapter: 'c1', level: 5 },   // USA level 6
    { char: '!', chapter: 'c1', level: 7 },   // USA level 8
];
export const SECRET_SFX_GAIN = 0.3;   // the quiet CHAPTER_CLEAR that marks a secret — a hint, not a ceremony
const FOUND_KEY = 'campaign.secrets';  // { '©': true } — secrets found by pressing, not by winning

export function secretUnlocked(i) {
    const s = SECRET_CHARS[i];
    if (!s) return false;
    if (s.found) return !!(getPref(FOUND_KEY, {}) || {})[s.char];
    return !!s.chapter && isLevelComplete(s.chapter, s.level);
}
export function allSecretsUnlocked() { return SECRET_CHARS.every((_, i) => secretUnlocked(i)); }

// Record a press-found secret (©). Returns true the FIRST time only, so the caller can react once.
export function markSecretFound(char) {
    const f = getPref(FOUND_KEY, {}) || {};
    if (f[char]) return false;
    setPref(FOUND_KEY, { ...f, [char]: true });
    return true;
}

// Is this level one that unlocks a secret? (The level's FIRST clear plays the unlock sound.)
export function isSecretLevel(chapterId, levelIdx) {
    return SECRET_CHARS.some(s => s.chapter === chapterId && s.level === levelIdx);
}

// Dev only: forget every press-found secret (the level-won ones live in progress).
export function devResetSecrets() { setPref(FOUND_KEY, {}); }
