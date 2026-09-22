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

// DISCORD IDENTITY. The Activity asks Discord who is playing so nobody has to type their name
// into a lobby they were put in automatically. Discord answers that with OAuth, and the middle
// step of OAuth needs the app's client SECRET — which must never be shipped to a browser. So the
// browser sends us the short-lived code it got from Discord, and we do the exchange here.
//
// Nothing else happens with the token: it goes straight back to the page, which hands it to the
// Discord SDK to learn its own name. We store nothing and ask for one scope, `identify`.
//
// INERT BY DEFAULT: with DISCORD_CLIENT_SECRET unset the route is never registered at all, so
// every existing deployment is unchanged.
const DISCORD_CLIENT_ID = (process.env.DISCORD_CLIENT_ID || '').trim();
const DISCORD_CLIENT_SECRET = (process.env.DISCORD_CLIENT_SECRET || '').trim();
if (DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET) {
    app.post('/discord/token', async (req, res) => {
        const code = req.body && req.body.code;
        if (typeof code !== 'string' || !code) return res.status(400).json({ error: 'no code' });
        try {
            const r = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: DISCORD_CLIENT_ID,
                    client_secret: DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code,
                }),
            });
            const data = await r.json();
            // Hand back ONLY the access token. Discord's reply also carries a refresh token, and
            // the page has no use for one — the activity is over when the player closes it.
            if (!r.ok || !data.access_token) {
                console.warn('Discord token exchange failed:', r.status);
                return res.status(502).json({ error: 'exchange failed' });
            }
            res.json({ access_token: data.access_token });
        } catch (err) {
            console.warn('Discord token exchange error:', err.message);
            res.status(502).json({ error: 'exchange failed' });
        }
    });
    console.log('Discord identity endpoint enabled');
}

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

// `filterBy` makes matchmaking compare the room's discordInstance against the joining client's.
// That is what lets everyone who opens the Activity in one voice channel land in one room without
// typing anything: they all send the same instance id, so joinOrCreate finds the room the first of
// them made. It also keeps the two worlds apart, which is what we want — web players calling
// QUICK JOIN send no instance id, so they match only rooms created without one and can never be
// dropped into a Discord call's private game.
gameServer.define('game_room', GameRoom).filterBy(['discordInstance']).on('create', (room) => {
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