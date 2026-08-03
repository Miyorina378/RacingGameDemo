import * as THREE from 'three';

/**
 * Centreline construction for the racetrack ribbon.
 *
 * By default a track is one closed Catmull-Rom spline through every node, which
 * means every corner is rounded and there is no way to author a hard corner such
 * as an L bend. A node flagged `sharp` breaks that: the runs either side of it
 * arrive and leave along their straight chords, and a short fillet bridges the
 * vertex so the offset road edges stay well behaved.
 */

export interface CenterlineNode {
  sharp?: boolean;
  /** Distance back from the vertex at which the fillet starts. */
  cornerRadius?: number;
  /** Per-node road width override, used when `reach` is not supplied. */
  width?: number;
  /**
   * Half-extent of everything attached to the road here: half-width plus curb
   * plus grass, which is exactly where the fence sits. The auto fillet is sized
   * to keep this clear of itself, so turning grass or fences on automatically
   * opens the corner up rather than making the sides collide.
   */
  reach?: number;
}

export interface Centerline {
  curve: THREE.Curve<THREE.Vector3>;
  /**
   * Maps a normalised arc-length position along the closed loop (0..1) to
   * fractional node-index space, so per-node properties (width, banking, curb,
   * fence, grass) can still be interpolated between the two nodes a sample point
   * falls between. May return up to `points.length`; callers wrap it.
   */
  nodeIndexAt: (u: number) => number;
}

/** Largest share of a chord one fillet may eat, so two adjacent sharp corners never overlap. */
const MAX_FILLET_CHORD_FRACTION = 0.45;
/** Below this a fillet is not worth emitting; the two runs just meet at the vertex. */
const MIN_FILLET_LENGTH = 0.01;
/**
 * Headroom on top of the bare geometric minimum. BaseMode's self-intersection
 * pass starts trimming width at 0.85 of the available room, so clearing the
 * corner by ~20% keeps it from trimming at all.
 */
const CLEARANCE_MARGIN = 1.2;
const EPSILON = 1e-6;

/** The original all-smooth behaviour, kept exactly as-is for tracks with no sharp node. */
const smoothCenterline = (
  points: THREE.Vector3[],
  curveType: 'centripetal' | 'chordal' | 'catmullrom',
  tension: number,
  closed: boolean
): Centerline => {
  const curve = new THREE.CatmullRomCurve3(points, closed, curveType, tension);
  const segments = closed ? points.length : points.length - 1;
  return {
    curve,
    nodeIndexAt: (u) => curve.getUtoTmapping(u, 0) * segments,
  };
};

const sharpAwareCenterline = (
  points: THREE.Vector3[],
  nodes: CenterlineNode[],
  tension: number,
  roadWidth: number,
  closed: boolean
): Centerline => {
  const n = points.length;
  // Open tracks clamp at the ends instead of wrapping, which also zeroes the
  // fillet on the first and last node: an endpoint has no corner to round.
  const wrap = (i: number) =>
    closed ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i));
  const at = (i: number) => points[wrap(i)];
  const nodeAt = (i: number) => nodes[wrap(i)];
  const chord = (i: number) => at(i).distanceTo(at(i + 1));

  /** Unit direction from node `from` to node `to`, or null if they coincide. */
  const direction = (from: number, to: number) => {
    const d = at(to).clone().sub(at(from));
    return d.lengthSq() < EPSILON ? null : d.normalize();
  };

  /**
   * Setback that keeps the fillet's own radius of curvature clear of everything
   * attached to the road, so grass and fences never collide through a corner.
   *
   * A quadratic fillet with setback d across an interior angle phi has apex
   * radius R = d * sin^2(phi/2) / cos(phi/2). Solving for R = reach gives the d
   * below: shallow corners barely need any, tight ones need a lot. The chord
   * clamp caps what is actually achievable on short segments.
   */
  const autoSetback = (i: number) => {
    const node = nodeAt(i);
    const reach = node.reach ?? (node.width ?? roadWidth) / 2;
    const back = direction(i, i - 1);
    const forward = direction(i, i + 1);
    if (!back || !forward) return Infinity;
    const half = back.angleTo(forward) / 2;
    const sin = Math.sin(half);
    if (sin < EPSILON) return Infinity; // hairpin doubling back; take the clamp
    return (CLEARANCE_MARGIN * reach * Math.cos(half)) / (sin * sin);
  };

  /** How far back from vertex i the adjacent runs stop so a fillet can bridge them. */
  const setback = (i: number) => {
    const node = nodeAt(i);
    if (!node.sharp) return 0;
    const requested = Math.max(0, node.cornerRadius ?? autoSetback(i));
    const limit = MAX_FILLET_CHORD_FRACTION * Math.min(chord(i - 1), chord(i));
    return Math.min(requested, limit);
  };

  /** Point at which the run coming from node i-1 stops short of vertex i. */
  const entry = (i: number) => {
    const d = setback(i);
    const dir = d > 0 ? direction(i, i - 1) : null;
    return dir ? at(i).clone().addScaledVector(dir, d) : at(i).clone();
  };

  /** Point at which the run heading to node i+1 resumes past vertex i. */
  const exit = (i: number) => {
    const d = setback(i);
    const dir = d > 0 ? direction(i, i + 1) : null;
    return dir ? at(i).clone().addScaledVector(dir, d) : at(i).clone();
  };

  // Hermite tangents. A sharp node departs and arrives along its straight chord,
  // which is what makes two sharp-adjacent runs collapse into exact straight lines;
  // a smooth node keeps the usual Catmull-Rom tangent through its neighbours.
  const outgoingTangent = (i: number) =>
    nodeAt(i).sharp
      ? at(i + 1).clone().sub(at(i))
      : at(i + 1).clone().sub(at(i - 1)).multiplyScalar(tension);

  const incomingTangent = (i: number) =>
    nodeAt(i).sharp
      ? at(i).clone().sub(at(i - 1))
      : at(i + 1).clone().sub(at(i - 1)).multiplyScalar(tension);

  const path = new THREE.CurvePath<THREE.Vector3>();
  // Node-index span covered by each sub-curve, kept parallel to path.curves.
  const spans: Array<[number, number]> = [];

  for (let i = 0; i < (closed ? n : n - 1); i++) {
    // 1. Fillet across vertex i, when that node is sharp enough to need one.
    const filletStart = entry(i);
    const filletEnd = exit(i);
    if (filletStart.distanceTo(filletEnd) > MIN_FILLET_LENGTH) {
      // Control point on the vertex makes the arc tangent to both chords.
      path.add(new THREE.QuadraticBezierCurve3(filletStart, at(i).clone(), filletEnd));
      spans.push([i, i]);
    }

    // 2. Run from vertex i to vertex i + 1.
    const from = filletEnd;
    const to = entry(i + 1);
    const chordLength = chord(i);
    // Tangents are sized for a full chord, so shrink them by however much the
    // fillets ate. Without this the control points can overshoot the shortened
    // run and the curve doubles back on itself.
    const scale = chordLength > EPSILON ? from.distanceTo(to) / chordLength : 1;
    const c1 = from.clone().addScaledVector(outgoingTangent(i), scale / 3);
    const c2 = to.clone().addScaledVector(incomingTangent(i + 1), -scale / 3);
    path.add(new THREE.CubicBezierCurve3(from, c1, c2, to));
    spans.push([i, i + 1]);
  }

  const cumulative = path.getCurveLengths();
  const total = cumulative[cumulative.length - 1] || 1;

  return {
    curve: path,
    nodeIndexAt: (u) => {
      const target = THREE.MathUtils.clamp(u, 0, 1) * total;
      let k = 0;
      while (k < cumulative.length - 1 && cumulative[k] < target) k++;
      const start = k === 0 ? 0 : cumulative[k - 1];
      const span = cumulative[k] - start;
      const frac = span > EPSILON ? (target - start) / span : 0;
      const [from, to] = spans[k];
      return from + (to - from) * frac;
    },
  };
};

export const buildCenterline = (
  points: THREE.Vector3[],
  nodes: CenterlineNode[],
  options: {
    curveType?: 'centripetal' | 'chordal' | 'catmullrom';
    tension?: number;
    /** Track-wide road width, used to size the default fillet on sharp nodes. */
    roadWidth: number;
    /** Defaults to true; point-to-point tracks pass false. */
    closed?: boolean;
  }
): Centerline => {
  const tension = options.tension ?? 0.5;
  const closed = options.closed ?? true;
  // Tracks without a single sharp node take the original code path untouched, so
  // existing hand-authored layouts render exactly as they always have.
  if (!nodes.some((node) => node.sharp)) {
    return smoothCenterline(points, options.curveType ?? 'centripetal', tension, closed);
  }
  return sharpAwareCenterline(points, nodes, tension, options.roadWidth, closed);
};
