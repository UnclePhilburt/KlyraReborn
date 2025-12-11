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
        this.moveSpeed = 10;
        this.jumpSpeed = 8;
        this.gravity = -20;
        this.isGrounded = false;

        // Camera settings
        this.cameraDistance = 10;
        this.minCameraDistance = 3;
        this.maxCameraDistance = 20;
        this.cameraHeight = 5;
        this.cameraAngle = 0;
        this.cameraPitch = 0.3;
        this.isFirstPerson = false;
        this.firstPersonHeight = 1.6; // Eye height in first person

        // Camera dead zone for smoother feel
        this.cameraTargetX = 0; // Target camera angle
        this.cameraTargetY = 0; // Target camera pitch
        this.cameraDeadZone = 0.15; // Dead zone radius for mouse movement

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
        this.comboStep = 0; // Track which combo step we're on (0, 1, 2)
        this.comboResetTimer = null;
        this.queuedAttack = null; // Queue next attack for smooth combos

        this.setupControls();
    }

    async init(characterName = 'polygonesyntycharacter') {
        // Create the main mesh container first
        this.mesh = new THREE.Group();
        this.mesh.position.set(0, 0, 0); // Start at ground level
        this.scene.add(this.mesh);

        try {
            console.log(`Attempting to load character: ${characterName}`);

            // Load the main skeleton character (polygonesyntycharacter has all the bones)
            this.characterModel = await this.assetLoader.loadCharacter(characterName);

            // Set the character position and rotation
            this.characterModel.position.set(0, 0, 0);
            this.characterModel.rotation.y = 0;

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

            // Load animations
            await this.loadAnimations();

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

            // Define all animations to load
            const animationsToLoad = [
                { name: 'idle', path: '/assets/glbanimations/A_Idle_Standing_Masc.glb' },
                { name: 'walk', path: '/assets/glbanimations/walk.glb' },
                { name: 'run_forward', path: '/assets/glbanimations/run_forward.glb' },
                { name: 'run_backward', path: '/assets/glbanimations/run_backward.glb' },
                { name: 'run_left', path: '/assets/glbanimations/run_left.glb' },
                { name: 'run_right', path: '/assets/glbanimations/run_right.glb' },
                { name: 'attack_stab', path: '/assets/glbanimations/A_Attack_HeavyStab01_ReturnToIdle_Sword.glb' },
                { name: 'attack_combo_a', path: '/assets/glbanimations/A_Attack_HeavyCombo01A_Sword.glb' },
                { name: 'attack_combo_b', path: '/assets/glbanimations/A_Attack_HeavyCombo01B_Sword.glb' },
                { name: 'attack_combo_c', path: '/assets/glbanimations/A_Attack_HeavyCombo01C_Sword.glb' }
            ];

            // Load all animations
            for (const anim of animationsToLoad) {
                try {
                    const clip = await this.animationLoader.loadAnimationGLB(
                        anim.name,
                        anim.path,
                        true // Enable bone name remapping
                    );
                    this.animations[anim.name] = this.mixer.clipAction(clip);
                    console.log(`✅ ${anim.name} animation loaded`);
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

            loadedClips.forEach((clip) => {
                const originalTrackCount = clip.tracks.length;

                clip.tracks = clip.tracks.filter(track => {
                    const trackName = track.name.toLowerCase();
                    // Remove position tracks from ANY bone that might cause movement
                    const isPosition = trackName.includes('.position');

                    if (isPosition) {
                        console.log(`   Removing track: ${track.name}`);
                    }

                    // Keep only rotation and scale tracks
                    return !isPosition;
                });

                const removedCount = originalTrackCount - clip.tracks.length;
                if (removedCount > 0) {
                    console.log(`✅ Removed ${removedCount} position tracks from ${clip.name}`);
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

    setupControls() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            // Toggle first person on P key
            if (e.code === 'KeyP') {
                this.isFirstPerson = !this.isFirstPerson;
                console.log(this.isFirstPerson ? '👤 First person mode' : '🎥 Third person mode');
            }

            // Attack with left mouse button (handled separately)
            // Removed spacebar attack since it conflicts with jump
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse controls for camera with dead zone
        document.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked) {
                // Update target camera position
                this.cameraTargetX -= e.movementX * 0.002;
                this.cameraTargetY -= e.movementY * 0.002;
                this.cameraTargetY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.cameraTargetY));

                // Calculate distance from center
                const distanceFromCenter = Math.sqrt(
                    Math.pow(this.cameraTargetX - this.mouseX, 2) +
                    Math.pow(this.cameraTargetY - this.mouseY, 2)
                );

                // Only move camera if outside dead zone
                if (distanceFromCenter > this.cameraDeadZone) {
                    // Smoothly move towards target
                    const smoothFactor = 0.15;
                    this.mouseX += (this.cameraTargetX - this.mouseX) * smoothFactor;
                    this.mouseY += (this.cameraTargetY - this.mouseY) * smoothFactor;
                }
            }
        });

        // Mouse button for attack
        document.addEventListener('mousedown', (e) => {
            if (this.isPointerLocked) {
                if (e.button === 0) { // Left click - stab attack
                    if (!this.isAttacking && this.animations.attack_stab) {
                        this.performAttack('attack_stab');
                        this.comboStep = 0; // Reset combo
                    }
                } else if (e.button === 2) { // Right click - combo attack sequence
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

        // Calculate movement relative to camera rotation
        // Movement is relative to where the camera is looking (this.mouseX)
        const cameraRotation = -this.mouseX + Math.PI;
        const moveDirection = new THREE.Vector3();
        moveDirection.x = this.direction.x * Math.cos(cameraRotation) - this.direction.z * Math.sin(cameraRotation);
        moveDirection.z = this.direction.x * Math.sin(cameraRotation) + this.direction.z * Math.cos(cameraRotation);

        // Rotate character to face movement direction when moving
        if (moveDirection.length() > 0) {
            this.targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
        }
        // When not moving, keep the last rotation (don't snap to camera)

        // Smoothly interpolate to target rotation
        const rotationSpeed = 10; // Higher = faster rotation
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
        const currentSpeed = isSprinting ? this.moveSpeed * 2 : this.moveSpeed;

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

        // Update camera position first (so it works during attacks)
        this.updateCamera();

        // Update animations based on movement
        if (this.mixer) {
            // Update animation mixer
            this.mixer.update(delta);

            // Don't change animations while attacking
            if (this.isAttacking) {
                return; // Skip animation logic during attacks
            }

            // Determine which animation to play based on movement
            const isMoving = this.direction.length() > 0.1;
            const isSprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];

            let targetAnimation = 'idle';

            if (isMoving) {
                // Determine movement direction based on input keys
                const forward = this.direction.z > 0; // W key
                const backward = this.direction.z < 0; // S key
                const left = this.direction.x > 0; // A key
                const right = this.direction.x < 0; // D key

                // Choose animation based on direction and speed
                if (isSprinting) {
                    // Use run animations
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
                    // Use walk animation (or run if walk not available)
                    targetAnimation = this.animations.walk ? 'walk' : 'run_forward';
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
        } else {
            // Third-person over-the-shoulder camera (right shoulder)
            const shoulderOffset = 0.8; // Offset to the right
            const backDistance = this.cameraDistance * 0.7; // Distance behind character
            const heightOffset = 1.8; // Height above character

            // Initialize last camera follow position if needed
            if (this.lastCameraFollowPosition.length() === 0) {
                this.lastCameraFollowPosition.copy(this.mesh.position);
            }

            // Calculate distance character has moved from last camera follow position
            const distanceMoved = this.mesh.position.distanceTo(this.lastCameraFollowPosition);

            // Target position to follow (either character or last follow position)
            let followTarget = this.lastCameraFollowPosition.clone();

            // If character moved outside dead zone, update follow position
            if (distanceMoved > this.cameraFollowDeadZone) {
                // Smoothly move the follow target towards character
                followTarget.lerp(this.mesh.position, 0.1);
                this.lastCameraFollowPosition.copy(followTarget);
            }

            // Calculate camera position relative to follow target
            const targetCameraPos = new THREE.Vector3(
                followTarget.x + Math.sin(this.mouseX) * backDistance + Math.cos(this.mouseX) * shoulderOffset,
                followTarget.y + heightOffset + this.mouseY * 3,
                followTarget.z + Math.cos(this.mouseX) * backDistance - Math.sin(this.mouseX) * shoulderOffset
            );

            // Smoothly interpolate camera position for smooth following
            const lerpFactor = 0.1; // Lower = smoother but slower, higher = faster but jerkier
            this.camera.position.lerp(targetCameraPos, lerpFactor);

            // Look at the actual character position (not follow target) with slight offset
            const lookAtPoint = new THREE.Vector3(
                this.mesh.position.x - Math.sin(this.mouseX) * 2 + Math.cos(this.mouseX) * 0.3,
                this.mesh.position.y + 1.5,
                this.mesh.position.z - Math.cos(this.mouseX) * 2 - Math.sin(this.mouseX) * 0.3
            );
            this.camera.lookAt(lookAtPoint);

            // Show character model in third person
            if (this.characterModel) {
                this.characterModel.visible = true;
            }
        }
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
