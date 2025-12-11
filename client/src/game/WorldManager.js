import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class WorldManager {
    constructor(scene) {
        this.scene = scene;
        this.terrain = null;
        this.props = [];
        this.gltfLoader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();

        // Culling settings
        this.cullDistance = 150; // Reduced from 200 - objects beyond this distance are hidden
        this.frustum = new THREE.Frustum();
        this.cameraViewProjectionMatrix = new THREE.Matrix4();
        this.cullingFrameCounter = 0;
        this.cullingUpdateInterval = 5; // Increased from 3 - update culling less often

        // Cache for terrain textures and materials (shared across chunks)
        this.terrainTexturesCache = null;
        this.splatmapMaterialCache = new Map(); // Cache materials per splatmap

        // Chunk streaming
        this.worldData = null; // Store full world data
        this.loadedChunks = new Map(); // Currently loaded chunks
        this.chunkLoadDistance = 1; // Load chunks within this distance (1 = 3x3 grid)
        this.lastPlayerChunk = { x: 0, z: 0 };
    }

    async generateWorld() {
        // Try to load custom level first, fallback to test level
        const levelLoaded = await this.loadLevel('/levels/level.world.json');

        if (!levelLoaded) {
            console.log('No custom level found, generating test level');
            this.createGround();
            this.createTestEnvironment();
        }
    }

    async loadLevel(levelPath) {
        try {
            const response = await fetch(levelPath);
            if (!response.ok) return false;

            const levelData = await response.json();
            console.log('Loading level:', levelData);

            // Store world data
            this.worldData = levelData.chunks;

            const chunkKeys = Object.keys(this.worldData);
            if (chunkKeys.length === 0) return false;

            console.log(`📦 World has ${chunkKeys.length} chunks total`);
            console.log(`⏳ Preloading ALL chunks (this may take a while)...`);

            // Preload ALL chunks one at a time
            let loaded = 0;
            for (const chunkKey of chunkKeys) {
                await this.loadChunk(chunkKey);
                loaded++;
                console.log(`📦 Loaded chunk ${loaded}/${chunkKeys.length}: ${chunkKey}`);

                // Longer delay between chunks to prevent shader compilation issues
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            console.log(`✅ All ${chunkKeys.length} chunks loaded!`);
            return true;
        } catch (error) {
            console.warn('Could not load level:', error);
            return false;
        }
    }

    async updateLoadedChunks(playerX, playerZ) {
        // Calculate which chunk the player is in
        const chunkSize = 100;
        const playerChunkX = Math.floor(playerX / chunkSize);
        const playerChunkZ = Math.floor(playerZ / chunkSize);

        // Only update if player moved to a new chunk (but allow first load)
        if (playerChunkX === this.lastPlayerChunk.x &&
            playerChunkZ === this.lastPlayerChunk.z &&
            this.loadedChunks.size > 0) {
            return;
        }

        this.lastPlayerChunk = { x: playerChunkX, z: playerChunkZ };
        console.log(`🚶 Player ${this.loadedChunks.size === 0 ? 'spawning at' : 'moved to'} chunk (${playerChunkX}, ${playerChunkZ})`);

        // Determine which chunks should be loaded
        const chunksToLoad = new Set();
        for (let dx = -this.chunkLoadDistance; dx <= this.chunkLoadDistance; dx++) {
            for (let dz = -this.chunkLoadDistance; dz <= this.chunkLoadDistance; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const key = `${chunkX},${chunkZ}`;
                if (this.worldData[key]) {
                    chunksToLoad.add(key);
                }
            }
        }

        // Unload chunks that are too far
        for (const [key, chunkData] of this.loadedChunks) {
            if (!chunksToLoad.has(key)) {
                console.log(`📤 Unloading chunk ${key}`);
                this.unloadChunk(key, chunkData);
                this.loadedChunks.delete(key);
            }
        }

        // Load new chunks
        for (const key of chunksToLoad) {
            if (!this.loadedChunks.has(key)) {
                console.log(`📥 Loading chunk ${key}`);
                await this.loadChunk(key);
                await new Promise(resolve => setTimeout(resolve, 100)); // Delay between chunks
            }
        }

        console.log(`✅ Active chunks: ${this.loadedChunks.size}`);
    }

    async loadChunk(chunkKey) {
        const chunk = this.worldData[chunkKey];
        if (!chunk) return;

        const chunkData = {
            terrain: null,
            objects: []
        };

        // Create terrain
        const terrain = await this.createTerrainFromData(chunk.terrain, chunk.splatmap, chunkKey);
        chunkData.terrain = terrain;

        // Load objects
        if (chunk.objects && chunk.objects.length > 0) {
            await this.loadObjects(chunk.objects, chunkKey);
            // Store object references for unloading later
            const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
            const chunkSize = 100;
            chunkData.objects = this.props.filter(obj => {
                const inX = obj.position.x >= chunkX * chunkSize && obj.position.x < (chunkX + 1) * chunkSize;
                const inZ = obj.position.z >= chunkZ * chunkSize && obj.position.z < (chunkZ + 1) * chunkSize;
                return inX && inZ;
            });
        }

        this.loadedChunks.set(chunkKey, chunkData);
    }

    unloadChunk(chunkKey, chunkData) {
        // Remove terrain
        if (chunkData.terrain) {
            this.scene.remove(chunkData.terrain);
            chunkData.terrain.geometry.dispose();
            chunkData.terrain.material.dispose();
        }

        // Remove objects
        chunkData.objects.forEach(obj => {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
            const index = this.props.indexOf(obj);
            if (index > -1) this.props.splice(index, 1);
        });
    }

    async createTerrainFromData(terrainData, splatmapDataURL, chunkKey = '0,0') {
        const terrainSize = 100; // Match editor terrain size
        const segments = 100; // Match editor segments

        const groundGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);

        // Apply saved heights
        if (terrainData && terrainData.heights) {
            const positions = groundGeometry.attributes.position;
            for (let i = 0; i < positions.count && i < terrainData.heights.length; i++) {
                positions.setZ(i, terrainData.heights[i]);
            }
            positions.needsUpdate = true;
            groundGeometry.computeVertexNormals();
        }

        // Use simple material WITHOUT custom shaders to prevent WebGL crashes
        // Splatmap rendering disabled for performance/stability
        let groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a7c4e, // Grass green
            roughness: 0.8,
            metalness: 0.2
        });

        // If we have cached grass texture, use it (no splatmap blending)
        if (this.terrainTexturesCache && this.terrainTexturesCache.grassTexture) {
            groundMaterial.map = this.terrainTexturesCache.grassTexture;
        }

        const chunkMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        chunkMesh.rotation.x = -Math.PI / 2;
        chunkMesh.receiveShadow = false; // Disabled - multiple terrain chunks cause shadow issues
        chunkMesh.castShadow = false;

        // Parse chunk coordinates from key (e.g., "0,0" -> x=0, z=0)
        const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
        chunkMesh.position.x = chunkX * terrainSize;
        chunkMesh.position.z = chunkZ * terrainSize;

        this.scene.add(chunkMesh);

        // Store first chunk as main terrain for collision
        if (!this.terrain) {
            this.terrain = chunkMesh;

            // Add grid helper only for first chunk
            const gridHelper = new THREE.GridHelper(terrainSize, 40, 0x000000, 0x000000);
            gridHelper.material.opacity = 0.1;
            gridHelper.material.transparent = true;
            gridHelper.position.x = chunkX * terrainSize;
            gridHelper.position.z = chunkZ * terrainSize;
            this.scene.add(gridHelper);
        }

        return chunkMesh; // Return terrain mesh for chunk streaming
    }

    async createSplatmapMaterial(splatmapDataURL) {
        // Don't cache splatmap materials - each chunk needs its own
        // to avoid shader compilation issues
        console.log('📦 Creating new splatmap material for chunk...');

        // Load terrain textures once and cache them
        if (!this.terrainTexturesCache) {
            console.log('📦 Loading terrain textures (first time only)...');
            const loadTexture = (path, maxSize = 1024) => {
                const tex = this.textureLoader.load(path, (texture) => {
                    // Generate mipmaps and limit resolution for performance
                    texture.generateMipmaps = true;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                });
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(20, 20);
                return tex;
            };

            this.terrainTexturesCache = {
                // Only load diffuse textures to save VRAM
                grassTexture: loadTexture('/assets/textures/ground/Grass_cxbrutihf_4k_Diffuse.jpg', 2048),
                mudTexture: loadTexture('/assets/textures/ground/PFK_Texture_Ground_Mud_01.png', 1024),
                sandTexture: loadTexture('/assets/textures/ground/PFK_Texture_Ground_Sand_01.png', 1024),
                // Disable normal/roughness/AO maps to save VRAM
                grassNormal: null,
                grassRoughness: null,
                grassAO: null
            };
        }

        // Use cached textures
        const { grassTexture, mudTexture, sandTexture, grassNormal, grassRoughness, grassAO } = this.terrainTexturesCache;

        // Load splatmap from data URL
        const splatmapTexture = await new Promise((resolve) => {
            const loader = new THREE.TextureLoader();
            loader.load(splatmapDataURL, (texture) => {
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                resolve(texture);
            });
        });

        // Create material with custom shader for splatmap blending
        // Only use maps that are loaded (not null) to save VRAM
        const materialOptions = {
            color: 0xffffff,
            map: grassTexture,
            roughness: 0.8,
            metalness: 0.0
        };

        // Only add optional maps if they exist
        if (grassNormal) materialOptions.normalMap = grassNormal;
        if (grassRoughness) materialOptions.roughnessMap = grassRoughness;
        if (grassAO) materialOptions.aoMap = grassAO;

        const material = new THREE.MeshStandardMaterial(materialOptions);

        material.onBeforeCompile = (shader) => {
            // Add custom uniforms
            shader.uniforms.splatmap = { value: splatmapTexture };
            shader.uniforms.texture0 = { value: grassTexture };
            shader.uniforms.texture1 = { value: mudTexture };
            shader.uniforms.texture2 = { value: sandTexture };
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
        };

        console.log('✅ Created new splatmap material');

        return material;
    }

    async loadObjects(objects, chunkKey = '0,0') {
        console.log('Loading objects from level...');

        // Parse chunk offset
        const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
        const terrainSize = 100;
        const chunkOffsetX = chunkX * terrainSize;
        const chunkOffsetZ = chunkZ * terrainSize;

        // Group objects by file to load each model only once
        const objectsByFile = {};
        objects.forEach(obj => {
            if (!obj.file) return;
            if (!objectsByFile[obj.file]) {
                objectsByFile[obj.file] = [];
            }
            objectsByFile[obj.file].push(obj);
        });

        // Load models in batches to prevent overwhelming the GPU
        const entries = Object.entries(objectsByFile);
        const batchSize = 5; // Load 5 different models at a time

        for (let i = 0; i < entries.length; i += batchSize) {
            const batch = entries.slice(i, i + batchSize);
            const batchPromises = batch.map(([filename, objectList]) =>
                this.loadModelAndInstances(filename, objectList, chunkOffsetX, chunkOffsetZ)
            );

            await Promise.all(batchPromises);
            console.log(`Loaded ${Math.min(i + batchSize, entries.length)}/${entries.length} model types...`);

            // Small delay between batches
            if (i + batchSize < entries.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        console.log(`✅ Loaded ${objects.length} objects into the scene`);
        console.log(`⚠️ Performance: ${this.props.length} total objects being rendered`);
    }

    async loadModelAndInstances(filename, objectList, chunkOffsetX = 0, chunkOffsetZ = 0) {
        return new Promise((resolve, reject) => {
            // Limit grass instances to prevent WebGL crashes
            const isGrass = filename.includes('Grass') || filename.includes('Crop');
            const maxGrassInstances = 200;

            if (isGrass && objectList.length > maxGrassInstances) {
                console.log(`⚠️ Limiting ${filename} from ${objectList.length} to ${maxGrassInstances} instances`);
                objectList = objectList.slice(0, maxGrassInstances);
            }

            // Determine the path based on the type
            let basePath = '/assets/nature/';

            // Check Grass first (before Bush) since "Grass_Bush" contains both
            if (filename.includes('Grass') || filename.includes('Crop')) {
                basePath += 'grass/';
            } else if (filename.includes('Tree') || filename.includes('Bush')) {
                basePath += 'trees/';
            } else if (filename.includes('Rock')) {
                basePath += 'rocks/';
            } else if (filename.includes('Flower') || filename.includes('Lillies') || filename.includes('Rapeseed') || filename.includes('Sunflower') || filename.includes('Wildflowers')) {
                basePath += 'flowers/';
            } else if (filename.includes('Bld') || filename.includes('House')) {
                basePath = '/assets/buildings/';
            } else {
                basePath += 'props/';
            }

            const path = basePath + filename;

            // Use instancing for ALL objects with multiple instances (not just grass/flowers)
            const shouldUseInstancing = objectList.length > 1;

            this.gltfLoader.load(
                path,
                (gltf) => {
                    const baseModel = gltf.scene;
                    const isLargeGrass = filename.includes('_Large_');

                    // Setup shadows on base model
                    baseModel.traverse(child => {
                        if (child.isMesh) {
                            // Disable shadows for large grass for performance
                            if (isLargeGrass) {
                                child.castShadow = false;
                                child.receiveShadow = false;
                            } else {
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        }
                    });

                    if (shouldUseInstancing) {
                        // Use GPU instancing for performance
                        console.log(`🚀 Using GPU instancing for ${objectList.length}x ${filename}`);

                        baseModel.traverse(child => {
                            if (child.isMesh) {
                                const instancedMesh = new THREE.InstancedMesh(
                                    child.geometry,
                                    child.material,
                                    objectList.length
                                );

                                // Disable shadows on all instanced objects for performance
                                instancedMesh.castShadow = false;
                                instancedMesh.receiveShadow = false;

                                const matrix = new THREE.Matrix4();
                                const position = new THREE.Vector3();
                                const rotation = new THREE.Euler();
                                const quaternion = new THREE.Quaternion();
                                const scale = new THREE.Vector3();

                                objectList.forEach((objData, i) => {
                                    position.set(
                                        objData.position.x + chunkOffsetX,
                                        objData.position.y,
                                        objData.position.z + chunkOffsetZ
                                    );
                                    rotation.set(
                                        objData.rotation?.x || 0,
                                        objData.rotation?.y || 0,
                                        objData.rotation?.z || 0
                                    );
                                    quaternion.setFromEuler(rotation);
                                    scale.set(
                                        objData.scale?.x || 1,
                                        objData.scale?.y || 1,
                                        objData.scale?.z || 1
                                    );

                                    matrix.compose(position, quaternion, scale);
                                    instancedMesh.setMatrixAt(i, matrix);
                                });

                                instancedMesh.instanceMatrix.needsUpdate = true;
                                this.scene.add(instancedMesh);
                                this.props.push(instancedMesh);
                            }
                        });
                    } else {
                        // Clone for each instance (for unique objects only)
                        objectList.forEach(objData => {
                            const instance = baseModel.clone();

                            // Share geometry and materials to save memory
                            instance.traverse((child) => {
                                if (child.isMesh && baseModel) {
                                    // Find corresponding mesh in base model
                                    baseModel.traverse((baseChild) => {
                                        if (baseChild.isMesh && baseChild.name === child.name) {
                                            child.geometry = baseChild.geometry; // Share geometry
                                            child.material = baseChild.material; // Share material
                                            // Disable shadows for performance
                                            child.castShadow = false;
                                            child.receiveShadow = false;
                                        }
                                    });
                                }
                            });

                            // Apply transform with chunk offset
                            instance.position.set(
                                objData.position.x + chunkOffsetX,
                                objData.position.y,
                                objData.position.z + chunkOffsetZ
                            );
                            instance.rotation.set(
                                objData.rotation.x,
                                objData.rotation.y,
                                objData.rotation.z
                            );
                            instance.scale.set(
                                objData.scale.x,
                                objData.scale.y,
                                objData.scale.z
                            );

                            this.scene.add(instance);
                            this.props.push(instance);
                        });
                    }

                    resolve();
                },
                undefined,
                (error) => {
                    console.warn(`Could not load ${filename}:`, error);
                    resolve(); // Resolve anyway to not block other loads
                }
            );
        });
    }

    createGround() {
        // Create a large ground plane
        const groundGeometry = new THREE.PlaneGeometry(100, 100, 50, 50);

        // Add some simple vertex displacement for terrain variation
        const vertices = groundGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            vertices[i + 2] = Math.random() * 2; // Random height variation (increased for testing)
        }
        groundGeometry.attributes.position.needsUpdate = true;
        groundGeometry.computeVertexNormals();

        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a7c4e,
            roughness: 0.8,
            metalness: 0.2
        });

        this.terrain = new THREE.Mesh(groundGeometry, groundMaterial);
        this.terrain.rotation.x = -Math.PI / 2;
        this.terrain.receiveShadow = true;
        this.scene.add(this.terrain);

        // Add grid helper for reference (can be removed later)
        const gridHelper = new THREE.GridHelper(200, 40, 0x000000, 0x000000);
        gridHelper.material.opacity = 0.1;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);
    }

    /**
     * Get the terrain height at a given world position using raycasting
     */
    getTerrainHeight(x, z) {
        // With multiple chunks, we need to check ALL loaded terrain chunks
        const terrainChunks = [];
        for (const [key, chunkData] of this.loadedChunks) {
            if (chunkData.terrain) {
                terrainChunks.push(chunkData.terrain);
            }
        }

        // Fallback to old single terrain if no chunks loaded
        if (terrainChunks.length === 0 && this.terrain) {
            terrainChunks.push(this.terrain);
        }

        if (terrainChunks.length === 0) return 0;

        // Create a raycaster pointing down from high above the position
        const raycaster = new THREE.Raycaster();
        const origin = new THREE.Vector3(x, 100, z);
        const direction = new THREE.Vector3(0, -1, 0);
        raycaster.set(origin, direction);

        // Check intersection with ALL terrain chunks
        const intersects = raycaster.intersectObjects(terrainChunks);

        if (intersects.length > 0) {
            return intersects[0].point.y;
        }

        return 0; // Default ground level
    }

    createTestEnvironment() {
        // Create some simple placeholder objects
        // These will be replaced with actual FBX models later

        // Trees (simple cylinders with cones)
        for (let i = 0; i < 20; i++) {
            const tree = this.createTree();
            tree.position.set(
                (Math.random() - 0.5) * 80,
                0,
                (Math.random() - 0.5) * 80
            );
            this.scene.add(tree);
            this.props.push(tree);
        }

        // Rocks (simple spheres)
        for (let i = 0; i < 15; i++) {
            const rock = this.createRock();
            rock.position.set(
                (Math.random() - 0.5) * 80,
                0.5,
                (Math.random() - 0.5) * 80
            );
            this.scene.add(rock);
            this.props.push(rock);
        }

        // Simple castle walls placeholder
        const castle = this.createSimpleCastle();
        castle.position.set(30, 0, -30);
        this.scene.add(castle);
        this.props.push(castle);
    }

    createTree() {
        const group = new THREE.Group();

        // Trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 4, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 2;
        trunk.castShadow = true;
        group.add(trunk);

        // Foliage
        const foliageGeometry = new THREE.ConeGeometry(2, 4, 8);
        const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5016 });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.y = 5;
        foliage.castShadow = true;
        group.add(foliage);

        return group;
    }

    createRock() {
        const geometry = new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.5);
        const material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.9
        });
        const rock = new THREE.Mesh(geometry, material);
        rock.castShadow = true;
        rock.receiveShadow = true;
        rock.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );
        return rock;
    }

    createSimpleCastle() {
        const group = new THREE.Group();

        // Castle walls
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x8b7355 });

        for (let i = 0; i < 4; i++) {
            const wall = new THREE.Mesh(
                new THREE.BoxGeometry(15, 8, 1),
                wallMaterial
            );
            wall.castShadow = true;
            wall.receiveShadow = true;

            const angle = (Math.PI / 2) * i;
            wall.position.x = Math.sin(angle) * 7;
            wall.position.z = Math.cos(angle) * 7;
            wall.position.y = 4;
            wall.rotation.y = angle;

            group.add(wall);
        }

        // Towers
        for (let i = 0; i < 4; i++) {
            const tower = new THREE.Mesh(
                new THREE.CylinderGeometry(1.5, 1.5, 10, 8),
                wallMaterial
            );
            tower.castShadow = true;
            tower.receiveShadow = true;

            const angle = (Math.PI / 2) * i + Math.PI / 4;
            tower.position.x = Math.sin(angle) * 7;
            tower.position.z = Math.cos(angle) * 7;
            tower.position.y = 5;

            // Tower roof
            const roof = new THREE.Mesh(
                new THREE.ConeGeometry(2, 2, 8),
                new THREE.MeshStandardMaterial({ color: 0x8b0000 })
            );
            roof.position.y = 11;
            tower.add(roof);

            group.add(tower);
        }

        return group;
    }

    /**
     * Update object visibility based on camera frustum and distance culling
     * Call this each frame for performance optimization
     */
    updateCulling(camera) {
        // Only update culling every N frames to reduce overhead
        this.cullingFrameCounter++;
        if (this.cullingFrameCounter < this.cullingUpdateInterval) {
            return;
        }
        this.cullingFrameCounter = 0;

        // Skip if no objects
        if (this.props.length === 0) return;

        const cameraPosition = camera.position;
        const cullDistSq = this.cullDistance * this.cullDistance; // Use squared distance to avoid sqrt

        // Simple distance-only culling (much faster than frustum)
        for (let i = 0; i < this.props.length; i++) {
            const prop = this.props[i];

            // Skip if no position
            if (!prop.position) {
                continue;
            }

            // Distance culling using squared distance (faster)
            const dx = prop.position.x - cameraPosition.x;
            const dy = prop.position.y - cameraPosition.y;
            const dz = prop.position.z - cameraPosition.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            prop.visible = distSq <= cullDistSq;
        }
    }
}
