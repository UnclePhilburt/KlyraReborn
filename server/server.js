import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS_PER_SERVER = 10;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// CORS headers for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        players: players.size,
        maxPlayers: MAX_PLAYERS_PER_SERVER,
        uptime: process.uptime()
    });
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store connected players
const players = new Map();

// Player class to manage player data
class Player {
    constructor(id, ws) {
        this.id = id;
        this.ws = ws;
        this.position = { x: 0, y: 1, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.health = 100;
        this.isAlive = true;
        this.connectedAt = Date.now();
    }

    toJSON() {
        return {
            id: this.id,
            position: this.position,
            rotation: this.rotation,
            health: this.health,
            isAlive: this.isAlive
        };
    }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
    // Check if server is full
    if (players.size >= MAX_PLAYERS_PER_SERVER) {
        ws.send(JSON.stringify({
            type: 'serverFull',
            message: 'Server is currently full. Please try again later.'
        }));
        ws.close();
        return;
    }

    // Create new player
    const playerId = uuidv4();
    const player = new Player(playerId, ws);
    players.set(playerId, player);

    console.log(`Player ${playerId} connected. Total players: ${players.size}`);

    // Send welcome message to new player
    ws.send(JSON.stringify({
        type: 'welcome',
        playerId: playerId,
        message: 'Connected to Fantasy Roguelite server'
    }));

    // Send current game state to new player
    const currentPlayers = Array.from(players.values())
        .filter(p => p.id !== playerId)
        .map(p => p.toJSON());

    ws.send(JSON.stringify({
        type: 'gameState',
        players: currentPlayers
    }));

    // Broadcast to all other players that a new player joined
    broadcast({
        type: 'playerJoined',
        player: player.toJSON(),
        playerCount: players.size
    }, playerId);

    // Handle messages from client
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handlePlayerMessage(playerId, message);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    // Handle player disconnect
    ws.on('close', () => {
        players.delete(playerId);
        console.log(`Player ${playerId} disconnected. Total players: ${players.size}`);

        // Broadcast to all players that someone left
        broadcast({
            type: 'playerLeft',
            playerId: playerId,
            playerCount: players.size
        });
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error(`WebSocket error for player ${playerId}:`, error);
    });
});

// Handle player messages
function handlePlayerMessage(playerId, message) {
    const player = players.get(playerId);
    if (!player) return;

    switch (message.type) {
        case 'playerUpdate':
            // Update player position and rotation
            if (message.position) {
                player.position = message.position;
            }
            if (message.rotation) {
                player.rotation = message.rotation;
            }

            // Broadcast update to all other players
            broadcast({
                type: 'playerUpdate',
                playerId: playerId,
                position: player.position,
                rotation: player.rotation
            }, playerId);
            break;

        case 'attack':
            // Handle attack action
            broadcast({
                type: 'playerAttack',
                playerId: playerId,
                position: player.position
            }, playerId);
            break;

        case 'takeDamage':
            // Handle player taking damage
            player.health = Math.max(0, player.health - (message.damage || 10));
            if (player.health <= 0) {
                player.isAlive = false;
                broadcast({
                    type: 'playerDied',
                    playerId: playerId
                });
            }
            break;

        case 'chat':
            // Handle chat messages
            broadcast({
                type: 'chat',
                playerId: playerId,
                message: message.text
            });
            break;

        default:
            console.warn(`Unknown message type: ${message.type}`);
    }
}

// Broadcast message to all players except sender
function broadcast(message, excludePlayerId = null) {
    const messageStr = JSON.stringify(message);
    players.forEach((player, id) => {
        if (id !== excludePlayerId && player.ws.readyState === 1) { // 1 = OPEN
            player.ws.send(messageStr);
        }
    });
}

// Send message to specific player
function sendToPlayer(playerId, message) {
    const player = players.get(playerId);
    if (player && player.ws.readyState === 1) {
        player.ws.send(JSON.stringify(message));
    }
}

// Game loop for server-side updates (optional, for AI, physics, etc.)
setInterval(() => {
    // This could handle server-side game logic like:
    // - Enemy AI updates
    // - Physics simulation
    // - Spawning items/enemies
    // - World events
}, 100); // 10 times per second

// Start server
server.listen(PORT, () => {
    console.log(`🎮 Fantasy Roguelite Server running on port ${PORT}`);
    console.log(`📊 Max players per server: ${MAX_PLAYERS_PER_SERVER}`);
    console.log(`🌐 WebSocket server ready`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
