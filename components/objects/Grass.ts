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

/**
 * Uneven ground on grass unsettles the car sideways. This is a genuine
 * acceleration applied to the velocity vector, so the tires resist it through the
 * normal slip-angle path on the following step.
 *
 * The previous version multiplied its acceleration by `deltaTime * 60`, which made
 * the peak roughly 9 m/s² — close to a full g of sideways shove — and described
 * itself as "mild". 0.9 m/s² is the intended order of magnitude for a car crossing
 * a rough verge.
 */
export function applyGrassLateralSlide(vehicle: Vehicle, deltaTime: number): void {
  if (vehicle.grassInstability <= 0 || Math.abs(vehicle.speed) <= 4.2) return;

  // Driven from simulated time, not wall-clock, so the fixed physics step stays
  // reproducible.
  const lateralSlideAccel =
    Math.sin(vehicle.physicsTime * 5.0) * 0.9 * vehicle.grassInstability;

  const cosYaw = Math.cos(vehicle.yaw);
  const sinYaw = Math.sin(vehicle.yaw);

  // Right vector in world space: (cosYaw, 0, -sinYaw)
  vehicle.velocityX += cosYaw * lateralSlideAccel * deltaTime;
  vehicle.velocityZ += -sinYaw * lateralSlideAccel * deltaTime;
}

/**
 * Extra drag from thick grass, applied as a decay along the whole velocity vector.
 *
 * Two things were wrong before: the speed test read only the forward component, so
 * a car sliding sideways across grass at 100 km/h with 20 km/h of forward speed was
 * left completely alone; and the decay hard-floored at 60 km/h, meaning grass could
 * not slow a car below that no matter how long it stayed off-line. Rolling
 * resistance in Vehicle already scales with grassInstability, so this only needs to
 * add the high-speed component.
 */
export function applyGrassSpeedReduction(vehicle: Vehicle, deltaTime: number): void {
  if (vehicle.grassInstability <= 0) return;

  const groundSpeed = Math.hypot(vehicle.velocityX, vehicle.velocityZ);
  const dragOnsetSpeed = 60 / 3.6; // ~16.67 m/s
  if (groundSpeed <= dragOnsetSpeed) return;

  const dampRate = 0.85;
  const decay = Math.exp(-dampRate * vehicle.grassInstability * deltaTime);
  const targetSpeed = Math.max(dragOnsetSpeed, groundSpeed * decay);

  vehicle.scaleVelocity(targetSpeed / groundSpeed);
}
