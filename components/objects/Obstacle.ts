import * as THREE from 'three';

export class Obstacle {
  public mesh: THREE.Mesh;
  public pos: THREE.Vector3;
  public width: number;
  public depth: number;
  public isBuilding: boolean;

  constructor(pos: THREE.Vector3, isBuilding: boolean = true, buildingHeight?: number) {
    this.pos = pos.clone();
    this.isBuilding = isBuilding;

    if (isBuilding) {
      const height = buildingHeight || (15 + Math.random() * 60);
      this.width = 10;
      this.depth = 10;

      const geometry = new THREE.BoxGeometry(this.width, height, this.depth);
      const neonColors = [0x00ffff, 0xff00ff, 0x8b5cf6, 0x3b82f6];
      const color = neonColors[Math.floor(Math.random() * neonColors.length)];

      const material = new THREE.MeshStandardMaterial({
        color: 0x050510,
        roughness: 0.5,
        metalness: 0.9,
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.1,
      });

      this.mesh = new THREE.Mesh(geometry, material);
      this.mesh.position.set(pos.x, height / 2, pos.z);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;

      // Add a glowing wireframe edge overlay
      const wireframe = new THREE.EdgesGeometry(geometry);
      const lineMat = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
      const wireframeLines = new THREE.LineSegments(wireframe, lineMat);
      this.mesh.add(wireframeLines);
    } else {
      // Cylinder obstacles in high-tier Race
      this.width = 2.4;
      this.depth = 2.4;

      const geometry = new THREE.CylinderGeometry(1.2, 1.2, 5, 6);
      const material = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0x550000,
        roughness: 0.1
      });

      this.mesh = new THREE.Mesh(geometry, material);
      this.mesh.position.copy(pos);
      this.mesh.position.y = 2.5;
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;

      // Glowing red rings around it
      const borderGeom = new THREE.BoxGeometry(3, 0.2, 3);
      const borderMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const border = new THREE.Mesh(borderGeom, borderMat);
      border.position.y = -2.4;
      this.mesh.add(border);
    }
  }

  public checkCollision(carPos: THREE.Vector3): boolean {
    const dx = Math.abs(carPos.x - this.mesh.position.x);
    const dz = Math.abs(carPos.z - this.mesh.position.z);

    if (this.isBuilding) {
      // Width 10, depth 10, offset checks matching vehicle width (1.2) / depth (2.0) bounding boxes
      return dx < (this.width / 2 + 1.2) && dz < (this.depth / 2 + 2.0);
    } else {
      // Cylinder radius (1.2) checks
      return dx < (1.2 + 1.2) && dz < (1.2 + 2.0);
    }
  }
}
