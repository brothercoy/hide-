import { otFont, charWidth } from './Font.js';
import { getCharZ, drawChar, Z_FLOAT_MIN } from './Button.js';

export function makeSlider(label, x, y, min, max, defaultValue, onChange, disabled = false, unit = '') {
    return {
        label, x, y, min, max,
        value: defaultValue,
        rect: null,
        phase: Math.random() * Math.PI * 2,
        onChange: onChange || null,
        disabled,
        unit,
        z: Z_FLOAT_MIN
    };
}

export function drawSlider(ctx, s, elapsed, FONT_SIZE) {
    if (!otFont) return;

    const cw = charWidth(FONT_SIZE);
    const totalChars = 20;
    const trackWidth = totalChars * cw;
    const totalWidth = trackWidth + cw * 4;
    const left = s.x - totalWidth / 2;

    const t = (s.value - s.min) / (s.max - s.min);
    const handlePos = Math.min(Math.floor(t * totalChars), totalChars - 2);

    const chars = ['|'];
    for (let i = 0; i < totalChars; i++) {
        if (i === handlePos) chars.push('[');
        else if (i === handlePos + 1) chars.push(']');
        else chars.push(i < handlePos ? '=' : '-');
    }
    chars.push('|');

    // Static label via opentype
    ctx.globalAlpha = 1;
    const labelPath = otFont.getPath(
        s.label + ': ' + s.value + (s.unit || ''),
        left, s.y, FONT_SIZE
    );
    labelPath.fill = s.disabled ? '#007a1f' : '#00ff41';
    labelPath.draw(ctx);

    // Animated track
    const trackStartX = left - cw;
    for (let i = 0; i < chars.length; i++) {
        const color = s.disabled ? '#007a1f' : '#00ff41';
        drawChar(ctx, chars[i], trackStartX + i * cw, s.y,
            getCharZ(s.phase + i * 0.7, s.z, elapsed), color, FONT_SIZE);
    }

    ctx.globalAlpha = 1;

    s.rect = {
        x: left + cw,
        y: s.y - FONT_SIZE / 2,
        w: trackWidth + cw * 2,
        h: FONT_SIZE * 2,
        totalChars,
        left: left + cw,
        trackWidth
    };
}