// music.js — which tracker song is playing, driven by where the player is.
//
// The game declares intent with setMusic('THEME' | 'BATTLE' | null); syncMusic()
// (called every frame from the main loop) makes reality match — it has to be a
// sync loop rather than a direct call because audio may not be unlocked yet when
// a screen first asks for its music (boot gate, quick-rejoin path). Asking for a
// song that doesn't exist in songs.js yet just plays silence — so 'BATTLE' can be
// wired up now and starts working the day a song with that name is composed in
// the Sound Lab and committed.

import { createPlayer } from './MusicPlayer.js';
import { PATCHES } from './patches.js';
import { SONGS } from './songs.js';
import { audioReady } from './SoundEngine.js';

const player = createPlayer(k => PATCHES[k]);

let desired = null;   // song name the game wants right now (null = silence)
let current = null;   // song name actually playing
let stopAtBar = false;     // silence request rides to the next drum-loop boundary
const heard = new Set();   // songs whose intro has already played this session

// setMusic(null, { atBar: true }) lets the running song finish its current
// measure before going silent (a menu song bowing out as a game begins);
// plain setMusic(null) cuts immediately (round endings).
export function setMusic(name, opts = {}) {
    desired = name;
    stopAtBar = !name && !!opts.atBar;
}

export function syncMusic() {
    if (!audioReady()) return;
    const song = desired ? SONGS[desired] : null;
    if (!song) {
        if (current) {
            if (stopAtBar) player.queue(null);
            else player.stop();
            current = null;
        }
        return;
    }
    if (current === song.name && player.playing()) return;
    // Musical handoff: the running song finishes its current drum-loop pass, then
    // the new one enters on the beat (immediate when nothing is playing). Asking
    // for the running song again before the boundary cancels the switch.
    // A song's intro plays only the FIRST time this session — every later entry
    // (e.g. back to the menu after a match) drops straight into its loop region.
    player.queue(song, heard.has(song.name) ? (song.loopStep || 0) : 0);
    heard.add(song.name);
    current = song.name;
}

// Speed the current song up/down without changing pitch (1 = normal). Eases over
// rampS seconds. Safe to assert every frame — only a changed target reaches the
// player, so the ramp isn't perpetually restarted.
let tempoTarget = 1;
export function setMusicTempo(mul, rampS = 2) {
    if (mul === tempoTarget) return;
    tempoTarget = mul;
    player.setTempo(mul, rampS);
}

// Round-tension mode, asserted every frame by the game: ramps toward double speed
// over the tension window, and — if the current song marks a tensionStep — jumps
// playback into that section (on a drum-loop boundary) and loops only it until
// tension lifts. Songs without a tensionStep just speed up in full, as before.
let tense = false;
export function setMusicTension(on) {
    if (on === tense) return;
    tense = on;
    setMusicTempo(on ? 2 : 1, on ? 10 : 1);
    const song = current ? SONGS[current] : null;
    player.setSection(on && song?.tensionStep != null ? song.tensionStep : null);
}
