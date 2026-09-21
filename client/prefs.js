// Player-local preferences — a tiny, type-safe wrapper over localStorage.
//
// This is ONLY for settings that are purely about this browser/device and can't be cheated to
// gain an advantage: theme, volume, etc. Anything a player could edit in devtools to their benefit
// (rank, currency, unlockables) must NOT live here — that belongs server-side, tied to an identity.
//
// Values are JSON-encoded so they keep their type (numbers stay numbers), and every access is
// guarded — localStorage throws in private-browsing mode and when the quota is full, and we never
// want a preference read/write to break the game.
//
// Keys are namespaced under a prefix so they can never collide with the app's other localStorage
// entries (e.g. the raw `reconnectionToken`, which is intentionally left un-prefixed and untouched).

const PREFIX = 'hide:';

export function getPref(key, fallback = null) {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}

export function setPref(key, value) {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (_) {
        /* private mode / quota exceeded — the preference just won't persist. Non-fatal. */
    }
}

// Raw, UN-prefixed localStorage, guarded the same way — for the reconnection token, which is
// deliberately stored under its own plain key. Reaching for `localStorage` directly is not safe:
// besides private mode and a full quota, an iframe sandboxed WITHOUT same-origin (which is how
// some hosts embed a game) makes the property itself throw on access. One such read sat at module
// scope in game.js, so it took the whole module down and left a permanently black screen.
export function getRaw(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
}
export function setRaw(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* non-fatal */ }
}
export function removeRaw(key) {
    try { localStorage.removeItem(key); } catch (_) { /* non-fatal */ }
}
// sessionStorage is just as unsafe to touch, and for the same reasons.
export function getSession(key, fallback = null) {
    try { return sessionStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
}
export function setSession(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) { /* non-fatal */ }
}
