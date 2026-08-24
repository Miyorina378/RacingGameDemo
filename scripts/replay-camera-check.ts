/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Headless replay-camera harness. Run with:
 *   npx tsx scripts/replay-camera-check.ts
 *
 * Builds a real road, drives a real car around it with the game's own AI, and runs
 * the replay director over that motion. A broadcast camera is only doing its job if
 * the car is actually in frame, the camera is standing above the ground rather than
 * buried in it, and the shot list keeps cutting instead of settling on one angle.
 */
import * as THREE from 'three';
import { BaseMode } from '../components/modes/BaseMode';
import { TRACKS_DATABASE, TrackConfig } from '../components/config/TrackDatabase';
import { Vehicle } from '../components/objects/Vehicle';
import { RacingAI } from '../components/objects/RacingAI';
import { ReplayCameraDirector } from '../components/engine/ReplayCameraDirector';

(Vehicle.prototype as any).buildGltfMesh = function () {
  (this as any).buildProceduralMesh();
};

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
    { postProcessing: { getQuality: () => 'low' } } as any,
    new THREE.Scene(),
    vehicle,
    { clear: () => {} } as any,
    new THREE.Group(),
    {}
  );

interface Report {
  trackId: string;
  frames: number;
  inFrameRatio: number;
  minClearance: number;
  minOnboardClearance: number;
  maxDistance: number;
  minFov: number;
  maxFov: number;
  cuts: number;
  shots: string[];
}

const failures: string[] = [];
const reports: Report[] = [];

for (const config of TRACKS_DATABASE) {
  const owner = new Vehicle('starter', '#000000');
  const mode = makeHarness(owner);
  mode.build(config);

  const raw = mode.getSamples();
  const path =
    raw.length > 2 && raw[0].distanceToSquared(raw[raw.length - 1]) < 1e-4
      ? raw.slice(0, -1)
      : raw.slice();
  if (path.length < 8) {
    failures.push(`${config.id}: not enough centreline points to place cameras`);
    continue;
  }

  const car = new Vehicle('sport', '#ff0044');
  car.getGroundHeight = (x, z, yHint) => mode.getGroundHeight(x, z, yHint);
  car.getSlopeHeight = (x, z) => mode.getSlopeHeight(x, z);
  car.getTrackInfo = (x, z, yHint) => mode.getTrackInfo(x, z, yHint);
  car.isOnGrass = () => false;

  const ai = new RacingAI(car, path, 0.8, 0);
  ai.trackBoundary = mode.getBoundary();
  ai.getTrackInfo = (x, z, yHint) => mode.getTrackInfo(x, z, yHint);
  ai.isOnGrass = () => false;

  const start = path[0].clone();
  start.y = mode.getGroundHeight(start.x, start.z, start.y);
  car.reset(start, Math.atan2(path[1].x - path[0].x, path[1].z - path[0].z));

  const rival = new Vehicle('starter', '#00ddff');
  rival.getGroundHeight = (x, z, yHint) => mode.getGroundHeight(x, z, yHint);
  rival.reset(start.clone(), car.yaw);

  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 4000);
  const director = new ReplayCameraDirector();
  director.configure({
    path,
    boundary: mode.getBoundary(),
    getGroundHeight: (x, z, yHint) => mode.getGroundHeight(x, z, yHint)
  });

  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  const dt = 1 / 60;
  const totalFrames = 60 * 45;
  let framesJudged = 0;
  let inFrame = 0;
  let minClearance = Infinity;
  let minOnboardClearance = Infinity;
  let maxDistance = 0;
  let minFov = Infinity;
  let maxFov = 0;
  let cuts = 0;
  let previousPosition: THREE.Vector3 | null = null;
  let handled = true;
  const shotTypes = new Set<string>();

  for (let step = 0; step < totalFrames; step++) {
    car.update(dt, ai.computeInputs(dt) as any);

    // A stand-in rival trailing the player, so the duel shot is exercised too.
    rival.pos.copy(car.pos).addScaledVector(
      new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw)),
      -9
    );
    rival.yaw = car.yaw;
    rival.speed = car.speed;

    handled = director.update(dt, car, [rival], camera);
    if (!handled) {
      failures.push(`${config.id}: director refused a valid course`);
      break;
    }

    camera.updateMatrixWorld(true);
    if (
      !Number.isFinite(camera.position.x) ||
      !Number.isFinite(camera.position.y) ||
      !Number.isFinite(camera.position.z) ||
      !Number.isFinite(camera.fov)
    ) {
      failures.push(`${config.id}: camera state became non-finite at ${(step / 60).toFixed(1)}s`);
      break;
    }

    // Skip the settling frames so start-of-replay spawn jitter is not judged.
    if (step < 60) {
      previousPosition = camera.position.clone();
      continue;
    }

    if (previousPosition && previousPosition.distanceTo(camera.position) > 25) cuts++;
    previousPosition = camera.position.clone();

    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);

    // An onboard lens is bolted to the car and frames the road, so the car's own
    // centre sits behind it. Only external shots are judged on holding the subject.
    const shotType = director.getActiveShotType();
    if (shotType !== 'onboard') {
      const subject = car.pos.clone();
      subject.y += 0.6;
      framesJudged++;
      if (frustum.containsPoint(subject)) inFrame++;
    }
    shotTypes.add(shotType ?? 'none');

    const ground = mode.getGroundHeight(camera.position.x, camera.position.z, camera.position.y);
    const clearance = camera.position.y - ground;
    // The bumper cam rides on the car, so it is held to a bumper's clearance while
    // every off-car lens has to stand well clear of the surface.
    if (shotType === 'onboard') {
      minOnboardClearance = Math.min(minOnboardClearance, clearance);
    } else {
      minClearance = Math.min(minClearance, clearance);
    }
    maxDistance = Math.max(maxDistance, camera.position.distanceTo(car.pos));
    minFov = Math.min(minFov, camera.fov);
    maxFov = Math.max(maxFov, camera.fov);
  }

  if (!handled) continue;

  const inFrameRatio = framesJudged > 0 ? inFrame / framesJudged : 0;
  reports.push({
    trackId: config.id,
    frames: framesJudged,
    inFrameRatio,
    minClearance,
    minOnboardClearance,
    maxDistance,
    minFov,
    maxFov,
    cuts,
    shots: [...shotTypes].sort()
  });

  if (inFrameRatio < 0.97) {
    failures.push(
      `${config.id}: car was only in frame ${(inFrameRatio * 100).toFixed(1)}% of the replay`
    );
  }
  if (minClearance < 1.0) {
    failures.push(
      `${config.id}: off-car camera dropped to ${minClearance.toFixed(2)}m above the ground`
    );
  }
  if (Number.isFinite(minOnboardClearance) && minOnboardClearance < 0.25) {
    failures.push(
      `${config.id}: onboard lens sank to ${minOnboardClearance.toFixed(2)}m above the ground`
    );
  }
  if (maxDistance > 420) {
    failures.push(`${config.id}: camera drifted ${maxDistance.toFixed(0)}m from the car`);
  }
  if (cuts < 4) {
    failures.push(`${config.id}: only ${cuts} camera cuts in 45s, shot list is too static`);
  }
  if (minFov < 18 || maxFov > 90) {
    failures.push(
      `${config.id}: lens ran to ${minFov.toFixed(0)}-${maxFov.toFixed(0)} degrees`
    );
  }
}

for (const report of reports) {
  console.log(
    `${report.trackId.padEnd(20)} inFrame=${(report.inFrameRatio * 100).toFixed(1).padStart(5)}% ` +
      `cuts=${String(report.cuts).padStart(3)} ` +
      `clearance=${report.minClearance.toFixed(2).padStart(6)}m ` +
      `onboard=${(Number.isFinite(report.minOnboardClearance) ? report.minOnboardClearance.toFixed(2) : '  n/a').padStart(5)}m ` +
      `maxDist=${report.maxDistance.toFixed(0).padStart(4)}m ` +
      `fov=${report.minFov.toFixed(0)}-${report.maxFov.toFixed(0)}deg ` +
      `shots=${report.shots.join(',')}`
  );
}

console.log('');
if (failures.length === 0 && reports.length === TRACKS_DATABASE.length) {
  console.log(`PASS: ${reports.length} replays kept the car framed with a live cut list.`);
} else {
  console.log('FAIL:');
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exitCode = 1;
}
