const express = require('express');
const { createServer } = require('http');
const { Server } = require('@colyseus/core');
const GameRoom = require('./GameRoom');

const app = express();
app.use(express.json());

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

app.use('/colyseus', express.static('node_modules/@colyseus/sdk/dist'));
app.use(express.static('.'));

const PORT = process.env.PORT || 3000;
gameServer.listen(PORT, () => {
    console.log('Server running on port', PORT);
});