/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Headless RacingAI smoke harness. Run with:
 *   npx tsx scripts/ai-smoke-check.ts
 *
 * Every shipped track is driven from just before its closed-loop seam in both
 * RacingAI modes. The harness checks that the canonical path is finite and
 * physically sampled, that inputs stay finite, that the car crosses the seam,
 * and that a lost path does not turn into an unbounded excursion.
 */
import * as THREE from 'three';
import { BaseMode } from '../components/modes/BaseMode';
import { TRACKS_DATABASE, TrackConfig } from '../components/config/TrackDatabase';
import { Vehicle } from '../components/objects/Vehicle';
import { RacingAI } from '../components/objects/RacingAI';
import { CURB_WIDTH } from '../components/modes/trackNodes';
import type { DrivingMode } from '../components/option';

class Harness extends BaseMode {
  public init() {}
  public update() {}
  public cleanup() {}
  public reset() {}

  public build(config: TrackConfig): void {
    this.createRacetrackRoad(config);
  }

  public getSamples(): THREE.Vector3[] {
    return this.roadSamplePoints;
  }

  public getBoundary(): number {
    return this.trackBoundary;
  }
}

const makeHarness = (vehicle: Vehicle): Harness =>
  new Harness(
    {
      postProcessing: { getQuality: () => 'low' }
    } as any,
    new THREE.Scene(),
    vehicle,
    { clear: () => {} } as any,
    new THREE.Group(),
    {}
  );

const isFiniteVector = (point: THREE.Vector3): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);

const makeGrassCallback = (mode: Harness) => (x: number, z: number): boolean => {
  const info = mode.getTrackInfo(x, z);
  const grassWidth = info.grassWidth ?? 0;
  if (grassWidth <= 0) return false;
  const grassStart = info.width / 2 + (info.curb ? CURB_WIDTH : 0);
  return info.dist >= grassStart && info.dist < grassStart + grassWidth;
};

interface RunResult {
  trackId: string;
  mode: DrivingMode;
  maxOffset: number;
  maxInput: number;
  finalSpeed: number;
  crossedSeam: boolean;
}

const run = (
  config: TrackConfig,
  mode: Harness,
  path: THREE.Vector3[],
  drivingMode: DrivingMode
): RunResult => {
  const car = new Vehicle('starter', '#ff0000');
  car.getGroundHeight = (x, z, yHint) => mode.getGroundHeight(x, z, yHint);
  car.getSlopeHeight = (x, z) => mode.getSlopeHeight(x, z);
  car.getTrackInfo = (x, z, yHint) => mode.getTrackInfo(x, z, yHint);

  const grassCallback = makeGrassCallback(mode);
  car.isOnGrass = grassCallback;

  const ai = new RacingAI(car, path, 0.72, 0);
  ai.drivingMode = drivingMode;
  ai.trackBoundary = mode.getBoundary();
  ai.getTrackInfo = (x, z, yHint) => mode.getTrackInfo(x, z, yHint);
  ai.isOnGrass = grassCallback;
  ai.obstacles = [];

  const startIndex = Math.max(0, path.length - 3);
  const nextIndex = (startIndex + 1) % path.length;
  const start = path[startIndex].clone();
  start.y = mode.getGroundHeight(start.x, start.z, start.y);
  const startYaw = Math.atan2(
    path[nextIndex].x - path[startIndex].x,
    path[nextIndex].z - path[startIndex].z
  );
  car.reset(start, startYaw);

  const sampleSpacing = Math.max(0.5, path[0].distanceTo(path[1]));
  const seamRadius = Math.max(5, sampleSpacing * 1.6);
  const allowedOffset = Math.max(config.roadWidth * 2.25, 75);
  let maxOffset = 0;
  let maxInput = 0;
  let crossedSeam = false;

  for (let step = 0; step < 60 * 12; step++) {
    const inputs = ai.computeInputs(1 / 60) as Record<string, boolean | number>;
    for (const value of Object.values(inputs)) {
      if (typeof value === 'number') maxInput = Math.max(maxInput, Math.abs(value));
    }
    car.update(1 / 60, inputs);

    const info = mode.getTrackInfo(car.pos.x, car.pos.z, car.pos.y);
    maxOffset = Math.max(maxOffset, info.dist);
    if (step > 30 && car.pos.distanceTo(path[0]) < seamRadius) crossedSeam = true;

    if (!isFiniteVector(car.pos) || !Number.isFinite(car.speed)) {
      throw new Error(`${config.id}/${drivingMode}: vehicle state became non-finite at ${step / 60}s`);
    }
    if (!Number.isFinite(maxInput) || maxInput > 1.0001) {
      throw new Error(`${config.id}/${drivingMode}: AI input escaped [-1, 1]`);
    }
    if (maxOffset > allowedOffset) {
      throw new Error(
        `${config.id}/${drivingMode}: path excursion ${maxOffset.toFixed(1)}m exceeded ${allowedOffset.toFixed(1)}m`
      );
    }
  }

  return {
    trackId: config.id,
    mode: drivingMode,
    maxOffset,
    maxInput,
    finalSpeed: car.speed,
    crossedSeam
  };
};

const failures: string[] = [];
const results: RunResult[] = [];

for (const config of TRACKS_DATABASE) {
  const owner = new Vehicle('starter', '#000000');
  const mode = makeHarness(owner);
  mode.build(config);

  const rawSamples = mode.getSamples();
  const path = rawSamples.length > 2 && rawSamples[0].distanceToSquared(rawSamples[rawSamples.length - 1]) < 1e-4
    ? rawSamples.slice(0, -1)
    : rawSamples.slice();

  if (path.length < 3) {
    failures.push(`${config.id}: canonical path has only ${path.length} points`);
    continue;
  }
  if (path.some((point) => !isFiniteVector(point))) {
    failures.push(`${config.id}: canonical path contains a non-finite point`);
    continue;
  }

  let maxSegment = 0;
  for (let i = 0; i < path.length; i++) {
    maxSegment = Math.max(
      maxSegment,
      path[i].distanceTo(path[(i + 1) % path.length])
    );
  }
  if (!Number.isFinite(maxSegment) || maxSegment > 12) {
    failures.push(`${config.id}: canonical path has a ${maxSegment.toFixed(1)}m segment`);
    continue;
  }

  for (const drivingMode of ['simulation', 'arcade'] as DrivingMode[]) {
    try {
      const result = run(config, mode, path, drivingMode);
      results.push(result);
      if (!result.crossedSeam) {
        failures.push(`${config.id}/${drivingMode}: did not cross the loop seam`);
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
}

for (const result of results) {
  console.log(
    `${result.trackId.padEnd(20)} ${result.mode.padEnd(10)} ` +
      `offset=${result.maxOffset.toFixed(1).padStart(6)}m ` +
      `speed=${(result.finalSpeed * 3.6).toFixed(1).padStart(6)}km/h ` +
      `seam=${result.crossedSeam ? 'yes' : 'no'}`
  );
}

console.log('');
if (failures.length === 0 && results.length === TRACKS_DATABASE.length * 2) {
  console.log(`PASS: ${results.length} finite, bounded AI runs crossed their loop seams.`);
} else {
  console.log('FAIL:');
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exitCode = 1;
}
