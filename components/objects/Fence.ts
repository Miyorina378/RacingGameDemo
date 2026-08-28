import * as THREE from 'three';
import { Vehicle } from './Vehicle';

/**
 * Enforces fence/track boundary and spur dead-end barrier collisions.
 * Reflects velocity off wall and barrier normals for realistic crash & bounce-off behavior.
 */
export function enforceFenceBoundary(vehicle: Vehicle): void {
  // 1. Check spur dead-end barrier crash collisions first
  const spurBarriers = vehicle.getSpurBarriers ? vehicle.getSpurBarriers() : null;
  if (spurBarriers && spurBarriers.length > 0) {
    const carRadius = 1.6; // Effective vehicle bumper collision radius
    const carHeight = 1.8;
    for (const barrier of spurBarriers) {
      // Vehicle y is its support plane. Ignore a wall on another deck entirely.
      const carBottom = vehicle.pos.y;
      const carTop = carBottom + carHeight;
      const barrierBottom = barrier.center.y - 0.25;
      const barrierTop = barrier.center.y + barrier.height;
      if (carTop < barrierBottom || carBottom > barrierTop) continue;

      const toCar = new THREE.Vector3().subVectors(vehicle.pos, barrier.center);
      toCar.y = 0;

      const alongBarrier = toCar.dot(barrier.tangent);
      const acrossBarrier = toCar.dot(barrier.normal);
      const halfWidth = barrier.halfWidth + carRadius;
      const halfDepth = barrier.halfDepth + carRadius;
      if (Math.abs(alongBarrier) > halfWidth || Math.abs(acrossBarrier) > halfDepth) {
        continue;
      }

      // A free-standing wall blocks from both directions. Resolve to whichever side
      // the car entered from rather than always pushing along the authored normal;
      // otherwise a car on the live road gets teleported into a closed bypass.
      const side = acrossBarrier >= 0 ? 1 : -1;
      const targetDistance = side * (barrier.halfDepth + carRadius + 0.1);
      vehicle.pos.addScaledVector(
        barrier.normal,
        targetDistance - acrossBarrier
      );

      const velocityAcross =
        vehicle.velocityX * barrier.normal.x +
        vehicle.velocityZ * barrier.normal.z;
      if (velocityAcross * side < 0) {
        const restitution = 0.35;
        vehicle.velocityX -=
          (1 + restitution) * velocityAcross * barrier.normal.x;
        vehicle.velocityZ -=
          (1 + restitution) * velocityAcross * barrier.normal.z;
        vehicle.velocityX *= 0.75;
        vehicle.velocityZ *= 0.75;
        vehicle.speed = Math.hypot(vehicle.velocityX, vehicle.velocityZ);

        if (vehicle.onFenceCollision) {
          vehicle.onFenceCollision(
            barrier.center.clone().addScaledVector(barrier.tangent, alongBarrier)
          );
        }
      }
    }
  }

  // 2. Check spur road lateral boundary if car is currently driving on a spur
  if (vehicle.getSpurInfo) {
    const spurInfo = vehicle.getSpurInfo(vehicle.pos.x, vehicle.pos.z, vehicle.pos.y);
    if (spurInfo) {
      const maxSpurDist = spurInfo.trackBoundary - 1.0;
      if (spurInfo.dist > maxSpurDist && spurInfo.fence) {
        const pushDir = new THREE.Vector3().subVectors(vehicle.pos, spurInfo.closestPt);
        pushDir.y = 0;
        if (pushDir.lengthSq() < 0.0001) pushDir.set(1, 0, 0);
        else pushDir.normalize();

        const snappedPos = spurInfo.closestPt.clone().addScaledVector(pushDir, maxSpurDist);
        snappedPos.y = vehicle.pos.y;
        vehicle.pos.copy(snappedPos);

        const velDotNormal = vehicle.velocityX * pushDir.x + vehicle.velocityZ * pushDir.z;
        if (velDotNormal > 0) {
          const restitution = 0.3;
          vehicle.velocityX -= (1 + restitution) * velDotNormal * pushDir.x;
          vehicle.velocityZ -= (1 + restitution) * velDotNormal * pushDir.z;
          vehicle.velocityX *= 0.88;
          vehicle.velocityZ *= 0.88;
          vehicle.speed = Math.hypot(vehicle.velocityX, vehicle.velocityZ);
          if (vehicle.onFenceCollision) vehicle.onFenceCollision(snappedPos);
        }
      }
      if (spurInfo.onAsphalt || spurInfo.onCurb || spurInfo.onGrass || spurInfo.fence) {
        return; // Spur boundary handled; do not apply main track boundary here
      }
    }
  }

  // 3. Main circuit track fence boundary
  if (!vehicle.haveFence || vehicle.trackBoundary <= 0 || !vehicle.getTrackInfo) return;

  const info = vehicle.getTrackInfo(vehicle.pos.x, vehicle.pos.z, vehicle.pos.y);
  if (info.fence === false) return;
  const activeBoundary = info.trackBoundary ?? vehicle.trackBoundary;
  const maxAllowedDist = activeBoundary - 1.2; // half car width
  if (info.dist > maxAllowedDist) {
    const pushDir = new THREE.Vector3().subVectors(vehicle.pos, info.closestPt);
    pushDir.y = 0;
    if (pushDir.lengthSq() < 0.0001) pushDir.set(1, 0, 0);
    else pushDir.normalize();

    const snappedPos = info.closestPt.clone().addScaledVector(pushDir, maxAllowedDist);
    snappedPos.y = vehicle.pos.y;
    vehicle.pos.copy(snappedPos);

    const velDotNormal = vehicle.velocityX * pushDir.x + vehicle.velocityZ * pushDir.z;

    if (velDotNormal > 0) {
      const restitution = 0.3;
      vehicle.velocityX -= (1 + restitution) * velDotNormal * pushDir.x;
      vehicle.velocityZ -= (1 + restitution) * velDotNormal * pushDir.z;
      vehicle.velocityX *= 0.92;
      vehicle.velocityZ *= 0.92;
    }

    vehicle.speed = Math.hypot(vehicle.velocityX, vehicle.velocityZ);

    if (vehicle.onFenceCollision) vehicle.onFenceCollision(snappedPos);
  }
}
