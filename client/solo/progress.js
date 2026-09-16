// Solo campaign progress — which levels are done, and what that unlocks.
//
// Stored in prefs (localStorage) deliberately: solo is fully offline, so there is no server identity
// to tie progress to, and editing it in devtools only skips your own single-player levels — no
// multiplayer advantage (see the rule in prefs.js; this is the sanctioned exception).
//
// Completion RECORDING is always on (wins are saved from day one), but lock ENFORCEMENT sits behind
// the GATED flag so everything stays open while chapters and levels are still being created.
// Flip GATED to true and, with no other changes:
//   - a level unlocks when the previous level of its chapter is complete (level 1 is always open)
//   - a chapter unlocks when the previous chapter's LAST level is complete (chapter 1 always open)
// With GATED false: every designed chapter (one whose flag has art) is open, and all its levels are.
import { getPref, setPref } from '../prefs.js';

export const GATED = true;          // progression enforced (flip off to open everything for dev)
export const LEVELS = 12;           // levels per chapter

const KEY = 'campaign.progress';    // { [chapterId]: [true,…] } — per-level completion, by flag id

function load() {
    const p = getPref(KEY, {});
    return p && typeof p === 'object' ? p : {};
}

export function isLevelComplete(chapterId, levelIdx) {
    const arr = load()[chapterId];
    return Array.isArray(arr) ? !!arr[levelIdx] : false;
}

export function completeLevel(chapterId, levelIdx) {
    const p = load();
    const arr = Array.isArray(p[chapterId]) ? p[chapterId] : [];
    if (arr[levelIdx]) return;
    arr[levelIdx] = true;
    p[chapterId] = arr;
    setPref(KEY, p);
}

export function completedCount(chapterId) {
    const arr = load()[chapterId];
    return Array.isArray(arr) ? arr.filter(Boolean).length : 0;
}

export function isLevelUnlocked(chapterId, levelIdx) {
    if (!GATED) return true;
    return levelIdx === 0 || isLevelComplete(chapterId, levelIdx - 1);
}

// flags = the FLAGS array from flags.js; idx = the chapter's index in it.
export function isChapterUnlocked(flags, idx) {
    if (!GATED) return !!flags[idx]?.art;   // while building: designed chapters are open
    if (idx === 0) return true;
    const prev = flags[idx - 1];
    return !!prev?.art && isLevelComplete(prev.id, LEVELS - 1);
}

// --- Dev tools (exposed on window.dev by game.js) ---------------------------------------------
// NOTE: local-only for now. Eventually progress moves server-side, tied to an identity, so it
// follows the player between devices (see the rule in prefs.js).
import { FLAGS } from './flags.js';

// Everything beaten: every chapter open, every level checkmarked.
export function devCompleteAll() {
    const p = {};
    for (const f of FLAGS) p[f.id] = Array(LEVELS).fill(true);
    setPref(KEY, p);
}

// Brand-new player: no wins, only USA level 1 reachable.
export function devReset() {
    setPref(KEY, {});
}
