import * as THREE from 'three';
import { Vehicle } from './Vehicle';

/**
 * Enforces fence/track boundary based on callbacks provided in Vehicle.
 * Reflects velocity off the wall normal for realistic bounce-off behavior.
 */
export function enforceFenceBoundary(vehicle: Vehicle, deltaTime: number): void {
  if (!vehicle.haveFence || vehicle.trackBoundary <= 0 || !vehicle.getTrackInfo) return;

  const info = vehicle.getTrackInfo(vehicle.pos.x, vehicle.pos.z);
  const maxAllowedDist = vehicle.trackBoundary - 1.2; // half car width
  if (info.dist > maxAllowedDist) {
    // Compute wall normal (pointing from track center toward car)
    const pushDir = new THREE.Vector3().subVectors(vehicle.pos, info.closestPt);
    pushDir.y = 0;
    if (pushDir.lengthSq() < 0.0001) pushDir.set(1, 0, 0);
    else pushDir.normalize();

    // Snap position back inside boundary
    const snappedPos = info.closestPt.clone().addScaledVector(pushDir, maxAllowedDist);
    vehicle.pos.copy(snappedPos);

    // Reflect velocity off the wall normal
    // v_reflected = v - 2(v · n)n, but we use a softer reflection with energy loss
    const velDotNormal = vehicle.velocityX * pushDir.x + vehicle.velocityZ * pushDir.z;

    if (velDotNormal > 0) {
      // Car is moving toward the wall — reflect with energy loss
      const restitution = 0.3; // 0 = full absorb, 1 = perfect bounce
      vehicle.velocityX -= (1 + restitution) * velDotNormal * pushDir.x;
      vehicle.velocityZ -= (1 + restitution) * velDotNormal * pushDir.z;

      // Additional speed penalty for the impact
      vehicle.velocityX *= 0.92;
      vehicle.velocityZ *= 0.92;
    }

    // Update derived speed from reflected velocity
    vehicle.speed = Math.sqrt(vehicle.velocityX * vehicle.velocityX + vehicle.velocityZ * vehicle.velocityZ);

    if (vehicle.onFenceCollision) vehicle.onFenceCollision(snappedPos);
  }
}
