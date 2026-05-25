import * as THREE from 'three';

export class Checkpoint {
  public mesh: THREE.Mesh;
  public pos: THREE.Vector3;
  public index: number;
  public passed = false;
  private arrow: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private isRace: boolean;

  public collectionRadius = 5.0;

  constructor(
    pos: THREE.Vector3,
    index: number,
    nextPos: THREE.Vector3,
    isActive: boolean = false,
    isRace: boolean = false,
    customRadius?: number
  ) {
    this.pos = pos.clone();
    this.index = index;
    this.isRace = isRace;

    const heading = Math.atan2(nextPos.x - pos.x, nextPos.z - pos.z);
    const radius = customRadius !== undefined ? customRadius : (isRace ? 4.0 : 3.5);
    const tube = customRadius !== undefined ? (customRadius * 0.08) : (isRace ? 0.3 : 0.25);
    this.collectionRadius = customRadius !== undefined ? (customRadius * 1.2) : 5.0;

    const torusGeom = new THREE.TorusGeometry(radius, tube, 12, 32); // Smoother torus segments
    
    const activeColor = isRace ? 0x00ff00 : 0x00ffff;
    const inactiveColor = isRace ? 0xff0055 : 0xff00ff;
    const color = isActive ? activeColor : inactiveColor;
    
    this.material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: isActive ? 2.5 : 0.6,
      transparent: true,
      opacity: isActive ? 0.95 : 0.4,
      roughness: 0.1,
      metalness: 0.8
    });

    this.mesh = new THREE.Mesh(torusGeom, this.material);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = heading;

    // Floating arrow
    const coneHeight = isRace ? 2.0 : 1.8;
    const coneRadius = isRace ? 0.9 : 0.8;
    const coneGeom = new THREE.ConeGeometry(coneRadius, coneHeight, 4);
    coneGeom.rotateX(Math.PI);
    
    const coneMat = new THREE.MeshStandardMaterial({ 
      color: color,
      emissive: color,
      emissiveIntensity: isActive ? 2.5 : 0.6,
      transparent: true,
      opacity: isActive ? 0.95 : 0.4,
      roughness: 0.1
    });
    this.arrow = new THREE.Mesh(coneGeom, coneMat);
    this.arrow.position.set(0, isRace ? (radius * 1.25) : 4.5, 0); // Position arrow relative to ring height
    this.mesh.add(this.arrow);
  }

  public activate() {
    this.mesh.visible = true;
    const activeColor = this.isRace ? 0x00ff00 : 0x00ffff;
    this.material.color.setHex(activeColor);
    if (this.material.emissive) {
      this.material.emissive.setHex(activeColor);
      this.material.emissiveIntensity = 2.5;
    }
    this.material.opacity = 0.95;

    const arrowMat = this.arrow.material as THREE.MeshStandardMaterial;
    arrowMat.color.setHex(activeColor);
    if (arrowMat.emissive) {
      arrowMat.emissive.setHex(activeColor);
      arrowMat.emissiveIntensity = 2.5;
    }
    arrowMat.opacity = 0.95;
  }

  public deactivate() {
    this.passed = false;
    const inactiveColor = this.isRace ? 0xff0055 : 0xff00ff;
    this.material.color.setHex(inactiveColor);
    if (this.material.emissive) {
      this.material.emissive.setHex(inactiveColor);
      this.material.emissiveIntensity = 0.6;
    }
    this.material.opacity = 0.4;
    this.arrow.visible = true;

    const arrowMat = this.arrow.material as THREE.MeshStandardMaterial;
    arrowMat.color.setHex(inactiveColor);
    if (arrowMat.emissive) {
      arrowMat.emissive.setHex(inactiveColor);
      arrowMat.emissiveIntensity = 0.6;
    }
    arrowMat.opacity = 0.4;
  }

  public markPassed() {
    this.passed = true;
    const passedColor = 0x00ff00;
    this.material.color.setHex(passedColor);
    if (this.material.emissive) {
      this.material.emissive.setHex(passedColor);
      this.material.emissiveIntensity = 0.2;
    }
    this.material.opacity = 0.1;

    const arrowMat = this.arrow.material as THREE.MeshStandardMaterial;
    arrowMat.color.setHex(passedColor);
    if (arrowMat.emissive) {
      arrowMat.emissive.setHex(passedColor);
      arrowMat.emissiveIntensity = 0.2;
    }
    this.arrow.visible = false;
  }

  public checkCollection(carPos: THREE.Vector3): boolean {
    if (this.passed) return false;
    const dist = carPos.distanceTo(this.mesh.position);
    if (dist < this.collectionRadius) {
      this.markPassed();
      return true;
    }
    return false;
  }
}
