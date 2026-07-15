import { makeButton, drawButton, buttonRows } from '../ui/Button.js';
import { makeInput, drawInput, inputRows } from '../ui/Input.js';
import { charWidth } from '../ui/Font.js';
import { textRow } from '../ui/Transition.js';
import { theme } from '../ui/colors.js';
import { bandTop } from '../ui/viewport.js';

const NAME_FONT_SIZE = 80;  // font size for the name input — bigger than rest
const FONT_SIZE = 54;       // font size for everything else

// Layout constants — tweak to adjust positioning
const NAME_Y       = 260;  // vertical center of name input
const BTN_ROW_GAP  = 100;   // gap between name input bottom and QUICK JOIN / CREATE ROOM row
const BTN_PAIR_GAP = 60;   // horizontal gap between QUICK JOIN and CREATE ROOM
const CODE_ROW_GAP = 40;   // gap between button row bottom and ROOM CODE / JOIN ROOM row
const COLON_GAP    = 20;   // horizontal gap on each side of the : separator

export class PlayScreen {
    constructor(canvas, ctx, uiManager, onQuickJoin, onCreateRoom, onJoinRoom, onBack) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ui = uiManager;
        this.onQuickJoin = onQuickJoin;
        this.onCreateRoom = onCreateRoom;
        this.onJoinRoom = onJoinRoom;
        this.onBack = onBack;
        this.nameInput = null;
        this.codeInput = null;
    }

    _btnWidth(label) {
        const cw = charWidth(FONT_SIZE);
        const labelW = label.length * cw;
        const padX = cw * 2;
        const innerWidth = labelW + padX * 2;
        return innerWidth + cw * 2;
    }

    _inputWidth(placeholder, fontSize) {
        const cw = charWidth(fontSize);
        const refW = placeholder.length * cw;
        const padX = cw * 2;
        const innerWidth = refW + padX * 2;
        return innerWidth + cw * 2;
    }

    // The row Y positions. This screen is laid out from the top (NAME_Y down), so all
    // positions scale by vScale to redistribute proportionally with the window height
    // (=== 1 at the load height, so unchanged there).
    _layoutY() {
        // Top-anchored: offset every row by bandTop so the whole screen sits inside the
        // guaranteed-visible band (nothing crops when maximized). At full height bandTop === 0.
        const bt = bandTop(this.canvas);
        const btnH = FONT_SIZE * 2.5;
        const nameH = NAME_FONT_SIZE * 2.5;
        const btnRowY = NAME_Y + nameH / 2 + btnH / 2 + BTN_ROW_GAP;
        const codeRowY = btnRowY + btnH + CODE_ROW_GAP;
        return { nameY: bt + NAME_Y, btnRowY: bt + btnRowY, codeRowY: bt + codeRowY };
    }

    enter() {
        this.ui.clear();

        const cx = this.canvas.width / 2;
        const { nameY, btnRowY, codeRowY } = this._layoutY();

        // Name input — larger font. Pre-fill with the name saved for this browser
        // instance (sessionStorage), so returning here keeps it filled.
        this.nameInput = makeInput('ENTER NAME', cx, nameY, 12);
        this.nameInput.fontSize = NAME_FONT_SIZE;
        const savedName = sessionStorage.getItem('playerName');
        if (savedName) {
            this.nameInput.value = savedName.slice(0, this.nameInput.maxLength);
            this.nameInput.cursorPos = this.nameInput.value.length;
        }
        this.ui.inputs.push(this.nameInput);

        // QUICK JOIN + CREATE ROOM side by side, centered
        const qjW = this._btnWidth('QUICK JOIN');
        const crW = this._btnWidth('CREATE ROOM');

        // Gap between buttons is centered on cx
        const qjX = cx - BTN_PAIR_GAP / 2 - qjW / 2;
        const crX = cx + BTN_PAIR_GAP / 2 + crW / 2;

        this.ui.buttons.push(makeButton('QUICK JOIN',  qjX, btnRowY, () => this.onQuickJoin(this.nameInput.value),  { blocksInput: true, disabled: true }));   // not implemented yet — dimmed + non-interactive
        this.ui.buttons.push(makeButton('CREATE ROOM', crX, btnRowY, () => this.onCreateRoom(this.nameInput.value), { blocksInput: true }));

        // ROOM CODE input + JOIN ROOM button side by side with : between them
        const codeW = this._inputWidth('ROOM CODE', FONT_SIZE);
        const jrW   = this._btnWidth('JOIN ROOM');
        const cw    = charWidth(FONT_SIZE);
        const colonW = cw; // : is one character wide
        const rowTotalW = codeW + COLON_GAP + colonW + COLON_GAP + jrW;
        const rowLeft = cx - rowTotalW / 2;

        const codeX = rowLeft + codeW / 2;
        const joinX = rowLeft + codeW + COLON_GAP + colonW + COLON_GAP + jrW / 2;

        this.codeInput = makeInput('ROOM CODE', codeX, codeRowY, 6);
        this.ui.inputs.push(this.codeInput);

        this.ui.buttons.push(makeButton('JOIN ROOM', joinX, codeRowY, () => this.onJoinRoom(this.nameInput.value, this.codeInput.value), { blocksInput: true }));

        // Store colon position for drawing
        this.colonX = rowLeft + codeW + COLON_GAP;
        this.colonY = codeRowY;
        this.codeRowY = codeRowY;
    }

    // Re-place inputs/buttons/colon for a new canvas height (resize re-fit), in place.
    relayout() {
        const { nameY, btnRowY, codeRowY } = this._layoutY();
        if (this.nameInput) this.nameInput.y = nameY;
        if (this.codeInput) this.codeInput.y = codeRowY;
        const qj = this.ui.buttons.find(b => b.label === 'QUICK JOIN');
        const cr = this.ui.buttons.find(b => b.label === 'CREATE ROOM');
        const jr = this.ui.buttons.find(b => b.label === 'JOIN ROOM');
        if (qj) qj.y = btnRowY;
        if (cr) cr.y = btnRowY;
        if (jr) jr.y = codeRowY;
        this.colonY = codeRowY;
        this.codeRowY = codeRowY;
    }

    // Flat list of row segments for the transition feed. Segments sharing a Y
    // (e.g. QUICK JOIN + CREATE ROOM borders) are grouped into one row and typed
    // left-to-right by the Transition engine.
    getTypeables() {
        const [quickJoin, createRoom, joinRoom] = this.ui.buttons;
        // Group the colon with the middle row of the code input / JOIN ROOM button.
        const codeMidY = this.codeRowY - (FONT_SIZE * 2.5) / 2 + FONT_SIZE;
        return [
            ...inputRows(this.nameInput, NAME_FONT_SIZE),
            ...buttonRows(quickJoin, FONT_SIZE),
            ...buttonRows(createRoom, FONT_SIZE),
            ...inputRows(this.codeInput, FONT_SIZE),
            textRow(':', this.colonX, this.codeRowY + 9, `${FONT_SIZE}px "IBMVGA"`, 'left', 'middle', theme.fg, codeMidY),
            ...buttonRows(joinRoom, FONT_SIZE),
        ];
    }

    draw() {
        const ctx = this.ctx;

        // Draw name input at its own font size
        const nameInp = this.nameInput;
        if (nameInp) drawInput(ctx, nameInp, this.ui.elapsed, NAME_FONT_SIZE);

        // Draw code input at standard font size
        if (this.codeInput) drawInput(ctx, this.codeInput, this.ui.elapsed, FONT_SIZE);

        // Draw : between code input and join room button
        if (this.colonX !== undefined) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = theme.fg;
            ctx.font = `${FONT_SIZE}px "IBMVGA"`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(':', this.colonX, this.codeRowY + 9); // increase offset to lower colon
        }

        this.ui.buttons.forEach(btn => drawButton(ctx, btn, this.ui.elapsed, FONT_SIZE));
    }
}