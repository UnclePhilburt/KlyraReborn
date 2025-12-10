# Quick Start Guide

Get your Fantasy Roguelite game running in 5 minutes!

## Step 1: Install Dependencies

Open a terminal in the project root and run:

```bash
npm run install:all
```

This will install dependencies for both client and server.

## Step 2: Set Up Environment Variables

Run the setup script:

```bash
npm run setup:env
```

This creates `.env` files for both client and server with default development settings.

## Step 3: Start the Server

Open a terminal and run:

```bash
npm run dev:server
```

You should see:
```
🎮 Fantasy Roguelite Server running on port 3000
📊 Max players per server: 10
🌐 WebSocket server ready
```

## Step 4: Start the Client

Open a **NEW** terminal (keep the server running) and run:

```bash
npm run dev:client
```

Your browser should automatically open to `http://localhost:5173`

## Step 5: Play!

1. Click anywhere on the screen to enable mouse controls
2. Use **WASD** to move around
3. Use your **mouse** to look around
4. Press **Space** to jump

## Testing Multiplayer

Open the game in multiple browser windows or tabs. You should see other players appear in the "Players Online" list on the right side!

## Troubleshooting

### "Cannot connect to server"
- Make sure the server is running (`npm run dev:server`)
- Check that the server is on port 3000
- Look for errors in the server terminal

### "White/blank screen"
- Open browser console (F12) and check for errors
- Make sure you ran `npm run install:all`
- Try refreshing the page

### "Module not found" errors
- Delete `node_modules` folders in both client and server
- Run `npm run install:all` again

## What's Working Now

✅ Basic 3D world with terrain
✅ Third-person player controller
✅ WebSocket multiplayer (10 players max)
✅ Drop-in/drop-out support
✅ Real-time position syncing
✅ Player list UI
✅ FPS counter

## What's Next

The following features are ready to be implemented:

- Loading your FBX character models
- Combat system
- Enemy AI
- Procedural world generation
- Roguelite mechanics
- Database for player progression

---

**Need help?** Check the main README.md or open an issue on GitHub!
