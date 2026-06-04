export function makeSlider(label, x, y, min, max, defaultValue, onChange, disabled = false, unit = '') {
    return {
        label, x, y, min, max,
        value: defaultValue,
        rect: null,
        phase: Math.random() * Math.PI * 2,
        onChange: onChange || null,
        disabled,
        unit
    };
}

export function drawSlider(ctx, s, elapsed, FONT_SIZE) {
    const FONT = `${FONT_SIZE}px "IBMVGA"`;
    ctx.font = FONT;

    const charWidth = ctx.measureText('M').width;
    const totalChars = 20;
    const trackWidth = totalChars * charWidth;
    const totalWidth = trackWidth + charWidth * 4;
    const left = s.x - totalWidth / 2;

    const yOffset = Math.sin(elapsed * 0.8 + s.phase) * 0;
    const cy = s.y + yOffset;

    const t = (s.value - s.min) / (s.max - s.min);
    const handlePos = Math.floor(t * totalChars);

    let track = '';
    for (let i = 0; i < totalChars; i++) track += i < handlePos ? '=' : '-';

    const leftPart = track.slice(0, handlePos);
    const rightPart = track.slice(handlePos);
    const full = '|' + leftPart + '[]' + rightPart + '|';

    ctx.fillStyle = s.disabled ? '#007a1f' : '#00ff41';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillText(s.label + ': ' + s.value + (s.unit || ''), left, cy - FONT_SIZE);
    ctx.fillText(full, left, cy);

    s.rect = {
        x: left + charWidth,
        y: cy - FONT_SIZE / 2,
        w: trackWidth + charWidth * 2,
        h: FONT_SIZE * 2,
        totalChars,
        left: left + charWidth,
        trackWidth
    };
}