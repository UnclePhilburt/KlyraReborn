import * as THREE from 'three';

export class WorldManager {
    constructor(scene) {
        this.scene = scene;
        this.terrain = null;
        this.props = [];
    }

    async generateWorld() {
        this.createGround();
        this.createTestEnvironment();
    }

    createGround() {
        // Create a large ground plane
        const groundGeometry = new THREE.PlaneGeometry(200, 200, 50, 50);

        // Add some simple vertex displacement for terrain variation
        const vertices = groundGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            vertices[i + 2] = Math.random() * 0.5; // Random height variation
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
}
