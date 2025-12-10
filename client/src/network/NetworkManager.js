export class NetworkManager {
    constructor(game) {
        this.game = game;
        this.ws = null;
        this.playerId = null;
        this.serverUrl = import.meta.env.VITE_SERVER_URL || 'ws://localhost:3000';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.lastUpdateTime = 0;
        this.updateInterval = 50; // Send updates every 50ms (20 times per second)
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);

                this.ws.onopen = () => {
                    console.log('Connected to server');
                    this.reconnectAttempts = 0;
                    this.game.uiManager.updateServerStatus('Connected', true);
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(JSON.parse(event.data));
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.game.uiManager.updateServerStatus('Error', false);
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('Disconnected from server');
                    this.game.uiManager.updateServerStatus('Disconnected', false);
                    this.attemptReconnect();
                };

            } catch (error) {
                console.error('Failed to connect:', error);
                reject(error);
            }
        });
    }

    handleMessage(message) {
        switch (message.type) {
            case 'welcome':
                this.playerId = message.playerId;
                console.log('Assigned player ID:', this.playerId);
                break;

            case 'playerJoined':
                this.game.addPlayer(message.player);
                this.game.uiManager.updatePlayerCount(message.playerCount);
                break;

            case 'playerLeft':
                this.game.removePlayer(message.playerId);
                this.game.uiManager.updatePlayerCount(message.playerCount);
                break;

            case 'playerUpdate':
                if (message.playerId !== this.playerId) {
                    this.game.updatePlayer(message);
                }
                break;

            case 'gameState':
                // Initial game state when joining
                message.players.forEach(player => {
                    if (player.id !== this.playerId) {
                        this.game.addPlayer(player);
                    }
                });
                this.game.uiManager.updatePlayerCount(message.players.length);
                break;

            case 'serverFull':
                alert('Server is full! Please try again later.');
                break;

            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    sendPlayerUpdate(data) {
        // Throttle updates
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateInterval) {
            return;
        }
        this.lastUpdateTime = now;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'playerUpdate',
                position: data.position,
                rotation: data.rotation
            }));
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
            setTimeout(() => this.connect(), 2000);
        } else {
            console.error('Max reconnection attempts reached');
            alert('Lost connection to server. Please refresh the page.');
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}
