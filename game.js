const colyseusClient = new Colyseus.Client(
    window.location.hostname === 'localhost'
    ? 'ws://localhost:3000'
    : 'wss://' + window.location.hostname
);

let room;
let targetChar = null;
let chars = [];
let prevChars = [];
let lastUpdateTime = null;
const TICK_RATE = 50;
let currentRound = 1;
let eliminatedId = null;
let winnerId = null;
let tappedPlayers = [];
let showRoundOver = false;
let playerName = '';
let timeLeft = 30;

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

document.getElementById('start-btn').addEventListener('click', () => {
    room.send('startGame');
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
    document.getElementById('menu').style.display = 'none';
    document.getElementById('lobby').style.display = 'flex';
    setupRoomMessages();
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

function setupRoomMessages() {
    room.onMessage('gameState', (data) => {
        chars = data.chars;
        prevChars = data.chars.map(c => ({ ...c }));
        targetChar = data.targetChar;
        timeLeft = data.timeLeft;
        lastUpdateTime = Date.now();
    });

    room.onMessage('existingPlayers', (data) => {
        const playerList = document.getElementById('player-list');
        data.players.forEach(p => {
            if (document.getElementById('player-' + p.id)) return;
            const entry = document.createElement('p');
            entry.id = 'player-' + p.id;
            entry.textContent = p.name;
            playerList.appendChild(entry);
        });
    });

    room.onMessage('roomCode', (data) => {
        document.getElementById('room-code-display').textContent = data.code;
        const playerList = document.getElementById('player-list');
        const entry = document.createElement('p');
        entry.id = 'player-' + room.sessionId;
        entry.textContent = playerName;
        playerList.appendChild(entry);
    });

    room.onMessage('charUpdate', (data) => {
        prevChars = chars.map(c => ({ ...c }));
        chars = data.chars;
        timeLeft = data.timeLeft;
        lastUpdateTime = Date.now();
    });

    room.onMessage('timeUp', (data) => {
        eliminatedId = data.eliminatedIds.join(', ');
        showRoundOver = true;
    });

    room.onMessage('playerJoined', (data) => {
        if (data.id === room.sessionId) return;
        const playerList = document.getElementById('player-list');
        const entry = document.createElement('p');
        entry.id = 'player-' + data.id;
        entry.textContent = data.name;
        playerList.appendChild(entry);
    });

    room.onMessage('playerLeft', (data) => {
        const entry = document.getElementById('player-' + data.id);
        if (entry) entry.remove();
    });

    room.onMessage('gameStarted', () => {
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('game').style.display = 'block';
        resizeCanvas();
    });

    room.onMessage('playerTapped', (data) => {
        tappedPlayers.push(data.id);
    });

    room.onMessage('roundOver', (data) => {
        eliminatedId = data.eliminatedId;
        showRoundOver = true;
    });

    room.onMessage('newRound', (data) => {
        targetChar = data.targetChar;
        chars = data.chars;
        prevChars = data.chars.map(c => ({ ...c }));
        lastUpdateTime = Date.now();
        currentRound = data.round;
        tappedPlayers = [];
        showRoundOver = false;
        eliminatedId = null;
    });

    room.onMessage('gameOver', (data) => {
        winnerId = data.winnerName || 'Nobody';
    });

    room.send('clientReady');
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
        const ir = c.rotation;

        const { px, py } = toPixels(ix, iy);
        const m = getMetrics(c.char);

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ir);
        ctx.fillText(c.char, -m.width / 2, m.ascent - m.height / 2);
        ctx.restore();
    });

    ctx.font = '32px monospace';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.fillText('Round ' + currentRound, 0, -boxH / 2 - 50);
    ctx.fillText(Math.ceil(timeLeft) + 's', 0, -boxH / 2 - 20);
    ctx.fillText('Find: ' + targetChar, 0, boxH / 2 + 40);
    ctx.fillText('Found: ' + tappedPlayers.length, 0, boxH / 2 + 80);

    if (winnerId) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(-200, -60, 400, 120);
        ctx.fillStyle = 'black';
        ctx.font = '28px monospace';
        ctx.fillText('Winner!', 0, -20);
        ctx.font = '18px monospace';
        ctx.fillText(winnerId, 0, 20);
    } else if (showRoundOver) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(-200, -60, 400, 120);
        ctx.fillStyle = 'black';
        ctx.font = '28px monospace';
        ctx.fillText('Eliminated!', 0, -20);
        ctx.font = '18px monospace';
        ctx.fillText(eliminatedId, 0, 20);
    }

    ctx.restore();
}

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left - canvas.width / 2;
    const clickY = e.clientY - rect.top - canvas.height / 2;

    const { nx, ny } = toNormalized(clickX, clickY);

    chars.forEach((c, i) => {
        if (!c.isTarget) return;
        const { px, py } = toPixels(c.x, c.y);
        const m = getMetrics(c.char);
        const centerY = py - m.ascent + m.height / 2;
        const dist = Math.sqrt((clickX - px) ** 2 + (clickY - centerY) ** 2);
        if (dist < m.radius + 20) {
            console.log('Found the target!');
            room.send('tap', { nx, ny, time: Date.now() });
        }
    });
});

function loop() {
    draw();
    requestAnimationFrame(loop);
}

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