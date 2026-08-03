import * as THREE from 'three';
import { TrackConfig } from '../config/TrackDatabase';
import { Vehicle } from '../objects/Vehicle';
import { buildCenterline } from '../modes/centerline';
import { resolveTrackNodes } from '../modes/trackNodes';

export interface SuggestedGearAdvice {
  suggestedGear: number;
  targetSpeedKmh: number;
  distanceToCorner: number;
  severity: number;
  tooFast: boolean;
}

const flattenPoint = (point: THREE.Vector3) => new THREE.Vector3(point.x, 0, point.z);

export class SuggestedGearAdvisor {
  private samples: THREE.Vector3[] = [];
  private sampleStepMeters = 4;
  private closed = true;

  public setTrack(config: TrackConfig | null, closed = true) {
    this.samples = [];
    this.closed = closed;

    if (!config || config.path.length < 3) return;

    // Must go through buildCenterline so the advice follows the same line the
    // road mesh was built from, sharp corners included.
    const resolvedNodes = resolveTrackNodes(config);
    const { curve } = buildCenterline(resolvedNodes.map((n) => n.pos), resolvedNodes, {
      curveType: config.curveType,
      tension: config.tension,
      roadWidth: config.roadWidth,
      closed
    });
    const trackLength = Math.max(curve.getLength(), 1);
    const sampleCount = Math.max(80, Math.round(trackLength / 4));
    const samples = curve.getSpacedPoints(sampleCount);

    if (closed && samples.length > 1) {
      samples.pop();
    }

    this.samples = samples;
    this.sampleStepMeters = trackLength / Math.max(this.samples.length, 1);
  }

  public clear() {
    this.samples = [];
  }

  public getAdvice(vehicle: Vehicle, speedKmh: number): SuggestedGearAdvice | null {
    if (this.samples.length < 12 || speedKmh < 12) return null;

    const closestIdx = this.findClosestIndex(vehicle.pos);
    const corner = this.findUpcomingCorner(closestIdx, vehicle, speedKmh);
    if (!corner || corner.severity < 0.12) return null;

    const targetSpeedKmh = corner.targetSpeedKmh;
    const suggestedGear = this.getSuggestedGear(vehicle, targetSpeedKmh);
    const bufferKmh = Math.max(7, corner.distanceToCorner * 0.05);

    return {
      suggestedGear,
      targetSpeedKmh,
      distanceToCorner: corner.distanceToCorner,
      severity: corner.severity,
      tooFast: speedKmh > targetSpeedKmh + bufferKmh,
    };
  }

  private findClosestIndex(position: THREE.Vector3) {
    let bestIdx = 0;
    let bestDistSq = Infinity;
    const px = position.x;
    const pz = position.z;

    for (let i = 0; i < this.samples.length; i++) {
      const sample = this.samples[i];
      const dx = sample.x - px;
      const dz = sample.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  private findUpcomingCorner(currentIdx: number, vehicle: Vehicle, speedKmh: number) {
    const maxBrakeDistance = this.getBrakingDistanceMeters(vehicle, speedKmh, 35);
    const lookAheadMeters = THREE.MathUtils.clamp(
      85 + speedKmh * 1.15 + maxBrakeDistance * 0.55,
      110,
      420
    );
    const scanStepMeters = Math.max(this.sampleStepMeters * 1.5, 6);
    const turnWindowMeters = THREE.MathUtils.clamp(13 + speedKmh * 0.035, 14, 24);
    let bestScore = -Infinity;
    let bestCorner: {
      severity: number;
      distanceToCorner: number;
      targetSpeedKmh: number;
    } | null = null;

    for (let distance = 18; distance <= lookAheadMeters; distance += scanStepMeters) {
      const centerIdx = this.getIndexAhead(currentIdx, distance);
      const prevIdx = this.getIndexAhead(centerIdx, -turnWindowMeters);
      const nextIdx = this.getIndexAhead(centerIdx, turnWindowMeters);

      const prev = flattenPoint(this.samples[prevIdx]);
      const center = flattenPoint(this.samples[centerIdx]);
      const next = flattenPoint(this.samples[nextIdx]);
      const entry = center.clone().sub(prev);
      const exit = next.clone().sub(center);

      if (entry.lengthSq() < 0.0001 || exit.lengthSq() < 0.0001) continue;

      const turnDegrees = THREE.MathUtils.radToDeg(entry.angleTo(exit));
      const severity = THREE.MathUtils.clamp((turnDegrees - 7) / 48, 0, 1);
      if (severity < 0.1) continue;

      const targetSpeedKmh = this.getTargetCornerSpeed(vehicle, severity);
      const leadDistance = this.getAdvisoryLeadDistance(vehicle, speedKmh, targetSpeedKmh, severity);
      if (distance > leadDistance) continue;

      const urgency = 1 - distance / Math.max(leadDistance, 1);
      const score = severity * 1.7 + urgency * 0.9;
      if (score > bestScore) {
        bestScore = score;
        bestCorner = {
          severity,
          distanceToCorner: distance,
          targetSpeedKmh,
        };
      }
    }

    return bestCorner;
  }

  private getIndexAhead(index: number, distanceMeters: number) {
    const offset = Math.round(distanceMeters / Math.max(this.sampleStepMeters, 0.1));
    const rawIndex = index + offset;

    if (this.closed) {
      return ((rawIndex % this.samples.length) + this.samples.length) % this.samples.length;
    }

    return THREE.MathUtils.clamp(rawIndex, 0, this.samples.length - 1);
  }

  private getTargetCornerSpeed(vehicle: Vehicle, severity: number) {
    const handlingFactor = THREE.MathUtils.clamp(
      0.88 + (vehicle.handlingRate - 0.045) * 8.5,
      0.82,
      1.16
    );
    const tireWearFactor = vehicle.tireWearEnabled
      ? THREE.MathUtils.lerp(1, 0.78, THREE.MathUtils.clamp(vehicle.tireState.wear, 0, 1))
      : 1;
    const target = THREE.MathUtils.lerp(178, 42, severity) * handlingFactor * tireWearFactor;
    return Math.round(THREE.MathUtils.clamp(target, 34, 190));
  }

  private getAdvisoryLeadDistance(
    vehicle: Vehicle,
    currentSpeedKmh: number,
    targetSpeedKmh: number,
    severity: number
  ) {
    const brakeDistance = this.getBrakingDistanceMeters(vehicle, currentSpeedKmh, targetSpeedKmh);
    const reactionDistance = THREE.MathUtils.clamp(22 + currentSpeedKmh * 0.28 + severity * 24, 30, 100);
    const displayDistance = THREE.MathUtils.clamp(currentSpeedKmh * 0.18, 8, 42);
    return brakeDistance + reactionDistance + displayDistance;
  }

  private getBrakingDistanceMeters(vehicle: Vehicle, currentSpeedKmh: number, targetSpeedKmh: number) {
    const currentSpeedMps = Math.max(currentSpeedKmh / 3.6, 0);
    const targetSpeedMps = Math.max(targetSpeedKmh / 3.6, 0);
    if (currentSpeedMps <= targetSpeedMps) return 0;

    const tireWearFactor = vehicle.tireWearEnabled
      ? THREE.MathUtils.lerp(1, 0.78, THREE.MathUtils.clamp(vehicle.tireState.wear, 0, 1))
      : 1;
    const rawDecel = (vehicle.brakeForce / Math.max(vehicle.mass, 1)) * 0.72 * tireWearFactor;
    const decel = THREE.MathUtils.clamp(rawDecel, 5.4, 11.8);

    return (currentSpeedMps * currentSpeedMps - targetSpeedMps * targetSpeedMps) / (2 * decel);
  }

  private getSuggestedGear(vehicle: Vehicle, targetSpeedKmh: number) {
    if (vehicle.transmissionType === 'single_speed') return 1;

    const gearRatios = vehicle.gearRatios;
    const maxGear = Math.max(1, gearRatios.length - 1);
    const speedMps = Math.max(targetSpeedKmh / 3.6, 0.1);
    const targetRpm = THREE.MathUtils.clamp(vehicle.maxRpm * 0.72, 3200, vehicle.maxRpm * 0.84);
    let bestGear = 1;
    let bestScore = Infinity;

    for (let gear = 1; gear <= maxGear; gear++) {
      const ratio = gearRatios[gear];
      if (!ratio) continue;

      const rpm =
        (speedMps / vehicle.wheelRadius) *
        ratio *
        vehicle.finalDrive *
        (60 / (2 * Math.PI));
      const overRedlinePenalty = rpm > vehicle.maxRpm * 0.97 ? 9000 : 0;
      const bogPenalty = rpm < 1700 ? 1600 : 0;
      const score = Math.abs(rpm - targetRpm) + overRedlinePenalty + bogPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestGear = gear;
      }
    }

    return bestGear;
  }
}
