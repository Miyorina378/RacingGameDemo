import * as THREE from 'three';
import { Vehicle } from './Vehicle';
import { Obstacle } from './Obstacle';

/**
 * RacingAI — Gran Turismo PS1-style racing AI controller.
 *
 * Drives a Vehicle by outputting simulated player inputs (throttleAnalog, reverseAnalog, steerAnalog).
 * Uses spline-following with lookahead, corner-speed braking, smooth steering interpolation,
 * wall/grass/obstacle avoidance, and spin recovery.
 *
 * No machine learning. No teleportation. Just good old-fashioned simcade AI.
 */
export class RacingAI {
  // --- References ---
  public vehicle: Vehicle;
  private densePath: THREE.Vector3[];
  private speedFactor: number;      // 0.0–1.0 personality cap on max speed
  private lateralOffset: number;    // Lane offset in track-normal units

  // --- Track awareness callbacks (set externally by RaceMode) ---
  public getTrackInfo?: (x: number, z: number) => { dist: number; closestPt: THREE.Vector3 };
  public isOnGrass?: (x: number, z: number) => boolean;
  public trackBoundary: number = 0;
  public obstacles: Obstacle[] = [];

  // --- Internal state ---
  private smoothSteer: number = 0;       // Smoothed steering output (-1 to 1)
  private prevClosestIdx: number = 0;    // Cached closest spline index for fast local search
  private recoveryTimer: number = 0;     // Countdown during wall/spin recovery
  private grassTimer: number = 0;        // Time spent continuously on grass

  // Precomputed tangent vectors for corner analysis (computed once on init)
  private tangents: THREE.Vector3[] = [];

  constructor(
    vehicle: Vehicle,
    densePath: THREE.Vector3[],
    speedFactor: number,
    lateralOffset: number
  ) {
    this.vehicle = vehicle;
    this.densePath = densePath;
    this.speedFactor = speedFactor;
    this.lateralOffset = lateralOffset;

    // Precompute tangent vectors along the spline for fast corner analysis
    this.precomputeTangents();
  }

  /**
   * Precompute unit tangent vectors at every spline point.
   * Used for fast corner-sharpness lookups without recomputing each frame.
   */
  private precomputeTangents(): void {
    const len = this.densePath.length;
    this.tangents = new Array(len);
    for (let i = 0; i < len; i++) {
      const next = (i + 1) % len;
      const t = new THREE.Vector3().subVectors(this.densePath[next], this.densePath[i]);
      t.y = 0;
      if (t.lengthSq() > 0.0001) {
        t.normalize();
      } else {
        t.set(0, 0, 1);
      }
      this.tangents[i] = t;
    }
  }

  /**
   * Main AI tick — call once per frame.
   * Returns a keys object that can be passed directly to Vehicle.update().
   */
  public computeInputs(deltaTime: number): { [key: string]: boolean | number } {
    const keys: { [key: string]: boolean | number } = {
      w: false,
      s: false,
      a: false,
      d: false,
      ' ': false,
      throttleAnalog: 0,
      reverseAnalog: 0,
      steerAnalog: 0
    };

    const pathLen = this.densePath.length;
    if (pathLen < 3) return keys;

    const pos = this.vehicle.pos;
    const speed = this.vehicle.speed;
    const yaw = this.vehicle.yaw;
    const maxSpeed = this.vehicle.maxSpeed;

    // =============================================
    // 1. FIND CLOSEST SPLINE POINT (local window)
    // =============================================
    const searchWindow = 40;
    let closestIdx = this.prevClosestIdx;
    let minDistSq = Infinity;

    const searchStart = (this.prevClosestIdx - searchWindow + pathLen) % pathLen;
    for (let offset = 0; offset < searchWindow * 2; offset++) {
      const i = (searchStart + offset) % pathLen;
      const dx = this.densePath[i].x - pos.x;
      const dz = this.densePath[i].z - pos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestIdx = i;
      }
    }
    this.prevClosestIdx = closestIdx;

    // =============================================
    // 2. DYNAMIC LOOKAHEAD TARGET
    // =============================================
    // Faster car = look further ahead for smoother lines
    const baseLookahead = 8;
    const speedLookahead = Math.abs(speed) * 0.22;
    const lookaheadSteps = Math.round(baseLookahead + speedLookahead);
    const targetIdx = (closestIdx + lookaheadSteps) % pathLen;
    const targetPt = this.densePath[targetIdx];

    // Apply lateral offset along the track normal at the target point
    const targetTangent = this.tangents[targetIdx];
    const targetNormal = new THREE.Vector3(-targetTangent.z, 0, targetTangent.x);
    const offsetTarget = targetPt.clone().addScaledVector(targetNormal, this.lateralOffset);

    // =============================================
    // 3. CALCULATE RAW STEERING
    // =============================================
    const diff = new THREE.Vector3().subVectors(offsetTarget, pos);
    diff.y = 0;
    const targetYaw = Math.atan2(diff.x, diff.z);

    let yawDiff = targetYaw - yaw;
    // Normalize to [-PI, PI]
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;

    // Speed-dependent steering gain:
    // At low speed, higher gain for tighter turns
    // At high speed, lower gain for stability
    const speedRatio = Math.abs(speed) / Math.max(maxSpeed, 1);
    const steerGain = THREE.MathUtils.lerp(3.0, 1.5, Math.min(speedRatio, 1.0));
    let rawSteer = THREE.MathUtils.clamp(yawDiff * steerGain, -1.0, 1.0);

    // =============================================
    // 4. GRASS AWARENESS
    // =============================================
    let onGrass = false;
    if (this.isOnGrass) {
      onGrass = this.isOnGrass(pos.x, pos.z);
    }

    if (onGrass) {
      this.grassTimer += deltaTime;
    } else {
      this.grassTimer = Math.max(0, this.grassTimer - deltaTime * 3.0);
    }

    // If on grass, steer back toward track center line
    if (this.grassTimer > 0.1 && this.getTrackInfo) {
      const info = this.getTrackInfo(pos.x, pos.z);
      const toCenter = new THREE.Vector3().subVectors(info.closestPt, pos);
      toCenter.y = 0;
      const centerYaw = Math.atan2(toCenter.x, toCenter.z);
      let centerYawDiff = centerYaw - yaw;
      while (centerYawDiff < -Math.PI) centerYawDiff += Math.PI * 2;
      while (centerYawDiff > Math.PI) centerYawDiff -= Math.PI * 2;

      // Blend toward center steering — stronger the longer we've been on grass
      const grassUrgency = Math.min(this.grassTimer * 2.0, 0.7);
      rawSteer = THREE.MathUtils.lerp(rawSteer, THREE.MathUtils.clamp(centerYawDiff * 2.5, -1, 1), grassUrgency);
    }

    // =============================================
    // 5. WALL RECOVERY
    // =============================================
    if (this.trackBoundary > 0 && this.getTrackInfo) {
      const info = this.getTrackInfo(pos.x, pos.z);
      const wallProximity = info.dist / this.trackBoundary; // 0 = center, 1 = at wall

      if (wallProximity > 0.80) {
        // Close to wall — steer back toward track center
        const toCenter = new THREE.Vector3().subVectors(info.closestPt, pos);
        toCenter.y = 0;
        const centerYaw = Math.atan2(toCenter.x, toCenter.z);
        let centerDiff = centerYaw - yaw;
        while (centerDiff < -Math.PI) centerDiff += Math.PI * 2;
        while (centerDiff > Math.PI) centerDiff -= Math.PI * 2;

        const wallUrgency = THREE.MathUtils.clamp((wallProximity - 0.80) / 0.20, 0, 1);
        rawSteer = THREE.MathUtils.lerp(rawSteer, THREE.MathUtils.clamp(centerDiff * 3.0, -1, 1), wallUrgency * 0.8);

        this.recoveryTimer = 0.5; // Prevent aggressive throttle for half a second
      }
    }

    // =============================================
    // 6. SPIN / SLIDE RECOVERY
    // =============================================
    // Check if car heading diverges significantly from travel direction
    if (Math.abs(speed) > 3) {
      const headingVec = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const velocityVec = new THREE.Vector3().subVectors(
        this.densePath[(closestIdx + 2) % pathLen],
        this.densePath[closestIdx]
      ).normalize();

      const headingDot = headingVec.dot(velocityVec);

      if (headingDot < 0.3) {
        // Car is significantly sideways or backwards — enter recovery
        this.recoveryTimer = Math.max(this.recoveryTimer, 1.0);

        // Counter-steer: steer toward the spline forward direction
        const recoveryYaw = Math.atan2(velocityVec.x, velocityVec.z);
        let recoveryDiff = recoveryYaw - yaw;
        while (recoveryDiff < -Math.PI) recoveryDiff += Math.PI * 2;
        while (recoveryDiff > Math.PI) recoveryDiff -= Math.PI * 2;

        rawSteer = THREE.MathUtils.clamp(recoveryDiff * 2.0, -1.0, 1.0);
      }
    }

    // Recovery timer — reduce aggression while recovering
    if (this.recoveryTimer > 0) {
      this.recoveryTimer -= deltaTime;
    }

    // =============================================
    // 7. SMOOTH STEERING
    // =============================================
    // Lerp toward raw steer — prevents sudden snap turns
    // Rate is slower at high speed for GT-like stability
    const smoothRate = THREE.MathUtils.lerp(6.0, 3.0, Math.min(speedRatio, 1.0));
    this.smoothSteer = THREE.MathUtils.lerp(this.smoothSteer, rawSteer, smoothRate * deltaTime);

    // Clamp final steer output
    keys.steerAnalog = THREE.MathUtils.clamp(this.smoothSteer, -1.0, 1.0);

    // =============================================
    // 8. CORNER SPEED CALCULATION (multi-point scan)
    // =============================================
    // Look at 3 distances ahead and find the sharpest upcoming turn
    const scanDistances = [18, 32, 50]; // spline steps ahead
    let worstCornerSharpness = 0;

    for (const scanDist of scanDistances) {
      const aIdx = (closestIdx + scanDist) % pathLen;
      const bIdx = (closestIdx + scanDist + 8) % pathLen;

      const tangentA = this.tangents[aIdx];
      const tangentB = this.tangents[bIdx];

      const dot = THREE.MathUtils.clamp(tangentA.dot(tangentB), -1, 1);
      const sharpness = Math.acos(dot);

      if (sharpness > worstCornerSharpness) {
        worstCornerSharpness = sharpness;
      }
    }

    // Convert corner sharpness to a safe speed
    // Sharper turn = lower safe speed
    // sharpness 0 (straight) = full speed, sharpness ~0.5+ (tight corner) = 35-45% speed
    const cornerSpeedFactor = Math.max(0.30, 1.0 - worstCornerSharpness * 1.4);
    const baseTargetSpeed = maxSpeed * this.speedFactor;
    let targetSpeed = baseTargetSpeed * cornerSpeedFactor;

    // If on grass, cap target speed lower
    if (this.grassTimer > 0.1) {
      targetSpeed *= Math.max(0.5, 1.0 - this.grassTimer * 0.3);
    }

    // If recovering, drive slower
    if (this.recoveryTimer > 0) {
      targetSpeed *= 0.5;
    }

    // =============================================
    // 9. THROTTLE / BRAKE CONTROL
    // =============================================
    const speedError = targetSpeed - speed;

    if (speedError > 0) {
      // Need to accelerate
      // Soft throttle ramp — more gas when far from target, less when close
      keys.throttleAnalog = THREE.MathUtils.clamp(speedError * 0.15, 0.05, 1.0);
      keys.reverseAnalog = 0;
    } else {
      // Need to slow down
      keys.throttleAnalog = 0;
      // Progressive braking — harder braking for larger overspeed
      keys.reverseAnalog = THREE.MathUtils.clamp(-speedError * 0.25, 0, 1.0);
    }

    // =============================================
    // 10. THROTTLE MODULATION WHEN STEERING
    // =============================================
    // Reduce throttle when turning hard — prevents AI from overdriving corners
    const steerMagnitude = Math.abs(this.smoothSteer);
    if (steerMagnitude > 0.15 && typeof keys.throttleAnalog === 'number') {
      const throttleReduction = 1.0 - steerMagnitude * 0.4;
      keys.throttleAnalog = (keys.throttleAnalog as number) * Math.max(0.3, throttleReduction);
    }

    // =============================================
    // 11. SIMPLE OBSTACLE AVOIDANCE
    // =============================================
    if (this.obstacles.length > 0 && Math.abs(speed) > 5) {
      const forwardVec = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));

      for (const obstacle of this.obstacles) {
        const toObs = new THREE.Vector3().subVectors(obstacle.pos, pos);
        toObs.y = 0;
        const dist = toObs.length();

        if (dist < 15) {
          // Check if obstacle is roughly ahead of us
          const dot = forwardVec.dot(toObs.normalize());
          if (dot > 0.3) {
            // Obstacle is ahead — determine which side to dodge
            const rightVec = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
            const side = rightVec.dot(toObs);

            // Steer away from obstacle
            const dodgeIntensity = THREE.MathUtils.clamp((15 - dist) / 10, 0, 0.5);
            if (side > 0) {
              // Obstacle is to our right — steer left
              this.smoothSteer -= dodgeIntensity;
            } else {
              // Obstacle is to our left — steer right
              this.smoothSteer += dodgeIntensity;
            }
            keys.steerAnalog = THREE.MathUtils.clamp(this.smoothSteer, -1.0, 1.0);

            // Slow down a bit
            if (dist < 8) {
              keys.throttleAnalog = Math.min(keys.throttleAnalog as number, 0.3);
            }
            break; // Only dodge one obstacle per frame
          }
        }
      }
    }

    return keys;
  }
}
