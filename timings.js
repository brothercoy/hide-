// Single source of truth for animation timings that BOTH sides depend on: the client
// plays the animation, and the server waits it out before advancing. Defining each value
// once here avoids hand-syncing duplicate constants across client and server.

// Round countdown — client: GameScreen._drawCountdown; server: startRoundCountdown timeout.
export const COUNTDOWN_MS = 7500;

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
