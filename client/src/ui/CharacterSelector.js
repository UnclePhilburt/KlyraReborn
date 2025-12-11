export class CharacterSelector {
    constructor(onCharacterSelected) {
        this.onCharacterSelected = onCharacterSelected;
        this.selectedCharacter = null;

        this.characters = [
            { name: 'polygonesyntycharacter', display: 'Synty' },
            { name: 'SK_Chr_Mage_01', display: 'Mage' }
        ];

        this.createUI();
    }

    createUI() {
        // Create character selection overlay
        this.overlay = document.createElement('div');
        this.overlay.id = 'character-selector';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, rgba(26,26,46,0.95) 0%, rgba(22,33,62,0.95) 100%);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 2000;
        `;

        // Title
        const title = document.createElement('h1');
        title.textContent = 'Choose Your Character';
        title.style.cssText = `
            font-size: 3em;
            color: #f0a500;
            margin-bottom: 40px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        `;
        this.overlay.appendChild(title);

        // Character grid
        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 30px;
            max-width: 800px;
        `;

        this.characters.forEach(char => {
            const card = this.createCharacterCard(char);
            grid.appendChild(card);
        });

        this.overlay.appendChild(grid);

        // Instructions
        const instructions = document.createElement('p');
        instructions.textContent = 'Click a character to select';
        instructions.style.cssText = `
            margin-top: 40px;
            color: #ccc;
            font-size: 1.2em;
        `;
        this.overlay.appendChild(instructions);

        document.body.appendChild(this.overlay);
    }

    createCharacterCard(character) {
        const card = document.createElement('div');
        card.style.cssText = `
            background: rgba(255,255,255,0.1);
            border: 2px solid rgba(240,165,0,0.3);
            border-radius: 15px;
            padding: 30px;
            cursor: pointer;
            transition: all 0.3s ease;
            text-align: center;
            min-width: 200px;
        `;

        const name = document.createElement('h2');
        name.textContent = character.display;
        name.style.cssText = `
            color: #fff;
            font-size: 2em;
            margin-bottom: 10px;
        `;

        const icon = document.createElement('div');
        icon.textContent = this.getCharacterIcon(character.display);
        icon.style.cssText = `
            font-size: 4em;
            margin: 20px 0;
        `;

        card.appendChild(name);
        card.appendChild(icon);

        // Hover effects
        card.addEventListener('mouseenter', () => {
            card.style.background = 'rgba(240,165,0,0.2)';
            card.style.borderColor = '#f0a500';
            card.style.transform = 'scale(1.05)';
        });

        card.addEventListener('mouseleave', () => {
            card.style.background = 'rgba(255,255,255,0.1)';
            card.style.borderColor = 'rgba(240,165,0,0.3)';
            card.style.transform = 'scale(1)';
        });

        // Click to select
        card.addEventListener('click', () => {
            this.selectCharacter(character);
        });

        return card;
    }

    getCharacterIcon(displayName) {
        const icons = {
            'Synty': '⚔️',
            'Mage': '🧙'
        };
        return icons[displayName] || '🎮';
    }

    selectCharacter(character) {
        this.selectedCharacter = character.name;

        // Animate out
        this.overlay.style.opacity = '0';
        this.overlay.style.transition = 'opacity 0.5s ease';

        setTimeout(() => {
            this.overlay.remove();
            if (this.onCharacterSelected) {
                this.onCharacterSelected(this.selectedCharacter);
            }
        }, 500);
    }

    show() {
        if (this.overlay) {
            this.overlay.style.display = 'flex';
        }
    }

    hide() {
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
    }
}
