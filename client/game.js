import { GAME_MODES } from '../gameModes.js';
import { Client } from '@colyseus/sdk';
import { UIManager } from './ui/UIManager.js';
import { MainMenu } from './screens/MainMenu.js';
import { PlayScreen } from './screens/PlayScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { GameScreen } from './screens/GameScreen.js';
import { makeButton, drawButton } from './ui/Button.js';
import { initFont } from './ui/Font.js';
import { CRTEffect } from './CRTShader.js';
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
window.addEventListener('resize', resizeCanvas);

const uiManager = new UIManager(canvas, ctx);

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

function showScreen(name) {
    currentScreen = name;
    if (name === 'main') mainMenu.enter();
    else if (name === 'play') playScreen.enter();
    else if (name === 'settings') settingsScreen.enter();
    else if (name === 'lobby') lobbyScreen.enter();
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
        currentMode = createMode(data.mode, data);
        currentScreen = 'game';
        uiManager.clear();
        resizeCanvas();
    });

    room.onMessage('gameRestarted', (data) => {
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

function getHUDRects() {
    return {
        fullscreen: { x: canvas.width - 80,  y: canvas.height - 56, w: 40, h: 28 },
        gear:       { x: canvas.width - 160, y: canvas.height - 56, w: 40, h: 28 }
    };
}

function getSettingsPanelRect() {
    return { x: canvas.width - 216, y: canvas.height - 148, w: 208, h: 76 };
}

function getModalOkRect() {
    return { x: canvas.width / 2 - 60, y: canvas.height / 2 + 16, w: 120, h: 36 };
}

function drawPersistentHUD() {
    ctx.font = '20px "IBMVGA"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00ff41';
    const r = getHUDRects();
    ctx.fillText('⚙', r.gear.x + r.gear.w / 2, r.gear.y + r.gear.h / 2);
    ctx.fillText('⛶', r.fullscreen.x + r.fullscreen.w / 2, r.fullscreen.y + r.fullscreen.h / 2);

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

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentScreen === 'main') {
        uiManager.update(performance.now());
        mainMenu.draw();
    } else if (currentScreen === 'play') {
        uiManager.update(performance.now());
        playScreen.draw();
    } else if (currentScreen === 'settings') {
        uiManager.update(performance.now());
        settingsScreen.draw();
    } else if (currentScreen === 'lobby') {
        uiManager.update(performance.now());
        lobbyScreen.draw();
    } else if (currentScreen === 'game') {
        if (currentMode) currentMode.draw(gameScreen);
        if (winnerId) {
            uiManager.update(performance.now());
            uiManager.buttons.forEach(btn => drawButton(ctx, btn, uiManager.elapsed, FONT_SIZE));
        }
    }

    drawPersistentHUD();
}

// --- Click Handler ---

canvas.addEventListener('click', (e) => {
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

    const hudRects = getHUDRects();
    if (hits(hudRects.gear)) {
        settingsPanelOpen = !settingsPanelOpen;
        return;
    }
    if (hits(hudRects.fullscreen)) {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
        return;
    }

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