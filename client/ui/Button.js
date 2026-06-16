import { otFont, charWidth } from './Font.js';

export const Z_FLOAT_MIN = 1.3;
export const Z_FLOAT_MAX = 1.8;
export const Z_PRESSED   = 2.5;
export const Z_FLOAT_SPEED = 1.2;
export const Z_PRESS_SPEED = 0.007;
export const Z_RETURN_SPEED = 0.009;

export function zToScale(z) {
    const t = (z - 1.0) / (3.0 - 1.0);
    return Math.max(0.5, 1.0 - t * 0.5);
}

export function zToAlpha(z) {
    const t = (z - 1.0) / (3.0 - 1.0);
    return Math.max(0, 1.0 - t);
}

export function getCharZ(phase, baseZ, elapsed) {
    const pressOffset = (baseZ || Z_FLOAT_MIN) - Z_FLOAT_MIN;
    const pressT = pressOffset / (Z_PRESSED - Z_FLOAT_MIN);
    const oscRange = (Z_FLOAT_MAX - Z_FLOAT_MIN) * (1.0 - pressT);
    const floatZ = Z_FLOAT_MIN + (Math.sin(elapsed * Z_FLOAT_SPEED + phase) * 0.5 + 0.5) * oscRange;
    return floatZ + pressOffset;
}

export function getCharZWithReturn(btn, ci, elapsed) {
    if (btn.releasePhase === 'returning' && btn.charZ) {
        return btn.charZ[ci];
    }
    return getCharZ(btn.charPhases[ci], btn.z, elapsed);
}

// Returns { cx, cy, radius } — visual center and collision radius for a character
// drawn at (drawX, drawY) top-left of slot at given fontSize.
// Cache keyed by char+fontSize since getBoundingBox is constant per glyph.
const _collisionCache = new Map();
export function getCharCollision(char, drawX, drawY, fontSize) {
    const key = char + fontSize;
    let cached = _collisionCache.get(key);
    if (!cached) {
        const glyph = otFont.charToGlyph(char);
        const fontScale = fontSize / otFont.unitsPerEm;
        const bbox = glyph.getBoundingBox();
        const offsetCX = (bbox.x1 + bbox.x2) / 2 * fontScale;
        const offsetCY = (bbox.y1 + bbox.y2) / 2 * fontScale;
        const rx = (bbox.x2 - bbox.x1) / 2 * fontScale;
        const ry = (bbox.y2 - bbox.y1) / 2 * fontScale;
        const radius = Math.sqrt(rx * rx + ry * ry);
        cached = { offsetCX, offsetCY, radius };
        _collisionCache.set(key, cached);
    }
    // Apply to actual draw position — baseline is drawY + fontSize
    const baseline = drawY + fontSize;
    return {
        cx: drawX + cached.offsetCX,
        cy: baseline - cached.offsetCY,
        radius: cached.radius
    };
}

export function drawChar(ctx, char, x, y, z, color, FONT_SIZE) {
    if (!otFont) return;
    const scale = zToScale(z);
    const alpha = zToAlpha(z);
    const scaledSize = FONT_SIZE * scale;

    const glyph = otFont.charToGlyph(char);
    const fullScale = FONT_SIZE / otFont.unitsPerEm;
    const sScale = scaledSize / otFont.unitsPerEm;
    const bbox = glyph.getBoundingBox();

    // Fixed visual center at full size
    const fullCX = x + (bbox.x1 + bbox.x2) / 2 * fullScale;
    const fullCY = (y + FONT_SIZE) - (bbox.y1 + bbox.y2) / 2 * fullScale;

    // Scaled glyph center offset from its own origin
    const scaledCX = (bbox.x1 + bbox.x2) / 2 * sScale;
    const scaledCY = (bbox.y1 + bbox.y2) / 2 * sScale;

    // Draw so scaled glyph center aligns with fixed full-size center
    const drawX = fullCX - scaledCX;
    const drawY = fullCY + scaledCY;

    const path = otFont.getPath(char, drawX, drawY, scaledSize);
    path.fill = color || '#00ff41';
    ctx.save();
    ctx.globalAlpha = alpha;
    path.draw(ctx);
    ctx.restore();
}

export function makeButton(label, x, y, onClick, options = {}) {
    return {
        label, x, y, onClick,
        hoverProgress: 0,
        rect: null,
        fullRect: null,
        phase: Math.random() * Math.PI * 2,
        isDefault: options.isDefault || false,
        active: options.active || false,
        disabled: options.disabled || false,
        plain: options.plain || false,
        blocksInput: options.blocksInput || false,
        z: Z_FLOAT_MIN + (Math.random() * (Z_FLOAT_MAX - Z_FLOAT_MIN)),
        releasePhase: null,
        charPhases: null,
        glowT: 0,
        _fireClick: false,
        charZ: null,
    };
}

export function updateButtonZ(btn, dt, elapsed, pressedButton, mouseIsDown, mouseX, mouseY) {
    const r = btn.fullRect || btn.rect;
    const over = r && mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h;
    const isPressed = btn === pressedButton && mouseIsDown && over;

    if (isPressed) {
        btn.z = Math.min(Z_PRESSED, btn.z + dt * Z_PRESS_SPEED);
    } else if (btn.releasePhase === 'releasing') {
        btn.z -= dt * Z_RETURN_SPEED;
        if (btn.z <= 1.0) {
            btn.z = 1.0;
            btn.releasePhase = 'glowing';
            btn.glowT = 0;
        }
    } else if (btn.releasePhase === 'glowing') {
        btn.glowT += dt * 0.001;
        if (btn.glowT >= 1.0) {
            btn.glowT = 0;
            btn.releasePhase = 'returning';
            btn._fireClick = true;
            if (btn.charPhases) {
                btn.charZ = new Array(200).fill(1.0);
            }
        }
    } else if (btn.releasePhase === 'returning') {
        if (btn.charZ) {
            let allDone = true;
            const speed = (Z_FLOAT_MAX - Z_FLOAT_MIN) * Z_FLOAT_SPEED * dt / 1000;
            for (let i = 0; i < btn.charZ.length; i++) {
                const target = getCharZ(btn.charPhases[i], Z_FLOAT_MIN, elapsed);
                const diff = target - btn.charZ[i];
                if (Math.abs(diff) <= speed) {
                    btn.charZ[i] = target;
                } else {
                    btn.charZ[i] += Math.sign(diff) * speed;
                    allDone = false;
                }
            }
            if (allDone) {
                btn.z = Z_FLOAT_MIN;
                btn.releasePhase = null;
                btn.charZ = null;
            }
        }
    } else {
        if (btn.z > Z_FLOAT_MIN + 0.01) {
            btn.z += (Z_FLOAT_MIN - btn.z) * Math.min(1, dt * Z_RETURN_SPEED);
        }
    }
}

export function drawButton(ctx, btn, elapsed, FONT_SIZE) {
    if (!otFont) return;

    if (btn.plain) {
        const cw = charWidth(FONT_SIZE);
        const w = btn.label.length * cw;
        const left = btn.x - w / 2;
        const top = btn.y - FONT_SIZE / 2;
        ctx.globalAlpha = 1;
        const color = btn.disabled ? '#007a1f' : (btn.hoverProgress > 0.05 ? '#00ff41' : '#00aa2a');
        const path = otFont.getPath(btn.label, left, top + FONT_SIZE, FONT_SIZE);
        path.fill = color;
        path.draw(ctx);
        btn.rect = { x: left, y: top, w, h: FONT_SIZE };
        return;
    }

    const cw = charWidth(FONT_SIZE);
    const labelW = btn.label.length * cw;
    const padX = cw * 2;
    const innerWidth = labelW + padX * 2;
    const borderWidth = innerWidth + cw * 2;
    const lh = FONT_SIZE;
    const totalHeight = lh * 2.5;
    const sl = btn.x - borderWidth / 2;
    const st = btn.y - totalHeight / 2;
    const dashCount = Math.floor(innerWidth / cw);
    const plusCount = Math.floor((dashCount / 2) * (btn.active ? 1 : btn.hoverProgress));

    let borderLine = '';
    for (let i = 0; i < dashCount; i++) {
        const fl = i, fr = dashCount - 1 - i;
        borderLine += (fl < plusCount || fr < plusCount ||
            (dashCount % 2 === 1 && i === Math.floor(dashCount / 2) && plusCount >= Math.floor(dashCount / 2)))
            ? '+' : '-';
    }

    const topB = '+' + borderLine + '+';
    const botB = '+' + borderLine + '+';
    const isPressed = btn._isPressed;
    const ls = isPressed ? '}' : (btn.active ? (Math.floor(Date.now() / 500) % 2 === 0 ? '}' : ' ') : '|');
    const rs = isPressed ? '{' : (btn.active ? (Math.floor(Date.now() / 500) % 2 === 0 ? '{' : ' ') : '|');

    if (!btn.charPhases) {
        btn.charPhases = Array.from({ length: 200 }, () => Math.random() * Math.PI * 2);
    }

    let glowColor = btn.disabled ? '#007a1f' : '#00ff41';
    if (btn.releasePhase === 'glowing' && btn.glowT > 0) {
        const g = btn.glowT < 0.5 ? btn.glowT * 2 : (1 - btn.glowT) * 2;
        glowColor = `rgb(${Math.round(g * 170)}, 255, ${Math.round(65 + g * 121)})`;
    }

    const useFixed = btn.releasePhase === 'releasing' || btn.releasePhase === 'glowing';

    let ci = 0;
    for (let i = 0; i < topB.length; i++, ci++)
        drawChar(ctx, topB[i], sl + i * cw, st, useFixed ? btn.z : getCharZWithReturn(btn, ci, elapsed), glowColor, FONT_SIZE);
    drawChar(ctx, ls, sl, st + lh, useFixed ? btn.z : getCharZWithReturn(btn, ci++, elapsed), glowColor, FONT_SIZE);
    for (let i = 0; i < btn.label.length; i++, ci++)
        drawChar(ctx, btn.label[i], sl + cw + padX + i * cw, st + lh, useFixed ? btn.z : getCharZWithReturn(btn, ci, elapsed), glowColor, FONT_SIZE);
    drawChar(ctx, rs, sl + borderWidth - cw, st + lh, useFixed ? btn.z : getCharZWithReturn(btn, ci++, elapsed), glowColor, FONT_SIZE);
    for (let i = 0; i < botB.length; i++, ci++)
        drawChar(ctx, botB[i], sl + i * cw, st + lh * 2, useFixed ? btn.z : getCharZWithReturn(btn, ci, elapsed), glowColor, FONT_SIZE);

    ctx.globalAlpha = 1;
    btn.rect = btn.fullRect = { x: sl, y: st, w: borderWidth, h: totalHeight };
}