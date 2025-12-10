import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class AnimationLoader {
    constructor() {
        this.fbxLoader = new FBXLoader();
        this.gltfLoader = new GLTFLoader();
        this.loadedAnimations = new Map();
        this.targetSkeleton = null; // Can be set by PlayerController

        // Bone name mapping: Unreal/Animation bone names -> Character GLB bone names
        // This handles Unreal Engine skeleton → Polygon Fantasy Kingdom skeleton
        this.boneNameMap = this.createBoneNameMap();
    }

    /**
     * Create comprehensive bone name mapping for Unreal Engine → Polygon skeleton
     * Maps various naming conventions to the standard Polygon Fantasy Kingdom skeleton
     */
    createBoneNameMap() {
        return {
            // Root
            'root': 'root',
            'Root': 'root',
            'Armature': 'root',

            // Pelvis/Hips
            'pelvis': 'pelvis',
            'Pelvis': 'pelvis',
            'Hips': 'pelvis',
            'hips': 'pelvis',

            // Spine
            'spine_01': 'spine_01',
            'Spine_01': 'spine_01',
            'Spine1': 'spine_01',
            'spine_02': 'spine_02',
            'Spine_02': 'spine_02',
            'Spine2': 'spine_02',
            'spine_03': 'spine_03',
            'Spine_03': 'spine_03',
            'Spine3': 'spine_03',

            // Neck and Head
            'neck_01': 'neck_01',
            'Neck_01': 'neck_01',
            'Neck': 'neck_01',
            'neck': 'neck_01',
            'head': 'head',
            'Head': 'head',

            // Left Arm
            'clavicle_l': 'clavicle_l',
            'Clavicle_L': 'clavicle_l',
            'LeftShoulder': 'clavicle_l',
            'upperarm_l': 'upperarm_l',
            'UpperArm_L': 'upperarm_l',
            'LeftArm': 'upperarm_l',
            'lowerarm_l': 'lowerarm_l',
            'LowerArm_L': 'lowerarm_l',
            'LeftForeArm': 'lowerarm_l',
            'hand_l': 'hand_l',
            'Hand_L': 'hand_l',
            'LeftHand': 'hand_l',

            // Right Arm
            'clavicle_r': 'clavicle_r',
            'Clavicle_R': 'clavicle_r',
            'RightShoulder': 'clavicle_r',
            'upperarm_r': 'upperarm_r',
            'UpperArm_R': 'upperarm_r',
            'RightArm': 'upperarm_r',
            'lowerarm_r': 'lowerarm_r',
            'LowerArm_R': 'lowerarm_r',
            'RightForeArm': 'lowerarm_r',
            'hand_r': 'hand_r',
            'Hand_R': 'hand_r',
            'RightHand': 'hand_r',

            // Left Leg
            'thigh_l': 'thigh_l',
            'Thigh_L': 'thigh_l',
            'LeftUpLeg': 'thigh_l',
            'calf_l': 'calf_l',
            'Calf_L': 'calf_l',
            'LeftLeg': 'calf_l',
            'foot_l': 'foot_l',
            'Foot_L': 'foot_l',
            'LeftFoot': 'foot_l',
            'ball_l': 'ball_l',
            'Ball_L': 'ball_l',
            'LeftToeBase': 'ball_l',

            // Right Leg
            'thigh_r': 'thigh_r',
            'Thigh_R': 'thigh_r',
            'RightUpLeg': 'thigh_r',
            'calf_r': 'calf_r',
            'Calf_R': 'calf_r',
            'RightLeg': 'calf_r',
            'foot_r': 'foot_r',
            'Foot_R': 'foot_r',
            'RightFoot': 'foot_r',
            'ball_r': 'ball_r',
            'Ball_R': 'ball_r',
            'RightToeBase': 'ball_r',

            // Left Hand Fingers
            'thumb_01_l': 'thumb_01_l',
            'thumb_02_l': 'thumb_02_l',
            'thumb_03_l': 'thumb_03_l',
            'index_01_l': 'index_01_l',
            'index_02_l': 'index_02_l',
            'index_03_l': 'index_03_l',
            'middle_01_l': 'middle_01_l',
            'middle_02_l': 'middle_02_l',
            'middle_03_l': 'middle_03_l',
            'ring_01_l': 'ring_01_l',
            'ring_02_l': 'ring_02_l',
            'ring_03_l': 'ring_03_l',
            'pinky_01_l': 'pinky_01_l',
            'pinky_02_l': 'pinky_02_l',
            'pinky_03_l': 'pinky_03_l',

            // Right Hand Fingers
            'thumb_01_r': 'thumb_01_r',
            'thumb_02_r': 'thumb_02_r',
            'thumb_03_r': 'thumb_03_r',
            'index_01_r': 'index_01_r',
            'index_02_r': 'index_02_r',
            'index_03_r': 'index_03_r',
            'middle_01_r': 'middle_01_r',
            'middle_02_r': 'middle_02_r',
            'middle_03_r': 'middle_03_r',
            'ring_01_r': 'ring_01_r',
            'ring_02_r': 'ring_02_r',
            'ring_03_r': 'ring_03_r',
            'pinky_01_r': 'pinky_01_r',
            'pinky_02_r': 'pinky_02_r',
            'pinky_03_r': 'pinky_03_r'
        };
    }

    /**
     * Remap bone names in animation clip to match GLB character
     * @param {THREE.AnimationClip} clip - The animation clip to remap
     * @param {THREE.Object3D} targetSkeleton - Optional target skeleton to validate against
     */
    remapBoneNames(clip, targetSkeleton = null) {
        const remappedTracks = [];
        const unmappedBones = new Set();
        const skippedBones = new Set();

        // If we have a target skeleton, build a set of available bone names
        let availableBones = null;
        if (targetSkeleton) {
            availableBones = new Set();
            targetSkeleton.traverse((child) => {
                if (child.isBone) {
                    availableBones.add(child.name);
                }
            });
            console.log(`🦴 Target skeleton has ${availableBones.size} bones:`, Array.from(availableBones).sort().join(', '));
        }

        // Get all animation bone names
        const animBones = new Set();
        for (const track of clip.tracks) {
            const parts = track.name.split('.');
            animBones.add(parts[0]);
        }
        console.log(`🎬 Animation has ${animBones.size} bones:`, Array.from(animBones).sort().join(', '));

        for (const track of clip.tracks) {
            // Extract bone name from track name (format: "BoneName.property")
            const parts = track.name.split('.');
            const boneName = parts[0];
            const property = parts[1];

            // Try to find the matching bone name
            let newBoneName = boneName;

            // First check if the target skeleton has this exact bone name
            if (availableBones && availableBones.has(boneName)) {
                // Perfect match! Use it as-is
                newBoneName = boneName;
            }
            // Check if we have a mapping for this bone
            else if (this.boneNameMap[boneName]) {
                newBoneName = this.boneNameMap[boneName];
            }
            // Try lowercase as fallback
            else if (availableBones) {
                const lowerName = boneName.toLowerCase();
                if (availableBones.has(lowerName)) {
                    newBoneName = lowerName;
                } else {
                    unmappedBones.add(boneName);
                }
            }

            // Skip this track if target skeleton doesn't have this bone
            if (availableBones && !availableBones.has(newBoneName)) {
                skippedBones.add(`${boneName} -> ${newBoneName}`);
                continue; // Skip this track
            }

            const newTrackName = `${newBoneName}.${property}`;

            // Create new track with remapped name
            const TrackType = track.constructor;
            const newTrack = new TrackType(newTrackName, track.times, track.values);
            remappedTracks.push(newTrack);
        }

        if (unmappedBones.size > 0) {
            console.warn(`⚠️ Unmapped bones (${unmappedBones.size}):`, Array.from(unmappedBones).join(', '));
        }

        if (skippedBones.size > 0) {
            console.warn(`⏭️ Skipped ${skippedBones.size} tracks:`, Array.from(skippedBones).join(', '));
        }

        console.log(`✅ Remapped ${remappedTracks.length} animation tracks`);

        // Create new clip with remapped tracks
        const remappedClip = new THREE.AnimationClip(clip.name, clip.duration, remappedTracks);
        return remappedClip;
    }

    /**
     * Load a GLB animation file
     */
    async loadAnimationGLB(name, path, remapBones = true) {
        if (this.loadedAnimations.has(name)) {
            console.log(`✅ Using cached animation: ${name}`);
            return this.loadedAnimations.get(name);
        }

        return new Promise((resolve, reject) => {
            console.log(`🎬 Loading GLB animation: ${name} from ${path}`);

            this.gltfLoader.load(
                path,
                (gltf) => {
                    if (gltf.animations && gltf.animations.length > 0) {
                        let clip = gltf.animations[0];

                        // Optionally remap bone names to match GLB character
                        if (remapBones) {
                            console.log(`🔄 Remapping bone names for GLB animation: ${name}`);
                            clip = this.remapBoneNames(clip, this.targetSkeleton);
                        }

                        this.loadedAnimations.set(name, clip);
                        console.log(`✅ GLB Animation loaded: ${name} (${clip.duration.toFixed(2)}s)`);
                        resolve(clip);
                    } else {
                        console.error(`❌ No animation found in ${path}`);
                        reject(new Error('No animation in GLB'));
                    }
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total) * 100;
                    if (percent % 25 === 0) {
                        console.log(`Loading ${name}: ${percent.toFixed(0)}%`);
                    }
                },
                (error) => {
                    console.error(`❌ Failed to load GLB animation ${name}:`, error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Load an animation FBX file
     */
    async loadAnimation(name, path) {
        if (this.loadedAnimations.has(name)) {
            console.log(`✅ Using cached animation: ${name}`);
            return this.loadedAnimations.get(name);
        }

        return new Promise((resolve, reject) => {
            console.log(`🎬 Loading animation: ${name} from ${path}`);

            this.fbxLoader.load(
                path,
                (fbx) => {
                    if (fbx.animations && fbx.animations.length > 0) {
                        const clip = fbx.animations[0];

                        // Remap bone names to match GLB character
                        const remappedClip = this.remapBoneNames(clip, this.targetSkeleton);

                        this.loadedAnimations.set(name, remappedClip);
                        console.log(`✅ Animation loaded and remapped: ${name} (${remappedClip.duration.toFixed(2)}s)`);
                        resolve(remappedClip);
                    } else {
                        console.error(`❌ No animation found in ${path}`);
                        reject(new Error('No animation in FBX'));
                    }
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total) * 100;
                    if (percent % 25 === 0) {
                        console.log(`Loading ${name}: ${percent.toFixed(0)}%`);
                    }
                },
                (error) => {
                    console.error(`❌ Failed to load animation ${name}:`, error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Load multiple animations at once
     */
    async loadAnimations(animationMap) {
        const promises = Object.entries(animationMap).map(([name, path]) =>
            this.loadAnimation(name, path)
        );

        try {
            await Promise.all(promises);
            console.log('✅ All animations loaded');
        } catch (error) {
            console.error('❌ Error loading animations:', error);
        }
    }
}
