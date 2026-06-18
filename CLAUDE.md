# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start server + Vite dev client concurrently
npm start        # Production server only (no Vite)
npm run build    # Build client with Vite
```

All files use ES modules (`"type": "module"` in package.json). The server runs on port 3000; Vite dev server proxies to it.

## Architecture

This is a real-time multiplayer browser game with a Canvas/WebGL client and a Node.js/Colyseus server.

```
Browser Client (Canvas + Vite)
        │
        │  WebSocket (Colyseus)  ws://localhost:3000
        ▼
Node.js Server (Express + Colyseus)
  - GameRoom instances manage game state and physics
  - HTTP /join/:code resolves room codes to Colyseus room IDs
```

### Client (`client/`)

**Entry point:** `client/game.js` — holds all global state (`room`, `currentScreen`, `currentMode`, player info, etc.) and wires together all screens and the Colyseus connection.

**Screen system:** Each screen (`screens/`) is a class with `draw()` and lifecycle methods. Navigation happens by setting `currentScreen` in game.js and calling `room.send(...)` for server-driven transitions.

**UI system:** `ui/UIManager.js` is the central input router — all mouse/keyboard events go through it and are dispatched to `Button`, `Input`, and `Slider` instances. Buttons use per-character 3D animation with a retro ASCII border style (`+----+`). Font metrics come from `ui/Font.js` which loads the `PxPlus_IBM_VGA_8x16.ttf` file via OpenType.js.

**Rendering:** Single 2D canvas for game content. `CRTShader.js` applies a WebGL overlay (scanlines, barrel distortion, bloom, vignette) on top.

### Server (`server/`)

**`server/server.js`** — Express + Colyseus setup. Registers the `game_room` room type and exposes `/join/:code` for room-code lookups.

**`server/GameRoom.js`** — All game logic lives here. Uses `setSimulationInterval` at 50ms for character physics (bounce + rotation). Characters move in normalized [-1, 1] space. Game flow: Lobby → Countdown → Round Active → Round Over → (Match Over) → Game Over, with voting for rematch or lobby return.

**`gameModes.js`** (root) — Config objects for game modes ("redacted", "frequency"). Referenced by both client and server.

### Colyseus message protocol

Client → Server: `clientReady`, `tap`, `updateSettings`, `makeHost`, `startGame`, `leaveToMenu`, `votePlayAgain`, `voteReturnToLobby`

Server → Client: `roomCode`, `playerList`, `startError`, `settingsUpdated`, `gameStarted`, `gameRestarted`, `returnedToLobby`, `playAgainVotes`, `returnToLobbyVotes`, `roundCountdown`, `roundStart`, `gameState`, `charUpdate`, `roundOver`, `timeUp`, `matchOver`, `gameOver`, `reconnected`

### Key patterns

- **Host authority** — The first player in a room is host; only the host can change settings and start the game.
- **Reconnection** — `reconnectionToken` is stored in `localStorage`; `GameRoom.js` handles `onLeave` with a reconnection window.
- **Character interpolation** — `GameScreen.js` interpolates character positions between server `charUpdate` broadcasts.
- **Modal blocking** — `UIManager` has a `blocked` flag that suppresses input when an error/info modal is shown.
