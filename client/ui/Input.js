import { otFont, charWidth } from './Font.js';
import { getCharZ, drawChar, Z_FLOAT_MIN, CHAR_ROT_MAX, CHAR_ROT_SPEED } from './Button.js';

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
    const borderColor = inp.focused ? '#00ff41' : '#007a1f';

    const hasSelection = inp.selStart !== inp.selEnd;
    const totalTextWidth = inp.value.length * cw;
    const textStartX = inp.value.length === 0 ? centerX - cw/2 : centerX - totalTextWidth/2;

    // Draw cursor rectangle before text (like selection rectangle)
    if (inp.focused && inp.cursorVisible && !hasSelection) {
        const cursorX = textStartX + inp.cursorPos * cw;
        const refGlyph = otFont.charToGlyph('M');
        const refScale = FONT_SIZE / otFont.unitsPerEm;
        const refBbox = refGlyph.getBoundingBox();
        const glyphTop = (textY + FONT_SIZE) - refBbox.y2 * refScale;
        const glyphH = (refBbox.y2 - refBbox.y1) * refScale;
        const extendAmount = 6;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#00ff41';
        ctx.fillRect(cursorX, glyphTop - extendAmount, cw - 2, glyphH + extendAmount * 2);
    }

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

    if (inp.value.length === 0 && !inp.focused) {
        const phW = inp.placeholder.length * cw;
        const phX = centerX - phW / 2;
        for (let i = 0; i < inp.placeholder.length; i++, ci++) {
            rotAngle = Math.sin(elapsed * CHAR_ROT_SPEED + inp.phase + ci * 0.7 + Math.PI) * CHAR_ROT_MAX;
            drawChar(ctx, inp.placeholder[i], phX + i*cw, textY, getCharZ(inp.phase + ci * 0.7, inp.z, elapsed), '#003d0f', FONT_SIZE, rotAngle);
        }
    } else if (hasSelection && inp.focused) {
        const selMin = Math.min(inp.selStart, inp.selEnd);
        const selMax = Math.max(inp.selStart, inp.selEnd);
        const selX = textStartX + selMin * cw;
        const selW = (selMax - selMin + 1) * cw;
        const refGlyph2 = otFont.charToGlyph('M');
        const refScale2 = FONT_SIZE / otFont.unitsPerEm;
        const refBbox2 = refGlyph2.getBoundingBox();
        const selTop = (textY + FONT_SIZE) - refBbox2.y2 * refScale2;
        const selH = (refBbox2.y2 - refBbox2.y1) * refScale2;
        const extendAmount = 6;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#00ff41';
        ctx.fillRect(selX, selTop - extendAmount, selW, selH + extendAmount * 2);
        for (let i = 0; i < inp.value.length; i++, ci++) {
            const isSel = i >= selMin && i <= selMax;
            rotAngle = Math.sin(elapsed * CHAR_ROT_SPEED + inp.phase + ci * 0.7 + Math.PI) * CHAR_ROT_MAX;
            drawChar(ctx, inp.value[i], textStartX + i*cw, textY, getCharZ(inp.phase + ci * 0.7, inp.z, elapsed), isSel ? 'black' : '#00ff41', FONT_SIZE, rotAngle);
        }
    } else {
        const color = inp.focused ? '#00ff41' : '#007a1f';
        for (let i = 0; i < inp.value.length; i++, ci++) {
            const charColor = inp.focused && inp.cursorVisible && i === inp.cursorPos ? 'black' : color;
            rotAngle = Math.sin(elapsed * CHAR_ROT_SPEED + inp.phase + ci * 0.7 + Math.PI) * CHAR_ROT_MAX;
            drawChar(ctx, inp.value[i], textStartX + i*cw, textY, getCharZ(inp.phase + ci * 0.7, inp.z, elapsed), charColor, FONT_SIZE, rotAngle);
        }
    }

    ctx.globalAlpha = 1;
    inp.rect = { x: sl, y: st, w: borderWidth, h: totalHeight, textStartX, charWidth: cw };
}