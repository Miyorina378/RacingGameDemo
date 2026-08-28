import * as THREE from 'three';
import { TrackConfig, TrackLayout, TrackNode, TrackSpur } from '../config/TrackDatabase';
import { Heightmap } from './terrain';

/**
 * Resolves a track's raw path into fully defaulted per-node values.
 *
 * Everything that rebuilds the centreline — the road mesh, the AI racing line,
 * the gear advisor and the minimap — must resolve nodes through here, otherwise
 * they disagree about where the road actually goes on sharp corners.
 */

export const CURB_WIDTH = 1.5;
export const DEFAULT_GRASS_WIDTH = 5.0;

/** Fallback layout for a track that declares none: the whole authored path. */
export const DEFAULT_TRACK_LAYOUT: TrackLayout = { id: 'full', name: 'Full Circuit' };

/**
 * The two variations the editor offers. Fixed rather than user-defined: a course
 * with a long version and a short one covers what the blocked-off sections in a
 * real circuit do, and it keeps the node UI down to one three-way choice.
 */
export const EDITOR_LAYOUTS: TrackLayout[] = [
  { id: 'long', name: 'Long Circuit' },
  { id: 'short', name: 'Short Circuit' }
];

/** Layouts a track offers. Always at least one, so callers never special-case. */
export const getTrackLayouts = (config: TrackConfig): TrackLayout[] =>
  config.layouts && config.layouts.length > 0 ? config.layouts : [DEFAULT_TRACK_LAYOUT];

/** Whether a node takes part in a layout. An untagged node is in every layout. */
const nodeInLayout = (point: THREE.Vector3 | TrackNode, layoutId: string): boolean => {
  if (isTrackVector(point)) return true;
  const layouts = (point as TrackNode).layouts;
  return !layouts || layouts.length === 0 || layouts.includes(layoutId);
};

/**
 * The track as one chosen variation sees it: same config, with the path filtered to
 * the nodes that belong to that layout.
 *
 * Everything downstream — the road ribbon, the AI line, the checkpoint, the lap and
 * placement maths, the minimap — reads `config.path`, so handing them a filtered
 * config means they all keep working on what is still a single closed loop. Nothing
 * needed to learn about branches.
 *
 * Returns the original object when there is nothing to do, so untagged tracks are
 * bit-for-bit unaffected, and refuses a filter that would leave too few nodes to
 * build a road.
 */
/**
 * Swaps a branch into the lap for one layout.
 *
 * A branch that leaves the circuit at one node and rejoins at another is a second way
 * round. Racing it is a matter of rebuilding the node list: keep the arc that is not
 * bypassed, then run through the branch. The result is still one closed loop, so the
 * road mesh, the checkpoint, the lap count, the AI and the minimap need to know
 * nothing about branches.
 *
 * The stretch of circuit it replaced does not vanish — it becomes the closed-off
 * branch instead, which is exactly what a real circuit looks like when it runs its
 * short layout.
 */
const remapTrackSpurReferences = (
  entries: { oldIndex: number; spur: TrackSpur }[]
): TrackSpur[] => {
  const indexMap = new Map<number, number>();
  entries.forEach((entry, index) => indexMap.set(entry.oldIndex, index));
  return entries.map(({ spur }) => {
    const startSpurIndex =
      spur.startSpurIndex === undefined ? undefined : indexMap.get(spur.startSpurIndex);
    const endSpurIndex =
      spur.endSpurIndex === undefined ? undefined : indexMap.get(spur.endSpurIndex);
    const lostEnd = spur.endSpurIndex !== undefined && endSpurIndex === undefined;
    return {
      ...spur,
      startSpurIndex,
      endSpurIndex,
      blocked: lostEnd ? true : spur.blocked
    };
  });
};

const raceSpurIntoPath = (config: TrackConfig, layoutId: string): TrackConfig => {
  const spurs = config.spurs;
  if (!spurs || spurs.length === 0) return config;

  const raced = spurs.findIndex(
    (spur) =>
      spur.raceLayouts?.includes(layoutId) &&
      spur.nodeIndex !== undefined &&
      spur.endNodeIndex !== undefined &&
      spur.path.length > 0
  );
  if (raced === -1) return config;

  const spur = spurs[raced];
  const count = config.path.length;
  const start = Math.max(0, Math.min(count - 1, Math.round(spur.nodeIndex!)));
  const end = Math.max(0, Math.min(count - 1, Math.round(spur.endNodeIndex!)));
  if (start === end) return config;

  // Walk the lap from the rejoining node round to the leaving node: that is the part
  // the branch does not replace. Everything between them the branch takes over.
  const keptIndices: number[] = [];
  for (let step = 0, index = end; step <= count; step++) {
    keptIndices.push(index);
    if (index === start) break;
    index = (index + 1) % count;
  }
  const bypassedIndices: number[] = [];
  for (let index = (start + 1) % count; index !== end; index = (index + 1) % count) {
    bypassedIndices.push(index);
    if (bypassedIndices.length > count) break;
  }

  const posAt = (index: number) => {
    const point = config.path[index];
    return isTrackVector(point) ? point : (point as TrackNode).pos;
  };

  // The branch's own points become road nodes. Missing elevationMode is the legacy
  // live-terrain behavior, and its historical default width is 80% of the track.
  const terrain = Heightmap.deserialize(config.terrain);
  const branchNodes: TrackNode[] = spur.path.map((point) => ({
    pos:
      spur.elevationMode === 'authored'
        ? point.clone()
        : new THREE.Vector3(point.x, terrain.sampleAt(point.x, point.z), point.z),
    width: spur.width ?? config.roadWidth * 0.8,
    leftCurb: spur.leftCurb,
    rightCurb: spur.rightCurb,
    leftFence: spur.leftFence,
    rightFence: spur.rightFence,
    leftGrassWidth: spur.leftGrassWidth,
    rightGrassWidth: spur.rightGrassWidth
  }));
  const path = [...keptIndices.map((index) => config.path[index]), ...branchNodes];
  if (path.length < 3) return config;

  // Old indices move, so anything pointing at a node has to be re-pointed. A branch
  // hanging off a stretch that is no longer part of the lap is dropped: it has nothing
  // left to attach to.
  const remap = new Map<number, number>();
  keptIndices.forEach((original, next) => remap.set(original, next));

  const remainingEntries = spurs
    .map((other, oldIndex): { oldIndex: number; spur: TrackSpur } | null => {
      if (oldIndex === raced) return null;
      const startIndex = other.nodeIndex !== undefined ? remap.get(Math.round(other.nodeIndex)) : undefined;
      const endIndex = other.endNodeIndex !== undefined ? remap.get(Math.round(other.endNodeIndex)) : undefined;
      const lostStart = other.nodeIndex !== undefined && startIndex === undefined;
      const lostEnd = other.endNodeIndex !== undefined && endIndex === undefined;
      if (lostStart || lostEnd) return null;
      return {
        oldIndex,
        spur: { ...other, nodeIndex: startIndex, endNodeIndex: endIndex }
      };
    })
    .filter(
      (entry): entry is { oldIndex: number; spur: TrackSpur } => entry !== null
    );
  const remainingSpurs = remapTrackSpurReferences(remainingEntries);

  // The bypassed run of circuit, standing there as the closed-off section. It leaves
  // the new lap at the old leaving node and comes back at the old rejoining node.
  if (bypassedIndices.length > 0) {
    const closedOff: TrackSpur = {
      nodeIndex: remap.get(start),
      endNodeIndex: remap.get(end),
      path: bypassedIndices.map((index) => posAt(index).clone()),
      width: config.roadWidth,
      elevationMode: 'authored',
      blocked: false,
      blockedStart: true,
      blockedEnd: true
    };
    remainingSpurs.push(closedOff);
  }

  return { ...config, path, spurs: remainingSpurs };
};

export const resolveTrackLayout = (
  config: TrackConfig,
  layoutId?: string | null
): TrackConfig => {
  if (!layoutId) return config;
  if (!config.layouts || config.layouts.length === 0) return config;
  if (!config.layouts.some((layout) => layout.id === layoutId)) return config;

  // Branch first, node tags second: the branch's own indices refer to the authored
  // path, and its new nodes carry no tags, so they survive the filter either way.
  const withBranch = raceSpurIntoPath(config, layoutId);

  const path = withBranch.path.filter((point) => nodeInLayout(point, layoutId));
  if (path.length < 3) return withBranch;
  if (path.length === withBranch.path.length) return withBranch;

  // Filtering nodes moves indices again, so branch junctions are re-pointed the same
  // way as above and any branch left hanging is dropped.
  const keptOriginal: number[] = [];
  withBranch.path.forEach((point, index) => {
    if (nodeInLayout(point, layoutId)) keptOriginal.push(index);
  });
  const remap = new Map<number, number>();
  keptOriginal.forEach((original, next) => remap.set(original, next));

  const spurEntries = withBranch.spurs
    ?.map((spur, oldIndex): { oldIndex: number; spur: TrackSpur } | null => {
      const startIndex = spur.nodeIndex !== undefined ? remap.get(Math.round(spur.nodeIndex)) : undefined;
      const endIndex = spur.endNodeIndex !== undefined ? remap.get(Math.round(spur.endNodeIndex)) : undefined;
      if (spur.nodeIndex !== undefined && startIndex === undefined) return null;
      if (spur.endNodeIndex !== undefined && endIndex === undefined) return null;
      return {
        oldIndex,
        spur: { ...spur, nodeIndex: startIndex, endNodeIndex: endIndex }
      };
    })
    .filter(
      (entry): entry is { oldIndex: number; spur: TrackSpur } => entry !== null
    );
  const spurs = spurEntries ? remapTrackSpurReferences(spurEntries) : undefined;

  return { ...withBranch, path, spurs };
};

export interface ResolvedTrackNode {
  pos: THREE.Vector3;
  width: number;
  banking: number;
  leftCurb: boolean;
  rightCurb: boolean;
  leftGrassWidth: number;
  rightGrassWidth: number;
  leftFence: boolean;
  rightFence: boolean;
  sharp: boolean;
  cornerRadius?: number;
  /**
   * Half-extent of everything bolted to the road at this node: half the road,
   * plus curb, plus grass. The fence sits exactly here, so this is the distance
   * a corner has to stay clear of to avoid the sides colliding with themselves.
   */
  reach: number;
}

export const isTrackVector = (point: THREE.Vector3 | TrackNode): point is THREE.Vector3 =>
  point instanceof THREE.Vector3 || 'isVector3' in point;

/**
 * Which side of which node each branch leaves from.
 *
 * Only the side, not the opening itself: the curb, grass and fence are cut per road
 * sample in BaseMode, because that is the only place the real geometry knows how long
 * a stretch actually is. This is here for the editor and for anything that needs to
 * ask "does a branch leave node 7, and out of which side".
 */
/** Everything the road builder needs to know about one branch meeting the circuit. */
export interface SpurJunction {
  /** Node on the lap the branch meets. */
  nodeIndex: number;
  /** Where on the map that node sits. */
  position: THREE.Vector3;
  /** Direction the branch heads away from the circuit, flattened. Unit length. */
  outward: THREE.Vector3;
  /** Which side of the road the branch is on. */
  side: 'left' | 'right';
  /**
   * How square the branch meets the road, from 0 (parallel) to 1 (perpendicular).
   * A slip road joining at a shallow angle covers far more of the verge than a
   * perpendicular one, so the opening has to be longer.
   */
  squareness: number;
  /** Branch width, so the opening can be sized from it. */
  width: number;
}

/**
 * Every place a branch actually touches the lap.
 *
 * A branch can start and end on the circuit — the classic closed-off loop that leaves
 * and rejoins — or hang off another branch entirely. Only the ends that meet the lap
 * get a junction, which is what stops a branch-to-branch link from punching a hole in
 * the fence at node 0.
 */
export const getSpurJunctions = (config: TrackConfig): SpurJunction[] => {
  const junctions: SpurJunction[] = [];
  if (!config.spurs || config.spurs.length === 0) return junctions;

  const count = config.path.length;
  if (count < 3) return junctions;
  const posAt = (index: number) => {
    const point = config.path[((index % count) + count) % count];
    return isTrackVector(point) ? point : (point as TrackNode).pos;
  };

  const add = (rawIndex: number, away: THREE.Vector3, width: number) => {
    const index = Math.max(0, Math.min(count - 1, Math.round(rawIndex)));
    const tangent = new THREE.Vector3().subVectors(posAt(index + 1), posAt(index - 1));
    tangent.y = 0;
    if (tangent.lengthSq() < 1e-8) return;
    tangent.normalize();
    const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();

    const outward = away.clone();
    outward.y = 0;
    if (outward.lengthSq() < 1e-6) return;
    outward.normalize();

    junctions.push({
      nodeIndex: index,
      position: posAt(index).clone(),
      outward,
      side: outward.dot(normal) >= 0 ? 'left' : 'right',
      // How much of the branch points across the road rather than along it.
      squareness: Math.abs(outward.dot(normal)),
      width
    });
  };

  for (const spur of config.spurs) {
    if (!spur.path || spur.path.length === 0) continue;
    const width = spur.width ?? config.roadWidth * 0.8;

    // Where the branch leaves the lap. Branches that start on another branch have no
    // junction of their own here.
    if (spur.nodeIndex !== undefined) {
      add(spur.nodeIndex, new THREE.Vector3().subVectors(spur.path[0], posAt(spur.nodeIndex)), width);
    }

    // Where a branch comes back to the lap, for the ones that close a loop.
    if (spur.endNodeIndex !== undefined) {
      const last = spur.path[spur.path.length - 1];
      add(spur.endNodeIndex, new THREE.Vector3().subVectors(last, posAt(spur.endNodeIndex)), width);
    }
  }

  return junctions;
};

/**
 * Which side of which node each branch leaves from.
 *
 * Only the side, not the opening itself: the curb, grass and fence are cut per road
 * sample in BaseMode, because that is the only place the real geometry knows how long
 * a stretch actually is. This is here for the editor and for anything that needs to
 * ask "does a branch leave node 7, and out of which side".
 */
export const getSpurOpenings = (config: TrackConfig): Map<number, { left: boolean; right: boolean }> => {
  const openings = new Map<number, { left: boolean; right: boolean }>();
  for (const junction of getSpurJunctions(config)) {
    const entry = openings.get(junction.nodeIndex) ?? { left: false, right: false };
    if (junction.side === 'left') entry.left = true;
    else entry.right = true;
    openings.set(junction.nodeIndex, entry);
  }
  return openings;
};

export const resolveTrackNodes = (config: TrackConfig): ResolvedTrackNode[] => {
  const trackCurb = config.HaveCrub ?? false;
  const trackFence = config.HaveFence;
  const trackGrass = (config.HaveGrass ?? false) ? config.GrassWidth ?? DEFAULT_GRASS_WIDTH : 0;

  return config.path.map((point) => {
    const tn = isTrackVector(point) ? null : (point as TrackNode);

    const bothCurb = tn?.curb ?? trackCurb;
    const bothGrass = tn?.grassWidth ?? trackGrass;
    const bothFence = tn?.fence ?? trackFence;

    const width = tn?.width ?? config.roadWidth;

    // Note: a branch's opening is NOT cut here. Clearing a whole node's side would
    // remove curb, grass and fence for half the distance to each neighbour — on a
    // track with 100m node spacing that is a hole the size of a straight — and it
    // would shrink `reach`, which moves the corner fillets and the racing line.
    // The opening is cut per road sample instead, in BaseMode.
    const leftCurb = tn?.leftCurb ?? bothCurb;
    const rightCurb = tn?.rightCurb ?? bothCurb;
    const leftGrassWidth = Math.max(0, tn?.leftGrassWidth ?? bothGrass);
    const rightGrassWidth = Math.max(0, tn?.rightGrassWidth ?? bothGrass);
    const leftFence = tn?.leftFence ?? bothFence;
    const rightFence = tn?.rightFence ?? bothFence;

    return {
      pos: tn ? tn.pos : (point as THREE.Vector3),
      width,
      banking: tn?.banking ?? 0,
      leftCurb,
      rightCurb,
      leftGrassWidth,
      rightGrassWidth,
      leftFence,
      rightFence,
      sharp: tn?.sharp ?? false,
      cornerRadius: tn?.cornerRadius,
      reach: Math.max(
        width / 2 + (leftCurb ? CURB_WIDTH : 0) + leftGrassWidth,
        width / 2 + (rightCurb ? CURB_WIDTH : 0) + rightGrassWidth
      )
    };
  });
};
