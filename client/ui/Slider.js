import { otFont, charWidth } from './Font.js';
import { getCharZ, drawChar, Z_FLOAT_MIN, CHAR_ROT_MAX, CHAR_ROT_SPEED } from './Button.js';

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
        const rotAngle = Math.sin(elapsed * CHAR_ROT_SPEED + s.phase + i * 0.7 + Math.PI) * CHAR_ROT_MAX;
        drawChar(ctx, chars[i], trackStartX + i * cw, s.y,
            getCharZ(s.phase + i * 0.7, s.z, elapsed), color, FONT_SIZE, rotAngle);
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

function sliderLabelStr(s) {
    return s.label + ': ' + s.value + (s.unit || '');
}

// Total typed characters in a slider (label text + track frame).
export function sliderCharCount(s, FONT_SIZE) {
    return sliderLabelStr(s).length + 22; // track: '|' + 20 cells + '|'
}

// A slider is two rows: the label/value title (drawn above s.y) and the track
// below it. Returns both { y, x, cost, draw } segments for the transition feed.
export function sliderRows(s, FONT_SIZE) {
    const cw = charWidth(FONT_SIZE);
    const totalWidth = 20 * cw + cw * 4;
    const left = s.x - totalWidth / 2;
    const labelStr = sliderLabelStr(s);
    return [
        { y: s.y - FONT_SIZE, x: left,      cost: labelStr.length, draw: (ctx, n) => drawSliderLabel(ctx, s, n, FONT_SIZE) },
        { y: s.y,             x: left - cw, cost: 22,               draw: (ctx, n) => drawSliderTrack(ctx, s, n, FONT_SIZE) },
    ];
}

// Title row: the first `n` characters of "LABEL: value" via opentype path.
export function drawSliderLabel(ctx, s, n, FONT_SIZE) {
    if (!otFont || n <= 0) return;
    const cw = charWidth(FONT_SIZE);
    const totalWidth = 20 * cw + cw * 4;
    const left = s.x - totalWidth / 2;
    const labelStr = sliderLabelStr(s);
    const shown = Math.min(labelStr.length, n);
    if (shown > 0) {
        ctx.globalAlpha = 1;
        const path = otFont.getPath(labelStr.slice(0, shown), left, s.y, FONT_SIZE);
        path.fill = s.disabled ? '#007a1f' : '#00ff41';
        path.draw(ctx);
    }
}

// Track row: the first `n` characters of the slider track ('|' + cells + '|').
export function drawSliderTrack(ctx, s, n, FONT_SIZE) {
    if (!otFont || n <= 0) return;
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

    const color = s.disabled ? '#007a1f' : '#00ff41';
    const trackStartX = left - cw;
    for (let i = 0; i < chars.length && i < n; i++)
        drawChar(ctx, chars[i], trackStartX + i * cw, s.y, Z_FLOAT_MIN, color, FONT_SIZE);

    ctx.globalAlpha = 1;
    s.rect = {
        x: left + cw, y: s.y - FONT_SIZE / 2, w: trackWidth + cw * 2, h: FONT_SIZE * 2,
        totalChars, left: left + cw, trackWidth
    };
}