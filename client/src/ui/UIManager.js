export class UIManager {
    constructor() {
        this.loadingScreen = document.getElementById('loading-screen');
        this.loadingProgress = document.getElementById('loading-progress');
        this.loadingText = document.getElementById('loading-text');
        this.serverStatus = document.getElementById('server-status');
        this.playerCount = document.getElementById('player-count');
        this.fpsDisplay = document.getElementById('fps');
        this.playersContainer = document.getElementById('players-container');
    }

    updateLoadingProgress(percent, text) {
        this.loadingProgress.style.width = `${percent}%`;
        this.loadingText.textContent = text;
    }

    hideLoadingScreen() {
        this.loadingScreen.style.opacity = '0';
        setTimeout(() => {
            this.loadingScreen.style.display = 'none';
        }, 500);
    }

    updateServerStatus(status, isConnected) {
        this.serverStatus.textContent = status;
        this.serverStatus.style.color = isConnected ? '#4ecca3' : '#ff6b6b';
    }

    updatePlayerCount(count) {
        this.playerCount.textContent = `${count}/10`;
    }

    updateFPS(fps) {
        this.fpsDisplay.textContent = fps;
    }

    updatePlayerList(players) {
        this.playersContainer.innerHTML = '';
        players.forEach(player => {
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            playerItem.innerHTML = `
                <div class="player-dot"></div>
                <span>Player ${player.id.substring(0, 8)}</span>
            `;
            this.playersContainer.appendChild(playerItem);
        });
    }
}
