import { makeButton, drawButton } from '../ui/Button.js';
import { makeInput, drawInput } from '../ui/Input.js';

const FONT_SIZE = 32;

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

    enter() {
        this.ui.clear();

        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        this.nameInput = makeInput('ENTER NAME', cx, cy - 200, 12);
        this.codeInput = makeInput('ROOM CODE', cx, cy + 80, 6);

        this.ui.inputs.push(this.nameInput);
        this.ui.inputs.push(this.codeInput);

        this.ui.buttons.push(makeButton('QUICK JOIN', cx, cy - 80, () => this.onQuickJoin(this.nameInput.value), { blocksInput: true }));
        this.ui.buttons.push(makeButton('CREATE ROOM', cx, cy, () => this.onCreateRoom(this.nameInput.value), { blocksInput: true }));
        this.ui.buttons.push(makeButton('JOIN ROOM', cx, cy + 160, () => this.onJoinRoom(this.nameInput.value, this.codeInput.value), { blocksInput: true }));
        this.ui.buttons.push(makeButton('BACK', cx, cy + 280, () => this.onBack(), { blocksInput: true }));
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;

        ctx.fillStyle = '#00ff41';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `96px "IBMVGA"`;
        ctx.fillText('HIDE', cx, 80);

        this.ui.inputs.forEach(inp => {
            drawInput(ctx, inp, this.ui.elapsed, FONT_SIZE);
        });

        this.ui.buttons.forEach(btn => {
            drawButton(ctx, btn, this.ui.elapsed, FONT_SIZE);
        });
    }
}