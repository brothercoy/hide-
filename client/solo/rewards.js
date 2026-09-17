// What beating the campaign unlocks.
//
// Kept separate from progress.js so the settings screens don't need to know how progress is
// stored — they just ask "is this locked?". The win screen's "NEW THEME UNLOCKED" line and the
// dimmed option in Settings are two views of this one condition.
import { FLAGS } from './flags.js';
import { isLevelComplete, LEVELS } from './progress.js';

// Themes that have to be earned. Everything not listed is always available.
const REWARD_THEMES = new Set(['rainbow']);

// True once every DESIGNED chapter has its final level beaten — the same test the campaign-win
// screen fires on, so the two can never disagree.
export function campaignComplete() {
    return FLAGS.every(f => !f.art || isLevelComplete(f.id, LEVELS - 1));
}

export function themeLocked(id) {
    return REWARD_THEMES.has(id) && !campaignComplete();
}
