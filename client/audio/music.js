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

export function setMusic(name) {
    desired = name;
}

export function syncMusic() {
    if (!audioReady()) return;
    const song = desired ? SONGS[desired] : null;
    if (!song) {
        if (current) { player.stop(); current = null; }
        return;
    }
    if (current === song.name && player.playing()) return;
    // Musical handoff: the running song finishes its current drum-loop pass, then
    // the new one enters on the beat (immediate when nothing is playing). Asking
    // for the running song again before the boundary cancels the switch.
    player.queue(song);
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
