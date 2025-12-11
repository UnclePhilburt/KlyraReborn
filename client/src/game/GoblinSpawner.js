import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export class GoblinSpawner {
    constructor(scene, worldManager) {
        this.scene = scene;
        this.worldManager = worldManager;
        this.goblins = [];
        this.loader = new GLTFLoader();
        this.fbxLoader = new FBXLoader();
        this.textureLoader = new THREE.TextureLoader();
        this.animations = {};
        this.goblinModel = null;
        this.capeModel = null;
        this.swordModel = null;
        this.texture = null;
        this.playerController = null; // Reference for collision

        // Dancing system settings
        this.danceDetectionRadius = 4; // How close goblins need to be to dance together
        this.playerAlertRadius = 15; // Distance at which goblins notice player
        this.playerDangerRadius = 8; // Distance at which all goblins react
        this.danceAnimations = []; // List of available dance animations

        // Advanced AI settings
        this.tauntRadius = 12; // Distance for taunting (close enough to taunt, far enough to flee)
        this.flankingRadius = 5; // Ideal flanking distance from player
        this.allyDetectionRadius = 8; // How far to look for allies for courage calculation

        // Ranged attack settings
        this.throwRange = 15; // Maximum throw distance
        this.throwMinRange = 5; // Minimum distance to throw (don't throw if too close)
        this.projectiles = []; // Active projectiles in the scene
        this.projectileSpeed = 12; // Units per second
        this.projectileDamage = 10;

        // Damage numbers
        this.damageNumbers = [];
    }

    setPlayerController(controller) {
        this.playerController = controller;
    }

    async init() {
        // Load goblin model and animations
        await this.loadAssets();
    }

    async loadAssets() {
        console.log('🎮 GoblinSpawner: Starting asset load...');

        // Load the goblin texture
        try {
            this.texture = await new Promise((resolve, reject) => {
                this.textureLoader.load(
                    '/assets/enemies/goblin/PolygonGoblinWarCamp_Texture_01_A.png',
                    (tex) => {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        tex.flipY = false;
                        resolve(tex);
                    },
                    undefined,
                    reject
                );
            });
            console.log('✅ Goblin texture loaded');
        } catch (e) {
            console.warn('Could not load goblin texture:', e);
        }

        // Load the goblin model
        try {
            console.log('📥 Loading goblin model from /assets/enemies/goblin/CharactersBR.glb');
            const gltf = await this.loader.loadAsync('/assets/enemies/goblin/CharactersBR.glb');
            this.goblinModel = gltf;
            console.log('✅ Goblin model loaded:', gltf);
            console.log('   Scene:', gltf.scene);
            console.log('   Animations:', gltf.animations);

            // Load animations
            const animNames = ['idle', 'run_forward', 'run_backward', 'run_left', 'run_right'];
            for (const name of animNames) {
                try {
                    const animGltf = await this.loader.loadAsync(`/assets/enemies/goblin/${name}.glb`);
                    if (animGltf.animations && animGltf.animations.length > 0) {
                        this.animations[name] = animGltf.animations[0];
                        console.log(`✅ Loaded goblin animation: ${name}`);
                    }
                } catch (e) {
                    console.warn(`Could not load animation ${name}:`, e);
                }
            }

            // Load cape model
            try {
                const capeGltf = await this.loader.loadAsync('/assets/enemies/goblin/Capes_BR.glb');
                this.capeModel = capeGltf.scene;
                console.log('✅ Goblin cape loaded:', this.capeModel);
                // Log what's in the cape model
                this.capeModel.traverse((child) => {
                    console.log('   Cape child:', child.type, child.name);
                });
            } catch (e) {
                console.warn('Could not load goblin cape:', e);
            }

            // Load sword model
            try {
                const swordGltf = await this.loader.loadAsync('/assets/weapons/SM_Wep_Sword_01.glb');
                this.swordModel = swordGltf.scene;
                console.log('✅ Goblin sword loaded');
            } catch (e) {
                console.warn('Could not load goblin sword:', e);
            }

        } catch (e) {
            console.error('❌ Failed to load goblin model:', e);
        }

        // Load attack animations (GLB from Mixamo)
        try {
            console.log('📥 Loading attack animations...');

            // Load slash attack
            const slashGltf = await this.loader.loadAsync('/assets/enemies/goblin/great_sword_slash.glb');
            if (slashGltf.animations && slashGltf.animations.length > 0) {
                this.animations.attack_slash = this.remapMixamoAnimation(slashGltf.animations[0]);
                console.log('✅ Loaded goblin slash animation');
            }

            // Load kick attack
            const kickGltf = await this.loader.loadAsync('/assets/enemies/goblin/kick.glb');
            if (kickGltf.animations && kickGltf.animations.length > 0) {
                this.animations.attack_kick = this.remapMixamoAnimation(kickGltf.animations[0]);
                console.log('✅ Loaded goblin kick animation');
            }

            // Load impact/hit reaction
            const impactGltf = await this.loader.loadAsync('/assets/enemies/goblin/impact.glb');
            if (impactGltf.animations && impactGltf.animations.length > 0) {
                this.animations.impact = this.remapMixamoAnimation(impactGltf.animations[0]);
                console.log('✅ Loaded goblin impact animation');
            }

            // Load dying animation
            const dyingGltf = await this.loader.loadAsync('/assets/enemies/goblin/dying.glb');
            if (dyingGltf.animations && dyingGltf.animations.length > 0) {
                this.animations.dying = this.remapMixamoAnimation(dyingGltf.animations[0]);
                console.log('✅ Loaded goblin dying animation');
            }

            // Load tripping animation
            const trippingGltf = await this.loader.loadAsync('/assets/enemies/goblin/Tripping.glb');
            if (trippingGltf.animations && trippingGltf.animations.length > 0) {
                this.animations.tripping = this.remapMixamoAnimation(trippingGltf.animations[0]);
                console.log('✅ Loaded goblin tripping animation');
            }

            // Load throw animation
            const throwGltf = await this.loader.loadAsync('/assets/enemies/goblin/Throw_Object.glb');
            if (throwGltf.animations && throwGltf.animations.length > 0) {
                this.animations.throw = this.remapMixamoAnimation(throwGltf.animations[0]);
                console.log('✅ Loaded goblin throw animation');
            }

            // Store attack list for random selection
            this.attackAnimations = ['attack_slash', 'attack_kick'].filter(name => this.animations[name]);
            console.log('✅ Goblin attacks available:', this.attackAnimations);
        } catch (e) {
            console.error('❌ Could not load attack animations:', e);
        }

        // Load dance animations
        try {
            console.log('💃 Loading dance animations...');

            // Dance animations from Mixamo
            const danceFiles = [
                'Booty_Hip_Hop_Dance',
                'Shopping_Cart_Dance',
                'Snake_Hip_Hop_Dance',
                'Step_Hip_Hop_Dance',
                'Tut_Hip_Hop_Dance',
                'Thriller_Part_2',
                'Thriller_Part_4'
            ];

            for (const danceName of danceFiles) {
                try {
                    const danceGltf = await this.loader.loadAsync(`/assets/enemies/goblin/${danceName}.glb`);
                    if (danceGltf.animations && danceGltf.animations.length > 0) {
                        this.animations[danceName] = this.remapMixamoAnimation(danceGltf.animations[0]);
                        this.danceAnimations.push(danceName);
                        console.log(`✅ Loaded goblin dance: ${danceName}`);
                    }
                } catch (e) {
                    // Silently skip missing dance files
                }
            }

            if (this.danceAnimations.length > 0) {
                console.log(`💃 Dance animations available: ${this.danceAnimations.join(', ')}`);
            } else {
                console.log('⚠️ No dance animations found - add GLB files named dance_1.glb, dance_2.glb, etc.');
            }
        } catch (e) {
            console.warn('Could not load dance animations:', e);
        }
    }

    // Remap Mixamo bone names to Synty skeleton
    remapMixamoAnimation(clip) {
        const boneMap = {
            'mixamorigHips': 'Hips',
            'mixamorigSpine': 'Spine_01',
            'mixamorigSpine1': 'Spine_02',
            'mixamorigSpine2': 'Spine_03',
            'mixamorigNeck': 'Neck',
            'mixamorigHead': 'Head',
            'mixamorigLeftShoulder': 'Clavicle_L',
            'mixamorigLeftArm': 'Shoulder_L',
            'mixamorigLeftForeArm': 'Elbow_L',
            'mixamorigLeftHand': 'Hand_L',
            'mixamorigRightShoulder': 'Clavicle_R',
            'mixamorigRightArm': 'Shoulder_R',
            'mixamorigRightForeArm': 'Elbow_R',
            'mixamorigRightHand': 'Hand_R',
            'mixamorigLeftUpLeg': 'UpperLeg_L',
            'mixamorigLeftLeg': 'LowerLeg_L',
            'mixamorigLeftFoot': 'Ankle_L',
            'mixamorigLeftToeBase': 'Toes_L',
            'mixamorigRightUpLeg': 'UpperLeg_R',
            'mixamorigRightLeg': 'LowerLeg_R',
            'mixamorigRightFoot': 'Ankle_R',
            'mixamorigRightToeBase': 'Toes_R',
        };

        console.log('🎬 Animation tracks before remap:');
        clip.tracks.forEach(track => console.log('   ', track.name));

        const newTracks = [];
        for (const track of clip.tracks) {
            let newName = track.name;

            // Skip ALL position tracks (prevents weird transformations from bone mismatches)
            if (track.name.includes('.position')) {
                console.log('   ⏭️ Skipping position track:', track.name);
                continue;
            }

            // Replace Mixamo bone names with Synty names
            for (const [mixamo, synty] of Object.entries(boneMap)) {
                if (track.name.includes(mixamo)) {
                    newName = track.name.replace(mixamo, synty);
                    break;
                }
            }

            newTracks.push(new THREE.KeyframeTrack(
                newName,
                track.times,
                track.values
            ));
        }

        console.log('🎬 Animation tracks after remap:');
        newTracks.forEach(track => console.log('   ', track.name));

        return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
    }

    // Play a random attack animation on a goblin
    playRandomAttack(goblin) {
        if (!this.attackAnimations || this.attackAnimations.length === 0) {
            console.warn('No attack animations available');
            return;
        }

        // Pick random attack
        const attackName = this.attackAnimations[Math.floor(Math.random() * this.attackAnimations.length)];
        const attackAnim = this.animations[attackName];

        if (attackAnim && goblin.mixer) {
            if (goblin.currentAction) {
                goblin.currentAction.fadeOut(0.15);
            }
            goblin.currentAction = goblin.mixer.clipAction(attackAnim);
            goblin.currentAction.setLoop(THREE.LoopOnce);
            goblin.currentAction.clampWhenFinished = true;
            goblin.currentAction.reset().fadeIn(0.15).play();
            goblin.currentAttack = attackName; // Track which attack is playing
            console.log(`⚔️ Goblin uses ${attackName}!`);
        }
    }

    // ==================== DANCING SYSTEM ====================

    // Find a nearby goblin that can be a dance partner
    findDancePartner(goblin) {
        if (this.danceAnimations.length === 0) return null;

        for (const other of this.goblins) {
            // Skip self, dead goblins, and goblins already dancing/fighting
            if (other === goblin || other.isDead) continue;
            if (other.state === 'dancing' || other.state === 'attacking' || other.state === 'staggered') continue;
            if (other.dancePartner) continue; // Already has a partner

            // Check distance
            const dx = goblin.mesh.position.x - other.mesh.position.x;
            const dz = goblin.mesh.position.z - other.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < this.danceDetectionRadius) {
                return other;
            }
        }
        return null;
    }

    // Start dancing with a partner - both goblins face each other and sync animations
    startDancing(goblin, partner) {
        if (this.danceAnimations.length === 0) return;

        // Pick a random dance animation
        const danceName = this.danceAnimations[Math.floor(Math.random() * this.danceAnimations.length)];
        const danceAnim = this.animations[danceName];

        if (!danceAnim) return;

        // Link partners
        goblin.dancePartner = partner;
        partner.dancePartner = goblin;

        // Set states
        goblin.state = 'dancing';
        partner.state = 'dancing';
        goblin.currentDance = danceName;
        partner.currentDance = danceName;
        goblin.danceTimer = 0;
        partner.danceTimer = 0;

        // Random dance duration: 1-2 loops of the animation
        const loops = 1 + Math.random(); // 1 to 2 loops
        const maxDuration = danceAnim.duration * loops;
        goblin.maxDanceDuration = maxDuration;
        partner.maxDanceDuration = maxDuration;
        goblin.danceLoops = 0;
        partner.danceLoops = 0;

        // Face each other
        const dx = partner.mesh.position.x - goblin.mesh.position.x;
        const dz = partner.mesh.position.z - goblin.mesh.position.z;
        const angleToPartner = Math.atan2(dx, dz);
        goblin.mesh.rotation.y = angleToPartner;
        partner.mesh.rotation.y = angleToPartner + Math.PI; // Face opposite direction

        // Start dance animation on both - synchronized!
        for (const dancer of [goblin, partner]) {
            if (dancer.currentAction) {
                dancer.currentAction.fadeOut(0.3);
            }
            dancer.currentAction = dancer.mixer.clipAction(danceAnim);
            dancer.currentAction.setLoop(THREE.LoopRepeat);
            dancer.currentAction.reset().fadeIn(0.3).play();
        }

        console.log(`💃 Two goblins started dancing: ${danceName}! (${maxDuration.toFixed(1)}s)`);
    }

    // Start solo dancing - goblin dances alone
    startSoloDancing(goblin) {
        if (this.danceAnimations.length === 0) return;

        // Pick a random dance animation
        const danceName = this.danceAnimations[Math.floor(Math.random() * this.danceAnimations.length)];
        const danceAnim = this.animations[danceName];

        if (!danceAnim) return;

        // Set state
        goblin.state = 'dancing';
        goblin.dancePartner = null; // Solo!
        goblin.currentDance = danceName;
        goblin.danceTimer = 0;

        // Random dance duration: 0.5-1.5 loops (shorter for solo)
        const loops = 0.5 + Math.random(); // 0.5 to 1.5 loops
        goblin.maxDanceDuration = danceAnim.duration * loops;
        goblin.danceLoops = 0;

        // Start dance animation
        if (goblin.currentAction) {
            goblin.currentAction.fadeOut(0.3);
        }
        goblin.currentAction = goblin.mixer.clipAction(danceAnim);
        goblin.currentAction.setLoop(THREE.LoopRepeat);
        goblin.currentAction.reset().fadeIn(0.3).play();

        console.log(`💃 Goblin started solo dancing: ${danceName}!`);
    }

    // Stop dancing and clear partner reference
    stopDancing(goblin, reason = 'finished') {
        const partner = goblin.dancePartner;

        // Clear dance state for this goblin
        goblin.dancePartner = null;
        goblin.currentDance = null;
        goblin.danceTimer = 0;

        // Also clear partner's dance state if they exist
        if (partner && partner.dancePartner === goblin) {
            partner.dancePartner = null;
            partner.currentDance = null;
            partner.danceTimer = 0;
        }

        console.log(`🛑 Goblin stopped dancing (${reason})`);
    }

    // Check if player is close enough to alert this goblin
    getDistanceToPlayer(goblin) {
        if (!this.playerController || !this.playerController.mesh) return Infinity;

        const playerPos = this.playerController.mesh.position;
        const dx = playerPos.x - goblin.mesh.position.x;
        const dz = playerPos.z - goblin.mesh.position.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    // Alert nearby dancing goblins that player was spotted
    alertNearbyGoblins(alerter) {
        for (const goblin of this.goblins) {
            if (goblin === alerter || goblin.isDead) continue;
            if (goblin.hasNoticedPlayer) continue; // Already knows

            const dx = alerter.mesh.position.x - goblin.mesh.position.x;
            const dz = alerter.mesh.position.z - goblin.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            // Alert goblins within earshot (8 units)
            if (dist < 8) {
                goblin.alertedBy = alerter;
                // Don't immediately change state - let them react based on personality
            }
        }
    }

    // Play a "scramble" reaction - goblin realizes they've been caught
    playScrambleReaction(goblin) {
        goblin.state = 'scrambling';
        goblin.scrambleTimer = 0;

        // Face player
        if (this.playerController && this.playerController.mesh) {
            const playerPos = this.playerController.mesh.position;
            const dx = playerPos.x - goblin.mesh.position.x;
            const dz = playerPos.z - goblin.mesh.position.z;
            const angle = Math.atan2(dx, dz);
            goblin.mesh.rotation.y = angle;
        }

        // Use impact animation as a startled reaction, or idle if not available
        if (this.animations.impact && goblin.mixer) {
            if (goblin.currentAction) {
                goblin.currentAction.stop();
            }
            goblin.currentAction = goblin.mixer.clipAction(this.animations.impact);
            goblin.currentAction.setLoop(THREE.LoopOnce);
            goblin.currentAction.clampWhenFinished = true;
            goblin.currentAction.reset().play();
        }

        console.log(`😱 Goblin scrambles! (personality: ${goblin.personality.toFixed(2)})`);
    }

    // ==================== ADVANCED AI METHODS ====================

    // Count nearby living allies for courage calculation
    countNearbyAllies(goblin) {
        let count = 0;
        for (const other of this.goblins) {
            if (other === goblin || other.isDead) continue;

            const dx = goblin.mesh.position.x - other.mesh.position.x;
            const dz = goblin.mesh.position.z - other.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < this.allyDetectionRadius) {
                count++;
            }
        }
        return count;
    }

    // Calculate courage based on allies, health, and personality
    calculateCourage(goblin) {
        const nearbyAllies = this.countNearbyAllies(goblin);
        const healthPercent = goblin.health / goblin.maxHealth;

        // Base courage + ally bonus (each ally adds 0.15 courage, max 0.6 from allies)
        let courage = goblin.baseCourage;
        courage += Math.min(nearbyAllies * 0.15, 0.6);

        // Health penalty (lose up to 0.3 courage when low health)
        courage -= (1 - healthPercent) * 0.3;

        // Rally bonus (temporary courage boost)
        if (goblin.isRallied && goblin.rallyTimer > 0) {
            courage += 0.3;
        }

        // Clamp to 0-1
        goblin.currentCourage = Math.max(0, Math.min(1, courage));
        return goblin.currentCourage;
    }

    // Rally nearby goblins when one charges
    rallyNearbyGoblins(rallier) {
        let ralliedCount = 0;
        for (const goblin of this.goblins) {
            if (goblin === rallier || goblin.isDead) continue;
            if (goblin.state === 'attacking' || goblin.state === 'dancing') continue;

            const dx = rallier.mesh.position.x - goblin.mesh.position.x;
            const dz = rallier.mesh.position.z - goblin.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            // Rally goblins within 6 units
            if (dist < 6) {
                // Chance to be rallied based on courage and personality
                const rallyChance = 0.4 + goblin.currentCourage * 0.4; // 40-80% chance
                if (Math.random() < rallyChance) {
                    goblin.isRallied = true;
                    goblin.rallyTimer = 3 + Math.random() * 2; // Rally lasts 3-5 seconds
                    ralliedCount++;
                }
            }
        }
        if (ralliedCount > 0) {
            console.log(`📢 Goblin rallied ${ralliedCount} allies!`);
        }
    }

    // Start taunting the player (dance from distance, then flee)
    startTaunting(goblin) {
        if (this.danceAnimations.length === 0) return;

        goblin.state = 'taunting';
        goblin.isTaunting = true;
        goblin.tauntTimer = 1.5 + Math.random() * 1.5; // Taunt for 1.5-3 seconds

        // Face player
        if (this.playerController && this.playerController.mesh) {
            const playerPos = this.playerController.mesh.position;
            const dx = playerPos.x - goblin.mesh.position.x;
            const dz = playerPos.z - goblin.mesh.position.z;
            goblin.mesh.rotation.y = Math.atan2(dx, dz);
        }

        // Play a random dance as taunt
        const danceName = this.danceAnimations[Math.floor(Math.random() * this.danceAnimations.length)];
        const danceAnim = this.animations[danceName];

        if (danceAnim && goblin.mixer) {
            if (goblin.currentAction) {
                goblin.currentAction.fadeOut(0.2);
            }
            goblin.currentAction = goblin.mixer.clipAction(danceAnim);
            goblin.currentAction.setLoop(THREE.LoopRepeat);
            goblin.currentAction.reset().fadeIn(0.2).play();
        }

        console.log(`🤪 Goblin taunts the player!`);
    }

    // Play tripping animation (goblin falls over)
    playTripping(goblin) {
        if (!this.animations.tripping || !goblin.mixer) return;

        goblin.state = 'tripping';
        goblin.lastTripTime = Date.now();

        if (goblin.currentAction) {
            goblin.currentAction.stop();
        }

        goblin.currentAction = goblin.mixer.clipAction(this.animations.tripping);
        goblin.currentAction.setLoop(THREE.LoopOnce);
        goblin.currentAction.clampWhenFinished = true;
        goblin.currentAction.reset().play();

        console.log(`🤸 Goblin trips and falls!`);
    }

    // ==================== RANGED ATTACK SYSTEM ====================

    // Create a simple rock projectile mesh
    createProjectile(startPos, targetPos, thrower) {
        // Create a rough rock shape using icosahedron (low poly sphere)
        const geometry = new THREE.IcosahedronGeometry(0.15, 0);

        // Brown/gray rock material
        const material = new THREE.MeshStandardMaterial({
            color: 0x666655,
            roughness: 0.9,
            metalness: 0.1,
            flatShading: true
        });

        const rock = new THREE.Mesh(geometry, material);
        rock.castShadow = true;

        // Start at goblin's hand position (offset from mesh)
        rock.position.copy(startPos);
        rock.position.y += 1.2; // Hand height

        // Calculate direction to target
        const direction = new THREE.Vector3();
        direction.subVectors(targetPos, rock.position);

        // Add arc - aim slightly above target
        const distance = direction.length();
        direction.y += distance * 0.3; // Arc upward
        direction.normalize();

        const projectile = {
            mesh: rock,
            velocity: direction.multiplyScalar(this.projectileSpeed),
            gravity: -15, // Gravity pull
            lifetime: 3, // Max seconds before despawn
            age: 0,
            thrower: thrower,
            damage: this.projectileDamage
        };

        this.scene.add(rock);
        this.projectiles.push(projectile);

        console.log(`🪨 Goblin throws a rock!`);
        return projectile;
    }

    // Update all projectiles
    updateProjectiles(delta) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.age += delta;

            // Apply gravity
            proj.velocity.y += proj.gravity * delta;

            // Move projectile
            proj.mesh.position.x += proj.velocity.x * delta;
            proj.mesh.position.y += proj.velocity.y * delta;
            proj.mesh.position.z += proj.velocity.z * delta;

            // Spin the rock as it flies
            proj.mesh.rotation.x += delta * 8;
            proj.mesh.rotation.z += delta * 5;

            // Check if hit ground
            let groundY = 0;
            if (this.worldManager) {
                groundY = this.worldManager.getTerrainHeight(proj.mesh.position.x, proj.mesh.position.z) || 0;
            }

            if (proj.mesh.position.y < groundY) {
                // Hit ground - remove
                this.removeProjectile(i);
                continue;
            }

            // Check if hit player
            if (this.playerController && this.playerController.mesh) {
                const playerPos = this.playerController.mesh.position;
                const dx = proj.mesh.position.x - playerPos.x;
                const dy = proj.mesh.position.y - (playerPos.y + 1); // Player center height
                const dz = proj.mesh.position.z - playerPos.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (dist < 0.8) { // Hit radius
                    console.log(`💥 Player hit by rock for ${proj.damage} damage!`);
                    // TODO: Apply damage to player when health system exists
                    this.removeProjectile(i);
                    continue;
                }
            }

            // Timeout
            if (proj.age > proj.lifetime) {
                this.removeProjectile(i);
            }
        }
    }

    // Remove a projectile
    removeProjectile(index) {
        const proj = this.projectiles[index];
        this.scene.remove(proj.mesh);
        proj.mesh.geometry.dispose();
        proj.mesh.material.dispose();
        this.projectiles.splice(index, 1);
    }

    // Start throwing animation and launch projectile
    startThrowing(goblin) {
        if (!this.animations.throw || !goblin.mixer) return;
        if (!this.playerController || !this.playerController.mesh) return;

        goblin.state = 'throwing';
        goblin.throwTimer = 0;
        goblin.hasThrown = false;

        // Face player
        const playerPos = this.playerController.mesh.position;
        const dx = playerPos.x - goblin.mesh.position.x;
        const dz = playerPos.z - goblin.mesh.position.z;
        goblin.mesh.rotation.y = Math.atan2(dx, dz);

        // Play throw animation
        if (goblin.currentAction) {
            goblin.currentAction.fadeOut(0.15);
        }
        goblin.currentAction = goblin.mixer.clipAction(this.animations.throw);
        goblin.currentAction.setLoop(THREE.LoopOnce);
        goblin.currentAction.clampWhenFinished = true;
        goblin.currentAction.reset().fadeIn(0.15).play();

        console.log(`🎯 Goblin winds up to throw!`);
    }

    // Get flanking position to circle around player
    getFlankingPosition(goblin) {
        if (!this.playerController || !this.playerController.mesh) return null;

        const playerPos = this.playerController.mesh.position;

        // Update flank angle slowly (creates circling motion)
        goblin.flankAngle += 0.02; // Slowly rotate around player

        // Calculate position at flanking radius from player
        const targetX = playerPos.x + Math.cos(goblin.flankAngle) * this.flankingRadius;
        const targetZ = playerPos.z + Math.sin(goblin.flankAngle) * this.flankingRadius;

        return { x: targetX, z: targetZ };
    }

    // Check if player is distracted (fighting another goblin)
    isPlayerDistracted() {
        if (!this.playerController) return false;

        // Player is distracted if attacking
        if (this.playerController.isAttacking) return true;

        // Player is distracted if being attacked by another goblin
        for (const goblin of this.goblins) {
            if (goblin.isDead) continue;
            if (goblin.state === 'attacking') {
                const distToPlayer = this.getDistanceToPlayer(goblin);
                if (distToPlayer < 3) return true; // Another goblin is in melee
            }
        }
        return false;
    }

    spawnGoblins(count = 5, centerX = 0, centerZ = 0, radius = 20) {
        console.log(`🎮 spawnGoblins called: count=${count}, center=(${centerX}, ${centerZ}), radius=${radius}`);

        if (!this.goblinModel) {
            console.error('❌ Goblin model not loaded yet!');
            return;
        }

        console.log('✅ Goblin model exists, spawning...');
        for (let i = 0; i < count; i++) {
            // Random position within radius
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius;
            const x = centerX + Math.cos(angle) * dist;
            const z = centerZ + Math.sin(angle) * dist;

            this.spawnGoblin(x, z);
        }
        console.log(`✅ Spawned ${this.goblins.length} goblins total`);
    }

    spawnGoblin(x, z) {
        console.log(`🎮 spawnGoblin at (${x.toFixed(1)}, ${z.toFixed(1)})`);

        // Use SkeletonUtils to properly clone skinned meshes
        const goblinScene = SkeletonUtils.clone(this.goblinModel.scene);
        console.log('   Cloned scene:', goblinScene);

        // Log bone names to debug
        const boneNames = [];
        goblinScene.traverse((child) => {
            if (child.isBone) {
                boneNames.push(child.name);
            }
        });
        console.log('   Goblin bones:', boneNames.slice(0, 10).join(', '), '...');

        // Apply texture and enable shadows
        goblinScene.traverse((child) => {
            if (child.isSkinnedMesh || child.isMesh) {
                // Apply texture like AssetLoader does
                if (this.texture) {
                    const newMaterial = new THREE.MeshStandardMaterial({
                        map: this.texture,
                        roughness: 0.8,
                        metalness: 0.2,
                        side: THREE.FrontSide
                    });
                    child.material = newMaterial;
                    child.material.needsUpdate = true;
                }

                child.castShadow = true;
                child.receiveShadow = true;

                // Make sure skeleton is properly bound for skinned meshes
                if (child.isSkinnedMesh && child.skeleton) {
                    child.skeleton.pose(); // Reset to bind pose
                }
            }
        });

        // Get terrain height
        let y = 0;
        if (this.worldManager) {
            y = this.worldManager.getTerrainHeight(x, z) || 0;
        }

        goblinScene.position.set(x, y, z);
        // GLB files are usually at proper scale, try 1.0 first
        // If too big/small, adjust this value
        goblinScene.scale.set(1, 1, 1);
        console.log(`   Position: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}), Scale: 1`);

        // Attach cape to goblin
        let equippedCape = null;
        if (this.capeModel) {
            // Find the SkinnedMesh in the cape model and convert to regular Mesh
            let capeMesh = null;
            this.capeModel.traverse((child) => {
                if (child.isSkinnedMesh || child.isMesh) {
                    // Create a regular mesh from the skinned mesh geometry
                    const geometry = child.geometry.clone();
                    const material = new THREE.MeshStandardMaterial({
                        map: this.texture,
                        roughness: 0.8,
                        metalness: 0.2,
                        side: THREE.DoubleSide
                    });
                    capeMesh = new THREE.Mesh(geometry, material);
                    capeMesh.castShadow = true;
                    capeMesh.receiveShadow = true;
                    console.log(`   Created cape mesh from: ${child.name}`);
                }
            });

            if (capeMesh) {
                equippedCape = capeMesh;

                // Find spine bone to attach cape
                let spineBone = null;
                goblinScene.traverse((child) => {
                    if (child.isBone) {
                        if (child.name.toLowerCase().includes('spine_03') ||
                            child.name.toLowerCase().includes('spine_02')) {
                            if (!spineBone) spineBone = child;
                        }
                    }
                });

                if (spineBone) {
                    spineBone.add(equippedCape);
                    // Rotate up (vertical) and position behind goblin
                    equippedCape.position.set(0, 0, -0.2);
                    equippedCape.rotation.set(-Math.PI / 2, 0, 0); // Rotate to vertical
                    equippedCape.scale.set(1, 1, 1);
                    console.log(`✅ Cape attached to bone: ${spineBone.name}`);
                } else {
                    // Fallback: attach to scene
                    goblinScene.add(equippedCape);
                    equippedCape.position.set(0, 1.2, -0.2);
                    console.log('⚠️ Cape attached to goblin scene directly');
                }
            }
        }

        // Attach sword to hand
        let equippedSword = null;
        if (this.swordModel) {
            // Clone the sword model
            equippedSword = this.swordModel.clone();

            // Apply goblin texture to sword
            if (this.texture) {
                equippedSword.traverse((child) => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshStandardMaterial({
                            map: this.texture,
                            roughness: 0.8,
                            metalness: 0.2
                        });
                        child.castShadow = true;
                    }
                });
            }

            // Find the right hand bone
            let handBone = null;
            goblinScene.traverse((child) => {
                if (child.isBone) {
                    if (child.name === 'Hand_R' || child.name === 'hand_r' ||
                        child.name.toLowerCase().includes('hand') && child.name.toLowerCase().includes('r')) {
                        handBone = child;
                    }
                }
            });

            if (handBone) {
                handBone.add(equippedSword);
                // Position and rotate sword in hand
                equippedSword.position.set(0, 0, 0);
                equippedSword.rotation.set(Math.PI, 0, 0); // 180 degrees on X axis
                equippedSword.scale.set(1, 1, 1);
                console.log(`⚔️ Sword attached to bone: ${handBone.name}`);
            } else {
                console.warn('⚠️ Could not find hand bone for sword');
            }
        }

        // Setup animation mixer
        const mixer = new THREE.AnimationMixer(goblinScene);

        // Play idle animation when spawning
        let currentAction = null;
        if (this.animations.idle) {
            currentAction = mixer.clipAction(this.animations.idle);
            currentAction.play();
        }

        // Create health bar (only visible when damaged)
        const healthBarGroup = this.createHealthBar();
        healthBarGroup.position.y = 2.2; // Above goblin's head
        goblinScene.add(healthBarGroup);

        // Create goblin data object
        const goblin = {
            mesh: goblinScene,
            mixer: mixer,
            currentAction: currentAction,
            // Wandering behavior
            targetX: x,
            targetZ: z,
            speed: 2 + Math.random() * 2, // Random speed between 2-4
            waitTime: 0,
            state: 'idle', // idle, walking, dancing, alerted, scrambling
            idleTimer: Math.random() * 3, // Start with random idle time
            // Combat stats
            health: 100,
            maxHealth: 100,
            healthBar: healthBarGroup,
            isDead: false,
            // Dancing behavior
            dancePartner: null, // Reference to dance partner goblin
            currentDance: null, // Which dance animation is playing
            danceTimer: 0, // How long they've been dancing
            alertedBy: null, // Which goblin alerted this one
            personality: Math.random(), // 0-1: determines reaction (flee vs attack vs oblivious)
            hasNoticedPlayer: false, // Whether this goblin has spotted the player
            scrambleTimer: 0, // Timer for scramble/reaction state
            // Advanced AI behavior
            baseCourage: 0.3 + Math.random() * 0.4, // Base courage 0.3-0.7
            currentCourage: 0.5, // Dynamically calculated courage
            isRallied: false, // Whether this goblin was rallied by another
            rallyTimer: 0, // Cooldown for rally
            tauntTimer: 0, // Timer for taunting behavior
            isTaunting: false, // Currently taunting
            flankAngle: Math.random() * Math.PI * 2, // Preferred flanking angle
            waitingForOpening: false, // Waiting to strike
            lastTripTime: 0, // When goblin last tripped (cooldown)
            tripChance: 0.02 + Math.random() * 0.03, // 2-5% trip chance per second
            // Ranged attack
            lastThrowTime: 0, // When goblin last threw
            throwCooldown: 4000 + Math.random() * 3000, // 4-7 second cooldown
            canThrow: Math.random() < 0.5, // 50% of goblins can throw
            // Animation tracking
            currentStrafeAnim: null // Current strafe animation for smooth transitions
        };

        this.scene.add(goblinScene);
        this.goblins.push(goblin);

        console.log(`✅ Spawned goblin at (${x.toFixed(1)}, ${z.toFixed(1)})`);
        return goblin;
    }

    update(delta, camera = null) {
        for (const goblin of this.goblins) {
            // Always update animation mixer (even for dead goblins - for dying animation)
            if (goblin.mixer) {
                goblin.mixer.update(delta);
            }

            // Skip behavior and health bar for dead goblins
            if (goblin.isDead) continue;

            // Update behavior
            this.updateGoblinBehavior(goblin, delta);

            // Update health bar
            this.updateHealthBar(goblin, camera);
        }

        // Update projectiles
        this.updateProjectiles(delta);

        // Update damage numbers
        this.updateDamageNumbers(delta, camera);
    }

    updateGoblinBehavior(goblin, delta) {
        const distToPlayer = this.getDistanceToPlayer(goblin);

        // ==================== COURAGE & RALLY UPDATES ====================
        // Calculate courage based on nearby allies
        this.calculateCourage(goblin);

        // Update rally timer
        if (goblin.isRallied && goblin.rallyTimer > 0) {
            goblin.rallyTimer -= delta;
            if (goblin.rallyTimer <= 0) {
                goblin.isRallied = false;
            }
        }

        // ==================== TRIPPING STATE ====================
        if (goblin.state === 'tripping') {
            // Wait for animation to finish
            const tripDuration = this.animations.tripping ? this.animations.tripping.duration : 2;
            goblin.staggerTimer = (goblin.staggerTimer || 0) + delta;

            if (goblin.staggerTimer >= tripDuration * 0.9) {
                goblin.staggerTimer = 0;
                goblin.state = 'idle';
                goblin.idleTimer = 0.5 + Math.random() * 0.5;

                if (this.animations.idle && goblin.mixer) {
                    if (goblin.currentAction) goblin.currentAction.fadeOut(0.3);
                    goblin.currentAction = goblin.mixer.clipAction(this.animations.idle);
                    goblin.currentAction.reset().fadeIn(0.3).play();
                }
            }
            return;
        }

        // ==================== THROWING STATE ====================
        if (goblin.state === 'throwing') {
            goblin.throwTimer += delta;
            const throwDuration = this.animations.throw ? this.animations.throw.duration : 1.5;

            // Launch projectile at the right moment in animation (about 60% through)
            if (!goblin.hasThrown && goblin.throwTimer >= throwDuration * 0.6) {
                goblin.hasThrown = true;
                goblin.lastThrowTime = Date.now();

                // Create and launch projectile
                if (this.playerController && this.playerController.mesh) {
                    this.createProjectile(
                        goblin.mesh.position.clone(),
                        this.playerController.mesh.position.clone(),
                        goblin
                    );
                }
            }

            // Animation finished - return to circling or idle
            if (goblin.throwTimer >= throwDuration * 0.9) {
                goblin.state = 'circling';

                if (this.animations.run_forward && goblin.mixer) {
                    if (goblin.currentAction) goblin.currentAction.fadeOut(0.2);
                    goblin.currentAction = goblin.mixer.clipAction(this.animations.run_forward);
                    goblin.currentAction.reset().fadeIn(0.2).play();
                }
            }
            return;
        }

        // ==================== TAUNTING STATE ====================
        if (goblin.state === 'taunting') {
            goblin.tauntTimer -= delta;

            // Player got too close - flee!
            if (distToPlayer < this.playerDangerRadius) {
                goblin.state = 'fleeing';
                goblin.fleeTimer = 2 + Math.random() * 2;
                goblin.isTaunting = false;

                // Run away from player
                if (this.playerController && this.playerController.mesh) {
                    const playerPos = this.playerController.mesh.position;
                    const dx = goblin.mesh.position.x - playerPos.x;
                    const dz = goblin.mesh.position.z - playerPos.z;
                    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
                    goblin.targetX = goblin.mesh.position.x + (dx / dist) * 12;
                    goblin.targetZ = goblin.mesh.position.z + (dz / dist) * 12;
                }

                if (this.animations.run_forward && goblin.mixer) {
                    if (goblin.currentAction) goblin.currentAction.fadeOut(0.2);
                    goblin.currentAction = goblin.mixer.clipAction(this.animations.run_forward);
                    goblin.currentAction.reset().fadeIn(0.2).play();
                }
                console.log('😂 Goblin flees after taunting!');
                return;
            }

            // Taunt finished - go back to circling/idle
            if (goblin.tauntTimer <= 0) {
                goblin.isTaunting = false;
                goblin.state = 'circling';

                if (this.animations.run_forward && goblin.mixer) {
                    if (goblin.currentAction) goblin.currentAction.fadeOut(0.3);
                    goblin.currentAction = goblin.mixer.clipAction(this.animations.run_forward);
                    goblin.currentAction.reset().fadeIn(0.3).play();
                }
            }
            return;
        }

        // ==================== CIRCLING STATE ====================
        if (goblin.state === 'circling') {
            const flankPos = this.getFlankingPosition(goblin);
            if (flankPos) {
                const dx = flankPos.x - goblin.mesh.position.x;
                const dz = flankPos.z - goblin.mesh.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist > 0.5) {
                    const moveSpeed = goblin.speed * 0.7 * delta; // Move slower while circling
                    goblin.mesh.position.x += (dx / dist) * moveSpeed;
                    goblin.mesh.position.z += (dz / dist) * moveSpeed;

                    // Update terrain height
                    if (this.worldManager) {
                        const terrainY = this.worldManager.getTerrainHeight(goblin.mesh.position.x, goblin.mesh.position.z);
                        if (terrainY !== undefined) goblin.mesh.position.y = terrainY;
                    }

                    // Face player while circling
                    if (this.playerController && this.playerController.mesh) {
                        const playerPos = this.playerController.mesh.position;
                        const pdx = playerPos.x - goblin.mesh.position.x;
                        const pdz = playerPos.z - goblin.mesh.position.z;
                        const angleToPlayer = Math.atan2(pdx, pdz);
                        goblin.mesh.rotation.y = angleToPlayer;

                        // Determine strafe direction based on movement vs facing
                        // Calculate angle of movement
                        const moveAngle = Math.atan2(dx, dz);
                        // Difference between facing and movement direction
                        let angleDiff = moveAngle - angleToPlayer;
                        // Normalize to -PI to PI
                        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                        // Pick animation based on movement relative to facing
                        let targetAnim = null;
                        if (angleDiff > Math.PI * 0.25 && angleDiff < Math.PI * 0.75) {
                            // Moving right relative to facing
                            targetAnim = this.animations.run_right;
                        } else if (angleDiff < -Math.PI * 0.25 && angleDiff > -Math.PI * 0.75) {
                            // Moving left relative to facing
                            targetAnim = this.animations.run_left;
                        } else if (Math.abs(angleDiff) > Math.PI * 0.75) {
                            // Moving backward
                            targetAnim = this.animations.run_backward;
                        } else {
                            // Moving forward
                            targetAnim = this.animations.run_forward;
                        }

                        // Switch animation if needed
                        if (targetAnim && goblin.currentStrafeAnim !== targetAnim) {
                            goblin.currentStrafeAnim = targetAnim;
                            if (goblin.currentAction) goblin.currentAction.fadeOut(0.2);
                            goblin.currentAction = goblin.mixer.clipAction(targetAnim);
                            goblin.currentAction.reset().fadeIn(0.2).play();
                        }
                    }
                }

                // Chance to throw a rock from distance (if this goblin can throw)
                if (goblin.canThrow && this.animations.throw) {
                    const timeSinceThrow = Date.now() - goblin.lastThrowTime;
                    if (timeSinceThrow > goblin.throwCooldown) {
                        // In throwing range and off cooldown - throw!
                        if (distToPlayer >= this.throwMinRange && distToPlayer <= this.throwRange) {
                            if (Math.random() < delta * 0.5) { // 50% chance per second to decide to throw
                                this.startThrowing(goblin);
                                return;
                            }
                        }
                    }
                }

                // Chance to taunt from distance
                if (this.danceAnimations.length > 0 && Math.random() < delta * 0.15) {
                    this.startTaunting(goblin);
                    return;
                }

                // Chance to trip while circling
                if (this.animations.tripping && Math.random() < goblin.tripChance * delta) {
                    const tripCooldown = 10000; // 10 second cooldown
                    if (Date.now() - goblin.lastTripTime > tripCooldown) {
                        this.playTripping(goblin);
                        return;
                    }
                }

                // If player is distracted, attack!
                if (this.isPlayerDistracted() && goblin.currentCourage > 0.4) {
                    goblin.state = 'walking';
                    goblin.targetX = this.playerController.mesh.position.x;
                    goblin.targetZ = this.playerController.mesh.position.z;
                    goblin.waitingForOpening = false;
                    console.log('🗡️ Goblin strikes while player is distracted!');
                }

                // High courage - charge in!
                if (goblin.currentCourage > 0.7 && Math.random() < delta * 0.3) {
                    goblin.state = 'walking';
                    goblin.targetX = this.playerController.mesh.position.x;
                    goblin.targetZ = this.playerController.mesh.position.z;
                    this.rallyNearbyGoblins(goblin);
                    console.log('⚔️ Brave goblin charges!');
                }

                // Low courage - flee
                if (goblin.currentCourage < 0.2 && Math.random() < delta * 0.5) {
                    goblin.state = 'fleeing';
                    goblin.fleeTimer = 3 + Math.random() * 2;

                    if (this.playerController && this.playerController.mesh) {
                        const playerPos = this.playerController.mesh.position;
                        const dx = goblin.mesh.position.x - playerPos.x;
                        const dz = goblin.mesh.position.z - playerPos.z;
                        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
                        goblin.targetX = goblin.mesh.position.x + (dx / dist) * 15;
                        goblin.targetZ = goblin.mesh.position.z + (dz / dist) * 15;
                    }
                    console.log('😰 Cowardly goblin retreats!');
                }
            }
            return;
        }

        // ==================== PLAYER PROXIMITY CHECK ====================
        // Check if player is close - affects dancing and triggers combat

        // If player is within attack range and not already attacking/staggered
        if (distToPlayer < 3 && goblin.state !== 'attacking' && goblin.state !== 'staggered') {
            // Stop dancing if we were dancing
            if (goblin.state === 'dancing') {
                this.stopDancing(goblin, 'combat');
            }

            goblin.state = 'attacking';
            goblin.attackTimer = 0;
            goblin.hasNoticedPlayer = true;

            // Face the player
            if (this.playerController && this.playerController.mesh) {
                const playerPos = this.playerController.mesh.position;
                const dx = playerPos.x - goblin.mesh.position.x;
                const dz = playerPos.z - goblin.mesh.position.z;
                const angle = Math.atan2(dx, dz);
                goblin.mesh.rotation.y = angle;
            }

            // Rally nearby goblins when attacking!
            this.rallyNearbyGoblins(goblin);

            // Pick random attack animation
            this.playRandomAttack(goblin);
            return;
        }

        // ==================== DANCING STATE ====================
        // While dancing, check if player approaches or dance should end
        if (goblin.state === 'dancing') {
            goblin.danceTimer += delta;

            // Player in alert range - one goblin notices first!
            if (distToPlayer < this.playerAlertRadius && !goblin.hasNoticedPlayer) {
                // Random chance to be the one who notices (creates staggered reactions)
                const noticeChance = (this.playerAlertRadius - distToPlayer) / this.playerAlertRadius;
                if (Math.random() < noticeChance * delta * 2) {
                    goblin.hasNoticedPlayer = true;
                    this.stopDancing(goblin, 'player spotted');
                    this.alertNearbyGoblins(goblin);
                    this.playScrambleReaction(goblin);
                    return;
                }
            }

            // Player in danger range - everyone reacts!
            if (distToPlayer < this.playerDangerRadius) {
                goblin.hasNoticedPlayer = true;
                this.stopDancing(goblin, 'player too close');
                this.playScrambleReaction(goblin);
                return;
            }

            // Was alerted by another goblin
            if (goblin.alertedBy && !goblin.hasNoticedPlayer) {
                // Delayed reaction based on personality
                const reactionDelay = 0.3 + (1 - goblin.personality) * 0.7; // 0.3-1.0 seconds
                if (goblin.danceTimer > reactionDelay) {
                    goblin.hasNoticedPlayer = true;
                    this.stopDancing(goblin, 'alerted by friend');
                    this.playScrambleReaction(goblin);
                    return;
                }
            }

            // Check if dance duration exceeded - time to stop!
            if (goblin.maxDanceDuration && goblin.danceTimer >= goblin.maxDanceDuration) {
                this.stopDancing(goblin, 'dance finished');

                // Transition to idle with a short pause
                goblin.state = 'idle';
                goblin.idleTimer = 1 + Math.random() * 2; // 1-3 seconds before next action

                if (this.animations.idle && goblin.mixer) {
                    if (goblin.currentAction) {
                        goblin.currentAction.fadeOut(0.4);
                    }
                    goblin.currentAction = goblin.mixer.clipAction(this.animations.idle);
                    goblin.currentAction.reset().fadeIn(0.4).play();
                }

                // Small chance to start another dance right away (chain dancing)
                if (Math.random() < 0.2) {
                    goblin.idleTimer = 0.5; // Quick transition to potentially dance again
                }
                return;
            }

            // Continue dancing (animation loops automatically)
            return;
        }

        // ==================== SCRAMBLING STATE ====================
        // Brief "oh crap" reaction before deciding what to do
        if (goblin.state === 'scrambling') {
            goblin.scrambleTimer += delta;

            const scrambleDuration = this.animations.impact ? this.animations.impact.duration * 0.7 : 0.5;

            if (goblin.scrambleTimer > scrambleDuration) {
                // Decide reaction based on COURAGE (which factors in allies and health)
                // Low courage: flee
                // Medium courage: circle/taunt
                // High courage: charge
                // Very high personality: oblivious

                if (goblin.personality > 0.9) {
                    // OBLIVIOUS! Go back to idle, might dance again
                    goblin.state = 'idle';
                    goblin.idleTimer = 1 + Math.random() * 2;
                    goblin.hasNoticedPlayer = false; // Forgot already

                    if (this.animations.idle && goblin.mixer) {
                        if (goblin.currentAction) goblin.currentAction.fadeOut(0.3);
                        goblin.currentAction = goblin.mixer.clipAction(this.animations.idle);
                        goblin.currentAction.reset().fadeIn(0.3).play();
                    }
                    console.log('🤷 Goblin shrugs it off and goes back to idling');

                } else if (goblin.currentCourage < 0.3) {
                    // FLEE! Run away from player (low courage)
                    goblin.state = 'fleeing';
                    goblin.fleeTimer = 3 + Math.random() * 2;

                    if (this.playerController && this.playerController.mesh) {
                        const playerPos = this.playerController.mesh.position;
                        const dx = goblin.mesh.position.x - playerPos.x;
                        const dz = goblin.mesh.position.z - playerPos.z;
                        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
                        goblin.targetX = goblin.mesh.position.x + (dx / dist) * 15;
                        goblin.targetZ = goblin.mesh.position.z + (dz / dist) * 15;
                    }

                    if (this.animations.run_forward && goblin.mixer) {
                        if (goblin.currentAction) goblin.currentAction.fadeOut(0.2);
                        goblin.currentAction = goblin.mixer.clipAction(this.animations.run_forward);
                        goblin.currentAction.reset().fadeIn(0.2).play();
                    }
                    console.log(`🏃 Goblin flees! (courage: ${goblin.currentCourage.toFixed(2)})`);

                } else if (goblin.currentCourage < 0.6) {
                    // CIRCLE! Medium courage - be cautious, circle and taunt
                    goblin.state = 'circling';
                    goblin.waitingForOpening = true;

                    if (this.animations.run_forward && goblin.mixer) {
                        if (goblin.currentAction) goblin.currentAction.fadeOut(0.2);
                        goblin.currentAction = goblin.mixer.clipAction(this.animations.run_forward);
                        goblin.currentAction.reset().fadeIn(0.2).play();
                    }
                    console.log(`🔄 Goblin starts circling! (courage: ${goblin.currentCourage.toFixed(2)})`);

                } else {
                    // CHARGE! High courage - attack!
                    goblin.state = 'walking';
                    if (this.playerController && this.playerController.mesh) {
                        goblin.targetX = this.playerController.mesh.position.x;
                        goblin.targetZ = this.playerController.mesh.position.z;
                    }

                    // Rally nearby friends!
                    this.rallyNearbyGoblins(goblin);

                    if (this.animations.run_forward && goblin.mixer) {
                        if (goblin.currentAction) goblin.currentAction.fadeOut(0.2);
                        goblin.currentAction = goblin.mixer.clipAction(this.animations.run_forward);
                        goblin.currentAction.reset().fadeIn(0.2).play();
                    }
                    console.log(`⚔️ Goblin charges! (courage: ${goblin.currentCourage.toFixed(2)})`);
                }
            }
            return;
        }

        // ==================== FLEEING STATE ====================
        if (goblin.state === 'fleeing') {
            goblin.fleeTimer -= delta;

            if (goblin.fleeTimer <= 0) {
                // Done fleeing, go to cautious idle
                goblin.state = 'idle';
                goblin.idleTimer = 2 + Math.random() * 3;

                if (this.animations.idle && goblin.mixer) {
                    if (goblin.currentAction) goblin.currentAction.fadeOut(0.3);
                    goblin.currentAction = goblin.mixer.clipAction(this.animations.idle);
                    goblin.currentAction.reset().fadeIn(0.3).play();
                }
                return;
            }

            // Move away from player
            const dx = goblin.targetX - goblin.mesh.position.x;
            const dz = goblin.targetZ - goblin.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 0.5) {
                const fleeSpeed = goblin.speed * 1.5 * delta; // Run faster when fleeing
                goblin.mesh.position.x += (dx / dist) * fleeSpeed;
                goblin.mesh.position.z += (dz / dist) * fleeSpeed;

                // Update terrain height
                if (this.worldManager) {
                    const terrainY = this.worldManager.getTerrainHeight(goblin.mesh.position.x, goblin.mesh.position.z);
                    if (terrainY !== undefined) goblin.mesh.position.y = terrainY;
                }

                // Face movement direction
                goblin.mesh.rotation.y = Math.atan2(dx, dz);
            }
            return;
        }

        // ==================== STAGGERED STATE ====================
        // Handle staggered state (hit reaction)
        if (goblin.state === 'staggered') {
            goblin.staggerTimer += delta;

            // Get impact animation duration (or default to 0.5s)
            const impactDuration = this.animations.impact ? this.animations.impact.duration : 0.5;

            // Recover from stagger
            if (goblin.staggerTimer > impactDuration * 0.8) {
                goblin.state = 'idle';
                goblin.idleTimer = 0.2 + Math.random() * 0.3; // Brief recovery

                if (this.animations.idle && goblin.mixer) {
                    if (goblin.currentAction) {
                        goblin.currentAction.fadeOut(0.2);
                    }
                    goblin.currentAction = goblin.mixer.clipAction(this.animations.idle);
                    goblin.currentAction.reset().fadeIn(0.2).play();
                }
            }
            return; // Don't process other states while staggered
        }

        // Handle attacking state
        if (goblin.state === 'attacking') {
            goblin.attackTimer += delta;

            // Get current attack animation duration (or default to 1.2s)
            const currentAttackAnim = goblin.currentAttack ? this.animations[goblin.currentAttack] : null;
            const attackDuration = currentAttackAnim ? currentAttackAnim.duration : 1.2;

            // Attack animation finished
            if (goblin.attackTimer > attackDuration * 0.9) {
                // Check if player is still in range for combo attack
                if (this.playerController && this.playerController.mesh) {
                    const playerPos = this.playerController.mesh.position;
                    const dx = playerPos.x - goblin.mesh.position.x;
                    const dz = playerPos.z - goblin.mesh.position.z;
                    const distToPlayer = Math.sqrt(dx * dx + dz * dz);

                    if (distToPlayer < 3) {
                        // Continue attacking - reset timer and play again
                        goblin.attackTimer = 0;
                        goblin.attackCooldown = (goblin.attackCooldown || 0) + 1;

                        // Add small pause every 2-3 attacks
                        if (goblin.attackCooldown >= 2 + Math.floor(Math.random() * 2)) {
                            goblin.state = 'idle';
                            goblin.idleTimer = 0.3 + Math.random() * 0.5; // Short breather
                            goblin.attackCooldown = 0;

                            if (this.animations.idle && goblin.mixer) {
                                if (goblin.currentAction) {
                                    goblin.currentAction.fadeOut(0.3);
                                }
                                goblin.currentAction = goblin.mixer.clipAction(this.animations.idle);
                                goblin.currentAction.reset().fadeIn(0.3).play();
                            }
                        } else {
                            // Face player and attack again with random attack
                            const angle = Math.atan2(dx, dz);
                            goblin.mesh.rotation.y = angle;
                            this.playRandomAttack(goblin);
                        }
                        return;
                    }
                }

                // Player out of range - return to idle smoothly
                goblin.state = 'idle';
                goblin.idleTimer = 0.5 + Math.random() * 1;
                goblin.attackCooldown = 0;

                if (this.animations.idle && goblin.mixer) {
                    if (goblin.currentAction) {
                        goblin.currentAction.fadeOut(0.4);
                    }
                    goblin.currentAction = goblin.mixer.clipAction(this.animations.idle);
                    goblin.currentAction.reset().fadeIn(0.4).play();
                }
            }
            return; // Don't process other states while attacking
        }

        if (goblin.state === 'idle') {
            goblin.idleTimer -= delta;

            // If player is within alert range but not attack range, consider engaging
            if (distToPlayer < this.playerAlertRadius && distToPlayer > 3 && goblin.hasNoticedPlayer) {
                // Decide based on courage whether to engage
                if (goblin.currentCourage > 0.4) {
                    // Brave enough to engage - start circling
                    goblin.state = 'circling';
                    if (this.animations.run_forward && goblin.mixer) {
                        if (goblin.currentAction) goblin.currentAction.fadeOut(0.2);
                        goblin.currentAction = goblin.mixer.clipAction(this.animations.run_forward);
                        goblin.currentAction.reset().fadeIn(0.2).play();
                    }
                    console.log(`🔄 Idle goblin spots player, starts circling!`);
                    return;
                }
            }

            // Check for dancing if player is far away and we have dance animations
            if (this.danceAnimations.length > 0 && distToPlayer > this.playerAlertRadius) {
                // Random chance to dance
                if (Math.random() < delta * 0.3) { // ~30% chance per second to try dancing
                    const partner = this.findDancePartner(goblin);
                    if (partner && partner.state === 'idle') {
                        // Found a partner - dance together!
                        this.startDancing(goblin, partner);
                        return;
                    } else if (Math.random() < 0.3) {
                        // No partner found - 30% chance to dance solo anyway
                        this.startSoloDancing(goblin);
                        return;
                    }
                }
            }

            // Chance to trip while idle (very rare)
            if (this.animations.tripping && Math.random() < goblin.tripChance * 0.1 * delta) {
                const tripCooldown = 15000; // 15 second cooldown
                if (Date.now() - goblin.lastTripTime > tripCooldown) {
                    this.playTripping(goblin);
                    return;
                }
            }

            if (goblin.idleTimer <= 0) {
                // Pick a new random target
                const wanderRadius = 10;
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * wanderRadius;

                goblin.targetX = goblin.mesh.position.x + Math.cos(angle) * dist;
                goblin.targetZ = goblin.mesh.position.z + Math.sin(angle) * dist;
                goblin.state = 'walking';

                // Play run animation
                if (this.animations.run_forward && goblin.mixer) {
                    if (goblin.currentAction) {
                        goblin.currentAction.fadeOut(0.2);
                    }
                    goblin.currentAction = goblin.mixer.clipAction(this.animations.run_forward);
                    goblin.currentAction.reset().fadeIn(0.2).play();
                }
            }
        } else if (goblin.state === 'walking') {
            // Move towards target
            const dx = goblin.targetX - goblin.mesh.position.x;
            const dz = goblin.targetZ - goblin.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < 0.5) {
                // Reached target, go idle
                goblin.state = 'idle';
                goblin.idleTimer = 1 + Math.random() * 4; // Wait 1-5 seconds

                // Switch to idle animation
                if (this.animations.idle && goblin.mixer) {
                    if (goblin.currentAction) {
                        goblin.currentAction.fadeOut(0.2);
                    }
                    goblin.currentAction = goblin.mixer.clipAction(this.animations.idle);
                    goblin.currentAction.reset().fadeIn(0.2).play();
                }
            } else {
                // Move towards target
                const moveSpeed = goblin.speed * delta;
                const moveX = (dx / dist) * moveSpeed;
                const moveZ = (dz / dist) * moveSpeed;

                goblin.mesh.position.x += moveX;
                goblin.mesh.position.z += moveZ;

                // Update Y position based on terrain
                if (this.worldManager) {
                    const terrainY = this.worldManager.getTerrainHeight(
                        goblin.mesh.position.x,
                        goblin.mesh.position.z
                    );
                    if (terrainY !== undefined) {
                        goblin.mesh.position.y = terrainY;
                    }
                }

                // Face movement direction
                const angle = Math.atan2(dx, dz);
                goblin.mesh.rotation.y = angle;

                // Check collision with player
                this.checkPlayerCollision(goblin);

                // Check collision with other goblins
                this.checkGoblinCollision(goblin);
            }
        }
    }

    checkPlayerCollision(goblin) {
        if (!this.playerController || !this.playerController.mesh) return;

        const playerRadius = 0.5;
        const goblinRadius = 0.5;
        const minDistance = playerRadius + goblinRadius;

        const playerPos = this.playerController.mesh.position;
        const goblinPos = goblin.mesh.position;

        const dx = goblinPos.x - playerPos.x;
        const dz = goblinPos.z - playerPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < minDistance && distance > 0) {
            // Push goblin away from player
            const overlap = minDistance - distance;
            const pushX = (dx / distance) * overlap;
            const pushZ = (dz / distance) * overlap;

            goblin.mesh.position.x += pushX;
            goblin.mesh.position.z += pushZ;
        }
    }

    checkGoblinCollision(goblin) {
        const goblinRadius = 0.5;
        const minDistance = goblinRadius * 2;

        for (const other of this.goblins) {
            if (other === goblin || other.isDead) continue;

            const dx = goblin.mesh.position.x - other.mesh.position.x;
            const dz = goblin.mesh.position.z - other.mesh.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < minDistance && distance > 0) {
                // Push both goblins apart
                const overlap = (minDistance - distance) / 2;
                const pushX = (dx / distance) * overlap;
                const pushZ = (dz / distance) * overlap;

                goblin.mesh.position.x += pushX;
                goblin.mesh.position.z += pushZ;
                other.mesh.position.x -= pushX;
                other.mesh.position.z -= pushZ;
            }
        }
    }

    createHealthBar() {
        const group = new THREE.Group();

        // Background (dark red)
        const bgGeometry = new THREE.PlaneGeometry(1, 0.1);
        const bgMaterial = new THREE.MeshBasicMaterial({
            color: 0x330000,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
            depthTest: false
        });
        const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
        bgMesh.renderOrder = 998;
        group.add(bgMesh);

        // Foreground (green health)
        const fgGeometry = new THREE.PlaneGeometry(1, 0.1);
        const fgMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            depthTest: false
        });
        const fgMesh = new THREE.Mesh(fgGeometry, fgMaterial);
        fgMesh.renderOrder = 999;
        fgMesh.name = 'healthFill';
        group.add(fgMesh);

        // Start hidden (only show when damaged)
        group.visible = false;

        return group;
    }

    updateHealthBar(goblin, camera) {
        if (!goblin.healthBar) return;

        const healthPercent = goblin.health / goblin.maxHealth;

        // Only show health bar if damaged
        goblin.healthBar.visible = healthPercent < 1 && !goblin.isDead;

        if (goblin.healthBar.visible) {
            // Update health bar fill
            const fill = goblin.healthBar.children.find(c => c.name === 'healthFill');
            if (fill) {
                fill.scale.x = healthPercent;
                fill.position.x = (healthPercent - 1) * 0.5; // Align left

                // Change color based on health
                if (healthPercent > 0.5) {
                    fill.material.color.setHex(0x00ff00); // Green
                } else if (healthPercent > 0.25) {
                    fill.material.color.setHex(0xffff00); // Yellow
                } else {
                    fill.material.color.setHex(0xff0000); // Red
                }
            }

            // Billboard - face camera
            if (camera) {
                goblin.healthBar.quaternion.copy(camera.quaternion);
            }
        }
    }

    // Create a floating damage number at the specified position
    showDamageNumber(position, damage) {
        // Create canvas for the text
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw text with outline for visibility
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Black outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 6;
        ctx.strokeText(damage.toString(), canvas.width / 2, canvas.height / 2);

        // Yellow/orange fill for damage
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(damage.toString(), canvas.width / 2, canvas.height / 2);

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        // Create sprite material
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });

        // Create sprite
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1.5, 0.75, 1);
        sprite.position.copy(position);
        sprite.position.y += 2; // Start above the goblin
        sprite.renderOrder = 1000;

        this.scene.add(sprite);

        // Track the damage number for animation
        this.damageNumbers.push({
            sprite: sprite,
            velocity: 2 + Math.random() * 1, // Float up speed
            lifetime: 1.0, // How long to display
            age: 0
        });
    }

    // Update all floating damage numbers
    updateDamageNumbers(delta, camera) {
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const dmgNum = this.damageNumbers[i];
            dmgNum.age += delta;

            // Float upward
            dmgNum.sprite.position.y += dmgNum.velocity * delta;

            // Fade out over lifetime
            const fadeProgress = dmgNum.age / dmgNum.lifetime;
            dmgNum.sprite.material.opacity = 1 - fadeProgress;

            // Scale up slightly as it fades
            const scale = 1 + fadeProgress * 0.5;
            dmgNum.sprite.scale.set(1.5 * scale, 0.75 * scale, 1);

            // Remove if lifetime exceeded
            if (dmgNum.age >= dmgNum.lifetime) {
                this.scene.remove(dmgNum.sprite);
                dmgNum.sprite.material.map.dispose();
                dmgNum.sprite.material.dispose();
                this.damageNumbers.splice(i, 1);
            }
        }
    }

    damageGoblin(goblin, damage) {
        if (goblin.isDead) return;

        goblin.health -= damage;
        console.log(`💥 Goblin hit for ${damage} damage! Health: ${goblin.health}/${goblin.maxHealth}`);

        // Show floating damage number
        this.showDamageNumber(goblin.mesh.position.clone(), damage);

        if (goblin.health <= 0) {
            goblin.health = 0;
            goblin.isDead = true;
            this.killGoblin(goblin);
        } else {
            // Play impact/hit reaction animation
            this.playImpactAnimation(goblin);
        }
    }

    // Play hit reaction animation
    playImpactAnimation(goblin) {
        console.log('💫 playImpactAnimation called');
        console.log('   impact animation exists:', !!this.animations.impact);
        console.log('   goblin mixer exists:', !!goblin.mixer);
        console.log('   goblin current state:', goblin.state);

        if (!this.animations.impact) {
            console.warn('⚠️ No impact animation loaded!');
            return;
        }
        if (!goblin.mixer) {
            console.warn('⚠️ No mixer on goblin!');
            return;
        }

        // Set staggered state to interrupt current action
        const previousState = goblin.state;
        goblin.state = 'staggered';
        goblin.staggerTimer = 0;

        // Stop current action immediately
        if (goblin.currentAction) {
            goblin.currentAction.stop();
        }

        // Play impact animation
        goblin.currentAction = goblin.mixer.clipAction(this.animations.impact);
        goblin.currentAction.setLoop(THREE.LoopOnce);
        goblin.currentAction.clampWhenFinished = true;
        goblin.currentAction.reset().play();

        console.log(`💫 Goblin staggers! (was: ${previousState}, duration: ${this.animations.impact.duration}s)`);
    }

    killGoblin(goblin) {
        console.log('💀 Goblin killed!');

        // Hide health bar
        if (goblin.healthBar) {
            goblin.healthBar.visible = false;
        }

        // Play dying animation
        if (this.animations.dying && goblin.mixer) {
            if (goblin.currentAction) {
                goblin.currentAction.stop();
            }
            goblin.currentAction = goblin.mixer.clipAction(this.animations.dying);
            goblin.currentAction.setLoop(THREE.LoopOnce);
            goblin.currentAction.clampWhenFinished = true;
            goblin.currentAction.reset().play();

            // Remove after dying animation completes
            const dyingDuration = this.animations.dying.duration || 2;
            setTimeout(() => {
                this.removeGoblin(goblin);
            }, dyingDuration * 1000 + 500); // Add 500ms buffer
        } else {
            // Fallback: remove after short delay if no dying animation
            setTimeout(() => {
                this.removeGoblin(goblin);
            }, 500);
        }
    }

    removeGoblin(goblin) {
        const index = this.goblins.indexOf(goblin);
        if (index > -1) {
            this.scene.remove(goblin.mesh);
            this.goblins.splice(index, 1);
            console.log(`🗑️ Removed goblin. ${this.goblins.length} remaining.`);
        }
    }

    removeAllGoblins() {
        for (const goblin of this.goblins) {
            this.scene.remove(goblin.mesh);
        }
        this.goblins = [];
    }
}
