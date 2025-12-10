export class MainMenu {
    constructor(onPlay) {
        this.onPlay = onPlay;
        this.overlay = null;
        this.createUI();
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'main-menu';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 3000;
        `;

        // Game title
        const title = document.createElement('h1');
        title.textContent = 'Klyra Reborn';
        title.style.cssText = `
            font-size: 5em;
            color: #f0a500;
            margin-bottom: 10px;
            text-shadow: 4px 4px 8px rgba(0,0,0,0.7);
            letter-spacing: 4px;
        `;
        this.overlay.appendChild(title);

        // Subtitle
        const subtitle = document.createElement('p');
        subtitle.textContent = '10 Player Co-op Fantasy Roguelite';
        subtitle.style.cssText = `
            font-size: 1.5em;
            color: #ccc;
            margin-bottom: 60px;
            letter-spacing: 2px;
        `;
        this.overlay.appendChild(subtitle);

        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 20px;
            align-items: center;
        `;

        // Play button
        const playButton = this.createButton('Play', '#f0a500', () => {
            this.hide();
        });
        buttonContainer.appendChild(playButton);

        // Settings button (placeholder)
        const settingsButton = this.createButton('Settings', '#666', () => {
            console.log('Settings clicked');
        });
        settingsButton.style.opacity = '0.6';
        buttonContainer.appendChild(settingsButton);

        // Credits button (placeholder)
        const creditsButton = this.createButton('Credits', '#666', () => {
            console.log('Credits clicked');
        });
        creditsButton.style.opacity = '0.6';
        buttonContainer.appendChild(creditsButton);

        this.overlay.appendChild(buttonContainer);

        // Version
        const version = document.createElement('p');
        version.textContent = 'v0.1.0 Alpha';
        version.style.cssText = `
            position: absolute;
            bottom: 20px;
            right: 20px;
            color: #555;
            font-size: 0.9em;
        `;
        this.overlay.appendChild(version);

        document.body.appendChild(this.overlay);
    }

    createButton(text, color, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
            font-size: 1.8em;
            padding: 15px 60px;
            border: 3px solid ${color};
            background: transparent;
            color: ${color};
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
            min-width: 250px;
            font-weight: bold;
            letter-spacing: 2px;
            text-transform: uppercase;
        `;

        button.addEventListener('mouseenter', () => {
            button.style.background = color;
            button.style.color = '#1a1a2e';
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = `0 0 30px ${color}50`;
        });

        button.addEventListener('mouseleave', () => {
            button.style.background = 'transparent';
            button.style.color = color;
            button.style.transform = 'scale(1)';
            button.style.boxShadow = 'none';
        });

        button.addEventListener('click', onClick);

        return button;
    }

    hide() {
        this.overlay.style.opacity = '0';
        this.overlay.style.transition = 'opacity 0.5s ease';

        setTimeout(() => {
            this.overlay.remove();
            if (this.onPlay) {
                this.onPlay();
            }
        }, 500);
    }

    show() {
        if (this.overlay) {
            this.overlay.style.display = 'flex';
            this.overlay.style.opacity = '1';
        }
    }
}
