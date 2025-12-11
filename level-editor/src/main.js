import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

class LevelEditor {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.orbitControls = null;
        this.transformControls = null;
        this.gltfLoader = new GLTFLoader();
        this.fbxLoader = new FBXLoader();
        this.textureLoader = new THREE.TextureLoader();

        // Textures for different asset types
        this.textures = {
            meadow: null,      // Main atlas for buildings, props, rocks
            grass: null,       // Grass texture with alpha
            branches: null,    // Tree branches/leaves
            clover: null,      // Clover/flowers
            cropField: null    // Crop fields
        };

        // Editor state
        this.selectedObject = null;
        this.placementMode = false;
        this.selectedAsset = null;
        this.previewObject = null;
        this.currentTool = 'select'; // select, move, rotate, scale
        this.snapEnabled = false;
        this.snapValue = 1;
        this.gridVisible = true;

        // Level data
        this.levelObjects = [];
        this.undoStack = [];
        this.redoStack = [];

        // Asset definitions
        this.assetCategories = {
            buildings: {
                name: 'Buildings',
                icon: '🏠',
                assets: []
            },
            props: {
                name: 'Props',
                icon: '🪑',
                assets: []
            },
            trees: {
                name: 'Trees & Bushes',
                icon: '🌲',
                assets: []
            },
            rocks: {
                name: 'Rocks & Terrain',
                icon: '🪨',
                assets: []
            },
            grass: {
                name: 'Grass',
                icon: '🌿',
                assets: []
            },
            flowers: {
                name: 'Flowers',
                icon: '🌸',
                assets: []
            },
            environment: {
                name: 'Environment',
                icon: '☁️',
                assets: []
            },
            characters: {
                name: 'Characters',
                icon: '👤',
                assets: []
            }
        };

        // Terrain
        this.terrain = null;
        this.terrainTool = null;
        this.brushSize = 5;
        this.brushStrength = 0.5;

        // Terrain painting
        this.paintMode = false;
        this.selectedPaintTexture = 0; // Index of texture to paint (0-3)
        this.splatmapCanvas = null;
        this.splatmapContext = null;
        this.splatmapTexture = null;
        this.terrainTextures = []; // Array of loaded textures for painting
        this.brushCursor = null;
        this.isPainting = false;

        // Chunk system for huge worlds
        this.chunkSize = 100; // Each chunk is 100x100 units
        this.currentChunkX = 0;
        this.currentChunkZ = 0;
        this.worldData = {}; // Stores all chunk data: { "0,0": { terrain, objects, splatmap }, ... }
        this.loadedChunks = {}; // Currently loaded chunk meshes for rendering neighbors
        this.worldMapVisible = false;
        this.worldName = 'New World';

        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Play mode
        this.isPlayMode = false;
        this.playerCamera = null;
        this.playerHeight = 1.8;
        this.playerSpeed = 10;
        this.mouseSensitivity = 0.002;
        this.playerVelocity = new THREE.Vector3();
        this.playerDirection = new THREE.Vector3();
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = true;
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.prevTime = performance.now();

        this.init();
    }

    init() {
        this.setupRenderer();
        this.setupScene();
        this.setupCamera();
        this.setupLights();
        this.setupControls();
        this.setupGrid();
        this.setupTerrain();
        this.setupEventListeners();
        this.loadAssets();
        this.setupUI();
        this.animate();
    }

    setupRenderer() {
        const canvas = document.getElementById('editor-canvas');
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.updateRendererSize();
    }

    updateRendererSize() {
        const viewport = document.getElementById('viewport');
        const width = viewport.clientWidth;
        const height = viewport.clientHeight;
        this.renderer.setSize(width, height);
        if (this.camera) {
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
    }

    setupCamera() {
        const viewport = document.getElementById('viewport');
        this.camera = new THREE.PerspectiveCamera(
            60,
            viewport.clientWidth / viewport.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(20, 20, 20);
        this.camera.lookAt(0, 0, 0);
    }

    setupLights() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // Directional light (sun)
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        this.dirLight.position.set(50, 100, 50);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.camera.left = -100;
        this.dirLight.shadow.camera.right = 100;
        this.dirLight.shadow.camera.top = 100;
        this.dirLight.shadow.camera.bottom = -100;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 200;
        this.dirLight.shadow.mapSize.width = 4096;
        this.dirLight.shadow.mapSize.height = 4096;
        this.dirLight.shadow.bias = -0.0005;
        this.dirLight.shadow.normalBias = 0.02;
        this.scene.add(this.dirLight);

        // Hemisphere light for ambient fill
        const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x5d4e37, 0.4);
        this.scene.add(hemiLight);
    }

    setupControls() {
        // Orbit controls
        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.1;
        this.orbitControls.mouseButtons = {
            LEFT: null,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.ROTATE
        };

        // Transform controls
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.orbitControls.enabled = !event.value;
        });
        this.transformControls.addEventListener('objectChange', () => {
            this.updatePropertiesPanel();
        });
        this.scene.add(this.transformControls);
    }

    setupGrid() {
        // Main grid
        this.gridHelper = new THREE.GridHelper(100, 100, 0x444466, 0x333355);
        this.scene.add(this.gridHelper);

        // Axes helper
        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);
    }

    setupTerrain() {
        // Ground texture options for painting (3 texture channels: R, G, B)
        this.paintableTextures = [
            {
                name: 'Grass',
                diffuse: '/assets/textures/ground/Grass_cxbrutihf_4k_Diffuse.jpg',
                normal: '/assets/textures/ground/Grass_cxbrutihf_4k_Normal.jpg',
                roughness: '/assets/textures/ground/Grass_cxbrutihf_4k_Roughness.jpg',
                ao: '/assets/textures/ground/Grass_cxbrutihf_4k_AmbientOcclusion.jpg',
                color: '#4a7c4e'
            },
            { name: 'Mud', diffuse: '/assets/textures/ground/PFK_Texture_Ground_Mud_01.png', color: '#5c4a3a' },
            { name: 'Sand', diffuse: '/assets/textures/ground/PFK_Texture_Ground_Sand_01.png', color: '#c4a76c' }
        ];

        // Create splatmap canvas (stores which texture to use at each point)
        const splatmapSize = 512;
        this.splatmapCanvas = document.createElement('canvas');
        this.splatmapCanvas.width = splatmapSize;
        this.splatmapCanvas.height = splatmapSize;
        this.splatmapContext = this.splatmapCanvas.getContext('2d');

        // Initialize splatmap with first texture (red channel = 255, others = 0)
        // We use RGB channels only (3 textures max for simplicity), alpha stays at 255
        const imageData = this.splatmapContext.createImageData(splatmapSize, splatmapSize);
        for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = 255;     // R - texture 0 (grass)
            imageData.data[i + 1] = 0;   // G - texture 1 (mud)
            imageData.data[i + 2] = 0;   // B - texture 2 (sand)
            imageData.data[i + 3] = 255; // A - always 255 (opaque)
        }
        this.splatmapContext.putImageData(imageData, 0, 0);

        // Create Three.js texture from canvas
        this.splatmapTexture = new THREE.CanvasTexture(this.splatmapCanvas);
        this.splatmapTexture.wrapS = THREE.ClampToEdgeWrapping;
        this.splatmapTexture.wrapT = THREE.ClampToEdgeWrapping;

        // Load terrain textures
        const loadTexture = (path) => {
            const tex = this.textureLoader.load(path);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(20, 20);
            return tex;
        };

        // Load diffuse textures
        this.terrainTextures = this.paintableTextures.map(t => loadTexture(t.diffuse));

        // Load additional texture maps for grass (normal, roughness, AO)
        this.terrainNormalMaps = this.paintableTextures.map(t => {
            if (t.normal) return loadTexture(t.normal);
            return null;
        });
        this.terrainRoughnessMaps = this.paintableTextures.map(t => {
            if (t.roughness) return loadTexture(t.roughness);
            return null;
        });
        this.terrainAOMaps = this.paintableTextures.map(t => {
            if (t.ao) return loadTexture(t.ao);
            return null;
        });

        // Create custom material for terrain splatmap blending with PBR support
        const terrainMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this.terrainTextures[0], // Use grass texture by default
            normalMap: this.terrainNormalMaps[0],
            roughnessMap: this.terrainRoughnessMaps[0],
            aoMap: this.terrainAOMaps[0],
            roughness: 0.8,
            metalness: 0.0
        });

        // Store references for the shader modification
        const splatmapTex = this.splatmapTexture;
        const tex0 = this.terrainTextures[0];
        const tex1 = this.terrainTextures[1];
        const tex2 = this.terrainTextures[2];
        const normal0 = this.terrainNormalMaps[0];
        const normal1 = this.terrainNormalMaps[1];
        const normal2 = this.terrainNormalMaps[2];
        const rough0 = this.terrainRoughnessMaps[0];
        const rough1 = this.terrainRoughnessMaps[1];
        const rough2 = this.terrainRoughnessMaps[2];

        terrainMaterial.onBeforeCompile = (shader) => {
            // Add custom uniforms
            shader.uniforms.splatmap = { value: splatmapTex };
            shader.uniforms.texture0 = { value: tex0 };
            shader.uniforms.texture1 = { value: tex1 };
            shader.uniforms.texture2 = { value: tex2 };
            shader.uniforms.normalMap0 = { value: normal0 };
            shader.uniforms.normalMap1 = { value: normal1 };
            shader.uniforms.normalMap2 = { value: normal2 };
            shader.uniforms.roughnessMap0 = { value: rough0 };
            shader.uniforms.roughnessMap1 = { value: rough1 };
            shader.uniforms.roughnessMap2 = { value: rough2 };
            shader.uniforms.textureScale = { value: 20.0 };

            // Add uniform declarations to vertex shader
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
                varying vec2 vUvTerrain;
                varying vec2 vUvScaled;
                uniform float textureScale;`
            );

            // Add UV passing in vertex shader
            shader.vertexShader = shader.vertexShader.replace(
                '#include <uv_vertex>',
                `#include <uv_vertex>
                vUvTerrain = uv;
                vUvScaled = uv * textureScale;`
            );

            // Add uniform declarations to fragment shader
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
                uniform sampler2D splatmap;
                uniform sampler2D texture0;
                uniform sampler2D texture1;
                uniform sampler2D texture2;
                uniform sampler2D normalMap0;
                uniform sampler2D normalMap1;
                uniform sampler2D normalMap2;
                uniform sampler2D roughnessMap0;
                uniform sampler2D roughnessMap1;
                uniform sampler2D roughnessMap2;
                varying vec2 vUvTerrain;
                varying vec2 vUvScaled;`
            );

            // Replace the diffuse color calculation with splatmap blending
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `// Splatmap terrain blending
                vec4 splat = texture2D(splatmap, vUvTerrain);
                vec4 t0 = texture2D(texture0, vUvScaled);
                vec4 t1 = texture2D(texture1, vUvScaled);
                vec4 t2 = texture2D(texture2, vUvScaled);

                float totalWeight = splat.r + splat.g + splat.b;
                vec4 terrainColor;
                if (totalWeight > 0.0) {
                    terrainColor = (t0 * splat.r + t1 * splat.g + t2 * splat.b) / totalWeight;
                } else {
                    terrainColor = t0;
                }
                diffuseColor *= terrainColor;`
            );


            // Store shader reference for texture updates
            this.terrainShader = shader;
        };

        // Need to mark for update when splatmap changes
        terrainMaterial.needsUpdate = true;

        // Create terrain mesh
        const geometry = new THREE.PlaneGeometry(100, 100, 100, 100);
        this.terrain = new THREE.Mesh(geometry, terrainMaterial);
        this.terrain.rotation.x = -Math.PI / 2;
        this.terrain.receiveShadow = true;
        this.terrain.userData.isTerrain = true;
        this.scene.add(this.terrain);

        // Create brush cursor (circular indicator)
        this.createBrushCursor();
    }

    createBrushCursor() {
        const cursorGeometry = new THREE.RingGeometry(0.9, 1.0, 32);
        const cursorMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        this.brushCursor = new THREE.Mesh(cursorGeometry, cursorMaterial);
        this.brushCursor.rotation.x = -Math.PI / 2;
        this.brushCursor.visible = false;
        this.brushCursor.position.y = 0.1;
        this.scene.add(this.brushCursor);
    }

    updateBrushCursor(worldPosition) {
        if (!this.brushCursor) return;

        // Scale cursor to match brush size
        const scale = this.brushSize;
        this.brushCursor.scale.set(scale, scale, scale);

        // Position cursor at paint location
        this.brushCursor.position.x = worldPosition.x;
        this.brushCursor.position.z = worldPosition.z;
        this.brushCursor.position.y = worldPosition.y + 0.1;
    }

    setPaintMode(enabled) {
        this.paintMode = enabled;
        this.brushCursor.visible = enabled;

        // Update UI
        document.querySelectorAll('.terrain-tool-btn').forEach(btn => {
            btn.classList.toggle('active', enabled && btn.dataset.tool === 'paint');
        });

        // Update cursor style
        if (enabled) {
            this.renderer.domElement.style.cursor = 'crosshair';
        } else {
            this.renderer.domElement.style.cursor = 'default';
        }
    }

    selectPaintTexture(index) {
        this.selectedPaintTexture = index;

        // Update UI
        document.querySelectorAll('.paint-texture-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === index);
        });
    }

    paintTerrain(worldPosition) {
        if (!this.paintMode || !this.splatmapCanvas) return;
        if (this.selectedPaintTexture > 2) return; // Only 3 textures (RGB)

        const canvas = this.splatmapCanvas;
        const ctx = this.splatmapContext;

        // Convert world position to canvas pixel coordinates
        // Terrain is 500x500 plane centered at origin, rotated -90° on X
        const terrainSize = 100;
        const px = ((worldPosition.x + terrainSize / 2) / terrainSize) * canvas.width;
        const py = ((worldPosition.z + terrainSize / 2) / terrainSize) * canvas.height;

        // Brush radius in pixels
        const brushRadiusPx = (this.brushSize / terrainSize) * canvas.width;

        // Get current image data in brush area
        const minX = Math.max(0, Math.floor(px - brushRadiusPx));
        const minY = Math.max(0, Math.floor(py - brushRadiusPx));
        const maxX = Math.min(canvas.width, Math.ceil(px + brushRadiusPx));
        const maxY = Math.min(canvas.height, Math.ceil(py + brushRadiusPx));
        const width = maxX - minX;
        const height = maxY - minY;

        if (width <= 0 || height <= 0) return;

        const imageData = ctx.getImageData(minX, minY, width, height);
        const data = imageData.data;

        // Paint each pixel in brush radius
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const canvasX = minX + x;
                const canvasY = minY + y;

                // Calculate distance from brush center
                const dx = canvasX - px;
                const dy = canvasY - py;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > brushRadiusPx) continue;

                // Falloff (smoother edges)
                const falloff = 1 - (dist / brushRadiusPx);
                const strength = this.brushStrength * falloff * 0.15;

                const i = (y * width + x) * 4;

                // Get current RGB channel values (ignore alpha)
                let r = data[i];
                let g = data[i + 1];
                let b = data[i + 2];

                // Add to selected channel
                const addAmount = Math.round(strength * 255);

                if (this.selectedPaintTexture === 0) {
                    r = Math.min(255, r + addAmount);
                } else if (this.selectedPaintTexture === 1) {
                    g = Math.min(255, g + addAmount);
                } else if (this.selectedPaintTexture === 2) {
                    b = Math.min(255, b + addAmount);
                }

                // Normalize RGB so they sum to 255 (keeps weights balanced)
                const total = r + g + b;
                if (total > 0) {
                    const scale = 255 / total;
                    r = Math.round(r * scale);
                    g = Math.round(g * scale);
                    b = Math.round(b * scale);
                }

                // Write back (keep alpha at 255)
                data[i] = r;
                data[i + 1] = g;
                data[i + 2] = b;
                data[i + 3] = 255;
            }
        }

        ctx.putImageData(imageData, minX, minY);

        // Update Three.js texture
        this.splatmapTexture.needsUpdate = true;

        // Also update shader uniform if available
        if (this.terrainShader) {
            this.terrainShader.uniforms.splatmap.value = this.splatmapTexture;
        }
    }

    // Legacy method for compatibility - now just enters paint mode
    setTerrainTexture(textureKey) {
        // Map old texture keys to new paint texture indices
        const keyToIndex = {
            'grass1': 0, 'grass2': 0, 'grass3': 0, 'grassDark': 3,
            'mud1': 1, 'mud2': 1, 'mud3': 1,
            'sand1': 2, 'sand2': 2, 'sand3': 2
        };

        const index = keyToIndex[textureKey] ?? 0;
        this.selectPaintTexture(index);
        this.setPaintMode(true);
    }

    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => this.updateRendererSize());

        // Mouse events on viewport
        const canvas = this.renderer.domElement;
        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvas.addEventListener('click', (e) => this.onClick(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.onKeyDown(e));

        // Play mode controls
        document.addEventListener('keydown', (e) => this.onPlayModeKeyDown(e));
        document.addEventListener('keyup', (e) => this.onPlayModeKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onPlayModeMouseMove(e));

        // Handle pointer lock change (exit play mode if pointer unlocked by ESC)
        document.addEventListener('pointerlockchange', () => {
            if (this.isPlayMode && document.pointerLockElement !== this.renderer.domElement) {
                // Pointer was unlocked, but don't exit play mode automatically
                // User can click Stop button or press ESC again
            }
        });

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Toolbar buttons
        document.getElementById('btn-new').addEventListener('click', () => this.newWorld());
        document.getElementById('btn-open').addEventListener('click', () => this.openWorld());
        document.getElementById('btn-save').addEventListener('click', () => this.saveWorld());
        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.redo());
        document.getElementById('btn-select').addEventListener('click', () => this.setTool('select'));
        document.getElementById('btn-move').addEventListener('click', () => this.setTool('move'));
        document.getElementById('btn-rotate').addEventListener('click', () => this.setTool('rotate'));
        document.getElementById('btn-scale').addEventListener('click', () => this.setTool('scale'));
        document.getElementById('btn-snap').addEventListener('click', () => this.toggleSnap());
        document.getElementById('btn-grid').addEventListener('click', () => this.toggleGrid());
        document.getElementById('btn-play').addEventListener('click', () => this.testLevel());

        // Chunk navigation buttons
        document.getElementById('btn-chunk-north').addEventListener('click', () => this.navigateChunk('north'));
        document.getElementById('btn-chunk-south').addEventListener('click', () => this.navigateChunk('south'));
        document.getElementById('btn-chunk-east').addEventListener('click', () => this.navigateChunk('east'));
        document.getElementById('btn-chunk-west').addEventListener('click', () => this.navigateChunk('west'));
        document.getElementById('btn-world-map').addEventListener('click', () => this.toggleWorldMap());

        // World map overlay
        document.getElementById('world-map-close').addEventListener('click', () => this.toggleWorldMap());
        document.getElementById('world-map-canvas').addEventListener('click', (e) => this.onWorldMapClick(e));

        // Property inputs
        ['pos-x', 'pos-y', 'pos-z', 'rot-x', 'rot-y', 'rot-z', 'scale-x', 'scale-y', 'scale-z'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.onPropertyChange());
        });

        // Terrain tools (sculpt)
        document.querySelectorAll('.terrain-tool-btn:not(.paint-mode-btn)').forEach(btn => {
            btn.addEventListener('click', () => {
                // If selecting a sculpt tool, disable paint mode
                if (btn.dataset.tool !== 'paint') {
                    this.setPaintMode(false);
                    document.querySelectorAll('.terrain-tool-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.terrainTool = btn.dataset.tool;
                }
            });
        });

        // Paint mode button
        const paintModeBtn = document.querySelector('.paint-mode-btn');
        if (paintModeBtn) {
            paintModeBtn.addEventListener('click', () => {
                const newPaintMode = !this.paintMode;
                this.setPaintMode(newPaintMode);
                paintModeBtn.classList.toggle('active', newPaintMode);

                // Clear other terrain tools when entering paint mode
                if (newPaintMode) {
                    this.terrainTool = null;
                    document.querySelectorAll('.terrain-tool-btn:not(.paint-mode-btn)').forEach(b => b.classList.remove('active'));
                }
            });
        }

        // Paint texture selection
        document.querySelectorAll('.paint-texture-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                this.selectPaintTexture(parseInt(btn.dataset.index));
            });
        });

        document.getElementById('brush-size').addEventListener('input', (e) => {
            this.brushSize = parseFloat(e.target.value);
            document.getElementById('brush-size-val').textContent = this.brushSize;
        });

        document.getElementById('brush-strength').addEventListener('input', (e) => {
            this.brushStrength = parseFloat(e.target.value);
            document.getElementById('brush-strength-val').textContent = this.brushStrength;
        });

        // Auto-populate dropdown toggle
        const autoPopulateBtn = document.getElementById('btn-auto-populate');
        const autoPopulateMenu = document.getElementById('auto-populate-menu');

        autoPopulateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = autoPopulateMenu.style.display === 'block';
            autoPopulateMenu.style.display = isVisible ? 'none' : 'block';
        });

        // Close menu when clicking outside
        document.addEventListener('click', () => {
            autoPopulateMenu.style.display = 'none';
        });

        // Auto-generate terrain button
        document.getElementById('btn-auto-terrain').addEventListener('click', () => {
            this.autoGenerateTerrain(10, 0.01);
            autoPopulateMenu.style.display = 'none';
        });

        // Flatten terrain button
        document.getElementById('btn-flatten-terrain').addEventListener('click', () => {
            this.flattenTerrain();
            autoPopulateMenu.style.display = 'none';
        });

        // Auto-populate grass button
        document.getElementById('btn-auto-grass').addEventListener('click', () => {
            this.autoPopulateGrass(0.12, true); // 12% coverage
            autoPopulateMenu.style.display = 'none';
        });

        // Clear auto grass button
        document.getElementById('btn-clear-grass').addEventListener('click', () => {
            this.clearAutoGrass();
            autoPopulateMenu.style.display = 'none';
        });

        // Auto-populate flowers button (default 5% density)
        document.getElementById('btn-auto-flowers').addEventListener('click', () => {
            this.autoPopulateFlowers(0.05, true);
            autoPopulateMenu.style.display = 'none';
        });

        // Clear auto flowers button
        document.getElementById('btn-clear-flowers').addEventListener('click', () => {
            this.clearAutoFlowers();
            autoPopulateMenu.style.display = 'none';
        });

        // Auto-populate trees button
        document.getElementById('btn-auto-trees').addEventListener('click', () => {
            this.autoPopulateTrees(0.4, true); // Increased to 40% for a lot more trees
            autoPopulateMenu.style.display = 'none';
        });

        // Clear auto trees button
        document.getElementById('btn-clear-trees').addEventListener('click', () => {
            this.clearAutoTrees();
            autoPopulateMenu.style.display = 'none';
        });

        // Auto-populate bushes button (default 6% density)
        document.getElementById('btn-auto-bushes').addEventListener('click', () => {
            this.autoPopulateBushes(0.06, true);
            autoPopulateMenu.style.display = 'none';
        });

        // Clear auto bushes button
        document.getElementById('btn-clear-bushes').addEventListener('click', () => {
            this.clearAutoBushes();
            autoPopulateMenu.style.display = 'none';
        });

        // Auto-populate rocks button (default 5% density)
        document.getElementById('btn-auto-rocks').addEventListener('click', () => {
            this.autoPopulateRocks(0.05, true);
            autoPopulateMenu.style.display = 'none';
        });

        // Clear auto rocks button
        document.getElementById('btn-clear-rocks').addEventListener('click', () => {
            this.clearAutoRocks();
            autoPopulateMenu.style.display = 'none';
        });

        // Auto-populate buildings button
        document.getElementById('btn-auto-town').addEventListener('click', () => {
            this.autoPopulateTown(0.6, true); // 60% density - chance per city block
            autoPopulateMenu.style.display = 'none';
        });

        // Clear auto buildings button
        document.getElementById('btn-clear-town').addEventListener('click', () => {
            this.clearAutoTown();
            autoPopulateMenu.style.display = 'none';
        });

        // Terrain texture selector (legacy - now enters paint mode)
        document.querySelectorAll('.terrain-texture-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setTerrainTexture(btn.dataset.texture);
            });
        });
    }

    loadAssets() {
        // Helper to load texture with proper settings
        const loadTexture = (path) => {
            const tex = this.textureLoader.load(path);
            tex.flipY = false;
            tex.colorSpace = THREE.SRGBColorSpace;
            return tex;
        };

        // Load textures for different asset types
        this.textures.meadow = loadTexture('/assets/textures/meadow/PolygonNatureBiomes_Meadow_Texture_01.png');
        this.textures.grass = loadTexture('/assets/textures/meadow/Grass_01.png');
        this.textures.branches = loadTexture('/assets/textures/meadow/Branches_01.png');
        this.textures.clover = loadTexture('/assets/textures/meadow/cloverMat_01.png');
        this.textures.cropField = loadTexture('/assets/textures/meadow/CropField_01.png');
        this.textures.rock = loadTexture('/assets/textures/meadow/Rock_Moss_Texture_01.png');
        this.textures.flowers = loadTexture('/assets/textures/meadow/Grass_Flowers_Texture_01.png');

        // Keep reference for backward compatibility
        this.meadowTexture = this.textures.meadow;

        // Buildings (42 GLB assets)
        this.assetCategories.buildings.assets = [
            // Preset Buildings
            { name: 'Blacksmith', file: 'SM_Bld_Preset_Blacksmith_01_Optimized.glb', path: 'buildings', icon: '🔨', type: 'glb' },
            { name: 'Church A', file: 'SM_Bld_Preset_Church_01_A_Optimized.glb', path: 'buildings', icon: '⛪', type: 'glb' },
            { name: 'Church B', file: 'SM_Bld_Preset_Church_01_B_Optimized.glb', path: 'buildings', icon: '⛪', type: 'glb' },
            { name: 'House 1A', file: 'SM_Bld_Preset_House_01_A_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 2A', file: 'SM_Bld_Preset_House_02_A_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 3', file: 'SM_Bld_Preset_House_03_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 4', file: 'SM_Bld_Preset_House_04_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 5', file: 'SM_Bld_Preset_House_05_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 6', file: 'SM_Bld_Preset_House_06_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 7', file: 'SM_Bld_Preset_House_07_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 8', file: 'SM_Bld_Preset_House_08_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 9A', file: 'SM_Bld_Preset_House_09_A_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 9B', file: 'SM_Bld_Preset_House_09_B_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 9C', file: 'SM_Bld_Preset_House_09_C_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 10', file: 'SM_Bld_Preset_House_10_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'House 10 Base', file: 'SM_Bld_Preset_House_10_Base_Optimized.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'Archway 1', file: 'SM_Bld_Preset_House_Archway_01_Optimized.glb', path: 'buildings', icon: '🚪', type: 'glb' },
            { name: 'Archway 1 Wing 1', file: 'SM_Bld_Preset_House_Archway_01_Wing_01_Optimized.glb', path: 'buildings', icon: '🚪', type: 'glb' },
            { name: 'Archway 1 Wing 2', file: 'SM_Bld_Preset_House_Archway_01_Wing_02_Optimized.glb', path: 'buildings', icon: '🚪', type: 'glb' },
            { name: 'Archway 2', file: 'SM_Bld_Preset_House_Archway_02_Optimized.glb', path: 'buildings', icon: '🚪', type: 'glb' },
            { name: 'House Windmill', file: 'SM_Bld_Preset_House_Windmill_01_Optimized.glb', path: 'buildings', icon: '🏭', type: 'glb' },
            { name: 'House Windmill Base', file: 'SM_Bld_Preset_House_Windmill_01_Base_Optimized.glb', path: 'buildings', icon: '🏭', type: 'glb' },
            { name: 'House Windmill Blades', file: 'SM_Bld_Preset_House_Windmill_01_Blades_Optimized.glb', path: 'buildings', icon: '🏭', type: 'glb' },
            { name: 'Hut 1', file: 'SM_Bld_Preset_Hut_01_Optimized.glb', path: 'buildings', icon: '🛖', type: 'glb' },
            { name: 'Hut 2', file: 'SM_Bld_Preset_Hut_02_Optimized.glb', path: 'buildings', icon: '🛖', type: 'glb' },
            { name: 'Outhouse', file: 'SM_Bld_Preset_Outhouse_01_Optimized.glb', path: 'buildings', icon: '🚽', type: 'glb' },
            { name: 'Shelter 1', file: 'SM_Bld_Preset_Shelter_01_Optimized.glb', path: 'buildings', icon: '🏚️', type: 'glb' },
            { name: 'Shelter 2', file: 'SM_Bld_Preset_Shelter_02_Optimized.glb', path: 'buildings', icon: '🏚️', type: 'glb' },
            { name: 'Stables', file: 'SM_Bld_Preset_Stables_01_Optimized.glb', path: 'buildings', icon: '🐴', type: 'glb' },
            { name: 'Stables Piece', file: 'SM_Bld_Preset_Stables_01_Optimized_Piece_01.glb', path: 'buildings', icon: '🐴', type: 'glb' },
            { name: 'Tavern', file: 'SM_Bld_Preset_Tavern_01_Optimized.glb', path: 'buildings', icon: '🍺', type: 'glb' },
            { name: 'Tavern Base', file: 'SM_Bld_Preset_Tavern_01_Base_Optimized.glb', path: 'buildings', icon: '🍺', type: 'glb' },
            { name: 'Tavern Stairs', file: 'SM_Bld_Preset_Tavern_01_Stairs_Optimized.glb', path: 'buildings', icon: '🍺', type: 'glb' },
            { name: 'Tower', file: 'SM_Bld_Preset_Tower_01_Optimized.glb', path: 'buildings', icon: '🗼', type: 'glb' },
            // Original Buildings
            { name: 'Stone Cabin', file: 'SM_Bld_Stone_Cabin_01.glb', path: 'buildings', icon: '🏠', type: 'glb' },
            { name: 'Warpgate', file: 'SM_Bld_Warpgate_01.glb', path: 'buildings', icon: '🌀', type: 'glb' },
            { name: 'Warpgate Inner Ring', file: 'SM_Bld_Warpgate_01_InnerRing_01.glb', path: 'buildings', icon: '🌀', type: 'glb' },
            { name: 'Warpgate Outer Ring', file: 'SM_Bld_Warpgate_01_OuterRing_01.glb', path: 'buildings', icon: '🌀', type: 'glb' },
            { name: 'Windmill 1', file: 'SM_Bld_Windmill_01.glb', path: 'buildings', icon: '🏭', type: 'glb' },
            { name: 'Windmill 1 Blades', file: 'SM_Bld_Windmill_01_Blades_01.glb', path: 'buildings', icon: '🏭', type: 'glb' },
            { name: 'Windmill 2', file: 'SM_Bld_Windmill_02.glb', path: 'buildings', icon: '🏭', type: 'glb' },
            { name: 'Windmill 2 Blades', file: 'SM_Bld_Windmill_02_Blades_01.glb', path: 'buildings', icon: '🏭', type: 'glb' }
        ];

        // Props (96 FBX assets)
        this.assetCategories.props.assets = [
            { name: 'Birdhouse 1', file: 'SM_Prop_Birdhouse_01.FBX', path: 'props', icon: '🏠', type: 'fbx' },
            { name: 'Birdhouse 2', file: 'SM_Prop_Birdhouse_02.FBX', path: 'props', icon: '🏠', type: 'fbx' },
            { name: 'Bridge', file: 'SM_Prop_Bridge_01.FBX', path: 'props', icon: '🌉', type: 'fbx' },
            { name: 'Bucket 1', file: 'SM_Prop_Camp_Bucket_01.FBX', path: 'props', icon: '🪣', type: 'fbx' },
            { name: 'Bucket 2', file: 'SM_Prop_Camp_Bucket_02.FBX', path: 'props', icon: '🪣', type: 'fbx' },
            { name: 'Can 1', file: 'SM_Prop_Camp_Can_01.FBX', path: 'props', icon: '🥫', type: 'fbx' },
            { name: 'Can 2', file: 'SM_Prop_Camp_Can_02.FBX', path: 'props', icon: '🥫', type: 'fbx' },
            { name: 'Crate', file: 'SM_Prop_Camp_Crate_01.FBX', path: 'props', icon: '📦', type: 'fbx' },
            { name: 'Fire Tripod', file: 'SM_Prop_Camp_Fire_Tripod_01.FBX', path: 'props', icon: '🔥', type: 'fbx' },
            { name: 'Fireplace 1', file: 'SM_Prop_Camp_Fireplace_01.FBX', path: 'props', icon: '🔥', type: 'fbx' },
            { name: 'Fireplace 2', file: 'SM_Prop_Camp_Fireplace_02.FBX', path: 'props', icon: '🔥', type: 'fbx' },
            { name: 'Fireplace Stones', file: 'SM_Prop_Camp_Fireplace_Stones_01.FBX', path: 'props', icon: '🔥', type: 'fbx' },
            { name: 'Pouch', file: 'SM_Prop_Camp_Pouch_01.FBX', path: 'props', icon: '👝', type: 'fbx' },
            { name: 'Tanning Rack', file: 'SM_Prop_Camp_Tanning_Rack_01.FBX', path: 'props', icon: '🦌', type: 'fbx' },
            { name: 'Tent', file: 'SM_Prop_Camp_Tent_01.FBX', path: 'props', icon: '⛺', type: 'fbx' },
            { name: 'Gate Small', file: 'SM_Prop_Gate_Small_01.FBX', path: 'props', icon: '🚪', type: 'fbx' },
            { name: 'Gate Small Door', file: 'SM_Prop_Gate_Small_Door_01.FBX', path: 'props', icon: '🚪', type: 'fbx' },
            { name: 'Horse Hitch', file: 'SM_Prop_HorseHitch_01.FBX', path: 'props', icon: '🐴', type: 'fbx' },
            { name: 'Kite 1', file: 'SM_Prop_Kite_01.FBX', path: 'props', icon: '🪁', type: 'fbx' },
            { name: 'Kite 2', file: 'SM_Prop_Kite_02.FBX', path: 'props', icon: '🪁', type: 'fbx' },
            { name: 'Kite 3', file: 'SM_Prop_Kite_03.FBX', path: 'props', icon: '🪁', type: 'fbx' },
            { name: 'Leaves Branch', file: 'SM_Prop_Leaves_Branch_01.FBX', path: 'props', icon: '🍂', type: 'fbx' },
            { name: 'Leaves Pile 1', file: 'SM_Prop_Leaves_Pile_01.FBX', path: 'props', icon: '🍂', type: 'fbx' },
            { name: 'Leaves Pile 2', file: 'SM_Prop_Leaves_Pile_02.FBX', path: 'props', icon: '🍂', type: 'fbx' },
            { name: 'Fence 1', file: 'SM_Prop_Meadow_Fence_01.FBX', path: 'props', icon: '🚧', type: 'fbx' },
            { name: 'Fence 2', file: 'SM_Prop_Meadow_Fence_02.FBX', path: 'props', icon: '🚧', type: 'fbx' },
            { name: 'Fence 3', file: 'SM_Prop_Meadow_Fence_03.FBX', path: 'props', icon: '🚧', type: 'fbx' },
            { name: 'Fence 4', file: 'SM_Prop_Meadow_Fence_04.FBX', path: 'props', icon: '🚧', type: 'fbx' },
            { name: 'Fence 5', file: 'SM_Prop_Meadow_Fence_05.FBX', path: 'props', icon: '🚧', type: 'fbx' },
            { name: 'Fence 6', file: 'SM_Prop_Meadow_Fence_06.FBX', path: 'props', icon: '🚧', type: 'fbx' },
            { name: 'Fence 7', file: 'SM_Prop_Meadow_Fence_07.FBX', path: 'props', icon: '🚧', type: 'fbx' },
            { name: 'Fence Gate 1', file: 'SM_Prop_Meadow_Fence_Gate_01.FBX', path: 'props', icon: '🚪', type: 'fbx' },
            { name: 'Fence Gate 2', file: 'SM_Prop_Meadow_Fence_Gate_02.FBX', path: 'props', icon: '🚪', type: 'fbx' },
            { name: 'Fence Gate Latch', file: 'SM_Prop_Meadow_Fence_Gate_02_Latch_01.FBX', path: 'props', icon: '🔒', type: 'fbx' },
            { name: 'Fence Gate Set 1', file: 'SM_Prop_Meadow_Fence_Gate_Set_01.FBX', path: 'props', icon: '🚪', type: 'fbx' },
            { name: 'Fence Gate Set 1 Gate', file: 'SM_Prop_Meadow_Fence_Gate_Set_01_Gate_01.FBX', path: 'props', icon: '🚪', type: 'fbx' },
            { name: 'Fence Gate Set 1 Latch', file: 'SM_Prop_Meadow_Fence_Gate_Set_01_Latch_01.FBX', path: 'props', icon: '🔒', type: 'fbx' },
            { name: 'Fence Gate Set 2', file: 'SM_Prop_Meadow_Fence_Gate_Set_02.FBX', path: 'props', icon: '🚪', type: 'fbx' },
            { name: 'Fence Gate Set 2 Gate', file: 'SM_Prop_Meadow_Fence_Gate_Set_02_Gate_02.FBX', path: 'props', icon: '🚪', type: 'fbx' },
            { name: 'Fence Gate Set 2 Latch', file: 'SM_Prop_Meadow_Fence_Gate_Set_02_Latch_01.FBX', path: 'props', icon: '🔒', type: 'fbx' },
            { name: 'Fence Post 1', file: 'SM_Prop_Meadow_Fence_Post_01.FBX', path: 'props', icon: '🪵', type: 'fbx' },
            { name: 'Fence Post 2', file: 'SM_Prop_Meadow_Fence_Post_02.FBX', path: 'props', icon: '🪵', type: 'fbx' },
            { name: 'Fence Post 3', file: 'SM_Prop_Meadow_Fence_Post_03.FBX', path: 'props', icon: '🪵', type: 'fbx' },
            { name: 'Fence Railing', file: 'SM_Prop_Meadow_Fence_Railing_01.FBX', path: 'props', icon: '🚧', type: 'fbx' },
            { name: 'Mushroom 1', file: 'SM_Prop_Mushroom_01.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom 2', file: 'SM_Prop_Mushroom_02.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom 3', file: 'SM_Prop_Mushroom_03.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom 4', file: 'SM_Prop_Mushroom_04.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom 5', file: 'SM_Prop_Mushroom_05.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom 6', file: 'SM_Prop_Mushroom_06.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom Group 2', file: 'SM_Prop_Mushroom_Group_02.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom Group 3', file: 'SM_Prop_Mushroom_Group_03.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom Group 4', file: 'SM_Prop_Mushroom_Group_04.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom Group 5', file: 'SM_Prop_Mushroom_Group_05.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom Sparse 1', file: 'SM_Prop_Mushroom_Sparse_01.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom Sparse 2', file: 'SM_Prop_Mushroom_Sparse_02.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom Sparse 3', file: 'SM_Prop_Mushroom_Sparse_03.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom Sparse 4', file: 'SM_Prop_Mushroom_Sparse_04.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom Sparse 5', file: 'SM_Prop_Mushroom_Sparse_05.FBX', path: 'props', icon: '🍄', type: 'fbx' },
            { name: 'Mushroom House 1', file: 'SM_Prop_MushroomHouse_01.FBX', path: 'props', icon: '🏠', type: 'fbx' },
            { name: 'Mushroom House 2', file: 'SM_Prop_MushroomHouse_02.FBX', path: 'props', icon: '🏠', type: 'fbx' },
            { name: 'Scarecrow', file: 'SM_Prop_ScareCrow_01.FBX', path: 'props', icon: '🎃', type: 'fbx' },
            { name: 'SciFi Cable 1', file: 'SM_Prop_SciFiCable_01.FBX', path: 'props', icon: '🔌', type: 'fbx' },
            { name: 'SciFi Cable 2', file: 'SM_Prop_SciFiCable_02.FBX', path: 'props', icon: '🔌', type: 'fbx' },
            { name: 'SciFi Crate 1', file: 'SM_Prop_SciFiCrate_01.FBX', path: 'props', icon: '📦', type: 'fbx' },
            { name: 'SciFi Crate 2', file: 'SM_Prop_SciFiCrate_02.FBX', path: 'props', icon: '📦', type: 'fbx' },
            { name: 'Sign 1', file: 'SM_Prop_Sign_01.FBX', path: 'props', icon: '🪧', type: 'fbx' },
            { name: 'Sign 2', file: 'SM_Prop_Sign_02.FBX', path: 'props', icon: '🪧', type: 'fbx' },
            { name: 'Sign 3', file: 'SM_Prop_Sign_03.FBX', path: 'props', icon: '🪧', type: 'fbx' },
            { name: 'Stone Hole', file: 'SM_Prop_Stone_Hole_01.FBX', path: 'props', icon: '🕳️', type: 'fbx' },
            { name: 'Stone Arch', file: 'SM_Prop_StoneArch_01.FBX', path: 'props', icon: '🏛️', type: 'fbx' },
            { name: 'Stone Pile 1', file: 'SM_Prop_StonePile_01.FBX', path: 'props', icon: '🪨', type: 'fbx' },
            { name: 'Stone Pile 2', file: 'SM_Prop_StonePile_02.FBX', path: 'props', icon: '🪨', type: 'fbx' },
            { name: 'Stone Pile 3', file: 'SM_Prop_StonePile_03.FBX', path: 'props', icon: '🪨', type: 'fbx' },
            { name: 'Stone Runes 1', file: 'SM_Prop_StoneRunes_01.FBX', path: 'props', icon: '🗿', type: 'fbx' },
            { name: 'Stone Runes 2', file: 'SM_Prop_StoneRunes_02.FBX', path: 'props', icon: '🗿', type: 'fbx' },
            { name: 'Stone Runes 3', file: 'SM_Prop_StoneRunes_03.FBX', path: 'props', icon: '🗿', type: 'fbx' },
            { name: 'Stone Stack 1', file: 'SM_Prop_StoneStack_01.FBX', path: 'props', icon: '🪨', type: 'fbx' },
            { name: 'Stone Stack 2', file: 'SM_Prop_StoneStack_02.FBX', path: 'props', icon: '🪨', type: 'fbx' },
            { name: 'Stonewall 1', file: 'SM_Prop_Stonewall_01.FBX', path: 'props', icon: '🧱', type: 'fbx' },
            { name: 'Stonewall 2', file: 'SM_Prop_Stonewall_02.FBX', path: 'props', icon: '🧱', type: 'fbx' },
            { name: 'Stonewall End', file: 'SM_Prop_Stonewall_End_01.FBX', path: 'props', icon: '🧱', type: 'fbx' },
            { name: 'Stonewall Long', file: 'SM_Prop_Stonewall_Long_01.FBX', path: 'props', icon: '🧱', type: 'fbx' },
            { name: 'Stonewall Pillar 1', file: 'SM_Prop_Stonewall_Pillar_01.FBX', path: 'props', icon: '🪨', type: 'fbx' },
            { name: 'Stonewall Pillar 2', file: 'SM_Prop_Stonewall_Pillar_02.FBX', path: 'props', icon: '🪨', type: 'fbx' },
            { name: 'Stonewall Small 1', file: 'SM_Prop_Stonewall_Small_01.FBX', path: 'props', icon: '🧱', type: 'fbx' },
            { name: 'Stonewall Small 2', file: 'SM_Prop_Stonewall_Small_02.FBX', path: 'props', icon: '🧱', type: 'fbx' },
            { name: 'Sword', file: 'SM_Prop_Sword_01.FBX', path: 'props', icon: '⚔️', type: 'fbx' },
            { name: 'Sword Stone', file: 'SM_Prop_Sword_Stone_01.FBX', path: 'props', icon: '⚔️', type: 'fbx' },
            { name: 'Wagon Broken', file: 'SM_Prop_Wagon_Broken_01.FBX', path: 'props', icon: '🛞', type: 'fbx' },
            { name: 'Water Wheel', file: 'SM_Prop_WaterWheel_01.FBX', path: 'props', icon: '💧', type: 'fbx' },
            { name: 'Water Wheel Cog', file: 'SM_Prop_WaterWheel_01_Cog_01.FBX', path: 'props', icon: '⚙️', type: 'fbx' },
            { name: 'Water Wheel Wheel', file: 'SM_Prop_WaterWheel_01_Wheel_01.FBX', path: 'props', icon: '💧', type: 'fbx' },
            { name: 'Well', file: 'SM_Prop_Well_01.FBX', path: 'props', icon: '🪣', type: 'fbx' },
            { name: 'Wind Chime 1', file: 'SM_Prop_WindChime_01.FBX', path: 'props', icon: '🎐', type: 'fbx' },
            { name: 'Wind Chime 2', file: 'SM_Prop_WindChime_02.FBX', path: 'props', icon: '🎐', type: 'fbx' }
        ];

        // Trees & Bushes (12 GLB assets)
        this.assetCategories.trees.assets = [
            { name: 'Bush 1', file: 'SM_Env_Bush_01.glb', path: 'nature/trees', icon: '🌿', type: 'glb' },
            { name: 'Bush 2', file: 'SM_Env_Bush_02.glb', path: 'nature/trees', icon: '🌿', type: 'glb' },
            { name: 'Bush 3', file: 'SM_Env_Bush_03.glb', path: 'nature/trees', icon: '🌿', type: 'glb' },
            { name: 'Birch Tree 1', file: 'SM_Env_Tree_Birch_01.glb', path: 'nature/trees', icon: '🌳', type: 'glb' },
            { name: 'Birch Tree 2', file: 'SM_Env_Tree_Birch_02.glb', path: 'nature/trees', icon: '🌳', type: 'glb' },
            { name: 'Birch Tree 3', file: 'SM_Env_Tree_Birch_03.glb', path: 'nature/trees', icon: '🌳', type: 'glb' },
            { name: 'Fruit Tree 1', file: 'SM_Env_Tree_Fruit_01.glb', path: 'nature/trees', icon: '🍎', type: 'glb' },
            { name: 'Fruit Tree 2', file: 'SM_Env_Tree_Fruit_02.glb', path: 'nature/trees', icon: '🍎', type: 'glb' },
            { name: 'Fruit Tree 3', file: 'SM_Env_Tree_Fruit_03.glb', path: 'nature/trees', icon: '🍎', type: 'glb' },
            { name: 'Fruit Tree Fruit', file: 'SM_Env_Tree_Fruit_Fruit_01.glb', path: 'nature/trees', icon: '🍎', type: 'glb' },
            { name: 'Meadow Tree 1', file: 'SM_Env_Tree_Meadow_01.glb', path: 'nature/trees', icon: '🌲', type: 'glb' },
            { name: 'Meadow Tree 2', file: 'SM_Env_Tree_Meadow_02.glb', path: 'nature/trees', icon: '🌲', type: 'glb' }
        ];

        // Rocks (22 GLB assets with embedded textures)
        this.assetCategories.rocks.assets = [
            { name: 'Rock 1', file: 'SM_Env_Rock_01.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock 2', file: 'SM_Env_Rock_02.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock 3', file: 'SM_Env_Rock_03.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock 4', file: 'SM_Env_Rock_04.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock 5', file: 'SM_Env_Rock_05.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock 6', file: 'SM_Env_Rock_06.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Cliff 1', file: 'SM_Env_Rock_Cliff_01.glb', path: 'nature/rocks', icon: '⛰️', type: 'glb' },
            { name: 'Rock Cliff 2', file: 'SM_Env_Rock_Cliff_02.glb', path: 'nature/rocks', icon: '⛰️', type: 'glb' },
            { name: 'Rock Cliff 3', file: 'SM_Env_Rock_Cliff_03.glb', path: 'nature/rocks', icon: '⛰️', type: 'glb' },
            { name: 'Rock Ground 1', file: 'SM_Env_Rock_Ground_01.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Ground 2', file: 'SM_Env_Rock_Ground_02.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Pile 1', file: 'SM_Env_Rock_Pile_01.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Pile 2', file: 'SM_Env_Rock_Pile_02.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Pile 3', file: 'SM_Env_Rock_Pile_03.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Pile 4', file: 'SM_Env_Rock_Pile_04.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Pile 5', file: 'SM_Env_Rock_Pile_05.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Pile 6', file: 'SM_Env_Rock_Pile_06.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Pile 7', file: 'SM_Env_Rock_Pile_07.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Round', file: 'SM_Env_Rock_Round_01.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Small', file: 'SM_Env_Rock_Small_01.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Small Pile 1', file: 'SM_Env_Rock_Small_Pile_01.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' },
            { name: 'Rock Small Pile 2', file: 'SM_Env_Rock_Small_Pile_02.glb', path: 'nature/rocks', icon: '🪨', type: 'glb' }
        ];

        // Grass (21 GLB assets with embedded textures)
        this.assetCategories.grass.assets = [
            { name: 'Crop Field 1', file: 'SM_Env_CropField_Clump_01.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Crop Field 2', file: 'SM_Env_CropField_Clump_02.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Bush', file: 'SM_Env_Grass_Bush_01.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            { name: 'Grass Large 1', file: 'SM_Env_Grass_Large_01.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Large 2', file: 'SM_Env_Grass_Large_02.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Large 3', file: 'SM_Env_Grass_Large_03.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Large 4', file: 'SM_Env_Grass_Large_04.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Med 1', file: 'SM_Env_Grass_Med_Clump_01.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            { name: 'Grass Med 2', file: 'SM_Env_Grass_Med_Clump_02.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            { name: 'Grass Med 3', file: 'SM_Env_Grass_Med_Clump_03.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            { name: 'Grass Med Plane', file: 'SM_Env_Grass_Med_Plane_01.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            { name: 'Grass Short 1', file: 'SM_Env_Grass_Short_Clump_01.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            { name: 'Grass Short 2', file: 'SM_Env_Grass_Short_Clump_02.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            { name: 'Grass Short 3', file: 'SM_Env_Grass_Short_Clump_03.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            { name: 'Grass Short Plane', file: 'SM_Env_Grass_Short_Plane_01.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            { name: 'Grass Tall 1', file: 'SM_Env_Grass_Tall_Clump_01.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Tall 2', file: 'SM_Env_Grass_Tall_Clump_02.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Tall 3', file: 'SM_Env_Grass_Tall_Clump_03.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Tall 4', file: 'SM_Env_Grass_Tall_Clump_04.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Tall 5', file: 'SM_Env_Grass_Tall_Clump_05.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Tall Plane', file: 'SM_Env_Grass_Tall_Plane_01.glb', path: 'nature/grass', icon: '🌾', type: 'glb' }
        ];

        // Flowers (15 GLB assets with embedded textures)
        this.assetCategories.flowers.assets = [
            { name: 'Flowers Flat 1', file: 'SM_Env_Flowers_Flat_01.glb', path: 'nature/flowers', icon: '🌸', type: 'glb' },
            { name: 'Flowers Flat 2', file: 'SM_Env_Flowers_Flat_02.glb', path: 'nature/flowers', icon: '🌸', type: 'glb' },
            { name: 'Flowers Flat 3', file: 'SM_Env_Flowers_Flat_03.glb', path: 'nature/flowers', icon: '🌸', type: 'glb' },
            { name: 'Lillies 1', file: 'SM_Env_Lillies_01.glb', path: 'nature/flowers', icon: '🌷', type: 'glb' },
            { name: 'Lillies 2', file: 'SM_Env_Lillies_02.glb', path: 'nature/flowers', icon: '🌷', type: 'glb' },
            { name: 'Lillies 3', file: 'SM_Env_Lillies_03.glb', path: 'nature/flowers', icon: '🌷', type: 'glb' },
            { name: 'Rapeseed 1', file: 'SM_Env_Rapeseed_Clump_01.glb', path: 'nature/flowers', icon: '🌻', type: 'glb' },
            { name: 'Rapeseed 2', file: 'SM_Env_Rapeseed_Clump_02.glb', path: 'nature/flowers', icon: '🌻', type: 'glb' },
            { name: 'Sunflower', file: 'SM_Env_Sunflower_01.glb', path: 'nature/flowers', icon: '🌻', type: 'glb' },
            { name: 'Wildflowers 1', file: 'SM_Env_Wildflowers_01.glb', path: 'nature/flowers', icon: '🌼', type: 'glb' },
            { name: 'Wildflowers 2', file: 'SM_Env_Wildflowers_02.glb', path: 'nature/flowers', icon: '🌼', type: 'glb' },
            { name: 'Wildflowers 3', file: 'SM_Env_Wildflowers_03.glb', path: 'nature/flowers', icon: '🌼', type: 'glb' },
            { name: 'Wildflowers Patch 1', file: 'SM_Env_Wildflowers_Patch_01.glb', path: 'nature/flowers', icon: '🌺', type: 'glb' },
            { name: 'Wildflowers Patch 2', file: 'SM_Env_Wildflowers_Patch_02.glb', path: 'nature/flowers', icon: '🌺', type: 'glb' },
            { name: 'Wildflowers Patch 3', file: 'SM_Env_Wildflowers_Patch_03.glb', path: 'nature/flowers', icon: '🌺', type: 'glb' }
        ];

        // Environment (12 GLB assets with embedded textures)
        this.assetCategories.environment.assets = [
            { name: 'Background Hill', file: 'SM_Env_Background_Hill_01_SM_Env_Background_Hill_01.glb', path: 'environment', icon: '⛰️', type: 'glb' },
            { name: 'Cloud Ring', file: 'SM_Env_CloudRing_Larger_01.glb', path: 'environment', icon: '☁️', type: 'glb' },
            { name: 'Ground Cliff 1', file: 'SM_Env_Ground_Cliff_Large_01.glb', path: 'environment', icon: '⛰️', type: 'glb' },
            { name: 'Ground Cliff 2', file: 'SM_Env_Ground_Cliff_Large_02.glb', path: 'environment', icon: '⛰️', type: 'glb' },
            { name: 'Ground Cover 1', file: 'SM_Env_Ground_Cover_01.glb', path: 'environment', icon: '🟫', type: 'glb' },
            { name: 'Ground Cover 2', file: 'SM_Env_Ground_Cover_02.glb', path: 'environment', icon: '🟫', type: 'glb' },
            { name: 'Ground Cover 3', file: 'SM_Env_Ground_Cover_03.glb', path: 'environment', icon: '🟫', type: 'glb' },
            { name: 'Ground Mound 1', file: 'SM_Env_Ground_Mound_Large_01.glb', path: 'environment', icon: '⛰️', type: 'glb' },
            { name: 'Ground Mound 2', file: 'SM_Env_Ground_Mound_Large_02.glb', path: 'environment', icon: '⛰️', type: 'glb' },
            { name: 'Ground Mound 3', file: 'SM_Env_Ground_Mound_Large_03.glb', path: 'environment', icon: '⛰️', type: 'glb' },
            { name: 'Ground Mound 4', file: 'SM_Env_Ground_Mound_Large_04.glb', path: 'environment', icon: '⛰️', type: 'glb' },
            { name: 'Water Plane', file: 'SM_Env_Water_Plane_01.glb', path: 'environment', icon: '💧', type: 'glb' }
        ];

        // Characters - empty for now
        this.assetCategories.characters.assets = [];

        this.populateContentBrowser();
    }

    populateContentBrowser() {
        this.currentContentCategory = 'all';

        // Populate categories sidebar
        const categoriesDiv = document.getElementById('content-categories');
        categoriesDiv.innerHTML = '';

        // Add "All" category
        const allCount = Object.values(this.assetCategories).reduce((sum, cat) => sum + cat.assets.length, 0);
        const allItem = document.createElement('div');
        allItem.className = 'content-category-item active';
        allItem.dataset.category = 'all';
        allItem.innerHTML = `<span>📁 All Assets</span><span class="count">${allCount}</span>`;
        allItem.addEventListener('click', () => this.selectContentCategory('all'));
        categoriesDiv.appendChild(allItem);

        // Add each category
        for (const [categoryId, category] of Object.entries(this.assetCategories)) {
            if (category.assets.length === 0) continue;

            const item = document.createElement('div');
            item.className = 'content-category-item';
            item.dataset.category = categoryId;
            item.innerHTML = `<span>${category.icon} ${category.name}</span><span class="count">${category.assets.length}</span>`;
            item.addEventListener('click', () => this.selectContentCategory(categoryId));
            categoriesDiv.appendChild(item);
        }

        // Setup search
        const searchInput = document.getElementById('asset-search');
        searchInput.addEventListener('input', (e) => this.filterContentAssets(e.target.value));

        // Populate assets
        this.updateContentAssets();
    }

    selectContentCategory(categoryId) {
        this.currentContentCategory = categoryId;

        // Update active state
        document.querySelectorAll('.content-category-item').forEach(item => {
            item.classList.toggle('active', item.dataset.category === categoryId);
        });

        // Clear search
        document.getElementById('asset-search').value = '';

        // Update assets
        this.updateContentAssets();
    }

    updateContentAssets(filter = '') {
        const assetsDiv = document.getElementById('content-assets');
        assetsDiv.innerHTML = '';

        const filterLower = filter.toLowerCase();

        for (const [categoryId, category] of Object.entries(this.assetCategories)) {
            if (category.assets.length === 0) continue;
            if (this.currentContentCategory !== 'all' && this.currentContentCategory !== categoryId) continue;

            category.assets.forEach(asset => {
                // Apply search filter
                if (filter && !asset.name.toLowerCase().includes(filterLower)) return;

                const item = document.createElement('div');
                item.className = 'content-asset-item';
                item.dataset.category = categoryId;
                item.dataset.asset = asset.name;
                item.innerHTML = `
                    <div class="asset-icon">${asset.icon}</div>
                    <div class="asset-name">${asset.name}</div>
                `;
                item.addEventListener('click', () => this.selectAssetFromContent(categoryId, asset));
                assetsDiv.appendChild(item);
            });
        }
    }

    filterContentAssets(filter) {
        this.updateContentAssets(filter);
    }

    selectAssetFromContent(categoryId, asset) {
        // Clear previous selection in content browser
        document.querySelectorAll('.content-asset-item').forEach(item => item.classList.remove('selected'));

        // Select new asset in content browser
        const contentItem = document.querySelector(`.content-asset-item[data-asset="${asset.name}"]`);
        if (contentItem) contentItem.classList.add('selected');

        this.selectedAsset = { category: categoryId, ...asset };
        this.placementMode = true;

        // Create preview object
        this.createPreviewObject(asset);
    }

    setupUI() {
        this.updateSceneTree();
        this.updateStatusBar();
    }

    // Asset selection and placement
    selectAsset(categoryId, asset) {
        // Clear previous selection
        document.querySelectorAll('.asset-item').forEach(item => item.classList.remove('selected'));

        // Select new asset
        const item = document.querySelector(`.asset-item[data-asset="${asset.name}"]`);
        if (item) item.classList.add('selected');

        this.selectedAsset = { category: categoryId, ...asset };
        this.placementMode = true;

        // Create preview object
        this.createPreviewObject(asset);
    }

    createPreviewObject(asset) {
        // Remove existing preview
        if (this.previewObject) {
            this.scene.remove(this.previewObject);
            this.previewObject = null;
        }

        let obj;

        if (asset.type === 'primitive') {
            obj = this.createPrimitive(asset.primitive);
        } else if (asset.type === 'prefab') {
            obj = this.createPrefab(asset.prefab);
        } else if (asset.type === 'fbx' && asset.file) {
            // For FBX files, create a placeholder until loaded
            obj = new THREE.Mesh(
                new THREE.BoxGeometry(1, 2, 1),
                new THREE.MeshStandardMaterial({ color: 0x4a7c4e, transparent: true, opacity: 0.5 })
            );
            // Load actual FBX model
            this.loadFBXForPreview(asset, obj);
        } else if (asset.type === 'glb' && asset.file) {
            // For GLB files, create a placeholder until loaded
            obj = new THREE.Mesh(
                new THREE.BoxGeometry(1, 2, 1),
                new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.5 })
            );
            // Load actual GLB model
            this.loadModelForPreview(asset, obj);
        }

        if (obj) {
            obj.traverse(child => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    child.material.opacity = 0.5;
                }
            });
            this.previewObject = obj;
            this.scene.add(this.previewObject);
        }
    }

    loadFBXForPreview(asset, placeholder) {
        const filePath = `/assets/${asset.path}/${asset.file}`;
        const isGrass = asset.path?.includes('grass') || asset.file?.includes('Grass') || asset.file?.includes('CropField');
        const isTree = asset.path?.includes('trees') || asset.file?.includes('Tree') || asset.file?.includes('Bush');
        const isFlower = asset.path?.includes('flowers') || asset.file?.includes('Flower') || asset.file?.includes('Lillies') || asset.file?.includes('Rapeseed') || asset.file?.includes('Sunflower') || asset.file?.includes('Wildflowers');
        const isRock = asset.path?.includes('rocks') || asset.file?.includes('Rock');
        const isEnvironment = asset.path === 'environment' || asset.file?.includes('Ground') || asset.file?.includes('Cloud') || asset.file?.includes('Water') || asset.file?.includes('Background');

        this.fbxLoader.load(
            filePath,
            (fbx) => {
                // Apply materials to all meshes
                fbx.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;

                        const hasVertexColors = child.geometry?.attributes?.color;
                        let materialConfig;

                        if (isGrass) {
                            // Grass - use grass texture
                            materialConfig = {
                                map: this.textures.grass,
                                color: 0x88cc88,
                                roughness: 0.9,
                                metalness: 0.0,
                                transparent: true,
                                alphaTest: 0.5,
                                side: THREE.DoubleSide
                            };
                        } else if (isFlower) {
                            // Flowers - use flowers texture
                            materialConfig = {
                                map: this.textures.flowers,
                                color: 0xffffff,
                                roughness: 0.9,
                                metalness: 0.0,
                                transparent: true,
                                alphaTest: 0.5,
                                side: THREE.DoubleSide
                            };
                        } else if (isRock) {
                            // Rocks - use rock texture
                            materialConfig = {
                                map: this.textures.rock,
                                color: 0xffffff,
                                roughness: 0.9,
                                metalness: 0.1,
                                side: THREE.DoubleSide
                            };
                        } else if (isTree) {
                            // Trees - use branches texture
                            materialConfig = {
                                map: this.textures.branches,
                                color: 0x88aa66,
                                roughness: 0.9,
                                metalness: 0.0,
                                transparent: true,
                                alphaTest: 0.5,
                                side: THREE.DoubleSide
                            };
                        } else if (isEnvironment) {
                            // Environment - use meadow texture
                            materialConfig = {
                                map: this.textures.meadow,
                                color: 0xcccccc,
                                roughness: 0.9,
                                metalness: 0.1,
                                side: THREE.DoubleSide
                            };
                        } else {
                            // Props - use meadow texture atlas
                            materialConfig = {
                                map: this.textures.meadow,
                                color: 0xffffff,
                                roughness: 0.8,
                                metalness: 0.1,
                                side: THREE.DoubleSide
                            };
                        }

                        if (hasVertexColors) {
                            materialConfig.vertexColors = true;
                        }

                        child.material = new THREE.MeshStandardMaterial(materialConfig);
                    }
                });

                // Scale and rotate FBX (Unreal Z-up to Three.js Y-up)
                fbx.scale.set(0.01, 0.01, 0.01);
                fbx.rotation.x = -Math.PI / 2;

                // Replace placeholder with actual model
                if (this.previewObject === placeholder) {
                    this.scene.remove(placeholder);
                    this.previewObject = fbx;
                    this.scene.add(fbx);
                }
            },
            (progress) => {
                // Loading progress
            },
            (error) => {
                console.warn('Could not load FBX:', asset.file, error);
            }
        );
    }

    createPrimitive(type) {
        let geometry;
        switch (type) {
            case 'box':
                geometry = new THREE.BoxGeometry(1, 1, 1);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 16);
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(0.5, 16, 16);
                break;
            default:
                geometry = new THREE.BoxGeometry(1, 1, 1);
        }

        const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    createPrefab(type) {
        const group = new THREE.Group();

        switch (type) {
            case 'tree':
                // Trunk
                const trunk = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.3, 0.4, 3, 8),
                    new THREE.MeshStandardMaterial({ color: 0x4a3728 })
                );
                trunk.position.y = 1.5;
                trunk.castShadow = true;
                group.add(trunk);

                // Foliage
                const foliage = new THREE.Mesh(
                    new THREE.ConeGeometry(2, 4, 8),
                    new THREE.MeshStandardMaterial({ color: 0x2d5016 })
                );
                foliage.position.y = 4.5;
                foliage.castShadow = true;
                group.add(foliage);
                break;

            case 'rock':
                const rock = new THREE.Mesh(
                    new THREE.DodecahedronGeometry(1),
                    new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.9 })
                );
                rock.position.y = 0.5;
                rock.castShadow = true;
                group.add(rock);
                break;

            case 'bush':
                const bush = new THREE.Mesh(
                    new THREE.SphereGeometry(1, 8, 6),
                    new THREE.MeshStandardMaterial({ color: 0x3d6b1e })
                );
                bush.position.y = 0.8;
                bush.scale.y = 0.7;
                bush.castShadow = true;
                group.add(bush);
                break;
        }

        return group;
    }

    // Get the appropriate texture for an asset based on its path/type
    // All Synty Meadow assets use the main texture atlas - UVs point to correct region
    getTextureForAsset(asset) {
        // All assets use the main meadow texture atlas
        // The UV coordinates in the mesh geometry map to the correct part of the atlas
        return { texture: this.textures.meadow, needsAlpha: false };
    }

    loadModelForPreview(asset, placeholder) {
        const filePath = `/assets/${asset.path}/${asset.file}`;
        const isFBX = asset.file.toLowerCase().endsWith('.fbx');
        const isGLB = asset.file.toLowerCase().endsWith('.glb');

        const onModelLoaded = (model) => {
            console.log('Model loaded:', asset.file, 'isGLB:', isGLB, 'model:', model);

            model.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    if (isGLB) {
                        // GLB has embedded textures - keep them
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(mat => {
                                    mat.side = THREE.DoubleSide;
                                });
                            } else {
                                child.material.side = THREE.DoubleSide;
                            }
                        }
                    } else {
                        // FBX doesn't have embedded textures - apply meadow atlas
                        child.material = new THREE.MeshStandardMaterial({
                            map: this.textures.meadow,
                            roughness: 0.8,
                            metalness: 0.1,
                            side: THREE.DoubleSide
                        });
                    }
                }
            });

            // Scale and rotate FBX (Unreal Z-up to Three.js Y-up)
            if (isFBX) {
                model.scale.set(0.01, 0.01, 0.01);
                model.rotation.x = -Math.PI / 2; // Rotate -90 degrees on X
            } else {
                model.scale.set(1, 1, 1);
            }

            // Replace placeholder with actual model
            if (this.previewObject === placeholder) {
                this.scene.remove(placeholder);
                this.previewObject = model;
                this.scene.add(model);
            }
        };

        const onError = (error) => {
            console.error('Could not load model:', asset.file, error);
        };

        const onProgress = (xhr) => {
            console.log('Loading:', asset.file, Math.round(xhr.loaded / xhr.total * 100) + '%');
        };

        console.log('Starting to load:', filePath, 'isFBX:', isFBX);

        // Load based on file type
        if (isFBX) {
            this.fbxLoader.load(filePath, onModelLoaded, onProgress, onError);
        } else {
            this.gltfLoader.load(filePath, (gltf) => onModelLoaded(gltf.scene), onProgress, onError);
        }
    }

    // Mouse handlers
    onClick(e) {
        if (e.button !== 0) return; // Only left click

        if (this.placementMode && this.previewObject) {
            this.placeObject();
        } else {
            this.selectObjectAtMouse(e);
        }
    }

    onMouseDown(e) {
        this.isMouseDown = true;
        this.mouseButton = e.button;

        // Start painting on left mouse button
        if (e.button === 0 && this.paintMode) {
            this.isPainting = true;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.terrain);
            if (intersects.length > 0) {
                this.paintTerrain(intersects[0].point);
            }
        }
    }

    onMouseUp(e) {
        this.isMouseDown = false;
        this.isPainting = false;
    }

    onMouseMove(e) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        // Update preview object position
        if (this.placementMode && this.previewObject) {
            this.updatePreviewPosition();
        }

        // Terrain editing
        if (this.isMouseDown && this.mouseButton === 0 && this.terrainTool) {
            this.editTerrain();
        }

        // Terrain painting
        if (this.paintMode) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.terrain);
            if (intersects.length > 0) {
                // Update brush cursor position
                this.updateBrushCursor(intersects[0].point);

                // Paint while dragging
                if (this.isPainting && this.mouseButton === 0) {
                    this.paintTerrain(intersects[0].point);
                }
            }
        }

        // Update cursor position display
        this.updateCursorPosition();
    }

    updatePreviewPosition() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.terrain);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            if (this.snapEnabled) {
                this.previewObject.position.set(
                    Math.round(point.x / this.snapValue) * this.snapValue,
                    point.y,
                    Math.round(point.z / this.snapValue) * this.snapValue
                );
            } else {
                this.previewObject.position.copy(point);
            }
        }
    }

    updateCursorPosition() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.terrain);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            document.getElementById('cursor-pos').textContent =
                `X: ${point.x.toFixed(1)} Y: ${point.y.toFixed(1)} Z: ${point.z.toFixed(1)}`;
        }
    }

    placeObject() {
        if (!this.previewObject || !this.selectedAsset) return;

        // Save state for undo
        this.saveUndoState();

        // Clone the preview object
        const newObject = this.previewObject.clone();

        // Check if this is a vegetation asset that needs transparency
        const isGrass = this.selectedAsset?.path?.includes('grass') || this.selectedAsset?.file?.includes('Grass') || this.selectedAsset?.file?.includes('CropField');
        const isFlower = this.selectedAsset?.path?.includes('flowers') || this.selectedAsset?.file?.includes('Flower') || this.selectedAsset?.file?.includes('Lillies') || this.selectedAsset?.file?.includes('Rapeseed') || this.selectedAsset?.file?.includes('Sunflower') || this.selectedAsset?.file?.includes('Wildflowers');
        const needsTransparency = isGrass || isFlower;

        newObject.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                // Clone material to avoid sharing, keep embedded textures
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(mat => {
                            const cloned = mat.clone();
                            cloned.side = THREE.DoubleSide;
                            if (!needsTransparency) {
                                cloned.transparent = false;
                                cloned.opacity = 1.0;
                            }
                            return cloned;
                        });
                    } else {
                        child.material = child.material.clone();
                        child.material.side = THREE.DoubleSide;
                        if (!needsTransparency) {
                            child.material.transparent = false;
                            child.material.opacity = 1.0;
                        }
                    }
                }
            }
        });

        // Add metadata
        newObject.userData = {
            id: THREE.MathUtils.generateUUID(),
            type: this.selectedAsset.category,
            assetName: this.selectedAsset.name,
            assetType: this.selectedAsset.type || null,
            file: this.selectedAsset.file || null,
            path: this.selectedAsset.path || null
        };

        this.scene.add(newObject);
        this.levelObjects.push(newObject);

        this.updateSceneTree();
        this.updateStatusBar();

        // If shift is held, continue placing
        if (!this.shiftHeld) {
            this.exitPlacementMode();
        }
    }

    exitPlacementMode() {
        if (this.previewObject) {
            this.scene.remove(this.previewObject);
            this.previewObject = null;
        }
        this.placementMode = false;
        this.selectedAsset = null;
        document.querySelectorAll('.asset-item').forEach(item => item.classList.remove('selected'));
    }

    selectObjectAtMouse(e) {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Get selectable objects (exclude terrain, grid, helpers)
        const selectables = this.levelObjects.filter(obj => obj.visible);
        const intersects = this.raycaster.intersectObjects(selectables, true);

        if (intersects.length > 0) {
            // Find the root level object
            let target = intersects[0].object;
            while (target.parent && !this.levelObjects.includes(target)) {
                target = target.parent;
            }
            this.selectObject(target);
        } else {
            this.deselectObject();
        }
    }

    selectObject(obj) {
        this.selectedObject = obj;
        this.transformControls.attach(obj);
        this.updatePropertiesPanel();
        this.updateSceneTree();
        document.getElementById('selected-name').textContent = obj.userData.assetName || 'Object';
    }

    deselectObject() {
        this.selectedObject = null;
        this.transformControls.detach();
        this.updatePropertiesPanel();
        this.updateSceneTree();
        document.getElementById('selected-name').textContent = 'None';
    }

    // Terrain editing
    editTerrain() {
        if (!this.terrainTool) return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.terrain);

        if (intersects.length === 0) return;

        const point = intersects[0].point;
        const geometry = this.terrain.geometry;
        const positions = geometry.attributes.position;

        // PlaneGeometry is in XY plane, then rotated -90° on X to lie flat
        // Local X = World X
        // Local Y = -World Z (after rotation)
        // Local Z becomes the height (World Y)

        for (let i = 0; i < positions.count; i++) {
            // Get local position
            const localX = positions.getX(i);
            const localY = positions.getY(i);
            const localZ = positions.getZ(i);

            // Convert to world position (accounting for -90° X rotation)
            // After rotation: world X = local X, world Y = local Z, world Z = -local Y
            const worldX = localX;
            const worldZ = -localY;

            const distance = Math.sqrt(
                Math.pow(worldX - point.x, 2) + Math.pow(worldZ - point.z, 2)
            );

            if (distance < this.brushSize) {
                const influence = (1 - distance / this.brushSize) * this.brushStrength * 0.3;

                // Height is stored in local Z
                let height = localZ;

                switch (this.terrainTool) {
                    case 'raise':
                        height += influence;
                        break;
                    case 'lower':
                        height -= influence;
                        break;
                    case 'smooth':
                        // Move towards 0 (simplified smoothing)
                        height *= (1 - influence * 0.5);
                        break;
                    case 'flatten':
                        height = height * (1 - influence);
                        break;
                }

                positions.setZ(i, height);
            }
        }

        positions.needsUpdate = true;
        geometry.computeVertexNormals();
    }

    // Tool management
    setTool(tool) {
        this.currentTool = tool;

        // Update button states
        ['select', 'move', 'rotate', 'scale'].forEach(t => {
            document.getElementById(`btn-${t}`).classList.toggle('active', t === tool);
        });

        // Update transform controls
        if (tool === 'move') {
            this.transformControls.setMode('translate');
        } else if (tool === 'rotate') {
            this.transformControls.setMode('rotate');
        } else if (tool === 'scale') {
            this.transformControls.setMode('scale');
        }

        // Exit placement mode when switching tools
        if (this.placementMode) {
            this.exitPlacementMode();
        }
    }

    toggleSnap() {
        this.snapEnabled = !this.snapEnabled;
        const btn = document.getElementById('btn-snap');
        btn.textContent = `Snap: ${this.snapEnabled ? 'On' : 'Off'}`;
        btn.classList.toggle('active', this.snapEnabled);
        this.transformControls.setTranslationSnap(this.snapEnabled ? this.snapValue : null);
        this.transformControls.setRotationSnap(this.snapEnabled ? THREE.MathUtils.degToRad(15) : null);
    }

    toggleGrid() {
        this.gridVisible = !this.gridVisible;
        this.gridHelper.visible = this.gridVisible;
        document.getElementById('btn-grid').classList.toggle('active', this.gridVisible);
    }

    // Keyboard shortcuts
    onKeyDown(e) {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT') return;

        this.shiftHeld = e.shiftKey;

        switch (e.code) {
            case 'KeyQ':
                this.setTool('select');
                break;
            case 'KeyW':
                this.setTool('move');
                break;
            case 'KeyE':
                this.setTool('rotate');
                break;
            case 'KeyR':
                this.setTool('scale');
                break;
            case 'Delete':
            case 'Backspace':
                this.deleteSelected();
                break;
            case 'Escape':
                if (this.placementMode) {
                    this.exitPlacementMode();
                } else {
                    this.deselectObject();
                }
                break;
            case 'KeyZ':
                if (e.ctrlKey) {
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                }
                break;
            case 'KeyY':
                if (e.ctrlKey) {
                    this.redo();
                }
                break;
            case 'KeyS':
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.saveWorld();
                }
                break;
            case 'KeyD':
                if (e.ctrlKey && this.selectedObject) {
                    e.preventDefault();
                    this.duplicateSelected();
                }
                break;
            case 'KeyM':
                if (!e.ctrlKey) {
                    this.toggleWorldMap();
                }
                break;
        }
    }

    deleteSelected() {
        if (!this.selectedObject) return;

        this.saveUndoState();

        this.scene.remove(this.selectedObject);
        const index = this.levelObjects.indexOf(this.selectedObject);
        if (index > -1) {
            this.levelObjects.splice(index, 1);
        }

        this.deselectObject();
        this.updateSceneTree();
        this.updateStatusBar();
    }

    duplicateSelected() {
        if (!this.selectedObject) return;

        this.saveUndoState();

        const clone = this.selectedObject.clone();
        clone.position.x += 2;
        clone.userData = { ...this.selectedObject.userData, id: THREE.MathUtils.generateUUID() };

        this.scene.add(clone);
        this.levelObjects.push(clone);
        this.selectObject(clone);

        this.updateSceneTree();
        this.updateStatusBar();
    }

    // UI updates
    updatePropertiesPanel() {
        if (!this.selectedObject) {
            document.getElementById('pos-x').value = 0;
            document.getElementById('pos-y').value = 0;
            document.getElementById('pos-z').value = 0;
            document.getElementById('rot-x').value = 0;
            document.getElementById('rot-y').value = 0;
            document.getElementById('rot-z').value = 0;
            document.getElementById('scale-x').value = 1;
            document.getElementById('scale-y').value = 1;
            document.getElementById('scale-z').value = 1;
            document.getElementById('obj-name').value = '';
            document.getElementById('obj-type').value = '';
            return;
        }

        const obj = this.selectedObject;
        document.getElementById('pos-x').value = obj.position.x.toFixed(2);
        document.getElementById('pos-y').value = obj.position.y.toFixed(2);
        document.getElementById('pos-z').value = obj.position.z.toFixed(2);
        document.getElementById('rot-x').value = THREE.MathUtils.radToDeg(obj.rotation.x).toFixed(0);
        document.getElementById('rot-y').value = THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(0);
        document.getElementById('rot-z').value = THREE.MathUtils.radToDeg(obj.rotation.z).toFixed(0);
        document.getElementById('scale-x').value = obj.scale.x.toFixed(2);
        document.getElementById('scale-y').value = obj.scale.y.toFixed(2);
        document.getElementById('scale-z').value = obj.scale.z.toFixed(2);
        document.getElementById('obj-name').value = obj.userData.assetName || '';
        document.getElementById('obj-type').value = obj.userData.type || '';
    }

    onPropertyChange() {
        if (!this.selectedObject) return;

        this.saveUndoState();

        this.selectedObject.position.set(
            parseFloat(document.getElementById('pos-x').value) || 0,
            parseFloat(document.getElementById('pos-y').value) || 0,
            parseFloat(document.getElementById('pos-z').value) || 0
        );

        this.selectedObject.rotation.set(
            THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-x').value) || 0),
            THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-y').value) || 0),
            THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-z').value) || 0)
        );

        this.selectedObject.scale.set(
            parseFloat(document.getElementById('scale-x').value) || 1,
            parseFloat(document.getElementById('scale-y').value) || 1,
            parseFloat(document.getElementById('scale-z').value) || 1
        );
    }

    updateSceneTree() {
        // Scene tree removed - just ensure content browser stays visible
        const contentBrowser = document.getElementById('content-browser');
        if (contentBrowser) {
            // Force it to be visible
            contentBrowser.style.display = 'flex';
            contentBrowser.style.visibility = 'visible';
        }
    }

    getTypeIcon(type) {
        const icons = {
            characters: '👤',
            props: '📦',
            nature: '🌲',
            buildings: '🏠',
            spawn: '🎮',
            trigger: '🔲',
            light: '💡'
        };
        return icons[type] || '📦';
    }

    updateStatusBar() {
        document.getElementById('object-count').textContent = this.levelObjects.length;
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));

        // Clear terrain tool when switching away
        if (tabName !== 'terrain') {
            this.terrainTool = null;
            document.querySelectorAll('.terrain-tool-btn').forEach(b => b.classList.remove('active'));
        }
    }

    // Undo/Redo
    saveUndoState() {
        const state = this.serializeLevel();
        this.undoStack.push(state);
        this.redoStack = []; // Clear redo on new action

        // Limit undo stack size
        if (this.undoStack.length > 50) {
            this.undoStack.shift();
        }
    }

    undo() {
        if (this.undoStack.length === 0) return;

        const currentState = this.serializeLevel();
        this.redoStack.push(currentState);

        const previousState = this.undoStack.pop();
        this.loadLevelFromData(previousState);
    }

    redo() {
        if (this.redoStack.length === 0) return;

        const currentState = this.serializeLevel();
        this.undoStack.push(currentState);

        const nextState = this.redoStack.pop();
        this.loadLevelFromData(nextState);
    }

    // Save/Load
    serializeLevel() {
        const data = {
            version: '1.0',
            terrain: this.serializeTerrain(),
            objects: this.levelObjects.map(obj => ({
                id: obj.userData.id,
                type: obj.userData.type,
                assetName: obj.userData.assetName,
                file: obj.userData.file,
                position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
                scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
            }))
        };
        return data;
    }

    serializeTerrain() {
        const positions = this.terrain.geometry.attributes.position;
        const heights = [];
        for (let i = 0; i < positions.count; i++) {
            // Terrain is rotated -90° on X, so local Z is world height
            heights.push(positions.getZ(i));
        }
        return { heights };
    }

    newLevel() {
        if (this.levelObjects.length > 0) {
            if (!confirm('Create new level? Unsaved changes will be lost.')) return;
        }

        // Clear all objects
        this.levelObjects.forEach(obj => this.scene.remove(obj));
        this.levelObjects = [];

        // Reset terrain (Z is height due to rotation)
        const positions = this.terrain.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            positions.setZ(i, 0);
        }
        positions.needsUpdate = true;
        this.terrain.geometry.computeVertexNormals();

        this.deselectObject();
        this.updateSceneTree();
        this.updateStatusBar();

        this.undoStack = [];
        this.redoStack = [];
    }

    saveLevel() {
        const data = this.serializeLevel();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'level.json';
        a.click();

        URL.revokeObjectURL(url);
        console.log('Level saved!');
    }

    openLevel() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    this.loadLevelFromData(data);
                    console.log('Level loaded!');
                } catch (err) {
                    alert('Failed to load level: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    loadLevelFromData(data) {
        // Clear existing objects
        this.levelObjects.forEach(obj => this.scene.remove(obj));
        this.levelObjects = [];
        this.deselectObject();

        // Load terrain (Z is height due to rotation)
        if (data.terrain && data.terrain.heights) {
            const positions = this.terrain.geometry.attributes.position;
            data.terrain.heights.forEach((h, i) => {
                if (i < positions.count) {
                    positions.setZ(i, h);
                }
            });
            positions.needsUpdate = true;
            this.terrain.geometry.computeVertexNormals();
        }

        // Load objects
        data.objects.forEach(objData => {
            this.createObjectFromData(objData);
        });

        this.updateSceneTree();
        this.updateStatusBar();
    }

    createObjectFromData(objData) {
        let obj;
        const fileToLoad = objData.file;

        // Find asset definition
        const category = this.assetCategories[objData.type];
        const asset = category?.assets.find(a => a.assetName === objData.assetName || a.name === objData.assetName);

        if (asset) {
            if (asset.type === 'primitive') {
                obj = this.createPrimitive(asset.primitive);
            } else if (asset.type === 'prefab') {
                obj = this.createPrefab(asset.prefab);
            } else {
                // GLB placeholder
                obj = new THREE.Mesh(
                    new THREE.BoxGeometry(1, 2, 1),
                    new THREE.MeshStandardMaterial({ color: 0x888888 })
                );
            }
        } else {
            // Fallback
            obj = new THREE.Mesh(
                new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshStandardMaterial({ color: 0xff0000 })
            );
        }

        obj.position.set(objData.position.x, objData.position.y, objData.position.z);
        obj.rotation.set(objData.rotation.x, objData.rotation.y, objData.rotation.z);
        obj.scale.set(objData.scale.x, objData.scale.y, objData.scale.z);
        obj.userData = {
            id: objData.id || THREE.MathUtils.generateUUID(),
            type: objData.type,
            assetName: objData.assetName,
            file: fileToLoad || asset?.file
        };

        this.scene.add(obj);
        this.levelObjects.push(obj);

        // Load GLB after userData is set (so path can be determined)
        if (obj.userData.file && asset && asset.type !== 'primitive' && asset.type !== 'prefab') {
            this.loadGLBForObject(obj.userData.file, obj);
        }
    }

    loadGLBForObject(filename, targetObj) {
        // Initialize model cache if needed
        if (!this.modelCache) {
            this.modelCache = new Map();
        }

        // Determine path based on object type
        const type = targetObj.userData?.type || 'buildings';
        const pathMap = {
            buildings: 'buildings',
            props: 'props',
            trees: 'nature/trees',
            rocks: 'nature/rocks',
            grass: 'nature/grass',
            flowers: 'nature/flowers',
            environment: 'environment',
            characters: 'characters'
        };
        const folder = pathMap[type] || 'buildings';
        const path = `/assets/${folder}/${filename}`;

        // Check if model is already cached
        if (this.modelCache.has(filename)) {
            // Clone and share geometry/materials from cached model
            const cachedModel = this.modelCache.get(filename);
            const model = cachedModel.clone();

            // Share geometry and materials to save memory
            model.traverse((child) => {
                if (child.isMesh) {
                    cachedModel.traverse((cachedChild) => {
                        if (cachedChild.isMesh && cachedChild.name === child.name) {
                            child.geometry = cachedChild.geometry; // Share geometry
                            child.material = cachedChild.material; // Share material
                        }
                    });
                }
            });

            // Copy transform
            model.position.copy(targetObj.position);
            model.rotation.copy(targetObj.rotation);
            model.scale.copy(targetObj.scale);
            model.userData = { ...targetObj.userData };

            // Replace in scene
            const index = this.levelObjects.indexOf(targetObj);
            if (index > -1) {
                this.scene.remove(targetObj);
                this.scene.add(model);
                this.levelObjects[index] = model;

                if (this.selectedObject === targetObj) {
                    this.selectObject(model);
                }
            }
        } else {
            // Load model for the first time and cache it
            this.gltfLoader.load(
                path,
                (gltf) => {
                    const model = gltf.scene;
                    model.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    // Cache the base model
                    this.modelCache.set(filename, model.clone());

                    // Copy transform
                    model.position.copy(targetObj.position);
                    model.rotation.copy(targetObj.rotation);
                    model.scale.copy(targetObj.scale);
                    model.userData = { ...targetObj.userData };

                    // Replace in scene
                    const index = this.levelObjects.indexOf(targetObj);
                    if (index > -1) {
                        this.scene.remove(targetObj);
                        this.scene.add(model);
                        this.levelObjects[index] = model;

                        if (this.selectedObject === targetObj) {
                            this.selectObject(model);
                        }
                    }
                },
                undefined,
                (error) => console.warn('Could not load GLB:', filename, error)
            );
        }
    }

    testLevel() {
        // Toggle play mode
        if (this.isPlayMode) {
            this.exitPlayMode();
        } else {
            this.enterPlayMode();
        }
    }

    enterPlayMode() {
        this.isPlayMode = true;

        // Hide editor UI
        document.getElementById('left-panel').style.display = 'none';
        document.getElementById('right-panel').style.display = 'none';
        document.getElementById('toolbar').style.opacity = '0.3';

        // Update button text
        document.getElementById('btn-play').textContent = 'Stop';
        document.getElementById('btn-play').style.background = '#e74c3c';

        // Disable orbit controls
        this.orbitControls.enabled = false;

        // Hide transform controls
        if (this.transformControls.object) {
            this.transformControls.detach();
        }

        // Hide grid
        this.gridHelper.visible = false;

        // Hide brush cursor
        if (this.brushCursor) {
            this.brushCursor.visible = false;
        }

        // Create player camera at current camera position
        this.playerCamera = new THREE.PerspectiveCamera(
            75,
            this.renderer.domElement.width / this.renderer.domElement.height,
            0.1,
            1000
        );

        // Position player at center of terrain, at player height
        this.playerCamera.position.set(0, this.playerHeight, 0);
        this.playerCamera.rotation.set(0, 0, 0);

        // Reset movement state
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.playerVelocity.set(0, 0, 0);

        // Lock pointer for mouse look
        this.renderer.domElement.requestPointerLock();

        // Show play mode instructions
        this.showPlayModeOverlay();

        console.log('Entered play mode - WASD to move, mouse to look, ESC to exit');
    }

    exitPlayMode() {
        this.isPlayMode = false;

        // Show editor UI
        document.getElementById('left-panel').style.display = '';
        document.getElementById('right-panel').style.display = '';
        document.getElementById('toolbar').style.opacity = '1';

        // Update button text
        document.getElementById('btn-play').textContent = 'Play';
        document.getElementById('btn-play').style.background = '';

        // Re-enable orbit controls
        this.orbitControls.enabled = true;

        // Show grid if it was visible
        this.gridHelper.visible = this.gridVisible;

        // Exit pointer lock
        document.exitPointerLock();

        // Remove play mode overlay
        this.hidePlayModeOverlay();

        // Clean up player camera
        this.playerCamera = null;

        console.log('Exited play mode');
    }

    showPlayModeOverlay() {
        let overlay = document.getElementById('play-mode-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'play-mode-overlay';
            overlay.innerHTML = `
                <div style="position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                            background: rgba(0,0,0,0.7); color: white; padding: 10px 20px;
                            border-radius: 5px; font-family: sans-serif; z-index: 1000;">
                    <strong>PLAY MODE</strong> - WASD: Move | Mouse: Look | ESC or Click Stop: Exit
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'block';
    }

    hidePlayModeOverlay() {
        const overlay = document.getElementById('play-mode-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    onPlayModeKeyDown(event) {
        if (!this.isPlayMode) return;

        switch (event.code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'Space':
                if (this.canJump) {
                    this.playerVelocity.y = 8;
                    this.canJump = false;
                }
                break;
            case 'Escape':
                this.exitPlayMode();
                break;
        }
    }

    onPlayModeKeyUp(event) {
        if (!this.isPlayMode) return;

        switch (event.code) {
            case 'KeyW': this.moveForward = false; break;
            case 'KeyS': this.moveBackward = false; break;
            case 'KeyA': this.moveLeft = false; break;
            case 'KeyD': this.moveRight = false; break;
        }
    }

    onPlayModeMouseMove(event) {
        if (!this.isPlayMode || !this.playerCamera) return;
        if (document.pointerLockElement !== this.renderer.domElement) return;

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        this.euler.setFromQuaternion(this.playerCamera.quaternion);
        this.euler.y -= movementX * this.mouseSensitivity;
        this.euler.x -= movementY * this.mouseSensitivity;

        // Clamp vertical look
        this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));

        this.playerCamera.quaternion.setFromEuler(this.euler);
    }

    updatePlayMode(delta) {
        if (!this.isPlayMode || !this.playerCamera) return;

        // Apply gravity
        this.playerVelocity.y -= 20 * delta;

        // Get movement direction
        this.playerDirection.z = Number(this.moveForward) - Number(this.moveBackward);
        this.playerDirection.x = Number(this.moveRight) - Number(this.moveLeft);
        this.playerDirection.normalize();

        // Move in camera direction
        if (this.moveForward || this.moveBackward) {
            const forward = new THREE.Vector3();
            this.playerCamera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();
            this.playerCamera.position.addScaledVector(forward, this.playerDirection.z * this.playerSpeed * delta);
        }

        if (this.moveLeft || this.moveRight) {
            const right = new THREE.Vector3();
            this.playerCamera.getWorldDirection(right);
            right.y = 0;
            right.normalize();
            right.cross(new THREE.Vector3(0, 1, 0));
            this.playerCamera.position.addScaledVector(right, this.playerDirection.x * this.playerSpeed * delta);
        }

        // Apply gravity
        this.playerCamera.position.y += this.playerVelocity.y * delta;

        // Get terrain height at player position
        const terrainHeight = this.getTerrainHeightAt(this.playerCamera.position.x, this.playerCamera.position.z);
        const groundLevel = terrainHeight + this.playerHeight;

        // Ground collision
        if (this.playerCamera.position.y < groundLevel) {
            this.playerCamera.position.y = groundLevel;
            this.playerVelocity.y = 0;
            this.canJump = true;
        }

        // Keep player in bounds
        const bound = 48;
        this.playerCamera.position.x = Math.max(-bound, Math.min(bound, this.playerCamera.position.x));
        this.playerCamera.position.z = Math.max(-bound, Math.min(bound, this.playerCamera.position.z));
    }

    getTerrainHeightAt(x, z) {
        if (!this.terrain) return 0;

        const positions = this.terrain.geometry.attributes.position;
        const size = 100;
        const segments = 100;

        // Convert world position to grid position
        const gridX = ((x + size / 2) / size) * segments;
        const gridZ = ((z + size / 2) / size) * segments;

        // Get integer grid coordinates
        const x0 = Math.floor(gridX);
        const z0 = Math.floor(gridZ);
        const x1 = Math.min(x0 + 1, segments);
        const z1 = Math.min(z0 + 1, segments);

        // Clamp to valid range
        const cx0 = Math.max(0, Math.min(segments, x0));
        const cz0 = Math.max(0, Math.min(segments, z0));
        const cx1 = Math.max(0, Math.min(segments, x1));
        const cz1 = Math.max(0, Math.min(segments, z1));

        // Get heights at corners (remember: terrain is rotated, so Y in geometry is height which maps to world Y)
        // With -90 degree X rotation: local Z becomes world Y (height)
        const getHeight = (gx, gz) => {
            const index = gz * (segments + 1) + gx;
            return positions.getZ(index); // Z is height due to rotation
        };

        const h00 = getHeight(cx0, cz0);
        const h10 = getHeight(cx1, cz0);
        const h01 = getHeight(cx0, cz1);
        const h11 = getHeight(cx1, cz1);

        // Bilinear interpolation
        const fx = gridX - x0;
        const fz = gridZ - z0;

        const h0 = h00 * (1 - fx) + h10 * fx;
        const h1 = h01 * (1 - fx) + h11 * fx;

        return h0 * (1 - fz) + h1 * fz;
    }

    // ==================== CHUNK SYSTEM ====================

    getChunkKey(x, z) {
        return `${x},${z}`;
    }

    saveCurrentChunk() {
        const key = this.getChunkKey(this.currentChunkX, this.currentChunkZ);

        // Serialize terrain heights
        const positions = this.terrain.geometry.attributes.position;
        const heights = [];
        for (let i = 0; i < positions.count; i++) {
            heights.push(positions.getZ(i));
        }

        // Serialize splatmap
        const splatmapData = this.splatmapCanvas.toDataURL('image/png');

        // Serialize objects (only those in this chunk)
        const objects = this.levelObjects.map(obj => ({
            id: obj.userData.id,
            type: obj.userData.type,
            assetName: obj.userData.assetName,
            file: obj.userData.file,
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
        }));

        this.worldData[key] = {
            terrain: { heights },
            splatmap: splatmapData,
            objects: objects
        };

        console.log(`Saved chunk ${key} with ${objects.length} objects`);
    }

    loadChunk(chunkX, chunkZ) {
        const key = this.getChunkKey(chunkX, chunkZ);
        const data = this.worldData[key];

        // Clear current objects
        this.levelObjects.forEach(obj => this.scene.remove(obj));
        this.levelObjects = [];
        this.deselectObject();

        if (data) {
            // Load terrain heights
            if (data.terrain && data.terrain.heights) {
                const positions = this.terrain.geometry.attributes.position;
                const heightCount = data.terrain.heights.length;
                const vertexCount = positions.count;

                // Handle terrain resolution mismatch (old 200x200 vs new 100x100)
                if (heightCount > vertexCount) {
                    console.warn(`⚠️ Terrain resolution mismatch: saved has ${heightCount} vertices, current has ${vertexCount} vertices`);
                    console.log('Downsampling terrain to match current resolution...');

                    // Simple downsampling - just copy every Nth vertex
                    const skipRatio = Math.sqrt(heightCount / vertexCount);
                    const oldGridSize = Math.round(Math.sqrt(heightCount));
                    const newGridSize = Math.round(Math.sqrt(vertexCount));

                    let copied = 0;
                    for (let z = 0; z < newGridSize; z++) {
                        for (let x = 0; x < newGridSize; x++) {
                            const oldX = Math.floor(x * skipRatio);
                            const oldZ = Math.floor(z * skipRatio);
                            const oldIndex = oldZ * oldGridSize + oldX;
                            const newIndex = z * newGridSize + x;

                            if (oldIndex < heightCount && newIndex < vertexCount) {
                                positions.setZ(newIndex, data.terrain.heights[oldIndex]);
                                copied++;
                            }
                        }
                    }
                    console.log(`✅ Downsampled ${copied} vertices`);
                } else {
                    // Direct copy when resolutions match or saved is smaller
                    const count = Math.min(heightCount, vertexCount);
                    for (let i = 0; i < count; i++) {
                        positions.setZ(i, data.terrain.heights[i]);
                    }
                    console.log(`✅ Loaded ${count} terrain vertices`);
                }

                positions.needsUpdate = true;
                this.terrain.geometry.computeVertexNormals();
            }

            // Load splatmap
            if (data.splatmap) {
                const img = new Image();
                img.onload = () => {
                    this.splatmapContext.drawImage(img, 0, 0);
                    this.splatmapTexture.needsUpdate = true;
                    if (this.terrainShader) {
                        this.terrainShader.uniforms.splatmap.value = this.splatmapTexture;
                    }
                };
                img.src = data.splatmap;
            }

            // Load objects in batches to prevent browser crashes
            if (data.objects && data.objects.length > 0) {
                const totalObjects = data.objects.length;

                console.log(`Loading ${totalObjects} objects slowly to prevent crashes...`);

                // Prioritize loading buildings/trees over grass
                const prioritizedObjects = [
                    ...data.objects.filter(o => o.type === 'buildings'),
                    ...data.objects.filter(o => o.type === 'trees'),
                    ...data.objects.filter(o => o.type === 'rocks'),
                    ...data.objects.filter(o => o.type === 'flowers'),
                    ...data.objects.filter(o => o.type === 'grass'),
                    ...data.objects.filter(o => !['buildings', 'trees', 'rocks', 'flowers', 'grass'].includes(o.type))
                ];

                // Load ONE object at a time with delay to prevent memory spikes
                let loaded = 0;

                const loadNext = () => {
                    if (loaded < prioritizedObjects.length) {
                        this.createObjectFromData(prioritizedObjects[loaded]);
                        loaded++;

                        // Log progress every 50 objects
                        if (loaded % 50 === 0) {
                            console.log(`Loaded ${loaded}/${prioritizedObjects.length} objects...`);
                        }

                        // Schedule next object with delay
                        // Longer delay for grass/flowers, shorter for buildings
                        const objType = prioritizedObjects[loaded - 1]?.type;
                        const delay = (objType === 'grass' || objType === 'flowers') ? 5 : 20;
                        setTimeout(loadNext, delay);
                    } else {
                        console.log(`✅ Loaded chunk ${key} with ${loaded} objects`);
                    }
                };

                loadNext();
            } else {
                console.log(`Loaded chunk ${key} with 0 objects`);
            }
        } else {
            // New chunk - reset terrain to flat
            const positions = this.terrain.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                positions.setZ(i, 0);
            }
            positions.needsUpdate = true;
            this.terrain.geometry.computeVertexNormals();

            // Reset splatmap to grass
            const imageData = this.splatmapContext.createImageData(512, 512);
            for (let i = 0; i < imageData.data.length; i += 4) {
                imageData.data[i] = 255;     // R - grass
                imageData.data[i + 1] = 0;   // G
                imageData.data[i + 2] = 0;   // B
                imageData.data[i + 3] = 255; // A
            }
            this.splatmapContext.putImageData(imageData, 0, 0);
            this.splatmapTexture.needsUpdate = true;

            console.log(`Created new chunk ${key}`);
        }

        this.currentChunkX = chunkX;
        this.currentChunkZ = chunkZ;
        this.updateChunkDisplay();
        this.updateSceneTree();
        this.updateStatusBar();
    }

    switchToChunk(chunkX, chunkZ) {
        // Save current chunk first
        this.saveCurrentChunk();

        // Load the new chunk
        this.loadChunk(chunkX, chunkZ);

        // Update camera position to center of new chunk
        // (Keep relative position within chunk)
    }

    navigateChunk(direction) {
        let newX = this.currentChunkX;
        let newZ = this.currentChunkZ;

        switch (direction) {
            case 'north': newZ--; break;
            case 'south': newZ++; break;
            case 'east': newX++; break;
            case 'west': newX--; break;
        }

        this.switchToChunk(newX, newZ);
    }

    updateChunkDisplay() {
        const display = document.getElementById('chunk-display');
        if (display) {
            display.textContent = `Chunk: (${this.currentChunkX}, ${this.currentChunkZ})`;
        }
    }

    toggleWorldMap() {
        this.worldMapVisible = !this.worldMapVisible;
        const worldMap = document.getElementById('world-map-overlay');
        if (worldMap) {
            worldMap.classList.toggle('visible', this.worldMapVisible);
            if (this.worldMapVisible) {
                this.renderWorldMap();
            }
        }
    }

    renderWorldMap() {
        const canvas = document.getElementById('world-map-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const cellSize = 40;
        const viewRange = 5; // Show 5x5 grid of chunks

        canvas.width = cellSize * (viewRange * 2 + 1);
        canvas.height = cellSize * (viewRange * 2 + 1);

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw chunk grid
        for (let dz = -viewRange; dz <= viewRange; dz++) {
            for (let dx = -viewRange; dx <= viewRange; dx++) {
                const chunkX = this.currentChunkX + dx;
                const chunkZ = this.currentChunkZ + dz;
                const key = this.getChunkKey(chunkX, chunkZ);

                const px = (dx + viewRange) * cellSize;
                const pz = (dz + viewRange) * cellSize;

                // Check if chunk has data
                const hasData = this.worldData[key];
                const isCurrent = dx === 0 && dz === 0;

                if (isCurrent) {
                    ctx.fillStyle = '#4ade80'; // Green for current
                } else if (hasData) {
                    ctx.fillStyle = '#3b82f6'; // Blue for edited
                } else {
                    ctx.fillStyle = '#374151'; // Gray for empty
                }

                ctx.fillRect(px + 1, pz + 1, cellSize - 2, cellSize - 2);

                // Draw coordinates
                ctx.fillStyle = '#fff';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`${chunkX},${chunkZ}`, px + cellSize/2, pz + cellSize/2 + 4);
            }
        }

        // Draw grid lines
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        for (let i = 0; i <= viewRange * 2 + 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cellSize, 0);
            ctx.lineTo(i * cellSize, canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * cellSize);
            ctx.lineTo(canvas.width, i * cellSize);
            ctx.stroke();
        }
    }

    onWorldMapClick(event) {
        const canvas = document.getElementById('world-map-canvas');
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const cellSize = 40;
        const viewRange = 5;

        const cellX = Math.floor(x / cellSize) - viewRange;
        const cellZ = Math.floor(y / cellSize) - viewRange;

        const targetChunkX = this.currentChunkX + cellX;
        const targetChunkZ = this.currentChunkZ + cellZ;

        this.switchToChunk(targetChunkX, targetChunkZ);
        this.renderWorldMap();
    }

    getWorldStats() {
        const chunkCount = Object.keys(this.worldData).length;
        let totalObjects = 0;
        for (const key in this.worldData) {
            totalObjects += this.worldData[key].objects?.length || 0;
        }
        return { chunkCount, totalObjects };
    }

    // Save entire world to file
    saveWorld() {
        // Save current chunk first
        this.saveCurrentChunk();

        const worldExport = {
            version: '2.0',
            name: this.worldName,
            currentChunk: { x: this.currentChunkX, z: this.currentChunkZ },
            chunks: this.worldData
        };

        const json = JSON.stringify(worldExport);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.worldName.replace(/\s+/g, '_')}.world.json`;
        a.click();

        URL.revokeObjectURL(url);

        const stats = this.getWorldStats();
        console.log(`World saved! ${stats.chunkCount} chunks, ${stats.totalObjects} total objects`);
    }

    // Load entire world from file
    openWorld() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);

                    if (data.version === '2.0' && data.chunks) {
                        // New world format
                        this.worldData = data.chunks;
                        this.worldName = data.name || 'Loaded World';
                        this.loadChunk(data.currentChunk?.x || 0, data.currentChunk?.z || 0);

                        const stats = this.getWorldStats();
                        console.log(`World loaded! ${stats.chunkCount} chunks, ${stats.totalObjects} total objects`);
                    } else {
                        // Legacy single-level format - import as chunk 0,0
                        this.worldData = {};
                        this.worldData['0,0'] = {
                            terrain: data.terrain,
                            objects: data.objects,
                            splatmap: null
                        };
                        this.loadChunk(0, 0);
                        console.log('Legacy level imported as chunk 0,0');
                    }
                } catch (err) {
                    alert('Failed to load world: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    newWorld() {
        if (Object.keys(this.worldData).length > 0 || this.levelObjects.length > 0) {
            if (!confirm('Create new world? All unsaved chunks will be lost.')) return;
        }

        this.worldData = {};
        this.worldName = 'New World';
        this.loadChunk(0, 0);
    }

    // Auto-populate grass on grass-textured areas
    autoPopulateGrass(density = 0.15, clearExisting = false) {
        if (clearExisting) {
            // Remove existing auto-generated grass
            const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'grass');
            toRemove.forEach(obj => {
                this.scene.remove(obj);
                const idx = this.levelObjects.indexOf(obj);
                if (idx > -1) this.levelObjects.splice(idx, 1);
            });
        }

        // Grass asset options - ORDERED BY SIZE (large first, then tall, then medium/short)
        const grassAssets = [
            // Large grass - 75% of spawns
            { file: 'SM_Env_Grass_Large_01.glb', weight: 40 },
            { file: 'SM_Env_Grass_Large_03.glb', weight: 35 },
            // Tall grass - 15%
            { file: 'SM_Env_Grass_Tall_Clump_01.glb', weight: 3 },
            { file: 'SM_Env_Grass_Tall_Clump_02.glb', weight: 3 },
            { file: 'SM_Env_Grass_Tall_Clump_03.glb', weight: 3 },
            { file: 'SM_Env_Grass_Tall_Clump_04.glb', weight: 3 },
            { file: 'SM_Env_Grass_Tall_Clump_05.glb', weight: 3 },
            { file: 'SM_Env_Grass_Tall_Plane_01.glb', weight: 0 },
            // Medium grass - 5%
            { file: 'SM_Env_Grass_Med_Clump_01.glb', weight: 2 },
            { file: 'SM_Env_Grass_Med_Clump_02.glb', weight: 2 },
            { file: 'SM_Env_Grass_Med_Clump_03.glb', weight: 1 },
            { file: 'SM_Env_Grass_Med_Plane_01.glb', weight: 0 },
            // Short grass - 3%
            { file: 'SM_Env_Grass_Short_Clump_01.glb', weight: 1 },
            { file: 'SM_Env_Grass_Short_Clump_02.glb', weight: 1 },
            { file: 'SM_Env_Grass_Short_Clump_03.glb', weight: 1 },
            { file: 'SM_Env_Grass_Short_Plane_01.glb', weight: 0 },
            // Bush and crops - 2%
            { file: 'SM_Env_Grass_Bush_01.glb', weight: 1 },
            { file: 'SM_Env_CropField_Clump_01.glb', weight: 0.5 },
            { file: 'SM_Env_CropField_Clump_02.glb', weight: 0.5 }
        ];

        // Build weighted array for random selection
        const weightedAssets = [];
        grassAssets.forEach(asset => {
            for (let i = 0; i < asset.weight * 10; i++) {
                weightedAssets.push(asset.file);
            }
        });

        // Get splatmap data to check grass texture (R channel)
        const imageData = this.splatmapContext.getImageData(0, 0, 512, 512);
        const terrainSize = 100; // Terrain is 500x500 units
        const splatmapSize = 512;

        // Collect ALL potential grass positions first
        const allPotentialPositions = [];
        const maxGrass = 50; // Limit per chunk for performance

        // Sample the terrain at regular intervals
        const step = 2; // Moderate spacing
        for (let x = -terrainSize / 2; x < terrainSize / 2; x += step) {
            for (let z = -terrainSize / 2; z < terrainSize / 2; z += step) {
                // Add randomness to position within the cell
                const worldX = x + (Math.random() - 0.5) * step;
                const worldZ = z + (Math.random() - 0.5) * step;

                // Convert world position to splatmap coordinates
                const splatX = Math.floor(((worldX + terrainSize / 2) / terrainSize) * splatmapSize);
                const splatZ = Math.floor(((worldZ + terrainSize / 2) / terrainSize) * splatmapSize);

                // Clamp to valid splatmap range
                const clampedX = Math.max(0, Math.min(splatmapSize - 1, splatX));
                const clampedZ = Math.max(0, Math.min(splatmapSize - 1, splatZ));

                // Random chance based on density (spawn everywhere, ignore splatmap)
                if (Math.random() > density) continue;

                // Pick random grass asset
                const randomFile = weightedAssets[Math.floor(Math.random() * weightedAssets.length)];
                const isLargeGrass = randomFile.includes('_Large_');

                // Get terrain height at this position
                const terrainY = this.getTerrainHeightAt(worldX, worldZ);

                allPotentialPositions.push({
                    x: worldX,
                    y: terrainY,
                    z: worldZ,
                    rotation: Math.random() * Math.PI * 2,
                    scale: 0.8 + Math.random() * 0.4,
                    file: randomFile,
                    isLarge: isLargeGrass
                });
            }
        }

        // Shuffle and limit to maxGrass to get even distribution across terrain
        const shuffled = allPotentialPositions.sort(() => Math.random() - 0.5);
        const grassPositions = shuffled.slice(0, maxGrass);

        console.log(`Placing ${grassPositions.length} grass objects...`);

        // Group positions by file to load each model only once
        const positionsByFile = {};
        grassPositions.forEach(pos => {
            if (!positionsByFile[pos.file]) {
                positionsByFile[pos.file] = [];
            }
            positionsByFile[pos.file].push(pos);
        });

        // Sort files by size: Large first, then Tall, then Med, then Short
        const uniqueFiles = Object.keys(positionsByFile).sort((a, b) => {
            const getSizeOrder = (filename) => {
                if (filename.includes('_Large_')) return 0;
                if (filename.includes('_Tall_')) return 1;
                if (filename.includes('_Med_')) return 2;
                if (filename.includes('_Short_')) return 3;
                return 4; // Bush/crops last
            };
            return getSizeOrder(a) - getSizeOrder(b);
        });

        let totalPlaced = 0;

        // Load grass models sequentially in size order (large to small)
        const loadNextGrassModel = (index) => {
            if (index >= uniqueFiles.length) {
                console.log(`✅ Auto-populated ${totalPlaced} grass objects using ${uniqueFiles.length} unique models`);
                this.updateSceneTree();
                this.updateStatusBar();
                return;
            }

            const filename = uniqueFiles[index];
            const path = `/assets/nature/grass/${filename}`;

            this.gltfLoader.load(
                path,
                (gltf) => {
                    const baseModel = gltf.scene;
                    const isLargeFile = filename.includes('_Large_');

                    baseModel.traverse(child => {
                        if (child.isMesh) {
                            // Disable shadows for large grass only
                            if (isLargeFile) {
                                child.castShadow = false;
                                child.receiveShadow = false;
                            } else {
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        }
                    });

                    // Clone this model for each position that uses it
                    const positions = positionsByFile[filename];
                    const isTallFile = filename.includes('_Tall_');

                    console.log(`Loading ${positions.length} instances of ${filename} in batches...`);

                    // Process in batches of 50 to prevent freezing
                    const batchSize = 50;
                    let batchIndex = 0;

                    const processBatch = () => {
                        const start = batchIndex * batchSize;
                        const end = Math.min(start + batchSize, positions.length);

                        for (let idx = start; idx < end; idx++) {
                            const pos = positions[idx];

                            const grassObj = baseModel.clone();

                        // Share geometry and materials to save memory
                        grassObj.traverse((child) => {
                            if (child.isMesh && baseModel) {
                                // Find corresponding mesh in base model
                                baseModel.traverse((baseChild) => {
                                    if (baseChild.isMesh && baseChild.name === child.name) {
                                        child.geometry = baseChild.geometry; // Share geometry
                                        child.material = baseChild.material; // Share material
                                    }
                                });
                            }
                        });

                        // Use the terrain height already calculated (more accurate than raycast)
                        grassObj.position.set(pos.x, pos.y, pos.z);
                        grassObj.rotation.y = pos.rotation;
                        grassObj.scale.set(pos.scale, pos.scale, pos.scale);

                        grassObj.userData = {
                            type: 'grass',
                            file: filename,
                            name: `Grass_${totalPlaced}`,
                            autoGenerated: 'grass'
                        };

                        this.scene.add(grassObj);
                        this.levelObjects.push(grassObj);
                        totalPlaced++;
                        }

                        batchIndex++;

                        // Process next batch after a short delay
                        if (batchIndex * batchSize < positions.length) {
                            setTimeout(processBatch, 10); // 10ms delay between batches
                        } else {
                            // All batches done for this model, load next model
                            console.log(`✅ Placed ${end} instances of ${filename}`);
                            loadNextGrassModel(index + 1);
                        }
                    };

                    // Start processing first batch
                    processBatch();
                },
                undefined,
                (error) => {
                    console.warn('Could not load grass model:', filename, error);
                    // Continue to next model even if this one fails
                    loadNextGrassModel(index + 1);
                }
            );
        };

        // Start loading from the first model
        loadNextGrassModel(0);

        return grassPositions.length;
    }

    // Auto-populate flowers on grass-textured areas
    autoPopulateFlowers(density = 0.05, clearExisting = false) {
        if (clearExisting) {
            // Remove existing auto-generated flowers
            const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'flowers');
            toRemove.forEach(obj => {
                this.scene.remove(obj);
                const idx = this.levelObjects.indexOf(obj);
                if (idx > -1) this.levelObjects.splice(idx, 1);
            });
        }

        // Flower asset options
        const flowerAssets = [
            // Wildflowers - most common
            { file: 'SM_Env_Wildflowers_01.glb', weight: 3 },
            { file: 'SM_Env_Wildflowers_02.glb', weight: 3 },
            { file: 'SM_Env_Wildflowers_03.glb', weight: 3 },
            { file: 'SM_Env_Wildflowers_Patch_01.glb', weight: 2 },
            { file: 'SM_Env_Wildflowers_Patch_02.glb', weight: 2 },
            { file: 'SM_Env_Wildflowers_Patch_03.glb', weight: 2 },
            // Flat flowers - common
            { file: 'SM_Env_Flowers_Flat_01.glb', weight: 2 },
            { file: 'SM_Env_Flowers_Flat_02.glb', weight: 2 },
            { file: 'SM_Env_Flowers_Flat_03.glb', weight: 2 },
            // Lillies - less common
            { file: 'SM_Env_Lillies_01.glb', weight: 1 },
            { file: 'SM_Env_Lillies_02.glb', weight: 1 },
            { file: 'SM_Env_Lillies_03.glb', weight: 1 },
            // Special flowers - rare
            { file: 'SM_Env_Rapeseed_Clump_01.glb', weight: 0.5 },
            { file: 'SM_Env_Rapeseed_Clump_02.glb', weight: 0.5 },
            { file: 'SM_Env_Sunflower_01.glb', weight: 0.5 }
        ];

        // Build weighted array for random selection
        const weightedAssets = [];
        flowerAssets.forEach(asset => {
            for (let i = 0; i < asset.weight * 10; i++) {
                weightedAssets.push(asset.file);
            }
        });

        // Get splatmap data to check grass texture (R channel)
        const imageData = this.splatmapContext.getImageData(0, 0, 512, 512);
        const terrainSize = 100;
        const splatmapSize = 512;

        // Collect all flower positions first
        const flowerPositions = [];
        const maxFlowers = 300;

        // Sample the terrain - flowers are more sparse than grass
        const step = 4;
        for (let x = -terrainSize / 2; x < terrainSize / 2; x += step) {
            for (let z = -terrainSize / 2; z < terrainSize / 2; z += step) {
                // Add randomness to position within the cell
                const worldX = x + (Math.random() - 0.5) * step;
                const worldZ = z + (Math.random() - 0.5) * step;

                // Convert world position to splatmap coordinates
                const splatX = Math.floor(((worldX + terrainSize / 2) / terrainSize) * splatmapSize);
                const splatZ = Math.floor(((worldZ + terrainSize / 2) / terrainSize) * splatmapSize);

                // Clamp to valid splatmap range
                const clampedX = Math.max(0, Math.min(splatmapSize - 1, splatX));
                const clampedZ = Math.max(0, Math.min(splatmapSize - 1, splatZ));

                // Get pixel index
                const pixelIndex = (clampedZ * splatmapSize + clampedX) * 4;
                const r = imageData.data[pixelIndex]; // Grass channel

                // Check if this is grass texture (flowers spawn on grass)
                if (r > 200) {
                    // Random chance based on density
                    if (Math.random() > density) continue;

                    // Check if there's already any object nearby
                    const minDistance = 3.0; // Flowers more sparse than grass

                    // Check against already placed flowers in this session
                    const tooCloseToFlowers = flowerPositions.some(pos => {
                        const dx = pos.x - worldX;
                        const dz = pos.z - worldZ;
                        return Math.sqrt(dx * dx + dz * dz) < minDistance;
                    });
                    if (tooCloseToFlowers) continue;

                    // Check against all existing objects in the scene
                    const tooCloseToObjects = this.levelObjects.some(obj => {
                        if (!obj.position) return false;
                        const dx = obj.position.x - worldX;
                        const dz = obj.position.z - worldZ;
                        return Math.sqrt(dx * dx + dz * dz) < minDistance;
                    });
                    if (tooCloseToObjects) continue;

                    // Get terrain height at this position
                    const terrainY = this.getTerrainHeightAt(worldX, worldZ);

                    // Pick random flower asset
                    const randomFile = weightedAssets[Math.floor(Math.random() * weightedAssets.length)];

                    flowerPositions.push({
                        x: worldX,
                        y: terrainY,
                        z: worldZ,
                        rotation: Math.random() * Math.PI * 2,
                        scale: 0.8 + Math.random() * 0.4,
                        file: randomFile
                    });
                }
            }
        }

        console.log(`Placing ${flowerPositions.length} flower objects...`);

        // Group positions by file to load each model only once
        const positionsByFile = {};
        flowerPositions.forEach(pos => {
            if (!positionsByFile[pos.file]) {
                positionsByFile[pos.file] = [];
            }
            positionsByFile[pos.file].push(pos);
        });

        // Load unique flower models and clone them for each position
        const uniqueFiles = Object.keys(positionsByFile);
        let totalPlaced = 0;

        const loadNextFlowerModel = (index) => {
            if (index >= uniqueFiles.length) {
                console.log(`✅ Auto-populated ${totalPlaced} flower objects using ${uniqueFiles.length} unique models`);
                this.updateSceneTree();
                this.updateStatusBar();
                return;
            }

            const filename = uniqueFiles[index];
            const path = `/assets/nature/flowers/${filename}`;

            this.gltfLoader.load(
                path,
                (gltf) => {
                    const baseModel = gltf.scene;
                    baseModel.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    // Clone this model for each position that uses it
                    const positions = positionsByFile[filename];

                    // Process in batches of 50 to prevent freezing
                    const batchSize = 50;
                    let batchIndex = 0;

                    const processBatch = () => {
                        const start = batchIndex * batchSize;
                        const end = Math.min(start + batchSize, positions.length);

                        for (let idx = start; idx < end; idx++) {
                            const pos = positions[idx];
                            const flowerObj = baseModel.clone();
                            // Share geometry and materials to save memory
                            flowerObj.traverse((child) => {
                                if (child.isMesh && baseModel) {
                                    // Find corresponding mesh in base model
                                    baseModel.traverse((baseChild) => {
                                        if (baseChild.isMesh && baseChild.name === child.name) {
                                            child.geometry = baseChild.geometry; // Share geometry
                                            child.material = baseChild.material; // Share material
                                        }
                                    });
                                }
                            });
                            flowerObj.position.set(pos.x, pos.y, pos.z);
                            flowerObj.rotation.y = pos.rotation;
                            flowerObj.scale.set(pos.scale, pos.scale, pos.scale);

                            flowerObj.userData = {
                                type: 'flowers',
                                file: filename,
                                name: `Flower_${totalPlaced}`,
                                autoGenerated: 'flowers'
                            };

                            this.scene.add(flowerObj);
                            this.levelObjects.push(flowerObj);
                            totalPlaced++;
                        }

                        batchIndex++;

                        // Process next batch after a short delay
                        if (batchIndex * batchSize < positions.length) {
                            setTimeout(processBatch, 10); // 10ms delay between batches
                        } else {
                            // All batches done for this model, load next model
                            console.log(`✅ Placed ${end} instances of ${filename}`);
                            loadNextFlowerModel(index + 1);
                        }
                    };

                    // Start processing first batch
                    processBatch();
                },
                undefined,
                (error) => {
                    console.warn('Could not load flower model:', filename, error);
                    loadNextFlowerModel(index + 1);
                }
            );
        };

        // Start loading first model
        loadNextFlowerModel(0);

        return flowerPositions.length;
    }

    clearAutoFlowers() {
        const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'flowers');
        toRemove.forEach(obj => {
            this.scene.remove(obj);
            const idx = this.levelObjects.indexOf(obj);
            if (idx > -1) this.levelObjects.splice(idx, 1);
        });
        console.log(`Removed ${toRemove.length} auto-generated flowers`);
        this.updateSceneTree();
        this.updateStatusBar();
    }

    // Auto-populate trees on grass-textured areas
    autoPopulateTrees(density = 0.08, clearExisting = false) {
        if (clearExisting) {
            // Remove existing auto-generated trees
            const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'trees');
            toRemove.forEach(obj => {
                this.scene.remove(obj);
                const idx = this.levelObjects.indexOf(obj);
                if (idx > -1) this.levelObjects.splice(idx, 1);
            });
        }

        // Tree asset options
        const treeAssets = [
            // Meadow trees - most common
            { file: 'SM_Env_Tree_Meadow_01.glb', weight: 3 },
            { file: 'SM_Env_Tree_Meadow_02.glb', weight: 3 },
            // Birch trees - common
            { file: 'SM_Env_Tree_Birch_01.glb', weight: 2 },
            { file: 'SM_Env_Tree_Birch_02.glb', weight: 2 },
            { file: 'SM_Env_Tree_Birch_03.glb', weight: 2 },
            // Fruit trees - less common
            { file: 'SM_Env_Tree_Fruit_01.glb', weight: 1 },
            { file: 'SM_Env_Tree_Fruit_02.glb', weight: 1 },
            { file: 'SM_Env_Tree_Fruit_03.glb', weight: 1 },
            // Bushes - occasional
            { file: 'SM_Env_Bush_01.glb', weight: 1 },
            { file: 'SM_Env_Bush_02.glb', weight: 1 },
            { file: 'SM_Env_Bush_03.glb', weight: 1 }
        ];

        // Build weighted array for random selection
        const weightedAssets = [];
        treeAssets.forEach(asset => {
            for (let i = 0; i < asset.weight * 10; i++) {
                weightedAssets.push(asset.file);
            }
        });

        // Get splatmap data to check grass texture (R channel)
        const imageData = this.splatmapContext.getImageData(0, 0, 512, 512);
        const terrainSize = 100;
        const splatmapSize = 512;

        // Collect all tree positions first
        const treePositions = [];
        const maxTrees = 100;

        // Sample the terrain - trees are very sparse
        const step = 8;
        for (let x = -terrainSize / 2; x < terrainSize / 2; x += step) {
            for (let z = -terrainSize / 2; z < terrainSize / 2; z += step) {
                // Add randomness to position within the cell
                const worldX = x + (Math.random() - 0.5) * step;
                const worldZ = z + (Math.random() - 0.5) * step;

                // Convert world position to splatmap coordinates
                const splatX = Math.floor(((worldX + terrainSize / 2) / terrainSize) * splatmapSize);
                const splatZ = Math.floor(((worldZ + terrainSize / 2) / terrainSize) * splatmapSize);

                // Clamp to valid splatmap range
                const clampedX = Math.max(0, Math.min(splatmapSize - 1, splatX));
                const clampedZ = Math.max(0, Math.min(splatmapSize - 1, splatZ));

                // Get pixel index
                const pixelIndex = (clampedZ * splatmapSize + clampedX) * 4;
                const r = imageData.data[pixelIndex]; // Grass channel

                // Check if this is grass texture (trees spawn on grass)
                if (r > 200) {
                    // Random chance based on density
                    if (Math.random() > density) continue;

                    // Check if there's already a tree nearby
                    const minDistance = 4.0; // Trees need space from each other

                    // Check against already placed trees in this session
                    const tooCloseToTrees = treePositions.some(pos => {
                        const dx = pos.x - worldX;
                        const dz = pos.z - worldZ;
                        return Math.sqrt(dx * dx + dz * dz) < minDistance;
                    });
                    if (tooCloseToTrees) continue;

                    // Check against existing trees only (not grass/flowers)
                    const tooCloseToExistingTrees = this.levelObjects.some(obj => {
                        if (!obj.position) return false;
                        if (obj.userData?.autoGenerated !== 'trees' && obj.userData?.type !== 'trees') return false;
                        const dx = obj.position.x - worldX;
                        const dz = obj.position.z - worldZ;
                        return Math.sqrt(dx * dx + dz * dz) < minDistance;
                    });
                    if (tooCloseToExistingTrees) continue;

                    // Get terrain height at this position
                    const terrainY = this.getTerrainHeightAt(worldX, worldZ);

                    // Pick random tree asset
                    const randomFile = weightedAssets[Math.floor(Math.random() * weightedAssets.length)];

                    treePositions.push({
                        x: worldX,
                        y: terrainY,
                        z: worldZ,
                        rotation: Math.random() * Math.PI * 2,
                        scale: 0.9 + Math.random() * 0.3,
                        file: randomFile
                    });
                }
            }
        }

        console.log(`Placing ${treePositions.length} tree objects...`);

        // Group positions by file to load each model only once
        const positionsByFile = {};
        treePositions.forEach(pos => {
            if (!positionsByFile[pos.file]) {
                positionsByFile[pos.file] = [];
            }
            positionsByFile[pos.file].push(pos);
        });

        // Load unique tree models sequentially (not all at once)
        const uniqueFiles = Object.keys(positionsByFile);
        let totalPlaced = 0;

        const loadNextTreeModel = (index) => {
            if (index >= uniqueFiles.length) {
                console.log(`✅ Auto-populated ${totalPlaced} tree objects using ${uniqueFiles.length} unique models`);
                this.updateSceneTree();
                this.updateStatusBar();
                return;
            }

            const filename = uniqueFiles[index];
            const path = `/assets/nature/trees/${filename}`;

            this.gltfLoader.load(
                path,
                (gltf) => {
                    const baseModel = gltf.scene;
                    baseModel.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    // Clone this model for each position that uses it
                    const positions = positionsByFile[filename];

                    // Process in batches of 50 to prevent freezing
                    const batchSize = 50;
                    let batchIndex = 0;

                    const processBatch = () => {
                        const start = batchIndex * batchSize;
                        const end = Math.min(start + batchSize, positions.length);

                        for (let idx = start; idx < end; idx++) {
                            const pos = positions[idx];
                            const treeObj = baseModel.clone();
                            // Share geometry and materials to save memory
                            treeObj.traverse((child) => {
                                if (child.isMesh && baseModel) {
                                    // Find corresponding mesh in base model
                                    baseModel.traverse((baseChild) => {
                                        if (baseChild.isMesh && baseChild.name === child.name) {
                                            child.geometry = baseChild.geometry; // Share geometry
                                            child.material = baseChild.material; // Share material
                                        }
                                    });
                                }
                            });
                            treeObj.position.set(pos.x, pos.y, pos.z);
                            treeObj.rotation.y = pos.rotation;
                            treeObj.scale.set(pos.scale, pos.scale, pos.scale);

                            treeObj.userData = {
                                type: 'trees',
                                file: filename,
                                name: `Tree_${totalPlaced}`,
                                autoGenerated: 'trees'
                            };

                            this.scene.add(treeObj);
                            this.levelObjects.push(treeObj);
                            totalPlaced++;
                        }

                        batchIndex++;

                        // Process next batch after a short delay
                        if (batchIndex * batchSize < positions.length) {
                            setTimeout(processBatch, 10); // 10ms delay between batches
                        } else {
                            // All batches done for this model, load next model
                            console.log(`✅ Placed ${end} instances of ${filename}`);
                            loadNextTreeModel(index + 1);
                        }
                    };

                    // Start processing first batch
                    processBatch();
                },
                undefined,
                (error) => {
                    console.warn('Could not load tree model:', filename, error);
                    loadNextTreeModel(index + 1);
                }
            );
        };

        // Start loading first model
        loadNextTreeModel(0);

        return treePositions.length;
    }

    clearAutoTrees() {
        const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'trees');
        toRemove.forEach(obj => {
            this.scene.remove(obj);
            const idx = this.levelObjects.indexOf(obj);
            if (idx > -1) this.levelObjects.splice(idx, 1);
        });
        console.log(`Removed ${toRemove.length} auto-generated trees`);
        this.updateSceneTree();
        this.updateStatusBar();
    }

    // Auto-populate rocks on grass-textured areas
    autoPopulateRocks(density = 0.05, clearExisting = false) {
        if (clearExisting) {
            // Remove existing auto-generated rocks
            const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'rocks');
            toRemove.forEach(obj => {
                this.scene.remove(obj);
                const idx = this.levelObjects.indexOf(obj);
                if (idx > -1) this.levelObjects.splice(idx, 1);
            });
        }

        // Rock asset options
        const rockAssets = [
            // Regular rocks - most common
            { file: 'SM_Env_Rock_01.glb', weight: 3 },
            { file: 'SM_Env_Rock_02.glb', weight: 3 },
            { file: 'SM_Env_Rock_03.glb', weight: 3 },
            { file: 'SM_Env_Rock_04.glb', weight: 3 },
            { file: 'SM_Env_Rock_05.glb', weight: 3 },
            { file: 'SM_Env_Rock_06.glb', weight: 3 },
            // Ground rocks - common
            { file: 'SM_Env_Rock_Ground_01.glb', weight: 2 },
            { file: 'SM_Env_Rock_Ground_02.glb', weight: 2 },
            // Rock piles - common
            { file: 'SM_Env_Rock_Pile_01.glb', weight: 2 },
            { file: 'SM_Env_Rock_Pile_02.glb', weight: 2 },
            { file: 'SM_Env_Rock_Pile_03.glb', weight: 2 },
            { file: 'SM_Env_Rock_Pile_04.glb', weight: 2 },
            { file: 'SM_Env_Rock_Pile_05.glb', weight: 2 },
            { file: 'SM_Env_Rock_Pile_06.glb', weight: 2 },
            { file: 'SM_Env_Rock_Pile_07.glb', weight: 2 },
            // Small rocks - very common
            { file: 'SM_Env_Rock_Small_01.glb', weight: 4 },
            { file: 'SM_Env_Rock_Small_Pile_01.glb', weight: 3 },
            { file: 'SM_Env_Rock_Small_Pile_02.glb', weight: 3 },
            // Round rock - occasional
            { file: 'SM_Env_Rock_Round_01.glb', weight: 2 },
            // Cliff rocks - rare (larger)
            { file: 'SM_Env_Rock_Cliff_01.glb', weight: 1 },
            { file: 'SM_Env_Rock_Cliff_02.glb', weight: 1 },
            { file: 'SM_Env_Rock_Cliff_03.glb', weight: 1 }
        ];

        // Build weighted array for random selection
        const weightedAssets = [];
        rockAssets.forEach(asset => {
            for (let i = 0; i < asset.weight * 10; i++) {
                weightedAssets.push(asset.file);
            }
        });

        // Get splatmap data to check grass texture (R channel)
        const imageData = this.splatmapContext.getImageData(0, 0, 512, 512);
        const terrainSize = 100;
        const splatmapSize = 512;

        // Collect all rock positions first
        const rockPositions = [];

        // Sample the terrain - rocks are moderately sparse
        const step = 5;
        for (let x = -terrainSize / 2; x < terrainSize / 2; x += step) {
            for (let z = -terrainSize / 2; z < terrainSize / 2; z += step) {

                // Add randomness to position within the cell
                const worldX = x + (Math.random() - 0.5) * step;
                const worldZ = z + (Math.random() - 0.5) * step;

                // Convert world position to splatmap coordinates
                const splatX = Math.floor(((worldX + terrainSize / 2) / terrainSize) * splatmapSize);
                const splatZ = Math.floor(((worldZ + terrainSize / 2) / terrainSize) * splatmapSize);

                // Clamp to valid splatmap range
                const clampedX = Math.max(0, Math.min(splatmapSize - 1, splatX));
                const clampedZ = Math.max(0, Math.min(splatmapSize - 1, splatZ));

                // Get pixel index
                const pixelIndex = (clampedZ * splatmapSize + clampedX) * 4;
                const r = imageData.data[pixelIndex]; // Grass channel

                // Check if this is grass texture (rocks spawn on grass)
                if (r > 200) {
                    // Random chance based on density
                    if (Math.random() > density) continue;

                    // Check if there's already a rock nearby
                    const minDistance = 2.0; // Rocks can be fairly close

                    // Check against already placed rocks in this session
                    const tooCloseToRocks = rockPositions.some(pos => {
                        const dx = pos.x - worldX;
                        const dz = pos.z - worldZ;
                        return Math.sqrt(dx * dx + dz * dz) < minDistance;
                    });
                    if (tooCloseToRocks) continue;

                    // Check against existing rocks only
                    const tooCloseToExistingRocks = this.levelObjects.some(obj => {
                        if (!obj.position) return false;
                        if (obj.userData?.autoGenerated !== 'rocks' && obj.userData?.type !== 'rocks') return false;
                        const dx = obj.position.x - worldX;
                        const dz = obj.position.z - worldZ;
                        return Math.sqrt(dx * dx + dz * dz) < minDistance;
                    });
                    if (tooCloseToExistingRocks) continue;

                    // Get terrain height at this position
                    const terrainY = this.getTerrainHeightAt(worldX, worldZ);

                    // Pick random rock asset
                    const randomFile = weightedAssets[Math.floor(Math.random() * weightedAssets.length)];

                    rockPositions.push({
                        x: worldX,
                        y: terrainY,
                        z: worldZ,
                        rotation: Math.random() * Math.PI * 2,
                        scale: 0.8 + Math.random() * 0.4, // Varied sizes
                        file: randomFile
                    });
                }
            }
        }

        console.log(`Placing ${rockPositions.length} rock objects...`);

        // Group positions by file to load each model only once
        const positionsByFile = {};
        rockPositions.forEach(pos => {
            if (!positionsByFile[pos.file]) {
                positionsByFile[pos.file] = [];
            }
            positionsByFile[pos.file].push(pos);
        });

        // Load unique rock models and clone them for each position
        const uniqueFiles = Object.keys(positionsByFile);
        let totalPlaced = 0;

        const loadNextRockModel = (index) => {
            if (index >= uniqueFiles.length) {
                console.log(`✅ Auto-populated ${totalPlaced} rock objects using ${uniqueFiles.length} unique models`);
                this.updateSceneTree();
                this.updateStatusBar();
                return;
            }

            const filename = uniqueFiles[index];
            const path = `/assets/nature/rocks/${filename}`;

            this.gltfLoader.load(
                path,
                (gltf) => {
                    const baseModel = gltf.scene;
                    baseModel.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    // Clone this model for each position that uses it
                    const positions = positionsByFile[filename];

                    // Process in batches of 50 to prevent freezing
                    const batchSize = 50;
                    let batchIndex = 0;

                    const processBatch = () => {
                        const start = batchIndex * batchSize;
                        const end = Math.min(start + batchSize, positions.length);

                        for (let idx = start; idx < end; idx++) {
                            const pos = positions[idx];
                            const rockObj = baseModel.clone();
                            // Share geometry and materials to save memory
                            rockObj.traverse((child) => {
                                if (child.isMesh && baseModel) {
                                    // Find corresponding mesh in base model
                                    baseModel.traverse((baseChild) => {
                                        if (baseChild.isMesh && baseChild.name === child.name) {
                                            child.geometry = baseChild.geometry; // Share geometry
                                            child.material = baseChild.material; // Share material
                                        }
                                    });
                                }
                            });
                            rockObj.position.set(pos.x, pos.y, pos.z);
                            rockObj.rotation.y = pos.rotation;
                            rockObj.scale.set(pos.scale, pos.scale, pos.scale);

                            rockObj.userData = {
                                type: 'rocks',
                                file: filename,
                                name: `Rock_${totalPlaced}`,
                                autoGenerated: 'rocks'
                            };

                            this.scene.add(rockObj);
                            this.levelObjects.push(rockObj);
                            totalPlaced++;
                        }

                        batchIndex++;

                        // Process next batch after a short delay
                        if (batchIndex * batchSize < positions.length) {
                            setTimeout(processBatch, 10); // 10ms delay between batches
                        } else {
                            // All batches done for this model, load next model
                            console.log(`✅ Placed ${end} instances of ${filename}`);
                            loadNextRockModel(index + 1);
                        }
                    };

                    // Start processing first batch
                    processBatch();
                },
                undefined,
                (error) => {
                    console.warn('Could not load rock model:', filename, error);
                    loadNextRockModel(index + 1);
                }
            );
        };

        // Start loading first model
        loadNextRockModel(0);

        return rockPositions.length;
    }

    clearAutoRocks() {
        const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'rocks');
        toRemove.forEach(obj => {
            this.scene.remove(obj);
            const idx = this.levelObjects.indexOf(obj);
            if (idx > -1) this.levelObjects.splice(idx, 1);
        });
        console.log(`Removed ${toRemove.length} auto-generated rocks`);
        this.updateSceneTree();
        this.updateStatusBar();
    }

    // Auto-generate terrain height with varied hills, valleys, and flat areas
    autoGenerateTerrain(intensity = 4, scale = 0.015) {
        if (!this.terrain) return;

        const geometry = this.terrain.geometry;
        const positions = geometry.attributes.position;

        console.log('Generating varied terrain with hills, valleys, and flats...');

        // Random seed for each generation
        const seed = Math.random() * 10000;

        // Simple pseudo-random noise function with seed
        const random2D = (x, z) => {
            const dot = (x + seed) * 12.9898 + (z + seed) * 78.233;
            return Math.abs(Math.sin(dot) * 43758.5453) % 1;
        };

        // Smooth interpolation
        const smoothstep = (t) => t * t * (3 - 2 * t);

        // Smooth rolling terrain - only low frequency features
        const variedTerrain = (x, z) => {
            let height = 0;
            let amplitude = 1.0;
            let frequency = scale;

            // Use fewer octaves and reduce amplitude faster for smoother terrain
            for (let octave = 0; octave < 3; octave++) {
                // Get grid coordinates
                const gridX = Math.floor(x * frequency);
                const gridZ = Math.floor(z * frequency);

                // Get fractional parts
                const fracX = (x * frequency) - gridX;
                const fracZ = (z * frequency) - gridZ;

                // Get random values at grid corners
                const v00 = random2D(gridX, gridZ);
                const v10 = random2D(gridX + 1, gridZ);
                const v01 = random2D(gridX, gridZ + 1);
                const v11 = random2D(gridX + 1, gridZ + 1);

                // Smooth interpolation
                const sx = smoothstep(fracX);
                const sz = smoothstep(fracZ);

                const v0 = v00 * (1 - sx) + v10 * sx;
                const v1 = v01 * (1 - sx) + v11 * sx;
                const value = v0 * (1 - sz) + v1 * sz;

                // Add this octave (centered around 0)
                height += (value - 0.5) * amplitude;

                // Increase frequency, decrease amplitude more aggressively for smoothness
                frequency *= 1.8;
                amplitude *= 0.35;
            }

            // Add some very large, smooth features (hills and valleys)
            const largeFeat1 = Math.sin(x * scale * 0.2) * Math.cos(z * scale * 0.2) * 1.0;
            const largeFeat2 = Math.cos(x * scale * 0.15) * Math.sin(z * scale * 0.16) * 0.7;
            const largeFeat3 = Math.sin(x * scale * 0.1) * Math.cos(z * scale * 0.11) * 0.5;

            // Create smoothly interpolated regions to avoid cliffs
            // Use non-floored coordinates for smooth region transitions
            const regionScale = scale * 0.08;
            const regionGridX = Math.floor(x * regionScale);
            const regionGridZ = Math.floor(z * regionScale);
            const regionFracX = (x * regionScale) - regionGridX;
            const regionFracZ = (z * regionScale) - regionGridZ;

            // Get region noise at corners
            const r00 = random2D(regionGridX, regionGridZ);
            const r10 = random2D(regionGridX + 1, regionGridZ);
            const r01 = random2D(regionGridX, regionGridZ + 1);
            const r11 = random2D(regionGridX + 1, regionGridZ + 1);

            // Smooth interpolation between corners
            const rsx = smoothstep(regionFracX);
            const rsz = smoothstep(regionFracZ);
            const r0 = r00 * (1 - rsx) + r10 * rsx;
            const r1 = r01 * (1 - rsx) + r11 * rsx;
            const regionNoise = r0 * (1 - rsz) + r1 * rsz;

            // Map region noise to terrain multiplier with very smooth gradients
            let terrainMultiplier;
            if (regionNoise < 0.15) {
                terrainMultiplier = 0.15; // Mostly flat areas
            } else if (regionNoise < 0.35) {
                const t = smoothstep((regionNoise - 0.15) / 0.2);
                terrainMultiplier = 0.15 + t * 0.45; // 0.15 to 0.6 gentle hills
            } else if (regionNoise < 0.65) {
                const t = smoothstep((regionNoise - 0.35) / 0.3);
                terrainMultiplier = 0.6 + t * 0.5; // 0.6 to 1.1 normal hills
            } else {
                const t = smoothstep((regionNoise - 0.65) / 0.35);
                terrainMultiplier = 1.1 + t * 0.5; // 1.1 to 1.6 larger hills
            }

            return (height + largeFeat1 + largeFeat2 + largeFeat3) * terrainMultiplier;
        };

        // Terrain size for edge detection
        const terrainSize = 100;
        const halfSize = terrainSize / 2;
        const edgeBlendDistance = 10; // Distance from edge where blending starts

        // Apply varied terrain to each vertex
        for (let i = 0; i < positions.count; i++) {
            const localX = positions.getX(i);
            const localY = positions.getY(i);

            // Generate varied height with hills, valleys, and flats
            let height = variedTerrain(localX, localY) * intensity;

            // Calculate distance from edges (0 = at edge, 1 = far from edge)
            const distFromLeftEdge = (localX + halfSize) / edgeBlendDistance;
            const distFromRightEdge = (halfSize - localX) / edgeBlendDistance;
            const distFromBottomEdge = (localY + halfSize) / edgeBlendDistance;
            const distFromTopEdge = (halfSize - localY) / edgeBlendDistance;

            // Get the minimum distance (closest edge)
            const edgeFactor = Math.min(
                Math.min(distFromLeftEdge, distFromRightEdge),
                Math.min(distFromBottomEdge, distFromTopEdge)
            );

            // Clamp and smooth the edge factor
            const blend = Math.max(0, Math.min(1, edgeFactor));
            const smoothBlend = smoothstep(blend);

            // Blend height to 0 at edges
            height *= smoothBlend;

            positions.setZ(i, height);
        }

        positions.needsUpdate = true;
        geometry.computeVertexNormals();

        console.log('✅ Varied terrain generated successfully with flat edges for seamless chunks');
    }

    flattenTerrain() {
        if (!this.terrain) return;

        const geometry = this.terrain.geometry;
        const positions = geometry.attributes.position;

        console.log('Flattening terrain...');

        // Set all heights to 0
        for (let i = 0; i < positions.count; i++) {
            positions.setZ(i, 0);
        }

        positions.needsUpdate = true;
        geometry.computeVertexNormals();

        console.log('✅ Terrain flattened');
    }

    // Auto-populate bushes on grass-textured areas
    autoPopulateBushes(density = 0.06, clearExisting = false) {
        if (clearExisting) {
            // Remove existing auto-generated bushes
            const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'bushes');
            toRemove.forEach(obj => {
                this.scene.remove(obj);
                const idx = this.levelObjects.indexOf(obj);
                if (idx > -1) this.levelObjects.splice(idx, 1);
            });
        }

        // Bush asset options (from trees and grass folders)
        const bushAssets = [
            { file: 'trees/SM_Env_Bush_01.glb', weight: 3 },
            { file: 'trees/SM_Env_Bush_02.glb', weight: 3 },
            { file: 'trees/SM_Env_Bush_03.glb', weight: 3 },
            { file: 'grass/SM_Env_Grass_Bush_01.glb', weight: 2 }
        ];

        // Build weighted array for random selection
        const weightedAssets = [];
        bushAssets.forEach(asset => {
            for (let i = 0; i < asset.weight * 10; i++) {
                weightedAssets.push(asset.file);
            }
        });

        // Get splatmap data to check grass texture (R channel)
        const imageData = this.splatmapContext.getImageData(0, 0, 512, 512);
        const terrainSize = 100;
        const splatmapSize = 512;

        // Collect all bush positions first
        const bushPositions = [];

        // Sample the terrain - bushes are moderately sparse
        const step = 6;
        for (let x = -terrainSize / 2; x < terrainSize / 2; x += step) {
            for (let z = -terrainSize / 2; z < terrainSize / 2; z += step) {

                // Add randomness to position within the cell
                const worldX = x + (Math.random() - 0.5) * step;
                const worldZ = z + (Math.random() - 0.5) * step;

                // Convert world position to splatmap coordinates
                const splatX = Math.floor(((worldX + terrainSize / 2) / terrainSize) * splatmapSize);
                const splatZ = Math.floor(((worldZ + terrainSize / 2) / terrainSize) * splatmapSize);

                // Clamp to valid splatmap range
                const clampedX = Math.max(0, Math.min(splatmapSize - 1, splatX));
                const clampedZ = Math.max(0, Math.min(splatmapSize - 1, splatZ));

                // Get pixel index
                const pixelIndex = (clampedZ * splatmapSize + clampedX) * 4;
                const r = imageData.data[pixelIndex]; // Grass channel

                // Check if this is grass texture (bushes spawn on grass)
                if (r > 200) {
                    // Random chance based on density
                    if (Math.random() > density) continue;

                    // Check if there's already a bush nearby
                    const minDistance = 3.0; // Bushes need some space

                    // Check against already placed bushes in this session
                    const tooCloseToBushes = bushPositions.some(pos => {
                        const dx = pos.x - worldX;
                        const dz = pos.z - worldZ;
                        return Math.sqrt(dx * dx + dz * dz) < minDistance;
                    });
                    if (tooCloseToBushes) continue;

                    // Check against existing bushes only
                    const tooCloseToExistingBushes = this.levelObjects.some(obj => {
                        if (!obj.position) return false;
                        if (obj.userData?.autoGenerated !== 'bushes' && obj.userData?.type !== 'bushes') return false;
                        const dx = obj.position.x - worldX;
                        const dz = obj.position.z - worldZ;
                        return Math.sqrt(dx * dx + dz * dz) < minDistance;
                    });
                    if (tooCloseToExistingBushes) continue;

                    // Get terrain height at this position
                    const terrainY = this.getTerrainHeightAt(worldX, worldZ);

                    // Pick random bush asset
                    const randomFile = weightedAssets[Math.floor(Math.random() * weightedAssets.length)];

                    bushPositions.push({
                        x: worldX,
                        y: terrainY,
                        z: worldZ,
                        rotation: Math.random() * Math.PI * 2,
                        scale: 0.85 + Math.random() * 0.35, // Varied sizes
                        file: randomFile
                    });
                }
            }
        }

        console.log(`Placing ${bushPositions.length} bush objects...`);

        // Group positions by file to load each model only once
        const positionsByFile = {};
        bushPositions.forEach(pos => {
            if (!positionsByFile[pos.file]) {
                positionsByFile[pos.file] = [];
            }
            positionsByFile[pos.file].push(pos);
        });

        // Load unique bush models and clone them for each position
        const uniqueFiles = Object.keys(positionsByFile);
        let totalPlaced = 0;

        const loadNextBushModel = (index) => {
            if (index >= uniqueFiles.length) {
                console.log(`✅ Auto-populated ${totalPlaced} bush objects using ${uniqueFiles.length} unique models`);
                this.updateSceneTree();
                this.updateStatusBar();
                return;
            }

            const filename = uniqueFiles[index];
            const path = `/assets/nature/${filename}`;

            this.gltfLoader.load(
                path,
                (gltf) => {
                    const baseModel = gltf.scene;
                    baseModel.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    // Clone this model for each position that uses it
                    const positions = positionsByFile[filename];

                    // Process in batches of 50 to prevent freezing
                    const batchSize = 50;
                    let batchIndex = 0;

                    const processBatch = () => {
                        const start = batchIndex * batchSize;
                        const end = Math.min(start + batchSize, positions.length);

                        for (let idx = start; idx < end; idx++) {
                            const pos = positions[idx];
                            const bushObj = baseModel.clone();
                            // Share geometry and materials to save memory
                            bushObj.traverse((child) => {
                                if (child.isMesh && baseModel) {
                                    // Find corresponding mesh in base model
                                    baseModel.traverse((baseChild) => {
                                        if (baseChild.isMesh && baseChild.name === child.name) {
                                            child.geometry = baseChild.geometry; // Share geometry
                                            child.material = baseChild.material; // Share material
                                        }
                                    });
                                }
                            });
                            bushObj.position.set(pos.x, pos.y, pos.z);
                            bushObj.rotation.y = pos.rotation;
                            bushObj.scale.set(pos.scale, pos.scale, pos.scale);

                            bushObj.userData = {
                                type: 'bushes',
                                file: filename,
                                name: `Bush_${totalPlaced}`,
                                autoGenerated: 'bushes'
                            };

                            this.scene.add(bushObj);
                            this.levelObjects.push(bushObj);
                            totalPlaced++;
                        }

                        batchIndex++;

                        // Process next batch after a short delay
                        if (batchIndex * batchSize < positions.length) {
                            setTimeout(processBatch, 10); // 10ms delay between batches
                        } else {
                            // All batches done for this model, load next model
                            console.log(`✅ Placed ${end} instances of ${filename}`);
                            loadNextBushModel(index + 1);
                        }
                    };

                    // Start processing first batch
                    processBatch();
                },
                undefined,
                (error) => {
                    console.warn('Could not load bush model:', filename, error);
                    loadNextBushModel(index + 1);
                }
            );
        };

        // Start loading first model
        loadNextBushModel(0);

        return bushPositions.length;
    }

    clearAutoBushes() {
        const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'bushes');
        toRemove.forEach(obj => {
            this.scene.remove(obj);
            const idx = this.levelObjects.indexOf(obj);
            if (idx > -1) this.levelObjects.splice(idx, 1);
        });
        console.log(`Removed ${toRemove.length} auto-generated bushes`);
        this.updateSceneTree();
        this.updateStatusBar();
    }

    // Auto-populate mushrooms on grass-textured areas
    autoPopulateMushrooms(density = 0.04, clearExisting = false) {
        if (clearExisting) {
            // Remove existing auto-generated mushrooms
            const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'mushrooms');
            toRemove.forEach(obj => {
                this.scene.remove(obj);
                const idx = this.levelObjects.indexOf(obj);
                if (idx > -1) this.levelObjects.splice(idx, 1);
            });
        }

        // Mushroom asset options (using FBX files)
        const mushroomAssets = [
            // Single mushrooms - most common
            { file: 'SM_Prop_Mushroom_01.FBX', weight: 4 },
            { file: 'SM_Prop_Mushroom_02.FBX', weight: 4 },
            { file: 'SM_Prop_Mushroom_03.FBX', weight: 4 },
            { file: 'SM_Prop_Mushroom_04.FBX', weight: 4 },
            { file: 'SM_Prop_Mushroom_05.FBX', weight: 4 },
            { file: 'SM_Prop_Mushroom_06.FBX', weight: 4 },
            // Sparse mushrooms - common
            { file: 'SM_Prop_Mushroom_Sparse_01.FBX', weight: 3 },
            { file: 'SM_Prop_Mushroom_Sparse_02.FBX', weight: 3 },
            { file: 'SM_Prop_Mushroom_Sparse_03.FBX', weight: 3 },
            { file: 'SM_Prop_Mushroom_Sparse_04.FBX', weight: 3 },
            { file: 'SM_Prop_Mushroom_Sparse_05.FBX', weight: 3 },
            // Mushroom groups - less common
            { file: 'SM_Prop_Mushroom_Group_02.FBX', weight: 2 },
            { file: 'SM_Prop_Mushroom_Group_03.FBX', weight: 2 },
            { file: 'SM_Prop_Mushroom_Group_04.FBX', weight: 2 },
            { file: 'SM_Prop_Mushroom_Group_05.FBX', weight: 2 },
            // Mushroom houses - rare
            { file: 'SM_Prop_MushroomHouse_01.FBX', weight: 1 },
            { file: 'SM_Prop_MushroomHouse_02.FBX', weight: 1 }
        ];

        // Build weighted array for random selection
        const weightedAssets = [];
        mushroomAssets.forEach(asset => {
            for (let i = 0; i < asset.weight * 10; i++) {
                weightedAssets.push(asset.file);
            }
        });

        // Get splatmap data to check grass texture (R channel)
        const imageData = this.splatmapContext.getImageData(0, 0, 512, 512);
        const terrainSize = 100;
        const splatmapSize = 512;

        // Collect all mushroom positions first
        const mushroomPositions = [];
        const maxMushrooms = 100;

        // Sample the terrain - mushrooms are fairly sparse
        const step = 6;
        for (let x = -terrainSize / 2; x < terrainSize / 2; x += step) {
            for (let z = -terrainSize / 2; z < terrainSize / 2; z += step) {
                if (mushroomPositions.length >= maxMushrooms) break;

                // Add randomness to position within the cell
                const worldX = x + (Math.random() - 0.5) * step;
                const worldZ = z + (Math.random() - 0.5) * step;

                // Convert world position to splatmap coordinates
                const splatX = Math.floor(((worldX + terrainSize / 2) / terrainSize) * splatmapSize);
                const splatZ = Math.floor(((worldZ + terrainSize / 2) / terrainSize) * splatmapSize);

                // Clamp to valid splatmap range
                const clampedX = Math.max(0, Math.min(splatmapSize - 1, splatX));
                const clampedZ = Math.max(0, Math.min(splatmapSize - 1, splatZ));

                // Get pixel index
                const pixelIndex = (clampedZ * splatmapSize + clampedX) * 4;
                const r = imageData.data[pixelIndex]; // Grass channel

                // Check if this is grass texture (mushrooms spawn on grass)
                if (r > 200) {
                    // Random chance based on density
                    if (Math.random() > density) continue;

                    // Check if there's already a mushroom nearby
                    const minDistance = 2.5; // Mushrooms need some space

                    // Check against already placed mushrooms in this session
                    const tooCloseToMushrooms = mushroomPositions.some(pos => {
                        const dx = pos.x - worldX;
                        const dz = pos.z - worldZ;
                        return Math.sqrt(dx * dx + dz * dz) < minDistance;
                    });
                    if (tooCloseToMushrooms) continue;

                    // Check against existing mushrooms only
                    const tooCloseToExistingMushrooms = this.levelObjects.some(obj => {
                        if (!obj.position) return false;
                        if (obj.userData?.autoGenerated !== 'mushrooms' && obj.userData?.type !== 'mushrooms') return false;
                        const dx = obj.position.x - worldX;
                        const dz = obj.position.z - worldZ;
                        return Math.sqrt(dx * dx + dz * dz) < minDistance;
                    });
                    if (tooCloseToExistingMushrooms) continue;

                    // Get terrain height at this position
                    const terrainY = this.getTerrainHeightAt(worldX, worldZ);

                    // Pick random mushroom asset
                    const randomFile = weightedAssets[Math.floor(Math.random() * weightedAssets.length)];

                    mushroomPositions.push({
                        x: worldX,
                        y: terrainY,
                        z: worldZ,
                        rotation: Math.random() * Math.PI * 2,
                        scale: 0.8 + Math.random() * 0.4, // Varied sizes
                        file: randomFile
                    });
                }
            }
        }

        console.log(`Placing ${mushroomPositions.length} mushroom objects...`);

        // Group positions by file to load each model only once
        const positionsByFile = {};
        mushroomPositions.forEach(pos => {
            if (!positionsByFile[pos.file]) {
                positionsByFile[pos.file] = [];
            }
            positionsByFile[pos.file].push(pos);
        });

        // Load unique mushroom models and clone them for each position
        const uniqueFiles = Object.keys(positionsByFile);
        let loadedCount = 0;
        let totalPlaced = 0;

        uniqueFiles.forEach(filename => {
            const path = `/assets/props/${filename}`;

            this.fbxLoader.load(
                path,
                (fbx) => {
                    const baseModel = fbx;
                    baseModel.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            // Apply meadow texture to mushrooms (props use meadow atlas)
                            const hasVertexColors = child.geometry?.attributes?.color;
                            const materialConfig = {
                                map: this.textures.meadow,
                                color: 0xffffff,
                                roughness: 0.8,
                                metalness: 0.1,
                                side: THREE.DoubleSide
                            };
                            if (hasVertexColors) {
                                materialConfig.vertexColors = true;
                            }
                            child.material = new THREE.MeshStandardMaterial(materialConfig);
                        }
                    });

                    // Clone this model for each position that uses it
                    const positions = positionsByFile[filename];
                    positions.forEach((pos, idx) => {
                        const mushroomObj = baseModel.clone();
                        mushroomObj.position.set(pos.x, pos.y, pos.z);
                        // Apply FBX scale (0.01) combined with variation
                        const finalScale = pos.scale * 0.01;
                        mushroomObj.scale.set(finalScale, finalScale, finalScale);
                        // Rotate FBX (Unreal Z-up to Three.js Y-up)
                        mushroomObj.rotation.x = Math.PI / 2; // 90°
                        mushroomObj.rotation.y = pos.rotation;

                        mushroomObj.userData = {
                            type: 'mushrooms',
                            file: filename,
                            name: `Mushroom_${totalPlaced}`,
                            autoGenerated: 'mushrooms'
                        };

                        this.scene.add(mushroomObj);
                        this.levelObjects.push(mushroomObj);
                        totalPlaced++;
                    });

                    loadedCount++;
                    if (loadedCount === uniqueFiles.length) {
                        console.log(`✅ Auto-populated ${totalPlaced} mushroom objects using ${uniqueFiles.length} unique models`);
                        this.updateSceneTree();
                        this.updateStatusBar();
                    }
                },
                undefined,
                (error) => {
                    console.warn('Could not load mushroom model:', filename, error);
                    loadedCount++;
                }
            );
        });

        return mushroomPositions.length;
    }

    clearAutoMushrooms() {
        const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'mushrooms');
        toRemove.forEach(obj => {
            this.scene.remove(obj);
            const idx = this.levelObjects.indexOf(obj);
            if (idx > -1) this.levelObjects.splice(idx, 1);
        });
        console.log(`Removed ${toRemove.length} auto-generated mushrooms`);
        this.updateSceneTree();
        this.updateStatusBar();
    }

    // Get terrain height at world position
    getTerrainHeightAt(worldX, worldZ) {
        if (!this.terrain) return 0;

        const positions = this.terrain.geometry.attributes.position;
        const terrainSize = 100;
        const segments = Math.sqrt(positions.count) - 1;

        // Convert world position to terrain grid position
        const gridX = ((worldX + terrainSize / 2) / terrainSize) * segments;
        const gridZ = ((worldZ + terrainSize / 2) / terrainSize) * segments;

        // Get the four surrounding vertices
        const x0 = Math.floor(gridX);
        const z0 = Math.floor(gridZ);
        const x1 = Math.min(x0 + 1, segments);
        const z1 = Math.min(z0 + 1, segments);

        // Bilinear interpolation
        const fx = gridX - x0;
        const fz = gridZ - z0;

        const getHeight = (gx, gz) => {
            const idx = gz * (segments + 1) + gx;
            return positions.getZ(idx);
        };

        const h00 = getHeight(x0, z0);
        const h10 = getHeight(x1, z0);
        const h01 = getHeight(x0, z1);
        const h11 = getHeight(x1, z1);

        const h0 = h00 * (1 - fx) + h10 * fx;
        const h1 = h01 * (1 - fx) + h11 * fx;

        return h0 * (1 - fz) + h1 * fz;
    }

    // Clear auto-generated grass
    clearAutoGrass() {
        const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'grass');
        toRemove.forEach(obj => {
            this.scene.remove(obj);
            const idx = this.levelObjects.indexOf(obj);
            if (idx > -1) this.levelObjects.splice(idx, 1);
        });
        console.log(`Cleared ${toRemove.length} auto-generated grass objects`);
        this.updateSceneTree();
        this.updateStatusBar();
    }

    autoPopulateTown(density = 0.02, clearExisting = false) {
        if (clearExisting) {
            this.clearAutoTown();
        }

        // Building asset options with weighted selection
        const buildingAssets = [
            // SMALL BUILDINGS - Most common
            { file: 'SM_Bld_Preset_Hut_01_Optimized.glb', weight: 3, size: 'small', category: 'residential' },
            { file: 'SM_Bld_Preset_Hut_02_Optimized.glb', weight: 3, size: 'small', category: 'residential' },
            { file: 'SM_Bld_Preset_Outhouse_01_Optimized.glb', weight: 2, size: 'small', category: 'utility' },
            { file: 'SM_Bld_Preset_Shelter_01_Optimized.glb', weight: 2, size: 'small', category: 'residential' },
            { file: 'SM_Bld_Preset_Shelter_02_Optimized.glb', weight: 2, size: 'small', category: 'residential' },

            // MEDIUM HOUSES - Common
            { file: 'SM_Bld_Preset_House_01_A_Optimized.glb', weight: 2, size: 'medium', category: 'residential' },
            { file: 'SM_Bld_Preset_House_02_A_Optimized.glb', weight: 2, size: 'medium', category: 'residential' },
            { file: 'SM_Bld_Preset_House_03_Optimized.glb', weight: 2, size: 'medium', category: 'residential' },
            { file: 'SM_Bld_Preset_House_04_Optimized.glb', weight: 2, size: 'medium', category: 'residential' },
            { file: 'SM_Bld_Preset_House_05_Optimized.glb', weight: 2, size: 'medium', category: 'residential' },
            { file: 'SM_Bld_Preset_House_06_Optimized.glb', weight: 2, size: 'medium', category: 'residential' },
            { file: 'SM_Bld_Preset_House_07_Optimized.glb', weight: 2, size: 'medium', category: 'residential' },
            { file: 'SM_Bld_Preset_House_08_Optimized.glb', weight: 2, size: 'medium', category: 'residential' },
            { file: 'SM_Bld_Preset_House_09_A_Optimized.glb', weight: 2, size: 'medium', category: 'residential' },
            { file: 'SM_Bld_Preset_House_09_B_Optimized.glb', weight: 2, size: 'medium', category: 'residential' },
            { file: 'SM_Bld_Preset_House_09_C_Optimized.glb', weight: 2, size: 'medium', category: 'residential' },

            // LARGE BUILDINGS - Less common
            { file: 'SM_Bld_Preset_House_10_Optimized.glb', weight: 1, size: 'large', category: 'residential' },
            { file: 'SM_Bld_Preset_Blacksmith_01_Optimized.glb', weight: 1, size: 'large', category: 'commercial' },
            { file: 'SM_Bld_Preset_Stables_01_Optimized.glb', weight: 1, size: 'large', category: 'commercial' },
            { file: 'SM_Bld_Preset_Tavern_01_Optimized.glb', weight: 1, size: 'large', category: 'commercial' },
            { file: 'SM_Bld_Preset_House_Windmill_01_Optimized.glb', weight: 0.5, size: 'large', category: 'commercial' },

            // SPECIAL/LANDMARK - Rare
            { file: 'SM_Bld_Preset_Church_01_A_Optimized.glb', weight: 0.3, size: 'xlarge', category: 'landmark' },
            { file: 'SM_Bld_Preset_Church_01_B_Optimized.glb', weight: 0.3, size: 'xlarge', category: 'landmark' },
            { file: 'SM_Bld_Preset_Tower_01_Optimized.glb', weight: 0.2, size: 'xlarge', category: 'landmark' },
        ];

        // Build weighted array for random selection
        const weightedAssets = [];
        buildingAssets.forEach(asset => {
            for (let i = 0; i < asset.weight * 10; i++) {
                weightedAssets.push(asset);
            }
        });

        // Get splatmap data
        const imageData = this.splatmapContext.getImageData(0, 0, 512, 512);
        const terrainSize = 100;
        const splatmapSize = 512;

        // Collect building positions
        const buildingPositions = [];

        // Structured town layout - rows along streets
        const streetSpacing = 15;  // Distance between parallel streets (scaled for 100x100)
        const buildingSpacing = 8;  // Distance between buildings along street (smaller for 100x100 chunks)
        const buildingSetback = 3;  // Distance from street edge
        const townRadius = 40;      // Radius of town from center (scaled for 100x100 chunks)

        // Get categorized buildings
        const residentialAssets = buildingAssets.filter(a => a.category === 'residential');
        const commercialAssets = buildingAssets.filter(a => a.category === 'commercial');
        const landmarkAssets = buildingAssets.filter(a => a.category === 'landmark');
        const smallHouses = residentialAssets.filter(a => a.size === 'small');
        const mediumHouses = residentialAssets.filter(a => a.size === 'medium');
        const largeHouses = residentialAssets.filter(a => a.size === 'large');
        const utilityBuildings = buildingAssets.filter(a => a.category === 'utility');

        // Windmill and stables for outskirts
        const windmill = buildingAssets.find(a => a.file.includes('Windmill'));
        const stables = buildingAssets.find(a => a.file.includes('Stables'));

        // Helper to check terrain flatness
        const isTerrainFlat = (x, z) => {
            const checkRadius = 5;
            const heightCenter = this.getTerrainHeightAt(x, z);
            const heightN = this.getTerrainHeightAt(x, z + checkRadius);
            const heightS = this.getTerrainHeightAt(x, z - checkRadius);
            const heightE = this.getTerrainHeightAt(x + checkRadius, z);
            const heightW = this.getTerrainHeightAt(x - checkRadius, z);
            const maxHeightDiff = Math.max(
                Math.abs(heightN - heightCenter),
                Math.abs(heightS - heightCenter),
                Math.abs(heightE - heightCenter),
                Math.abs(heightW - heightCenter)
            );
            return maxHeightDiff < 3.0; // Tolerance for slopes
        };

        // PHASE 1: Place landmark in town square (center)
        if (landmarkAssets.length > 0) {
            const landmark = landmarkAssets[Math.floor(Math.random() * landmarkAssets.length)];
            const x = 0;
            const z = 0;
            if (isTerrainFlat(x, z)) {
                buildingPositions.push({
                    x: x,
                    y: this.getTerrainHeightAt(x, z),
                    z: z,
                    rotation: 0,
                    scale: 1.0,
                    file: landmark.file,
                    size: landmark.size,
                    category: landmark.category
                });
            }
        }

        // PHASE 2: Place commercial ring around town square
        const commercialRingRadius = 15; // Scaled for 100x100 chunks
        const commercialPositions = [
            { x: commercialRingRadius, z: 0, rot: -Math.PI/2 },      // East
            { x: -commercialRingRadius, z: 0, rot: Math.PI/2 },      // West
            { x: 0, z: commercialRingRadius, rot: Math.PI },         // South
            { x: 0, z: -commercialRingRadius, rot: 0 },              // North
            { x: commercialRingRadius * 0.7, z: commercialRingRadius * 0.7, rot: -Math.PI*0.75 },   // SE
            { x: -commercialRingRadius * 0.7, z: commercialRingRadius * 0.7, rot: Math.PI*0.75 },   // SW
            { x: commercialRingRadius * 0.7, z: -commercialRingRadius * 0.7, rot: -Math.PI*0.25 },  // NE
            { x: -commercialRingRadius * 0.7, z: -commercialRingRadius * 0.7, rot: Math.PI*0.25 },  // NW
        ];

        commercialPositions.forEach(pos => {
            if (commercialAssets.length === 0) return;
            const asset = commercialAssets[Math.floor(Math.random() * commercialAssets.length)];
            if (isTerrainFlat(pos.x, pos.z)) {
                buildingPositions.push({
                    x: pos.x,
                    y: this.getTerrainHeightAt(pos.x, pos.z),
                    z: pos.z,
                    rotation: pos.rot,
                    scale: 1.0,
                    file: asset.file,
                    size: asset.size,
                    category: asset.category
                });
            }
        });

        // PHASE 3: Place windmills and stables on outskirts
        const outskirtPositions = [
            { x: townRadius * 0.9, z: townRadius * 0.6, rot: -Math.PI * 0.6 },
            { x: -townRadius * 0.9, z: townRadius * 0.6, rot: Math.PI * 0.6 },
            { x: townRadius * 0.9, z: -townRadius * 0.6, rot: -Math.PI * 0.3 },
            { x: -townRadius * 0.9, z: -townRadius * 0.6, rot: Math.PI * 0.3 },
        ];

        outskirtPositions.forEach((pos, i) => {
            const asset = i % 2 === 0 && windmill ? windmill : (stables || commercialAssets[0]);
            if (asset && isTerrainFlat(pos.x, pos.z)) {
                buildingPositions.push({
                    x: pos.x,
                    y: this.getTerrainHeightAt(pos.x, pos.z),
                    z: pos.z,
                    rotation: pos.rot,
                    scale: 1.0,
                    file: asset.file,
                    size: asset.size,
                    category: asset.category
                });
            }
        });

        // PHASE 4: Create residential streets with improved variety
        let streetIndex = 0;

        // North-South streets
        for (let streetX = -townRadius; streetX <= townRadius; streetX += streetSpacing) {
            if (Math.abs(streetX) < 30) continue; // Skip center (commercial zone)

            const distFromCenter = Math.abs(streetX);
            const densityMultiplier = 1 - (distFromCenter / townRadius) * 0.4; // Denser near center

            // Determine neighborhood "style" for this street
            const neighborhoodStyle = Math.floor(Math.random() * 3); // 0=poor, 1=middle, 2=wealthy

            // Buildings on both sides of street
            for (let side = -1; side <= 1; side += 2) {
                const buildingSide = streetX + (buildingSetback * side);
                let consecutiveBuildings = 0;

                // Place buildings along this street
                for (let z = -townRadius; z < townRadius; z += buildingSpacing) {
                    // Variable density based on distance from center
                    const skipChance = 1 - (0.75 * densityMultiplier);
                    if (Math.random() > skipChance) {
                        consecutiveBuildings = 0;
                        continue;
                    }

                    consecutiveBuildings++;

                    // Select building based on neighborhood and position
                    let asset;
                    const isCornerLot = Math.abs(z) > townRadius * 0.8;

                    if (isCornerLot && largeHouses.length > 0 && Math.random() > 0.5) {
                        // Large estates on corners
                        asset = largeHouses[Math.floor(Math.random() * largeHouses.length)];
                    } else if (neighborhoodStyle === 2 && mediumHouses.length > 0) {
                        // Wealthy: mostly medium houses
                        asset = Math.random() > 0.3 ?
                            mediumHouses[Math.floor(Math.random() * mediumHouses.length)] :
                            smallHouses[Math.floor(Math.random() * smallHouses.length)];
                    } else if (neighborhoodStyle === 1 && mediumHouses.length > 0) {
                        // Middle class: mix of small and medium
                        asset = Math.random() > 0.5 ?
                            mediumHouses[Math.floor(Math.random() * mediumHouses.length)] :
                            smallHouses[Math.floor(Math.random() * smallHouses.length)];
                    } else {
                        // Poor: mostly small
                        asset = smallHouses[Math.floor(Math.random() * smallHouses.length)];
                    }

                    const rotation = side > 0 ? -Math.PI/2 : Math.PI/2;

                    // Varied offset - less offset for wealthy, more for poor
                    const offsetRange = neighborhoodStyle === 2 ? 2 : (neighborhoodStyle === 1 ? 3 : 4);
                    const xOffset = (Math.random() - 0.5) * offsetRange;
                    const zOffset = (Math.random() - 0.5) * offsetRange;
                    const x = buildingSide + xOffset;
                    const zPos = z + zOffset;

                    if (isTerrainFlat(x, zPos)) {
                        buildingPositions.push({
                            x: x,
                            y: this.getTerrainHeightAt(x, zPos),
                            z: zPos,
                            rotation: rotation,
                            scale: 0.95 + Math.random() * 0.1,
                            file: asset.file,
                            size: asset.size,
                            category: asset.category
                        });

                        // Occasionally add utility building behind house
                        if (consecutiveBuildings > 2 && utilityBuildings.length > 0 && Math.random() > 0.7) {
                            const utilAsset = utilityBuildings[Math.floor(Math.random() * utilityBuildings.length)];
                            const behindX = x + (side * -7); // Behind the house
                            const behindZ = zPos + (Math.random() - 0.5) * 4;

                            if (isTerrainFlat(behindX, behindZ)) {
                                buildingPositions.push({
                                    x: behindX,
                                    y: this.getTerrainHeightAt(behindX, behindZ),
                                    z: behindZ,
                                    rotation: rotation,
                                    scale: 1.0,
                                    file: utilAsset.file,
                                    size: utilAsset.size,
                                    category: utilAsset.category
                                });
                            }
                        }
                    }
                }
            }
            streetIndex++;
        }

        // East-West streets with same improvements
        for (let streetZ = -townRadius; streetZ <= townRadius; streetZ += streetSpacing) {
            if (Math.abs(streetZ) < 30) continue;

            const distFromCenter = Math.abs(streetZ);
            const densityMultiplier = 1 - (distFromCenter / townRadius) * 0.4;
            const neighborhoodStyle = Math.floor(Math.random() * 3);

            for (let side = -1; side <= 1; side += 2) {
                const buildingSide = streetZ + (buildingSetback * side);
                let consecutiveBuildings = 0;

                for (let x = -townRadius; x < townRadius; x += buildingSpacing) {
                    if (Math.abs(x) > townRadius - streetSpacing) continue;

                    const skipChance = 1 - (0.75 * densityMultiplier);
                    if (Math.random() > skipChance) {
                        consecutiveBuildings = 0;
                        continue;
                    }

                    consecutiveBuildings++;

                    let asset;
                    const isCornerLot = Math.abs(x) > townRadius * 0.8;

                    if (isCornerLot && largeHouses.length > 0 && Math.random() > 0.5) {
                        asset = largeHouses[Math.floor(Math.random() * largeHouses.length)];
                    } else if (neighborhoodStyle === 2 && mediumHouses.length > 0) {
                        asset = Math.random() > 0.3 ?
                            mediumHouses[Math.floor(Math.random() * mediumHouses.length)] :
                            smallHouses[Math.floor(Math.random() * smallHouses.length)];
                    } else if (neighborhoodStyle === 1 && mediumHouses.length > 0) {
                        asset = Math.random() > 0.5 ?
                            mediumHouses[Math.floor(Math.random() * mediumHouses.length)] :
                            smallHouses[Math.floor(Math.random() * smallHouses.length)];
                    } else {
                        asset = smallHouses[Math.floor(Math.random() * smallHouses.length)];
                    }

                    const rotation = side > 0 ? Math.PI : 0;
                    const offsetRange = neighborhoodStyle === 2 ? 2 : (neighborhoodStyle === 1 ? 3 : 4);
                    const xOffset = (Math.random() - 0.5) * offsetRange;
                    const zOffset = (Math.random() - 0.5) * offsetRange;
                    const xPos = x + xOffset;
                    const z = buildingSide + zOffset;

                    if (isTerrainFlat(xPos, z)) {
                        buildingPositions.push({
                            x: xPos,
                            y: this.getTerrainHeightAt(xPos, z),
                            z: z,
                            rotation: rotation,
                            scale: 0.95 + Math.random() * 0.1,
                            file: asset.file,
                            size: asset.size,
                            category: asset.category
                        });

                        // Utility buildings behind houses
                        if (consecutiveBuildings > 2 && utilityBuildings.length > 0 && Math.random() > 0.7) {
                            const utilAsset = utilityBuildings[Math.floor(Math.random() * utilityBuildings.length)];
                            const behindX = xPos + (Math.random() - 0.5) * 4;
                            const behindZ = z + (side * -7);

                            if (isTerrainFlat(behindX, behindZ)) {
                                buildingPositions.push({
                                    x: behindX,
                                    y: this.getTerrainHeightAt(behindX, behindZ),
                                    z: behindZ,
                                    rotation: rotation,
                                    scale: 1.0,
                                    file: utilAsset.file,
                                    size: utilAsset.size,
                                    category: utilAsset.category
                                });
                            }
                        }
                    }
                }
            }
        }

        console.log(`Placing ${buildingPositions.length} buildings...`);

        // Group positions by file
        const positionsByFile = {};
        buildingPositions.forEach(pos => {
            if (!positionsByFile[pos.file]) {
                positionsByFile[pos.file] = [];
            }
            positionsByFile[pos.file].push(pos);
        });

        const uniqueFiles = Object.keys(positionsByFile);
        let totalPlaced = 0;

        // Load building models sequentially
        const loadNextBuildingModel = (index) => {
            if (index >= uniqueFiles.length) {
                console.log(`✅ Auto-populated ${totalPlaced} buildings using ${uniqueFiles.length} unique models`);
                this.updateSceneTree();
                this.updateStatusBar();
                return;
            }

            const filename = uniqueFiles[index];
            const path = `/assets/buildings/${filename}`;

            this.gltfLoader.load(
                path,
                (gltf) => {
                    const baseModel = gltf.scene;
                    baseModel.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    const positions = positionsByFile[filename];
                    console.log(`Loading ${positions.length} instances of ${filename} in batches...`);

                    // Process in batches
                    const batchSize = 20;
                    let batchIndex = 0;

                    const processBatch = () => {
                        const start = batchIndex * batchSize;
                        const end = Math.min(start + batchSize, positions.length);

                        for (let idx = start; idx < end; idx++) {
                            const pos = positions[idx];
                            const buildingObj = baseModel.clone();

                            // Share geometry and materials
                            buildingObj.traverse((child) => {
                                if (child.isMesh && baseModel) {
                                    baseModel.traverse((baseChild) => {
                                        if (baseChild.isMesh && baseChild.name === child.name) {
                                            child.geometry = baseChild.geometry;
                                            child.material = baseChild.material;
                                        }
                                    });
                                }
                            });

                            buildingObj.position.set(pos.x, pos.y, pos.z);
                            buildingObj.rotation.y = pos.rotation;
                            buildingObj.scale.set(pos.scale, pos.scale, pos.scale);

                            buildingObj.userData = {
                                type: 'buildings',
                                file: filename,
                                name: `Building_${totalPlaced}`,
                                autoGenerated: 'buildings',
                                category: pos.category
                            };

                            this.scene.add(buildingObj);
                            this.levelObjects.push(buildingObj);
                            totalPlaced++;
                        }

                        batchIndex++;

                        if (batchIndex * batchSize < positions.length) {
                            setTimeout(processBatch, 15);
                        } else {
                            console.log(`✅ Placed ${end} instances of ${filename}`);
                            loadNextBuildingModel(index + 1);
                        }
                    };

                    processBatch();
                },
                undefined,
                (error) => {
                    console.warn('Could not load building model:', filename, error);
                    loadNextBuildingModel(index + 1);
                }
            );
        };

        loadNextBuildingModel(0);
    }

    clearAutoTown() {
        const toRemove = this.levelObjects.filter(obj => obj.userData?.autoGenerated === 'buildings');
        toRemove.forEach(obj => {
            this.scene.remove(obj);
            const idx = this.levelObjects.indexOf(obj);
            if (idx > -1) this.levelObjects.splice(idx, 1);
        });
        console.log(`Removed ${toRemove.length} auto-generated buildings`);
        this.updateSceneTree();
        this.updateStatusBar();
    }

    // Animation loop
    animate() {
        requestAnimationFrame(() => this.animate());

        const time = performance.now();
        const delta = (time - this.prevTime) / 1000;
        this.prevTime = time;

        if (this.isPlayMode) {
            this.updatePlayMode(delta);
            this.renderer.render(this.scene, this.playerCamera);
        } else {
            this.orbitControls.update();
            this.renderer.render(this.scene, this.camera);
        }
    }
}

// Start the editor
new LevelEditor();
