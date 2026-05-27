import * as THREE from 'three';

export class Crystal {
  public mesh: THREE.Mesh;
  public pos: THREE.Vector3;
  public value: number;
  public active = true;

  constructor(pos: THREE.Vector3, value: number = 50) {
    this.pos = pos.clone();
    this.value = value;
    
    const geom = new THREE.OctahedronGeometry(0.8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // yellow-400
      emissive: 0xeab308,
      emissiveIntensity: 1.5,
      metalness: 1.0,
      roughness: 0.1
    });

    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.copy(this.pos);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  public update(deltaTime: number) {
    if (!this.active) return;
    // Floating and rotating effect
    this.mesh.rotation.y += 1.2 * deltaTime;
    this.mesh.rotation.x += 0.4 * deltaTime;
    this.mesh.position.y = this.pos.y + Math.sin(Date.now() * 0.003) * 0.15;
  }

  public checkCollection(carPos: THREE.Vector3): boolean {
    if (!this.active) return false;
    const dist = carPos.distanceTo(this.mesh.position);
    if (dist < 2.5) {
      this.active = false;
      return true;
    }
    return false;
  }
}
