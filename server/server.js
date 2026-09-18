import express from 'express';
import { createServer } from 'http';
import { Server } from '@colyseus/core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { GameRoom } from './GameRoom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Serve the BUILD whenever one exists, falling back to the raw sources only if it doesn't.
// This used to key off NODE_ENV alone, which is a silent trap on a host that doesn't set it:
// client/game.js imports the bare specifier '@colyseus/sdk', which no browser can resolve — only
// Vite (dev server) or the build does. Serving client/ in production therefore yields a blank
// page. Checking for the build itself can't be got wrong. In dev the Vite server serves the
// client on its own port, so nothing here affects that.
const distDir = join(__dirname, '../dist');
const clientDir = existsSync(join(distDir, 'index.html')) ? distDir : join(__dirname, '../client');

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
    // Say which client is being served — the one thing worth seeing in a deploy log, since
    // serving the raw sources means the build step didn't run.
    console.log('Serving client from', clientDir === distDir ? 'dist/ (built)' : 'client/ (RAW SOURCES — run npm run build)');
});