# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         GAME CLIENTS                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Player 1   │  │   Player 2   │  │  Player 3-10 │          │
│  │   Browser    │  │   Browser    │  │   Browsers   │          │
│  │              │  │              │  │              │          │
│  │  Three.js    │  │  Three.js    │  │  Three.js    │          │
│  │  Renderer    │  │  Renderer    │  │  Renderer    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         │  WebSocket (WSS) │                  │                  │
│         └──────────────────┴──────────────────┘                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      RENDER BACKEND                              │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │           Node.js + Express WebSocket Server               │ │
│  │                                                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │ │
│  │  │   Player     │  │   Game       │  │    Network      │ │ │
│  │  │   Manager    │  │   Loop       │  │    Manager      │ │ │
│  │  │              │  │              │  │                 │ │ │
│  │  │ - Add/Remove │  │ - AI Update  │  │ - Broadcast     │ │ │
│  │  │ - Positions  │  │ - Physics    │  │ - Validation    │ │ │
│  │  │ - State Sync │  │ - Collisions │  │ - Anti-cheat    │ │ │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘ │ │
│  └────────────────────────────┬───────────────────────────────┘ │
│                               │                                  │
└───────────────────────────────┼──────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                           │
│                                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │   Users    │  │  Progress  │  │   Stats    │  │   Items   │ │
│  │            │  │            │  │            │  │           │ │
│  │ - user_id  │  │ - user_id  │  │ - user_id  │  │ - item_id │ │
│  │ - username │  │ - unlocks  │  │ - kills    │  │ - owner   │ │
│  │ - password │  │ - level    │  │ - deaths   │  │ - type    │ │
│  │ - created  │  │ - currency │  │ - runs     │  │ - stats   │ │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Client Architecture (Three.js)

```
┌─────────────────────────────────────────────────────────────────┐
│                        client/src/                               │
│                                                                   │
│  main.js (Entry Point)                                           │
│  ├─ Initialize Three.js scene, camera, renderer                 │
│  ├─ Connect to server                                            │
│  ├─ Start game loop                                              │
│  └─ Coordinate all managers                                      │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  game/ (Game Logic)                                       │   │
│  │  ├─ PlayerController.js                                   │   │
│  │  │   ├─ Handle WASD input                                 │   │
│  │  │   ├─ Physics (gravity, jumping)                        │   │
│  │  │   ├─ Camera follow                                     │   │
│  │  │   └─ Send position to server                           │   │
│  │  │                                                         │   │
│  │  └─ WorldManager.js                                       │   │
│  │      ├─ Generate terrain                                  │   │
│  │      ├─ Place props/buildings                             │   │
│  │      ├─ Load FBX models                                   │   │
│  │      └─ Manage scene objects                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  network/ (Multiplayer)                                   │   │
│  │  └─ NetworkManager.js                                     │   │
│  │      ├─ WebSocket connection                              │   │
│  │      ├─ Send player updates                               │   │
│  │      ├─ Receive other players                             │   │
│  │      ├─ Handle disconnections                             │   │
│  │      └─ Reconnection logic                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ui/ (User Interface)                                     │   │
│  │  └─ UIManager.js                                          │   │
│  │      ├─ Loading screen                                    │   │
│  │      ├─ Player list                                       │   │
│  │      ├─ Health/stats                                      │   │
│  │      ├─ FPS counter                                       │   │
│  │      └─ Server status                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Server Architecture (Node.js)

```
┌─────────────────────────────────────────────────────────────────┐
│                       server/server.js                           │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  HTTP Server (Express)                                     │  │
│  │  ├─ GET /health → Server status                           │  │
│  │  └─ Static file serving                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  WebSocket Server                                          │  │
│  │                                                             │  │
│  │  On Connection:                                            │  │
│  │  ├─ Check if server full (max 10 players)                 │  │
│  │  ├─ Create Player object                                  │  │
│  │  ├─ Send welcome + game state                             │  │
│  │  └─ Broadcast "player joined"                             │  │
│  │                                                             │  │
│  │  On Message:                                               │  │
│  │  ├─ playerUpdate → Update position, broadcast             │  │
│  │  ├─ attack → Handle combat logic                          │  │
│  │  ├─ takeDamage → Update health                            │  │
│  │  └─ chat → Broadcast message                              │  │
│  │                                                             │  │
│  │  On Disconnect:                                            │  │
│  │  ├─ Remove player from list                               │  │
│  │  └─ Broadcast "player left"                               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Game Loop (setInterval)                                   │  │
│  │  ├─ Update AI enemies                                     │  │
│  │  ├─ Process physics                                       │  │
│  │  ├─ Spawn items/enemies                                   │  │
│  │  └─ World events                                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Player Storage (Map)                                      │  │
│  │  {                                                         │  │
│  │    "player-id-1": {                                        │  │
│  │      id, ws, position, rotation,                          │  │
│  │      health, isAlive, connectedAt                         │  │
│  │    },                                                      │  │
│  │    "player-id-2": { ... },                                │  │
│  │    ...                                                     │  │
│  │  }                                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Message Flow

### Player Joins

```
Client                          Server                    Database
  │                               │                           │
  ├──── WebSocket Connect ───────>│                           │
  │                               │                           │
  │<──── welcome (player ID) ─────┤                           │
  │                               │                           │
  │<──── gameState (all players)──┤                           │
  │                               │                           │
  │                               ├─── Query user data ──────>│
  │                               │                           │
  │                               │<─── User stats ───────────┤
  │                               │                           │
  │<──── user data ───────────────┤                           │
```

### Player Movement

```
Player 1                     Server                      Player 2
  │                            │                            │
  ├─ Move WASD                 │                            │
  │                            │                            │
  ├─ playerUpdate(pos) ───────>│                            │
  │                            │                            │
  │                            ├─ Validate position         │
  │                            │                            │
  │                            ├─ playerUpdate(P1) ────────>│
  │                            │                            │
  │                            │                   Update P1 mesh
```

### Combat

```
Player 1                     Server                      Player 2
  │                            │                            │
  ├─ Click (attack) ───────────>│                            │
  │                            │                            │
  │                            ├─ Check hit detection       │
  │                            │                            │
  │                            ├─ Calculate damage          │
  │                            │                            │
  │                            ├─ takeDamage ──────────────>│
  │                            │                            │
  │<─── attack animation ──────┤                   Play hit animation
  │                            │                     Update health
```

## Data Models

### Player (Server Memory)
```javascript
{
  id: "uuid-v4",
  ws: WebSocket,
  position: { x: 0, y: 1, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  isAlive: true,
  connectedAt: timestamp
}
```

### User (Database - Future)
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Progression (Database - Future)
```sql
CREATE TABLE progression (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  level INTEGER DEFAULT 1,
  experience INTEGER DEFAULT 0,
  currency INTEGER DEFAULT 0,
  unlocks JSONB DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Stats (Database - Future)
```sql
CREATE TABLE stats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  total_kills INTEGER DEFAULT 0,
  total_deaths INTEGER DEFAULT 0,
  total_runs INTEGER DEFAULT 0,
  best_run INTEGER DEFAULT 0,
  playtime_seconds INTEGER DEFAULT 0
);
```

## Deployment Flow

```
Developer                GitHub                 GitHub Actions         GitHub Pages
    │                      │                          │                      │
    ├─ git push ──────────>│                          │                      │
    │                      │                          │                      │
    │                      ├─ Trigger workflow ──────>│                      │
    │                      │                          │                      │
    │                      │                    npm ci (install)             │
    │                      │                    npm run build                │
    │                      │                          │                      │
    │                      │                          ├─ Upload dist ───────>│
    │                      │                          │                      │
    │                      │                          │                Deploy!
                                                      │
                                                      │
Developer                GitHub                    Render              PostgreSQL
    │                      │                          │                      │
    ├─ git push ──────────>│                          │                      │
    │                      │                          │                      │
    │                      ├─ Webhook ───────────────>│                      │
    │                      │                          │                      │
    │                      │                    Pull repo                    │
    │                      │                    npm install                  │
    │                      │                    npm start                    │
    │                      │                          │                      │
    │                      │                          ├─ Connect ───────────>│
    │                      │                          │                      │
    │                      │                    Server running!              │
```

## Network Protocol

### Message Types (Client → Server)
- `playerUpdate`: { position, rotation }
- `attack`: { target, weaponType }
- `takeDamage`: { damage, source }
- `chat`: { text }
- `useItem`: { itemId }

### Message Types (Server → Client)
- `welcome`: { playerId }
- `gameState`: { players[] }
- `playerJoined`: { player, playerCount }
- `playerLeft`: { playerId, playerCount }
- `playerUpdate`: { playerId, position, rotation }
- `playerAttack`: { playerId, position }
- `playerDied`: { playerId }
- `serverFull`: { message }

## Performance Optimization

### Client Side
- **Asset Loading**: Lazy load FBX models
- **LOD System**: Switch detail based on distance
- **Frustum Culling**: Only render visible objects
- **Update Rate**: 60 FPS render, 20 Hz network
- **Texture Atlases**: Reduce draw calls

### Server Side
- **Update Rate**: 10 Hz game loop
- **Message Throttling**: Max 20 updates/sec per player
- **Spatial Partitioning**: Only sync nearby players
- **Database Pooling**: Reuse connections
- **Compression**: Gzip WebSocket messages

## Security Considerations

### Current
- ✅ Environment variables for secrets
- ✅ HTTPS/WSS in production
- ⚠️ No authentication (anonymous)
- ⚠️ No input validation
- ⚠️ No rate limiting

### Future
- [ ] User authentication (JWT tokens)
- [ ] Server-side validation of all actions
- [ ] Rate limiting (anti-spam)
- [ ] Anti-cheat (position validation)
- [ ] SQL injection prevention (prepared statements)
- [ ] XSS prevention (sanitize inputs)

---

This architecture is designed to scale from prototype to production!
