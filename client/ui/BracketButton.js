// Bracket-snap confirm — a `} LABEL {` control whose brackets flash inward on
// hover (no opacity/press), matching the modal OK interaction. Used for COPY
// CODE and CUSTOM in the lobby. These are registered as `{ plain: true }`
// uiManager buttons (so they fire onClick immediately and get hoverProgress for
// free) plus a `bracket: true` flag; the screen draws them with this function.
import { theme, dim } from './colors.js';

export const BRACKET_REST = 22;     // px gap from the label edge to each bracket at rest
const BRACKET_STEP = 12;     // px the brackets flash inward
const BRACKET_FLASH_IN = 600;  // ms the brackets stay snapped in
const BRACKET_FLASH_OUT = 600; // ms at rest between flashes
const BRACKET_TOGGLE_PAUSE = 1500; // ms after a toggle flips before its hover anim starts

export function makeBracketButton(label, x, y, onClick, options = {}) {
    return {
        label, x, y, onClick,
        hoverProgress: 0,
        rect: null,
        plain: true,    // fire onClick immediately on release, no glow lifecycle
        bracket: true,  // draw via drawBracketButton
        active: options.active || false,
        toggle: options.toggle || false,  // a real on/off toggle (gets active-hover anim)
        toggledAt: options.toggledAt ?? null, // elapsed time the toggle last flipped (for the hover-anim pause)
        hitPad: options.hitPad || 0,          // extra px around the hit rect (easier to click)
        disabled: options.disabled || false,
    };
}

export function drawBracketButton(ctx, btn, elapsed, FONT_SIZE) {
    ctx.font = `${FONT_SIZE}px "IBMVGA"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cw = ctx.measureText('M').width;
    const labelW = ctx.measureText(btn.label).width;
    const cx = btn.x, cy = btn.y;
    const color = btn.disabled ? dim() : theme.fg;

    // Just after a toggle flips (either direction), suppress its hover animation
    // for a beat so it doesn't fire the instant you click — it just shows its
    // rest state (held inner when on, outward spread when off), like COPIED!.
    const togglePaused = btn.toggle && btn.toggledAt != null &&
        (elapsed - btn.toggledAt) * 1000 < BRACKET_TOGGLE_PAUSE;

    // Flash phase, restarted on hover (fresh, like the modal OK — measured from
    // when the hover started, not the global clock). Also kept reset during the
    // pause so the animation begins fresh once the pause ends.
    const cycle = BRACKET_FLASH_IN + BRACKET_FLASH_OUT;
    if (btn._over && !togglePaused) {
        if (btn._flashStart == null) btn._flashStart = elapsed;
    } else {
        btn._flashStart = null;
    }
    const t = btn._flashStart != null ? ((elapsed - btn._flashStart) * 1000) % cycle : 0;
    const pulse = btn._flashStart != null && t < BRACKET_FLASH_IN;

    // Inactive: rests OUTWARD ( { label } ); on hover the brackets swap to inward
    //   ( } label { ) and pulse spread→tight.
    // Active TOGGLE (CUSTOM): held INNER (tight); hover swaps brackets OUTWARD and
    //   pulses tight→spread (matching its tight rest).
    // Active non-toggle (COPY CODE "COPIED!"): just held INNER, no hover anim.
    let snap, outward = false;
    if (btn.active) {
        if (btn.toggle && btn._over && !togglePaused) {
            snap = pulse ? BRACKET_STEP : 0; // outward pulse, tight→spread
            outward = true;
        } else {
            snap = BRACKET_STEP; // held inner
        }
    } else if (btn._over && !togglePaused) {
        snap = pulse ? 0 : BRACKET_STEP; // inward pulse, spread→tight
    } else {
        snap = 0;        // rest, full spread
        outward = true;  // outward brackets { label }
    }
    const gap = BRACKET_REST - snap;

    // Brackets normally face inward ( } label { ); `outward` swaps them to
    // ( { label } ) when an active toggle is hovered.
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillText(btn.label, cx, cy);
    ctx.fillText(outward ? '{' : '}', cx - labelW / 2 - gap, cy);
    ctx.fillText(outward ? '}' : '{', cx + labelW / 2 + gap, cy);

    // Hit rect uses the REST spread (widest) so hovering doesn't shrink it.
    const hp = btn.hitPad || 0;
    const reach = labelW / 2 + BRACKET_REST + cw + hp;
    btn.rect = { x: cx - reach, y: cy - FONT_SIZE / 2 - hp, w: reach * 2, h: FONT_SIZE + hp * 2 };
}

// --- Screen-transition feed: one row that types `{ label }` left-to-right -----
// The fully-typed frame matches drawBracketButton's REST state (outward when
// inactive, held-inner when active), so the handoff to the live draw is seamless.
export function bracketButtonRows(btn, FONT_SIZE) {
    return [{
        y: btn.y,
        x: btn.x,
        cost: btn.label.length + 2, // left bracket + label + right bracket
        draw: (ctx, n) => drawBracketButtonRow(ctx, btn, n, FONT_SIZE),
    }];
}

export function drawBracketButtonRow(ctx, btn, n, FONT_SIZE) {
    ctx.font = `${FONT_SIZE}px "IBMVGA"`;
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1;
    ctx.fillStyle = btn.disabled ? dim() : theme.fg;
    const cx = btn.x, cy = btn.y;
    ctx.textAlign = 'center';
    const cw = ctx.measureText('M').width;
    const labelW = ctx.measureText(btn.label).width;
    // Set the hit rect (same as drawBracketButton) so it's clickable while it
    // types in — offset-aware hit-testing handles the scroll position.
    const hp = btn.hitPad || 0;
    const reach = labelW / 2 + BRACKET_REST + cw + hp;
    btn.rect = { x: cx - reach, y: cy - FONT_SIZE / 2 - hp, w: reach * 2, h: FONT_SIZE + hp * 2 };
    const inner = !!btn.active;                       // active rests held-inner
    const gap = inner ? (BRACKET_REST - BRACKET_STEP) : BRACKET_REST;
    const leftCh = inner ? '}' : '{';
    const rightCh = inner ? '{' : '}';
    if (n >= 1) ctx.fillText(leftCh, cx - labelW / 2 - gap, cy);
    const shown = Math.max(0, Math.min(btn.label.length, n - 1));
    if (shown > 0) {
        ctx.textAlign = 'left';
        ctx.fillText(btn.label.slice(0, shown), cx - labelW / 2, cy);
        ctx.textAlign = 'center';
    }
    if (n >= btn.label.length + 2) ctx.fillText(rightCh, cx + labelW / 2 + gap, cy);
}
