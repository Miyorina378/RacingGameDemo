import * as THREE from 'three';
import { BaseMode } from './BaseMode';

export class GarageMode extends BaseMode {
  public init() {
    this.clearEnvironment();
    this.particles.clear();

    this.vehicle.reset(new THREE.Vector3(0, 0, 0), 0);

    // Grid floor for the garage
    const size = 40;
    const divisions = 20;
    const grid = new THREE.GridHelper(size, divisions, 0x00ffff, 0x111133);
    grid.position.y = 0;
    this.environmentGroup.add(grid);

    // Glowing circular stand for the car
    const standGeom = new THREE.CylinderGeometry(4.5, 4.6, 0.15, 32);
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x111122,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x001122,
    });
    const stand = new THREE.Mesh(standGeom, standMat);
    stand.position.y = 0.075;
    this.environmentGroup.add(stand);

    const ringGeom = new THREE.RingGeometry(4.5, 4.7, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.y = 0.16;
    this.environmentGroup.add(ring);

    // Spotlights
    const spot = new THREE.SpotLight(0xffffff, 15, 30, Math.PI / 6, 0.4, 1);
    spot.position.set(0, 10, 0);
    spot.target = this.vehicle.mesh;
    this.environmentGroup.add(spot);

    // Set callback state in React
    this.engine.callbacks.onGameStatus('idle');
  }

  public update(deltaTime: number) {
    // Slowly rotate the car group
    this.vehicle.mesh.rotation.y += 0.1 * deltaTime;
  }

  public cleanup() {
    this.clearEnvironment();
  }

  public reset() {
    this.init();
  }
}
