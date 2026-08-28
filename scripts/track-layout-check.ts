/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Headless check for course variations and blocked spurs.
 * Run with:  npx tsx scripts/track-layout-check.ts
 *
 * Two claims are worth proving, because both could break quietly:
 *
 * 1. A layout is only a filtered path. Everything downstream still sees one closed
 *    loop, an untagged track is returned untouched, and a short course really does
 *    skip the loop it is supposed to skip.
 * 2. A blocked spur is a separate drivable surface. It must add meshes and ground
 *    without changing the circuit samples that feed the racing line, AI, and lap
 *    logic. Its junction, side dressing, and authored elevation are checked too.
 *
 * Dev tool only, not shipped and not imported by the app.
 */
import * as THREE from 'three';
import { BaseMode } from '../components/modes/BaseMode';
import { TrackConfig, TrackNode, TrackSpur } from '../components/config/TrackDatabase';
import { Vehicle } from '../components/objects/Vehicle';
import { enforceFenceBoundary } from '../components/objects/Fence';
import {
  DEFAULT_TRACK_LAYOUT,
  getSpurJunctions,
  getSpurOpenings,
  getTrackLayouts,
  resolveTrackLayout,
  resolveTrackNodes
} from '../components/modes/trackNodes';

// GLTF models cannot load in Node, and no car is needed here.
(Vehicle.prototype as any).buildGltfMesh = function () {
  (this as any).buildProceduralMesh();
};

class Harness extends BaseMode {
  public init() {}
  public update() {}
  public cleanup() {}
  public reset() {}
  public buildRoad(config: TrackConfig) {
    this.createRacetrackRoad(config);
  }
  public buildSpurs(spurs: TrackSpur[] | undefined, config: TrackConfig) {
    this.createSpurRoads(spurs, config);
  }
  public spurCount() {
    return (this as any).spurSurfaces.length as number;
  }
  public spurSurfacesForCheck(): any[] {
    return (this as any).spurSurfaces as any[];
  }
  public sampleFences(side: 'left' | 'right'): boolean[] {
    return (this as any)[side === 'left' ? 'roadSampleLeftFences' : 'roadSampleRightFences'];
  }
  public sampleGrass(side: 'left' | 'right'): number[] {
    return (this as any)[
      side === 'left' ? 'roadSampleLeftGrassWidths' : 'roadSampleRightGrassWidths'
    ];
  }
  public samples(): THREE.Vector3[] {
    return (this as any).roadSamplePoints as THREE.Vector3[];
  }
  public group(): THREE.Group {
    return (this as any).environmentGroup as THREE.Group;
  }
}

const makeHarness = (): Harness =>
  new Harness({} as any, new THREE.Scene(), {} as any, {} as any, new THREE.Group(), {});

let failed = false;
const fail = (message: string) => {
  failed = true;
  console.log(`FAIL: ${message}`);
};

const ringNode = (angleDeg: number, radius: number, layouts?: string[]): TrackNode => {
  const angle = (angleDeg / 180) * Math.PI;
  return {
    pos: new THREE.Vector3(Math.cos(angle) * radius, 2, Math.sin(angle) * radius),
    ...(layouts ? { layouts } : {})
  };
};

/**
 * A ring with one big excursion. The long course swings out to 320m; the short one
 * takes a chord across the neck instead, so "did the filter work" is a question of
 * geometry rather than of counting.
 */
const VARIANT_TRACK: TrackConfig = {
  id: 'layout_check',
  name: 'Layout Check',
  description: '',
  timeLimit: 999,
  roadWidth: 20,
  hasObstacles: false,
  requiresLicense: false,
  baseReward: 0,
  curveType: 'centripetal',
  layouts: [
    { id: 'long', name: 'Long Circuit' },
    { id: 'short', name: 'Short Circuit' }
  ],
  path: [
    ringNode(0, 200),
    ringNode(30, 200),
    ringNode(55, 200),
    // The excursion: only the long course drives it.
    ringNode(75, 320, ['long']),
    ringNode(90, 340, ['long']),
    ringNode(105, 320, ['long']),
    // The cut-through that closes the short lap instead.
    ringNode(90, 190, ['short']),
    ringNode(125, 200),
    ringNode(160, 200),
    ringNode(200, 200),
    ringNode(240, 200),
    ringNode(280, 200),
    ringNode(320, 200)
  ],
  HaveCrub: false,
  HaveFence: false,
  HaveGrass: false,
  GrassWidth: 0
};

const PLAIN_TRACK: TrackConfig = {
  ...VARIANT_TRACK,
  id: 'layout_check_plain',
  layouts: undefined,
  path: Array.from({ length: 12 }).map((_, i) => ringNode((i / 12) * 360, 200))
};

// --- 1. the resolver ---
const layouts = getTrackLayouts(VARIANT_TRACK);
const plainLayouts = getTrackLayouts(PLAIN_TRACK);
console.log(
  `layouts offered: tagged track ${layouts.map((l) => l.id).join('/')}, ` +
    `plain track ${plainLayouts.map((l) => l.id).join('/')}`
);
if (layouts.length !== 2) fail('a tagged track should offer both variations');
if (plainLayouts.length !== 1 || plainLayouts[0].id !== DEFAULT_TRACK_LAYOUT.id) {
  fail('an untagged track should offer exactly the default layout');
}

const long = resolveTrackLayout(VARIANT_TRACK, 'long');
const short = resolveTrackLayout(VARIANT_TRACK, 'short');

if (resolveTrackLayout(VARIANT_TRACK, undefined) !== VARIANT_TRACK) {
  fail('no layout id must hand back the very same config object');
}
if (resolveTrackLayout(PLAIN_TRACK, 'short') !== PLAIN_TRACK) {
  fail('an untagged track must be returned untouched whatever layout is asked for');
}
if (resolveTrackLayout(VARIANT_TRACK, 'nonsense') !== VARIANT_TRACK) {
  fail('an unknown layout must fall back to the whole course');
}

console.log(
  `node counts: authored ${VARIANT_TRACK.path.length}, long ${long.path.length}, short ${short.path.length}`
);
if (long.path.length !== VARIANT_TRACK.path.length - 1) fail('long should drop only the short-only node');
if (short.path.length !== VARIANT_TRACK.path.length - 3) fail('short should drop the three excursion nodes');
if (short.path.length < 3) fail('short is too small to build a road');

// --- 2. each variation builds its own road ---
const measure = (config: TrackConfig) => {
  const harness = makeHarness();
  harness.buildRoad(config);
  const samples = harness.samples();
  let length = 0;
  let maxRadius = 0;
  for (let i = 0; i < samples.length; i++) {
    maxRadius = Math.max(maxRadius, Math.hypot(samples[i].x, samples[i].z));
    if (i > 0) length += samples[i].distanceTo(samples[i - 1]);
  }
  return { harness, samples, length, maxRadius };
};

const longRoad = measure(long);
const shortRoad = measure(short);

console.log(
  `long course:  ${longRoad.length.toFixed(0)}m of road, reaches ${longRoad.maxRadius.toFixed(0)}m out`
);
console.log(
  `short course: ${shortRoad.length.toFixed(0)}m of road, reaches ${shortRoad.maxRadius.toFixed(0)}m out`
);
if (longRoad.samples.length < 10) fail('the long course built no usable road');
if (shortRoad.samples.length < 10) fail('the short course built no usable road');
if (shortRoad.length >= longRoad.length) fail('the short course is not shorter than the long one');
if (longRoad.maxRadius < 300) fail('the long course does not drive the excursion');
if (shortRoad.maxRadius > 250) fail('the short course still drives the excursion');

// Both remain closed loops: first and last sample meet.
for (const [label, road] of [
  ['long', longRoad],
  ['short', shortRoad]
] as const) {
  const seam = road.samples[0].distanceTo(road.samples[road.samples.length - 1]);
  if (seam > 1) fail(`${label} course did not come back to its start (seam ${seam.toFixed(1)}m)`);
}

// --- 3. spurs are scenery and nothing else ---
// PLAIN_TRACK is a 12 node ring at radius 200, so node 0 sits at (200, 0). Both
// branches hang off a real node, which is what opens the verge for them.
const spurTrack: TrackConfig = {
  ...PLAIN_TRACK,
  id: 'spur_check',
  HaveCrub: true,
  HaveFence: true,
  HaveGrass: true,
  GrassWidth: 6,
  spurs: [
    {
      nodeIndex: 0,
      path: [new THREE.Vector3(260, 2, 20), new THREE.Vector3(320, 2, 60)]
    },
    {
      nodeIndex: 6,
      path: [new THREE.Vector3(-280, 2, 40)],
      blocked: false,
      width: 12
    },
    {
      // Loop-closing spur from node 2 to node 4
      nodeIndex: 2,
      endNodeIndex: 4,
      path: [new THREE.Vector3(150, 2, 250), new THREE.Vector3(0, 2, 280)],
      width: 14
    }
  ]
};

const spurHarness = makeHarness();
spurHarness.buildRoad(spurTrack);

const probe = new THREE.Vector3(260, 2, 20);
const before = {
  samples: spurHarness.samples().length,
  children: spurHarness.group().children.length,
  info: spurHarness.getTrackInfo(probe.x, probe.z),
  ground: spurHarness.getGroundHeight(probe.x, probe.z),
  spurHeight: spurHarness.getSpurHeight(probe.x, probe.z)
};

spurHarness.buildSpurs(spurTrack.spurs, spurTrack);

const after = {
  samples: spurHarness.samples().length,
  children: spurHarness.group().children.length,
  info: spurHarness.getTrackInfo(probe.x, probe.z),
  ground: spurHarness.getGroundHeight(probe.x, probe.z)
};

const spurObjects = spurHarness
  .group()
  .children.filter((child) => child.userData && child.userData.isSpur);
const spurRibbons = spurObjects.filter((child) => (child as THREE.Mesh).isMesh);
const spurBarriers = spurObjects.filter((child) => (child as any).isGroup);

// A branch is drivable, so the tarmac has to hold a car up out there. Before the
// spur is built the same spot reads as bare terrain.
const spurHeightBefore = before.spurHeight;
const spurHeightAfter = spurHarness.getSpurHeight(probe.x, probe.z);
const groundOnSpur = spurHarness.getGroundHeight(probe.x, probe.z);

console.log(
  `spurs added ${after.children - before.children} objects ` +
    `(${spurRibbons.length} ribbons, ${spurBarriers.length} barrier groups)`
);
console.log(
  `surface on the branch: ${spurHeightBefore === null ? 'none' : spurHeightBefore.toFixed(2)} -> ` +
    `${spurHeightAfter === null ? 'none' : spurHeightAfter.toFixed(2)}m, ` +
    `getGroundHeight now returns ${groundOnSpur.toFixed(2)}m`
);
if (spurHeightBefore !== null) fail('there was a branch surface before any branch was built');
if (spurHeightAfter === null) fail('a built branch has no drivable surface');
if (Math.abs(groundOnSpur - (spurHeightAfter ?? 0)) > 0.01) {
  fail('a car out on the branch would not be held up by it');
}

// --- 3b. a branch can be the course ---
/** A plain point on a ring, for branch paths. */
const ringAt = (angleDeg: number, radius: number) => {
  const angle = (angleDeg / 180) * Math.PI;
  return new THREE.Vector3(Math.cos(angle) * radius, 2, Math.sin(angle) * radius);
};
// Tagged for the short course, a loop-closing branch takes over the lap: the racing
// line runs down it, and the stretch it bypasses is left as the closed-off section.
const racedTrack: TrackConfig = {
  ...PLAIN_TRACK,
  id: 'raced_branch_check',
  layouts: [
    { id: 'long', name: 'Long Circuit' },
    { id: 'short', name: 'Short Circuit' }
  ],
  spurs: [
    {
      nodeIndex: 2,
      endNodeIndex: 6,
      leftCurb: true,
      rightCurb: false,
      leftFence: false,
      rightFence: true,
      leftGrassWidth: 5,
      rightGrassWidth: 0,
      raceLayouts: ['short'],
      // A chord across the ring, so racing it is plainly shorter than the arc.
      path: [ringAt(120, 120), ringAt(150, 110)]
    }
  ]
};

const longVariant = resolveTrackLayout(racedTrack, 'long');
const shortVariant = resolveTrackLayout(racedTrack, 'short');

const pathLength = (config: TrackConfig) => {
  const harness = makeHarness();
  harness.buildRoad(config);
  const samples = harness.samples();
  let length = 0;
  for (let i = 1; i < samples.length; i++) length += samples[i].distanceTo(samples[i - 1]);
  return { length, samples, harness };
};

const longRun = pathLength(longVariant);
const shortRun = pathLength(shortVariant);
const branchPoint = racedTrack.spurs![0].path[0];
const nearestOnShort = Math.min(
  ...shortRun.samples.map((p) => Math.hypot(p.x - branchPoint.x, p.z - branchPoint.z))
);
const nearestOnLong = Math.min(
  ...longRun.samples.map((p) => Math.hypot(p.x - branchPoint.x, p.z - branchPoint.z))
);
const racedBranchNode = shortVariant.path.find((point) => {
  if (point instanceof THREE.Vector3) return false;
  return Math.hypot(
    point.pos.x - branchPoint.x,
    point.pos.z - branchPoint.z
  ) < 0.01;
}) as TrackNode | undefined;
if (
  !racedBranchNode ||
  racedBranchNode.leftCurb !== true ||
  racedBranchNode.rightCurb !== false ||
  racedBranchNode.leftGrassWidth !== 5 ||
  racedBranchNode.rightGrassWidth !== 0 ||
  racedBranchNode.leftFence !== false ||
  racedBranchNode.rightFence !== true ||
  racedBranchNode.width !== racedTrack.roadWidth * 0.8 ||
  Math.abs(racedBranchNode.pos.y) > 0.01
) {
  fail('a raced spur lost its old width/terrain behavior or left/right dressing');
}

console.log(
  `raced branch: long course ${longVariant.path.length} nodes / ${longRun.length.toFixed(0)}m, ` +
    `short course ${shortVariant.path.length} nodes / ${shortRun.length.toFixed(0)}m`
);
console.log(
  `branch point sits ${nearestOnShort.toFixed(1)}m from the short course and ` +
    `${nearestOnLong.toFixed(1)}m from the long one; ` +
    `spurs left standing: long ${longVariant.spurs?.length ?? 0}, short ${shortVariant.spurs?.length ?? 0}`
);

if (longVariant.path.length !== racedTrack.path.length) {
  fail('the long course should be the authored lap, untouched');
}
if (longVariant.spurs?.length !== 1) fail('the long course should still show the branch as scenery');
if (shortRun.length >= longRun.length) fail('racing the branch did not shorten the course');
if (nearestOnShort > 2) fail('the short course does not actually run down the branch');
if (nearestOnLong < 20) fail('the long course should not touch the branch');
if (shortVariant.spurs?.length !== 1) {
  fail('the bypassed stretch should be left standing as one closed-off branch');
}
const closedOff = shortVariant.spurs?.[0];
if (!closedOff || closedOff.nodeIndex === undefined || closedOff.endNodeIndex === undefined) {
  fail('the closed-off stretch is not attached to the lap at both ends');
}
if (closedOff?.elevationMode !== 'authored') {
  fail('the old main-road arc lost its authored height when converted to a spur');
}
if ((closedOff?.path.length ?? 0) !== 3) {
  fail('the closed-off stretch should hold the three bypassed nodes');
}
if (closedOff?.blockedStart !== true || closedOff.blockedEnd !== true) {
  fail('the generated bypass needs a closure at both live-road entrances');
}

// Building the converted old arc must produce two visible walls and two matching
// collision records. Old one-ended branches must still keep exactly one GT barrier.
shortRun.harness.buildSpurs(shortVariant.spurs, shortVariant);
const shortClosureGroups = shortRun.harness
  .group()
  .children.filter(
    (child) => child.userData?.isSpur && (child as THREE.Group).isGroup
  );
const shortClosureBarriers = shortRun.harness.getSpurBarriers();
console.log(
  `closed-off bypass: ${shortClosureGroups.length} visible entrance walls, ` +
    `${shortClosureBarriers.length} collision barriers`
);
if (shortClosureGroups.length !== 2) {
  fail(`the closed-off bypass should show two entrance walls, got ${shortClosureGroups.length}`);
}
if (shortClosureBarriers.length !== 2) {
  fail(`the closed-off bypass should have two collision barriers, got ${shortClosureBarriers.length}`);
}
if (spurHarness.getSpurBarriers().length !== 1) {
  fail('legacy dead-end behavior should still register exactly one GT collision barrier');
}
for (const barrier of shortClosureBarriers) {
  const values = [
    ...barrier.center.toArray(),
    ...barrier.normal.toArray(),
    ...barrier.tangent.toArray(),
    barrier.halfWidth,
    barrier.halfDepth,
    barrier.height
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    fail('a generated bypass barrier contains non-finite collision data');
  }
  if (barrier.halfWidth <= 0 || barrier.halfDepth <= 0 || barrier.height <= 0) {
    fail('a generated bypass barrier has no physical extent');
  }
}
const closedSurface = shortRun.harness.spurSurfacesForCheck()[0];
if (!closedSurface || shortClosureBarriers.length !== 2) {
  fail('the generated bypass surface did not retain both endpoint barriers');
} else {
  const firstSample = closedSurface.samples[0] as THREE.Vector3;
  const lastSample = closedSurface.samples[closedSurface.samples.length - 1] as THREE.Vector3;
  const startBarrier = shortClosureBarriers.reduce((closest, barrier) =>
    barrier.center.distanceTo(firstSample) < closest.center.distanceTo(firstSample)
      ? barrier
      : closest
  );
  const endBarrier = shortClosureBarriers.reduce((closest, barrier) =>
    barrier.center.distanceTo(lastSample) < closest.center.distanceTo(lastSample)
      ? barrier
      : closest
  );
  if (startBarrier.normal.dot(closedSurface.tangents[0]) < 0.99) {
    fail('the start closure collision normal does not face into the bypass');
  }
  if (endBarrier.normal.dot(closedSurface.tangents[closedSurface.tangents.length - 1]) > -0.99) {
    fail('the end closure collision normal does not face back into the bypass');
  }
}

const collisionProbe = shortClosureBarriers[0];
if (collisionProbe) {
  const liveRoadStart = collisionProbe.center
    .clone()
    .addScaledVector(collisionProbe.normal, -1);
  const liveRoadCar = {
    pos: liveRoadStart.clone(),
    velocityX: collisionProbe.normal.x * 10,
    velocityZ: collisionProbe.normal.z * 10,
    speed: 10,
    getSpurBarriers: () => [collisionProbe],
    haveFence: false,
    trackBoundary: 0
  } as unknown as Vehicle;
  enforceFenceBoundary(liveRoadCar);
  const resolvedSide = new THREE.Vector3()
    .subVectors(liveRoadCar.pos, collisionProbe.center)
    .dot(collisionProbe.normal);
  const reflectedVelocity =
    liveRoadCar.velocityX * collisionProbe.normal.x +
    liveRoadCar.velocityZ * collisionProbe.normal.z;
  if (resolvedSide >= 0 || reflectedVelocity >= 0) {
    fail('a closure pushed a live-road car through the wall and into the bypass');
  }

  const elevatedStart = collisionProbe.center.clone();
  elevatedStart.y += collisionProbe.height + 2;
  const elevatedCar = {
    pos: elevatedStart.clone(),
    velocityX: collisionProbe.normal.x * 10,
    velocityZ: collisionProbe.normal.z * 10,
    speed: 10,
    getSpurBarriers: () => [collisionProbe],
    haveFence: false,
    trackBoundary: 0
  } as unknown as Vehicle;
  enforceFenceBoundary(elevatedCar);
  if (elevatedCar.pos.distanceTo(elevatedStart) > 1e-6) {
    fail('a closure collided with a car on another elevation');
  }
}

// The new lap still has to be a loop.
const shortSeam = shortRun.samples[0].distanceTo(shortRun.samples[shortRun.samples.length - 1]);
if (shortSeam > 1) fail(`the short course did not close its seam (${shortSeam.toFixed(1)}m)`);
// And the verge has to open where the closed-off stretch now meets the lap.
const closedJunctions = getSpurJunctions(shortVariant);
console.log(
  `closed-off stretch rejoins at nodes ${closedJunctions.map((j) => j.nodeIndex).join(' and ')}`
);
if (closedJunctions.length !== 2) fail('the closed-off stretch got no junctions on the new lap');

// --- 4. the way out: curb, grass and fence at each junction ---
// Every end that touches the lap is a junction, including the far end of a branch
// that closes a loop.
const junctions = getSpurJunctions(spurTrack);
const openings = getSpurOpenings(spurTrack);
console.log(
  `junctions: ${junctions
    .map((j) => `node ${j.nodeIndex} ${j.side} (squareness ${j.squareness.toFixed(2)})`)
    .join(', ')}`
);
if (junctions.length !== 4) fail('expected four junctions: nodes 0, 6, 2 and 4');
for (const index of [0, 6, 2, 4]) {
  const opening = openings.get(index);
  if (!opening || (!opening.left && !opening.right)) {
    fail(`node ${index} is a junction but no opening was recorded`);
  }
}

// The node data itself must be untouched. `reach` sizes the corner fillets, and the
// AI line is built from the same nodes, so opening a verge must not move the track.
const resolvedWithSpurs = resolveTrackNodes(spurTrack);
const resolvedWithout = resolveTrackNodes({ ...spurTrack, spurs: undefined });
const nodesDiffer = resolvedWithSpurs.some((node, i) => {
  const plain = resolvedWithout[i];
  return (
    node.leftCurb !== plain.leftCurb ||
    node.rightCurb !== plain.rightCurb ||
    node.leftFence !== plain.leftFence ||
    node.rightFence !== plain.rightFence ||
    node.leftGrassWidth !== plain.leftGrassWidth ||
    node.rightGrassWidth !== plain.rightGrassWidth ||
    node.reach !== plain.reach
  );
});
console.log(`node data with spurs vs without: ${nodesDiffer ? 'changed' : 'identical'}`);
if (nodesDiffer) {
  fail('spurs changed the node data, which would move the fillets and the racing line');
}

/** Length of the stretch of missing fence around a point, on one side. */
const gapLength = (side: 'left' | 'right', at: THREE.Vector3) => {
  const samples = spurHarness.samples();
  const fences = spurHarness.sampleFences(side);
  if (samples.length < 4) return 0;

  let nearest = 0;
  let best = Infinity;
  samples.forEach((point, i) => {
    const distSq = (point.x - at.x) ** 2 + (point.z - at.z) ** 2;
    if (distSq < best) {
      best = distSq;
      nearest = i;
    }
  });
  if (fences[nearest] !== false) return 0;

  let length = 0;
  for (const direction of [-1, 1]) {
    let index = nearest;
    for (;;) {
      const step = ((index + direction) % samples.length + samples.length) % samples.length;
      if (fences[step] !== false || step === nearest) break;
      length += samples[index].distanceTo(samples[step]);
      index = step;
    }
  }
  return length;
};

const nodeAt = (index: number) => {
  const point = spurTrack.path[index];
  return ('isVector3' in point ? point : (point as TrackNode).pos) as THREE.Vector3;
};
const otherSide = (side: 'left' | 'right') => (side === 'left' ? 'right' : 'left');
const junctionAt = (index: number) => junctions.find((j) => j.nodeIndex === index)!;

const startJunction = junctionAt(0);
const startGap = gapLength(startJunction.side, nodeAt(0));
const startFarSideGap = gapLength(otherSide(startJunction.side), nodeAt(0));
const loopStartGap = gapLength(junctionAt(2).side, nodeAt(2));
const loopEndGap = gapLength(junctionAt(4).side, nodeAt(4));
const noSpurGap = gapLength('left', nodeAt(8)) + gapLength('right', nodeAt(8));

console.log(
  `fence gaps: node 0 ${startGap.toFixed(0)}m on the ${startJunction.side}, ` +
    `${startFarSideGap.toFixed(0)}m on the far side; loop ends ${loopStartGap.toFixed(0)}m / ` +
    `${loopEndGap.toFixed(0)}m; node 8 with no branch ${noSpurGap.toFixed(0)}m`
);
const branchWidth = spurTrack.spurs?.[0].width ?? spurTrack.roadWidth * 0.8;
// The gap is measured in road samples, which sit about 4m apart, so it lands on the
// branch width give or take one step.
if (startGap < branchWidth - 4.5) fail('the opening is narrower than the branch that uses it');
if (startGap > 160) fail('the opening swallowed most of a straight');
if (startFarSideGap !== 0) fail('the far side of the road lost its fence too');
if (loopStartGap < 10 || loopEndGap < 10) fail('a loop-closing branch is missing an opening');
if (noSpurGap !== 0) fail('a node with no branch lost its fence');

// A branch that peels away almost along the road covers far more verge than one that
// turns off square, so its opening has to be longer.
const squareGap = gapLength(junctionAt(2).side, nodeAt(2));
const obliqueGap = gapLength(junctionAt(4).side, nodeAt(4));
console.log(
  `square join (squareness ${junctionAt(2).squareness.toFixed(2)}) ${squareGap.toFixed(0)}m vs ` +
    `oblique join (${junctionAt(4).squareness.toFixed(2)}) ${obliqueGap.toFixed(0)}m`
);
if (obliqueGap <= squareGap) fail('an oblique junction did not get a longer opening');

// What the car's own boundary check reads at the junction: no fence, no grass to cross.
const probeSide = startJunction.side === 'left' ? 1 : -1;
const junctionNormal = new THREE.Vector3(0, 1, 0)
  .cross(new THREE.Vector3().subVectors(nodeAt(1), nodeAt(11)).normalize())
  .normalize();
const edgeProbe = nodeAt(0)
  .clone()
  .addScaledVector(junctionNormal, probeSide * (spurTrack.roadWidth / 2 + 1));
const edgeInfo = spurHarness.getTrackInfo(edgeProbe.x, edgeProbe.z);

const awayNormal = new THREE.Vector3(0, 1, 0)
  .cross(new THREE.Vector3().subVectors(nodeAt(9), nodeAt(7)).normalize())
  .normalize();
const awayProbe = nodeAt(8)
  .clone()
  .addScaledVector(awayNormal, probeSide * (spurTrack.roadWidth / 2 + 1));
const awayInfo = spurHarness.getTrackInfo(awayProbe.x, awayProbe.z);

console.log(
  `at the junction edge: fence ${edgeInfo.fence}, curb ${edgeInfo.curb}, ` +
    `grass ${(edgeInfo.grassWidth ?? 0).toFixed(1)}m | away from it: fence ${awayInfo.fence}, ` +
    `grass ${(awayInfo.grassWidth ?? 0).toFixed(1)}m`
);
if (edgeInfo.fence !== false) fail('a car leaving at the junction would still hit a fence');
if ((edgeInfo.grassWidth ?? 0) > 0.01) fail('the junction still has grass to cross');
if (awayInfo.fence !== true) fail('the fence never came back away from the junction');
if ((awayInfo.grassWidth ?? 0) <= 0.01) fail('the grass never came back away from the junction');

if (after.samples !== before.samples) fail('a spur changed the road sample list');
if (Math.abs(after.info.dist - before.info.dist) > 1e-6) fail('a spur changed what getTrackInfo reports');
if (Math.abs(after.info.width - before.info.width) > 1e-6) fail('a spur changed the reported road width');
// Blocked spur: ribbon plus one barrier at the dead end. Open spur / closed loop: ribbon only.
if (spurRibbons.length !== 3) fail(`expected 3 ribbons for 3 spurs, got ${spurRibbons.length}`);
if (spurBarriers.length !== 1) fail(`expected a single dead-end barrier on the blocked spur, got ${spurBarriers.length}`);

const ribbon = spurRibbons[0] as THREE.Mesh;
const ribbonPos = ribbon.geometry.getAttribute('position') as THREE.BufferAttribute;
for (let i = 0; i < ribbonPos.count * 3; i++) {
  if (!Number.isFinite(ribbonPos.array[i])) fail('spur ribbon has a non-finite vertex');
}
if (ribbonPos.count % 2 !== 0) fail('spur ribbon should have two vertices per sample');

// The mouth has to meet the road deck, or the branch floats or sinks at the junction.
let worstMouthGap = Infinity;
const mouth = new THREE.Vector3(200, 0, 0);
for (let i = 0; i < ribbonPos.count; i++) {
  const vertex = new THREE.Vector3().fromBufferAttribute(ribbonPos, i);
  if (vertex.distanceTo(new THREE.Vector3(mouth.x, vertex.y, mouth.z)) > 14) continue;
  const roadHeight = spurHarness.getGroundHeight(vertex.x, vertex.z);
  worstMouthGap = Math.min(worstMouthGap, Math.abs(vertex.y - roadHeight));
}
console.log(`spur mouth sits ${worstMouthGap.toFixed(2)}m off the surface it joins`);
if (!(worstMouthGap < 0.3)) fail('the spur does not meet the road at its mouth');

// --- 5. independent sides, authored elevation, and a real flared mouth ---
const sideTrack: TrackConfig = {
  ...PLAIN_TRACK,
  id: 'spur_side_check',
  HaveCrub: true,
  HaveFence: true,
  HaveGrass: true,
  GrassWidth: 6,
  spurs: [
    {
      nodeIndex: 0,
      path: [new THREE.Vector3(260, 8, 0), new THREE.Vector3(320, 8, 0)],
      width: 14,
      leftCurb: true,
      rightCurb: false,
      leftGrassWidth: 7,
      rightGrassWidth: 0,
      leftFence: true,
      rightFence: false,
      elevationMode: 'authored'
    }
  ]
};
const sideHarness = makeHarness();
sideHarness.buildRoad(sideTrack);
sideHarness.buildSpurs(sideTrack.spurs, sideTrack);
const centerProbe = new THREE.Vector3(290, 8, 0);
const centerSpurInfo = sideHarness.getSpurInfo(centerProbe.x, centerProbe.z);
if (!centerSpurInfo) {
  fail('the asymmetric spur has no drivable surface');
} else {
  const localCenter = centerSpurInfo.closestPt.clone();
  localCenter.y = centerProbe.y;
  const leftCurbProbe = localCenter
    .clone()
    .addScaledVector(centerSpurInfo.normal, centerSpurInfo.halfWidth + centerSpurInfo.curbWidth * 0.1);
  const rightProbe = localCenter
    .clone()
    .addScaledVector(centerSpurInfo.normal, -(centerSpurInfo.halfWidth + centerSpurInfo.curbWidth * 0.1));
  const leftGrassProbe = localCenter.clone().addScaledVector(
    centerSpurInfo.normal,
    centerSpurInfo.halfWidth + centerSpurInfo.curbWidth + 2
  );
  const leftInfo = sideHarness.getSpurInfo(leftCurbProbe.x, leftCurbProbe.z);
  const rightInfo = sideHarness.getSpurInfo(rightProbe.x, rightProbe.z);
  const grassInfo = sideHarness.getSpurInfo(leftGrassProbe.x, leftGrassProbe.z);

  console.log(
    `asymmetric spur: left curb ${leftInfo?.haveCurb}/${leftInfo?.onCurb}, ` +
      `grass ${grassInfo?.grassWidth}m, fence ${leftInfo?.fence}; right curb ` +
      `${rightInfo?.haveCurb}, grass ${rightInfo?.grassWidth}m, fence ${rightInfo?.fence}`
  );
  if (!leftInfo?.haveCurb || !leftInfo.onCurb) fail('left spur curb override did not build');
  if (!grassInfo?.onGrass || grassInfo.grassWidth !== 7) fail('left spur grass override did not build');
  if (!leftInfo?.fence) fail('left spur fence override is not active for collision');
  if (rightInfo?.haveCurb) fail('right spur curb was not disabled');
  if ((rightInfo?.grassWidth ?? -1) !== 0) fail('right spur grass was not disabled');
  if (rightInfo?.fence) fail('right spur fence was not disabled for collision');
}

const elevatedHeight = sideHarness.getSpurHeight(centerProbe.x, centerProbe.z);
console.log(`authored spur height: ${elevatedHeight?.toFixed(1)}m (terrain is 0.0m)`);
if (elevatedHeight === null || Math.abs(elevatedHeight - 8) > 0.15) {
  fail('authored spur point heights were ignored');
}
const grassMeshes = sideHarness.group().children.filter((child) => child.userData?.isSpurGrass);
if (grassMeshes.length !== 1) fail('enabled spur grass produced no visible verge mesh');

const sideSurface = sideHarness.spurSurfacesForCheck()[0];
if (!sideSurface) {
  fail('the asymmetric spur surface was not registered');
} else {
  const normalWidth = Math.min(...sideSurface.leftWidths);
  const mouthWidth = sideSurface.leftWidths[0];
  const authoredNode = (sideTrack.path[0] as TrackNode).pos;
  const mouthDistance = sideSurface.samples[0].distanceTo(
    new THREE.Vector3(authoredNode.x, sideSurface.samples[0].y, authoredNode.z)
  );
  console.log(
    `flared mouth: ${mouthWidth.toFixed(1)}m half-width -> ${normalWidth.toFixed(1)}m, ` +
      `starts ${mouthDistance.toFixed(1)}m from node centre at the road edge`
  );
  if (mouthWidth <= normalWidth + 0.5) fail('the spur mouth is still a constant-width strip');
  if (mouthDistance < sideTrack.roadWidth * 0.3) fail('the spur still starts at the node centre');
  if (mouthDistance > sideTrack.roadWidth) fail('the spur mouth detached from the main road edge');

  const tangent = sideSurface.tangents[Math.min(1, sideSurface.tangents.length - 1)];
  const expectedLeft = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  if (sideSurface.normals[Math.min(1, sideSurface.normals.length - 1)].dot(expectedLeft) < 0.999) {
    fail('spur left/right normal does not match the main-road convention');
  }

  const flareSample = sideSurface.samples[0];
  const flareProbe = flareSample.clone().addScaledVector(
    sideSurface.normals[0],
    sideSurface.leftWidths[0] + 0.4
  );
  const flareInfo = sideHarness.getSpurInfo(flareProbe.x, flareProbe.z, flareSample.y);
  if (flareInfo?.haveCurb || flareInfo?.haveGrass || flareInfo?.fence) {
    fail('the visually open flare still reports invisible curb, grass, or fence');
  }
}

if (centerSpurInfo) {
  const beyondFence = centerProbe.clone().addScaledVector(
    centerSpurInfo.normal,
    centerSpurInfo.halfWidth + centerSpurInfo.curbWidth + centerSpurInfo.grassWidth + 4
  );
  const fenceCapture = sideHarness.getSpurInfo(beyondFence.x, beyondFence.z, centerProbe.y);
  if (!fenceCapture?.fence) fail('a car just beyond the spur rail is no longer captured by that fence');
  if (sideHarness.getSpurHeight(beyondFence.x, beyondFence.z, centerProbe.y) !== null) {
    fail('the spur supplies invisible ground beyond its rendered verge');
  }
}

// A spur with no new fields must still inherit the track defaults on both sides.
const inheritedCenter = spurHarness.getSpurInfo(probe.x, probe.z);
if (inheritedCenter) {
  for (const sign of [-1, 1]) {
    const point = probe.clone().addScaledVector(
      inheritedCenter.normal,
      sign * (inheritedCenter.halfWidth + inheritedCenter.curbWidth * 0.6)
    );
    const info = spurHarness.getSpurInfo(point.x, point.z);
    if (!info?.haveCurb || info.grassWidth !== 6 || !info.fence) {
      fail('an old spur did not inherit track-wide dressing on both sides');
    }
  }
}

console.log(
  failed
    ? 'FAIL: course variations or blocked spurs are not behaving.'
    : 'PASS: variations filter the lap and stay closed, and spurs are drivable branches ' +
      'that open the verge and leave the racing line alone.'
);
process.exit(failed ? 1 : 0);
