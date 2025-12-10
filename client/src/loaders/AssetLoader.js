import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class AssetLoader {
    constructor() {
        this.fbxLoader = new FBXLoader();
        this.gltfLoader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();
        this.loadedAssets = new Map();
        this.loadedTextures = new Map();
    }

    /**
     * Load a texture atlas
     */
    async loadTexture(path) {
        if (this.loadedTextures.has(path)) {
            console.log('✅ Using cached texture:', path);
            return this.loadedTextures.get(path);
        }

        return new Promise((resolve, reject) => {
            console.log('📥 Loading texture:', path);
            this.textureLoader.load(
                path,
                (texture) => {
                    console.log('✅ Texture loaded successfully:', path);
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.flipY = false; // FBX models don't need flipped textures
                    this.loadedTextures.set(path, texture);
                    resolve(texture);
                },
                undefined,
                (error) => {
                    console.error('❌ Error loading texture:', path, error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Load an FBX model
     */
    async loadFBX(path, texturePath = null) {
        const cacheKey = `${path}_${texturePath}`;

        // DISABLE CACHING FOR NOW - CAUSING SCALE ISSUES
        // if (this.loadedAssets.has(cacheKey)) {
        //     return this.loadedAssets.get(cacheKey).clone();
        // }

        return new Promise((resolve, reject) => {
            this.fbxLoader.load(
                path,
                async (fbx) => {
                    console.log('🎨 FBX loaded, applying textures...');

                    // Apply texture if provided
                    if (texturePath) {
                        try {
                            const texture = await this.loadTexture(texturePath);
                            this.applyTextureToModel(fbx, texture);
                            console.log('✅ Texture applied to model');
                        } catch (error) {
                            console.warn('⚠️ Could not load texture, using default material:', error);
                        }
                    } else {
                        console.log('⚠️ No texture path provided - using default colors');

                        // Apply basic colors to make it look better than gray
                        fbx.traverse((child) => {
                            if (child.isMesh && child.material) {
                                // Give it some basic color
                                const mat = new THREE.MeshStandardMaterial({
                                    color: 0xccaa88, // Skin tone color
                                    roughness: 0.8,
                                    metalness: 0.1
                                });
                                child.material = mat;
                            }
                        });
                    }

                    // Enable shadows
                    fbx.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    // DON'T CACHE - Return directly
                    // this.loadedAssets.set(cacheKey, fbx);
                    resolve(fbx);
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total) * 100;
                    console.log(`Loading ${path}: ${percent.toFixed(0)}%`);
                },
                (error) => {
                    console.error('Error loading FBX:', path, error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Apply texture atlas to model
     */
    applyTextureToModel(model, texture) {
        let meshCount = 0;

        model.traverse((child) => {
            if (child.isMesh) {
                meshCount++;
                console.log(`🎨 Applying texture to mesh #${meshCount}:`, child.name);

                // Apply texture to ALL meshes
                const newMaterial = new THREE.MeshStandardMaterial({
                    map: texture,
                    roughness: 0.8,
                    metalness: 0.2,
                    side: THREE.FrontSide
                });

                child.material = newMaterial;
                child.material.needsUpdate = true;

                console.log('   ✅ Texture applied');
            }
        });

        console.log(`📊 Total meshes textured: ${meshCount}`);
    }

    /**
     * Load a character model (GLB or FBX format with texture)
     */
    async loadCharacter(characterName) {
        const texturePath = `/assets/textures/PolygonFantasyKingdom_Texture_01_A.png`;

        // Try GLB first, fallback to FBX
        const glbPath = `/assets/characters/${characterName}.glb`;
        const fbxPath = `/assets/characters/${characterName}.fbx`;

        // Check if it's a known GLB character (like polygonesyntycharacter)
        const isGLB = characterName.toLowerCase().includes('polygon') || characterName.toLowerCase().includes('synty');

        if (isGLB) {
            return this.loadCharacterGLB(characterName, glbPath, texturePath);
        } else {
            return this.loadCharacterFBX(characterName, fbxPath, texturePath);
        }
    }

    /**
     * Load a character model in GLB format
     */
    async loadCharacterGLB(characterName, path, texturePath) {
        return new Promise((resolve, reject) => {
            console.log(`👤 Loading GLB character: ${characterName}`);

            this.gltfLoader.load(
                path,
                async (gltf) => {
                    console.log('✅ GLB character loaded successfully!');
                    const model = gltf.scene;

                    // Apply texture
                    try {
                        const texture = await this.loadTexture(texturePath);
                        this.applyTextureToModel(model, texture);
                        console.log('✅ Texture applied to character');
                    } catch (error) {
                        console.warn('⚠️ Could not load texture:', error);
                    }

                    // Enable shadows
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    // Log bone hierarchy
                    const boneNames = [];
                    model.traverse((child) => {
                        if (child.isBone) {
                            boneNames.push(child.name);
                        }
                    });
                    console.log('🦴 Character bones:', boneNames.join(', '));

                    resolve(model);
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total) * 100;
                    if (percent % 25 === 0) {
                        console.log(`Loading ${characterName}: ${percent.toFixed(0)}%`);
                    }
                },
                (error) => {
                    console.error('❌ Failed to load GLB character:', error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Load a character model in FBX format
     */
    async loadCharacterFBX(characterName, path, texturePath) {
        return new Promise((resolve, reject) => {
            console.log(`👤 Loading FBX character: ${characterName}`);

            this.fbxLoader.load(
                path,
                async (fbx) => {
                    console.log('✅ FBX character loaded successfully!');

                    // Apply texture
                    try {
                        const texture = await this.loadTexture(texturePath);
                        this.applyTextureToModel(fbx, texture);
                        console.log('✅ Texture applied to character');
                    } catch (error) {
                        console.warn('⚠️ Could not load texture:', error);
                    }

                    // Enable shadows
                    fbx.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    // Log bone hierarchy
                    const boneNames = [];
                    fbx.traverse((child) => {
                        if (child.isBone) {
                            boneNames.push(child.name);
                        }
                    });
                    console.log('🦴 Character bones:', boneNames.join(', '));

                    // Scale to reasonable size (FBX files are 100x larger)
                    fbx.scale.set(0.01, 0.01, 0.01);

                    resolve(fbx);
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total) * 100;
                    if (percent % 25 === 0) {
                        console.log(`Loading ${characterName}: ${percent.toFixed(0)}%`);
                    }
                },
                (error) => {
                    console.error('❌ Failed to load FBX character:', error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Preload multiple assets
     */
    async preloadAssets(assetList) {
        const promises = assetList.map(asset => {
            if (asset.type === 'fbx') {
                return this.loadFBX(asset.path, asset.texture);
            } else if (asset.type === 'texture') {
                return this.loadTexture(asset.path);
            }
        });

        try {
            await Promise.all(promises);
            console.log('All assets preloaded successfully');
        } catch (error) {
            console.error('Error preloading assets:', error);
        }
    }

    /**
     * Clear cache to free memory
     */
    clearCache() {
        this.loadedAssets.clear();
        this.loadedTextures.forEach(texture => texture.dispose());
        this.loadedTextures.clear();
    }
}
