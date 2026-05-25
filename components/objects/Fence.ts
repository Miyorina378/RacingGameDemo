import * as THREE from 'three';
import { Vehicle } from './Vehicle';

/**
 * Enforces fence/track boundary based on callbacks provided in Vehicle.
 * Keeps the original behaviour (snap back, spark, speed damping).
 */
export function enforceFenceBoundary(vehicle: Vehicle, deltaTime: number): void {
  if (!vehicle.haveFence || vehicle.trackBoundary <= 0 || !vehicle.getTrackInfo) return;

  const info = vehicle.getTrackInfo(vehicle.pos.x, vehicle.pos.z);
  const maxAllowedDist = vehicle.trackBoundary - 1.2; // half car width
  if (info.dist > maxAllowedDist) {
    const pushDir = new THREE.Vector3().subVectors(vehicle.pos, info.closestPt);
    pushDir.y = 0;
    if (pushDir.lengthSq() < 0.0001) pushDir.set(1, 0, 0);
    else pushDir.normalize();

    const snappedPos = info.closestPt.clone().addScaledVector(pushDir, maxAllowedDist);
    vehicle.pos.copy(snappedPos);

    if (vehicle.onFenceCollision) vehicle.onFenceCollision(snappedPos);
    vehicle.speed *= 0.96;
  }
}
