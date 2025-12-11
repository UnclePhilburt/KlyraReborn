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
     * Normalize bone names to match the Synty/Animation skeleton
     * Converts lowercase polygon bones to uppercase Unreal bones
     */
    normalizeBoneNames(model) {
        const boneMap = {
            // Root and Hips
            'root': 'Root',
            'pelvis': 'Hips',

            // Spine
            'spine_01': 'Spine_01',
            'spine_02': 'Spine_02',
            'spine_03': 'Spine_03',

            // Neck and Head
            'neck_01': 'Neck',
            'head': 'Head',
            'eyes': 'Eyes',
            'eyebrows': 'Eyebrows',

            // Left Arm
            'clavicle_l': 'Clavicle_L',
            'upperarm_l': 'Shoulder_L',
            'lowerarm_l': 'Elbow_L',
            'hand_l': 'Hand_L',

            // Right Arm
            'clavicle_r': 'Clavicle_R',
            'upperarm_r': 'Shoulder_R',
            'lowerarm_r': 'Elbow_R',
            'hand_r': 'Hand_R',

            // Left Leg
            'thigh_l': 'UpperLeg_L',
            'calf_l': 'LowerLeg_L',
            'foot_l': 'Ankle_L',
            'ball_l': 'Ball_L',
            'toes_l': 'Toes_L',

            // Right Leg
            'thigh_r': 'UpperLeg_R',
            'calf_r': 'LowerLeg_R',
            'foot_r': 'Ankle_R',
            'ball_r': 'Ball_R',
            'toes_r': 'Toes_R',

            // Left Hand Fingers
            'thumb_01_l': 'Thumb_01',
            'thumb_02_l': 'Thumb_02',
            'thumb_03_l': 'Thumb_03',
            'index_01_l': 'IndexFinger_01',
            'index_02_l': 'IndexFinger_02',
            'index_03_l': 'IndexFinger_03',
            'middle_01_l': 'Finger_01',
            'middle_02_l': 'Finger_02',
            'middle_03_l': 'Finger_03',
            'ring_01_l': 'ring_01_l',
            'ring_02_l': 'ring_02_l',
            'ring_03_l': 'ring_03_l',
            'pinky_01_l': 'pinky_01_l',
            'pinky_02_l': 'pinky_02_l',
            'pinky_03_l': 'pinky_03_l',

            // Right Hand Fingers
            'thumb_01_r': 'Thumb_01_1',
            'thumb_02_r': 'Thumb_02_1',
            'thumb_03_r': 'Thumb_03_1',
            'index_01_r': 'IndexFinger_01_1',
            'index_02_r': 'IndexFinger_02_1',
            'index_03_r': 'IndexFinger_03_1',
            'middle_01_r': 'Finger_01_1',
            'middle_02_r': 'Finger_02_1',
            'middle_03_r': 'Finger_03_1',
            'ring_01_r': 'ring_01_r',
            'ring_02_r': 'ring_02_r',
            'ring_03_r': 'ring_03_r',
            'pinky_01_r': 'pinky_01_r',
            'pinky_02_r': 'pinky_02_r',
            'pinky_03_r': 'pinky_03_r',

            // Ignore IK bones
            'ik_foot_root': null,
            'ik_foot_l': null,
            'ik_foot_r': null,
            'ik_hand_root': null,
            'ik_hand_gun': null,
            'ik_hand_l': null,
            'ik_hand_r': null
        };

        let renamed = 0;
        let ignored = 0;
        const bonesToReset = [];

        model.traverse((child) => {
            if (child.isBone && boneMap[child.name] !== undefined) {
                const newName = boneMap[child.name];
                if (newName === null) {
                    // Ignore this bone (IK bones, etc.)
                    ignored++;
                } else {
                    console.log(`🔄 Renaming bone: ${child.name} → ${newName}`);
                    child.name = newName;
                    bonesToReset.push(child);
                    renamed++;
                }
            }
        });

        // DON'T reset bind pose - causes T-pose issues
        // The character model bind pose should be left as-is from the GLB file
        if (bonesToReset.length > 0) {
            console.log(`✅ Bone renaming complete - NOT resetting bind pose (prevents T-pose)`);
        }

        if (renamed > 0) {
            console.log(`✅ Renamed ${renamed} bones to match animation skeleton`);
        }
        if (ignored > 0) {
            console.log(`⏭️ Ignored ${ignored} IK/helper bones`);
        }
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
        // Check if it's a GLB character (Polygon Fantasy Kingdom characters start with SK_Chr_)
        const isGLB = characterName.toLowerCase().includes('polygon') ||
                      characterName.toLowerCase().includes('synty') ||
                      characterName.toLowerCase().includes('goblin') ||
                      characterName.toLowerCase().startsWith('sk_chr_');

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

                    // DON'T normalize bone names - causes bind pose issues
                    // this.normalizeBoneNames(model);

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
