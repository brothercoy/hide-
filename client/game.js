import { GAME_MODES } from '../gameModes.js';
import { Client } from '@colyseus/sdk';
import { UIManager } from './ui/UIManager.js';
import { MainMenu } from './screens/MainMenu.js';
import { PlayScreen } from './screens/PlayScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { GameScreen } from './screens/GameScreen.js';
import { makeButton, drawButton, zToAlpha } from './ui/Button.js';
import { theme, bgAlpha, glow } from './ui/colors.js';
import { initFont } from './ui/Font.js';
import { setBaseHeight } from './ui/viewport.js';
import { CRTEffect } from './CRTShader.js';
import { Transition } from './ui/Transition.js';
import { DELMode } from './modes/DELmode.js';

const colyseusClient = new Client(
    window.location.hostname === 'localhost'
        ? 'ws://localhost:3000'
        : 'wss://' + window.location.hostname
);

const isMobile = navigator.maxTouchPoints > 0;
const FONT_SIZE = isMobile ? 36 : 32;

let selectedMode = null;
let selectedSettings = {};
let room;
let currentMode = null;
let playerName = '';
let isHost = false;
let playerList = [];
let currentScreen = null;
let fontReady = false;
let lastDrawTime = 0;
let modalMessage = null;
let settingsPanelOpen = false;
let winnerId = null;
let leaveDestination = 'main'; // where to land after leaving a room (BACK from lobby → 'play')
let pendingLobbyEntry = false; // waiting for the room's initial state before typing the lobby in

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

// Logical resolution. Width is ALWAYS 1920 and shown 1:1 (a narrower window crops
// the sides — the anti-cheat crop; elements never scale horizontally). Height
// tracks the window's available height (capped at 1080): it re-fits when a resize
// settles (see the resize handler) so maximize/fullscreen fills with no bars, but
// it never reflows live while you drag. Mobile keeps the full 1080 scaled-to-fit,
// since its viewport can't be resized.
const LOGICAL_W = 1920;
let LOGICAL_H = isMobile ? 1080 : Math.min(window.innerHeight || 1080, 1080);
// The layout's reference height: gaps scale relative to this, so the load-time
// layout is untouched and only a later resize (fullscreen) redistributes.
setBaseHeight(LOGICAL_H);

function resizeCanvas() {
    canvas.width = LOGICAL_W;
    canvas.height = LOGICAL_H;
}

function applyDisplayRect(left, top, w, h) {
    for (const c of [canvas, crt.glCanvas]) {
        c.style.position = 'fixed';
        c.style.left = left + 'px';
        c.style.top = top + 'px';
        c.style.width = w + 'px';
        c.style.height = h + 'px';
    }
}

// Position the canvas and CRT overlay in the window.
function layoutDisplay() {
    const winW = window.innerWidth, winH = window.innerHeight;
    if (isMobile) {
        // Mobile can't resize its viewport, so scale-to-fit (contain) so the whole
        // scene is visible — cropping a phone down to a 1920×1080 slice is unplayable.
        const aspect = LOGICAL_W / LOGICAL_H;
        let w, h;
        if (winW / winH > aspect) { h = winH; w = Math.round(h * aspect); }
        else { w = winW; h = Math.round(w / aspect); }
        applyDisplayRect(Math.round((winW - w) / 2), Math.round((winH - h) / 2), w, h);
        return;
    }
    // Desktop: fixed 1:1 size, centered; the window crops any overflow (body is
    // overflow:hidden). left/top go negative when the window is smaller than 16:9.
    applyDisplayRect(
        Math.round((winW - LOGICAL_W) / 2),
        Math.round((winH - LOGICAL_H) / 2),
        LOGICAL_W, LOGICAL_H
    );
}

resizeCanvas();

// Reposition the canvas immediately on resize (keeps it centered while you drag),
// then — once the resize settles — re-fit the layout to the new window height so
// maximize/fullscreen fills with no bars and no manual refresh. Debounced so it
// snaps once when you finish rather than reflowing live mid-drag.
let _refitTimer = null;
window.addEventListener('resize', () => {
    layoutDisplay();
    clearTimeout(_refitTimer);
    _refitTimer = setTimeout(refitToWindow, 150);
});

function refitToWindow() {
    if (isMobile) return; // mobile is fixed 1080, scaled-to-fit
    const h = Math.min(window.innerHeight || 1080, 1080);
    if (h === LOGICAL_H) return;
    LOGICAL_H = h;
    resizeCanvas();      // applies canvas.height = LOGICAL_H (CRT re-sizes on next render)
    layoutDisplay();
    relayoutCurrentScreen();
}

// Reposition the current screen's layout for the new canvas height. Screens expose
// relayout() to move their center-relative elements IN PLACE — no re-enter, so input
// state, focus, the menu intro, and button animations are all preserved (re-entering
// MainMenu left input blocked, which killed its buttons). Top-anchored screens (play,
// lobby) don't move, so they need no relayout; the game recomputes every frame.
function relayoutCurrentScreen() {
    if (transition.isActive()) return; // mid-transition; positions are being animated
    const s = screens[currentScreen];
    if (s && typeof s.relayout === 'function') s.relayout();
}

const uiManager = new UIManager(canvas, ctx);
const transition = new Transition(canvas, ctx);

// Map screen names to their objects so the transition can drive them generically.
const screens = {};

const mainMenu = new MainMenu(canvas, ctx, uiManager,
    () => showScreen('play'),
    () => showScreen('settings')
);

const playScreen = new PlayScreen(canvas, ctx, uiManager,
    (name) => handleCreateRoom(name),
    (name) => handleCreateRoom(name),
    (name, code) => handleJoinRoom(name, code),
    () => showScreen('main')
);

const settingsScreen = new SettingsScreen(canvas, ctx, uiManager,
    () => showScreen('main')
);

const lobbyScreen = new LobbyScreen(canvas, ctx, uiManager,
    (mode, settings, customOpen) => {
        selectedMode = mode;
        selectedSettings = settings;
        if (room) room.send('updateSettings', { mode, settings, customOpen });
    },
    (targetId) => { if (room) room.send('makeHost', { targetId }); },
    () => {
        if (!selectedMode) { showModal('?INVALID GAME MODE'); return; }
        room.send('startGame', { mode: selectedMode, settings: selectedSettings });
    },
    () => { leaveDestination = 'play'; if (room) room.send('leaveToMenu'); },
    (message) => showModal(message)
);

const gameScreen = new GameScreen(canvas, ctx, isMobile);

screens.main = mainMenu;
screens.play = playScreen;
screens.settings = settingsScreen;
screens.lobby = lobbyScreen;

const crt = new CRTEffect(canvas);
canvas.style.opacity = '0';
canvas.style.display = 'block';
layoutDisplay();   // now that crt.glCanvas exists, size both into the window
crt.render(0);
uiManager.coordTransform = (x, y) => curveInverse(x, y);

function curveInverse(canvasRelX, canvasRelY) {
    // canvasRelX/Y are relative to the displayed (letterboxed) canvas rect, so
    // normalize by that rect — not the window — then undo the CRT curve and scale
    // to the fixed logical resolution.
    const gameRect = canvas.getBoundingClientRect();
    const u = canvasRelX / gameRect.width;
    const v = canvasRelY / gameRect.height;
    const c = crt.uniforms.curvature * 0.25;
    let cx = u * 2 - 1;
    let cy = v * 2 - 1;
    const dist = cx * cx + cy * cy;
    cx = cx * (1 + dist * c);
    cy = cy * (1 + dist * c);
    return {
        x: (cx * 0.5 + 0.5) * canvas.width,
        y: (cy * 0.5 + 0.5) * canvas.height
    };
}

function enterScreen(name, opts) {
    const s = screens[name];
    if (s) s.enter(opts);
}

function showScreen(name, opts = {}) {
    // Instant path: first paint, explicit request, or font not ready.
    if (currentScreen === null || opts.instant || !fontReady) {
        const firstPaint = currentScreen === null;
        currentScreen = name;
        enterScreen(name);
        // On the genuine first load into the menu, type the HUD in after the
        // main-menu intro (instead of showing it immediately).
        if (firstPaint && name === 'main') { hudIntroPending = true; hudIntroStart = null; }
        return;
    }

    // Navigating away cancels the first-load HUD type-in; the transition tail and
    // persistent HUD take over from here.
    hudIntroPending = false;

    // Snap any in-flight transition to its end before starting a new one.
    if (transition.isActive()) transition.cancelToEnd();

    // `canvas` currently holds the outgoing screen's last frame — snapshot it
    // inside transition.begin/beginScrollOnly before enter() clears anything.
    const incoming = screens[name];
    const onComplete = () => {
        if (!modalMessage) {
            uiManager.blocked = false;
            uiManager.lastTime = performance.now();
        }
    };

    if (!incoming || typeof incoming.getTypeables !== 'function') {
        // Scroll the outgoing screen off; the incoming screen draws itself
        // underneath. The HUD types in as a tail once the scroll finishes.
        currentScreen = name;
        uiManager.blocked = true;
        enterScreen(name);
        transition.beginScrollOnly({ tail: getHudRows(), onComplete });
    } else {
        // Type the incoming screen in (its row feed) while the outgoing scrolls
        // up; the HUD is appended as the final (bottom-most) row. `typed: true`
        // tells MainMenu to skip its bespoke first-load intro. Input stays
        // UNBLOCKED so the elements are interactive (offset-aware) while scrolling.
        currentScreen = name;
        enterScreen(name, { typed: true });
        uiManager.blocked = false; // override MainMenu.enter()'s block
        transition.begin({ typeables: [...incoming.getTypeables(), ...getHudRows()], onComplete });
    }
}

function handleCreateRoom(name) {
    if (!name) { showModal('?INVALID NAME'); return; }
    playerName = name;
    sessionStorage.setItem('playerName', name); // remember for this browser instance

    // Keep the Play screen intact during the async join — on success showScreen
    // ('lobby') scrolls it off; on failure the modal sits over the live screen.
    joinGame('create');
}

function handleJoinRoom(name, code) {
    if (!name) { showModal('?INVALID NAME'); return; }
    if (!code) { showModal('?INVALID CODE'); return; }
    playerName = name;
    sessionStorage.setItem('playerName', name); // remember for this browser instance

    joinGame('join', code);
}

async function tryReconnect() {
    const token = localStorage.getItem('reconnectionToken');
    if (!token) {
        showScreen('main');
        return;
    }
    try {
        uiManager.blocked = true;
        room = await colyseusClient.reconnect(token);
        localStorage.setItem('reconnectionToken', room.reconnectionToken);
        room.onLeave(() => {
            localStorage.removeItem('reconnectionToken');
            showScreen('main');
            if (currentMode) currentMode.reset();
        });
        // Defer like a fresh join — the lobby (or game) shows once state arrives.
        pendingLobbyEntry = true;
        setupRoomMessages(true);
    } catch (e) {
        localStorage.removeItem('reconnectionToken');
        uiManager.blocked = false;
        uiManager.lastTime = performance.now();
        showScreen('main');
    }
}

window.addEventListener('load', () => {
    // Wait for BOTH fonts before anything draws:
    //  - initFont: the opentype.js load used for text metrics (charWidth)
    //  - document.fonts.load: the CSS @font-face the canvas actually renders with
    // Otherwise the title types in a fallback font and snaps to IBMVGA mid-type
    // once the @font-face finishes downloading.
    const cssFont = (document.fonts && document.fonts.load)
        ? document.fonts.load(`${FONT_SIZE}px "IBMVGA"`).catch(() => {})
        : Promise.resolve();
    Promise.all([initFont(FONT_SIZE), cssFont]).then(() => {
        fontReady = true;
        tryReconnect();
    }).catch(err => {
        console.error('Font load failed:', err);
    });
});

function joinGame(type, code) {
    const options = { playerName };
    if (type === 'create') {
        colyseusClient.create('game_room', options).then(onRoomJoined);
    } else {
        fetch('/join/' + code)
            .then(r => r.json())
            .then(data => {
                if (data.roomId) {
                    colyseusClient.joinById(data.roomId, options).then(onRoomJoined);
                } else {
                    showModal('?INVALID CODE');
                }
            })
            .catch(() => showModal('?INVALID CODE'));
    }
}

function onRoomJoined(r) {
    room = r;
    localStorage.setItem('reconnectionToken', room.reconnectionToken);
    room.onLeave(() => {
        localStorage.removeItem('reconnectionToken');
        showScreen(leaveDestination);
        leaveDestination = 'main';
        if (currentMode) currentMode.reset();
    });
    // Don't show the lobby yet — wait for its initial state (room code, players,
    // and the host's current selections) so it types in the REAL state instead of
    // an empty screen. maybeEnterLobby() fires once that's in.
    pendingLobbyEntry = true;
    setupRoomMessages();
}

// Show the lobby once its initial state has loaded. Deferred one frame so any
// same-tick settingsUpdated (the host's mode/settings) is applied first.
function maybeEnterLobby() {
    if (!pendingLobbyEntry) return;
    if (!lobbyScreen.roomCode || lobbyScreen.players.length === 0) return;
    pendingLobbyEntry = false;
    // ...unless a game-in-progress message took over in the meantime.
    requestAnimationFrame(() => { if (currentScreen !== 'game') showScreen('lobby'); });
}

// --- Game Over Overlay ---

let gameOverBtns = { playAgain: null, returnToLobby: null };

function showGameOverOverlay(winner) {
    winnerId = winner;
    uiManager.clear();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    gameOverBtns.playAgain = makeButton('PLAY AGAIN', cx, cy + 60,
        () => room.send('votePlayAgain'));
    gameOverBtns.returnToLobby = makeButton('RETURN TO LOBBY', cx, cy + 155,
        () => room.send('voteReturnToLobby'));
    const mainMenuBtn = makeButton('MAIN MENU', cx, cy + 250,
        () => { hideGameOverOverlay(); room.send('leaveToMenu'); }, { blocksInput: true });

    uiManager.buttons.push(gameOverBtns.playAgain);
    uiManager.buttons.push(gameOverBtns.returnToLobby);
    uiManager.buttons.push(mainMenuBtn);
}

function hideGameOverOverlay() {
    winnerId = null;
    uiManager.clear();
    gameOverBtns.playAgain = null;
    gameOverBtns.returnToLobby = null;
}

// --- Room Messages ---

function setupRoomMessages(isReconnecting = false) {
    if (!isReconnecting) room.send('clientReady');
    // Per-char collision radii (from the font + fixed play-box size). The server
    // stores them so its wall bounce keeps each glyph's edge off the frame.
    room.send('charRadii', gameScreen.charRadii());

    room.onMessage('roomCode', (data) => {
        lobbyScreen.setRoomCode(data.code);
        maybeEnterLobby();
    });

    room.onMessage('playerList', (data) => {
        playerList = data.players;
        const me = data.players.find(p => p.id === room.sessionId);
        isHost = me ? me.isHost : false;
        lobbyScreen.setHost(isHost);
        lobbyScreen.setPlayers(data.players);
        if (currentMode) currentMode.onMessage('playerList', data);
        maybeEnterLobby();
    });

    room.onMessage('startError', (data) => {
        showModal(data.message);
    });

    room.onMessage('settingsUpdated', (data) => {
        if (isHost) return;
        selectedMode = data.mode;
        selectedSettings = { ...data.settings };
        lobbyScreen.applyRemoteSettings(data.mode, data.settings, data.customOpen);
    });

    room.onMessage('gameStarted', (data) => {
        pendingLobbyEntry = false; // going to the game, not the lobby
        if (transition.isActive()) transition.cancelToEnd();
        currentMode = createMode(data.mode, data);
        currentScreen = 'game';
        uiManager.clear();
        resizeCanvas();
    });

    room.onMessage('gameRestarted', (data) => {
        if (transition.isActive()) transition.cancelToEnd();
        if (currentMode) currentMode.reset();
        if (data.mode) currentMode = createMode(data.mode, data);
        currentScreen = 'game';
        hideGameOverOverlay();
    });

    room.onMessage('returnedToLobby', () => {
        if (currentMode) currentMode.reset();
        currentMode = null;
        hideGameOverOverlay();
        showScreen('lobby');
    });

    room.onMessage('playAgainVotes', (data) => {
        if (!gameOverBtns.playAgain) return;
        const myVote = data.voterIds?.includes(room.sessionId);
        gameOverBtns.playAgain.label = `PLAY AGAIN (${data.votes}/${data.total})`;
        gameOverBtns.playAgain.active = myVote;
    });

    room.onMessage('returnToLobbyVotes', (data) => {
        if (!gameOverBtns.returnToLobby) return;
        const myVote = data.voterIds?.includes(room.sessionId);
        gameOverBtns.returnToLobby.label = `RETURN TO LOBBY (${data.votes}/${data.total})`;
        gameOverBtns.returnToLobby.active = myVote;
    });

    const modeMessages = [
        'roundCountdown', 'roundStart', 'gameState', 'charUpdate',
        'roundOver', 'timeUp', 'matchOver', 'gameOver', 'reconnected'
    ];
    modeMessages.forEach(type => {
        room.onMessage(type, (data) => {
            if (type === 'reconnected' && data.gameStarted) {
                pendingLobbyEntry = false; // reconnecting into a live game, not the lobby
                if (transition.isActive()) transition.cancelToEnd();
                if (!currentMode) currentMode = createMode(data.mode || 'redacted', data);
                currentScreen = 'game';
                uiManager.clear();
                uiManager.blocked = false;
                uiManager.lastTime = performance.now();
                resizeCanvas();
            }
            if (currentMode) currentMode.onMessage(type, data);
        });
    });
}

function createMode(modeId, data) {
    const callbacks = {
        onGameOver: (winner) => showGameOverOverlay(winner)
    };
    switch (modeId) {
        case 'redacted':
        default:
            const mode = new DELMode(canvas, ctx, uiManager, room, callbacks);
            mode.totalMatches = data.totalMatches || 1;
            mode.currentMatch = data.match || 1;
            return mode;
    }
}

// --- Modal ---
const MODAL_FONT = 32;
const MODAL_PAD_X = 4;            // chars of horizontal padding inside the box
// Border glyphs (ASCII only) — swap these to change the window look. Avoid +,-,|
// so it doesn't read as a button. e.g. '*' box, or H='=' V=':' C='=' for a rule box.
const MODAL_BORDER_H = '#';      // top/bottom fill
const MODAL_BORDER_C = '#';      // corners
const MODAL_BORDER_L = '#';      // left side
const MODAL_BORDER_R = '#';      // right side
const MODAL_OK_REST = 40;        // px from "OK" center to each bracket at rest
const MODAL_OK_SNAP_STEP = 10;   // px the brackets flash inward
const MODAL_OK_FLASH_IN = 600;   // ms the brackets stay snapped in
const MODAL_OK_FLASH_OUT = 600;  // ms at rest between flashes

const modalOk = { hover: 0, animT: 0, snap: 0, over: false, rect: null };

function showModal(message) {
    modalMessage = message;
    uiManager.blocked = true;
    uiManager.buttons.forEach(btn => btn.hoverProgress = 0);
    modalOk.hover = 0; modalOk.animT = 0; modalOk.snap = 0; modalOk.rect = null;
}

// On hover, the OK brackets flash inward (a single snap that pulses in/out) —
// quieter than the fullscreen button's snap-snap-revert.
function updateModal(dt) {
    if (!modalMessage) { modalOk.snap = 0; return; }
    const r = modalOk.rect;
    const over = r && uiManager.mouseX >= r.x && uiManager.mouseX <= r.x + r.w &&
                 uiManager.mouseY >= r.y && uiManager.mouseY <= r.y + r.h;
    modalOk.over = over;
    if (over) {
        modalOk.animT += dt;
        const cycle = MODAL_OK_FLASH_IN + MODAL_OK_FLASH_OUT;
        const t = modalOk.animT % cycle;
        modalOk.snap = t < MODAL_OK_FLASH_IN ? 0 : MODAL_OK_SNAP_STEP;
    } else {
        modalOk.animT = 0;
        modalOk.snap = 0;
    }
}

// ASCII-box modal: a +--+ / | bordered window with the message and a } OK {
// confirm whose brackets snap inward on hover.
function drawModal() {
    if (!modalMessage) return;
    const msg = modalMessage.toUpperCase();

    ctx.fillStyle = bgAlpha(0.8);
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `${MODAL_FONT}px "IBMVGA"`;
    ctx.textBaseline = 'top';
    const cw = ctx.measureText('M').width;
    const lh = MODAL_FONT;
    const cx = canvas.width / 2;

    const innerChars = msg.length + MODAL_PAD_X * 2; // dashes between the corners
    const boxChars = innerChars + 2;                 // incl. '+' corners
    const boxLeft = cx - (boxChars * cw) / 2;

    const rows = 7; // top, pad, message, pad, ok, pad, bottom
    const boxTop = canvas.height / 2 - (rows * lh) / 2;
    const top = MODAL_BORDER_C + MODAL_BORDER_H.repeat(innerChars) + MODAL_BORDER_C;
    const mid = MODAL_BORDER_L + ' '.repeat(innerChars) + MODAL_BORDER_R;

    ctx.fillStyle = theme.fg;
    ctx.textAlign = 'left';
    const frame = [top, mid, mid, mid, mid, mid, top];
    for (let i = 0; i < frame.length; i++) ctx.fillText(frame[i], boxLeft, boxTop + i * lh);

    // Message (row 2), centered
    ctx.textAlign = 'center';
    ctx.fillText(msg, cx, boxTop + 2 * lh);

    // OK (row 4) — brackets face OUTWARD at rest ( { OK } ); on hover they swap
    // to inward ( } OK { ) and flash tight→spread.
    const okY = boxTop + 4 * lh;
    const gap = MODAL_OK_REST - modalOk.snap;
    ctx.fillText('OK', cx, okY);
    ctx.fillText(modalOk.over ? '}' : '{', cx - gap, okY);
    ctx.fillText(modalOk.over ? '{' : '}', cx + gap, okY);

    // Hit rect uses the REST spread (widest extent) so hovering doesn't shrink it
    // and flicker the hover state.
    const reach = MODAL_OK_REST + cw;
    modalOk.rect = { x: cx - reach, y: okY, w: reach * 2, h: lh };
    ctx.textAlign = 'left';
}

// --- Persistent ASCII HUD (bottom-right) ---
// Real elements with hover animation + button-like press/release/glow. Hit rects
// are fixed (independent of the hover animation) so hovering doesn't toggle.
// The *action* fires from the click handler (keeps fullscreen's user-gesture and
// avoids the settings-panel double-toggle); the press/glow here is visual only.
const HUD_FONT = 36;
const HUD_Z_REST = 1.3;        // resting depth (full opacity)
const HUD_Z_PRESSED = 2.5;     // held — fades back
const HUD_Z_GLOW = 1.0;        // overshoot on release — glow fires here
const HUD_PRESS_SPEED = 0.005; // z per ms while held
const HUD_RETURN_SPEED = 0.005;// z per ms when returning
const HUD_GLOW_SPEED = 0.0013; // glow cycle speed

// Fullscreen bracket snap animation (discrete, while hovered):
// [ ] -> [  ] -> [   ] -> (snap back) [ ] -> ... looping.
const HUD_BRACKET_BASE = 9;    // rest half-gap from center to each bracket
const HUD_SNAP_STEP = 4;       // px each bracket jumps outward per snap level
const HUD_SNAP_HOLD_MS = 430;  // how long each snap state holds
const HUD_SNAP_PAUSE_MS = 300; // extra rest after each "snap snap return" cycle

// Settings glyph: rests on '%'; on hover it rapidly cycles through three chars
// then pauses back on '%' — i.e. % -> - -> \ -> ; -> % (the cycle chars, swap
// speed, and pause are all tweakable here).
const SETTINGS_REST_CHAR = '%';
const SETTINGS_CYCLE_CHARS = ['-', '\\', ';'];
const SETTINGS_SWAP_MS = 90;   // ms on each cycle char during the hover swap
const SETTINGS_PAUSE_MS = 730; // ms paused on '%' between cycles

function hudMoveToward(current, target, step) {
    return Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;
}

let hudMouseDown = false;
let hudPressedItem = null;

// First-load HUD type-in: the HUD stays hidden through the main-menu intro, then
// types in (like it does as a transition tail) once that intro fully reveals.
const HUD_TYPE_DELAY = 0.05; // seconds per character
let hudIntroPending = false;
let hudIntroStart = null;

const hudItems = [
    {
        id: 'settings',
        hover: 0, z: HUD_Z_REST, releasePhase: null, glowT: 0, _rect: null,
        _animT: 0, _char: SETTINGS_REST_CHAR,
        typeChars: SETTINGS_REST_CHAR,
        getRect() { return { x: canvas.width - 200, y: canvas.height - 90, w: 60, h: 40 }; },
        // Rests on '%'; on hover it immediately swaps - -> \ -> ; then pauses back
        // on '%' (swap first so the animation starts at once, like the brackets).
        tick(dt, over) {
            if (over) {
                this._animT += dt;
                const swapTotal = SETTINGS_CYCLE_CHARS.length * SETTINGS_SWAP_MS;
                const t = this._animT % (swapTotal + SETTINGS_PAUSE_MS);
                this._char = t < swapTotal
                    ? SETTINGS_CYCLE_CHARS[Math.floor(t / SETTINGS_SWAP_MS)]
                    : SETTINGS_REST_CHAR;
            } else {
                this._animT = 0;
                this._char = SETTINGS_REST_CHAR;
            }
        },
        render(ctx, r, hover, alpha, color) {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.font = `${HUD_FONT}px "IBMVGA"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this._char, r.x + r.w / 2, r.y + r.h / 2);
            ctx.globalAlpha = 1;
        },
        // Type-in reveal for the transition feed (the resting '%', centered).
        drawTyped(ctx, r, n) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = theme.fg;
            ctx.font = `${HUD_FONT}px "IBMVGA"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (n >= 1) ctx.fillText(SETTINGS_REST_CHAR, r.x + r.w / 2, r.y + r.h / 2);
        },
        onClick() { settingsPanelOpen = !settingsPanelOpen; }
    },
    {
        id: 'fullscreen',
        hover: 0, z: HUD_Z_REST, releasePhase: null, glowT: 0, _rect: null,
        _animT: 0, _spread: 0,
        typeChars: '[]',
        getRect() { return { x: canvas.width - 120, y: canvas.height - 90, w: 70, h: 40 }; },
        // Inactive (windowed): rests closed, hover snaps OUT twice then returns.
        // Active (fullscreen): rests expanded, hover snaps IN twice then reverts.
        tick(dt, over) {
            const active = !!document.fullscreenElement;
            const EXPANDED = HUD_SNAP_STEP * 2;
            const rest = active ? EXPANDED : 0;
            if (over) {
                this._animT += dt;
                const H = HUD_SNAP_HOLD_MS;
                const cycle = 3 * H + HUD_SNAP_PAUSE_MS;
                const t = this._animT % cycle;
                if (active) {
                    this._spread = t < H ? HUD_SNAP_STEP : t < 2 * H ? 0 : EXPANDED;
                } else {
                    this._spread = t < H ? HUD_SNAP_STEP : t < 2 * H ? EXPANDED : 0;
                }
            } else {
                this._animT = 0;
                this._spread = rest;
            }
        },
        render(ctx, r, hover, alpha, color) {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.font = `${HUD_FONT}px "IBMVGA"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const cx = r.x + r.w / 2;
            const cy = r.y + r.h / 2;
            // Both brackets snap outward symmetrically from the center.
            const half = HUD_BRACKET_BASE + this._spread;
            ctx.fillText('[', cx - half, cy);
            ctx.fillText(']', cx + half, cy);
            ctx.globalAlpha = 1;
        },
        // Type-in reveal: '[' then ']' at the resting spread.
        drawTyped(ctx, r, n) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = theme.fg;
            ctx.font = `${HUD_FONT}px "IBMVGA"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
            const half = HUD_BRACKET_BASE + (document.fullscreenElement ? HUD_SNAP_STEP * 2 : 0);
            if (n >= 1) ctx.fillText('[', cx - half, cy);
            if (n >= 2) ctx.fillText(']', cx + half, cy);
        },
        onClick() {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen();
            else document.exitFullscreen();
        }
    }
];

function updateHUD(dt) {
    const mx = uiManager.mouseX, my = uiManager.mouseY;
    for (const it of hudItems) {
        const r = it.getRect();
        it._rect = r;
        const over = mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
        it.hover = over ? Math.min(1, it.hover + dt / 150) : Math.max(0, it.hover - dt / 150);
        if (it.tick) it.tick(dt, over);

        const pressed = hudMouseDown && it === hudPressedItem && over;
        if (pressed) {
            it.z = hudMoveToward(it.z, HUD_Z_PRESSED, dt * HUD_PRESS_SPEED);
        } else if (it.releasePhase === 'releasing') {
            it.z = hudMoveToward(it.z, HUD_Z_GLOW, dt * HUD_RETURN_SPEED);
            if (it.z === HUD_Z_GLOW) { it.releasePhase = 'glowing'; it.glowT = 0; }
        } else if (it.releasePhase === 'glowing') {
            it.glowT += dt * HUD_GLOW_SPEED;
            if (it.glowT >= 1.0) { it.glowT = 0; it.releasePhase = 'returning'; }
        } else if (it.releasePhase === 'returning') {
            it.z = hudMoveToward(it.z, HUD_Z_REST, dt * HUD_RETURN_SPEED);
            if (it.z === HUD_Z_REST) it.releasePhase = null;
        } else if (it.z !== HUD_Z_REST) {
            it.z = hudMoveToward(it.z, HUD_Z_REST, dt * HUD_RETURN_SPEED);
        }
    }
}

function drawHUDItems() {
    for (const it of hudItems) {
        const r = it.getRect();
        it._rect = r;
        let color = theme.fg;
        if (it.releasePhase === 'glowing' && it.glowT > 0) {
            const g = it.glowT < 0.5 ? it.glowT * 2 : (1 - it.glowT) * 2;
            color = glow(g);
        }
        it.render(ctx, r, it.hover, zToAlpha(it.z), color);
    }
}

// Row segments so the HUD types in as the final row of a screen transition.
// Both items share a Y, so they group into one row typed left-to-right.
function getHudRows() {
    return hudItems.map(it => {
        const r = it.getRect();
        return {
            y: r.y + r.h / 2,
            x: r.x,
            cost: it.typeChars.length,
            draw: (ctx, n) => it.drawTyped(ctx, r, n)
        };
    });
}

// Press/release visual lifecycle (action itself fires from the click handler).
function hudOnMouseDown(mx, my) {
    hudMouseDown = true;
    hudPressedItem = null;
    for (const it of hudItems) {
        const r = it._rect || it.getRect();
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
            hudPressedItem = it;
            it.releasePhase = null;
            it.glowT = 0;
            break;
        }
    }
}

function hudOnMouseUp(mx, my) {
    hudMouseDown = false;
    const it = hudPressedItem;
    hudPressedItem = null;
    if (!it) return;
    const r = it._rect || it.getRect();
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        it.releasePhase = 'releasing'; // triggers overshoot -> glow
        it.glowT = 0;
    }
}

function hudHit(mx, my) {
    for (const it of hudItems) {
        const r = it._rect || it.getRect();
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return it;
    }
    return null;
}

function getSettingsPanelRect() {
    return { x: canvas.width - 216, y: canvas.height - 148, w: 208, h: 76 };
}

function getModalOkRect() {
    return modalOk.rect || { x: 0, y: 0, w: 0, h: 0 };
}

// Draw the HUD progressively typed in (first n chars across both items, in order).
function drawHUDTyped(n) {
    let remaining = n;
    for (const it of hudItems) {
        const r = it.getRect();
        it._rect = r;
        const take = Math.max(0, Math.min(it.typeChars.length, remaining));
        if (take > 0) it.drawTyped(ctx, r, take);
        remaining -= it.typeChars.length;
    }
}

// First-load HUD intro: stay hidden until the main-menu intro fully reveals, then
// type in. Returns true while still animating (so the full HUD is suppressed).
function drawHUDIntro() {
    if (hudIntroStart === null) {
        // Type in right after the PLAY/SETTINGS buttons finish; the special chars
        // are then released to pop in after the HUD.
        if (currentScreen === 'main' && mainMenu.buttonsDone()) {
            hudIntroStart = uiManager.elapsed;
        } else {
            return; // not started yet — HUD stays hidden
        }
    }
    const total = hudItems.reduce((s, it) => s + it.typeChars.length, 0);
    const revealed = Math.floor((uiManager.elapsed - hudIntroStart) / HUD_TYPE_DELAY);
    if (revealed >= total) {
        hudIntroPending = false;     // done — full HUD takes over next frame
        mainMenu.releaseSpecials();  // now the special chars pop in
        return;
    }
    drawHUDTyped(revealed);
}

function drawPersistentHUD() {
    drawHUDItems();

    if (settingsPanelOpen) {
        const p = getSettingsPanelRect();
        ctx.strokeStyle = theme.fg;
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = theme.fg;
        ctx.font = '20px "IBMVGA"';
        ctx.fillText('MAIN MENU', p.x + p.w / 2, p.y + p.h / 2);
    }

    drawModal();
}

// --- Draw Loop ---

// Render a single screen's content into the canvas (no clear, no HUD).
function drawScreenInto(name) {
    if (name === 'main') mainMenu.draw();
    else if (name === 'play') playScreen.draw();
    else if (name === 'settings') settingsScreen.draw();
    else if (name === 'lobby') lobbyScreen.draw();
    else if (name === 'game') {
        if (currentMode) currentMode.draw(gameScreen);
        if (winnerId) uiManager.buttons.forEach(btn => drawButton(ctx, btn, uiManager.elapsed, FONT_SIZE));
    }
}

function draw() {
    const now = performance.now();
    const dt = now - (lastDrawTime || now);
    lastDrawTime = now;

    // Advance an already-running transition and expose its offset BEFORE the UI
    // update, so hit-testing is offset-aware this frame.
    if (transition.isActive()) {
        transition.update(dt);
        uiManager.offsetY = transition.currentOffsetY();
    } else {
        uiManager.offsetY = 0;
    }

    // A button's onClick may START a new transition here (navigation).
    uiManager.update(now);
    updateHUD(dt);
    updateModal(dt);

    if (transition.isActive()) {
        // Re-sample in case a transition just began this frame — it's at elapsed 0
        // (offset = H), so it renders the OUTGOING snapshot, not a flash of the
        // incoming screen. The HUD types in via the feed/tail, not pinned here.
        uiManager.offsetY = transition.currentOffsetY();
        transition.render(uiManager.elapsed, () => drawScreenInto(currentScreen));
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawScreenInto(currentScreen);

    if (hudIntroPending) drawHUDIntro(); // hidden until the menu intro reveals, then types in
    if (hudIntroPending) drawModal();    // still typing — just the modal overlay (none here, but safe)
    else drawPersistentHUD();            // full interactive HUD (also draws the modal)
}

// --- Click Handler ---

function hudEventPos(e) {
    const rect = canvas.getBoundingClientRect();
    return curveInverse(e.clientX - rect.left, e.clientY - rect.top);
}

canvas.addEventListener('mousedown', (e) => {
    if (transition.isActive() || modalMessage || hudIntroPending) return;
    const { x, y } = hudEventPos(e);
    hudOnMouseDown(x, y);
});

canvas.addEventListener('mouseup', (e) => {
    const { x, y } = hudEventPos(e);
    hudOnMouseUp(x, y);
});

canvas.addEventListener('click', (e) => {
    if (transition.isActive()) return; // ignore clicks mid-transition

    const rect = canvas.getBoundingClientRect();
    const { x: mx, y: my } = curveInverse(
        e.clientX - rect.left,
        e.clientY - rect.top
    );

    function hits(r) {
        return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    }

    if (modalMessage) {
        if (hits(getModalOkRect())) {
            modalMessage = null;
            uiManager.blocked = false;
            uiManager.lastTime = performance.now();
        }
        return;
    }

    if (settingsPanelOpen) {
        if (hits(getSettingsPanelRect())) {
            settingsPanelOpen = false;
            if (currentMode) currentMode.reset();
            // In a room, leaving navigates to main via room.onLeave — don't ALSO
            // navigate directly, or the two transitions fight (a partial title
            // typed then restarted, visible once there's network latency).
            if (room) {
                leaveDestination = 'main';
                room.send('leaveToMenu');
            } else {
                showScreen('main');
            }
        } else {
            settingsPanelOpen = false;
        }
        return;
    }

    if (!hudIntroPending) {
        const hudItem = hudHit(mx, my);
        if (hudItem) { hudItem.onClick(); return; }
    }

    if (currentScreen !== 'game') return;

    const clickX = mx - gameScreen.boxCenterX;   // box is left-aligned, not canvas-centered
    const clickY = my - canvas.height / 2;
    if (currentMode) {
        const hit = currentMode.hitTest(gameScreen, clickX, clickY);
        if (hit) room.send('tap', { nx: hit.nx, ny: hit.ny, time: Date.now() });
    }
});

requestAnimationFrame(loop);

function loop() {
    draw();
    crt.render(performance.now() / 1000);
    requestAnimationFrame(loop);
}