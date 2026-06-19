import { GAME_MODES } from '../gameModes.js';
import { Client } from '@colyseus/sdk';
import { UIManager } from './ui/UIManager.js';
import { MainMenu } from './screens/MainMenu.js';
import { PlayScreen } from './screens/PlayScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { GameScreen } from './screens/GameScreen.js';
import { makeButton, drawButton, zToAlpha } from './ui/Button.js';
import { initFont } from './ui/Font.js';
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

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

function resizeCanvas() {
    canvas.width = isMobile ? Math.max(window.innerWidth, 300) : Math.max(window.innerWidth, 1600);
    canvas.height = isMobile ? Math.max(window.innerHeight, 720) : Math.max(window.innerHeight, 800);
}

resizeCanvas();
window.addEventListener('resize', () => {
    if (transition.isActive()) transition.cancelToEnd();
    resizeCanvas();
});

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
    (mode, settings) => {
        selectedMode = mode;
        selectedSettings = settings;
        if (room) room.send('updateSettings', { mode, settings });
    },
    (targetId) => { if (room) room.send('makeHost', { targetId }); },
    () => {
        if (!selectedMode) { showModal('Please select a game mode.'); return; }
        room.send('startGame', { mode: selectedMode, settings: selectedSettings });
    },
    () => { if (room) room.send('leaveToMenu'); }
);

const gameScreen = new GameScreen(canvas, ctx, isMobile);

screens.main = mainMenu;
screens.play = playScreen;
screens.settings = settingsScreen;
screens.lobby = lobbyScreen;

const crt = new CRTEffect(canvas);
canvas.style.opacity = '0';
canvas.style.display = 'block';
crt.render(0);
uiManager.coordTransform = (x, y) => curveInverse(x, y);

function curveInverse(canvasRelX, canvasRelY) {
    const gameRect = canvas.getBoundingClientRect();
    const u = (canvasRelX + gameRect.left) / window.innerWidth;
    const v = (canvasRelY + gameRect.top) / window.innerHeight;
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
        currentScreen = name;
        enterScreen(name);
        return;
    }

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
        // tells MainMenu to skip its bespoke first-load intro.
        currentScreen = name;
        uiManager.blocked = true;
        enterScreen(name, { typed: true });
        transition.begin({ typeables: [...incoming.getTypeables(), ...getHudRows()], onComplete });
    }
}

function handleCreateRoom(name) {
    if (!name) { showModal('PLEASE ENTER YOUR NAME'); return; }
    playerName = name;
    uiManager.clear();
    joinGame('create');
}

function handleJoinRoom(name, code) {
    if (!name) { showModal('PLEASE ENTER YOUR NAME'); return; }
    if (!code) { showModal('PLEASE ENTER A ROOM CODE'); return; }
    playerName = name;
    uiManager.clear();
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
        showScreen('lobby');
        setupRoomMessages(true);
    } catch (e) {
        localStorage.removeItem('reconnectionToken');
        uiManager.blocked = false;
        uiManager.lastTime = performance.now();
        showScreen('main');
    }
}

window.addEventListener('load', () => {
    initFont(FONT_SIZE).then(() => {
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
                    showModal('Room not found. Check the code and try again.');
                }
            })
            .catch(() => showModal('Room not found. Check the code and try again.'));
    }
}

function onRoomJoined(r) {
    room = r;
    localStorage.setItem('reconnectionToken', room.reconnectionToken);
    room.onLeave(() => {
        localStorage.removeItem('reconnectionToken');
        showScreen('main');
        if (currentMode) currentMode.reset();
    });
    showScreen('lobby');
    setupRoomMessages();
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

    room.onMessage('roomCode', (data) => {
        lobbyScreen.setRoomCode(data.code);
    });

    room.onMessage('playerList', (data) => {
        playerList = data.players;
        const me = data.players.find(p => p.id === room.sessionId);
        isHost = me ? me.isHost : false;
        lobbyScreen.setHost(isHost);
        lobbyScreen.setPlayers(data.players);
        if (currentMode) currentMode.onMessage('playerList', data);
    });

    room.onMessage('startError', (data) => {
        showModal(data.message);
    });

    room.onMessage('settingsUpdated', (data) => {
        if (isHost) return;
        selectedMode = data.mode;
        selectedSettings = { ...data.settings };
        lobbyScreen.applyRemoteSettings(data.mode, data.settings);
    });

    room.onMessage('gameStarted', (data) => {
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

function showModal(message) {
    modalMessage = message;
    uiManager.blocked = true;
    uiManager.buttons.forEach(btn => btn.hoverProgress = 0);
}

// --- Persistent ASCII HUD (bottom-right) ---
// Real elements with hover animation + button-like press/release/glow. Hit rects
// are fixed (independent of the hover animation) so hovering doesn't toggle.
// The *action* fires from the click handler (keeps fullscreen's user-gesture and
// avoids the settings-panel double-toggle); the press/glow here is visual only.
const HUD_FONT = 28;
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

function hudMoveToward(current, target, step) {
    return Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;
}

let hudMouseDown = false;
let hudPressedItem = null;

const hudItems = [
    {
        id: 'settings',
        hover: 0, z: HUD_Z_REST, releasePhase: null, glowT: 0, _rect: null,
        typeChars: '(*)',
        getRect() { return { x: canvas.width - 200, y: canvas.height - 90, w: 60, h: 40 }; },
        render(ctx, r, hover, alpha, color) {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.font = `${HUD_FONT}px "IBMVGA"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // TODO: placeholder — replace with a proper ASCII "gear" glyph.
            ctx.fillText('(*)', r.x + r.w / 2, r.y + r.h / 2);
            ctx.globalAlpha = 1;
        },
        // Type-in reveal for the transition feed (first n chars, ending centered).
        drawTyped(ctx, r, n) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#00ff41';
            ctx.font = `${HUD_FONT}px "IBMVGA"`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const left = r.x + r.w / 2 - ctx.measureText(this.typeChars).width / 2;
            ctx.fillText(this.typeChars.slice(0, n), left, r.y + r.h / 2);
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
            ctx.fillStyle = '#00ff41';
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
        let color = '#00ff41';
        if (it.releasePhase === 'glowing' && it.glowT > 0) {
            const g = it.glowT < 0.5 ? it.glowT * 2 : (1 - it.glowT) * 2;
            color = `rgb(${Math.round(g * 170)}, 255, ${Math.round(65 + g * 121)})`;
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
    return { x: canvas.width / 2 - 60, y: canvas.height / 2 + 16, w: 120, h: 36 };
}

function drawPersistentHUD() {
    drawHUDItems();

    if (settingsPanelOpen) {
        const p = getSettingsPanelRect();
        ctx.strokeStyle = '#00ff41';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#00ff41';
        ctx.font = '20px "IBMVGA"';
        ctx.fillText('MAIN MENU', p.x + p.w / 2, p.y + p.h / 2);
    }

    if (modalMessage) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const bw = 600, bh = 180;
        const bx = canvas.width / 2 - bw / 2;
        const by = canvas.height / 2 - bh / 2;
        ctx.strokeStyle = '#00ff41';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = '#00ff41';
        ctx.font = '24px "IBMVGA"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(modalMessage, canvas.width / 2, canvas.height / 2 - 20);
        const ok = getModalOkRect();
        ctx.fillText('[ OK ]', canvas.width / 2, ok.y + ok.h / 2);
    }
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

    // Keep clocks/animations advancing even during a transition.
    uiManager.update(now);
    updateHUD(dt);

    if (transition.isActive()) {
        transition.update(dt);
        // For scroll-only, the incoming screen draws itself underneath. The HUD
        // is NOT drawn pinned here — it types in via the transition feed/tail.
        transition.render(uiManager.elapsed, () => drawScreenInto(currentScreen));
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawScreenInto(currentScreen);

    drawPersistentHUD();
}

// --- Click Handler ---

function hudEventPos(e) {
    const rect = canvas.getBoundingClientRect();
    return curveInverse(e.clientX - rect.left, e.clientY - rect.top);
}

canvas.addEventListener('mousedown', (e) => {
    if (transition.isActive() || modalMessage) return;
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
            if (room) room.send('leaveToMenu');
            if (currentMode) currentMode.reset();
            showScreen('main');
        } else {
            settingsPanelOpen = false;
        }
        return;
    }

    const hudItem = hudHit(mx, my);
    if (hudItem) { hudItem.onClick(); return; }

    if (currentScreen !== 'game') return;

    const clickX = mx - canvas.width / 2;
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