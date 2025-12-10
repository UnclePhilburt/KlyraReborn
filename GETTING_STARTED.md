# Getting Started - Complete Setup Checklist

This guide will walk you through everything you need to get your Fantasy Roguelite game running.

## ✅ Prerequisites Checklist

Before you begin, make sure you have:

- [ ] **Node.js 18+** installed
  - Check: Run `node --version` in terminal
  - Download: https://nodejs.org/

- [ ] **Git** installed (optional, for version control)
  - Check: Run `git --version`
  - Download: https://git-scm.com/

- [ ] **A code editor** (recommended: VS Code)
  - Download: https://code.visualstudio.com/

- [ ] **A modern browser** (Chrome, Firefox, or Edge)

## 🚀 Quick Start (5 Minutes)

### Step 1: Install Dependencies

Open a terminal in the `C:\3dfantasygame` folder and run:

```bash
npm run install:all
```

**What this does:**
- Installs all client dependencies (Three.js, Vite, etc.)
- Installs all server dependencies (Express, WebSocket, etc.)

**Expected output:**
```
added 12 packages... (client)
added 92 packages... (server)
```

### Step 2: Set Up Environment Files

```bash
npm run setup:env
```

**What this does:**
- Creates `client/.env` with server URL
- Creates `server/.env` with port and config

**Expected output:**
```
✅ Created client/.env
✅ Created server/.env
🎮 Environment setup complete!
```

### Step 3: Start the Server

Open a **new terminal** and run:

```bash
npm run dev:server
```

**Expected output:**
```
🎮 Fantasy Roguelite Server running on port 3000
📊 Max players per server: 10
🌐 WebSocket server ready
```

**Keep this terminal open!** The server needs to stay running.

### Step 4: Start the Client

Open **another new terminal** and run:

```bash
npm run dev:client
```

**Expected output:**
```
VITE v5.0.0  ready in 500 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

**Your browser should automatically open!** If not, manually go to:
```
http://localhost:5173
```

### Step 5: Play!

1. **Click anywhere** on the screen to enable mouse controls
2. **Move**: WASD or Arrow Keys
3. **Look**: Move mouse
4. **Jump**: Space bar

**Test multiplayer:**
- Open another browser tab to `http://localhost:5173`
- You should see "Player 2" appear in the player list!

## 📋 Post-Setup Checklist

After getting it running, verify:

### Client Checklist
- [ ] Can you see the 3D world (grass, sky, trees)?
- [ ] Can you move with WASD?
- [ ] Can you look around with mouse?
- [ ] Can you jump with Space?
- [ ] Do you see "Connected" in the top-left HUD?
- [ ] Does the FPS counter show ~60?

### Server Checklist
- [ ] Server terminal shows "WebSocket server ready"
- [ ] No error messages in server terminal
- [ ] When client connects, you see "Player [ID] connected"
- [ ] Player count increases in server logs

### Multiplayer Checklist
- [ ] Open game in 2+ browser tabs
- [ ] Each tab shows different player counts (1/10, 2/10, etc.)
- [ ] Moving in one tab shows movement in other tab
- [ ] Players appear in "Players Online" list

## 🎯 What You Should See

### In the Browser
```
┌────────────────────────────────────────┐
│ Server: Connected     Players: 1/10    │
│ FPS: 60                                 │
└────────────────────────────────────────┘

         [3D World with terrain,
          trees, rocks, castle]

         [Your blue capsule player
          with red cone "hat"]

┌────────────────────────────────────────┐
│ Players Online                          │
│ • Player a1b2c3d4                      │
└────────────────────────────────────────┘

     WASD - Move | Mouse - Look
    Space - Jump | Click - Attack
```

### In Server Terminal
```
🎮 Fantasy Roguelite Server running on port 3000
📊 Max players per server: 10
🌐 WebSocket server ready
Player a1b2c3d4-... connected. Total players: 1
Player b2c3d4e5-... connected. Total players: 2
```

## 🔧 Troubleshooting

### "Cannot connect to server"

**Problem:** Client shows "Connecting..." forever

**Solutions:**
1. Check server terminal is running
2. Look for errors in server terminal
3. Check `client/.env` has correct URL:
   ```
   VITE_SERVER_URL=ws://localhost:3000
   ```
4. Restart both server and client

### "White/Blank Screen"

**Problem:** Browser shows nothing or white screen

**Solutions:**
1. Open browser console (F12)
2. Look for red error messages
3. Common fixes:
   - Refresh page (Ctrl+R)
   - Clear browser cache
   - Reinstall: Delete `node_modules`, run `npm run install:all`

### "Module not found" Errors

**Problem:** Errors about missing modules

**Solutions:**
```bash
# Delete everything and reinstall
cd client
rm -rf node_modules package-lock.json
cd ../server
rm -rf node_modules package-lock.json
cd ..
npm run install:all
```

### "Port 3000 already in use"

**Problem:** Server won't start, port in use

**Solutions:**

**Windows:**
```bash
netstat -ano | findstr :3000
taskkill /PID [PID] /F
```

**Mac/Linux:**
```bash
lsof -ti:3000 | xargs kill
```

Or change port in `server/.env`:
```
PORT=3001
```

And update `client/.env`:
```
VITE_SERVER_URL=ws://localhost:3001
```

### Performance Issues

**Problem:** Low FPS, laggy

**Solutions:**
1. Close other browser tabs
2. Update graphics drivers
3. Try different browser (Chrome recommended)
4. Lower render distance in code:
   ```javascript
   // In client/src/game/WorldManager.js
   // Reduce number of trees/rocks
   ```

## 🎮 Next Steps

Once everything is working:

### 1. Explore the Code
- `client/src/main.js` - Main game entry point
- `client/src/game/PlayerController.js` - Player movement
- `server/server.js` - Multiplayer server

### 2. Make Your First Change

**Try changing player color:**

Open `client/src/game/PlayerController.js` and find:
```javascript
const material = new THREE.MeshStandardMaterial({
    color: 0x3498db,  // ← Change this!
```

Change to:
- `0xff0000` for red
- `0x00ff00` for green
- `0xffff00` for yellow
- `0xff00ff` for magenta

Save and watch it update automatically!

### 3. Add Your Assets

Your POLYGON Fantasy Kingdom assets are in:
```
POLYGON_Fantasy_Kingdom_SourceFiles_v4/Source_Files/
```

To use them:
1. Copy assets to `client/public/assets/`
2. Load them with FBXLoader (see next section)

### 4. Learn the Project Structure

Read these in order:
1. `PROJECT_SUMMARY.md` - What's built, what's next
2. `ARCHITECTURE.md` - How everything works
3. `README.md` - General documentation

### 5. Deploy to Production

When ready to share with friends:
1. Read `DEPLOYMENT.md`
2. Deploy server to Render (free)
3. Deploy client to GitHub Pages (free)

## 📚 Recommended Reading Order

1. **First Time Setup** (you are here!)
2. `QUICKSTART.md` - Quick reference
3. `PROJECT_SUMMARY.md` - What you have
4. `ARCHITECTURE.md` - How it works
5. `DEPLOYMENT.md` - Deploying to production

## 🆘 Still Stuck?

### Check Browser Console
1. Press F12 in browser
2. Click "Console" tab
3. Look for red errors
4. Share these errors when asking for help

### Check Server Logs
1. Look at server terminal
2. Copy any error messages
3. Check what happens when client connects

### Common First-Time Issues

**Issue: "Setup complete but nothing happens"**
- Did you start BOTH server AND client?
- Are they both running in separate terminals?

**Issue: "Can't click to enable mouse"**
- Try clicking directly on the 3D world
- Make sure page is fully loaded
- Check browser console for errors

**Issue: "Game loads but can't move"**
- Click on screen first (pointer lock)
- Try pressing WASD keys
- Check keyboard focus is on browser window

## ✨ Success!

If you can:
- ✅ See the 3D world
- ✅ Move around with WASD
- ✅ See "Connected" status
- ✅ Open multiple tabs and see other players

**You're ready to start building!**

Your next steps:
1. Load your FBX character models
2. Add combat system
3. Implement enemy AI
4. Build roguelite mechanics

Check `PROJECT_SUMMARY.md` for the full roadmap!

---

**Having fun?** Star the repo and share with friends! 🎮
