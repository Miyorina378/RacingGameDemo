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
  if (vehicle.grassInstability > 0 && Math.abs(vehicle.speed) > 4.2) {
    // Apply a mild, oscillating lateral acceleration to simulate losing traction on bumpy grass
    // Coefficient scaled up (0.55 vs 0.15) to compensate for m/s velocity being ~3.6× smaller than old km/h values
    const lateralSlideAccel = Math.sin(performance.now() * 0.005) * 0.15 * vehicle.grassInstability;

    // Apply as a lateral velocity impulse in the car's local right direction
    const cosYaw = Math.cos(vehicle.yaw);
    const sinYaw = Math.sin(vehicle.yaw);

    // Right vector in world space: (cosYaw, 0, -sinYaw)
    vehicle.velocityX += cosYaw * lateralSlideAccel * deltaTime * 60;
    vehicle.velocityZ += -sinYaw * lateralSlideAccel * deltaTime * 60;
  }
}

export function applyGrassSpeedReduction(vehicle: Vehicle, deltaTime: number): void {
  if (vehicle.grassInstability > 0) {
    const currentSpeed = Math.abs(vehicle.speed);
    const speedLimit = 60 / 3.6; // 60 km/h in m/s (~16.67 m/s)
    
    if (currentSpeed > speedLimit) {
      // Heavy speed reduction representing drag/resistance from thick grass
      // Math.exp is frame-rate independent
      const dampRate = 0.85; // Strong resistance, but not an instant stop like a brake
      const decay = Math.exp(-dampRate * vehicle.grassInstability * deltaTime);
      
      // Calculate target speed after decay
      let targetSpeed = currentSpeed * decay;
      
      // Do not decay below the 60 km/h limit
      if (targetSpeed < speedLimit) {
        targetSpeed = speedLimit;
      }
      
      // Scale velocity vector to the target speed
      const scale = targetSpeed / currentSpeed;
      vehicle.velocityX *= scale;
      vehicle.velocityZ *= scale;
      
      // Update the derived speed property so HUD and other physics systems see the reduced speed immediately
      vehicle.speed = vehicle.velocityX * Math.sin(vehicle.yaw) + vehicle.velocityZ * Math.cos(vehicle.yaw);
    }
  }
}

