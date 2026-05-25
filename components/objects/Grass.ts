import * as THREE from 'three';
import { Vehicle } from './Vehicle';

/**
 * Helper utilities for grass‑related physics.
 * Keeps Vehicle.update() tidy while preserving existing public API.
 */
export function updateGrassInstability(vehicle: Vehicle, deltaTime: number): void {
  const onGrass = vehicle.isOnGrass ? vehicle.isOnGrass(vehicle.pos.x, vehicle.pos.z) : false;
  if (onGrass) {
    vehicle.grassInstability = THREE.MathUtils.clamp(vehicle.grassInstability + deltaTime * 1.5, 0, 1);
  } else {
    vehicle.grassInstability = THREE.MathUtils.clamp(vehicle.grassInstability - deltaTime * 2.0, 0, 1);
  }
}

export function applyGrassLateralSlide(vehicle: Vehicle, deltaTime: number): void {
  if (vehicle.grassInstability > 0 && Math.abs(vehicle.speed) > 15) {
    const rightVector = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), vehicle.yaw);
    const lateralSlide = Math.sin(performance.now() * 0.002) * 0.03 * Math.abs(vehicle.speed) * vehicle.grassInstability;
    vehicle.pos.addScaledVector(rightVector, lateralSlide * deltaTime);
  }
}
