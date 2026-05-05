const express = require('express');
const { createServer } = require('http');
const { Server } = require('colyseus');
const GameRoom = require('./GameRoom');

const app = express();
app.use(express.json());
app.use(express.static('.'));

const gameServer = new Server({
    server: createServer(app)
});

gameServer.define('game_room', GameRoom);

const PORT = process.env.PORT || 3000;
gameServer.listen(PORT, () => {
    console.log('Server running on port', PORT);
});