import * as THREE from 'three';

export class Ramp {
  public mesh: THREE.Group;
  public pos: THREE.Vector3;
  public width = 8;
  public height = 4;
  public length = 15;
  private rampMesh!: THREE.Mesh;

  constructor(pos: THREE.Vector3) {
    this.pos = pos;
    this.mesh = new THREE.Group();
    this.mesh.position.copy(pos);
    this.build();
  }

  private build() {
    const rampGeom = new THREE.BoxGeometry(this.width, 0.4, this.length);
    const rampMat = new THREE.MeshStandardMaterial({
      color: 0x222244,
      roughness: 0.4,
      metalness: 0.8,
      emissive: 0x00ffff,
      emissiveIntensity: 0.2
    });

    this.rampMesh = new THREE.Mesh(rampGeom, rampMat);
    this.rampMesh.position.set(0, this.height / 2, 0);
    this.rampMesh.rotation.x = -Math.atan2(this.height, this.length); // Slanted angle
    this.mesh.add(this.rampMesh);

    // Add warning side stripes
    const stripeGeom = new THREE.BoxGeometry(0.2, 0.5, this.length);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    const leftStripe = new THREE.Mesh(stripeGeom, stripeMat);
    leftStripe.position.set(-this.width / 2, this.height / 2, 0);
    leftStripe.rotation.x = this.rampMesh.rotation.x;
    this.mesh.add(leftStripe);

    const rightStripe = leftStripe.clone();
    rightStripe.position.x = this.width / 2;
    this.mesh.add(rightStripe);
  }

  public getSlantAngle(): number {
    return this.rampMesh.rotation.x;
  }

  // Bounding check for car coordinates
  public checkCollision(carPos: THREE.Vector3): { isOnRamp: boolean; rampHeight: number; slantAngle: number; progress: number } {
    const dx = Math.abs(carPos.x - this.pos.x);
    const dz = carPos.z - this.pos.z; // check along the length of ramp

    // The ramp length is rotated along X. Check if car is overlapping
    if (dx < this.width / 2 && dz > -this.length / 2 && dz < this.length / 2) {
      // Calculate the height of the ramp at current Z position
      // When dz = length/2 (front/start of ramp), height = 0
      // When dz = -length/2 (back/end of ramp), height = height
      const t = (this.length / 2 - dz) / this.length; // 0 to 1 along ramp
      const rampHeight = t * this.height;
      return { 
        isOnRamp: true, 
        rampHeight, 
        slantAngle: this.getSlantAngle(),
        progress: t
      };
    }

    return { isOnRamp: false, rampHeight: 0, slantAngle: 0, progress: 0 };
  }
}
