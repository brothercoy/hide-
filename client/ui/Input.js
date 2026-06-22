import { otFont, charWidth } from './Font.js';
import { getCharZ, drawChar, Z_FLOAT_MIN, CHAR_ROT_MAX, CHAR_ROT_SPEED } from './Button.js';
import { theme, dim, placeholderColor } from './colors.js';

export function makeInput(placeholder, x, y, maxLength) {
    return {
        placeholder, x, y, maxLength,
        value: '',
        focused: false,
        rect: null,
        phase: Math.random() * Math.PI * 2,
        cursorVisible: true,
        lastBlink: performance.now(),
        cursorPos: 0,
        selStart: 0,
        selEnd: 0,
        selecting: false,
        z: Z_FLOAT_MIN,
        zPressed: false
    };
}

export function drawInput(ctx, inp, elapsed, FONT_SIZE) {
    if (!otFont) return;

    const cw = charWidth(FONT_SIZE);
    const refW = inp.placeholder.length * cw;
    const padX = cw * 2;
    const innerWidth = refW + padX * 2;
    const borderWidth = innerWidth + cw * 2;
    const lh = FONT_SIZE;
    const totalHeight = lh * 2.5;
    const sl = inp.x - borderWidth / 2;
    const st = inp.y - totalHeight / 2;
    const textY = st + lh;
    const centerX = sl + borderWidth / 2;
    const dashCount = Math.floor(innerWidth / cw);
    const topB = '+' + '-'.repeat(dashCount) + '+';
    const botB = '+' + '-'.repeat(dashCount) + '+';
    const borderColor = inp.focused ? theme.fg : dim();

    let ci = 0;
    for (let i = 0; i < topB.length; i++, ci++) {
        const rotAngle = Math.sin(elapsed * CHAR_ROT_SPEED + inp.phase + ci * 0.7 + Math.PI) * CHAR_ROT_MAX;
        drawChar(ctx, topB[i], sl+i*cw, st, getCharZ(inp.phase + ci * 0.7, inp.z, elapsed), borderColor, FONT_SIZE, rotAngle);
    }
    let rotAngle = Math.sin(elapsed * CHAR_ROT_SPEED + inp.phase + ci * 0.7 + Math.PI) * CHAR_ROT_MAX;
    drawChar(ctx, '|', sl, textY, getCharZ(inp.phase + ci * 0.7, inp.z, elapsed), borderColor, FONT_SIZE, rotAngle); ci++;
    rotAngle = Math.sin(elapsed * CHAR_ROT_SPEED + inp.phase + ci * 0.7 + Math.PI) * CHAR_ROT_MAX;
    drawChar(ctx, '|', sl+borderWidth-cw, textY, getCharZ(inp.phase + ci * 0.7, inp.z, elapsed), borderColor, FONT_SIZE, rotAngle); ci++;
    for (let i = 0; i < botB.length; i++, ci++) {
        rotAngle = Math.sin(elapsed * CHAR_ROT_SPEED + inp.phase + ci * 0.7 + Math.PI) * CHAR_ROT_MAX;
        drawChar(ctx, botB[i], sl+i*cw, st+lh*2, getCharZ(inp.phase + ci * 0.7, inp.z, elapsed), borderColor, FONT_SIZE, rotAngle);
    }

    const textStartX = drawInputContent(ctx, inp, FONT_SIZE, elapsed, sl, borderWidth, textY, cw);

    ctx.globalAlpha = 1;
    inp.rect = { x: sl, y: st, w: borderWidth, h: totalHeight, textStartX, charWidth: cw };
}

// Draw the input's interior: cursor, then placeholder OR value (with selection).
// Shared by drawInput (steady) and drawInputRow (transition feed) so a focused
// input shows its live value + cursor while it's still scrolling in.
function drawInputContent(ctx, inp, FONT_SIZE, elapsed, sl, borderWidth, textY, cw) {
    const centerX = sl + borderWidth / 2;
    const hasSelection = inp.selStart !== inp.selEnd;
    const totalTextWidth = inp.value.length * cw;
    const textStartX = inp.value.length === 0 ? centerX - cw / 2 : centerX - totalTextWidth / 2;
    const z = getCharZ(inp.phase, inp.z, elapsed);

    if (inp.focused && inp.cursorVisible && !hasSelection) {
        const cursorX = textStartX + inp.cursorPos * cw;
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.fg;
        ctx.fillRect(cursorX, textY, cw - 2, FONT_SIZE - 4);
    }

    if (inp.value.length === 0 && !inp.focused) {
        const phX = centerX - (inp.placeholder.length * cw) / 2;
        for (let i = 0; i < inp.placeholder.length; i++)
            drawChar(ctx, inp.placeholder[i], phX + i * cw, textY, z, placeholderColor(), FONT_SIZE);
    } else if (hasSelection && inp.focused) {
        const selMin = Math.min(inp.selStart, inp.selEnd);
        const selMax = Math.max(inp.selStart, inp.selEnd);
        const selX = textStartX + selMin * cw;
        const selW = (selMax - selMin + 1) * cw;
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.fg;
        ctx.fillRect(selX, textY, selW, FONT_SIZE - 4);
        for (let i = 0; i < inp.value.length; i++) {
            const isSel = i >= selMin && i <= selMax;
            drawChar(ctx, inp.value[i], textStartX + i * cw, textY, z, isSel ? theme.bg : theme.fg, FONT_SIZE);
        }
    } else {
        const color = inp.focused ? theme.fg : dim();
        for (let i = 0; i < inp.value.length; i++) {
            const charColor = inp.focused && inp.cursorVisible && i === inp.cursorPos ? theme.bg : color;
            drawChar(ctx, inp.value[i], textStartX + i * cw, textY, z, charColor, FONT_SIZE);
        }
    }
    ctx.globalAlpha = 1;
    return textStartX;
}

// Total typed characters in an input's frame (border + side bars + placeholder).
export function inputCharCount(inp, FONT_SIZE) {
    const cw = charWidth(FONT_SIZE);
    const refW = inp.placeholder.length * cw;
    const padX = cw * 2;
    const innerWidth = refW + padX * 2;
    const dashCount = Math.floor(innerWidth / cw);
    return (dashCount + 2) * 2 + 2 + inp.placeholder.length;
}

// Draw a single row of an input's frame, first `n` chars left-to-right.
// rowIndex: 0 = top border, 1 = middle, 2 = bottom border. Reflects live focus
// and value/cursor so a focused input is usable while it scrolls in.
export function drawInputRow(ctx, inp, rowIndex, n, FONT_SIZE, elapsed = 0) {
    if (!otFont || n <= 0) return;

    const cw = charWidth(FONT_SIZE);
    const refW = inp.placeholder.length * cw;
    const padX = cw * 2;
    const innerWidth = refW + padX * 2;
    const borderWidth = innerWidth + cw * 2;
    const lh = FONT_SIZE;
    const totalHeight = lh * 2.5;
    const sl = inp.x - borderWidth / 2;
    const st = inp.y - totalHeight / 2;
    const textY = st + lh;
    const centerX = sl + borderWidth / 2;
    const dashCount = Math.floor(innerWidth / cw);
    const borderColor = inp.focused ? theme.fg : dim();
    const z = getCharZ(inp.phase, inp.z, elapsed);

    // Consistent across all 3 rows so the cursor hit-test (textStartX) is stable.
    const textStartX = inp.value.length === 0 ? centerX - cw / 2 : centerX - (inp.value.length * cw) / 2;
    inp.rect = { x: sl, y: st, w: borderWidth, h: totalHeight, textStartX, charWidth: cw };

    if (rowIndex === 1) {
        const midLen = inp.placeholder.length + 2; // | + placeholder + |
        if (n >= 1) drawChar(ctx, '|', sl, textY, z, borderColor, FONT_SIZE);
        if (inp.focused || inp.value.length > 0) {
            // Live interior — usable while still scrolling in.
            drawInputContent(ctx, inp, FONT_SIZE, elapsed, sl, borderWidth, textY, cw);
        } else {
            const phX = centerX - (inp.placeholder.length * cw) / 2;
            let drawn = 1; // left bar already counted
            for (let i = 0; i < inp.placeholder.length && drawn < n; i++, drawn++)
                drawChar(ctx, inp.placeholder[i], phX + i * cw, textY, z, placeholderColor(), FONT_SIZE);
        }
        if (n >= midLen) drawChar(ctx, '|', sl + borderWidth - cw, textY, z, borderColor, FONT_SIZE);
    } else {
        const border = '+' + '-'.repeat(dashCount) + '+';
        const y = rowIndex === 0 ? st : st + lh * 2;
        for (let i = 0; i < border.length && i < n; i++)
            drawChar(ctx, border[i], sl + i * cw, y, z, borderColor, FONT_SIZE);
    }

    ctx.globalAlpha = 1;
}

// Decompose an input into its 3 typeable rows for the transition feed.
export function inputRows(inp, FONT_SIZE) {
    const cw = charWidth(FONT_SIZE);
    const refW = inp.placeholder.length * cw;
    const padX = cw * 2;
    const innerWidth = refW + padX * 2;
    const borderWidth = innerWidth + cw * 2;
    const lh = FONT_SIZE;
    const totalHeight = lh * 2.5;
    const sl = inp.x - borderWidth / 2;
    const st = inp.y - totalHeight / 2;
    const dashCount = Math.floor(innerWidth / cw);
    const borderLen = dashCount + 2;
    const midLen = inp.placeholder.length + 2;

    return [
        { y: st,          x: sl, cost: borderLen, draw: (ctx, n, elapsed) => drawInputRow(ctx, inp, 0, n, FONT_SIZE, elapsed) },
        { y: st + lh,     x: sl, cost: midLen,    draw: (ctx, n, elapsed) => drawInputRow(ctx, inp, 1, n, FONT_SIZE, elapsed) },
        { y: st + lh * 2, x: sl, cost: borderLen, draw: (ctx, n, elapsed) => drawInputRow(ctx, inp, 2, n, FONT_SIZE, elapsed) },
    ];
}

// Draw the first `n` characters of an input's frame, revealed in draw order
// (top border, side bars, bottom border, placeholder). Used by the transition
// feed; the live drawInput takes over once the screen is interactive.
export function drawInputPartial(ctx, inp, n, elapsed, FONT_SIZE) {
    if (!otFont || n <= 0) return;

    const cw = charWidth(FONT_SIZE);
    const refW = inp.placeholder.length * cw;
    const padX = cw * 2;
    const innerWidth = refW + padX * 2;
    const borderWidth = innerWidth + cw * 2;
    const lh = FONT_SIZE;
    const totalHeight = lh * 2.5;
    const sl = inp.x - borderWidth / 2;
    const st = inp.y - totalHeight / 2;
    const textY = st + lh;
    const centerX = sl + borderWidth / 2;
    const dashCount = Math.floor(innerWidth / cw);
    const topB = '+' + '-'.repeat(dashCount) + '+';
    const botB = '+' + '-'.repeat(dashCount) + '+';
    const borderColor = dim();

    inp.rect = { x: sl, y: st, w: borderWidth, h: totalHeight, textStartX: centerX - cw / 2, charWidth: cw };

    let drawn = 0;
    for (let i = 0; i < topB.length && drawn < n; i++, drawn++)
        drawChar(ctx, topB[i], sl + i * cw, st, Z_FLOAT_MIN, borderColor, FONT_SIZE);
    if (drawn < n) { drawChar(ctx, '|', sl, textY, Z_FLOAT_MIN, borderColor, FONT_SIZE); drawn++; }
    if (drawn < n) { drawChar(ctx, '|', sl + borderWidth - cw, textY, Z_FLOAT_MIN, borderColor, FONT_SIZE); drawn++; }
    for (let i = 0; i < botB.length && drawn < n; i++, drawn++)
        drawChar(ctx, botB[i], sl + i * cw, st + lh * 2, Z_FLOAT_MIN, borderColor, FONT_SIZE);

    const phX = centerX - (inp.placeholder.length * cw) / 2;
    for (let i = 0; i < inp.placeholder.length && drawn < n; i++, drawn++)
        drawChar(ctx, inp.placeholder[i], phX + i * cw, textY, Z_FLOAT_MIN, placeholderColor(), FONT_SIZE);

    ctx.globalAlpha = 1;
}