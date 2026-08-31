// sfx.js — the game's audio facade. Screens/UI call these; the Sound Lab does not use
// this file (it drives SoundEngine directly with its own editable bank).
//
// Sound design contract (agreed in the Sound Lab sessions):
//   BTN_PRESS    — first press-down of ANY button (also the only sound for plain/
//                  bracket toggles and noGlow vote/mode buttons)
//   BTN_CONFIRM  — release of a normal glowing button; also plays right after
//                  BTN_PRESS when a game/menu ASCII character is clicked
//   KEY_CLICK    — every value-changing keystroke in an input field
//   TELETYPE_TICK— cursor movement / typewriter text (transitions, Find: X,
//                  life-loss backspacing) — rate-limited so fast feeds purr
//   BEL          — a screen transition that completes naturally (never a cancelled one)
//   ERROR        — the ASCII-box modal opening
//   COUNTDOWN    — each 3/2/1 digit typing in
//   ROUND_START  — the characters appearing

import { initAudio, audioReady, playPatch, setMasterVolume, setSfxVolume, setMusicVolume } from './SoundEngine.js';
import { PATCHES } from './patches.js';
import { getPref } from '../prefs.js';

// Web Audio can only start from a user gesture. Idempotent — call from any input event.
// Volumes are (re)applied only on an actual unlock, not on every input event.
export function unlockAudio() {
    if (audioReady()) return;
    initAudio();
    applyVolumePrefs();
}

// Volume prefs (0-100) → engine gains. The settings sliders already persist these keys;
// call this from their onChange so dragging is heard live.
export function applyVolumePrefs() {
    if (!audioReady()) return;
    setMasterVolume((getPref('volume.master', 100) / 100) * 0.8);   // 0.8 = headroom
    setSfxVolume(getPref('volume.sfx', 100) / 100);
    setMusicVolume(getPref('volume.music', 100) / 100);
}

export function sfx(name, opts = {}) {
    if (!audioReady()) return 0;
    const p = PATCHES[name];
    return p ? playPatch(p, opts.when || 0, opts) : 0;
}

// Teletype tick, rate-limited: a fast feed (transition typing whole rows) becomes a
// steady purr instead of a per-character machine gun.
const TICK_MIN_MS = 35;
let _lastTick = 0;
export function typeTick() {
    const t = performance.now();
    if (t - _lastTick < TICK_MIN_MS) return;
    _lastTick = t;
    sfx('TELETYPE_TICK');
}
