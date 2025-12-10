import * as THREE from 'three';
import { NetworkManager } from './network/NetworkManager.js';
import { PlayerController } from './game/PlayerController.js';
import { WorldManager } from './game/WorldManager.js';
import { UIManager } from './ui/UIManager.js';
import { AssetLoader } from './loaders/AssetLoader.js';
import { CharacterSelector } from './ui/CharacterSelector.js';

class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        this.network = null;
        this.playerController = null;
        this.worldManager = null;
        this.uiManager = null;
        this.assetLoader = null;
        this.characterSelector = null;
        this.selectedCharacter = null;
        this.players = new Map();
        this.isLoaded = false;

        this.showCharacterSelection();
    }

    async init() {
        this.uiManager = new UIManager();
        this.uiManager.updateLoadingProgress(0, 'Initializing...');

        // Setup Three.js
        this.setupRenderer();
        this.setupScene();
        this.setupCamera();
        this.setupLights();

        this.uiManager.updateLoadingProgress(10, 'Loading asset system...');

        // Initialize asset loader
        this.assetLoader = new AssetLoader();

        this.uiManager.updateLoadingProgress(20, 'Connecting to server...');

        // Initialize network
        this.network = new NetworkManager(this);
        await this.network.connect();

        this.uiManager.updateLoadingProgress(40, 'Loading world...');

        // Initialize game systems
        this.worldManager = new WorldManager(this.scene);
        await this.worldManager.generateWorld();

        this.uiManager.updateLoadingProgress(60, 'Creating player...');

        // Initialize player with asset loader
        // Always use polygonesyntycharacter for the skeleton (has all the bones)
        // TODO: Later we can swap the mesh to selectedCharacter while keeping the skeleton
        this.playerController = new PlayerController(this.scene, this.camera, this.assetLoader);
        await this.playerController.init('polygonesyntycharacter');

        this.uiManager.updateLoadingProgress(80, 'Final setup...');

        // Setup event listeners
        this.setupEventListeners();

        this.uiManager.updateLoadingProgress(100, 'Ready!');

        setTimeout(() => {
            this.uiManager.hideLoadingScreen();
            this.isLoaded = true;
            this.animate();
        }, 500);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('game-canvas'),
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
        this.scene.fog = new THREE.Fog(0x87ceeb, 50, 200);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 5, 10);
    }

    setupLights() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Directional light (sun)
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 50, 50);
        dirLight.castShadow = true;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 200;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // Hemisphere light for better outdoor lighting
        const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x5d4e37, 0.4);
        this.scene.add(hemiLight);
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // Handle other players joining
    addPlayer(playerData) {
        console.log('Adding player:', playerData);
        // TODO: Create player mesh and add to scene
        this.players.set(playerData.id, playerData);
        this.uiManager.updatePlayerList(Array.from(this.players.values()));
    }

    // Handle other players leaving
    removePlayer(playerId) {
        console.log('Removing player:', playerId);
        // TODO: Remove player mesh from scene
        this.players.delete(playerId);
        this.uiManager.updatePlayerList(Array.from(this.players.values()));
    }

    // Update other players' positions
    updatePlayer(playerData) {
        const player = this.players.get(playerData.id);
        if (player) {
            player.position = playerData.position;
            player.rotation = playerData.rotation;
            // TODO: Update player mesh position/rotation
        }
    }

    animate() {
        if (!this.isLoaded) return;

        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        // Update player controller
        if (this.playerController) {
            this.playerController.update(delta);

            // Send position to server
            if (this.network) {
                this.network.sendPlayerUpdate({
                    position: this.playerController.getPosition(),
                    rotation: this.playerController.getRotation()
                });
            }
        }

        // Update FPS counter
        this.uiManager.updateFPS(Math.round(1 / delta));

        this.renderer.render(this.scene, this.camera);
    }

    showCharacterSelection() {
        this.characterSelector = new CharacterSelector((characterName) => {
            this.selectedCharacter = characterName;
            console.log('Selected character:', characterName);
            this.init();
        });
    }
}

// Start the game
new Game();
