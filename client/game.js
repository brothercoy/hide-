import { GAME_MODES } from '../gameModes.js';
import { Client } from '@colyseus/sdk';

const colyseusClient = new Client(
    window.location.hostname === 'localhost'
    ? 'ws://localhost:3000'
    : 'wss://' + window.location.hostname
);

const TICK_RATE = 50;

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

function renderLobbySettings(modeId, isHost) {
    const mode = GAME_MODES[modeId];
    document.getElementById('mode-description').textContent = mode.description;

    const panel = document.getElementById('settings-panel');
    panel.innerHTML = '';

    Object.entries(mode.settingsOptions).forEach(([key, setting]) => {
        const row = document.createElement('div');
        row.className = 'setting-row';

        const label = document.createElement('div');
        label.className = 'setting-label';

        const labelText = document.createElement('span');
        labelText.textContent = setting.label;

        const valueText = document.createElement('span');
        valueText.id = `setting-value-${key}`;

        label.appendChild(labelText);
        label.appendChild(valueText);
        row.appendChild(label);

        if (setting.options) {
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'speed-options';
            setting.options.forEach((val, i) => {
                const btn = document.createElement('button');
                btn.className = 'speed-btn' + (val === setting.default ? ' active' : '');
                btn.textContent = setting.labels[i];
                btn.dataset.value = val;
                if (isHost) {
                    btn.addEventListener('click', () => {
                        optionsDiv.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        selectedSettings[key] = val;
                    });
                } else {
                    btn.disabled = true;
                }
                optionsDiv.appendChild(btn);
            });
            selectedSettings[key] = setting.default;
            row.appendChild(optionsDiv);
        } else {
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'setting-slider';
            slider.min = setting.min;
            slider.max = setting.max;
            slider.value = setting.default;
            valueText.textContent = setting.default + (setting.unit || '');
            selectedSettings[key] = setting.default;

            if (isHost) {
                slider.addEventListener('input', () => {
                    selectedSettings[key] = parseFloat(slider.value);
                    valueText.textContent = slider.value + (setting.unit || '');
                });
            } else {
                slider.disabled = true;
            }
            row.appendChild(slider);
        }

        panel.appendChild(row);
    });
}

async function tryReconnect() {
    const token = localStorage.getItem('reconnectionToken');
    if (!token) return;
    try {
        const r = await colyseusClient.reconnect(token);
        room = r;
        localStorage.setItem('reconnectionToken', room.reconnectionToken);
        document.getElementById('menu').style.display = 'none';
        document.getElementById('lobby').style.display = 'flex';
        setupRoomMessages(true);
    } catch (e) {
        localStorage.removeItem('reconnectionToken');
    }
}

window.addEventListener('load', tryReconnect);

document.getElementById('create-btn').addEventListener('click', () => {
    playerName = document.getElementById('name-input').value.trim();
    if (!playerName) { alert('Please enter your name'); return; }
    joinGame('create');
});

document.getElementById('join-btn').addEventListener('click', () => {
    playerName = document.getElementById('name-input').value.trim();
    const code = document.getElementById('code-input').value.trim().toUpperCase();
    if (!playerName) { alert('Please enter your name'); return; }
    if (!code) { alert('Please enter a room code'); return; }
    joinGame('join', code);
});

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedMode = btn.dataset.mode;
        renderLobbySettings(selectedMode, true);
    });
});

document.getElementById('start-btn').addEventListener('click', () => {
    if (!selectedMode) { alert('Please select a game mode.'); return; }
    room.send('startGame', { mode: selectedMode, settings: selectedSettings });
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
                    alert('Room not found. Check the code and try again.');
                }
            })
            .catch(() => {
                alert('Room not found. Check the code and try again.');
            });
    }
}

function onRoomJoined(r) {
    room = r;
    localStorage.setItem('reconnectionToken', room.reconnectionToken);

    room.onLeave(() => {
        localStorage.removeItem('reconnectionToken');
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('game').style.display = 'none';
        document.getElementById('menu').style.display = 'flex';
        resetGameState();
    });

    document.getElementById('menu').style.display = 'none';
    document.getElementById('lobby').style.display = 'flex';
    setupRoomMessages();
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
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const boxW = canvas.width - 192;
const boxH = canvas.height - 192;

ctx.font = '24px monospace';

function renderLobbyPlayerList() {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    playerList.forEach(p => {
        const entry = document.createElement('p');
        entry.id = 'player-' + p.id;
        entry.textContent = p.name;
        entry.style.opacity = p.connected ? '1' : '0.4';
        list.appendChild(entry);
    });
}

function setupRoomMessages(isReconnecting = false) {
    if (!isReconnecting) {
        room.send('clientReady');
    }

    room.onMessage('roomCode', (data) => {
        document.getElementById('room-code-display').textContent = data.code;
    });

    room.onMessage('playerList', (data) => {
        playerList = data.players;
        renderLobbyPlayerList();
    });

    room.onMessage('startError', (data) => {
        alert(data.message);
    });

    room.onMessage('gameStarted', (data) => {
        chars = data.chars;
        prevChars = data.chars.map(c => ({ ...c }));
        targetChar = data.targetChar;
        timeLeft = data.timeLeft;
        currentRound = data.round;
        currentMatch = data.match;
        totalMatches = data.totalMatches;
        lastUpdateTime = Date.now();
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('game').style.display = 'block';
        resizeCanvas();
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
        eliminatedName = data.eliminatedName;
        showRoundOver = true;
    });

    room.onMessage('timeUp', (data) => {
        eliminatedName = data.eliminatedNames.join(', ');
        showRoundOver = true;
    });

    room.onMessage('newRound', (data) => {
        targetChar = data.targetChar;
        chars = data.chars;
        prevChars = data.chars.map(c => ({ ...c }));
        lastUpdateTime = Date.now();
        currentRound = data.round;
        currentMatch = data.match;
        showRoundOver = false;
        eliminatedName = null;
    });

    room.onMessage('matchOver', (data) => {
        showMatchOver = true;
        matchOverData = data;
        showRoundOver = false;
        eliminatedName = null;
    });

    room.onMessage('newMatch', (data) => {
        targetChar = data.targetChar;
        chars = data.chars;
        prevChars = data.chars.map(c => ({ ...c }));
        lastUpdateTime = Date.now();
        currentRound = data.round;
        currentMatch = data.match;
        showMatchOver = false;
        showRoundOver = false;
        eliminatedName = null;
        matchOverData = null;
    });

    room.onMessage('reconnected', (data) => {
        chars = data.chars;
        prevChars = data.chars.map(c => ({ ...c }));
        targetChar = data.targetChar;
        timeLeft = data.timeLeft;
        currentRound = data.round;
        currentMatch = data.match;
        totalMatches = data.totalMatches;
        lastUpdateTime = Date.now();
        if (data.gameStarted) {
            document.getElementById('lobby').style.display = 'none';
            document.getElementById('game').style.display = 'block';
            resizeCanvas();
        }
    });

    room.onMessage('gameOver', (data) => {
        winnerId = data.winnerName || 'Nobody';
    });
}

function getMetrics(char) {
    const metrics = ctx.measureText(char);
    const width = metrics.width;
    const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const radius = Math.sqrt(width * width + height * height) / 2;
    const ascent = metrics.actualBoundingBoxAscent;
    return { width, height, radius, ascent };
}

function toPixels(nx, ny) {
    return {
        px: nx * boxW / 2,
        py: ny * boxH / 2
    };
}

function toNormalized(px, py) {
    return {
        nx: px / (boxW / 2),
        ny: py / (boxH / 2)
    };
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);

    ctx.fillStyle = 'white';
    ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);

    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

    ctx.font = '24px monospace';
    ctx.fillStyle = 'black';

    const now = Date.now();
    const t = lastUpdateTime ? Math.min((now - lastUpdateTime) / TICK_RATE, 1) : 0;

    chars.forEach((c, i) => {
        const prev = prevChars[i] || c;
        const ix = prev.x + (c.x - prev.x) * t;
        const iy = prev.y + (c.y - prev.y) * t;
        const { px, py } = toPixels(ix, iy);
        const m = getMetrics(c.char);

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(c.rotation);
        ctx.fillText(c.char, -m.width / 2, m.ascent - m.height / 2);
        ctx.restore();
    });

    // player list top right
    ctx.textAlign = 'right';
    ctx.font = '18px monospace';
    const listX = boxW / 2 - 10;
    let listY = -boxH / 2 + 30;
    playerList.forEach(p => {
        ctx.globalAlpha = p.tapped ? 1 : 0.3;
        if (!p.alive) ctx.globalAlpha = 0.1;
        ctx.fillStyle = 'black';
        const winsText = totalMatches > 1 ? ` (${p.matchWins || 0})` : '';
        ctx.fillText(p.name + winsText, listX, listY);
        listY += 24;
    });
    ctx.globalAlpha = 1;

    // top UI
    ctx.font = '32px monospace';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    if (totalMatches > 1) {
        ctx.fillText(`Match ${currentMatch}/${totalMatches} · Round ${currentRound}`, 0, -boxH / 2 - 50);
    } else {
        ctx.fillText('Round ' + currentRound, 0, -boxH / 2 - 50);
    }
    ctx.fillText(Math.ceil(timeLeft) + 's', 0, -boxH / 2 - 20);
    ctx.fillText('Find: ' + targetChar, 0, boxH / 2 + 40);

    // overlays
    if (winnerId) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(-200, -80, 400, 160);
        ctx.fillStyle = 'black';
        ctx.font = '28px monospace';
        ctx.fillText('Game Over!', 0, -40);
        ctx.font = '18px monospace';
        ctx.fillText('Winner: ' + winnerId, 0, 0);
        if (matchOverData) {
            let scoreY = 30;
            Object.entries(matchOverData.matchWins || {}).forEach(([name, wins]) => {
                ctx.fillText(`${name}: ${wins} win${wins !== 1 ? 's' : ''}`, 0, scoreY);
                scoreY += 24;
            });
        }
    } else if (showMatchOver && matchOverData) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(-200, -80, 400, 160);
        ctx.fillStyle = 'black';
        ctx.font = '28px monospace';
        ctx.fillText(`Match ${matchOverData.match} Over!`, 0, -40);
        ctx.font = '18px monospace';
        ctx.fillText('Winner: ' + matchOverData.matchWinnerName, 0, 0);
        let scoreY = 30;
        Object.entries(matchOverData.matchWins || {}).forEach(([name, wins]) => {
            ctx.fillText(`${name}: ${wins} win${wins !== 1 ? 's' : ''}`, 0, scoreY);
            scoreY += 24;
        });
    } else if (showRoundOver) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(-200, -60, 400, 120);
        ctx.fillStyle = 'black';
        ctx.font = '28px monospace';
        ctx.fillText('Eliminated!', 0, -20);
        ctx.font = '18px monospace';
        ctx.fillText(eliminatedName, 0, 20);
    }

    ctx.restore();
}

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left - canvas.width / 2;
    const clickY = e.clientY - rect.top - canvas.height / 2;
    const { nx, ny } = toNormalized(clickX, clickY);

    chars.forEach(c => {
        if (!c.isTarget) return;
        const { px, py } = toPixels(c.x, c.y);
        const m = getMetrics(c.char);
        const centerY = py - m.ascent + m.height / 2;
        const dist = Math.sqrt((clickX - px) ** 2 + (clickY - centerY) ** 2);
        if (dist < m.radius + 20) {
            room.send('tap', { nx, ny, time: Date.now() });
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }
});

requestAnimationFrame(loop);

function loop() {
    draw();
    requestAnimationFrame(loop);
}