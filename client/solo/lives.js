// Solo campaign lives. Three hearts; failing a level you haven't beaten costs one; at zero the
// campaign is locked until the next day. Replays of an already-beaten level are free.
//
// THE CLOCK IS THE SERVER'S, NOT THE DEVICE'S. A player can set their device date forward, so a
// local Date.now() would hand out lives on demand. The server's /time endpoint is the reference;
// the client only supplies its TIMEZONE OFFSET, so the boundary is still the player's own local
// midnight. Shifting the timezone to cross a boundary early is closed off by MIN_REFILL_MS: a
// refill also requires most of a real day to have passed on the server's clock.
//
// The lives COUNT still lives in prefs like the rest of solo progress, so devtools can still edit
// it — this defends the clock, which is what makes "wait until tomorrow" mean anything.
import { getPref, setPref } from '../prefs.js';

export const MAX_LIVES = 3;
const KEY = 'campaign.lives';        // { lives, day, at } — day = local YYYY-MM-DD of the last refill,
                                     // at = the server ms when that refill happened
const INFINITE_KEY = 'campaign.infinite';   // true once the main menu's secret has been solved

// INFINITE LIVES — the main menu's @ $ © ! ! secret. Once granted, nothing here can cost a life
// or lock the player out; the hearts draw as a single ∞. The daily refill keeps running
// underneath, untouched, so revoking it (dev) drops straight back to the ordinary count.
export function isInfinite() { return !!getPref(INFINITE_KEY, false); }
export function grantInfinite() { setPref(INFINITE_KEY, true); }
export function devSetInfinite(on) { setPref(INFINITE_KEY, !!on); }
const MIN_REFILL_MS = 20 * 60 * 60 * 1000;   // a refill needs ~a day of SERVER time, so hopping
                                             // timezones across a date boundary buys nothing

let serverNow = null;      // server ms at the moment we fetched it
let fetchedAt = null;      // performance.now() then — so we can age it without the device clock
let syncing = null;

// Server ms right now, or null if we've never reached the server this session. Ages the fetched
// value with performance.now(), a monotonic timer the date setting can't move.
function now() {
    if (serverNow == null) return null;
    return serverNow + (performance.now() - fetchedAt);
}

// Fetch the server clock once per session. Resolves to true if we have a trustworthy time.
export function syncClock() {
    if (serverNow != null) return Promise.resolve(true);
    if (syncing) return syncing;
    syncing = fetch('/time', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('bad status')))
        .then(d => {
            if (typeof d.now !== 'number') throw new Error('bad payload');
            serverNow = d.now;
            fetchedAt = performance.now();
            refillIfNewDay();
            return true;
        })
        .catch(() => false)          // offline: we simply don't refill — nothing is lost
        .finally(() => { syncing = null; });
    return syncing;
}

// The player's LOCAL calendar day for a server timestamp, as YYYY-MM-DD.
function localDay(ms) {
    const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
}

// The player's local calendar day right now, by the SERVER's clock when we have it — the same day
// boundary the lives refill uses, so the daily level turns over at the same moment. Before the
// clock has synced (or offline) the device's own day stands in.
export function localToday() {
    const t = now();
    return localDay(t == null ? Date.now() : t);
}

function load() {
    const s = getPref(KEY, null);
    if (s && typeof s === 'object' && typeof s.lives === 'number') return s;
    return { lives: MAX_LIVES, day: null, at: 0 };
}

// Refill to full if the player's local day has changed AND a real day has passed on the server's
// clock. A no-op without a server time — better to withhold a refill than to hand out free lives.
export function refillIfNewDay() {
    const t = now();
    if (t == null) return false;
    const s = load();
    const today = localDay(t);
    if (s.day === today) return false;
    if (s.day !== null && t - (s.at || 0) < MIN_REFILL_MS) return false;
    setPref(KEY, { lives: MAX_LIVES, day: today, at: t });
    return true;
}

export function getLives() {
    return Math.max(0, Math.min(MAX_LIVES, load().lives));
}

// Costs a life. Returns what's left.
export function loseLife() {
    if (isInfinite()) return getLives();   // nothing to spend — the secret's been solved
    const s = load();
    const lives = Math.max(0, s.lives - 1);
    // Stamp the day on the FIRST loss so the refill has a reference point even if the player has
    // never seen a refill before.
    setPref(KEY, { lives, day: s.day ?? (now() != null ? localDay(now()) : null), at: s.at || now() || 0 });
    return lives;
}

export function hasLives() { return isInfinite() || getLives() > 0; }

// For the "no lives" message — the player's local midnight is when they come back.
export function nextRefillText() {
    return 'LIVES RETURN TOMORROW';
}

// Dev only (stripped from production builds with the rest of window.dev).
export function devSetLives(n) {
    const s = load();
    setPref(KEY, { ...s, lives: Math.max(0, Math.min(MAX_LIVES, n)) });
}
