import * as THREE from 'three';
import { AssetLoader } from '../loaders/AssetLoader.js';
import { AnimationLoader } from '../loaders/AnimationLoader.js';

export class PlayerController {
    constructor(scene, camera, assetLoader, worldManager = null) {
        this.scene = scene;
        this.camera = camera;
        this.assetLoader = assetLoader;
        this.worldManager = worldManager;
        this.animationLoader = new AnimationLoader();
        this.mesh = null;
        this.characterModel = null;
        this.mixer = null; // Animation mixer
        this.animations = {}; // Store animation actions
        this.currentAnimation = null;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.targetRotation = 0; // Target rotation for smooth turning

        // Movement settings
        this.moveSpeed = 4; // Base speed (when sheathed)
        this.drawnSpeedMultiplier = 0.7; // Slower when weapon is drawn
        this.jumpSpeed = 8;
        this.gravity = -20;
        this.isGrounded = false;

        // Camera settings
        this.cameraDistance = 2;
        this.minCameraDistance = 1;
        this.maxCameraDistance = 20;
        this.cameraHeight = 1.5;
        this.cameraAngle = 0;
        this.cameraPitch = 0.3;
        this.isFirstPerson = false;
        this.firstPersonHeight = 1.6; // Eye height in first person

        // Camera dead zone for smoother feel
        this.cameraTargetX = 0; // Target camera angle
        this.cameraTargetY = 0; // Target camera pitch
        this.cameraDeadZone = 0; // No dead zone - instant response

        // Character position dead zone
        this.cameraFollowDeadZone = 2.0; // Distance character can move before camera follows
        this.lastCameraFollowPosition = new THREE.Vector3();

        // Input state
        this.keys = {};
        this.mouseX = 0;
        this.mouseY = 0;
        this.isPointerLocked = false;

        // Combat state
        this.isAttacking = false;
        this.comboStep = 0; // Track which heavy combo step we're on (0, 1, 2)
        this.lightComboStep = 0; // Track which light combo step we're on (0, 1, 2)
        this.comboResetTimer = null;
        this.lightComboResetTimer = null;
        this.queuedAttack = null; // Queue next attack for smooth combos

        // Idle state
        this.isMenacing = false; // Toggle menacing stance with key 2
        this.idleTimer = 0; // Track time spent idle
        this.lastIdleVariation = 0; // Time since last idle variation
        this.idleVariationInterval = 5 + Math.random() * 5; // Random 5-10 seconds between variations

        // Weapon state
        this.swordModels = []; // Array of loaded sword models
        this.currentSwordIndex = 0;
        this.equippedSword = null;
        this.handBone = null; // Reference to hand bone for attaching weapon
        this.hipBone = null; // Reference to hip bone for sheathed sword
        this.isSheathed = false; // Whether sword is currently sheathed
        this.isSheathing = false; // Whether currently playing sheathe/draw animation

        // Targeting state (lock-on system)
        this.isTargeting = false;
        this.targetedEnemy = null;
        this.goblinSpawner = null; // Will be set by Game class
        this.targetReticle = null; // Visual indicator for locked target

        // Smooth camera transition state
        this.cameraLookAtTarget = new THREE.Vector3();
        this.currentCameraLookAt = new THREE.Vector3();
        this.cameraLookAtInitialized = false;

        // Mage projectile system
        this.mageProjectiles = [];
        this.mageProjectileSpeed = 20;
        this.mageProjectileDamage = 15;
        this.lastOrbHand = 'left'; // Alternate which hand shoots

        this.setupControls();
        this.createTargetReticle();
    }

    // Set the goblin spawner reference for targeting
    setGoblinSpawner(spawner) {
        this.goblinSpawner = spawner;
    }

    // Create a targeting reticle to show locked-on enemy
    createTargetReticle() {
        // Create a simple downward-pointing triangle above the enemy's head
        const triangleGeometry = new THREE.BufferGeometry();
        const triangleVertices = new Float32Array([
            0, 0, 0,       // Bottom point (pointing down)
            -0.3, 0.5, 0,  // Top left
            0.3, 0.5, 0    // Top right
        ]);
        triangleGeometry.setAttribute('position', new THREE.BufferAttribute(triangleVertices, 3));

        const triangleMaterial = new THREE.MeshBasicMaterial({
            color: 0xff3333,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            depthTest: false
        });

        this.targetReticle = new THREE.Mesh(triangleGeometry, triangleMaterial);
        this.targetReticle.visible = false;
        this.targetReticle.renderOrder = 999; // Render on top

        this.scene.add(this.targetReticle);
    }

    async init(characterName = 'polygonesyntycharacter') {
        // Store character name for animation loading
        this.characterName = characterName;
        this.isMage = characterName.toLowerCase().includes('mage');

        // Create the main mesh container first
        this.mesh = new THREE.Group();
        this.mesh.position.set(0, 0, 0); // Start at ground level
        this.scene.add(this.mesh);

        try {
            console.log(`Attempting to load character: ${characterName}`);

            // Load the main skeleton character (polygonesyntycharacter has all the bones)
            this.characterModel = await this.assetLoader.loadCharacter(characterName);

            // Set the character position and rotation
            // Characters need Y offset because their origins are below ground level
            const yOffset = 0.9;
            this.characterModel.position.set(0, yOffset, 0);
            this.characterModel.rotation.y = 0;
            this.characterYOffset = yOffset; // Store for later use

            // Add character to the mesh group
            this.mesh.add(this.characterModel);

            console.log('✅ Character loaded successfully!');

            // DEBUG: Try to find and log the SkinnedMesh
            let skinnedMesh = null;
            this.characterModel.traverse((child) => {
                if (child.isSkinnedMesh) {
                    skinnedMesh = child;
                    console.log('🎯 Found SkinnedMesh:', child);
                    console.log('   - Geometry vertices:', child.geometry.attributes.position.count);
                    console.log('   - Material:', child.material);
                    console.log('   - Skeleton:', child.skeleton);
                    console.log('   - Visible:', child.visible);
                    console.log('   - MatrixWorldNeedsUpdate:', child.matrixWorldNeedsUpdate);

                    // Enable shadows on player character
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
                // Also enable shadows on all other mesh children
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            if (skinnedMesh) {
                // Force matrix updates
                skinnedMesh.updateMatrix();
                skinnedMesh.updateMatrixWorld(true);

                // Bind skeleton if not bound
                if (skinnedMesh.skeleton) {
                    skinnedMesh.skeleton.update();
                    console.log('   ✅ Updated skeleton');
                }
            }

            // Find and store the root bones for position locking
            this.rootBone = null;
            this.pelvisBone = null;
            this.rootBoneOriginalY = 0;
            this.pelvisBoneOriginalY = 0;
            this.characterModel.traverse((child) => {
                if (child.isBone) {
                    const boneName = child.name.toLowerCase();
                    if (boneName === 'root' || boneName === 'armature') {
                        this.rootBone = child;
                        this.rootBoneOriginalY = child.position.y;
                        console.log(`🦴 Found root bone for position lock: ${child.name} (Y: ${child.position.y})`);
                    }
                    if (boneName === 'pelvis' || boneName === 'hips') {
                        this.pelvisBone = child;
                        this.pelvisBoneOriginalY = child.position.y;
                        console.log(`🦴 Found pelvis bone for position lock: ${child.name} (Y: ${child.position.y})`);
                    }
                }
            });

            // Load animations
            await this.loadAnimations();

            // Load weapons
            await this.loadWeapons();

        } catch (error) {
            console.error('❌ Failed to load FBX character:', error);
            console.log('Using placeholder geometry instead');

            // Fallback: Add placeholder geometry
            const geometry = new THREE.CapsuleGeometry(0.5, 1.5, 4, 8);
            const material = new THREE.MeshStandardMaterial({
                color: 0x3498db,
                roughness: 0.7,
                metalness: 0.3
            });
            const placeholder = new THREE.Mesh(geometry, material);
            placeholder.castShadow = true;
            placeholder.receiveShadow = true;
            placeholder.position.y = 1;
            this.mesh.add(placeholder);

            // Add a simple "hat" to show forward direction
            const hatGeometry = new THREE.ConeGeometry(0.3, 0.6, 8);
            const hatMaterial = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
            const hat = new THREE.Mesh(hatGeometry, hatMaterial);
            hat.position.y = 1.5;
            hat.rotation.x = Math.PI;
            placeholder.add(hat);
        }
    }

    async loadAnimations() {
        console.log('🎬 Loading animations...');

        try {
            // Set target skeleton for bone mapping
            this.animationLoader.targetSkeleton = this.characterModel;

            // Create animation mixer
            this.mixer = new THREE.AnimationMixer(this.characterModel);

            // Define animations based on character type
            let animationsToLoad;

            if (this.isMage) {
                // Mage-specific animations (no bone remapping needed)
                console.log('🧙 Loading mage-specific animations...');
                animationsToLoad = [
                    { name: 'idle', path: '/assets/glbanimations/mage_idle.glb', noRemap: true },
                    { name: 'walk', path: '/assets/glbanimations/mage_walk.glb', noRemap: true },
                    { name: 'run_forward', path: '/assets/glbanimations/mage_run.glb', noRemap: true },
                    { name: 'run_backward', path: '/assets/glbanimations/mage_walk_back.glb', noRemap: true },
                    { name: 'run_left', path: '/assets/glbanimations/mage_jog_diagonal_left.glb', noRemap: true },
                    { name: 'run_right', path: '/assets/glbanimations/mage_jog_diagonal_right.glb', noRemap: true }
                ];
            } else {
                // Synty character animations
                animationsToLoad = [
                    { name: 'idle', path: '/assets/glbanimations/A_Idle_Standing_Masc.glb' },
                    { name: 'walk', path: '/assets/glbanimations/walk.glb' },
                    { name: 'run_forward', path: '/assets/glbanimations/run_forward.glb' },
                    { name: 'run_backward', path: '/assets/glbanimations/run_backward.glb' },
                    { name: 'run_left', path: '/assets/glbanimations/run_left.glb' },
                    { name: 'run_right', path: '/assets/glbanimations/run_right.glb' },
                    { name: 'attack_stab', path: '/assets/glbanimations/A_Attack_HeavyStab01_ReturnToIdle_Sword.glb' },
                    { name: 'attack_flourish', path: '/assets/glbanimations/attack_flourish.glb' },
                    { name: 'attack_combo_a', path: '/assets/glbanimations/A_Attack_HeavyCombo01A_Sword.glb' },
                    { name: 'attack_combo_b', path: '/assets/glbanimations/A_Attack_HeavyCombo01B_Sword.glb' },
                    { name: 'attack_combo_c', path: '/assets/glbanimations/A_Attack_HeavyCombo01C_Sword.glb' },
                    { name: 'light_combo_a', path: '/assets/glbanimations/light_combo_a.glb' },
                    { name: 'light_combo_b', path: '/assets/glbanimations/light_combo_b.glb' },
                    { name: 'light_combo_c', path: '/assets/glbanimations/light_combo_c.glb' },
                    { name: 'idle_combat', path: '/assets/glbanimations/idle_combat.glb' },
                    { name: 'idle_menacing_begin', path: '/assets/glbanimations/idle_menacing_begin.glb' },
                    { name: 'idle_menacing', path: '/assets/glbanimations/idle_menacing.glb' },
                    { name: 'idle_menacing_end', path: '/assets/glbanimations/idle_menacing_end.glb' },
                    { name: 'idle_flourish', path: '/assets/glbanimations/idle_flourish.glb' },
                    { name: 'idle_energetic', path: '/assets/glbanimations/idle_energetic.glb' },
                    { name: 'draw_sword', path: '/assets/glbanimations/draw_sword.glb' },
                    { name: 'sheathe_sword', path: '/assets/glbanimations/sheathe_sword.glb' },
                    { name: 'idle_sheathed', path: '/assets/glbanimations/idle_sheathed.glb' }
                ];
            }

            // Load all animations
            for (const anim of animationsToLoad) {
                try {
                    // Use bone remapping only for Synty character (not mage)
                    const enableRemap = !anim.noRemap;
                    const clip = await this.animationLoader.loadAnimationGLB(
                        anim.name,
                        anim.path,
                        enableRemap
                    );
                    this.animations[anim.name] = this.mixer.clipAction(clip);
                    console.log(`✅ ${anim.name} animation loaded (remap: ${enableRemap})`);
                } catch (error) {
                    console.warn(`⚠️ Could not load ${anim.name} animation:`, error.message);
                }
            }

            // Disable root motion - we control movement with WASD keys
            // Remove ALL position tracks to prevent "flying" effect
            console.log('🔧 Checking for root motion in animations...');

            // Get all loaded animation clips
            const loadedClips = [];
            for (const key in this.animations) {
                loadedClips.push(this.animations[key].getClip());
            }

            // Track which animation names are movement-related
            const movementAnimNames = ['walk', 'run_forward', 'run_backward', 'run_left', 'run_right'];

            // Build a map of clip -> animation name
            const clipToAnimName = new Map();
            for (const animName in this.animations) {
                const clip = this.animations[animName].getClip();
                clipToAnimName.set(clip, animName);
            }

            loadedClips.forEach((clip) => {
                const originalTrackCount = clip.tracks.length;
                const animName = clipToAnimName.get(clip) || clip.name;

                // Debug: Log all position tracks in this clip
                if (this.isMage) {
                    console.log(`🔍 [${animName}] (clip: ${clip.name}) Position tracks:`);
                    clip.tracks.forEach(track => {
                        if (track.name.toLowerCase().includes('.position')) {
                            console.log(`   - ${track.name}`);
                        }
                    });
                }

                clip.tracks = clip.tracks.filter(track => {
                    const trackName = track.name.toLowerCase();

                    // Only remove ROOT position tracks (the one that causes world-space movement)
                    // Keep position tracks for other bones (arms, fingers, spine, etc.)
                    // Check for various root bone naming conventions
                    const rootBoneNames = ['root', 'hips', 'pelvis', 'armature', 'mixamorig:hips'];

                    // Check if this is a root position track (exact match, not substring)
                    const isRootPosition = trackName.includes('.position') &&
                        rootBoneNames.some(name => {
                            // Match "Root.position" but not "ik_foot_root.position"
                            const boneName = trackName.split('.')[0].toLowerCase();
                            return boneName === name || boneName === 'mixamorig:' + name;
                        });

                    if (isRootPosition) {
                        console.log(`   Removing root track: ${track.name}`);
                        return false;
                    }

                    // Keep all other tracks
                    return true;
                });

                const removedCount = originalTrackCount - clip.tracks.length;
                if (removedCount > 0) {
                    console.log(`✅ Removed ${removedCount} root position tracks from ${clip.name}`);
                }
            });

            // Start with idle animation if available
            if (this.animations.idle) {
                this.playAnimation('idle');
            }

            console.log('✅ Animations loaded and ready!');
        } catch (error) {
            console.error('❌ Failed to load animations:', error);
        }
    }

    async loadWeapons() {
        // Find hand bones first (needed for both sword and orbs)
        this.findHandBone();

        if (this.isMage) {
            // Mage gets floating orbs instead of swords
            console.log('🔮 Creating mage orbs...');
            this.createMageOrbs();
            return;
        }

        console.log('⚔️ Loading weapons...');

        // Use the AssetLoader's gltfLoader
        const loader = this.assetLoader.gltfLoader;

        // Load all 18 swords
        for (let i = 1; i <= 18; i++) {
            const paddedNum = i.toString().padStart(2, '0');
            const path = `/assets/weapons/SM_Wep_Sword_${paddedNum}.glb`;

            try {
                const gltf = await loader.loadAsync(path);
                const sword = gltf.scene;

                // Apply the same texture as character
                const texture = this.assetLoader.loadedTextures.get('/assets/textures/PolygonFantasyKingdom_Texture_01_A.png');
                if (texture) {
                    sword.traverse((child) => {
                        if (child.isMesh) {
                            child.material = new THREE.MeshStandardMaterial({
                                map: texture,
                                roughness: 0.6,
                                metalness: 0.4
                            });
                            child.castShadow = true;
                        }
                    });
                }

                this.swordModels.push(sword);
                console.log(`✅ Loaded sword ${i}/18`);
            } catch (error) {
                console.warn(`⚠️ Could not load sword ${paddedNum}:`, error.message);
            }
        }

        console.log(`⚔️ Loaded ${this.swordModels.length} swords`);

        // Equip first sword
        if (this.swordModels.length > 0) {
            this.equipSword(0);
        }
    }

    createMageOrbs() {
        // Debug: List all bones to find the correct hand bones
        console.log('🔮 Mage bones:');
        this.characterModel.traverse((child) => {
            if (child.isBone && child.name.toLowerCase().includes('hand')) {
                console.log(`   - ${child.name}`);
            }
        });

        // Create glowing orbs for each hand
        const orbGeometry = new THREE.SphereGeometry(0.12, 16, 16);

        // Left hand orb - blue/purple
        const leftOrbMaterial = new THREE.MeshStandardMaterial({
            color: 0x4488ff,
            emissive: 0x2244aa,
            emissiveIntensity: 2,
            roughness: 0.2,
            metalness: 0.8
        });
        this.leftOrb = new THREE.Mesh(orbGeometry, leftOrbMaterial);

        // Right hand orb - purple/pink
        const rightOrbMaterial = new THREE.MeshStandardMaterial({
            color: 0xaa44ff,
            emissive: 0x6622aa,
            emissiveIntensity: 2,
            roughness: 0.2,
            metalness: 0.8
        });
        this.rightOrb = new THREE.Mesh(orbGeometry, rightOrbMaterial);

        // Add point lights to orbs for glow effect
        const leftLight = new THREE.PointLight(0x4488ff, 0.5, 2);
        this.leftOrb.add(leftLight);

        const rightLight = new THREE.PointLight(0xaa44ff, 0.5, 2);
        this.rightOrb.add(rightLight);

        // Find and attach to hand bones directly
        let leftHand = null;
        let rightHand = null;

        this.characterModel.traverse((child) => {
            if (child.isBone) {
                const name = child.name;
                // Check for exact matches first
                if (name === 'Hand_L' || name === 'hand_l') {
                    leftHand = child;
                } else if (name === 'Hand_R' || name === 'hand_r') {
                    rightHand = child;
                }
            }
        });

        if (leftHand) {
            leftHand.add(this.leftOrb);
            this.leftOrb.position.set(0, 0, 0.1); // In front of hand
            console.log('🔮 Left orb attached to:', leftHand.name);
        } else {
            console.warn('🔮 Could not find left hand bone');
        }

        if (rightHand) {
            rightHand.add(this.rightOrb);
            this.rightOrb.position.set(0, 0, 0.1); // In front of hand
            console.log('🔮 Right orb attached to:', rightHand.name);
        } else {
            console.warn('🔮 Could not find right hand bone');
        }

        // Store animation time for floating effect
        this.orbTime = 0;
    }

    shootMageOrb() {
        if (!this.mesh) return;

        // Create projectile orb
        const orbGeometry = new THREE.SphereGeometry(0.15, 12, 12);

        // Alternate colors between hands
        const isLeftHand = this.lastOrbHand === 'left';
        this.lastOrbHand = isLeftHand ? 'right' : 'left';

        const orbColor = isLeftHand ? 0x4488ff : 0xaa44ff;
        const orbMaterial = new THREE.MeshStandardMaterial({
            color: orbColor,
            emissive: orbColor,
            emissiveIntensity: 2,
            roughness: 0.2,
            metalness: 0.8,
            transparent: true,
            opacity: 0.9
        });

        const projectile = new THREE.Mesh(orbGeometry, orbMaterial);

        // Add glow light
        const light = new THREE.PointLight(orbColor, 1, 5);
        projectile.add(light);

        // Start position at player's hand level
        const startPos = this.mesh.position.clone();
        startPos.y += 1.2; // Hand height
        projectile.position.copy(startPos);

        // Calculate direction - toward target or camera direction
        let direction;
        if (this.isTargeting && this.targetedEnemy && this.targetedEnemy.mesh) {
            // Shoot toward targeted enemy
            const targetPos = this.targetedEnemy.mesh.position.clone();
            targetPos.y += 1; // Aim at center
            direction = targetPos.sub(startPos).normalize();
        } else {
            // Shoot in camera direction
            direction = new THREE.Vector3(
                -Math.sin(this.mouseX),
                -this.mouseY * 0.5,
                -Math.cos(this.mouseX)
            ).normalize();
        }

        // Add to scene
        this.scene.add(projectile);

        // Store projectile data
        this.mageProjectiles.push({
            mesh: projectile,
            direction: direction,
            speed: this.mageProjectileSpeed,
            damage: this.mageProjectileDamage,
            lifetime: 3, // Seconds before despawn
            age: 0
        });

        console.log('🔮 Mage orb fired!');
    }

    updateMageProjectiles(delta) {
        // Update all mage projectiles
        for (let i = this.mageProjectiles.length - 1; i >= 0; i--) {
            const proj = this.mageProjectiles[i];

            // Move projectile
            proj.mesh.position.x += proj.direction.x * proj.speed * delta;
            proj.mesh.position.y += proj.direction.y * proj.speed * delta;
            proj.mesh.position.z += proj.direction.z * proj.speed * delta;

            // Update age
            proj.age += delta;

            // Check for enemy hits
            if (this.goblinSpawner) {
                for (const goblin of this.goblinSpawner.goblins) {
                    if (goblin.isDead) continue;

                    const dist = proj.mesh.position.distanceTo(goblin.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)));
                    if (dist < 1.0) {
                        // Hit!
                        this.goblinSpawner.damageGoblin(goblin, proj.damage);
                        console.log('🔮 Orb hit goblin!');

                        // Remove projectile
                        this.scene.remove(proj.mesh);
                        proj.mesh.geometry.dispose();
                        proj.mesh.material.dispose();
                        this.mageProjectiles.splice(i, 1);
                        break;
                    }
                }
            }

            // Remove if too old or too far
            if (proj.age > proj.lifetime) {
                this.scene.remove(proj.mesh);
                proj.mesh.geometry.dispose();
                proj.mesh.material.dispose();
                this.mageProjectiles.splice(i, 1);
            }
        }
    }

    findHandBone() {
        if (!this.characterModel) return;

        // Look for hip bone - try various naming conventions
        const hipBoneNames = [
            'Hips', 'hips', 'pelvis', 'Pelvis', 'Hip_L', 'hip_l',
            'UpperLeg_L', 'thigh_l', 'Thigh_L'
        ];

        this.characterModel.traverse((child) => {
            if (child.isBone) {
                const boneName = child.name.toLowerCase();

                // Check for RIGHT hand bone
                if (boneName.includes('hand') && boneName.includes('r') && !boneName.includes('l')) {
                    this.handBone = child;
                    console.log(`🦴 Found right hand bone: ${child.name}`);
                }

                // Check for LEFT hand bone
                if (boneName.includes('hand') && boneName.includes('l') && !boneName.includes('r')) {
                    this.handBoneLeft = child;
                    console.log(`🦴 Found left hand bone: ${child.name}`);
                }

                // Check for hip bone (for sheathed sword)
                if (hipBoneNames.includes(child.name)) {
                    this.hipBone = child;
                    console.log(`🦴 Found hip bone: ${child.name}`);
                }
                // Also check for partial matches for hip/thigh
                else if ((boneName.includes('hip') || boneName.includes('thigh') || boneName.includes('pelvis')) && boneName.includes('l')) {
                    if (!this.hipBone) {
                        this.hipBone = child;
                        console.log(`🦴 Found hip bone (partial match): ${child.name}`);
                    }
                }
            }
        });

        if (!this.handBone) {
            console.warn('⚠️ Could not find hand bone! Listing all bones:');
            this.characterModel.traverse((child) => {
                if (child.isBone) {
                    console.log(`  - ${child.name}`);
                }
            });
        }

        if (!this.hipBone) {
            console.warn('⚠️ Could not find hip bone for sheathed sword');
        }
    }

    equipSword(index) {
        if (index < 0 || index >= this.swordModels.length) {
            console.warn(`⚠️ Invalid sword index: ${index}`);
            return;
        }

        // Remove current sword if equipped
        if (this.equippedSword && this.equippedSword.parent) {
            this.equippedSword.parent.remove(this.equippedSword);
        }

        this.currentSwordIndex = index;
        this.equippedSword = this.swordModels[index].clone();

        if (this.handBone) {
            // Attach to hand bone
            this.handBone.add(this.equippedSword);

            // Adjust position/rotation to fit hand
            // These values may need tweaking based on the model
            this.equippedSword.position.set(0, 0, 0);
            this.equippedSword.rotation.set(Math.PI, 0, 0); // Rotate 180 degrees on X axis
            this.equippedSword.scale.set(1, 1, 1);

            console.log(`⚔️ Equipped sword ${index + 1}/${this.swordModels.length}`);
        } else {
            // Fallback: attach to mesh if no hand bone found
            this.mesh.add(this.equippedSword);
            this.equippedSword.position.set(0.3, 1, 0);
            console.log(`⚔️ Equipped sword ${index + 1} (attached to mesh, no hand bone)`);
        }
    }

    cycleSword(direction) {
        if (this.swordModels.length === 0) {
            console.warn('⚠️ No swords loaded');
            return;
        }

        let newIndex = this.currentSwordIndex + direction;

        // Wrap around
        if (newIndex < 0) newIndex = this.swordModels.length - 1;
        if (newIndex >= this.swordModels.length) newIndex = 0;

        this.equipSword(newIndex);
    }

    playAnimation(name, fadeTime = 0.2) {
        if (!this.animations[name]) {
            console.warn(`❌ Animation "${name}" not found`);
            console.log('Available animations:', Object.keys(this.animations));
            return;
        }

        // Stop current animation
        if (this.currentAnimation) {
            console.log(`⏹️ Stopping current animation: ${this.currentAnimation.getClip().name}`);
            this.currentAnimation.fadeOut(fadeTime);
        }

        // Play new animation
        const action = this.animations[name];
        action.reset().fadeIn(fadeTime).play();
        this.currentAnimation = action;

        const clip = action.getClip();
        console.log(`🎬 Playing animation: ${name}`);
        console.log(`   Duration: ${clip.duration.toFixed(2)}s`);
        console.log(`   Tracks: ${clip.tracks.length}`);
        console.log(`   Weight: ${action.getEffectiveWeight()}`);
        console.log(`   Enabled: ${action.enabled}`);
    }

    performAttack(attackType = 'attack_stab') {
        if (this.isAttacking) {
            console.log('⚠️ Already attacking, ignoring click');
            return;
        }

        console.log(`⚔️ Attacking with ${attackType}!`);
        this.isAttacking = true;

        // Play attack animation (don't loop)
        const attackAction = this.animations[attackType];
        if (!attackAction) {
            console.error(`❌ Attack animation "${attackType}" not found!`);
            this.isAttacking = false;
            return;
        }

        // Fade out current animation smoothly
        if (this.currentAnimation) {
            this.currentAnimation.fadeOut(0.1);
        }

        attackAction.reset();
        attackAction.setLoop(THREE.LoopOnce, 1);
        attackAction.clampWhenFinished = true; // Hold last frame to prevent T-pose
        attackAction.timeScale = 1.0; // Normal speed (1.0 = 100%)
        attackAction.fadeIn(0.1); // Smooth fade in
        attackAction.play();
        this.currentAnimation = attackAction;

        // Get animation duration and set timeout
        const duration = attackAction.getClip().duration;
        const trackCount = attackAction.getClip().tracks.length;
        console.log(`⏱️ Attack duration: ${duration.toFixed(2)}s, ${trackCount} tracks`);

        // Determine damage based on attack type
        let damage = 25; // Default damage
        if (attackType.includes('light')) {
            damage = 20; // Light attacks do less damage
        } else if (attackType.includes('heavy') || attackType.includes('combo')) {
            damage = 30; // Heavy attacks do more
        } else if (attackType.includes('flourish')) {
            damage = 40; // Flourish does most damage
        }

        // Check for hits at 30% through animation (when swing connects)
        setTimeout(() => {
            this.checkAttackHits(damage);
        }, duration * 300);

        // Wait for full animation to complete, then check for queued attack or return to idle
        setTimeout(() => {
            console.log('⏰ Attack animation complete');
            this.isAttacking = false;

            // Check if there's a queued attack (for smooth combos)
            if (this.queuedAttack) {
                console.log('⚡ Playing queued attack:', this.queuedAttack);
                const nextAttack = this.queuedAttack;
                this.queuedAttack = null;
                this.performAttack(nextAttack);
            } else {
                // No queued attack, return to idle
                attackAction.fadeOut(0.2);
                this.playAnimation('idle', 0.2);
            }
        }, duration * 1000); // Wait exact duration
    }

    checkEnemyCollision() {
        if (!this.goblinSpawner || !this.mesh) return;

        const playerRadius = 0.5; // Player collision radius
        const goblinRadius = 0.5; // Goblin collision radius
        const minDistance = playerRadius + goblinRadius;

        const playerPos = this.mesh.position;

        for (const goblin of this.goblinSpawner.goblins) {
            if (goblin.isDead) continue;

            const goblinPos = goblin.mesh.position;

            // Calculate horizontal distance
            const dx = playerPos.x - goblinPos.x;
            const dz = playerPos.z - goblinPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            // Check for collision
            if (distance < minDistance && distance > 0) {
                // Push player away from goblin
                const overlap = minDistance - distance;
                const pushX = (dx / distance) * overlap;
                const pushZ = (dz / distance) * overlap;

                // Move player out of collision
                this.mesh.position.x += pushX;
                this.mesh.position.z += pushZ;
            }
        }
    }

    checkAttackHits(damage) {
        if (!this.goblinSpawner || !this.mesh || !this.equippedSword) return;

        // Get sword's world position
        const swordWorldPos = new THREE.Vector3();
        this.equippedSword.getWorldPosition(swordWorldPos);

        // Sword hit radius (increased for more forgiving hit detection)
        const swordHitRadius = 2.5;

        for (const goblin of this.goblinSpawner.goblins) {
            if (goblin.isDead) continue;

            const goblinPos = goblin.mesh.position.clone();
            goblinPos.y += 1; // Check against goblin's center, not feet

            // Calculate distance from sword to goblin
            const distance = swordWorldPos.distanceTo(goblinPos);

            if (distance < swordHitRadius) {
                // Sword hit the goblin!
                this.goblinSpawner.damageGoblin(goblin, damage);
            }
        }
    }

    setupControls() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            // Toggle first person on P key
            if (e.code === 'KeyP') {
                this.isFirstPerson = !this.isFirstPerson;
                console.log(this.isFirstPerson ? '👤 First person mode' : '🎥 Third person mode');
            }

            // Key 1 - Flourish attack (only when sword is drawn)
            if (e.code === 'Digit1' && !this.isAttacking && !this.isSheathed && this.animations.attack_flourish) {
                this.performAttack('attack_flourish');
            }

            // Key 2 - Toggle menacing stance (only when sword is drawn)
            if (e.code === 'Digit2' && !this.isAttacking && !this.isSheathed) {
                this.toggleMenacingStance();
            }

            // Key 3 - Energetic stance (one-shot, only when sword is drawn)
            if (e.code === 'Digit3' && !this.isAttacking && !this.isSheathed && this.animations.idle_energetic) {
                this.playAnimation('idle_energetic');
            }

            // Key 4 - Previous sword
            if (e.code === 'Digit4') {
                this.cycleSword(-1);
            }

            // Key 5 - Next sword
            if (e.code === 'Digit5') {
                this.cycleSword(1);
            }

            // Key 6 - Toggle sheathe/draw sword
            if (e.code === 'Digit6' && !this.isAttacking && !this.isSheathing) {
                this.toggleSheathe();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse controls for camera - instant response
        document.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked) {
                // Store mouse delta for target switching
                this.lastMouseDeltaX = e.movementX * 0.002;

                // Direct camera control - no smoothing, no dead zone
                this.mouseX -= e.movementX * 0.002;
                this.mouseY += e.movementY * 0.002;
                this.mouseY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.mouseY));

                // Keep target in sync
                this.cameraTargetX = this.mouseX;
                this.cameraTargetY = this.mouseY;
            }
        });

        // Mouse button for attack and targeting
        document.addEventListener('mousedown', (e) => {
            if (this.isPointerLocked) {
                if (e.button === 1) { // Middle mouse button - toggle target lock
                    e.preventDefault();
                    this.toggleTargeting();
                } else if (e.button === 0) { // Left click
                    if (this.isMage) {
                        // Mage shoots orb projectiles
                        this.shootMageOrb();
                    } else if (!this.isSheathed) {
                        // Sword user - light combo sequence (only when sword drawn)
                        const lightComboAnims = ['light_combo_a', 'light_combo_b', 'light_combo_c'];

                        if (!this.isAttacking) {
                            console.log(`🗡️ Light combo step ${this.lightComboStep}: ${lightComboAnims[this.lightComboStep]}`);
                            if (this.animations[lightComboAnims[this.lightComboStep]]) {
                                this.performAttack(lightComboAnims[this.lightComboStep]);
                                this.lightComboStep = (this.lightComboStep + 1) % 3;

                                // Reset light combo after 3 seconds of no attacks
                                if (this.lightComboResetTimer) clearTimeout(this.lightComboResetTimer);
                                this.lightComboResetTimer = setTimeout(() => {
                                    this.lightComboStep = 0;
                                    console.log('🔄 Light combo reset');
                                }, 3000);
                            }
                        } else {
                            // Queue next light combo attack
                            this.queuedAttack = lightComboAnims[this.lightComboStep];
                            console.log(`📋 Queued light combo: ${this.queuedAttack}`);
                            this.lightComboStep = (this.lightComboStep + 1) % 3;

                            if (this.lightComboResetTimer) clearTimeout(this.lightComboResetTimer);
                            this.lightComboResetTimer = setTimeout(() => {
                                this.lightComboStep = 0;
                                this.queuedAttack = null;
                                console.log('🔄 Light combo reset');
                            }, 3000);
                        }
                    }
                } else if (e.button === 2 && !this.isSheathed) { // Right click - combo attack sequence (only when sword drawn)
                    e.preventDefault();
                    const comboAnims = ['attack_combo_a', 'attack_combo_b', 'attack_combo_c'];

                    if (!this.isAttacking) {
                        // Not attacking, start immediately
                        console.log(`🎯 Starting combo step ${this.comboStep}: ${comboAnims[this.comboStep]}`);
                        if (this.animations[comboAnims[this.comboStep]]) {
                            this.performAttack(comboAnims[this.comboStep]);
                            this.comboStep = (this.comboStep + 1) % 3; // Cycle 0 -> 1 -> 2 -> 0

                            // Reset combo after 5 seconds of no attacks
                            if (this.comboResetTimer) clearTimeout(this.comboResetTimer);
                            this.comboResetTimer = setTimeout(() => {
                                this.comboStep = 0;
                                console.log('🔄 Combo reset to step 0');
                            }, 5000);
                        }
                    } else {
                        // Currently attacking, queue the next combo attack
                        this.queuedAttack = comboAnims[this.comboStep];
                        console.log(`📋 Queued next combo attack: ${this.queuedAttack}`);
                        this.comboStep = (this.comboStep + 1) % 3; // Advance combo step

                        // Reset combo timer
                        if (this.comboResetTimer) clearTimeout(this.comboResetTimer);
                        this.comboResetTimer = setTimeout(() => {
                            this.comboStep = 0;
                            this.queuedAttack = null;
                            console.log('🔄 Combo reset to step 0');
                        }, 5000);
                    }
                }
            }
        });

        // Prevent right-click context menu
        document.addEventListener('contextmenu', (e) => {
            if (this.isPointerLocked) {
                e.preventDefault();
            }
        });

        // Pointer lock for camera control
        document.addEventListener('click', () => {
            if (!this.isPointerLocked) {
                console.log('🖱️ Requesting pointer lock...');
                document.body.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === document.body;
            console.log('🔒 Pointer lock:', this.isPointerLocked ? 'ENABLED' : 'DISABLED');
        });

        // Mouse wheel for camera zoom
        document.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.5;
            this.cameraDistance += e.deltaY * 0.01 * zoomSpeed;
            this.cameraDistance = Math.max(this.minCameraDistance, Math.min(this.maxCameraDistance, this.cameraDistance));
        }, { passive: false });
    }

    update(delta) {
        if (!this.mesh) {
            console.warn('⚠️ No mesh in update!');
            return;
        }

        // Auto-retarget when current target dies
        if (this.isTargeting && this.targetedEnemy && this.targetedEnemy.isDead) {
            console.log('🎯 Target died, looking for next closest enemy...');
            const nextTarget = this.findClosestEnemy();
            if (nextTarget) {
                this.targetedEnemy = nextTarget;
                console.log('🎯 Auto-targeted next closest enemy!');
            } else {
                // No more enemies, clear targeting
                this.isTargeting = false;
                this.targetedEnemy = null;
                if (this.targetReticle) {
                    this.targetReticle.visible = false;
                }
                console.log('🎯 No more enemies to target');
            }
        }

        // Switch targets when looking toward a different enemy
        if (this.isTargeting && this.targetedEnemy) {
            this.checkTargetSwitch();
        }

        // Handle movement input
        this.direction.set(0, 0, 0);

        if (this.keys['KeyW'] || this.keys['ArrowUp']) this.direction.z = 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) this.direction.z = -1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.direction.x = 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) this.direction.x = -1;

        // Normalize diagonal movement
        if (this.direction.length() > 0) {
            this.direction.normalize();
        }

        // Calculate movement direction based on targeting state
        const moveDirection = new THREE.Vector3();

        if (this.isTargeting && this.targetedEnemy && this.targetedEnemy.mesh) {
            // TARGETING MODE: Movement relative to target direction (strafe)
            const targetDirection = this.getDirectionToTarget();
            if (targetDirection) {
                // Get perpendicular (strafe) direction
                // A key (direction.x = 1) should move player LEFT (from their POV facing target)
                const strafeDirection = new THREE.Vector3(-targetDirection.z, 0, targetDirection.x);

                // W/S moves toward/away from target, A/D strafes
                moveDirection.x = targetDirection.x * this.direction.z + strafeDirection.x * -this.direction.x;
                moveDirection.z = targetDirection.z * this.direction.z + strafeDirection.z * -this.direction.x;

                // Character always faces target when locked on
                this.targetRotation = Math.atan2(targetDirection.x, targetDirection.z);
            }
        } else {
            // NORMAL MODE: Movement relative to camera
            const cameraRotation = -this.mouseX + Math.PI;
            moveDirection.x = this.direction.x * Math.cos(cameraRotation) - this.direction.z * Math.sin(cameraRotation);
            moveDirection.z = this.direction.x * Math.sin(cameraRotation) + this.direction.z * Math.cos(cameraRotation);

            // Rotate character to face movement direction when moving
            if (moveDirection.length() > 0) {
                this.targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
            }
        }

        // Smoothly interpolate to target rotation
        const rotationSpeed = this.isTargeting ? 15 : 10; // Faster rotation when targeting
        let currentRotation = this.mesh.rotation.y;

        // Calculate shortest rotation path
        let rotationDiff = this.targetRotation - currentRotation;

        // Normalize to -PI to PI range
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

        // Smoothly interpolate
        this.mesh.rotation.y += rotationDiff * Math.min(rotationSpeed * delta, 1);

        // Apply movement with sprint modifier (but not while attacking)
        const isSprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
        // Base speed, slower when weapon is drawn
        let baseSpeed = this.isSheathed ? this.moveSpeed : this.moveSpeed * this.drawnSpeedMultiplier;
        const currentSpeed = isSprinting ? baseSpeed * 1.5 : baseSpeed;

        // Stop movement during attacks
        if (this.isAttacking) {
            this.velocity.x = 0;
            this.velocity.z = 0;
        } else {
            this.velocity.x = moveDirection.x * currentSpeed;
            this.velocity.z = moveDirection.z * currentSpeed;
        }

        // Apply gravity
        this.velocity.y += this.gravity * delta;

        // Jump
        if (this.keys['Space'] && this.isGrounded) {
            this.velocity.y = this.jumpSpeed;
            this.isGrounded = false;
        }

        // Animate mage orbs (floating effect)
        if (this.isMage && this.leftOrb && this.rightOrb) {
            this.orbTime = (this.orbTime || 0) + delta;
            const floatOffset = Math.sin(this.orbTime * 3) * 0.03;
            const floatOffset2 = Math.sin(this.orbTime * 3 + Math.PI) * 0.03;
            this.leftOrb.position.z = 0.1 + floatOffset;
            this.rightOrb.position.z = 0.1 + floatOffset2;
        }

        // Update mage projectiles
        if (this.isMage) {
            this.updateMageProjectiles(delta);
        }

        // Update position
        this.mesh.position.x += this.velocity.x * delta;
        this.mesh.position.y += this.velocity.y * delta;
        this.mesh.position.z += this.velocity.z * delta;

        // Terrain collision - get height at player position
        let groundHeight = 0;
        if (this.worldManager) {
            groundHeight = this.worldManager.getTerrainHeight(this.mesh.position.x, this.mesh.position.z);
        }

        // Check if character is on or below ground
        if (this.mesh.position.y <= groundHeight) {
            this.mesh.position.y = groundHeight;
            this.velocity.y = 0;
            this.isGrounded = true;
        } else {
            this.isGrounded = false;
        }

        // Check collision with goblins
        this.checkEnemyCollision();

        // Update camera position first (so it works during attacks)
        this.updateCamera();

        // Update target reticle position
        this.updateTargetReticle();

        // Update animations based on movement
        if (this.mixer) {
            // Update animation mixer
            this.mixer.update(delta);

            // IMPORTANT: Lock root bone position after animation update
            // Mixamo animations have root motion baked in - we control movement via WASD
            if (this.characterModel) {
                this.characterModel.position.set(0, this.characterYOffset || 0, 0);

                // Lock the skeleton's root and pelvis bone X/Z positions only
                // Keep Y free so the character follows terrain and has walking bounce
                if (this.rootBone) {
                    this.rootBone.position.x = 0;
                    this.rootBone.position.z = 0;
                }
                if (this.pelvisBone) {
                    this.pelvisBone.position.x = 0;
                    this.pelvisBone.position.z = 0;
                }
            }

            // Don't change animations while attacking
            if (this.isAttacking) {
                return; // Skip animation logic during attacks
            }

            // Determine which animation to play based on movement
            const isMoving = this.direction.length() > 0.1;
            const isSprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];

            let targetAnimation = 'idle_combat'; // Default to combat idle

            if (isMoving) {
                // Reset idle timer when moving
                this.idleTimer = 0;
                this.lastIdleVariation = 0;

                // Exit menacing stance when moving
                if (this.isMenacing) {
                    this.isMenacing = false;
                }

                // Determine movement direction based on input keys
                const forward = this.direction.z > 0; // W key
                const backward = this.direction.z < 0; // S key
                const left = this.direction.x > 0; // A key
                const right = this.direction.x < 0; // D key

                // Choose animation based on direction, speed, and targeting state
                if (this.isTargeting && this.targetedEnemy) {
                    // TARGETING MODE: Use strafe animations for left/right movement
                    if (left && !forward && !backward) {
                        targetAnimation = 'run_left';
                    } else if (right && !forward && !backward) {
                        targetAnimation = 'run_right';
                    } else if (backward) {
                        targetAnimation = 'run_backward';
                    } else {
                        targetAnimation = 'run_forward';
                    }
                } else if (isSprinting) {
                    // NORMAL MODE with sprint: Use run animations
                    if (backward) {
                        targetAnimation = 'run_backward';
                    } else if (left && !forward && !backward) {
                        targetAnimation = 'run_left';
                    } else if (right && !forward && !backward) {
                        targetAnimation = 'run_right';
                    } else {
                        targetAnimation = 'run_forward'; // Forward, or diagonal
                    }
                } else {
                    // NORMAL MODE walking: Use walk animation (or run if walk not available)
                    targetAnimation = this.animations.walk ? 'walk' : 'run_forward';
                }
            } else {
                // Not moving - handle idle states
                this.idleTimer += delta;
                this.lastIdleVariation += delta;

                // Check for random idle variation (flourish)
                if (this.lastIdleVariation >= this.idleVariationInterval && !this.isMenacing) {
                    this.lastIdleVariation = 0;
                    this.idleVariationInterval = 5 + Math.random() * 5; // Reset random interval

                    // Random chance to play idle flourish
                    if (Math.random() < 0.5 && this.animations.idle_flourish) {
                        this.playAnimation('idle_flourish');
                        // Return to combat idle after flourish
                        const flourishClip = this.animations.idle_flourish.getClip();
                        setTimeout(() => {
                            if (!this.isAttacking && !this.isMenacing && this.direction.length() < 0.1) {
                                this.playAnimation('idle_combat');
                            }
                        }, flourishClip.duration * 1000);
                        return; // Don't override with targetAnimation
                    }
                }

                // Choose idle based on state
                if (this.isMenacing) {
                    targetAnimation = 'idle_menacing';
                } else if (this.isSheathed) {
                    targetAnimation = 'idle_sheathed';
                } else {
                    targetAnimation = 'idle_combat';
                }
            }

            // Play the target animation if it's different and exists
            if (this.animations[targetAnimation]) {
                if (this.currentAnimation !== this.animations[targetAnimation]) {
                    this.playAnimation(targetAnimation);
                }
            } else if (this.currentAnimation !== this.animations.idle) {
                this.playAnimation('idle');
            }
        }
    }

    updateCamera() {
        if (!this.mesh) return;

        if (this.isFirstPerson && !this.isAttacking) {
            // First-person camera (at eye level) - only when not attacking
            const eyePosition = new THREE.Vector3(
                this.mesh.position.x,
                this.mesh.position.y + this.firstPersonHeight,
                this.mesh.position.z
            );

            // Position camera at eye level
            this.camera.position.copy(eyePosition);

            // Look direction based on mouse movement (flipped to face forward)
            const lookDirection = new THREE.Vector3(
                -Math.sin(this.mouseX),
                this.mouseY,
                -Math.cos(this.mouseX)
            );

            const lookAt = eyePosition.clone().add(lookDirection);
            this.camera.lookAt(lookAt);

            // Hide character model in first person
            if (this.characterModel) {
                this.characterModel.visible = false;
            }
        } else if (this.isFirstPerson && this.isAttacking) {
            // Over-the-shoulder view when attacking in first person
            const shoulderDistance = 3;
            const shoulderHeight = 1.4;

            const cameraOffset = new THREE.Vector3(
                Math.sin(this.mouseX) * shoulderDistance,
                shoulderHeight + this.mouseY * 3,
                Math.cos(this.mouseX) * shoulderDistance
            );

            this.camera.position.copy(this.mesh.position).add(cameraOffset);
            this.camera.lookAt(this.mesh.position.x, this.mesh.position.y + 1.5, this.mesh.position.z);

            // Show character model when attacking in first person
            if (this.characterModel) {
                this.characterModel.visible = true;
            }
        } else if (this.isTargeting && this.targetedEnemy && this.targetedEnemy.mesh) {
            // TARGETING MODE: Camera behind player, looking toward target
            const targetPos = new THREE.Vector3();
            this.targetedEnemy.mesh.getWorldPosition(targetPos);
            targetPos.y += 1; // Aim at enemy's center

            // Get direction from player to target
            const dirToTarget = new THREE.Vector3();
            dirToTarget.subVectors(targetPos, this.mesh.position);
            dirToTarget.y = 0;
            dirToTarget.normalize();

            // Position camera behind player (opposite of target direction)
            const backDistance = this.cameraDistance;
            const heightOffset = 2.0;
            const shoulderOffset = 1.2;

            // Camera is positioned behind player, offset to the right
            const targetCameraPos = new THREE.Vector3(
                this.mesh.position.x - dirToTarget.x * backDistance - dirToTarget.z * shoulderOffset,
                this.mesh.position.y + heightOffset,
                this.mesh.position.z - dirToTarget.z * backDistance + dirToTarget.x * shoulderOffset
            );

            // Smoothly interpolate camera position (slower for smoother transition)
            const lerpFactor = 0.05;
            this.camera.position.lerp(targetCameraPos, lerpFactor);

            // Look at a point between player and target (closer to player)
            this.cameraLookAtTarget.set(
                this.mesh.position.x + dirToTarget.x * 2,
                this.mesh.position.y + 1.2,
                this.mesh.position.z + dirToTarget.z * 2
            );

            // Smoothly interpolate the lookAt point
            if (!this.cameraLookAtInitialized) {
                this.currentCameraLookAt.copy(this.cameraLookAtTarget);
                this.cameraLookAtInitialized = true;
            }
            this.currentCameraLookAt.lerp(this.cameraLookAtTarget, 0.05);
            this.camera.lookAt(this.currentCameraLookAt);

            // Show character model
            if (this.characterModel) {
                this.characterModel.visible = true;
            }
        } else {
            // Third-person over-the-shoulder camera (right shoulder)
            const shoulderOffset = 0.8; // Offset to the right
            const backDistance = this.cameraDistance; // Distance behind character
            const heightOffset = 1.5; // Height above character

            // Camera follows character directly with smooth interpolation
            const targetCameraPos = new THREE.Vector3(
                this.mesh.position.x + Math.sin(this.mouseX) * backDistance + Math.cos(this.mouseX) * shoulderOffset,
                this.mesh.position.y + heightOffset + this.mouseY * 2,
                this.mesh.position.z + Math.cos(this.mouseX) * backDistance - Math.sin(this.mouseX) * shoulderOffset
            );

            // Smoothly interpolate camera position (slower for smoother transition)
            const lerpFactor = 0.08;
            this.camera.position.lerp(targetCameraPos, lerpFactor);

            // Look at a point in front and slightly left of character (for over-right-shoulder view)
            const lookAheadDistance = 5; // Look ahead of character
            const lookLeftOffset = 0.6; // Offset left to balance right shoulder camera
            this.cameraLookAtTarget.set(
                this.mesh.position.x - Math.sin(this.mouseX) * lookAheadDistance + Math.cos(this.mouseX) * lookLeftOffset,
                this.mesh.position.y + 1.2,
                this.mesh.position.z - Math.cos(this.mouseX) * lookAheadDistance - Math.sin(this.mouseX) * lookLeftOffset
            );

            // Smoothly interpolate the lookAt point
            if (!this.cameraLookAtInitialized) {
                this.currentCameraLookAt.copy(this.cameraLookAtTarget);
                this.cameraLookAtInitialized = true;
            }
            this.currentCameraLookAt.lerp(this.cameraLookAtTarget, 0.08);
            this.camera.lookAt(this.currentCameraLookAt);

            // Show character model in third person
            if (this.characterModel) {
                this.characterModel.visible = true;
            }
        }
    }

    // Update target reticle position to follow the targeted enemy
    updateTargetReticle() {
        if (!this.targetReticle) return;

        if (this.isTargeting && this.targetedEnemy && this.targetedEnemy.mesh) {
            // Get enemy position
            const enemyPos = new THREE.Vector3();
            this.targetedEnemy.mesh.getWorldPosition(enemyPos);

            // Position triangle above enemy's head
            this.targetReticle.position.set(enemyPos.x, enemyPos.y + 2.5, enemyPos.z);

            // Make triangle always face the camera (billboard)
            this.targetReticle.lookAt(this.camera.position);

            // Bob up and down slightly
            this.targetReticle.position.y += Math.sin(Date.now() * 0.005) * 0.1;

            this.targetReticle.visible = true;
        } else {
            this.targetReticle.visible = false;
        }
    }

    // Toggle menacing stance
    toggleMenacingStance() {
        if (this.isMenacing) {
            // Exit menacing stance
            this.isMenacing = false;
            console.log('😌 Exiting menacing stance');
            if (this.animations.idle_menacing_end) {
                this.playAnimation('idle_menacing_end');
                // After end animation, go back to normal idle
                const endClip = this.animations.idle_menacing_end.getClip();
                setTimeout(() => {
                    if (!this.isMenacing && !this.isAttacking) {
                        this.playAnimation('idle_combat');
                    }
                }, endClip.duration * 1000);
            }
        } else {
            // Enter menacing stance
            this.isMenacing = true;
            console.log('😤 Entering menacing stance');
            if (this.animations.idle_menacing_begin) {
                this.playAnimation('idle_menacing_begin');
                // After begin animation, loop the menacing idle
                const beginClip = this.animations.idle_menacing_begin.getClip();
                setTimeout(() => {
                    if (this.isMenacing && !this.isAttacking) {
                        this.playAnimation('idle_menacing');
                    }
                }, beginClip.duration * 1000);
            }
        }
    }

    // Toggle sheathe/draw sword
    toggleSheathe() {
        if (this.isSheathing) return; // Already in animation

        this.isSheathing = true;

        if (this.isSheathed) {
            // Draw sword
            console.log('⚔️ Drawing sword');

            if (this.animations.draw_sword) {
                this.playAnimation('draw_sword');
                const drawClip = this.animations.draw_sword.getClip();

                // Move sword from hip to hand partway through animation
                setTimeout(() => {
                    this.moveSwordToHand();
                }, drawClip.duration * 500); // Move at 50% of animation

                // After draw animation completes
                setTimeout(() => {
                    this.isSheathed = false;
                    this.isSheathing = false;
                    this.playAnimation('idle_combat');
                }, drawClip.duration * 1000);
            } else {
                // No animation, just move sword
                this.moveSwordToHand();
                this.isSheathed = false;
                this.isSheathing = false;
            }
        } else {
            // Sheathe sword
            console.log('🗡️ Sheathing sword');

            if (this.animations.sheathe_sword) {
                this.playAnimation('sheathe_sword');
                const sheatheClip = this.animations.sheathe_sword.getClip();

                // Move sword from hand to hip partway through animation
                setTimeout(() => {
                    this.moveSwordToHip();
                }, sheatheClip.duration * 500); // Move at 50% of animation

                // After sheathe animation completes
                setTimeout(() => {
                    this.isSheathed = true;
                    this.isSheathing = false;
                    if (this.animations.idle_sheathed) {
                        this.playAnimation('idle_sheathed');
                    } else {
                        this.playAnimation('idle');
                    }
                }, sheatheClip.duration * 1000);
            } else {
                // No animation, just move sword
                this.moveSwordToHip();
                this.isSheathed = true;
                this.isSheathing = false;
            }
        }
    }

    // Move sword from hip to hand
    moveSwordToHand() {
        if (!this.equippedSword || !this.handBone) return;

        // Remove from current parent
        if (this.equippedSword.parent) {
            this.equippedSword.parent.remove(this.equippedSword);
        }

        // Attach to hand
        this.handBone.add(this.equippedSword);
        this.equippedSword.position.set(0, 0, 0);
        this.equippedSword.rotation.set(Math.PI, 0, 0); // Same rotation as before
        this.equippedSword.scale.set(1, 1, 1);

        console.log('⚔️ Sword moved to hand');
    }

    // Move sword from hand to hip
    moveSwordToHip() {
        if (!this.equippedSword || !this.hipBone) return;

        // Remove from current parent
        if (this.equippedSword.parent) {
            this.equippedSword.parent.remove(this.equippedSword);
        }

        // Attach to hip
        this.hipBone.add(this.equippedSword);
        // Position and rotate for hip attachment (adjust as needed)
        this.equippedSword.position.set(0.3, -0.1, 0.1); // Moved right
        this.equippedSword.rotation.set(Math.PI, 0, -Math.PI / 12); // 180 on X axis, slight angle
        this.equippedSword.scale.set(1, 1, 1);

        console.log('🗡️ Sword moved to hip');
    }

    // Toggle targeting mode
    toggleTargeting() {
        if (this.isTargeting) {
            // Turn off targeting
            this.isTargeting = false;
            this.targetedEnemy = null;
            if (this.targetReticle) {
                this.targetReticle.visible = false;
            }
            console.log('🎯 Target lock OFF');
        } else {
            // Find closest enemy to center of screen and lock on
            const enemy = this.findClosestEnemyToCenter();
            if (enemy) {
                this.isTargeting = true;
                this.targetedEnemy = enemy;
                if (this.targetReticle) {
                    this.targetReticle.visible = true;
                }
                console.log('🎯 Target lock ON:', enemy);
            } else {
                console.log('🎯 No enemy to target');
            }
        }
    }

    // Find the enemy closest to the center of the screen
    findClosestEnemyToCenter() {
        if (!this.goblinSpawner || !this.goblinSpawner.goblins.length) {
            return null;
        }

        const screenCenter = new THREE.Vector2(0, 0); // NDC center
        let closestEnemy = null;
        let closestDistance = Infinity;

        for (const goblin of this.goblinSpawner.goblins) {
            if (!goblin.mesh) continue;

            // Get goblin's screen position
            const goblinPos = new THREE.Vector3();
            goblin.mesh.getWorldPosition(goblinPos);
            goblinPos.y += 1; // Aim at center of goblin

            // Project to screen space
            const screenPos = goblinPos.clone().project(this.camera);

            // Check if in front of camera (z < 1)
            if (screenPos.z > 1) continue;

            // Calculate distance from screen center
            const distToCenter = Math.sqrt(screenPos.x * screenPos.x + screenPos.y * screenPos.y);

            // Also check 3D distance - don't target enemies too far away
            const distToPlayer = this.mesh.position.distanceTo(goblinPos);
            if (distToPlayer > 50) continue; // Max targeting range

            if (distToCenter < closestDistance) {
                closestDistance = distToCenter;
                closestEnemy = goblin;
            }
        }

        return closestEnemy;
    }

    // Check if player is flicking mouse to switch targets
    checkTargetSwitch() {
        if (!this.goblinSpawner || !this.goblinSpawner.goblins.length) return;

        // Track accumulated mouse movement for target switching
        if (this.targetSwitchAccum === undefined) {
            this.targetSwitchAccum = 0;
            this.targetSwitchCooldown = 0;
        }

        // Cooldown to prevent rapid switching
        if (this.targetSwitchCooldown > 0) {
            this.targetSwitchCooldown -= 0.016; // ~60fps
            return;
        }

        // Accumulate horizontal mouse movement (mouseMovementX is set in mouse handler)
        const threshold = 0.015; // Mouse movement threshold to trigger switch

        // Check if mouse moved enough horizontally
        if (Math.abs(this.lastMouseDeltaX || 0) < threshold) {
            this.targetSwitchAccum = 0;
            return;
        }

        const direction = this.lastMouseDeltaX > 0 ? -1 : 1; // Inverted: mouse right = target left, mouse left = target right

        // Get current target's position relative to player
        const currentTargetPos = new THREE.Vector3();
        this.targetedEnemy.mesh.getWorldPosition(currentTargetPos);
        const dirToCurrentTarget = new THREE.Vector3();
        dirToCurrentTarget.subVectors(currentTargetPos, this.mesh.position);
        dirToCurrentTarget.y = 0;
        dirToCurrentTarget.normalize();

        // Find best candidate in the direction of mouse movement
        let bestCandidate = null;
        let bestScore = Infinity;

        for (const goblin of this.goblinSpawner.goblins) {
            if (!goblin.mesh || goblin.isDead) continue;
            if (goblin === this.targetedEnemy) continue;

            const goblinPos = new THREE.Vector3();
            goblin.mesh.getWorldPosition(goblinPos);

            // Check distance
            const distToPlayer = this.mesh.position.distanceTo(goblinPos);
            if (distToPlayer > 30) continue;

            // Get direction to this goblin
            const dirToGoblin = new THREE.Vector3();
            dirToGoblin.subVectors(goblinPos, this.mesh.position);
            dirToGoblin.y = 0;
            dirToGoblin.normalize();

            // Calculate angle difference from current target
            // Cross product Y gives us left/right relationship
            const cross = dirToCurrentTarget.x * dirToGoblin.z - dirToCurrentTarget.z * dirToGoblin.x;

            // cross > 0 means goblin is to the LEFT of current target
            // cross < 0 means goblin is to the RIGHT of current target
            const isInDirection = (direction > 0 && cross < 0) || (direction < 0 && cross > 0);

            if (!isInDirection) continue;

            // Score by how close it is to the "next" target in that direction
            const angleDiff = Math.abs(cross);
            const score = distToPlayer + (1 - angleDiff) * 20; // Prefer closer targets that are more to the side

            if (score < bestScore) {
                bestScore = score;
                bestCandidate = goblin;
            }
        }

        // Switch to new target if found
        if (bestCandidate) {
            this.targetedEnemy = bestCandidate;
            this.targetSwitchCooldown = 0.3; // 300ms cooldown
            console.log('🎯 Switched target!');
        }

        // Reset mouse delta
        this.lastMouseDeltaX = 0;
    }

    // Find the closest living enemy by distance to player
    findClosestEnemy() {
        if (!this.goblinSpawner || !this.goblinSpawner.goblins.length) {
            return null;
        }

        let closestEnemy = null;
        let closestDistance = Infinity;

        for (const goblin of this.goblinSpawner.goblins) {
            if (!goblin.mesh || goblin.isDead) continue;

            // Calculate 3D distance to player
            const distToPlayer = this.mesh.position.distanceTo(goblin.mesh.position);

            // Max targeting range
            if (distToPlayer > 50) continue;

            if (distToPlayer < closestDistance) {
                closestDistance = distToPlayer;
                closestEnemy = goblin;
            }
        }

        return closestEnemy;
    }

    // Get direction to target
    getDirectionToTarget() {
        if (!this.targetedEnemy || !this.targetedEnemy.mesh) return null;

        const targetPos = new THREE.Vector3();
        this.targetedEnemy.mesh.getWorldPosition(targetPos);

        const direction = new THREE.Vector3();
        direction.subVectors(targetPos, this.mesh.position);
        direction.y = 0; // Only horizontal
        direction.normalize();

        return direction;
    }

    getPosition() {
        return this.mesh ? {
            x: this.mesh.position.x,
            y: this.mesh.position.y,
            z: this.mesh.position.z
        } : { x: 0, y: 0, z: 0 };
    }

    getRotation() {
        return this.mesh ? {
            x: this.mesh.rotation.x,
            y: this.mesh.rotation.y,
            z: this.mesh.rotation.z
        } : { x: 0, y: 0, z: 0 };
    }

}
