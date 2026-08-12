# Server Persistence And WebRTC Architecture

Date: 2026-08-12

## Goal

The game needs a small backend foundation for player state, savegames, lobbies, and later persistent battle results. WebRTC can be used for low-latency match communication, but it should not be treated as the persistence layer or as a trusted authority for permanent losses.

Core principle:

```text
Persistence / authority != realtime transport
```

## Target Shape

```text
Frontend / Game Client
  |-- HTTP API -----------------> Server API
  |                                |-- SQLite
  |                                |-- player profile
  |                                |-- savegames
  |                                |-- battle results
  |
  |-- WebSocket signaling ------> Signaling Service
                                   |-- lobby presence
                                   |-- WebRTC offer / answer / ICE exchange

Client <========== WebRTC DataChannel ==========> Client
```

SQLite handles durable state. WebRTC handles realtime match traffic. WebSocket is only needed to establish and coordinate WebRTC sessions.

## SQLite Backend

SQLite is enough for the prototype because we need simple local persistence without committing to full infrastructure yet.

Suggested stack:

```text
Node.js
Fastify or Express
better-sqlite3
zod or similar validation
```

Initial database tables:

```text
users
sessions
player_profiles
save_games
lobbies
battle_results
```

For the first iteration, `player_profiles` and `save_games` can store versioned JSON payloads. That keeps the game state flexible while the model still changes quickly.

Example save payload:

```ts
type SaveGameRecord = {
  saveVersion: 1;
  playerId: string;
  profile: PlayerProfile;
  worldState: PersistentGameState;
  savedAt: string;
};
```

## API Surface

Initial HTTP endpoints:

```text
POST /api/session/local
GET  /api/player/profile
PUT  /api/player/profile
GET  /api/savegame
PUT  /api/savegame
POST /api/lobbies
GET  /api/lobbies/:id
POST /api/battle-results
```

`/api/session/local` can create or return the dummy local player for now. Later this becomes real login/session handling without changing the game-side repository contracts.

## Repository Integration

The game should keep using repository interfaces instead of directly reading from `localStorage` or calling `fetch` everywhere.

Existing/future interfaces:

```text
PlayerRepository
GameWorldRepository
SettingsRepository
SessionRepository
LobbyRepository
BattleResultRepository
```

Implementations:

```text
LocalPlayerRepository
LocalGameWorldRepository
ApiPlayerRepository
ApiGameWorldRepository
ApiLobbyRepository
ApiBattleResultRepository
```

This lets the prototype keep working locally while the backend is introduced behind the same gameplay-facing contracts.

## WebRTC Role

WebRTC is useful for realtime PvE/PvP match traffic:

```text
inputs
movement commands
target commands
combat events
state snapshots
latency pings
match debug data
```

WebRTC still needs a signaling service:

```text
WebSocket
offer / answer exchange
ICE candidates
lobby membership
ready state
match start coordination
```

For local/prototype use, public STUN servers may be enough. For reliable internet play, TURN hosting is required later.

## Authority Model

Prototype:

```text
P2P WebRTC match
client-produced battle result
server stores result after basic validation
```

Later:

```text
server-authoritative match validation
or server-hosted simulation
server-generated battle result
```

Persistent ship losses must not rely on arbitrary client claims long-term.

Battle result shape:

```ts
type BattleResult = {
  lobbyId: string;
  playerId: string;
  survivedShipIds: string[];
  destroyedShipIds: string[];
  rewards: PlayerResources;
  researchRewards: string[];
  completedAt: string;
};
```

Applying the result:

```text
BattleResult
  -> remove destroyed ships from persistent fleet inventory
  -> apply rewards
  -> save updated PlayerProfile / PersistentGameState
```

## Suggested Package Layout

Either:

```text
server/
  package.json
  src/
    index.ts
    db/
      schema.ts
      migrations/
    session/
    player/
    savegame/
    lobby/
    signaling/
    battle/
```

Or, if we want the repo to become a clearer monorepo:

```text
apps/
  game/
  frontend/
  server/
packages/
  conduit-web3d/
  shared/
```

For the next step, a simple `server/` folder is enough. A full monorepo move can wait.

## First Milestone

1. Add server skeleton with health endpoint.
2. Add SQLite schema and migration bootstrap.
3. Add local dummy session endpoint.
4. Add profile save/load endpoint.
5. Add game-side API repository implementation.
6. Keep localStorage repository as fallback.
7. Add lobby domain model without real networking.
8. Add WebSocket signaling prototype.
9. Add WebRTC DataChannel proof of concept for one lobby.
10. Only then connect battle results to persistent losses.

## Not Now

Do not build these in the first backend iteration:

```text
real login
public matchmaking
server-authoritative combat simulation
anti-cheat
TURN hosting
MMO infrastructure
complex account system
```

## Practical Recommendation

Start with SQLite + HTTP API first. That gives the game a real persistence boundary and prepares the frontend login/start flow.

After save/load works through the API, add WebSocket signaling and a minimal WebRTC lobby test. This keeps persistence, lobby state, and realtime match traffic from becoming one tangled system.
