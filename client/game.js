import { GAME_MODES } from '../gameModes.js';
import { Client } from '@colyseus/sdk';
import { UIManager } from './ui/UIManager.js';
import { MainMenu } from './screens/MainMenu.js';
import { PlayScreen } from './screens/PlayScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { GameScreen } from './screens/GameScreen.js';
import { makeButton, drawButton } from './ui/Button.js';
import { CRTEffect } from './CRTShader.js';

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
let targetChar = null;
let chars = [];
let prevChars = [];
let lastUpdateTime = null;
let currentRound = 1;
let currentMatch = 1;
let totalMatches = 1;
let eliminatedName = null;
let winnerId = null;
let playerList = [];
let showRoundOver = false;
let showMatchOver = false;
let matchOverData = null;
let playerName = '';
let timeLeft = 30;
let isHost = false;
let countdownActive = false;
let countdownStartTime = null;
let currentScreen = null;
let modalMessage = null;
let settingsPanelOpen = false;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = isMobile ? Math.max(window.innerWidth, 300) : Math.max(window.innerWidth, 1600);
    canvas.height = isMobile ? Math.max(window.innerHeight, 720) : Math.max(window.innerHeight, 800);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- UI System ---
const uiManager = new UIManager(canvas, ctx);

const mainMenu = new MainMenu(canvas, ctx, uiManager,
    () => showScreen('play'),
    () => showScreen('settings')
);

const playScreen = new PlayScreen(canvas, ctx, uiManager,
    (name) => handleCreateRoom(name), // QUICK JOIN placeholder
    (name) => handleCreateRoom(name),
    (name, code) => handleJoinRoom(name, code),
    () => showScreen('main')
);

const settingsScreen = new SettingsScreen(canvas, ctx, uiManager,
    () => showScreen('main')
);

const lobbyScreen = new LobbyScreen(canvas, ctx, uiManager,
    (mode, settings) => {                       // onUpdateSettings
        selectedMode = mode;
        selectedSettings = settings;
        if (room) room.send('updateSettings', { mode, settings });
    },
    (targetId) => { if (room) room.send('makeHost', { targetId }); },   // onMakeHost
    () => {                                                              // onStart
        if (!selectedMode) { showModal('Please select a game mode.'); return; }
        room.send('startGame', { mode: selectedMode, settings: selectedSettings });
    },
    () => { if (room) room.send('leaveToMenu'); }                       // onMainMenu
);

const gameScreen = new GameScreen(canvas, ctx, isMobile);

const crt = new CRTEffect(canvas);
canvas.style.opacity = '0';
canvas.style.display = 'block';
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
    document.getElementById('game').style.display = 'block';
    if (name === 'main') mainMenu.enter();
    else if (name === 'play') playScreen.enter();
    else if (name === 'settings') settingsScreen.enter();
    else if (name === 'lobby') lobbyScreen.enter();
}

function handleCreateRoom(name) {
    if (!name) { showModal('PLEASE ENTER YOUR NAME'); return; }
    playerName = name;
    currentScreen = null;
    uiManager.clear();
    joinGame('create');
}

function handleJoinRoom(name, code) {
    if (!name) { showModal('PLEASE ENTER YOUR NAME'); return; }
    if (!code) { showModal('PLEASE ENTER A ROOM CODE'); return; }
    playerName = name;
    currentScreen = null;
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
        room = await colyseusClient.reconnect(token);
        localStorage.setItem('reconnectionToken', room.reconnectionToken);

        room.onLeave(() => {
            localStorage.removeItem('reconnectionToken');
            showScreen('main');
            resetGameState();
        });

        showScreen('lobby');
        setupRoomMessages(true);
    } catch (e) {
        localStorage.removeItem('reconnectionToken');
        showScreen('main');
    }
}

window.addEventListener('load', tryReconnect);

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
            .catch(() => {
                showModal('Room not found. Check the code and try again.');
            });
    }
}

function onRoomJoined(r) {
    room = r;
    localStorage.setItem('reconnectionToken', room.reconnectionToken);

    room.onLeave(() => {
        localStorage.removeItem('reconnectionToken');
        showScreen('main');
        resetGameState();
    });

    showScreen('lobby');
    setupRoomMessages();
}

let gameOverBtns = { playAgain: null, returnToLobby: null };

function showGameOverOverlay() {
    uiManager.clear();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    gameOverBtns.playAgain = makeButton('PLAY AGAIN', cx, cy + 60,
        () => room.send('votePlayAgain'));
    gameOverBtns.returnToLobby = makeButton('RETURN TO LOBBY', cx, cy + 155,
        () => room.send('voteReturnToLobby'));
    const mainMenuBtn = makeButton('MAIN MENU', cx, cy + 250,
        () => { hideGameOverOverlay(); room.send('leaveToMenu'); });

    uiManager.buttons.push(gameOverBtns.playAgain);
    uiManager.buttons.push(gameOverBtns.returnToLobby);
    uiManager.buttons.push(mainMenuBtn);
}

function hideGameOverOverlay() {
    uiManager.clear();
    gameOverBtns.playAgain = null;
    gameOverBtns.returnToLobby = null;
}

function resetGameState() {
    chars = [];
    prevChars = [];
    targetChar = null;
    winnerId = null;
    eliminatedName = null;
    showRoundOver = false;
    showMatchOver = false;
    matchOverData = null;
    playerList = [];
    currentRound = 1;
    currentMatch = 1;
    totalMatches = 1;
    timeLeft = 30;
    countdownActive = false;
    countdownStartTime = null;
    lastUpdateTime = null;
}

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

function setupRoomMessages(isReconnecting = false) {
    if (!isReconnecting) {
        room.send('clientReady');
    }

    room.onMessage('roomCode', (data) => {
        lobbyScreen.setRoomCode(data.code);
    });

    room.onMessage('playerList', (data) => {
        playerList = data.players;
        const me = data.players.find(p => p.id === room.sessionId);
        isHost = me ? me.isHost : false;
        lobbyScreen.setHost(isHost);
        lobbyScreen.setPlayers(data.players);
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
        currentMatch = data.match;
        totalMatches = data.totalMatches;
        winnerId = null;
        showRoundOver = false;
        showMatchOver = false;
        matchOverData = null;
        currentScreen = null;
        uiManager.clear();
        document.getElementById('game').style.display = 'block';
        resizeCanvas();
    });

    room.onMessage('roundCountdown', (data) => {
        targetChar = data.targetChar;
        chars = data.chars;
        prevChars = data.chars.map(c => ({ ...c }));
        currentRound = data.round;
        currentMatch = data.match;
        countdownActive = true;
        const elapsed = data.elapsedSeconds || 0;
        countdownStartTime = Date.now() - (elapsed * 1000);
        showRoundOver = false;
        showMatchOver = false;
        eliminatedName = null;
        matchOverData = null;
        lastUpdateTime = Date.now();
    });

    room.onMessage('roundStart', (data) => {
        targetChar = data.targetChar;
        chars = data.chars;
        prevChars = data.chars.map(c => ({ ...c }));
        currentRound = data.round;
        currentMatch = data.match;
        timeLeft = data.timeLeft;
        countdownActive = false;
        lastUpdateTime = Date.now();
    });

    room.onMessage('gameState', (data) => {
        chars = data.chars;
        prevChars = data.chars.map(c => ({ ...c }));
        targetChar = data.targetChar;
        timeLeft = data.timeLeft;
        currentRound = data.round;
        currentMatch = data.match;
        lastUpdateTime = Date.now();
    });

    room.onMessage('charUpdate', (data) => {
        prevChars = chars.map(c => ({ ...c }));
        chars = data.chars;
        timeLeft = data.timeLeft;
        lastUpdateTime = Date.now();
    });

    room.onMessage('roundOver', (data) => {
        if (data.lostLife) {
            eliminatedName = `${data.lostLifeName} lost a life!`;
        } else {
            eliminatedName = `${data.eliminatedName} has been eliminated!`;
        }
        showRoundOver = true;
    });

    room.onMessage('timeUp', (data) => {
        const parts = [];
        if (data.eliminatedNames && data.eliminatedNames.length > 0) {
            parts.push(data.eliminatedNames.join(', ') + ' eliminated!');
        }
        if (data.lostLifePlayers && data.lostLifePlayers.length > 0) {
            parts.push(data.lostLifePlayers.map(p => `${p.name} lost a life!`).join(', '));
        }
        eliminatedName = parts.join(' ');
        showRoundOver = true;
    });

    room.onMessage('matchOver', (data) => {
        showMatchOver = true;
        matchOverData = data;
        showRoundOver = false;
        eliminatedName = null;
    });

    room.onMessage('playAgainVotes', (data) => {
        if (!gameOverBtns.playAgain) return;
        const myVote = data.voterIds && data.voterIds.includes(room.sessionId);
        gameOverBtns.playAgain.label = `PLAY AGAIN (${data.votes}/${data.total})`;
        gameOverBtns.playAgain.active = myVote;
    });

    room.onMessage('returnToLobbyVotes', (data) => {
        if (!gameOverBtns.returnToLobby) return;
        const myVote = data.voterIds && data.voterIds.includes(room.sessionId);
        gameOverBtns.returnToLobby.label = `RETURN TO LOBBY (${data.votes}/${data.total})`;
        gameOverBtns.returnToLobby.active = myVote;
    });

    room.onMessage('gameRestarted', (data) => {
        currentMatch = data.match;
        totalMatches = data.totalMatches;
        winnerId = null;
        showRoundOver = false;
        showMatchOver = false;
        matchOverData = null;
        countdownActive = false;
        currentScreen = null;
        hideGameOverOverlay();
    });

    room.onMessage('returnedToLobby', () => {
        winnerId = null;
        showRoundOver = false;
        showMatchOver = false;
        matchOverData = null;
        countdownActive = false;
        currentScreen = null;
        showScreen('lobby');
    });

    room.onMessage('reconnected', (data) => {
        if (!countdownActive) {
            chars = data.chars;
            prevChars = data.chars.map(c => ({ ...c }));
            targetChar = data.targetChar;
        }
        timeLeft = data.timeLeft;
        currentRound = data.round;
        currentMatch = data.match;
        totalMatches = data.totalMatches;
        lastUpdateTime = Date.now();
        if (data.gameStarted) {
            currentScreen = null;
            document.getElementById('game').style.display = 'block';
            resizeCanvas();
            if (data.gameOver) {
                winnerId = data.winnerName || 'Nobody';
                showGameOverOverlay();
            }
        }
    });

    room.onMessage('gameOver', (data) => {
        winnerId = data.winnerName || 'Nobody';
        countdownActive = false;
        showGameOverOverlay();
    });
}

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
    } else {
        gameScreen.draw({
            chars, prevChars, targetChar,
            playerList, timeLeft, currentRound, currentMatch, totalMatches,
            showRoundOver, showMatchOver, matchOverData, eliminatedName,
            countdownActive, countdownStartTime, lastUpdateTime, winnerId
        });
        if (winnerId) {
            uiManager.update(performance.now());
            uiManager.buttons.forEach(btn => drawButton(ctx, btn, uiManager.elapsed, FONT_SIZE));
        }
    }

    drawPersistentHUD();
}

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
        }
        return;
    }

    if (settingsPanelOpen) {
        if (hits(getSettingsPanelRect())) {
            settingsPanelOpen = false;
            if (room) room.send('leaveToMenu');
            resetGameState();
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

    if (currentScreen) return;
    const clickX = mx - canvas.width / 2;
    const clickY = my - canvas.height / 2;
    const hit = gameScreen.hitTest(clickX, clickY, chars, countdownActive);
    if (hit) room.send('tap', { nx: hit.nx, ny: hit.ny, time: Date.now() });
});

requestAnimationFrame(loop);

function loop() {
    draw();
    crt.render(performance.now() / 1000);
    requestAnimationFrame(loop);
}