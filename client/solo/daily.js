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
// of. Until tomorrow, DAILY on the main menu shows the result again (to share it) rather than the
// level. That is what makes times comparable — nobody can retry until they get a good one.
import { CHARSETS } from '../../charsets.js';
import { GAME_MODES } from '../../gameModes.js';
import { seededRng } from '../../gameSim.js';
import { FLAGS } from './flags.js';
import { getPref, setPref } from '../prefs.js';
import { localToday } from './lives.js';

const EPOCH = '2026-09-19';          // DAILY #1
const RESULT_KEY = 'daily.result';   // { key, num, chapter, won, time, misses } — the latest attempt
const MAX_MARKS = 20;                // the share line shows at most this many misses

// What is FIXED every day: the multiplayer lobby's MAXIMUM character count and its fastest speed
// (read from the mode config so they can never drift apart), and one clock. Everything else —
// the alphabet, and how deep on the confusion ladder (1 = loose noise … 12 = the target alone in
// a sea of its closest twin) — is drawn from the day's seed, so any country at any difficulty.
const LADDER_STEPS = 12;
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

// The day's draw: which alphabet, and how hard. Seeded by the day, so it is random but the same
// for everyone.
export function dailyPick(key = dailyKey()) {
    const pick = seededRng(`daily:${key}:pick`);
    const flag = FLAGS[Math.floor(pick() * FLAGS.length)];
    const level = 1 + Math.floor(pick() * LADDER_STEPS);
    return { flag, level };
}
export function dailyChapter(key = dailyKey()) { return dailyPick(key).flag; }

// A SoloGame level config for the day — the campaign's shape with the spawns seeded as well.
export function dailyConfig(key = dailyKey()) {
    const { flag, level } = dailyPick(key);
    return {
        mode: 'redacted',
        daily: true,
        seed: `daily:${key}`,
        spawnSeed: `daily:${key}:spawn`,
        campaign: { level, totalLevels: LADDER_STEPS },
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

// The result, as lines — shared by the in-game modal and the pasteable card so the two read the
// same: the title, the number, the alphabet, one glyph per press (x per miss, ✓ or ✗ for the
// last press, wrapped MARKS_PER_ROW to a row), then the time.
const MARKS_PER_ROW = 10;   // "x x x x x x x x x x" is 19 characters
export function resultLines(r) {
    const shown = Math.min(r.misses, MAX_MARKS);
    const marks = Array.from({ length: shown }, () => 'x');
    if (r.misses > MAX_MARKS) marks.push('…');
    marks.push(r.won ? '✓' : '✗');
    const rows = [];
    for (let i = 0; i < marks.length; i += MARKS_PER_ROW) rows.push(marks.slice(i, i + MARKS_PER_ROW).join(' '));
    return ['hide @$©!!', `- #${r.num}`, r.chapter, ...rows, r.won ? `${r.time.toFixed(2)}s` : 'TIMES UP'];
}

// The pasteable card — the modal itself, character for character: the # box with its blank row
// inside top and bottom, every line centred, ALWAYS CARD_W characters wide inside whatever the
// day's alphabet or number; then the link on its own line:
//   #####################
//   #                   #
//   #    hide @$©!!     #
//   #       - #12       #
//   #       JAPAN       #
//   #       x x ✓       #
//   #       7.42s       #
//   #                   #
//   #####################
//   https://hide-ascii.com
// Every line has the same number of characters, so it is a perfect box anywhere text is
// monospaced (a code block, a terminal, a monospace font). A chat that sets messages in a
// proportional face draws ✓, spaces and # at different widths, and no plain-text box can stay
// straight there.
const CARD_W = 19;          // inner width — fits the title, every alphabet, and a full marks row
export function shareText(r, origin = '') {
    const centre = (l) => {
        const n = [...l].length, left = Math.floor((CARD_W - n) / 2);
        return ' '.repeat(Math.max(0, left)) + l + ' '.repeat(Math.max(0, CARD_W - n - left));
    };
    const rule = '#'.repeat(CARD_W + 2);
    const blank = `#${' '.repeat(CARD_W)}#`;
    const body = resultLines(r).map(l => `#${centre(l)}#`);
    return [rule, blank, ...body, blank, rule, origin].filter(Boolean).join('\n');
}

// Copy the card to the clipboard. The async clipboard API needs a secure page (https or
// localhost); a hidden textarea + execCommand is the fallback for anything older. Resolves true
// when the text made it to the clipboard.
export function copyShare(r, origin) {
    const text = shareText(r, origin);
    const fallback = () => {
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch { return false; }
    };
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, fallback);
    return Promise.resolve(fallback());
}

// Dev only: forget today's attempt.
export function devResetDaily() { setPref(RESULT_KEY, null); }
