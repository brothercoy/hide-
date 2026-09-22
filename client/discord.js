// DISCORD ACTIVITY — everything Discord-specific, kept in this one file.
//
// An Activity is the game running in an iframe inside Discord, served from Discord's own domain
// (https://<application id>.discordsays.com) and proxied back to hide-ascii.com. It is the same
// situation as the itch.io build, so most of what that needed already applies: relative asset
// paths, a guarded localStorage, and the embedded display mode.
//
// NOTHING HERE REACHES THE LIVE SITE. Every entry point is behind `import.meta.env.VITE_DISCORD`,
// which Vite replaces with a literal at build time — so in the normal and itch builds the checks
// below become `undefined === '1'`, Rollup deletes the branches, and the dynamic import of the SDK
// is never reachable. The live bundle is byte-identical to a build made without this file.
//
// Two facts about the environment drive the rest of the game's wiring, and both happen to be
// already handled:
//   · The page is served from Discord's domain, and Discord's proxy maps '/' onto hide-ascii.com.
//     So a RELATIVE url is the correct one: `/time` and `/join/CODE` resolve to the proxy and come
//     back from the real server. game.js already falls back to relative + `wss://<page host>` when
//     VITE_SERVER_URL is unset, which is exactly right, so the Discord build sets no server url.
//   · Saves live on Discord's domain, so they are a SEPARATE SILO from hide-ascii.com and itch.
//     A player's campaign does not carry over, and does not sync between Discord desktop, web and
//     mobile. Nothing is lost; it is simply a different save file.

// Discord launches the iframe with `frame_id`, `instance_id` and `platform` in the query string.
// Their presence is the only reliable way to know we are really inside an Activity — the build
// flag says the bundle CAN be one, this says it IS one right now. The SDK constructor throws when
// they are missing, so nothing below may run without this.
export function isDiscord() {
    if (import.meta.env.VITE_DISCORD !== '1') return false;
    try { return new URLSearchParams(window.location.search).get('frame_id') != null; }
    catch (_) { return false; }
}

// Colyseus' own Discord support fights us here, so it has to be switched off.
//
// Its Client constructor sniffs for 'discordsays.com' in the page hostname and, finding it,
// installs a url builder that rewrites every request to `/.proxy/colyseus/<subdomain>/…`. That
// assumes the game server is a SEPARATE host from the page, reached through its own `/colyseus`
// mapping — the Colyseus Cloud arrangement. Ours is not: one Railway process serves the client,
// the socket, /join and /time, so a single '/' mapping already covers all of it and that rewrite
// would send the socket to a path that does not exist. Handing the constructor a builder of our
// own is the documented way to opt out, and the identity function leaves the url alone.
export const identityUrlBuilder = (url) => url.toString();

let sdk = null;
let user = null;
let booting = null;

// Boot the SDK, then ask Discord who is playing. Discord holds its own loading screen over the
// iframe until the handshake completes, so this must run — but it must not gate the game: if any
// of it fails, the player still gets a playable screen rather than a black one, and multiplayer
// falls back to the ordinary name-and-code path. Failures are therefore logged and swallowed.
//
// The SDK is imported DYNAMICALLY so it lands in its own chunk instead of the main bundle, and so
// the normal build never pulls it in at all.
//
// Called once at boot and awaited again later by whoever needs the answer, so the promise is kept
// rather than the work repeated.
export function initDiscord() {
    if (!booting) booting = boot();
    return booting;
}

// Resolves once the handshake has finished, successfully or not. Anything that needs to know who
// the player is awaits this rather than assuming boot has got there yet: Discord dismisses its
// loading screen when `ready()` resolves, which is BEFORE the identify round-trip is done, so a
// fast player can reach the menu first.
export function discordReady() {
    return booting || Promise.resolve(null);
}

async function boot() {
    if (!isDiscord()) return null;
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    if (!clientId) { console.warn('Discord: no VITE_DISCORD_CLIENT_ID in this build'); return null; }
    try {
        const { DiscordSDK } = await import('@discord/embedded-app-sdk');
        sdk = new DiscordSDK(clientId);
        await sdk.ready();
    } catch (err) {
        console.warn('Discord: the SDK did not start; the game runs anyway.', err);
        sdk = null;
        return null;
    }
    await identify(clientId);
    return sdk;
}

// WHO IS PLAYING. Discord will hand over the list of everyone connected to the activity without
// any permission at all, but it will not say which of them is THIS player — and that is the one
// thing needed to put a name on a lobby row. Only the OAuth handshake answers it, so the game does
// the smallest possible version: the `identify` scope, nothing else.
//
// The exchange in the middle has to happen on our server, because it needs the app's client
// SECRET, which must never reach a browser. See the /discord/token route in server/server.js.
//
// `prompt: 'none'` means a player who has already approved the app sees nothing at all; only the
// very first launch shows Discord's one-time permission dialog.
async function identify(clientId) {
    try {
        const { code } = await sdk.commands.authorize({
            client_id: clientId,
            response_type: 'code',
            state: '',
            prompt: 'none',
            scope: ['identify'],
        });
        const res = await fetch('/discord/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });
        if (!res.ok) throw new Error(`token exchange returned ${res.status}`);
        const { access_token } = await res.json();
        const auth = await sdk.commands.authenticate({ access_token });
        // `global_name` is the display name people actually set; `username` is the @handle it
        // falls back to for accounts that have not set one.
        const u = auth && auth.user;
        user = u ? { id: u.id, name: u.global_name || u.username } : null;
    } catch (err) {
        console.warn('Discord: could not identify the player; multiplayer will ask for a name.', err);
        user = null;
    }
}

// The player, or null if Discord would not say. `{ id, name }`.
export function discordUser() { return user; }

// The key for "this launch of the activity, in this voice channel". Everyone who opens the same
// activity gets the same value, which is what lets the game put them in one room without anyone
// typing a code.
export function instanceId() {
    return sdk ? sdk.instanceId : null;
}
