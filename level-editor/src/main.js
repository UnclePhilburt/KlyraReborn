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

        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

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
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);

        // Directional light
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 50, 50);
        dirLight.castShadow = true;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // Hemisphere light
        const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x5d4e37, 0.3);
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
        // Create editable terrain
        const geometry = new THREE.PlaneGeometry(100, 100, 100, 100);
        const material = new THREE.MeshStandardMaterial({
            color: 0x4a7c4e,
            roughness: 0.8,
            metalness: 0.1,
            wireframe: false
        });

        this.terrain = new THREE.Mesh(geometry, material);
        this.terrain.rotation.x = -Math.PI / 2;
        this.terrain.receiveShadow = true;
        this.terrain.userData.isTerrain = true;
        this.scene.add(this.terrain);
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

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Toolbar buttons
        document.getElementById('btn-new').addEventListener('click', () => this.newLevel());
        document.getElementById('btn-open').addEventListener('click', () => this.openLevel());
        document.getElementById('btn-save').addEventListener('click', () => this.saveLevel());
        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.redo());
        document.getElementById('btn-select').addEventListener('click', () => this.setTool('select'));
        document.getElementById('btn-move').addEventListener('click', () => this.setTool('move'));
        document.getElementById('btn-rotate').addEventListener('click', () => this.setTool('rotate'));
        document.getElementById('btn-scale').addEventListener('click', () => this.setTool('scale'));
        document.getElementById('btn-snap').addEventListener('click', () => this.toggleSnap());
        document.getElementById('btn-grid').addEventListener('click', () => this.toggleGrid());
        document.getElementById('btn-play').addEventListener('click', () => this.testLevel());

        // Property inputs
        ['pos-x', 'pos-y', 'pos-z', 'rot-x', 'rot-y', 'rot-z', 'scale-x', 'scale-y', 'scale-z'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.onPropertyChange());
        });

        // Terrain tools
        document.querySelectorAll('.terrain-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.terrain-tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.terrainTool = btn.dataset.tool;
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

        // Keep reference for backward compatibility
        this.meadowTexture = this.textures.meadow;

        // Buildings (8 GLB assets)
        this.assetCategories.buildings.assets = [
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

        // Trees & Bushes (15 assets - 3 GLB + 12 FBX)
        this.assetCategories.trees.assets = [
            // GLB versions (embedded textures)
            { name: 'Bush 1 (GLB)', file: 'SM_Env_Bush_01.glb', path: 'nature/trees', icon: '🌿', type: 'glb' },
            { name: 'Bush 2 (GLB)', file: 'SM_Env_Bush_02.glb', path: 'nature/trees', icon: '🌿', type: 'glb' },
            { name: 'Bush 3 (GLB)', file: 'SM_Env_Bush_03.glb', path: 'nature/trees', icon: '🌿', type: 'glb' },
            // FBX versions
            { name: 'Bush 1', file: 'SM_Env_Bush_01.FBX', path: 'nature/trees', icon: '🌿', type: 'fbx' },
            { name: 'Bush 2', file: 'SM_Env_Bush_02.FBX', path: 'nature/trees', icon: '🌿', type: 'fbx' },
            { name: 'Bush 3', file: 'SM_Env_Bush_03.FBX', path: 'nature/trees', icon: '🌿', type: 'fbx' },
            // Trees
            { name: 'Birch Tree 1', file: 'SM_Env_Tree_Birch_01.FBX', path: 'nature/trees', icon: '🌳', type: 'fbx' },
            { name: 'Birch Tree 2', file: 'SM_Env_Tree_Birch_02.FBX', path: 'nature/trees', icon: '🌳', type: 'fbx' },
            { name: 'Birch Tree 3', file: 'SM_Env_Tree_Birch_03.FBX', path: 'nature/trees', icon: '🌳', type: 'fbx' },
            { name: 'Fruit Tree 1', file: 'SM_Env_Tree_Fruit_01.FBX', path: 'nature/trees', icon: '🍎', type: 'fbx' },
            { name: 'Fruit Tree 2', file: 'SM_Env_Tree_Fruit_02.FBX', path: 'nature/trees', icon: '🍎', type: 'fbx' },
            { name: 'Fruit Tree 3', file: 'SM_Env_Tree_Fruit_03.FBX', path: 'nature/trees', icon: '🍎', type: 'fbx' },
            { name: 'Fruit Tree Fruit', file: 'SM_Env_Tree_Fruit_Fruit_01.FBX', path: 'nature/trees', icon: '🍎', type: 'fbx' },
            { name: 'Meadow Tree 1', file: 'SM_Env_Tree_Meadow_01.FBX', path: 'nature/trees', icon: '🌲', type: 'fbx' },
            { name: 'Meadow Tree 2', file: 'SM_Env_Tree_Meadow_02.FBX', path: 'nature/trees', icon: '🌲', type: 'fbx' }
        ];

        // Rocks (22 assets - FBX)
        this.assetCategories.rocks.assets = [
            { name: 'Rock 1', file: 'SM_Env_Rock_01.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock 2', file: 'SM_Env_Rock_02.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock 3', file: 'SM_Env_Rock_03.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock 4', file: 'SM_Env_Rock_04.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock 5', file: 'SM_Env_Rock_05.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock 6', file: 'SM_Env_Rock_06.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Cliff 1', file: 'SM_Env_Rock_Cliff_01.FBX', path: 'nature/rocks', icon: '⛰️', type: 'fbx' },
            { name: 'Rock Cliff 2', file: 'SM_Env_Rock_Cliff_02.FBX', path: 'nature/rocks', icon: '⛰️', type: 'fbx' },
            { name: 'Rock Cliff 3', file: 'SM_Env_Rock_Cliff_03.FBX', path: 'nature/rocks', icon: '⛰️', type: 'fbx' },
            { name: 'Rock Ground 1', file: 'SM_Env_Rock_Ground_01.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Ground 2', file: 'SM_Env_Rock_Ground_02.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Pile 1', file: 'SM_Env_Rock_Pile_01.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Pile 2', file: 'SM_Env_Rock_Pile_02.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Pile 3', file: 'SM_Env_Rock_Pile_03.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Pile 4', file: 'SM_Env_Rock_Pile_04.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Pile 5', file: 'SM_Env_Rock_Pile_05.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Pile 6', file: 'SM_Env_Rock_Pile_06.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Pile 7', file: 'SM_Env_Rock_Pile_07.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Round', file: 'SM_Env_Rock_Round_01.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Small', file: 'SM_Env_Rock_Small_01.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Small Pile 1', file: 'SM_Env_Rock_Small_Pile_01.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' },
            { name: 'Rock Small Pile 2', file: 'SM_Env_Rock_Small_Pile_02.FBX', path: 'nature/rocks', icon: '🪨', type: 'fbx' }
        ];

        // Grass (29 assets - 8 GLB + 21 FBX)
        this.assetCategories.grass.assets = [
            // GLB versions (embedded textures)
            { name: 'Crop Field 1 (GLB)', file: 'SM_Env_CropField_Clump_01.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Bush (GLB)', file: 'SM_Env_Grass_Bush_01.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            { name: 'Grass Large 1 (GLB)', file: 'SM_Env_Grass_Large_01.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Large 2 (GLB)', file: 'SM_Env_Grass_Large_02.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Large 3 (GLB)', file: 'SM_Env_Grass_Large_03.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Large 4 (GLB)', file: 'SM_Env_Grass_Large_04.glb', path: 'nature/grass', icon: '🌾', type: 'glb' },
            { name: 'Grass Med 1 (GLB)', file: 'SM_Env_Grass_Med_Clump_01.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            { name: 'Grass Med 2 (GLB)', file: 'SM_Env_Grass_Med_Clump_02.glb', path: 'nature/grass', icon: '🌿', type: 'glb' },
            // FBX versions
            { name: 'Crop Field 1', file: 'SM_Env_CropField_Clump_01.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' },
            { name: 'Crop Field 2', file: 'SM_Env_CropField_Clump_02.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' },
            { name: 'Grass Bush', file: 'SM_Env_Grass_Bush_01.FBX', path: 'nature/grass', icon: '🌿', type: 'fbx' },
            { name: 'Grass Large 1', file: 'SM_Env_Grass_Large_01.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' },
            { name: 'Grass Large 2', file: 'SM_Env_Grass_Large_02.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' },
            { name: 'Grass Large 3', file: 'SM_Env_Grass_Large_03.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' },
            { name: 'Grass Large 4', file: 'SM_Env_Grass_Large_04.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' },
            { name: 'Grass Med 1', file: 'SM_Env_Grass_Med_Clump_01.FBX', path: 'nature/grass', icon: '🌿', type: 'fbx' },
            { name: 'Grass Med 2', file: 'SM_Env_Grass_Med_Clump_02.FBX', path: 'nature/grass', icon: '🌿', type: 'fbx' },
            { name: 'Grass Med 3', file: 'SM_Env_Grass_Med_Clump_03.FBX', path: 'nature/grass', icon: '🌿', type: 'fbx' },
            { name: 'Grass Med Plane', file: 'SM_Env_Grass_Med_Plane_01.FBX', path: 'nature/grass', icon: '🌿', type: 'fbx' },
            { name: 'Grass Short 1', file: 'SM_Env_Grass_Short_Clump_01.FBX', path: 'nature/grass', icon: '🌿', type: 'fbx' },
            { name: 'Grass Short 2', file: 'SM_Env_Grass_Short_Clump_02.FBX', path: 'nature/grass', icon: '🌿', type: 'fbx' },
            { name: 'Grass Short 3', file: 'SM_Env_Grass_Short_Clump_03.FBX', path: 'nature/grass', icon: '🌿', type: 'fbx' },
            { name: 'Grass Short Plane', file: 'SM_Env_Grass_Short_Plane_01.FBX', path: 'nature/grass', icon: '🌿', type: 'fbx' },
            { name: 'Grass Tall 1', file: 'SM_Env_Grass_Tall_Clump_01.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' },
            { name: 'Grass Tall 2', file: 'SM_Env_Grass_Tall_Clump_02.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' },
            { name: 'Grass Tall 3', file: 'SM_Env_Grass_Tall_Clump_03.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' },
            { name: 'Grass Tall 4', file: 'SM_Env_Grass_Tall_Clump_04.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' },
            { name: 'Grass Tall 5', file: 'SM_Env_Grass_Tall_Clump_05.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' },
            { name: 'Grass Tall Plane', file: 'SM_Env_Grass_Tall_Plane_01.FBX', path: 'nature/grass', icon: '🌾', type: 'fbx' }
        ];

        // Flowers (15 assets - FBX)
        this.assetCategories.flowers.assets = [
            { name: 'Flowers Flat 1', file: 'SM_Env_Flowers_Flat_01.FBX', path: 'nature/flowers', icon: '🌸', type: 'fbx' },
            { name: 'Flowers Flat 2', file: 'SM_Env_Flowers_Flat_02.FBX', path: 'nature/flowers', icon: '🌸', type: 'fbx' },
            { name: 'Flowers Flat 3', file: 'SM_Env_Flowers_Flat_03.FBX', path: 'nature/flowers', icon: '🌸', type: 'fbx' },
            { name: 'Lillies 1', file: 'SM_Env_Lillies_01.FBX', path: 'nature/flowers', icon: '🌷', type: 'fbx' },
            { name: 'Lillies 2', file: 'SM_Env_Lillies_02.FBX', path: 'nature/flowers', icon: '🌷', type: 'fbx' },
            { name: 'Lillies 3', file: 'SM_Env_Lillies_03.FBX', path: 'nature/flowers', icon: '🌷', type: 'fbx' },
            { name: 'Rapeseed 1', file: 'SM_Env_Rapeseed_Clump_01.FBX', path: 'nature/flowers', icon: '🌻', type: 'fbx' },
            { name: 'Rapeseed 2', file: 'SM_Env_Rapeseed_Clump_02.FBX', path: 'nature/flowers', icon: '🌻', type: 'fbx' },
            { name: 'Sunflower', file: 'SM_Env_Sunflower_01.FBX', path: 'nature/flowers', icon: '🌻', type: 'fbx' },
            { name: 'Wildflowers 1', file: 'SM_Env_Wildflowers_01.FBX', path: 'nature/flowers', icon: '🌼', type: 'fbx' },
            { name: 'Wildflowers 2', file: 'SM_Env_Wildflowers_02.FBX', path: 'nature/flowers', icon: '🌼', type: 'fbx' },
            { name: 'Wildflowers 3', file: 'SM_Env_Wildflowers_03.FBX', path: 'nature/flowers', icon: '🌼', type: 'fbx' },
            { name: 'Wildflowers Patch 1', file: 'SM_Env_Wildflowers_Patch_01.FBX', path: 'nature/flowers', icon: '🌺', type: 'fbx' },
            { name: 'Wildflowers Patch 2', file: 'SM_Env_Wildflowers_Patch_02.FBX', path: 'nature/flowers', icon: '🌺', type: 'fbx' },
            { name: 'Wildflowers Patch 3', file: 'SM_Env_Wildflowers_Patch_03.FBX', path: 'nature/flowers', icon: '🌺', type: 'fbx' }
        ];

        // Environment (12 assets - FBX)
        this.assetCategories.environment.assets = [
            { name: 'Background Hill', file: 'SM_Env_Background_Hill_01_SM_Env_Background_Hill_01.FBX', path: 'environment', icon: '⛰️', type: 'fbx' },
            { name: 'Cloud Ring', file: 'SM_Env_CloudRing_Larger_01.FBX', path: 'environment', icon: '☁️', type: 'fbx' },
            { name: 'Ground Cliff 1', file: 'SM_Env_Ground_Cliff_Large_01.FBX', path: 'environment', icon: '⛰️', type: 'fbx' },
            { name: 'Ground Cliff 2', file: 'SM_Env_Ground_Cliff_Large_02.FBX', path: 'environment', icon: '⛰️', type: 'fbx' },
            { name: 'Ground Cover 1', file: 'SM_Env_Ground_Cover_01.FBX', path: 'environment', icon: '🟫', type: 'fbx' },
            { name: 'Ground Cover 2', file: 'SM_Env_Ground_Cover_02.FBX', path: 'environment', icon: '🟫', type: 'fbx' },
            { name: 'Ground Cover 3', file: 'SM_Env_Ground_Cover_03.FBX', path: 'environment', icon: '🟫', type: 'fbx' },
            { name: 'Ground Mound 1', file: 'SM_Env_Ground_Mound_Large_01.FBX', path: 'environment', icon: '⛰️', type: 'fbx' },
            { name: 'Ground Mound 2', file: 'SM_Env_Ground_Mound_Large_02.FBX', path: 'environment', icon: '⛰️', type: 'fbx' },
            { name: 'Ground Mound 3', file: 'SM_Env_Ground_Mound_Large_03.FBX', path: 'environment', icon: '⛰️', type: 'fbx' },
            { name: 'Ground Mound 4', file: 'SM_Env_Ground_Mound_Large_04.FBX', path: 'environment', icon: '⛰️', type: 'fbx' },
            { name: 'Water Plane', file: 'SM_Env_Water_Plane_01.FBX', path: 'environment', icon: '💧', type: 'fbx' }
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

                        if (isGrass || isFlower) {
                            materialConfig = {
                                color: isFlower ? 0x88aa44 : 0x5d8a3e,
                                roughness: 0.9,
                                metalness: 0.0,
                                transparent: true,
                                opacity: 0.6,
                                side: THREE.DoubleSide
                            };
                        } else {
                            // Props - use meadow texture atlas
                            console.log('Applying meadow texture:', this.textures.meadow);
                            materialConfig = {
                                map: this.textures.meadow,
                                color: 0xccaa77, // Fallback tan color if texture fails
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
    }

    onMouseUp(e) {
        this.isMouseDown = false;
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
                            cloned.transparent = false;
                            cloned.opacity = 1.0;
                            return cloned;
                        });
                    } else {
                        child.material = child.material.clone();
                        child.material.side = THREE.DoubleSide;
                        child.material.transparent = false;
                        child.material.opacity = 1.0;
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

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);

            // Convert to world space
            const worldX = x;
            const worldZ = z;

            const distance = Math.sqrt(
                Math.pow(worldX - point.x, 2) + Math.pow(worldZ - point.z, 2)
            );

            if (distance < this.brushSize) {
                const influence = (1 - distance / this.brushSize) * this.brushStrength * 0.1;
                let y = positions.getY(i);

                switch (this.terrainTool) {
                    case 'raise':
                        y += influence;
                        break;
                    case 'lower':
                        y -= influence;
                        break;
                    case 'smooth':
                        // Average with neighbors (simplified)
                        y *= (1 - influence * 0.5);
                        break;
                    case 'flatten':
                        y = y * (1 - influence) + 0 * influence;
                        break;
                }

                positions.setY(i, y);
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
                    this.saveLevel();
                }
                break;
            case 'KeyD':
                if (e.ctrlKey && this.selectedObject) {
                    e.preventDefault();
                    this.duplicateSelected();
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
        const tree = document.getElementById('scene-tree');
        tree.innerHTML = '';

        this.levelObjects.forEach(obj => {
            const item = document.createElement('div');
            item.className = 'tree-item' + (obj === this.selectedObject ? ' selected' : '');
            item.innerHTML = `
                <span class="tree-icon">${this.getTypeIcon(obj.userData.type)}</span>
                <span>${obj.userData.assetName || 'Object'}</span>
            `;
            item.addEventListener('click', () => this.selectObject(obj));
            tree.appendChild(item);
        });
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
            heights.push(positions.getY(i));
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

        // Reset terrain
        const positions = this.terrain.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            positions.setY(i, 0);
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

        // Load terrain
        if (data.terrain && data.terrain.heights) {
            const positions = this.terrain.geometry.attributes.position;
            data.terrain.heights.forEach((h, i) => {
                if (i < positions.count) {
                    positions.setY(i, h);
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
                if (asset.file) {
                    this.loadGLBForObject(asset.file, obj);
                }
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
            file: objData.file
        };

        this.scene.add(obj);
        this.levelObjects.push(obj);
    }

    loadGLBForObject(filename, targetObj) {
        const path = `/assets/characters/${filename}`;
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

    testLevel() {
        // Save and open in game
        const data = this.serializeLevel();
        localStorage.setItem('testLevel', JSON.stringify(data));
        window.open('../client/index.html?level=test', '_blank');
    }

    // Animation loop
    animate() {
        requestAnimationFrame(() => this.animate());

        this.orbitControls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the editor
new LevelEditor();
