import * as THREE from 'three';
import { Vehicle } from './Vehicle';
import { Obstacle } from './Obstacle';
import type { DrivingMode } from '../option';

interface PathSample {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  distanceAlong: number;
}

interface PathProjection extends PathSample {
  segmentIndex: number;
  fraction: number;
  distanceSq: number;
  lateralError: number;
}

interface ObstacleAdjustment {
  steer: number;
  speedCap: number;
}

/**
 * RacingAI drives a Vehicle through the normal analog input contract.
 *
 * The controller follows the same physical centreline as the road, but all
 * lookahead and corner calculations are expressed in metres rather than point
 * indices. That keeps a 4m sample on a short track and a 4m sample on a 12km
 * track behaving the same way.
 */
export class RacingAI {
  public vehicle: Vehicle;
  private densePath: THREE.Vector3[];
  private speedFactor: number;
  private lateralOffset: number;

  public drivingMode: DrivingMode = 'simulation';

  public getTrackInfo?: (x: number, z: number, yHint?: number) => {
    dist: number;
    closestPt: THREE.Vector3;
    closestIdx?: number;
    width?: number;
    leftScale?: number;
    rightScale?: number;
    sideSign?: number;
    trackBoundary?: number;
    banking?: number;
    curb?: boolean;
    grassWidth?: number;
    fence?: boolean;
  };
  public isOnGrass?: (x: number, z: number) => boolean;
  public trackBoundary = 0;
  public obstacles: Obstacle[] = [];

  private smoothSteer = 0;
  private prevClosestIdx = 0;
  private prevDistanceAlong = 0;
  private hasProjection = false;
  private recoveryTimer = 0;
  private grassTimer = 0;

  private segmentLengths: number[] = [];
  private cumulativeDistances: number[] = [];
  private tangents: THREE.Vector3[] = [];
  private pathLength = 0;
  private pathSpacing = 4;

  private readonly Y_DISTANCE_WEIGHT = 2.0;
  private readonly LANE_CAR_MARGIN = 1.8;
  private readonly MAX_LANE_OFFSET = 6.0;

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
    this.buildPathCache();
  }

  /** Remove duplicate seam points and cache the loop in arc-length space. */
  private buildPathCache(): void {
    const cleaned: THREE.Vector3[] = [];
    for (const point of this.densePath) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
        continue;
      }
      if (cleaned.length === 0 || cleaned[cleaned.length - 1].distanceToSquared(point) > 1e-8) {
        cleaned.push(point.clone());
      }
    }

    // Curve.getSpacedPoints() repeats the first point for a closed curve. It is
    // useful to the road ribbon, but it is not a real AI segment.
    if (cleaned.length > 2 && cleaned[0].distanceToSquared(cleaned[cleaned.length - 1]) < 1e-4) {
      cleaned.pop();
    }

    this.densePath = cleaned;
    this.segmentLengths = [];
    this.cumulativeDistances = [];
    this.tangents = [];
    this.pathLength = 0;
    this.hasProjection = false;
    this.prevClosestIdx = 0;
    this.prevDistanceAlong = 0;

    const length = this.densePath.length;
    if (length < 2) return;

    this.cumulativeDistances = new Array(length).fill(0);
    this.segmentLengths = new Array(length).fill(0);

    for (let i = 0; i < length; i++) {
      const next = (i + 1) % length;
      const segmentLength = this.densePath[i].distanceTo(this.densePath[next]);
      this.segmentLengths[i] = Math.max(segmentLength, 0.001);
      if (i < length - 1) {
        this.cumulativeDistances[i + 1] =
          this.cumulativeDistances[i] + this.segmentLengths[i];
      }
      this.pathLength += this.segmentLengths[i];
    }
    this.pathSpacing = this.pathLength / Math.max(1, length);

    for (let i = 0; i < length; i++) {
      const previous = this.densePath[(i - 1 + length) % length];
      const next = this.densePath[(i + 1) % length];
      const tangent = new THREE.Vector3(next.x - previous.x, 0, next.z - previous.z);

      if (tangent.lengthSq() < 1e-8) {
        tangent.set(
          this.densePath[(i + 1) % length].x - this.densePath[i].x,
          0,
          this.densePath[(i + 1) % length].z - this.densePath[i].z
        );
      }
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
      this.tangents.push(tangent.normalize());
    }
  }

  private normalizeDistance(distance: number): number {
    if (this.pathLength <= 0) return 0;
    const wrapped = distance % this.pathLength;
    return wrapped < 0 ? wrapped + this.pathLength : wrapped;
  }

  private normalizeAngle(angle: number): number {
    return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
  }

  private getSegmentTangent(index: number): THREE.Vector3 {
    const length = this.densePath.length;
    const from = this.densePath[index];
    const to = this.densePath[(index + 1) % length];
    const tangent = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
    if (tangent.lengthSq() >= 1e-8) return tangent.normalize();
    return this.tangents[index]?.clone() || new THREE.Vector3(0, 0, 1);
  }

  private findSegmentAtDistance(distance: number): { index: number; fraction: number } {
    const wrapped = this.normalizeDistance(distance);
    const length = this.densePath.length;
    if (length === 0) return { index: 0, fraction: 0 };

    let low = 0;
    let high = length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (this.cumulativeDistances[middle] <= wrapped) low = middle + 1;
      else high = middle - 1;
    }

    const index = THREE.MathUtils.clamp(low - 1, 0, length - 1);
    const segmentStart = this.cumulativeDistances[index] ?? 0;
    const segmentLength = this.segmentLengths[index] || 0.001;
    return {
      index,
      fraction: THREE.MathUtils.clamp(
        (wrapped - segmentStart) / segmentLength,
        0,
        1
      )
    };
  }

  private getTangentAtDistance(distance: number): THREE.Vector3 {
    const { index, fraction } = this.findSegmentAtDistance(distance);
    const nextIndex = (index + 1) % this.densePath.length;
    const start = this.tangents[index] || this.getSegmentTangent(index);
    const end = this.tangents[nextIndex] || start;
    const tangent = start.clone().multiplyScalar(1 - fraction).addScaledVector(end, fraction);
    if (tangent.lengthSq() < 1e-8) return this.getSegmentTangent(index);
    return tangent.normalize();
  }

  private getPathSampleAtDistance(distance: number): PathSample {
    const { index, fraction } = this.findSegmentAtDistance(distance);
    const nextIndex = (index + 1) % this.densePath.length;
    const point = new THREE.Vector3().lerpVectors(
      this.densePath[index],
      this.densePath[nextIndex],
      fraction
    );
    const tangent = this.getTangentAtDistance(distance);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

    return {
      point,
      tangent,
      normal,
      distanceAlong: this.normalizeDistance(distance)
    };
  }

  /** Project onto a segment using XZ for road position and Y to separate overpasses. */
  private projectOntoSegment(index: number, position: THREE.Vector3): PathProjection {
    const length = this.densePath.length;
    const from = this.densePath[index];
    const to = this.densePath[(index + 1) % length];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const xzLengthSq = dx * dx + dz * dz;

    let fraction = 0;
    if (xzLengthSq > 1e-8) {
      fraction = THREE.MathUtils.clamp(
        ((position.x - from.x) * dx + (position.z - from.z) * dz) / xzLengthSq,
        0,
        1
      );
    } else {
      const dy = to.y - from.y;
      const lengthSq = xzLengthSq + dy * dy;
      if (lengthSq > 1e-8) {
        fraction = THREE.MathUtils.clamp(
          ((position.x - from.x) * dx +
            (position.y - from.y) * dy +
            (position.z - from.z) * dz) /
            lengthSq,
          0,
          1
        );
      }
    }

    const point = new THREE.Vector3().lerpVectors(from, to, fraction);
    const tangent = this.getTangentAtDistance(
      (this.cumulativeDistances[index] || 0) +
        (this.segmentLengths[index] || 0) * fraction
    );
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const offsetX = position.x - point.x;
    const offsetZ = position.z - point.z;
    const offsetY = position.y - point.y;
    const lateralError = offsetX * normal.x + offsetZ * normal.z;

    return {
      segmentIndex: index,
      fraction,
      point,
      tangent,
      normal,
      distanceAlong: this.normalizeDistance(
        (this.cumulativeDistances[index] || 0) +
          (this.segmentLengths[index] || 0) * fraction
      ),
      distanceSq:
        offsetX * offsetX +
        offsetZ * offsetZ +
        offsetY * offsetY * this.Y_DISTANCE_WEIGHT,
      lateralError
    };
  }

  private chooseCloser(
    current: PathProjection | null,
    candidate: PathProjection
  ): PathProjection {
    return !current || candidate.distanceSq < current.distanceSq ? candidate : current;
  }

  private findClosestFromWindow(
    position: THREE.Vector3,
    centerIndex: number,
    radius: number
  ): PathProjection | null {
    const length = this.densePath.length;
    let closest: PathProjection | null = null;

    for (let offset = -radius; offset <= radius; offset++) {
      const index = (centerIndex + offset + length) % length;
      closest = this.chooseCloser(closest, this.projectOntoSegment(index, position));
    }
    return closest;
  }

  private findClosestFullPath(position: THREE.Vector3): PathProjection | null {
    let closest: PathProjection | null = null;
    for (let index = 0; index < this.densePath.length; index++) {
      closest = this.chooseCloser(closest, this.projectOntoSegment(index, position));
    }
    return closest;
  }

  /** Use a physical search window, then recover with a full scan when the car is lost. */
  private findClosestPathProjection(): PathProjection | null {
    const length = this.densePath.length;
    if (length < 2 || this.pathLength <= 0) return null;

    const searchDistance = THREE.MathUtils.clamp(
      120 + Math.abs(this.vehicle.speed) * 2.5,
      120,
      240
    );
    const searchRadius = Math.min(
      length - 1,
      Math.max(8, Math.ceil(searchDistance / Math.max(this.pathSpacing * 0.75, 1)))
    );

    let closest = this.findClosestFromWindow(
      this.vehicle.pos,
      this.prevClosestIdx,
      searchRadius
    );

    const maximumLocalError = Math.max(
      30,
      this.trackBoundary > 0 ? this.trackBoundary * 1.5 : 36
    );
    if (!closest || Math.sqrt(closest.distanceSq) > maximumLocalError) {
      closest = this.findClosestFullPath(this.vehicle.pos);
    }

    if (!closest) return null;
    this.prevClosestIdx = closest.segmentIndex;
    this.prevDistanceAlong = closest.distanceAlong;
    this.hasProjection = true;
    return closest;
  }

  /** Clamp authored lane offsets to asphalt width, accounting for corner trimming. */
  private getUsableLateralOffset(
    point: THREE.Vector3,
    requestedOffset: number
  ): number {
    let roadHalfWidth = this.trackBoundary > 0
      ? Math.max(3, this.trackBoundary * 0.5)
      : this.MAX_LANE_OFFSET + this.LANE_CAR_MARGIN;

    if (this.getTrackInfo) {
      const info = this.getTrackInfo(point.x, point.z, point.y);
      const reportedScale = info.sideSign === -1
        ? info.rightScale ?? 1
        : info.leftScale ?? 1;
      const sideScale = requestedOffset >= 0
        ? info.leftScale ?? reportedScale
        : info.rightScale ?? reportedScale;

      if (info.width !== undefined && reportedScale > 0.05) {
        const baseHalfWidth = (info.width * 0.5) / reportedScale;
        roadHalfWidth = baseHalfWidth * sideScale;
      }
    }

    const usable = Math.max(0, roadHalfWidth - this.LANE_CAR_MARGIN);
    const cap = Math.min(this.MAX_LANE_OFFSET, usable);
    return THREE.MathUtils.clamp(requestedOffset, -cap, cap);
  }

  private getTargetAtDistance(
    distanceAlong: number,
    lookahead: number,
    requestedOffset: number
  ): PathSample {
    const sample = this.getPathSampleAtDistance(distanceAlong + lookahead);
    const laneOffset = this.getUsableLateralOffset(sample.point, requestedOffset);
    sample.point.addScaledVector(sample.normal, laneOffset);
    return sample;
  }

  /** Signed curvature: positive means increasing yaw in the vehicle's yaw convention. */
  private getSignedCurvatureAt(distance: number, sampleSpan: number): number {
    if (this.pathLength <= 0) return 0;
    const span = THREE.MathUtils.clamp(
      sampleSpan,
      2,
      Math.max(2, this.pathLength * 0.25)
    );
    const before = this.getTangentAtDistance(distance - span * 0.5);
    const after = this.getTangentAtDistance(distance + span * 0.5);
    const dot = THREE.MathUtils.clamp(before.dot(after), -1, 1);
    const signedAngle = Math.atan2(
      after.x * before.z - after.z * before.x,
      dot
    );
    return signedAngle / span;
  }

  private getTargetSpeed(distanceAlong: number, speed: number): number {
    const baseTargetSpeed = Math.max(
      5,
      this.vehicle.maxSpeed * THREE.MathUtils.clamp(this.speedFactor, 0.35, 1.3)
    );
    const absSpeed = Math.abs(speed);
    const scanDistance = Math.min(
      this.pathLength * 0.45,
      THREE.MathUtils.clamp(85 + absSpeed * 2.3, 85, 260)
    );
    const scanStep = 7;
    const lateralAcceleration = 7.5;
    const brakeDeceleration = THREE.MathUtils.clamp(
      (this.vehicle.brakeForce / Math.max(this.vehicle.mass, 1)) * 0.72,
      5.5,
      11
    );

    let targetSpeed = baseTargetSpeed;
    for (let distance = 0; distance <= scanDistance; distance += scanStep) {
      const curvature = Math.abs(
        this.getSignedCurvatureAt(
          distanceAlong + distance,
          THREE.MathUtils.clamp(9 + absSpeed * 0.08, 9, 18)
        )
      );
      if (curvature < 0.002) continue;

      const cornerSpeed = THREE.MathUtils.clamp(
        Math.sqrt(lateralAcceleration / curvature) * 0.94,
        5.5,
        baseTargetSpeed
      );
      // Current speed may be higher than the corner speed if there is enough
      // distance to brake. This is the part the old index-based AI lacked.
      const reachableSpeed = Math.sqrt(
        cornerSpeed * cornerSpeed + 2 * brakeDeceleration * distance
      );
      targetSpeed = Math.min(targetSpeed, reachableSpeed);
    }

    if (this.grassTimer > 0.1) {
      targetSpeed = Math.min(
        targetSpeed,
        Math.max(6, baseTargetSpeed * Math.max(0.48, 1 - this.grassTimer * 0.25))
      );
    }
    if (this.recoveryTimer > 0) targetSpeed = Math.min(targetSpeed, 8);

    return THREE.MathUtils.clamp(targetSpeed, 4, baseTargetSpeed);
  }

  private getObstacleAdjustment(
    position: THREE.Vector3,
    yaw: number,
    speed: number
  ): ObstacleAdjustment {
    if (this.obstacles.length === 0) return { steer: 0, speedCap: Infinity };

    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const detectionDistance = THREE.MathUtils.clamp(18 + speed * 0.9, 18, 38);
    let closestForward = Infinity;
    let chosenSteer = 0;
    let chosenSpeedCap = Infinity;

    for (const obstacle of this.obstacles) {
      const toObstacle = new THREE.Vector3(
        obstacle.pos.x - position.x,
        0,
        obstacle.pos.z - position.z
      );
      const distance = toObstacle.length();
      if (distance < 0.001) continue;

      const forwardDistance = forward.dot(toObstacle);
      const sideDistance = right.dot(toObstacle);
      const obstacleHalfWidth = Math.max(obstacle.width, obstacle.depth) * 0.5;
      if (
        forwardDistance < -2 ||
        forwardDistance > detectionDistance ||
        Math.abs(sideDistance) > obstacleHalfWidth + 7
      ) {
        continue;
      }
      if (forwardDistance >= closestForward) continue;

      closestForward = forwardDistance;
      const urgency = THREE.MathUtils.clamp(
        (detectionDistance - forwardDistance) / Math.max(detectionDistance - 4, 1),
        0,
        1
      );
      const steerDirection = Math.abs(sideDistance) < 0.15
        ? (this.lateralOffset >= 0 ? -1 : 1)
        : sideDistance > 0
          ? -1
          : 1;
      chosenSteer = steerDirection * THREE.MathUtils.clamp(
        0.18 + urgency * 0.72,
        0,
        0.9
      );
      chosenSpeedCap = Math.max(4, forwardDistance * 0.55);
    }

    return { steer: chosenSteer, speedCap: chosenSpeedCap };
  }

  private computePathSteer(
    projection: PathProjection,
    simulation: boolean
  ): number {
    const speed = Math.abs(this.vehicle.speed);
    const speedRatio = THREE.MathUtils.clamp(
      speed / Math.max(this.vehicle.maxSpeed, 1),
      0,
      1
    );
    const nearDistance = THREE.MathUtils.clamp(8 + speed * 0.18, 8, 26);
    const midDistance = THREE.MathUtils.clamp(17 + speed * 0.42, 17, 72);
    const farDistance = THREE.MathUtils.clamp(32 + speed * 0.82, 32, 130);

    const near = this.getTargetAtDistance(
      projection.distanceAlong,
      nearDistance,
      this.lateralOffset
    );
    const mid = this.getTargetAtDistance(
      projection.distanceAlong,
      midDistance,
      this.lateralOffset
    );
    const far = this.getTargetAtDistance(
      projection.distanceAlong,
      farDistance,
      this.lateralOffset
    );

    const nearWeight = THREE.MathUtils.lerp(0.48, 0.22, speedRatio);
    const midWeight = 0.34;
    const farWeight = 1 - nearWeight - midWeight;
    const target = new THREE.Vector3()
      .addScaledVector(near.point, nearWeight)
      .addScaledVector(mid.point, midWeight)
      .addScaledVector(far.point, farWeight);
    const blendedTangent = near.tangent
      .clone()
      .multiplyScalar(nearWeight)
      .addScaledVector(mid.tangent, midWeight)
      .addScaledVector(far.tangent, farWeight)
      .normalize();

    const targetDirection = target.sub(this.vehicle.pos);
    targetDirection.y = 0;
    if (targetDirection.lengthSq() < 1e-8) targetDirection.copy(blendedTangent);
    targetDirection.normalize();

    const targetYaw = Math.atan2(targetDirection.x, targetDirection.z);
    const targetHeadingError = this.normalizeAngle(targetYaw - this.vehicle.yaw);
    const pathYaw = Math.atan2(blendedTangent.x, blendedTangent.z);
    const pathHeadingError = this.normalizeAngle(pathYaw - this.vehicle.yaw);
    const desiredLaneOffset = this.getUsableLateralOffset(
      projection.point,
      this.lateralOffset
    );
    const laneError = projection.lateralError - desiredLaneOffset;
    const crossTrackTerm = Math.atan2(laneError, Math.max(speed, 4));
    const signedCurvature = this.getSignedCurvatureAt(
      projection.distanceAlong + midDistance * 0.65,
      THREE.MathUtils.clamp(9 + speed * 0.08, 9, 18)
    );
    const curvatureFeedForward = THREE.MathUtils.clamp(
      Math.atan(this.vehicle.wheelBase * signedCurvature) /
        Math.max(this.vehicle.maxSteeringAngle, 0.1),
      -1,
      1
    );

    let rawSteer =
      targetHeadingError * (simulation ? 1.35 : 1.75) +
      pathHeadingError * (simulation ? 0.32 : 0.5) +
      crossTrackTerm * (simulation ? 1.15 : 1.35) +
      curvatureFeedForward * (simulation ? 0.62 : 0.72) -
      this.vehicle.yawRate * (simulation ? 0.12 : 0.05);

    const info = this.getTrackInfo?.(
      this.vehicle.pos.x,
      this.vehicle.pos.z,
      this.vehicle.pos.y
    );
    if (info) {
      const activeBoundary = info.trackBoundary ?? this.trackBoundary;
      if (activeBoundary > 0) {
        const wallProximity = info.dist / activeBoundary;
        if (wallProximity > 0.72) {
          const toCenter = new THREE.Vector3().subVectors(info.closestPt, this.vehicle.pos);
          toCenter.y = 0;
          if (toCenter.lengthSq() > 1e-8) {
            const centerYaw = Math.atan2(toCenter.x, toCenter.z);
            const centerError = this.normalizeAngle(centerYaw - this.vehicle.yaw);
            const urgency = THREE.MathUtils.clamp(
              (wallProximity - 0.72) / 0.28,
              0,
              1
            );
            rawSteer = THREE.MathUtils.lerp(
              rawSteer,
              THREE.MathUtils.clamp(centerError * 2.2, -1, 1),
              urgency * 0.78
            );
          }
        }
      }
    }

    return THREE.MathUtils.clamp(rawSteer, -1, 1);
  }

  private createEmptyKeys(): { [key: string]: boolean | number } {
    return {
      w: false,
      s: false,
      a: false,
      d: false,
      ' ': false,
      throttleAnalog: 0,
      reverseAnalog: 0,
      steerAnalog: 0
    };
  }

  private computeControls(
    deltaTime: number,
    simulation: boolean
  ): { [key: string]: boolean | number } {
    const keys = this.createEmptyKeys();
    if (this.densePath.length < 3 || this.pathLength <= 0) return keys;

    this.recoveryTimer = Math.max(0, this.recoveryTimer - Math.max(deltaTime, 0));

    const projection = this.findClosestPathProjection();
    if (!projection) return keys;

    const position = this.vehicle.pos;
    const speed = this.vehicle.speed;
    const absSpeed = Math.abs(speed);
    const heading = new THREE.Vector3(
      Math.sin(this.vehicle.yaw),
      0,
      Math.cos(this.vehicle.yaw)
    );
    const headingDot = heading.dot(projection.tangent);

    let onGrass = false;
    if (this.isOnGrass) onGrass = this.isOnGrass(position.x, position.z);
    if (onGrass) this.grassTimer += deltaTime;
    else this.grassTimer = Math.max(0, this.grassTimer - deltaTime * 3);

    let targetSpeed = this.getTargetSpeed(projection.distanceAlong, speed);
    let rawSteer = this.computePathSteer(projection, simulation);

    const info = this.getTrackInfo?.(position.x, position.z, position.y);
    const activeBoundary = info?.trackBoundary ?? this.trackBoundary;
    if (
      (info && activeBoundary > 0 && info.dist > activeBoundary * 1.12) ||
      Math.sqrt(projection.distanceSq) > Math.max(34, activeBoundary * 1.6)
    ) {
      this.recoveryTimer = Math.max(this.recoveryTimer, 0.9);
    }

    if (onGrass && this.grassTimer > 0.1 && info) {
      const toCenter = new THREE.Vector3().subVectors(info.closestPt, position);
      toCenter.y = 0;
      if (toCenter.lengthSq() > 1e-8) {
        const centerYaw = Math.atan2(toCenter.x, toCenter.z);
        const centerError = this.normalizeAngle(centerYaw - this.vehicle.yaw);
        const urgency = THREE.MathUtils.clamp(this.grassTimer * 1.6, 0.2, 0.86);
        rawSteer = THREE.MathUtils.lerp(
          rawSteer,
          THREE.MathUtils.clamp(centerError * 2.4, -1, 1),
          urgency
        );
      }
    }

    if (absSpeed > 3 && headingDot < 0.22) {
      this.recoveryTimer = Math.max(this.recoveryTimer, 0.85);
    }
    if (this.vehicle.isSpinning) {
      this.recoveryTimer = Math.max(this.recoveryTimer, 0.8);
    }

    if (this.recoveryTimer > 0) {
      const recoveryYaw = Math.atan2(projection.tangent.x, projection.tangent.z);
      const recoveryError = this.normalizeAngle(recoveryYaw - this.vehicle.yaw);
      rawSteer = THREE.MathUtils.clamp(
        recoveryError * 1.8 - this.vehicle.yawRate * 0.08,
        -1,
        1
      );
      targetSpeed = Math.min(targetSpeed, headingDot < 0.15 ? 5 : 8);
    }

    const obstacleAdjustment = this.getObstacleAdjustment(
      position,
      this.vehicle.yaw,
      absSpeed
    );
    rawSteer = THREE.MathUtils.clamp(
      rawSteer + obstacleAdjustment.steer,
      -1,
      1
    );
    targetSpeed = Math.min(targetSpeed, obstacleAdjustment.speedCap);

    // Obstacle avoidance is applied before the final steering smoothing, so it
    // cannot permanently shove smoothSteer away from the racing line.
    const speedRatio = THREE.MathUtils.clamp(
      absSpeed / Math.max(this.vehicle.maxSpeed, 1),
      0,
      1
    );
    const finalSmoothRate = THREE.MathUtils.lerp(
      simulation ? 8.5 : 11,
      simulation ? 5.0 : 7.0,
      speedRatio
    );
    this.smoothSteer = THREE.MathUtils.lerp(
      this.smoothSteer,
      THREE.MathUtils.clamp(rawSteer, -1, 1),
      1 - Math.exp(-finalSmoothRate * Math.max(deltaTime, 0))
    );
    keys.steerAnalog = THREE.MathUtils.clamp(this.smoothSteer, -1, 1);

    const speedError = targetSpeed - speed;
    let throttle = 0;
    let brake = 0;
    if (speedError > 0.45) {
      throttle = THREE.MathUtils.clamp(0.08 + speedError * 0.17, 0.08, 1);
    } else if (speedError < -0.45) {
      brake = THREE.MathUtils.clamp(0.06 + -speedError * 0.22, 0, 1);
    }

    const steerMagnitude = Math.abs(this.smoothSteer);
    if (throttle > 0) {
      throttle *= Math.max(0.28, 1 - steerMagnitude * 0.32);
    }

    keys.throttleAnalog = throttle;
    keys.reverseAnalog = brake;
    return keys;
  }

  private computeArcadeInputs(deltaTime: number): { [key: string]: boolean | number } {
    return this.computeControls(deltaTime, false);
  }

  /** Call once per frame and pass the returned analog inputs to Vehicle.update(). */
  public computeInputs(deltaTime: number): { [key: string]: boolean | number } {
    return this.drivingMode === 'arcade'
      ? this.computeArcadeInputs(deltaTime)
      : this.computeControls(deltaTime, true);
  }
}
