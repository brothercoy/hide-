// The DAILY level — one puzzle a day, the SAME for everyone, one attempt, and a result you can
// paste anywhere.
//
// IDENTITY: the day is the player's local calendar day on the server's clock (lives.js
// localToday — the same boundary the lives refill uses, so both turn over together at local
// midnight). Everything about the level derives from that day string: which alphabet, the
// target, the field, and — unlike the campaign — the spawn positions and speeds too, so every
// player starts from the identical board.
//
// ONE ATTEMPT: the day's result is recorded whether it was won, lost to the clock, or walked out
// of. Until tomorrow, DAILY on the main menu opens the result page again (to share it) rather
// than the level. That is what makes times comparable — nobody can retry until they get a good one.
import { CHARSETS } from '../../charsets.js';
import { GAME_MODES } from '../../gameModes.js';
import { FLAGS } from './flags.js';
import { getPref, setPref } from '../prefs.js';
import { localToday } from './lives.js';

const EPOCH = '2026-09-19';          // DAILY #1
const RESULT_KEY = 'daily.result';   // { key, num, chapter, won, time, misses } — the latest attempt
const MAX_MARKS = 20;                // the share line shows at most this many misses

// The level's shape: the multiplayer lobby's MAXIMUM character count and its fastest speed, every
// day (read from the mode config so they can never drift apart), a mid-ladder confusion level (the
// target has look-alikes but isn't buried), and one clock for every alphabet.
const DAILY_LADDER = { level: 7, totalLevels: 12 };
const MP = GAME_MODES.redacted.settingsOptions;   // the lobby's ranges for DEL
const DAILY_SETTINGS = {
    charCount: MP.charCount.max,
    speedScale: Math.max(...MP.speedScale.options),
    roundTime: 30,
};

export function dailyKey() { return localToday(); }

// #1 on EPOCH, counting local days.
export function dailyNumber(key = dailyKey()) {
    const [y, m, d] = key.split('-').map(Number);
    const [ey, em, ed] = EPOCH.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ey, em - 1, ed)) / 86400000) + 1;
}

// The day's alphabet: the six chapters in turn, one per day.
export function dailyChapter(key = dailyKey()) {
    const n = dailyNumber(key);
    return FLAGS[((n - 1) % FLAGS.length + FLAGS.length) % FLAGS.length];
}

// A SoloGame level config for the day — the campaign's shape with the spawns seeded as well.
export function dailyConfig(key = dailyKey()) {
    const flag = dailyChapter(key);
    return {
        mode: 'redacted',
        daily: true,
        seed: `daily:${key}`,
        spawnSeed: `daily:${key}:spawn`,
        campaign: DAILY_LADDER,
        charset: CHARSETS[flag.id],
        settings: { ...DAILY_SETTINGS },
    };
}

export function getDailyResult() {
    const r = getPref(RESULT_KEY, null);
    return r && typeof r === 'object' && r.key ? r : null;
}
export function dailyDone(key = dailyKey()) { return getDailyResult()?.key === key; }

// Record the day's one attempt. `time` is seconds to the find (null when not found).
export function recordDaily({ key, won, time, misses }) {
    const r = {
        key, num: dailyNumber(key), chapter: dailyChapter(key).name,
        won: !!won, time: won ? Math.round(time * 100) / 100 : null, misses: misses | 0,
    };
    setPref(RESULT_KEY, r);
    return r;
}

// The pasteable result — a bordered card in the game's own button style, one glyph per press,
// then the link on its own line:
//   +----------------+
//   | hide DAILY #12 |
//   | JAPAN          |
//   | x x ✓  7.42s   |
//   +----------------+
//   https://…
// (The box lines up in any monospace view; a chat that sets messages in a proportional face will
// wobble the right edge a little — the marks and the time still read.)
export function shareText(r, origin = '') {
    const marks = 'x '.repeat(Math.min(r.misses, MAX_MARKS)) + (r.misses > MAX_MARKS ? '… ' : '');
    const lines = [
        `hide DAILY #${r.num}`,
        r.chapter,
        r.won ? `${marks}✓  ${r.time.toFixed(2)}s` : `${marks}✗  TIMES UP`,
    ];
    const w = Math.max(...lines.map(l => [...l].length));
    const rule = `+${'-'.repeat(w + 2)}+`;
    const pad = (l) => l + ' '.repeat(w - [...l].length);
    return [rule, ...lines.map(l => `| ${pad(l)} |`), rule, origin].filter(Boolean).join('\n');
}

// Dev only: forget today's attempt.
export function devResetDaily() { setPref(RESULT_KEY, null); }
