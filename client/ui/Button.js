import { otFont, charWidth } from './Font.js';

export const Z_FLOAT_MIN = 1.3;
export const Z_FLOAT_MAX = 1.3;
export const Z_PRESSED   = 2.5;
export const Z_FLOAT_SPEED = 0;
export const Z_PRESS_SPEED = 0.007;
export const Z_RETURN_SPEED = 0.009;
export const GLOW_SPEED = 0.0013;
export const ENABLE_GLOW_COLOR = true;
export const CHAR_ROT_MAX = 0.0;
export const CHAR_ROT_SPEED = 0.4;
const USE_VECTOR = false;

export function zToScale(z) {
    // Size no longer changes with z — depth is conveyed by opacity only.
    return 1.0;
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

export function getCharRotWithReturn(btn, ci, elapsed) {
    if ((btn.releasePhase === 'releasing' || btn.releasePhase === 'glowing' || btn.releasePhase === 'returning') && btn.charRot) {
        return btn.charRot[ci];
    }
    if (!btn.charPhases) return 0;
    return Math.sin(elapsed * CHAR_ROT_SPEED + btn.charPhases[ci] + Math.PI) * CHAR_ROT_MAX;
}

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
    const baseline = drawY + fontSize;
    return {
        cx: drawX + cached.offsetCX,
        cy: baseline - cached.offsetCY,
        radius: cached.radius
    };
}

export function drawChar(ctx, char, x, y, z, color, FONT_SIZE, rotAngle) {
    const scale = zToScale(z);
    const alpha = zToAlpha(z);

    if (USE_VECTOR && otFont) {
        const scaledSize = FONT_SIZE * scale;
        const glyph = otFont.charToGlyph(char);
        const fullScale = FONT_SIZE / otFont.unitsPerEm;
        const sScale = scaledSize / otFont.unitsPerEm;
        const bbox = glyph.getBoundingBox();
        const fullCX = x + (bbox.x1 + bbox.x2) / 2 * fullScale;
        const fullCY = (y + FONT_SIZE) - (bbox.y1 + bbox.y2) / 2 * fullScale;
        const scaledCX = (bbox.x1 + bbox.x2) / 2 * sScale;
        const scaledCY = (bbox.y1 + bbox.y2) / 2 * sScale;
        const path = otFont.getPath(char, fullCX - scaledCX, fullCY + scaledCY, scaledSize);
        path.fill = color || '#00ff41';
        ctx.save();
        ctx.globalAlpha = alpha;
        if (rotAngle) {
            ctx.translate(fullCX, fullCY);
            ctx.rotate(rotAngle);
            ctx.translate(-fullCX, -fullCY);
        }
        path.draw(ctx);
        ctx.restore();
    } else {
        ctx.font = `${FONT_SIZE}px "IBMVGA"`;
        const fw = ctx.measureText('M').width;
        ctx.font = `${FONT_SIZE * scale}px "IBMVGA"`;
        const sw = ctx.measureText('M').width;
        const xShift = (fw - sw) / 2;
        const yShift = (FONT_SIZE - FONT_SIZE * scale) * 0.5;
        const cx = x + fw / 2;
        const cy = y + FONT_SIZE / 2;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color || '#00ff41';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        if (rotAngle) {
            ctx.translate(cx, cy);
            ctx.rotate(rotAngle);
            ctx.translate(-cx, -cy);
        }
        ctx.fillText(char, x + xShift, y + yShift);
        ctx.restore();
        ctx.font = `${FONT_SIZE}px "IBMVGA"`;
    }
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
        charRot: null,
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
        if (btn.charRot) {
            const rotSpeed = CHAR_ROT_MAX * 2 * CHAR_ROT_SPEED * dt / 1000 * 50;
            for (let i = 0; i < btn.charRot.length; i++) {
                if (Math.abs(btn.charRot[i]) <= rotSpeed) { btn.charRot[i] = 0; }
                else { btn.charRot[i] += Math.sign(0 - btn.charRot[i]) * rotSpeed; }
            }
        }
        if (btn.z <= 1.0) {
            btn.z = 1.0;
            btn.releasePhase = 'glowing';
            btn.glowT = 0;
        }
    } else if (btn.releasePhase === 'glowing') {
        btn.glowT += dt * GLOW_SPEED;
        if (btn.glowT >= 1.0) {
            btn.glowT = 0;
            btn.releasePhase = 'returning';
            btn._fireClick = true;
            if (btn.charPhases) {
                btn.charZ = new Array(200).fill(1.0);
                btn.charRot = new Array(200).fill(0.0);
            }
        }
    } else if (btn.releasePhase === 'returning') {
        if (btn.charZ) {
            let allDone = true;
            const speed = Math.max(0.001, (Z_FLOAT_MAX - Z_FLOAT_MIN) * Z_FLOAT_SPEED * dt / 1000);
            const rotSpeed = CHAR_ROT_MAX * 2 * CHAR_ROT_SPEED * dt / 1000;
            for (let i = 0; i < btn.charZ.length; i++) {
                const target = getCharZ(btn.charPhases[i], Z_FLOAT_MIN, elapsed);
                const diff = target - btn.charZ[i];
                if (Math.abs(diff) <= speed) {
                    btn.charZ[i] = target;
                } else {
                    btn.charZ[i] += Math.sign(diff) * speed;
                    allDone = false;
                }
                if (btn.charRot) {
                    const targetRot = Math.sin(elapsed * CHAR_ROT_SPEED + btn.charPhases[i] + Math.PI) * CHAR_ROT_MAX;
                    const diffRot = targetRot - btn.charRot[i];
                    if (Math.abs(diffRot) <= rotSpeed) { btn.charRot[i] = targetRot; }
                    else { btn.charRot[i] += Math.sign(diffRot) * rotSpeed; }
                }
            }
            if (allDone) {
                btn.z = Z_FLOAT_MIN;
                btn.releasePhase = null;
                btn.charZ = null;
                btn.charRot = null;
            }
        }
    } else {
        if (btn.z > Z_FLOAT_MIN + 0.01) {
            btn.z += (Z_FLOAT_MIN - btn.z) * Math.min(1, dt * Z_RETURN_SPEED);
        }
    }
}

export function drawButton(ctx, btn, elapsed, FONT_SIZE) {
    if (!USE_VECTOR) {
        // bitmap plain buttons use ctx directly
    }

    if (btn.plain) {
        const cw = charWidth(FONT_SIZE);
        const w = btn.label.length * cw;
        const left = btn.x - w / 2;
        const top = btn.y - FONT_SIZE / 2;
        ctx.globalAlpha = 1;
        const color = btn.disabled ? '#007a1f' : (btn.hoverProgress > 0.05 ? '#00ff41' : '#00aa2a');
        if (USE_VECTOR && otFont) {
            const path = otFont.getPath(btn.label, left, top + FONT_SIZE, FONT_SIZE);
            path.fill = color;
            path.draw(ctx);
        } else {
            ctx.font = `${FONT_SIZE}px "IBMVGA"`;
            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(btn.label, left, top);
        }
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
    if (ENABLE_GLOW_COLOR && btn.releasePhase === 'glowing' && btn.glowT > 0) {
        const g = btn.glowT < 0.5 ? btn.glowT * 2 : (1 - btn.glowT) * 2;
        glowColor = `rgb(${Math.round(g * 170)}, 255, ${Math.round(65 + g * 121)})`;
    }

    const useFixed = btn.releasePhase === 'releasing' || btn.releasePhase === 'glowing';

    let ci = 0;
    for (let i = 0; i < topB.length; i++, ci++)
        drawChar(ctx, topB[i], sl + i * cw, st, useFixed ? btn.z : getCharZWithReturn(btn, ci, elapsed), glowColor, FONT_SIZE, getCharRotWithReturn(btn, ci, elapsed));
    drawChar(ctx, ls, sl, st + lh, useFixed ? btn.z : getCharZWithReturn(btn, ci++, elapsed), glowColor, FONT_SIZE, getCharRotWithReturn(btn, ci - 1, elapsed));
    for (let i = 0; i < btn.label.length; i++, ci++)
        drawChar(ctx, btn.label[i], sl + cw + padX + i * cw, st + lh, useFixed ? btn.z : getCharZWithReturn(btn, ci, elapsed), glowColor, FONT_SIZE, getCharRotWithReturn(btn, ci, elapsed));
    drawChar(ctx, rs, sl + borderWidth - cw, st + lh, useFixed ? btn.z : getCharZWithReturn(btn, ci++, elapsed), glowColor, FONT_SIZE, getCharRotWithReturn(btn, ci - 1, elapsed));
    for (let i = 0; i < botB.length; i++, ci++)
        drawChar(ctx, botB[i], sl + i * cw, st + lh * 2, useFixed ? btn.z : getCharZWithReturn(btn, ci, elapsed), glowColor, FONT_SIZE, getCharRotWithReturn(btn, ci, elapsed));

    ctx.globalAlpha = 1;
    btn.rect = btn.fullRect = { x: sl, y: st, w: borderWidth, h: totalHeight };
}

// Total number of typed characters in a button (draw order:
// top border, left bar, label, right bar, bottom border).
export function buttonCharCount(btn, FONT_SIZE) {
    const cw = charWidth(FONT_SIZE);
    const labelW = btn.label.length * cw;
    const padX = cw * 2;
    const innerWidth = labelW + padX * 2;
    const dashCount = Math.floor(innerWidth / cw);
    return (dashCount + 2) * 2 + 2 + btn.label.length;
}

// Draw a single row of a button, revealing its first `n` characters
// left-to-right. rowIndex: 0 = top border, 1 = middle (| label |), 2 = bottom.
// Used by the row-based screen transition.
export function drawButtonRow(ctx, btn, rowIndex, n, FONT_SIZE) {
    if (n <= 0) return;

    ctx.font = `${FONT_SIZE}px "IBMVGA"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

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

    btn.rect = btn.fullRect = { x: sl, y: st, w: borderWidth, h: totalHeight };

    const color = btn.disabled ? '#007a1f' : '#00ff41';

    if (rowIndex === 1) {
        let drawn = 0;
        if (drawn < n) { drawChar(ctx, '|', sl, st + lh, Z_FLOAT_MIN, color, FONT_SIZE); drawn++; }
        for (let i = 0; i < btn.label.length && drawn < n; i++, drawn++)
            drawChar(ctx, btn.label[i], sl + cw + padX + i * cw, st + lh, Z_FLOAT_MIN, color, FONT_SIZE);
        if (drawn < n) { drawChar(ctx, '|', sl + borderWidth - cw, st + lh, Z_FLOAT_MIN, color, FONT_SIZE); drawn++; }
    } else {
        const plusCount = Math.floor((dashCount / 2) * (btn.active ? 1 : btn.hoverProgress));
        let borderLine = '';
        for (let i = 0; i < dashCount; i++) {
            const fl = i, fr = dashCount - 1 - i;
            borderLine += (fl < plusCount || fr < plusCount ||
                (dashCount % 2 === 1 && i === Math.floor(dashCount / 2) && plusCount >= Math.floor(dashCount / 2)))
                ? '+' : '-';
        }
        const border = '+' + borderLine + '+';
        const y = rowIndex === 0 ? st : st + lh * 2;
        for (let i = 0; i < border.length && i < n; i++)
            drawChar(ctx, border[i], sl + i * cw, y, Z_FLOAT_MIN, color, FONT_SIZE);
    }

    ctx.globalAlpha = 1;
}

// Decompose a button into its 3 typeable rows (top border, middle, bottom
// border), each { y, x, cost, draw } for the row-based transition feed.
export function buttonRows(btn, FONT_SIZE) {
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
    const borderLen = dashCount + 2;
    const midLen = btn.label.length + 2;

    return [
        { y: st,            x: sl, cost: borderLen, draw: (ctx, n) => drawButtonRow(ctx, btn, 0, n, FONT_SIZE) },
        { y: st + lh,       x: sl, cost: midLen,    draw: (ctx, n) => drawButtonRow(ctx, btn, 1, n, FONT_SIZE) },
        { y: st + lh * 2,   x: sl, cost: borderLen, draw: (ctx, n) => drawButtonRow(ctx, btn, 2, n, FONT_SIZE) },
    ];
}

// Draw only the first `n` characters of a button, revealed in draw order.
// Used by the typeout intro and the screen-transition feed. Characters sit at
// the resting depth (Z_FLOAT_MIN); hover plus-marks animate live so the border
// state is continuous with drawButton once fully revealed.
export function drawButtonPartial(ctx, btn, n, elapsed, FONT_SIZE) {
    if (n <= 0) return;

    ctx.font = `${FONT_SIZE}px "IBMVGA"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

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

    btn.rect = btn.fullRect = { x: sl, y: st, w: borderWidth, h: totalHeight };

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
    const color = btn.disabled ? '#007a1f' : '#00ff41';

    let drawn = 0;
    for (let i = 0; i < topB.length && drawn < n; i++, drawn++)
        drawChar(ctx, topB[i], sl + i * cw, st, Z_FLOAT_MIN, color, FONT_SIZE);

    if (drawn < n) { drawChar(ctx, '|', sl, st + lh, Z_FLOAT_MIN, color, FONT_SIZE); drawn++; }
    for (let i = 0; i < btn.label.length && drawn < n; i++, drawn++)
        drawChar(ctx, btn.label[i], sl + cw + padX + i * cw, st + lh, Z_FLOAT_MIN, color, FONT_SIZE);
    if (drawn < n) { drawChar(ctx, '|', sl + borderWidth - cw, st + lh, Z_FLOAT_MIN, color, FONT_SIZE); drawn++; }

    for (let i = 0; i < botB.length && drawn < n; i++, drawn++)
        drawChar(ctx, botB[i], sl + i * cw, st + lh * 2, Z_FLOAT_MIN, color, FONT_SIZE);

    ctx.globalAlpha = 1;
}