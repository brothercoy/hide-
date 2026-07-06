import { GAME_MODES } from '../gameModes.js';
import { Client } from '@colyseus/sdk';
import { UIManager } from './ui/UIManager.js';
import { MainMenu } from './screens/MainMenu.js';
import { PlayScreen } from './screens/PlayScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { GameScreen } from './screens/GameScreen.js';
import { makeButton, drawButton, zToAlpha } from './ui/Button.js';
import { makeBracketButton, drawBracketButton } from './ui/BracketButton.js';
import { theme, bgAlpha, glow } from './ui/colors.js';
import { initFont } from './ui/Font.js';
import { setBaseHeight, setBandHeight, bandTop } from './ui/viewport.js';
import { CRTEffect } from './CRTShader.js';
import { Transition } from './ui/Transition.js';
import { DELMode } from './modes/DELmode.js';
import { drawRotateGate } from './ui/RotateGate.js';

const colyseusClient = new Client(
    window.location.hostname === 'localhost'
        ? 'ws://localhost:3000'
        : 'wss://' + window.location.hostname
);

// Larger font + tap tolerance on SMALL screens, purely for readability — decided by SCREEN
// SIZE, not touch. (Touch is unreliable: touchpads/drivers make non-touch desktops report
// touch, which is why a plain desktop was getting the mobile treatment.) This ONLY affects the
// font/tolerance — the LAYOUT is the desktop model on every device, so any normal-sized
// desktop or laptop looks identical everywhere. Judged on the screen's shorter side (stable,
// unlike the resizable window); tune the cutoff if a size feels wrong.
const SMALL_SCREEN_MAX = 800;   // shorter screen side (CSS px) below this → bigger font
const isMobile = Math.min(window.screen.width, window.screen.height) < SMALL_SCREEN_MAX;
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

// Logical resolution. Width is ALWAYS 1920. Height: the canvas GROWS to fill the window (up to
// 1080) but never shrinks below the maximized height — a smaller window just crops. So fullscreen
// fills the screen with the shader as usual, while the game's edge elements stay inside a centered
// "band" the size of the maximized viewport (see setBandHeight / bandTop): the top/bottom
// fullscreen margins are just shaded background, and leaving fullscreen crops them away with
// everything still visible.
//
// MOBILE uses this EXACT model — the ONLY difference is displayScale: the whole 1920-wide canvas
// is shrunk ONCE to fit the phone (so fullscreen shows the entire scene, not a 1920-wide crop),
// then it crops on shrink just like desktop. Desktop scale is 1 (shown 1:1) and a narrower window
// crops the sides; mobile's scale fits 1920×1080 into the device screen, so the full width always
// shows and only the height band crops.
const LOGICAL_W = 1920;
// One-time shrink-to-fit for small screens; 1 (native) on desktop. Based on the physical screen
// (stable), so the address bar showing/hiding only crops — it never rescales the world.
const displayScale = isMobile
    ? Math.min(Math.max(window.screen.width, window.screen.height) / LOGICAL_W,
               Math.min(window.screen.width, window.screen.height) / 1080)
    : 1;
let LOGICAL_H = Math.min((window.innerHeight || 1080) / displayScale, 1080);
// The layout's reference height: gaps scale relative to this, so the load-time
// layout is untouched and only a later resize (fullscreen) redistributes.
setBaseHeight(LOGICAL_H);
// The maximized (windowed) height — the content "band". Fullscreen grows the CANVAS past
// this, but edge elements stay within the band so they survive the crop back to maximized.
// It only ever grows (maximizing from a smaller window); a smaller window crops instead.
let maximizedH = LOGICAL_H;
setBandHeight(maximizedH);

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

// Position the canvas and CRT overlay in the window: shown at displayScale, centered. A viewport
// smaller than the scaled canvas crops the overflow (body is overflow:hidden); larger just adds
// shaded margin. Desktop scale is 1 (native 1920×LOGICAL_H); mobile is the shrink-to-fit factor.
function layoutDisplay() {
    const cssW = LOGICAL_W * displayScale;
    const cssH = LOGICAL_H * displayScale;
    applyDisplayRect(
        Math.round((window.innerWidth  - cssW) / 2),
        Math.round((window.innerHeight - cssH) / 2),
        Math.round(cssW),
        Math.round(cssH)
    );
}

resizeCanvas();

// Reposition the canvas immediately on resize (centered — a smaller window crops it), then —
// once the resize settles — re-fit the canvas height: fullscreen fills the window; windowed
// grows only up to the maximized height (smaller crops). Debounced.
let _refitTimer = null;
window.addEventListener('resize', () => {
    if (isPortraitGate()) { layoutGate(); return; }   // portrait mobile shows the rotate gate, not the game
    layoutDisplay();
    clearTimeout(_refitTimer);
    _refitTimer = setTimeout(refitToWindow, 150);
});

function refitToWindow() {
    // Viewport height in LOGICAL units (÷ displayScale, so mobile and desktop share this logic),
    // capped at the design height.
    const winH = Math.min((window.innerHeight || 1080) / displayScale, 1080);
    let h;
    if (document.fullscreenElement) {
        h = winH;                                  // fullscreen: canvas fills the screen (shader + all)
    } else {
        maximizedH = Math.max(maximizedH, winH);   // maximized is the content band; smaller only crops
        setBandHeight(maximizedH);
        h = maximizedH;
    }
    if (h === LOGICAL_H) return;
    LOGICAL_H = h;
    resizeCanvas();      // applies canvas.height = LOGICAL_H (CRT re-sizes on next render)
    layoutDisplay();
    relayoutCurrentScreen();
}

// ── Portrait rotate-gate (mobile) ───────────────────────────────────────────────
// The game is landscape-only. On a small screen held in PORTRAIT we hide the game and show the
// "ROTATE DEVICE" prompt; landscape plays as normal. While gated, the canvas swaps to a fixed
// portrait resolution so the prompt fills the phone (the CRT re-sizes to match on next render).
const GATE_W = 1080, GATE_H = 1920;
let gateActive = false;
let _gatePrevBlocked = false;

function isPortraitGate() {
    return isMobile && window.innerHeight > window.innerWidth;
}

// Contain-fit the portrait gate canvas in the viewport (no stretch → no distortion).
function layoutGate() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const aspect = GATE_W / GATE_H;
    let w, h;
    if (vw / vh > aspect) { h = vh; w = Math.round(h * aspect); }
    else { w = vw; h = Math.round(w / aspect); }
    applyDisplayRect(Math.round((vw - w) / 2), Math.round((vh - h) / 2), w, h);
}

function enterGate() {
    if (!gateActive) {              // save/suppress input only on the first entry…
        gateActive = true;
        _gatePrevBlocked = uiManager.blocked;
        uiManager.blocked = true;   // suppress UIManager input while the game is hidden
    }
    canvas.width = GATE_W;          // …but always (re)assert the portrait canvas, in case a
    canvas.height = GATE_H;         // gameStarted/reconnected resize changed it out from under us
    layoutGate();
}

function exitGate() {
    gateActive = false;
    uiManager.blocked = _gatePrevBlocked;
    uiManager.lastTime = performance.now();   // don't fold the gated time into the next update dt
    resizeCanvas();      // back to the landscape game resolution
    layoutDisplay();
    relayoutCurrentScreen();
}

// Best-effort: ask the browser to lock landscape. Only works fullscreen on some Android browsers
// (iOS/desktop reject it), so failures are ignored — the visual gate is the real fallback.
function tryLockLandscape() {
    try {
        const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape');
        if (p && p.catch) p.catch(() => {});
    } catch (_) { /* unsupported */ }
}
if (isMobile) tryLockLandscape();

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
        lobbyScreen.resetToDefault();   // a freshly created room always starts clean (return-to-lobby keeps settings)
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

let gameOverBtns = { playAgain: null, returnToLobby: null, mainMenu: null };
let gameCopyBtn = null;

// Register the in-game COPY CODE button (top-left, under the room code). Called at each
// game entry, after uiManager.clear(). The room code text itself is drawn by GameScreen.
function setupGameHud() {
    gameCopyBtn = makeBracketButton('COPY CODE', gameScreen.copyBtnX, gameScreen.copyBtnY,
        copyGameCode, { hitPad: 20 });
    uiManager.buttons.push(gameCopyBtn);
}

function copyGameCode() {
    if (!navigator.clipboard || !gameScreen.roomCode) return;
    navigator.clipboard.writeText(gameScreen.roomCode).then(() => {
        const b = gameCopyBtn;
        if (!b) return;
        b.label = 'COPIED!';
        b.active = true; // hold the brackets inner while showing COPIED!
        setTimeout(() => { if (b.label === 'COPIED!') { b.label = 'COPY CODE'; b.active = false; } }, 1500);
    }).catch(() => {});
}

// Position the game-over buttons relative to the game box (centered on its X, stacked
// below its vertical center). Called every frame while the overlay is up so they move
// WITH the box on a window/fullscreen change instead of staying where they were created.
function layoutGameOverButtons() {
    const cx = gameScreen.boxCenterX;   // box X is fixed; box Y is canvas.height/2
    const cy = canvas.height / 2;
    if (gameOverBtns.playAgain) { gameOverBtns.playAgain.x = cx; gameOverBtns.playAgain.y = cy + 60; }
    if (gameOverBtns.returnToLobby) { gameOverBtns.returnToLobby.x = cx; gameOverBtns.returnToLobby.y = cy + 155; }
    if (gameOverBtns.mainMenu) { gameOverBtns.mainMenu.x = cx; gameOverBtns.mainMenu.y = cy + 250; }
}

// PLAY AGAIN needs at least two connected players, so disable it (dim + non-interactive)
// when the winner is the only one left. Re-checked on every player-list update too.
function updatePlayAgainState() {
    if (!gameOverBtns.playAgain) return;
    const connected = playerList.filter(p => p.connected).length;
    gameOverBtns.playAgain.disabled = connected <= 1;
}

function showGameOverOverlay(winner) {
    winnerId = winner;
    uiManager.clear();
    // Same interaction/look as the lobby's REDACTED/FREQUENCY mode buttons: fire on
    // release, no glow pulse, '*' corners.
    const modeOpts = { fireOnRelease: true, noGlow: true, corner: '*' };
    gameOverBtns.playAgain = makeButton('PLAY AGAIN', 0, 0,
        () => room.send('votePlayAgain'), modeOpts);
    gameOverBtns.returnToLobby = makeButton('RETURN TO LOBBY', 0, 0,
        () => room.send('voteReturnToLobby'), modeOpts);
    gameOverBtns.mainMenu = makeButton('MAIN MENU', 0, 0,   // a normal button — not a vote toggle
        () => { hideGameOverOverlay(); room.send('leaveToMenu'); }, { blocksInput: true });

    uiManager.buttons.push(gameOverBtns.playAgain);
    uiManager.buttons.push(gameOverBtns.returnToLobby);
    uiManager.buttons.push(gameOverBtns.mainMenu);
    layoutGameOverButtons();
    updatePlayAgainState();

    // Keep COPY CODE alive through game over (cleared above) — it stays visible/clickable.
    if (gameCopyBtn) uiManager.buttons.push(gameCopyBtn);
    else setupGameHud();
}

function hideGameOverOverlay() {
    winnerId = null;
    uiManager.clear();
    gameOverBtns.playAgain = null;
    gameOverBtns.returnToLobby = null;
    gameOverBtns.mainMenu = null;
}

// --- Room Messages ---

function setupRoomMessages(isReconnecting = false) {
    if (!isReconnecting) room.send('clientReady');
    // Per-char collision radii (from the font + fixed play-box size). The server
    // stores them so its wall bounce keeps each glyph's edge off the frame.
    room.send('charRadii', gameScreen.charRadii());
    // Build the glyph atlas now (idle lobby time) so the first round doesn't hitch as
    // each character is rasterized on first appearance.
    gameScreen.prewarmGlyphs();

    room.onMessage('roomCode', (data) => {
        lobbyScreen.setRoomCode(data.code);
        gameScreen.setRoomCode(data.code);
        maybeEnterLobby();
    });

    room.onMessage('playerList', (data) => {
        playerList = data.players;
        const me = data.players.find(p => p.id === room.sessionId);
        isHost = me ? me.isHost : false;
        lobbyScreen.setHost(isHost);
        lobbyScreen.setPlayers(data.players);
        if (currentMode) currentMode.onMessage('playerList', data);
        updatePlayAgainState();   // a player leaving during game over may disable PLAY AGAIN
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
        setupGameHud();
        resizeCanvas();
    });

    room.onMessage('gameRestarted', (data) => {
        if (transition.isActive()) transition.cancelToEnd();
        if (currentMode) currentMode.reset();
        if (data.mode) currentMode = createMode(data.mode, data);
        // reset() zeroes these; gameRestarted carries no `mode`, so createMode is skipped —
        // restore them here or the match-win "(x)" counter (guarded on totalMatches>1) vanishes.
        if (currentMode) { currentMode.totalMatches = data.totalMatches || 1; currentMode.currentMatch = data.match || 1; }
        currentScreen = 'game';
        hideGameOverOverlay();   // clears uiManager (incl. the copy button)…
        setupGameHud();          // …so re-register it
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
                setupGameHud();
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
            gameScreen.setMode(modeId);   // GameScreen shows/hides the Round label by mode
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

// Bottom-right HUD buttons sit this far above the bottom edge. The gap shrinks as the
// window falls below fullscreen height (1080 = LOGICAL_H cap), so the buttons drop lower
// — clear of the centered game box and its Round text — when just maximized, instead of
// crowding up against the box. Clamped so they never reach the very edge. 0.3 = how fast
// they drop; raise to drop them faster when maximized.
function hudBtnGap() {
    return Math.max(45, 90 - (1080 - maximizedH) * 0.3);
}

const hudItems = [
    {
        id: 'settings',
        hover: 0, z: HUD_Z_REST, releasePhase: null, glowT: 0, _rect: null,
        _animT: 0, _char: SETTINGS_REST_CHAR,
        typeChars: SETTINGS_REST_CHAR,
        getRect() { return { x: canvas.width - 200, y: canvas.height - bandTop(canvas) - hudBtnGap(), w: 60, h: 40 }; },
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
        getRect() { return { x: canvas.width - 120, y: canvas.height - bandTop(canvas) - hudBtnGap(), w: 70, h: 40 }; },
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
    return { x: canvas.width - 216, y: canvas.height - bandTop(canvas) - 148, w: 208, h: 76 };
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
        // COPY CODE is always visible (including the game-over overlay).
        if (gameCopyBtn) {
            gameCopyBtn.x = gameScreen.copyBtnX;   // follow the room code (centered under it)
            gameCopyBtn.y = gameScreen.copyBtnY;
            drawBracketButton(ctx, gameCopyBtn, uiManager.elapsed, FONT_SIZE);
        }
        // Game-over voting buttons — relayout to the box each frame so they track it on a
        // window/fullscreen change, then draw (normal style; skip the bracket button above).
        if (winnerId) {
            layoutGameOverButtons();
            uiManager.buttons.forEach(btn => {
                if (!btn.bracket) drawButton(ctx, btn, uiManager.elapsed, FONT_SIZE);
            });
        }
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
    if (gateActive) return;   // portrait rotate gate — ignore input
    if (transition.isActive() || modalMessage || hudIntroPending) return;
    const { x, y } = hudEventPos(e);
    hudOnMouseDown(x, y);
    // Game: a press on the target registers the tap NOW (so a hold still counts as the target
    // slides away) and begins the press-dim; a press elsewhere in the field glitches.
    if (currentScreen === 'game' && currentMode && !settingsPanelOpen
        && !currentMode.countdownActive && !currentMode.showRoundOver
        && !currentMode.showMatchOver && !currentMode.winnerId) {
        const cx = x - gameScreen.boxCenterX, cy = y - canvas.height / 2;
        const hit = currentMode.hitTest(gameScreen, cx, cy);
        if (hit) {
            room.send('tap', { nx: hit.nx, ny: hit.ny, time: Date.now() });
            gameScreen.pressTarget();            // hold-to-press the target
        } else if (gameScreen.isInPlayField(cx, cy)) {
            gameScreen.triggerGlitch();          // missed inside the field — scramble
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (gateActive) return;   // portrait rotate gate — ignore input
    const { x, y } = hudEventPos(e);
    hudOnMouseUp(x, y);
    gameScreen.releaseTarget();   // end the target press → glow (no-op if not held)
});

canvas.addEventListener('click', (e) => {
    if (gateActive) return;   // portrait rotate gate — ignore input
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

    // Game taps (target press/glow + miss glitch) are handled on mousedown/mouseup above so a
    // hold registers correctly — nothing to do here for the game screen.
});

requestAnimationFrame(loop);

function loop() {
    if (isPortraitGate()) {
        if (!gateActive || canvas.width !== GATE_W) enterGate();
        drawRotateGate(ctx, canvas.width, canvas.height);
    } else {
        if (gateActive) exitGate();
        draw();
    }
    crt.render(performance.now() / 1000);
    requestAnimationFrame(loop);
}