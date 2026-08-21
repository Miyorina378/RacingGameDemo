/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Headless road-surface harness. Run with:  npx tsx scripts/track-surface-check.ts
 *
 * Builds a real road from BaseMode on a track that climbs and descends, then asks
 * whether that road is a surface a car can ride: is the height continuous along the
 * track, does it match the elevation that was authored, and does a real Vehicle
 * driven along it stay on it rather than sinking through or floating over.
 *
 * The "nearest sample" column reproduces the old lookup — the one that read a single
 * sample point and so returned a flat step every 4m — so the difference is visible
 * rather than asserted. Dev tool only, not shipped and not imported by the app.
 */
import * as THREE from 'three';
import { BaseMode } from '../components/modes/BaseMode';
import { TRACKS_DATABASE, TrackConfig } from '../components/config/TrackDatabase';
import { Vehicle } from '../components/objects/Vehicle';
import { RacingAI } from '../components/objects/RacingAI';

// GLTF models cannot load in Node, and the body mesh is irrelevant here.
(Vehicle.prototype as any).buildGltfMesh = function () {
  (this as any).buildProceduralMesh();
};

class Harness extends BaseMode {
  public init() {}
  public update() {}
  public cleanup() {}
  public reset() {}
  public build(config: TrackConfig) {
    this.createRacetrackRoad(config);
  }
  /** The old lookup: nearest sample point, no interpolation along the track. */
  public nearestSampleHeight(x: number, z: number): number {
    const self = this as any;
    const info = this.getTrackInfo(x, z);
    const left = self.roadSampleLeftPoints[info.closestIdx];
    const right = self.roadSampleRightPoints[info.closestIdx];
    const segment = new THREE.Vector2(left.x - right.x, left.z - right.z);
    const lenSq = segment.lengthSq();
    let u = 0.5;
    if (lenSq > 0.0001) {
      const toPoint = new THREE.Vector2(x - right.x, z - right.z);
      u = THREE.MathUtils.clamp(toPoint.dot(segment) / lenSq, 0, 1);
    }
    return THREE.MathUtils.lerp(right.y, left.y, u) - 0.05;
  }
}

const makeHarness = (): Harness =>
  new Harness(
    {} as any,
    new THREE.Scene(),
    {} as any,
    {} as any,
    new THREE.Group(),
    {}
  );

/**
 * A ring 400m across whose elevation runs 0 -> 40 -> 0 over the lap: a climb of
 * roughly 12%, steep enough that any stepping in the surface is unmissable.
 */
const HILL_TRACK: TrackConfig = {
  id: 'surface_check',
  name: 'Surface Check',
  description: '',
  timeLimit: 999,
  roadWidth: 20,
  hasObstacles: false,
  requiresLicense: false,
  baseReward: 0,
  curveType: 'centripetal',
  path: Array.from({ length: 16 }).map((_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    return new THREE.Vector3(
      Math.cos(angle) * 200,
      20 - 20 * Math.cos(angle),
      Math.sin(angle) * 200
    );
  }),
  HaveCrub: false,
  HaveFence: false,
  HaveGrass: false,
  GrassWidth: 0
};

const mode = makeHarness();
mode.build(HILL_TRACK);

const samples = (mode as any).roadSamplePoints as THREE.Vector3[];
const results: string[] = [];
const fail: string[] = [];

// ---------------------------------------------------------------- continuity
// Walk the centreline in 0.5m steps. On a smooth surface every step climbs by
// about the same amount; on a staircase seven steps out of eight are flat and
// the eighth carries the whole 4m sample gap.
const walk: { spaced: number[]; nearest: number[] } = { spaced: [], nearest: [] };
let previousSpaced = 0;
let previousNearest = 0;
let maxSurfaceError = 0;

for (let i = 0; i < samples.length - 1; i++) {
  const from = samples[i];
  const to = samples[i + 1];
  const steps = Math.max(1, Math.round(from.distanceTo(to) / 0.5));
  for (let s = 0; s < steps; s++) {
    const p = new THREE.Vector3().lerpVectors(from, to, s / steps);
    const spaced = mode.getGroundHeight(p.x, p.z, p.y);
    const nearest = mode.nearestSampleHeight(p.x, p.z);
    if (i > 0 || s > 0) {
      walk.spaced.push(Math.abs(spaced - previousSpaced));
      walk.nearest.push(Math.abs(nearest - previousNearest));
    }
    previousSpaced = spaced;
    previousNearest = nearest;
    // The centreline point came from the road itself, so the surface under it
    // should be exactly that height.
    maxSurfaceError = Math.max(maxSurfaceError, Math.abs(spaced - p.y));
  }
}

const stats = (values: number[]) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  return { mean, max, ratio: mean > 1e-9 ? max / mean : Infinity };
};
const spacedStats = stats(walk.spaced);
const nearestStats = stats(walk.nearest);

results.push('--- surface continuity along the centreline (0.5m steps) ---');
results.push(
  `nearest-sample lookup: mean rise ${nearestStats.mean.toFixed(4)}m, worst single step ${nearestStats.max.toFixed(4)}m, worst/mean ${nearestStats.ratio.toFixed(1)}x`
);
results.push(
  `segment lookup:        mean rise ${spacedStats.mean.toFixed(4)}m, worst single step ${spacedStats.max.toFixed(4)}m, worst/mean ${spacedStats.ratio.toFixed(1)}x`
);
results.push(`worst height error vs the road that was drawn: ${maxSurfaceError.toFixed(4)}m`);

if (spacedStats.ratio > 2.5) {
  fail.push(`surface still steps: worst step is ${spacedStats.ratio.toFixed(1)}x the mean`);
}
if (maxSurfaceError > 0.05) {
  fail.push(`surface is ${maxSurfaceError.toFixed(3)}m off the drawn road`);
}

// ------------------------------------------------------------------- driving
// A real car under the game's own AI has to stay on that surface for the whole lap.
const car = new Vehicle('starter', '#ff0000');
car.getGroundHeight = (x, z, yHint) => mode.getGroundHeight(x, z, yHint);
car.getSlopeHeight = (x, z) => mode.getSlopeHeight(x, z);
car.getTrackInfo = (x, z, yHint) => mode.getTrackInfo(x, z, yHint);
car.isOnGrass = () => false;
const ai = new RacingAI(car, samples.slice(0, -1), 0.6, 0);
ai.getTrackInfo = (x, z, yHint) => mode.getTrackInfo(x, z, yHint);
ai.isOnGrass = () => false;
ai.trackBoundary = (mode as any).trackBoundary;
car.reset(
  new THREE.Vector3(samples[0].x, mode.getGroundHeight(samples[0].x, samples[0].z), samples[0].z),
  Math.atan2(samples[1].x - samples[0].x, samples[1].z - samples[0].z)
);

const dt = 1 / 60;
let worstGap = 0;
let worstGapAt = 0;
let worstGapStep = 0;
let worstGapNote = '';
let worstOffset = 0;
let worstOffsetStep = 0;
const trace: string[] = [];
let climbed = 0;
let descended = 0;
let previousY = car.pos.y;

for (let step = 0; step < 60 * 90; step++) {
  car.update(dt, ai.computeInputs(dt) as any);

  if (step > 60) {
    const surface = mode.getGroundHeight(car.pos.x, car.pos.z, car.pos.y);
    const offset = mode.getTrackInfo(car.pos.x, car.pos.z, car.pos.y).dist;
    if (offset > worstOffset) {
      worstOffset = offset;
      worstOffsetStep = step;
    }
    // Only judge the gap while the car is actually over the tarmac. Once the
    // steering here loses the lane the car is over open terrain and the number
    // says nothing about whether the road holds it up.
    if (offset < HILL_TRACK.roadWidth / 2) {
      const gap = Math.abs(car.pos.y - surface);
      if (gap > worstGap) {
        worstGap = gap;
        worstGapAt = surface;
        worstGapStep = step;
        worstGapNote =
          `${car.pos.y > surface ? 'above' : 'below'} the road, ` +
          `${(car.speed * 3.6).toFixed(0)} km/h, ${car.isGrounded ? 'grounded' : 'airborne'}`;
      }
    }
    if (step % 600 === 0) {
      trace.push(
        `  t=${(step / 60).toFixed(0)}s  y=${car.pos.y.toFixed(1)}  road=${surface.toFixed(1)}  ` +
          `off-centre=${offset.toFixed(1)}m  ${(car.speed * 3.6).toFixed(0)} km/h`
      );
    }
    const dy = car.pos.y - previousY;
    if (dy > 0) climbed += dy;
    else descended -= dy;
  }
  previousY = car.pos.y;
}

results.push('');
results.push('--- a real car driven for 90s down the middle ---');
results.push(`speed at the end: ${(car.speed * 3.6).toFixed(1)} km/h`);
results.push(`total climb ${climbed.toFixed(1)}m, total descent ${descended.toFixed(1)}m`);
results.push(
  `worst gap between car and surface while on the tarmac: ${worstGap.toFixed(3)}m ` +
    `(at surface height ${worstGapAt.toFixed(1)}m, ${(worstGapStep / 60).toFixed(1)}s in, ${worstGapNote})`
);
results.push(
  `furthest the car strayed from the centreline: ${worstOffset.toFixed(1)}m ` +
    `(${(worstOffsetStep / 60).toFixed(1)}s in)`
);
results.push(...trace);
results.push(`finished at y = ${car.pos.y.toFixed(2)}, surface there ${mode.getGroundHeight(car.pos.x, car.pos.z, car.pos.y).toFixed(2)}`);

if (!Number.isFinite(car.pos.y) || !Number.isFinite(car.pos.x)) {
  fail.push('car position went non-finite');
}
if (worstGap > 1.0) {
  fail.push(`car left the surface by ${worstGap.toFixed(2)}m`);
}
if (climbed < 20) {
  fail.push(`car barely changed height (${climbed.toFixed(1)}m climbed) — it is not following the road`);
}

// --------------------------------------------------------- flat-track guard
// Every shipped track is flat at y = 2. Nothing above may have changed what those
// feel like, so check the surface is still exactly the road height on the tarmac
// and the verge still falls away over the same 6m it always did.
const flat = makeHarness();
const flatConfig = TRACKS_DATABASE.find((t) => t.id === 'sprint_circuit')!;
flat.build(flatConfig);
const flatSamples = (flat as any).roadSamplePoints as THREE.Vector3[];

let flatError = 0;
for (let i = 0; i < flatSamples.length - 1; i++) {
  const from = flatSamples[i];
  const to = flatSamples[i + 1];
  for (let s = 0; s < 8; s++) {
    const p = new THREE.Vector3().lerpVectors(from, to, s / 8);
    flatError = Math.max(flatError, Math.abs(flat.getGroundHeight(p.x, p.z, p.y) - 2));
  }
}

const flatMid = flatSamples[10];
const flatInfo = flat.getTrackInfo(flatMid.x, flatMid.z, flatMid.y);
const outward = (flatInfo.normal ?? new THREE.Vector3(1, 0, 0)).clone();
const vergeProfile = [0, 2, 4, 6, 8, 10, 14, 20].map((d) => {
  const p = flatMid.clone().addScaledVector(outward, flatInfo.width / 2 + d);
  return `${d}m out: ${flat.getGroundHeight(p.x, p.z, 2).toFixed(2)}`;
});

results.push('');
results.push('--- flat shipped track (sprint_circuit, road at y = 2) ---');
results.push(`worst surface error on the tarmac: ${flatError.toFixed(4)}m`);
results.push(`verge profile past the road edge: ${vergeProfile.join(', ')}`);

if (flatError > 0.02) {
  fail.push(`flat track surface drifted by ${flatError.toFixed(3)}m from its authored height`);
}

console.log(results.join('\n'));
console.log('');
if (fail.length === 0) {
  console.log('PASS: the road behaves as a surface the car rides.');
} else {
  console.log('FAIL:');
  fail.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
