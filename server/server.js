import express from 'express';
import { createServer } from 'http';
import { Server } from '@colyseus/core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GameRoom } from './GameRoom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = process.env.NODE_ENV === 'production' 
    ? join(__dirname, '../dist')
    : join(__dirname, '../client');

const app = express();
app.use(express.json());
app.use('/colyseus', express.static(join(__dirname, '../node_modules/@colyseus/sdk/dist')));
app.use(express.static(clientDir));

const gameServer = new Server({
    server: createServer(app)
});

const roomCodes = {};

gameServer.define('game_room', GameRoom).on('create', (room) => {
    roomCodes[room.roomCode] = room.roomId;
}).on('dispose', (room) => {
    delete roomCodes[room.roomCode];
});

app.get('/join/:code', (req, res) => {
    const roomId = roomCodes[req.params.code.toUpperCase()];
    if (roomId) {
        res.json({ roomId });
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

const PORT = process.env.PORT || 3000;
gameServer.listen(PORT, () => {
    console.log('Server running on port', PORT);
});