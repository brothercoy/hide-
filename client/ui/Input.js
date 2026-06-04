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
        selecting: false
    };
}

export function drawInput(ctx, inp, elapsed, FONT_SIZE) {
    const FONT = `${FONT_SIZE}px "IBMVGA"`;
    ctx.font = FONT;

    const charWidth = ctx.measureText('M').width;
    const refTextWidth = ctx.measureText(inp.placeholder).width;
    const padX = charWidth * 2;
    const innerWidth = refTextWidth + padX * 2;
    const borderWidth = innerWidth + charWidth * 2;

    const lineHeight = FONT_SIZE;
    const totalHeight = lineHeight * 2.5;

    const yOffset = Math.sin(elapsed * 0.8 + inp.phase) * 0;
    const cy = inp.y + yOffset;
    const left = inp.x - borderWidth / 2;
    const top = cy - totalHeight / 2;

    const dashCount = Math.floor(innerWidth / charWidth);
    const topBorder    = '+' + '-'.repeat(dashCount) + '+';
    const bottomBorder = '+' + '-'.repeat(dashCount) + '+';

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = inp.focused ? '#00ff41' : '#007a1f';
    ctx.fillText(topBorder, left, top);
    ctx.fillText('|', left, top + lineHeight);
    ctx.fillText('|', left + borderWidth - charWidth, top + lineHeight);
    ctx.fillText(bottomBorder, left, top + lineHeight * 2);

    const textY = top + lineHeight;
    const totalTextWidth = ctx.measureText(inp.value).width;
    const centerX = left + borderWidth / 2;
    const textStartX = inp.value.length === 0
        ? centerX - charWidth / 2
        : centerX - totalTextWidth / 2;

    const hasSelection = inp.selStart !== inp.selEnd;

    if (hasSelection && inp.focused) {
        const selMin = Math.min(inp.selStart, inp.selEnd);
        const selMax = Math.max(inp.selStart, inp.selEnd);
        const selX = textStartX + ctx.measureText(inp.value.slice(0, selMin)).width;
        const selW = ctx.measureText(inp.value.slice(selMin, selMax)).width;
        ctx.fillStyle = '#00ff41';
        ctx.fillRect(selX, textY, selW, FONT_SIZE - 4);
        ctx.fillStyle = 'black';
        ctx.fillText(inp.value.slice(selMin, selMax), selX, textY);
        ctx.fillStyle = '#00ff41';
        ctx.fillText(inp.value.slice(0, selMin), textStartX, textY);
        ctx.fillText(inp.value.slice(selMax), selX + selW, textY);
    } else if (inp.value.length === 0 && !inp.focused) {
        ctx.fillStyle = '#003d0f';
        ctx.textAlign = 'center';
        ctx.fillText(inp.placeholder, centerX, textY);
        ctx.textAlign = 'left';
    } else {
        ctx.fillStyle = inp.focused ? '#00ff41' : '#007a1f';
        ctx.fillText(inp.value, textStartX, textY);
    }

    if (inp.focused && inp.cursorVisible && !hasSelection) {
        const cursorX = textStartX + ctx.measureText(inp.value.slice(0, inp.cursorPos)).width;
        const cursorW = charWidth - 3;
        ctx.fillStyle = '#00ff41';
        ctx.fillRect(cursorX, textY, cursorW, FONT_SIZE - 4);
        const charUnder = inp.value[inp.cursorPos];
        if (charUnder) {
            ctx.fillStyle = 'black';
            ctx.fillText(charUnder, cursorX, textY);
        }
    }

    inp.rect = { x: left, y: top, w: borderWidth, h: totalHeight, textStartX, charWidth };
}