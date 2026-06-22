import { otFont, charWidth } from './Font.js';
import { getCharZ, drawChar, Z_FLOAT_MIN, CHAR_ROT_MAX, CHAR_ROT_SPEED } from './Button.js';
import { theme, dim } from './colors.js';

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

const TRACK_CELLS = 20;             // draggable cells between the end bars
const TRACK_CHARS = TRACK_CELLS + 2; // '|' + cells + '|'

// Build the track character array for the current value.
function trackChars(s) {
    const t = (s.value - s.min) / (s.max - s.min);
    const handlePos = Math.min(Math.floor(t * TRACK_CELLS), TRACK_CELLS - 2);
    const chars = ['|'];
    for (let i = 0; i < TRACK_CELLS; i++) {
        if (i === handlePos) chars.push('[');
        else if (i === handlePos + 1) chars.push(']');
        else chars.push(i < handlePos ? '=' : '-');
    }
    chars.push('|');
    return chars;
}

// Centering: the whole element is centered on s.x using the track bar width.
// The label/value line is centered independently on the same x, so title and
// bar share a center.
function sliderLayout(s, FONT_SIZE) {
    const cw = charWidth(FONT_SIZE);
    const labelStr = sliderLabelStr(s);
    return {
        cw,
        labelStr,
        trackLeft: s.x - (TRACK_CHARS * cw) / 2,
        labelLeft: s.x - (labelStr.length * cw) / 2,
    };
}

function setSliderRect(s, FONT_SIZE) {
    const { cw, trackLeft } = sliderLayout(s, FONT_SIZE);
    s.rect = {
        x: trackLeft, y: s.y - FONT_SIZE / 2, w: TRACK_CHARS * cw, h: FONT_SIZE * 2,
        totalChars: TRACK_CELLS, left: trackLeft + cw, trackWidth: TRACK_CELLS * cw,
    };
}

export function drawSlider(ctx, s, elapsed, FONT_SIZE) {
    if (!otFont) return;

    const { cw, labelStr, trackLeft, labelLeft } = sliderLayout(s, FONT_SIZE);
    const chars = trackChars(s);
    const color = s.disabled ? dim() : theme.fg;

    // Centered label/value via opentype
    ctx.globalAlpha = 1;
    const labelPath = otFont.getPath(labelStr, labelLeft, s.y, FONT_SIZE);
    labelPath.fill = color;
    labelPath.draw(ctx);

    // Centered animated track
    for (let i = 0; i < chars.length; i++) {
        const rotAngle = Math.sin(elapsed * CHAR_ROT_SPEED + s.phase + i * 0.7 + Math.PI) * CHAR_ROT_MAX;
        drawChar(ctx, chars[i], trackLeft + i * cw, s.y,
            getCharZ(s.phase + i * 0.7, s.z, elapsed), color, FONT_SIZE, rotAngle);
    }

    ctx.globalAlpha = 1;
    setSliderRect(s, FONT_SIZE);
}

function sliderLabelStr(s) {
    return s.label + ': ' + s.value + (s.unit || '');
}

// Total typed characters in a slider (label text + track frame).
export function sliderCharCount(s, FONT_SIZE) {
    return sliderLabelStr(s).length + TRACK_CHARS; // label + track ('|' + cells + '|')
}

// A slider is two rows: the label/value title (drawn above s.y) and the track
// below it. Returns both { y, x, cost, draw } segments for the transition feed.
export function sliderRows(s, FONT_SIZE) {
    const { labelStr, trackLeft, labelLeft } = sliderLayout(s, FONT_SIZE);
    return [
        { y: s.y - FONT_SIZE, x: labelLeft, cost: labelStr.length, draw: (ctx, n) => drawSliderLabel(ctx, s, n, FONT_SIZE) },
        { y: s.y,             x: trackLeft, cost: TRACK_CHARS,      draw: (ctx, n) => drawSliderTrack(ctx, s, n, FONT_SIZE) },
    ];
}

// Title row: the first `n` characters of "LABEL: value" via opentype path.
export function drawSliderLabel(ctx, s, n, FONT_SIZE) {
    if (!otFont || n <= 0) return;
    const { labelStr, labelLeft } = sliderLayout(s, FONT_SIZE);
    const shown = Math.min(labelStr.length, n);
    if (shown > 0) {
        ctx.globalAlpha = 1;
        const path = otFont.getPath(labelStr.slice(0, shown), labelLeft, s.y, FONT_SIZE);
        path.fill = s.disabled ? dim() : theme.fg;
        path.draw(ctx);
    }
}

// Track row: the first `n` characters of the slider track ('|' + cells + '|').
export function drawSliderTrack(ctx, s, n, FONT_SIZE) {
    if (!otFont || n <= 0) return;
    const { cw, trackLeft } = sliderLayout(s, FONT_SIZE);
    const chars = trackChars(s);
    const color = s.disabled ? dim() : theme.fg;
    for (let i = 0; i < chars.length && i < n; i++)
        drawChar(ctx, chars[i], trackLeft + i * cw, s.y, Z_FLOAT_MIN, color, FONT_SIZE);

    ctx.globalAlpha = 1;
    setSliderRect(s, FONT_SIZE);
}