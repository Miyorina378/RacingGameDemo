/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Headless check for the free-standing grass patch decoration.
 * Run with:  npx tsx scripts/scenery-grass-check.ts
 *
 * The patch is the way grass gets placed away from the road, so this asks the three
 * things that would make it useless: does it bed into sculpted ground, does it keep
 * its blades off the tarmac, and does it come out identical on every rebuild (the
 * editor rebuilds the world on every edit, so a random scatter would boil).
 *
 * Dev tool only, not shipped and not imported by the app.
 */
import * as THREE from 'three';
import { BaseMode } from '../components/modes/BaseMode';
import { TrackConfig, TrackScenery } from '../components/config/TrackDatabase';
import { Vehicle } from '../components/objects/Vehicle';
import { applyBrush } from '../components/modes/terrain';
import {
  eraseGrassPatchesWithin,
  grassPatchRadius,
  grassPatchScaleForRadius,
  hasGrassPatchNear
} from '../components/objects/Grass';

// GLTF models cannot load in Node, and no car is needed here.
(Vehicle.prototype as any).buildGltfMesh = function () {
  (this as any).buildProceduralMesh();
};

// createScenery builds the shared building facade texture up front, which wants a
// 2D canvas. Node has none, so stand in a canvas that records nothing.
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect: () => {}
      })
    })
  };
}

class Harness extends BaseMode {
  public init() {}
  public update() {}
  public cleanup() {}
  public reset() {}
  /** Editor behaviour: newly placed grass sprouts instead of appearing whole. */
  public enableGrowth() {
    (this as any).grassGrowsIn = true;
  }
  public tickGrass(deltaTime: number) {
    (this as any).updateGrass(deltaTime);
  }
  public buildRoad(config: TrackConfig) {
    this.createRacetrackRoad(config);
  }
  public buildScenery(scenery: TrackScenery[]) {
    this.createScenery(scenery);
  }
  public group(): THREE.Group {
    return (this as any).environmentGroup as THREE.Group;
  }
  public trackHalfWidth() {
    return (this as any).roadWidth / 2;
  }
  public sculptHill(x: number, z: number, radius: number, strength: number) {
    for (let i = 0; i < 12; i++) {
      applyBrush(this.terrain, { brush: 'raise', x, z, radius, strength });
    }
  }
}

const makeHarness = (): Harness =>
  new Harness({} as any, new THREE.Scene(), {} as any, {} as any, new THREE.Group(), {});

const TRACK: TrackConfig = {
  id: 'grass_check',
  name: 'Grass Check',
  description: '',
  timeLimit: 999,
  roadWidth: 20,
  hasObstacles: false,
  requiresLicense: false,
  baseReward: 0,
  curveType: 'centripetal',
  path: Array.from({ length: 16 }).map((_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * 200, 2, Math.sin(angle) * 200);
  }),
  HaveCrub: false,
  HaveFence: false,
  HaveGrass: false,
  GrassWidth: 0
};

/**
 * One patch beside the road, close enough that a plain circle of grass would spill
 * over the tarmac, and one out in open ground on a sculpted hill.
 */
const SCENERY: TrackScenery[] = [
  { type: 'grass_patch', position: new THREE.Vector3(224, 0, 0), scale: 6 },
  { type: 'grass_patch', position: new THREE.Vector3(0, 0, 0), scale: 5 }
];

interface PatchReadout {
  bladeCount: number;
  matVertices: number;
  matIndices: number;
  worstGroundGap: number;
  bladesOnTarmac: number;
  matVertsOnTarmac: number;
  /** Spread of the rim radius: a perfect circle would be 0, an organic edge is not. */
  matReachSpread: number;
  firstMatrices: number[];
}

const readPatch = (harness: Harness, groupIndex: number): PatchReadout => {
  const patches = harness
    .group()
    .children.filter((child) => child.userData && child.userData.isScenery);
  const patch = patches[groupIndex] as THREE.Group;
  if (!patch) throw new Error(`patch ${groupIndex} was never added to the scene`);

  const mat = patch.children.find((child) => (child as THREE.Mesh).isMesh && !(child as any).isInstancedMesh) as THREE.Mesh;
  const blades = patch.children.find((child) => (child as any).isInstancedMesh) as THREE.InstancedMesh;
  if (!mat) throw new Error(`patch ${groupIndex} has no ground mat`);
  if (!blades) throw new Error(`patch ${groupIndex} has no blades`);

  const matPos = mat.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < matPos.count * 3; i++) {
    if (!Number.isFinite(matPos.array[i])) throw new Error('ground mat has a non-finite vertex');
  }

  // The mat is the visible green, so it has to be kept off the tarmac too, not just
  // the blades. A plain circle would happily lie across the road.
  let matVertsOnTarmac = 0;
  let matReachSpread = 0;
  const matReach: number[] = [];
  for (let i = 1; i < matPos.count; i++) {
    const local = new THREE.Vector3().fromBufferAttribute(matPos, i);
    const worldX = patch.position.x + local.x;
    const worldZ = patch.position.z + local.z;
    if (harness.getTrackInfo(worldX, worldZ).dist < harness.trackHalfWidth()) matVertsOnTarmac++;
    matReach.push(Math.hypot(local.x, local.z));
  }
  if (matReach.length > 0) {
    matReachSpread = Math.max(...matReach) - Math.min(...matReach);
  }

  const matrix = new THREE.Matrix4();
  const world = new THREE.Vector3();
  let worstGroundGap = 0;
  let bladesOnTarmac = 0;
  const firstMatrices: number[] = [];

  for (let i = 0; i < blades.count; i++) {
    blades.getMatrixAt(i, matrix);
    world.setFromMatrixPosition(matrix).add(patch.position);

    if (!Number.isFinite(world.x) || !Number.isFinite(world.y) || !Number.isFinite(world.z)) {
      throw new Error('blade has a non-finite position');
    }

    const ground = harness.terrain.sampleAt(world.x, world.z);
    worstGroundGap = Math.max(worstGroundGap, Math.abs(world.y - ground));

    const info = harness.getTrackInfo(world.x, world.z);
    if (info.dist < info.width / 2) bladesOnTarmac++;

    if (i < 4) firstMatrices.push(...matrix.elements);
  }

  return {
    bladeCount: blades.count,
    matVertices: matPos.count,
    matIndices: mat.geometry.getIndex()?.count ?? 0,
    worstGroundGap,
    bladesOnTarmac,
    matVertsOnTarmac,
    matReachSpread,
    firstMatrices
  };
};

const build = (): Harness => {
  const harness = makeHarness();
  // A hill under the open-ground patch, so "does it follow the terrain" is a real
  // question rather than a flat-world tautology.
  harness.sculptHill(0, 0, 90, 4);
  harness.buildRoad(TRACK);
  harness.buildScenery(SCENERY);
  return harness;
};

const first = build();
const second = build();

const hillHeight = first.terrain.sampleAt(0, 0);
let failed = false;
const fail = (message: string) => {
  failed = true;
  console.log(`FAIL: ${message}`);
};

console.log(`sculpted hill height at the open patch: ${hillHeight.toFixed(2)}m`);
if (hillHeight < 1) fail('the test hill did not rise, so terrain following is untested');

for (const index of [0, 1]) {
  const patch = readPatch(first, index);
  const repeat = readPatch(second, index);
  const label = index === 0 ? 'on-road patch ' : 'open-ground patch';

  console.log(
    `${label}  blades=${patch.bladeCount.toString().padStart(4)}  ` +
      `mat=${patch.matVertices}v/${patch.matIndices}i  ` +
      `worst gap to ground=${patch.worstGroundGap.toFixed(3)}m  ` +
      `on tarmac: ${patch.bladesOnTarmac} blades / ${patch.matVertsOnTarmac} mat verts  ` +
      `rim spread=${patch.matReachSpread.toFixed(1)}m`
  );

  if (patch.matVertsOnTarmac > 0) fail(`${label} laid its green over the road`);
  // A perfectly round patch reads as a plate dropped on the map, so the rim must vary.
  if (patch.matReachSpread < 1) fail(`${label} rim is a perfect circle`);
  if (patch.bladeCount < 50) fail(`${label} produced almost no blades`);
  if (patch.matIndices === 0) fail(`${label} ground mat has no triangles`);
  // Blades sit 2cm above the ground by design; anything past a few cm is floating.
  if (patch.worstGroundGap > 0.1) fail(`${label} blades do not sit on the ground`);
  if (patch.bladesOnTarmac > 0) fail(`${label} grew ${patch.bladesOnTarmac} blades through the road`);
  if (patch.bladeCount !== repeat.bladeCount) fail(`${label} blade count changed between rebuilds`);
  if (patch.firstMatrices.join(',') !== repeat.firstMatrices.join(',')) {
    fail(`${label} scatter changed between rebuilds`);
  }
}

// The two patches share a seed source only through their position, so a different
// position must give a different scatter or every field on the map looks cloned.
const patchA = readPatch(first, 0);
const patchB = readPatch(first, 1);
if (patchA.firstMatrices.join(',') === patchB.firstMatrices.join(',')) {
  fail('two patches at different positions scattered identically');
}

// --- sprouting: fresh grass comes up, existing grass is already up ---
// Painting used to snap a full patch into place in one frame, which reads as a pop.
const growthHarness = makeHarness();
growthHarness.enableGrowth();
growthHarness.buildRoad(TRACK);

const freshPatch: TrackScenery = {
  type: 'grass_patch',
  position: new THREE.Vector3(-500, 0, -500),
  scale: 5
};
const fresh = growthHarness.buildGrassPatch(freshPatch, 0);
const freshMat = fresh.children.find(
  (child) => (child as THREE.Mesh).isMesh && !(child as any).isInstancedMesh
) as THREE.Mesh;
const freshMaterial = freshMat.material as THREE.MeshStandardMaterial;

const opacityAtStart = freshMaterial.opacity;
growthHarness.tickGrass(0.2);
const opacityMidway = freshMaterial.opacity;
for (let i = 0; i < 10; i++) growthHarness.tickGrass(0.1);
const opacityAtEnd = freshMaterial.opacity;

// Same spot again: it has already come up once, so it must not sprout a second time
// just because the editor rebuilt the world.
const rebuiltPatch = growthHarness.buildGrassPatch(freshPatch, 0);
const rebuiltMaterial = (
  rebuiltPatch.children.find(
    (child) => (child as THREE.Mesh).isMesh && !(child as any).isInstancedMesh
  ) as THREE.Mesh
).material as THREE.MeshStandardMaterial;

console.log(
  `sprout: opacity ${opacityAtStart.toFixed(2)} -> ${opacityMidway.toFixed(2)} -> ${opacityAtEnd.toFixed(2)}, ` +
    `rebuild of the same patch starts at ${rebuiltMaterial.opacity.toFixed(2)}`
);
if (opacityAtStart !== 0) fail('a fresh patch should start invisible and grow in');
if (!(opacityMidway > opacityAtStart && opacityMidway < 1)) fail('the sprout does not ramp');
if (opacityAtEnd !== 1) fail('the sprout never finishes');
if (rebuiltMaterial.opacity !== 1) fail('rebuilding an existing patch made it sprout again');

// --- the grass brush: spacing on the way down, removal on the way back ---
// A stroke is a drag, so these two decisions are the whole brush. Painted patches
// must not stack, and clearing must take grass without touching other props.
const brushRadius = 30;
const spacing = brushRadius * 0.8;
const stroke: { type: string; x: number; z: number; scale: number }[] = [
  { type: 'tree1', x: 0, z: 0, scale: 2 }
];
let dropped = 0;
for (let travelled = 0; travelled <= 200; travelled += 5) {
  const x = travelled;
  const z = 400;
  if (hasGrassPatchNear(stroke, x, z, spacing)) continue;
  stroke.push({ type: 'grass_patch', x, z, scale: grassPatchScaleForRadius(brushRadius) });
  dropped++;
}
const patchesInStroke = stroke.filter((item) => item.type === 'grass_patch');
const gaps = patchesInStroke
  .slice(1)
  .map((item, i) => Math.abs(item.x - patchesInStroke[i].x));
const tightestGap = gaps.length > 0 ? Math.min(...gaps) : Infinity;

console.log(
  `brush stroke over 200m at radius ${brushRadius}m: ${dropped} patches, ` +
    `tightest gap ${tightestGap.toFixed(0)}m, patch radius ${grassPatchRadius(grassPatchScaleForRadius(brushRadius)).toFixed(0)}m`
);
if (dropped < 5) fail('the brush laid almost nothing along a 200m stroke');
if (dropped > 20) fail('the brush stacked patches instead of spacing them');
if (tightestGap < spacing - 5) fail('painted patches landed closer than the spacing rule allows');

const cleared = eraseGrassPatchesWithin(stroke, 0, 400, 60);
const clearedPatches = cleared.filter((item) => item.type === 'grass_patch').length;
console.log(
  `clear brush at radius 60m: grass ${patchesInStroke.length} -> ${clearedPatches}, ` +
    `other props kept ${cleared.filter((item) => item.type !== 'grass_patch').length}/1`
);
if (clearedPatches >= patchesInStroke.length) fail('the clear brush removed no grass');
if (clearedPatches === 0) fail('the clear brush removed grass beyond its radius');
if (!cleared.some((item) => item.type === 'tree1')) fail('the clear brush deleted a tree');

console.log(
  failed
    ? 'FAIL: grass patches are not placeable as they stand.'
    : 'PASS: grass patches bed into the ground, stay off the tarmac, rebuild identically, and the brush spaces and clears them.'
);
process.exit(failed ? 1 : 0);
