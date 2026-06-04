const ANIM_DURATION = 333;

export function makeButton(label, x, y, onClick, options = {}) {
    return {
        label, x, y, onClick,
        hoverProgress: 0,
        rect: null,
        phase: Math.random() * Math.PI * 2,
        isDefault: options.isDefault || false,
        active: options.active || false,
        disabled: options.disabled || false,
        plain: options.plain || false
    };
}

export function drawButton(ctx, btn, elapsed, FONT_SIZE) {
    const FONT = `${FONT_SIZE}px "IBMVGA"`;
    ctx.font = FONT;
    const color = btn.disabled ? '#007a1f' : '#00ff41';

    if (btn.plain) {
        const w = ctx.measureText(btn.label).width;
        const left = btn.x - w / 2;
        const top = btn.y - FONT_SIZE / 2;
        ctx.fillStyle = btn.disabled ? '#007a1f' : (btn.hoverProgress > 0.05 ? '#00ff41' : '#00aa2a');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(btn.label, left, top);
        btn.rect = { x: left, y: top, w, h: FONT_SIZE };
        return;
    }

    const charWidth = ctx.measureText('M').width;
    const textWidth = ctx.measureText(btn.label).width;
    const padX = charWidth * 2;
    const innerWidth = textWidth + padX * 2;
    const borderWidth = innerWidth + charWidth * 2;

    const lineHeight = FONT_SIZE;
    const totalHeight = lineHeight * 2.5;

    const yOffset = Math.sin(elapsed * 0.8 + btn.phase) * 0;
    const left = btn.x - borderWidth / 2;
    const top = (btn.y + yOffset) - totalHeight / 2;

    const dashCount = Math.floor(innerWidth / charWidth);
    const plusCount = Math.floor((dashCount / 2) * (btn.active ? 1 : btn.hoverProgress));

    let borderLine = '';
    for (let i = 0; i < dashCount; i++) {
        const fromLeft = i;
        const fromRight = dashCount - 1 - i;
        if (fromLeft < plusCount || fromRight < plusCount ||
            (dashCount % 2 === 1 && i === Math.floor(dashCount / 2) && plusCount >= Math.floor(dashCount / 2))) {
            borderLine += '+';
        } else {
            borderLine += '-';
        }
    }

    const topBorder    = '+' + borderLine + '+';
    const bottomBorder = '+' + borderLine + '+';

    ctx.fillStyle = color;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillText(topBorder, left, top);
    const leftSide = btn.active ? (Math.floor(Date.now() / 500) % 2 === 0 ? '}' : ' ') : '|';
    const rightSide = btn.active ? (Math.floor(Date.now() / 500) % 2 === 0 ? '{' : ' ') : '|';
    ctx.fillText(leftSide, left, top + lineHeight);
    ctx.fillText(btn.label, left + charWidth + padX, top + lineHeight);
    ctx.fillText(rightSide, left + borderWidth - charWidth, top + lineHeight);
    ctx.fillText(bottomBorder, left, top + lineHeight * 2);

    btn.rect = { x: left, y: top, w: borderWidth, h: totalHeight };
}