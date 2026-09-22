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

// CROSS-ORIGIN. The itch.io build of the client is served from itch's own domain and calls this
// server for the room-code lookup and the lives clock; browsers refuse those answers unless the
// server says any page may read them. Both routes are public, read-only lookups, so it does.
// (Colyseus sends its own headers for its matchmaking routes; the game socket isn't subject to
// this check at all.)
app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);   // a preflight wants only the headers
    next();
});

// The clock the solo lives system trusts. A player's device clock is theirs to change; this one
// isn't, so "lives come back tomorrow" can't be skipped by setting the date forward. The client
// pairs this with its own timezone offset to find ITS local midnight (see client/solo/lives.js).
app.get('/time', (_req, res) => {
    res.set('Cache-Control', 'no-store');   // never let a proxy or the browser serve a stale time
    res.json({ now: Date.now() });
});
app.use('/colyseus', express.static(join(__dirname, '../node_modules/@colyseus/sdk/dist')));

// DISCORD ACTIVITY. Discord serves the game from a domain of its own and proxies one prefix back
// to a host we name. That prefix has to be '/', because Discord only accepts a bare hostname as a
// proxy target — no sub-path — so the host's ROOT must hand back the Discord build rather than the
// website's. Both builds are the same game; they differ only in a few compile-time flags.
//
// Rather than split the deployment, this serves whichever build matches the hostname the request
// arrived on. Point Discord at a second domain on this same service and everything else — the
// game socket, /join and /time — keeps working over that one mapping, because it is all one
// server either way.
//
// INERT BY DEFAULT: with DISCORD_HOST unset, or the build missing, this adds nothing to the
// request path at all and the site behaves exactly as it always has.
const discordDir = join(__dirname, '../dist-discord');
const DISCORD_HOST = (process.env.DISCORD_HOST || '').trim().toLowerCase();
if (DISCORD_HOST && existsSync(join(discordDir, 'index.html'))) {
    const serveDiscord = express.static(discordDir);
    app.use((req, res, next) => (req.hostname || '').toLowerCase() === DISCORD_HOST
        ? serveDiscord(req, res, next)
        : next());
    console.log(`Discord Activity build served on ${DISCORD_HOST}`);
}

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