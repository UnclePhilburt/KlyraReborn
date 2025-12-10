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

        // Input state
        this.keys = {};
        this.mouseX = 0;
        this.mouseY = 0;
        this.isPointerLocked = false;

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
                { name: 'idle', path: '/assets/glbanimations/idle.glb' },
                { name: 'walk', path: '/assets/glbanimations/walk.glb' },
                { name: 'run_forward', path: '/assets/glbanimations/run_forward.glb' },
                { name: 'run_backward', path: '/assets/glbanimations/run_backward.glb' },
                { name: 'run_left', path: '/assets/glbanimations/run_left.glb' },
                { name: 'run_right', path: '/assets/glbanimations/run_right.glb' }
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
            if (this.animations.idle) loadedClips.push(this.animations.idle.getClip());
            if (this.animations.walk) loadedClips.push(this.animations.walk.getClip());

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

    playAnimation(name) {
        if (!this.animations[name]) {
            console.warn(`Animation "${name}" not found`);
            return;
        }

        // Stop current animation
        if (this.currentAnimation) {
            this.currentAnimation.fadeOut(0.2);
        }

        // Play new animation
        const action = this.animations[name];
        action.reset().fadeIn(0.2).play();
        this.currentAnimation = action;

        console.log(`🎬 Playing animation: ${name}`);
    }

    setupControls() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse controls for camera
        document.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked) {
                this.mouseX -= e.movementX * 0.002; // Inverted for correct camera rotation
                this.mouseY += e.movementY * 0.002;
                this.mouseY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.mouseY));
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

        // Apply movement with sprint modifier
        const isSprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
        const currentSpeed = isSprinting ? this.moveSpeed * 2 : this.moveSpeed;

        this.velocity.x = moveDirection.x * currentSpeed;
        this.velocity.z = moveDirection.z * currentSpeed;

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

        // Update animations based on movement
        if (this.mixer) {
            // Update animation mixer
            this.mixer.update(delta);

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

        // Update camera position
        this.updateCamera();
    }

    updateCamera() {
        if (!this.mesh) return;

        // Third-person camera
        const cameraOffset = new THREE.Vector3(
            Math.sin(this.mouseX) * this.cameraDistance,
            this.cameraHeight + this.mouseY * 5,
            Math.cos(this.mouseX) * this.cameraDistance
        );

        this.camera.position.copy(this.mesh.position).add(cameraOffset);
        this.camera.lookAt(this.mesh.position.x, this.mesh.position.y + 2, this.mesh.position.z);
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
