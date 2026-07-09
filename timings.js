// Single source of truth for animation timings that BOTH sides depend on: the client
// plays the animation, and the server waits it out before advancing. Defining each value
// once here avoids hand-syncing duplicate constants across client and server.

// Round countdown — client: GameScreen._drawCountdown; server: startRoundCountdown timeout.
export const COUNTDOWN_MS = 6000;

// Life-loss callout — the player-list "X Lives" decrement animation.
//   client: LifeLossCallout (the typing/backspacing rhythm)
//   server: startNextRound waits INTRO + lossCount*ENTRY (+hold) before the next countdown.
export const LIFE_LOSS_INTRO_MS = 350;   // text shows, brief pause, then the cursor appears
export const LIFE_LOSS_HOLD_MS = 500;    // cursor parks on the old number
export const LIFE_LOSS_DEL_MS = 160;     // backspace the old number
export const LIFE_LOSS_GAP_MS = 130;     // empty beat
export const LIFE_LOSS_TYPE_MS = 160;    // type the new number
export const LIFE_LOSS_SETTLE_MS = 550;  // cursor parks on the new number before moving on
export const LIFE_LOSS_ENTRY_MS =        // total per player (1500)
    LIFE_LOSS_HOLD_MS + LIFE_LOSS_DEL_MS + LIFE_LOSS_GAP_MS + LIFE_LOSS_TYPE_MS + LIFE_LOSS_SETTLE_MS;

// "Lives → Life" word morph — extra phases that run ONLY when a player drops to exactly
// one life. After the number types "1": a pause, the caret walks right character-by-
// character across " Lives" (inverting each char like the input caret), then backspaces
// "ves" → "Li" and types "fe" → "Life". A to-1-life entry is longer by LIFE_LOSS_WORD_MS;
// the server adds that per such loss before advancing (client: LifeLossCallout; server:
// startNextRound's toOneCount). Everything derives from these, so bumping any one phase
// (e.g. a longer WORD_PAUSE) stays in sync automatically — no other change needed.
export const LIFE_LOSS_WORD_PAUSE_MS = 1300;  // park on "1 Lives" before the caret walks
export const LIFE_LOSS_WORD_MOVE_MS = 500;   // caret steps right across " Lives" (6 cells) to its end
export const LIFE_LOSS_WORD_DEL_MS = 500;    // backspace "ves" (3 chars @160ms)
export const LIFE_LOSS_WORD_GAP_MS = 250;    // caret rests at "Li|" between deleting "ves" and typing "fe"
export const LIFE_LOSS_WORD_TYPE_MS = 500;   // type "fe" (2 chars @160ms)
export const LIFE_LOSS_WORD_MS =             // extra total for a to-1-life entry
    LIFE_LOSS_WORD_PAUSE_MS + LIFE_LOSS_WORD_MOVE_MS + LIFE_LOSS_WORD_DEL_MS
    + LIFE_LOSS_WORD_GAP_MS + LIFE_LOSS_WORD_TYPE_MS;

// Elimination (drop to ZERO) — the word stays "Life" (never flips to "Lives"); after the
// number types "0" and a pause on "0 Life", the whole "0 Life" value is consumed left-to-
// right input-field style (each cell inverted as it deletes), then after a beat "DELETED" is
// typed. Reuses WORD_PAUSE (pause on "0 Life") and WORD_GAP (beat before "DELETED"). An
// elimination entry is longer by LIFE_LOSS_ELIM_MS; the server adds that per elimination.
export const LIFE_LOSS_ELIM_DEL_MS = 600;    // consume "0 Life" (6 cells) one at a time
export const LIFE_LOSS_ELIM_TYPE_MS = 700;   // type "DELETED" (7 chars)
export const LIFE_LOSS_ELIM_MS =             // extra total for an elimination entry
    LIFE_LOSS_WORD_PAUSE_MS + LIFE_LOSS_ELIM_DEL_MS + LIFE_LOSS_WORD_GAP_MS + LIFE_LOSS_ELIM_TYPE_MS;

// Match-over screen — client: GameScreen._drawMatchOver types "Match X: <winner>"; server:
// startNextRound waits MATCH_OVER_MS before the next match's countdown. Summed here so both stay
// in sync (worst case a full-length player name).
export const MO_HOLD_MS   = 1000;   // "Match X:" holds before the winner name types
export const MO_TYPE_MS   = 100;    // per-character type of the winner name
export const MO_CURSOR_MS = 500;    // cursor blink half-period
export const MO_TAIL_MS   = 900;    // hold the finished screen before the next round starts
export const MO_MAX_NAME  = 12;     // max player-name length — worst case for the derived hold
export const MATCH_OVER_MS =
    MO_HOLD_MS + MO_MAX_NAME * MO_TYPE_MS + MO_TAIL_MS;
