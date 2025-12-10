# Fantasy Roguelite - 10 Player Co-op Game

A 3D fantasy roguelite game built with Three.js, featuring drop-in/drop-out multiplayer for up to 10 players.

## Features

- **10 Player Co-op**: Auto-matchmaking into servers with drop-in/drop-out support
- **Fantasy Kingdom Assets**: Using POLYGON Fantasy Kingdom asset pack
- **Roguelite Mechanics**: Procedural runs, permadeath, and meta-progression
- **Real-time Multiplayer**: WebSocket-based networking for smooth gameplay
- **Open World**: Explore a procedurally generated fantasy kingdom

## Tech Stack

### Frontend
- **Three.js**: 3D rendering engine
- **Vite**: Fast development and bundling
- **WebSocket**: Real-time multiplayer communication

### Backend
- **Node.js + Express**: Server framework
- **WebSocket (ws)**: Real-time communication
- **PostgreSQL**: Player data and progression storage
- **Render**: Cloud hosting platform

## Getting Started

### Prerequisites
- Node.js 18+ installed
- Git installed

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd 3dfantasygame
   ```

2. **Install client dependencies**
   ```bash
   cd client
   npm install
   ```

3. **Install server dependencies**
   ```bash
   cd ../server
   npm install
   ```

4. **Set up environment variables**

   Client (`.env` in `client/` folder):
   ```
   VITE_SERVER_URL=ws://localhost:3000
   ```

   Server (`.env` in `server/` folder):
   ```
   PORT=3000
   DATABASE_URL=your-postgres-connection-string
   ```

### Running Locally

1. **Start the server**
   ```bash
   cd server
   npm start
   ```

2. **Start the client (in a new terminal)**
   ```bash
   cd client
   npm run dev
   ```

3. **Open your browser**
   - Navigate to `http://localhost:5173`
   - Click to enable pointer lock
   - Use WASD to move, mouse to look, Space to jump

## Deployment

### Deploy to Render (Server)

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Set the following:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add environment variables:
   - `DATABASE_URL`: Your PostgreSQL connection string
5. Deploy!

### Deploy to GitHub Pages (Client)

1. **Update client `.env` for production**
   ```
   VITE_SERVER_URL=wss://your-app-name.onrender.com
   ```

2. **Build the client**
   ```bash
   cd client
   npm run build
   ```

3. **Deploy to GitHub Pages**
   - Push the `client/dist` folder to `gh-pages` branch
   - Or use GitHub Actions for automatic deployment

## Controls

- **WASD** / **Arrow Keys**: Move
- **Mouse**: Look around (click first to enable)
- **Space**: Jump
- **Left Click**: Attack (coming soon)
- **ESC**: Release mouse cursor

## Project Structure

```
3dfantasygame/
├── client/                 # Frontend Three.js application
│   ├── src/
│   │   ├── game/          # Game logic (player, world, etc.)
│   │   ├── network/       # WebSocket networking
│   │   └── ui/            # UI management
│   ├── public/            # Static assets
│   └── index.html
├── server/                # Backend Node.js server
│   └── server.js         # WebSocket server & game logic
├── assets/               # Game assets (POLYGON Fantasy Kingdom)
└── POLYGON_Fantasy_Kingdom_SourceFiles_v4/
```

## Roadmap

- [x] Basic multiplayer networking
- [x] Player movement and camera
- [x] Simple world generation
- [ ] FBX model loading for characters
- [ ] Combat system
- [ ] Enemy AI
- [ ] Procedural world generation
- [ ] Roguelite mechanics (runs, permadeath)
- [ ] Player progression system
- [ ] Inventory and equipment
- [ ] Multiple character classes

## Assets

This project uses the **POLYGON Fantasy Kingdom** asset pack. Make sure you have the proper license to use these assets.

## License

[Your License Here]

## Contributing

[Your contribution guidelines]
