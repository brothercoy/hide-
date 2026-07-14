import { DELMode } from './DELmode.js';

// Frequency (ACK): the same char-field framework as DEL, but point-based instead of lives. Every
// player keeps finding the target until the round ends (all found, or time up); a valid tap scores
// by finishing order. After N rounds the highest total wins. This class reuses DELMode's whole
// snapshot/interpolation/countdown pipeline (via super.onMessage) and only overrides what differs:
// the round-result scoreboard beat, the score-based player list, and the score-based game over.
export class FrequencyMode extends DELMode {
    constructor(canvas, ctx, uiManager, room, callbacks) {
        super(canvas, ctx, uiManager, room, callbacks);
        this.totalRounds = 5;
        this.showRoundResult = false;   // the between-round scoreboard beat is up
        this.roundResult = null;        // its data { round, totalRounds, isFinal, multiplier, players }
        this.roundResultStart = null;
    }

    // The list the side panel draws: live names/connection/spectator flags, but each score FROZEN to
    // the round-start total, sorted highest→lowest (spectators fall out on score 0 and are routed to
    // their own section by GameScreen). The frozen value is fully SERVER-derivable — score minus this
    // round's gain (roundScore) — so it stays put as players tap (score and roundScore rise together)
    // and only snaps forward when the server zeroes roundScore for the next round. No client snapshot
    // to go stale, so a reconnecting player computes the exact same value everyone else shows.
    _displayList() {
        const list = (this.playerList || []).map(p => ({
            ...p,
            score: (p.score || 0) - (p.roundScore || 0)
        }));
        list.sort((a, b) => (b.score || 0) - (a.score || 0));
        return list;
    }

    onMessage(type, data) {
        switch (type) {
            case 'roundResult':
                this.roundResult = data;
                this.showRoundResult = true;
                this.roundResultStart = Date.now();
                this.totalRounds = data.totalRounds || this.totalRounds;
                break;

            case 'roundCountdown':
            case 'roundStart':
                // A new round begins — clear the scoreboard, then let the shared pipeline take over.
                // The side list snaps to the new totals on its own: the server has zeroed roundScore,
                // so score - roundScore is now the full running total.
                this.showRoundResult = false;
                this.roundResult = null;
                super.onMessage(type, data);
                break;

            case 'playerList':
                // No life-loss callout in Frequency — the list updates live (running scores).
                this.playerList = data.players;
                break;

            // Frequency never uses the lives/elimination beats.
            case 'roundOver':
            case 'timeUp':
            case 'matchOver':
                break;

            case 'gameOver':
                this.winnerId = data.winnerName || 'Nobody';
                this.countdownActive = false;
                // Leave showRoundResult ON (like DEL leaves showRoundOver on): the field stays dimmed
                // and the target keeps pulsing straight into the game-over scrim, instead of flashing
                // back to full brightness for a frame before the scrim re-dims it. The scoreboard's
                // center content is already suppressed by the winnerId branch in GameScreen._drawGame.
                // (Server zeroes roundScore at game over, so the side list shows the full final totals.)
                this.onGameOver(this.winnerId);
                break;

            case 'reconnected':
                super.onMessage(type, data);
                if (data.totalRounds) this.totalRounds = data.totalRounds;
                break;

            default:
                // roundCountdown/roundStart handled above; gameState/charUpdate fall through to shared.
                super.onMessage(type, data);
        }
    }

    draw(gameScreen) {
        const { a, b, t } = this._interp();
        this._lastInterp = { a, b, t };
        gameScreen.draw({
            chars: this.chars,
            posA: a,
            posB: b,
            charT: t,
            targetChar: this.targetChar,
            playerList: this._displayList(),
            timeLeft: this.timeLeft,
            currentRound: this.currentRound,
            totalRounds: this.totalRounds,
            showRoundResult: this.showRoundResult,
            roundResult: this.roundResult,
            roundResultStart: this.roundResultStart,
            countdownActive: this.countdownActive,
            countdownStartTime: this.countdownStartTime,
            countdownMs: this.countdownMs,
            lastUpdateTime: this.lastUpdateTime,
            winnerId: this.winnerId
        });
    }

    reset() {
        super.reset();
        this.showRoundResult = false;
        this.roundResult = null;
        this.roundResultStart = null;
    }
}
