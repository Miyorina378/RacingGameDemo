import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  LandmarkContext, box as lmBox, buildEastLandmarks, buildNorthLandmarks, buildSouthLandmarks, buildVillage,
  buildWestLandmarks, curvedRoof, flushBuckets, gableRoof, norm, pyramid, usFlagTexture,
} from './DealerLandmarks';

/* ============================================================================
   Dealer District - the region east of the career valley.

   Built at the valley's scale (1 unit = 1 m) so the two maps read as
   neighbours: a coastal plain walled by mountains to the west and north, with
   the highway coming in through a mountain pass. That highway is the far end
   of the valley's southern road (road_approach in career_valley.blend); the
   map trips drive along both.

     West City   American cars: Art Deco towers, a stadium, an EV plant and
                 the red suspension bridge over the bay
     North City  European cars: gabled old town, cathedral, clock tower,
                 iron lattice tower, a castle on the ridge, windmills
     East City   Japanese cars: neon towers, pagoda, castle keep, red lattice
                 tower, a torii in the harbour, a container port, and a
                 snow-capped volcano on the skyline
     South City  Chinese and Korean cars: glass supertalls, a pearl tower,
                 a temple with hanok houses, a paifang gate, lanterns,
                 the marina and a lighthouse
   Landmarks live in DealerLandmarks.ts.

   Everything is generated here from a few tables; nothing is random between
   visits (seeded). World axes: +X east, -Z north, +Y up; sea level y = 0.
   ========================================================================== */

export type DealerCityKey = 'west' | 'north' | 'east' | 'south';

export const DEALER_CITY_COLORS: Record<DealerCityKey, number> = {
  east: 0xff0258,
  west: 0x06b6d4,
  north: 0x3b82f6,
  south: 0xf59e0b,
};

export interface DealerCityHandle {
  centre: THREE.Vector3;
  /** Invisible volume for picking. */
  hit: THREE.Object3D;
  /** 0 = idle, 1 = hovered/selected: ground ring and light beacon. */
  setHighlight(level: number): void;
}

export interface DealerWorld {
  root: THREE.Group;
  cities: Record<DealerCityKey, DealerCityHandle>;
  /** Where the highway from the career valley comes out of the pass, and the direction into the district. */
  entry: { position: THREE.Vector3; forward: THREE.Vector3 };
  /** The player's Home cottage in the village at the centre. */
  home: DealerCityHandle;
  /** Centre of the district, for the overview camera. */
  focus: THREE.Vector3;
  update(elapsed: number, delta: number): void;
  setLampsOn(on: boolean): void;
  dispose(): void;
}

// ---------------------------------------------------------------- noise

const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const valueNoise = (x: number, z: number) => {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
};
const fbm = (x: number, z: number) =>
  valueNoise(x, z) * 0.55 + valueNoise(x * 2.03 + 5.2, z * 2.03 + 1.3) * 0.28 + valueNoise(x * 4.1 + 9.7, z * 4.1 + 3.1) * 0.17;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const makeRandom = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

// ---------------------------------------------------------------- layout
//
// Coast, mountains, roads and city sites are authored in a compact "design"
// space and spread out from the hub by K, so the land between the cities
// grows while every building keeps its real size.

const K = 1.35;
const HUB = new THREE.Vector2(0, 12);
const HUB_RADIUS = 14;
/** Design coordinates to world. */
const W = (x: number, z: number) => new THREE.Vector2(HUB.x + (x - HUB.x) * K, HUB.y + (z - HUB.y) * K);
const Wxz = (x: number, z: number): [number, number] => { const v = W(x, z); return [v.x, v.y]; };
/** World coordinates to design. */
const D = (x: number, z: number): [number, number] => [HUB.x + (x - HUB.x) / K, HUB.y + (z - HUB.y) / K];

/** Where the highway leaves the pass (the trips from the valley start here). */
const ENTRY_XZ = W(-212, 20);
/** Village round the hub; the forest and the city pads keep clear of it. */
const VILLAGE_RADIUS = 66;
const VOLCANO = W(158, -238);

const CITY_SPOTS: Record<DealerCityKey, THREE.Vector2> = {
  west: W(-148, -30),
  north: W(-10, -104),
  east: W(112, -40),
  south: W(40, 86),
};

type Archetype = 'deco' | 'gable' | 'dense' | 'mega';
interface CityStyle {
  radius: number; count: number; minH: number; maxH: number; minF: number; maxF: number;
  arch: Archetype; seed: number;
  /** Dealer pavilion, relative to the city centre. */
  pavilion: [number, number];
}
const CITY_STYLES: Record<DealerCityKey, CityStyle> = {
  west: { radius: 56, count: 62, minH: 14, maxH: 64, minF: 12, maxF: 19, arch: 'deco', seed: 11, pavilion: [0, -14] },
  north: { radius: 54, count: 90, minH: 9, maxH: 22, minF: 8, maxF: 13, arch: 'gable', seed: 23, pavilion: [18, 10] },
  east: { radius: 52, count: 78, minH: 12, maxH: 58, minF: 8, maxF: 13, arch: 'dense', seed: 37, pavilion: [-14, -10] },
  south: { radius: 54, count: 62, minH: 18, maxH: 72, minF: 10, maxF: 16, arch: 'mega', seed: 53, pavilion: [-14, 12] },
};

interface RoadSpec { id: string; width: number; points?: [number, number][]; circle?: { c: [number, number]; r: number }; bridge?: [number, number] }
const spread = (pts: [number, number][]) => pts.map(([x, z]) => Wxz(x, z));
const ROADS: RoadSpec[] = [
  // From the valley: over the pass, across the bridge to the hub.
  { id: 'highway', width: 12, bridge: [W(-128, 0).x, W(-62, 0).x], points: spread([[-340, 26], [-300, 23], [-256, 20], [-212, 20], [-184, 21], [-150, 22], [-122, 20], [-66, 20], [-36, 17], [-14, 13]]) },
  { id: 'ring', width: 10, circle: { c: [HUB.x, HUB.y], r: HUB_RADIUS } },
  { id: 'east', width: 10, points: spread([[11, 10], [45, 4], [78, -10], [100, -28], [110, -38]]) },
  { id: 'north', width: 9, points: spread([[1, 1], [4, -30], [-14, -55], [-4, -78], [-10, -92]]) },
  { id: 'south', width: 9, points: spread([[2, 23], [14, 50], [30, 70], [40, 84]]) },
  { id: 'coast', width: 9, points: spread([[42, 90], [82, 97], [118, 79], [141, 40], [146, 14], [128, 12]]) },
  { id: 'west_spur', width: 9, points: spread([[-150, 22], [-150, 2], [-148, -28]]) },
];

/** Signed distance-ish to the shore: > 0 on land, < 0 at sea (metres). */
const ellipseSigned = (x: number, z: number, cx: number, cz: number, rx: number, rz: number) =>
  (Math.hypot((x - cx) / rx, (z - cz) / rz) - 1) * Math.min(rx, rz);
const coastDistanceD = (x: number, z: number) => {
  const east = 168 + 14 * Math.sin(z * 0.021) + 6 * Math.sin(z * 0.07 + 1.3) - x;
  const south = 118 + 12 * Math.sin(x * 0.024 + 0.5) + 5 * Math.sin(x * 0.09) - z;
  const bay = ellipseSigned(x, z, -95, 62, 36, 66);
  const harbour = ellipseSigned(x, z, 162, -18, 34, 24);
  const marina = ellipseSigned(x, z, 58, 128, 30, 20);
  return Math.min(east, south, bay, harbour, marina);
};

/** Metres to the shore in world space (> 0 on land). */
const coastDistance = (x: number, z: number) => coastDistanceD(...D(x, z)) * K;

/** Natural ground before roads and city pads are cut in (design space). */
const rawHeightD = (x: number, z: number) => {
  let h = 1.6 + 1.1 * fbm(x * 0.013, z * 0.013);
  const west = smooth(-160, -240, x);
  if (west > 0) {
    // The pass: a notch through the western range where the highway climbs.
    const notch = Math.exp(-(((z - 20) / 26) ** 2));
    h += west * (36 + 30 * fbm(x * 0.018 + 7.1, z * 0.018 + 2.3)) * (1 - 0.8 * notch);
  }
  const north = smooth(-132, -215, z);
  if (north > 0) h += north * (30 + 28 * fbm(x * 0.016 + 3.3, z * 0.016 + 9.1));
  h += 7.5 * (1 - smooth(60, 84, Math.hypot(x + 10, z + 104)));   // North City plateau
  // A snow-capped volcano on the north-east skyline, behind East City.
  h += 118 * Math.pow(Math.max(0, 1 - Math.hypot(x - 158, z + 238) / 125), 1.4);
  const land = coastDistanceD(x, z);
  if (land < 12) h = THREE.MathUtils.lerp(0.55, h, smooth(0, 12, land));
  if (land < 0) h = 0.55 + Math.max(-5, land * 0.35);
  return h;
};
/** Natural ground in world space. */
const rawHeight = (x: number, z: number) => rawHeightD(...D(x, z));

const cityBase: Record<DealerCityKey, number> = {
  west: rawHeight(CITY_SPOTS.west.x, CITY_SPOTS.west.y),
  north: rawHeight(CITY_SPOTS.north.x, CITY_SPOTS.north.y),
  east: rawHeight(CITY_SPOTS.east.x, CITY_SPOTS.east.y),
  south: rawHeight(CITY_SPOTS.south.x, CITY_SPOTS.south.y),
};
const CITY_KEYS = Object.keys(CITY_SPOTS) as DealerCityKey[];

/** Ground with the city pads levelled (roads are cut in afterwards). */
const padHeight = (x: number, z: number) => {
  let h = rawHeight(x, z);
  // Pads stop at the shore, or they would fill in the marina and the harbour.
  const onLand = smooth(-2, 10, coastDistance(x, z));
  if (onLand <= 0) return h;
  for (const key of CITY_KEYS) {
    const c = CITY_SPOTS[key];
    const w = 1 - smooth(CITY_STYLES[key].radius + 2, CITY_STYLES[key].radius + 22, Math.hypot(x - c.x, z - c.y));
    if (w > 0) h = THREE.MathUtils.lerp(h, cityBase[key], w * onLand);
  }
  const hubW = 1 - smooth(VILLAGE_RADIUS - 8, VILLAGE_RADIUS + 16, Math.hypot(x - HUB.x, z - HUB.y));
  if (hubW > 0) h = THREE.MathUtils.lerp(h, rawHeight(HUB.x, HUB.y), hubW * onLand);
  return h;
};

// ---------------------------------------------------------------- roads

interface RoadSample { p: THREE.Vector3; t: THREE.Vector3; n: THREE.Vector3; bridge: boolean }
interface Road { spec: RoadSpec; samples: RoadSample[]; step: number; length: number; closed: boolean }

const buildRoads = (): Road[] => ROADS.map((spec) => {
  const closed = !!spec.circle;
  const pts = spec.circle
    ? Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      return new THREE.Vector3(spec.circle!.c[0] + Math.cos(a) * spec.circle!.r, 0, spec.circle!.c[1] + Math.sin(a) * spec.circle!.r);
    })
    : spec.points!.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  const length = curve.getLength();
  const count = Math.max(8, Math.round(length / 2.5));
  const spaced = curve.getSpacedPoints(count);
  if (closed) spaced.pop();
  const samples: RoadSample[] = spaced.map((p) => ({
    p: new THREE.Vector3(p.x, padHeight(p.x, p.z), p.z), t: new THREE.Vector3(), n: new THREE.Vector3(),
    bridge: !!spec.bridge && p.x > spec.bridge[0] && p.x < spec.bridge[1],
  }));
  // Smooth the grade so the road does not follow every ripple.
  const ys = samples.map((s) => s.p.y);
  samples.forEach((s, i) => {
    let sum = 0, n = 0;
    for (let k = -4; k <= 4; k++) {
      const j = closed ? (i + k + ys.length) % ys.length : Math.min(ys.length - 1, Math.max(0, i + k));
      sum += ys[j]; n++;
    }
    s.p.y = Math.max(0.9, sum / n);
  });
  // Bridge: a gentle arch between the abutments.
  if (spec.bridge) {
    const idx = samples.map((s, i) => (s.bridge ? i : -1)).filter((i) => i >= 0);
    if (idx.length) {
      const a = samples[Math.max(0, idx[0] - 1)].p.y, b = samples[Math.min(samples.length - 1, idx[idx.length - 1] + 1)].p.y;
      idx.forEach((i, k) => {
        const t = (k + 1) / (idx.length + 1);
        samples[i].p.y = a + (b - a) * t + 8.5 * Math.sin(Math.PI * t);
      });
    }
  }
  samples.forEach((s, i) => {
    const prev = samples[closed ? (i - 1 + samples.length) % samples.length : Math.max(0, i - 1)].p;
    const next = samples[closed ? (i + 1) % samples.length : Math.min(samples.length - 1, i + 1)].p;
    s.t.subVectors(next, prev).setY(0).normalize();
    s.n.set(-s.t.z, 0, s.t.x);
  });
  return { spec, samples, step: length / count, length, closed };
});

/** Grid lookup of road samples, for levelling the ground and keeping props off the road. */
class RoadIndex {
  private cells = new Map<string, { s: RoadSample; hw: number }[]>();
  constructor(roads: Road[], private cell = 10) {
    roads.forEach((road) => road.samples.forEach((s) => {
      const key = `${Math.floor(s.p.x / cell)},${Math.floor(s.p.z / cell)}`;
      let list = this.cells.get(key);
      if (!list) this.cells.set(key, (list = []));
      list.push({ s, hw: road.spec.width / 2 });
    }));
  }
  /** Nearest sample within ~2 cells: distance to its edge (negative = on the road). */
  nearest(x: number, z: number, includeBridge = false) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best: { s: RoadSample; hw: number } | null = null;
    let bestD = Infinity;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const list = this.cells.get(`${cx + i},${cz + j}`);
      if (!list) continue;
      for (const e of list) {
        if (e.s.bridge && !includeBridge) continue;
        const d = Math.hypot(e.s.p.x - x, e.s.p.z - z);
        if (d < bestD) { bestD = d; best = e; }
      }
    }
    return best ? { sample: best.s, distance: bestD, halfWidth: best.hw } : null;
  }
}

// ---------------------------------------------------------------- mesh helpers

const colorOf = (hex: number) => new THREE.Color(hex);

const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
};

/** A ribbon along road samples between two lateral offsets. */
const ribbon = (samples: RoadSample[], closed: boolean, offA: number, offB: number, lift: number, keep?: (i: number) => boolean) => {
  const pos: number[] = [], idx: number[] = [];
  const n = samples.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i <= segs; i++) {
    const s = samples[i % n];
    pos.push(
      s.p.x + s.n.x * offA, s.p.y + lift, s.p.z + s.n.z * offA,
      s.p.x + s.n.x * offB, s.p.y + lift, s.p.z + s.n.z * offB
    );
  }
  // offA is on the -n side and n = (-t.z, 0, t.x), so (a, a+1, a+2) winds
  // counter-clockwise seen from above: the ribbon faces up.
  for (let i = 0; i < segs; i++) {
    if (keep && !keep(i)) continue;
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/** Canvas textures for building faces: a window grid (8 x 8 per tile) and its night lights. */
const windowTextures = (() => {
  let cache: { map: THREE.CanvasTexture; lit: THREE.CanvasTexture } | null = null;
  return () => {
    if (cache) return cache;
    const make = (lit: boolean) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const g = canvas.getContext('2d')!;
      const random = makeRandom(lit ? 91 : 17);
      g.fillStyle = lit ? '#000000' : '#d9d9d9';
      g.fillRect(0, 0, 512, 512);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const x = c * 64 + 10, y = r * 64 + 14;
        if (lit) {
          if (random() < 0.58) {
            const v = 0.35 + random() * 0.65;
            g.fillStyle = `rgba(255, ${Math.floor(200 + 40 * random())}, ${Math.floor(140 + 60 * random())}, ${v})`;
            g.fillRect(x, y, 44, 36);
          }
        } else {
          g.fillStyle = '#2b3642';
          g.fillRect(x, y, 44, 36);
          g.fillStyle = 'rgba(255,255,255,0.18)';
          g.fillRect(x, y, 44, 6);
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    };
    cache = { map: make(false), lit: make(true) };
    return cache;
  };
})();

/** A building box with window UVs scaled to its size (roofs get a plain wall texel). */
const buildingBox = (w: number, h: number, d: number, x: number, y: number, z: number, rotY: number, uOff: number, vOff: number) => {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z; four vertices each.
  const widths = [d, d, 0, 0, w, w];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) uv.setXY(i, 0.005, 0.005);
      else uv.setXY(i, uv.getX(i) * (widths[f] / 32) + uOff, uv.getY(i) * (h / 28) + vOff);
    }
  }
  g.rotateY(rotY);
  g.translate(x, y + h / 2, z);
  return g;
};

// ---------------------------------------------------------------- world

export const buildDealerWorld = (): DealerWorld => {
  const root = new THREE.Group();
  root.name = 'dealer_district';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => { disposables.push(d); return d; };
  const animated: ((t: number, dt: number) => void)[] = [];
  let nightTarget = 0;
  let night = 0;
  const nightMaterials: { mat: THREE.MeshStandardMaterial; day: number; nightI: number }[] = [];
  const nightOnly: THREE.Object3D[] = [];

  const roads = buildRoads();
  const roadIndex = new RoadIndex(roads);

  /** Final ground: pads, then road corridors levelled to the road grade. */
  const groundY = (x: number, z: number) => {
    let h = padHeight(x, z);
    const near = roadIndex.nearest(x, z);
    if (near) {
      const w = 1 - smooth(near.halfWidth + 1.5, near.halfWidth + 12, near.distance);
      if (w > 0) h = THREE.MathUtils.lerp(h, near.sample.p.y - 0.1, w);
    }
    return h;
  };
  const clearOfRoads = (x: number, z: number, margin: number) => {
    const near = roadIndex.nearest(x, z, true);
    return !near || near.distance > near.halfWidth + margin;
  };

  // -------------------------------------------------------------- terrain
  {
    const mid = W(-40, -20);
    const g = new THREE.PlaneGeometry(880 * K, 620 * K, 420, 296);
    g.rotateX(-Math.PI / 2);
    g.translate(mid.x, 0, mid.y);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const grass = colorOf(0x5d8c47), grassDry = colorOf(0x8a9a52), sand = colorOf(0xd6c79c), rock = colorOf(0x7e7a70);
    const snow = colorOf(0xeef1f4), seabed = colorOf(0x6f8a78), paved = colorOf(0x9c9b94);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = groundY(x, z);
      pos.setY(i, h);
      const slope = Math.hypot(rawHeight(x + 2, z) - rawHeight(x - 2, z), rawHeight(x, z + 2) - rawHeight(x, z - 2)) / 4;
      const land = coastDistance(x, z);
      c.copy(grass).lerp(grassDry, THREE.MathUtils.clamp(0.5 + fbm(x * 0.03, z * 0.03) * 0.8, 0, 1) * 0.55);
      if (land < 7) c.lerp(sand, 1 - smooth(2, 7, land));
      if (land < 0) c.copy(seabed);
      c.lerp(rock, smooth(0.35, 0.8, slope) * 0.9 + smooth(16, 30, h) * 0.6);
      c.lerp(snow, smooth(40, 52, h));
      for (const key of CITY_KEYS) {
        const d = Math.hypot(x - CITY_SPOTS[key].x, z - CITY_SPOTS[key].y);
        if (d < CITY_STYLES[key].radius + 4 && land > 2) c.lerp(paved, (1 - smooth(CITY_STYLES[key].radius - 8, CITY_STYLES[key].radius + 4, d)) * 0.75 * smooth(2, 8, land));
      }
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const mat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    mat.name = 'ValleyTerrain';     // shares the career valley's terrain grade
    const terrain = new THREE.Mesh(track(g), mat);
    terrain.name = 'terrain';
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    root.add(terrain);
  }

  // -------------------------------------------------------------- sea
  {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const g = canvas.getContext('2d')!;
    const img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const nx = valueNoise(x / 16, y / 16) + 0.5 * valueNoise(x / 7 + 3, y / 7 + 9);
      const ny = valueNoise(x / 16 + 17, y / 16 + 4) + 0.5 * valueNoise(x / 7 + 11, y / 7 + 2);
      const k = (y * 256 + x) * 4;
      img.data[k] = 128 + nx * 60; img.data[k + 1] = 128 + ny * 60; img.data[k + 2] = 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const normal = track(new THREE.CanvasTexture(canvas));
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(90, 90);
    const mat = track(new THREE.MeshStandardMaterial({
      color: 0x2c7898, roughness: 0.14, metalness: 0.08, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35),
    }));
    const sea = new THREE.Mesh(track(new THREE.PlaneGeometry(2600, 2600)), mat);
    sea.rotation.x = -Math.PI / 2;
    sea.name = 'water_sea';
    sea.receiveShadow = true;
    root.add(sea);
    animated.push((t) => { normal.offset.set(t * 0.004, t * 0.0025); });
  }

  // -------------------------------------------------------------- roads
  {
    const asphalt = track(new THREE.MeshStandardMaterial({ color: 0x3a3d43, roughness: 0.9 }));
    asphalt.name = 'ValleyAsphalt';
    const shoulder = track(new THREE.MeshStandardMaterial({ color: 0x8a8471, roughness: 0.95 }));
    const white = track(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const tarmac: THREE.BufferGeometry[] = [], verge: THREE.BufferGeometry[] = [], lines: THREE.BufferGeometry[] = [];
    roads.forEach((road) => {
      const hw = road.spec.width / 2;
      const s = road.samples;
      tarmac.push(ribbon(s, road.closed, -hw, hw, 0.12));
      verge.push(ribbon(s, road.closed, -hw - 1.6, -hw, 0.06), ribbon(s, road.closed, hw, hw + 1.6, 0.06));
      lines.push(ribbon(s, road.closed, -hw + 0.45, -hw + 0.7, 0.14), ribbon(s, road.closed, hw - 0.7, hw - 0.45, 0.14));
      lines.push(ribbon(s, road.closed, -0.13, 0.13, 0.14, (i) => Math.floor((i * road.step) / 4) % 2 === 0));
    });
    const add = (list: THREE.BufferGeometry[], mat: THREE.Material, name: string) => {
      const m = new THREE.Mesh(track(mergeGeometries(list)), mat);
      m.name = name;
      m.receiveShadow = true;
      root.add(m);
      list.forEach((g) => g.dispose());
    };
    add(tarmac, asphalt, 'road_asphalt');
    add(verge, shoulder, 'road_shoulder');
    add(lines, white, 'road_lines');
  }

  // -------------------------------------------------------------- bridge (West City landmark)
  {
    const highway = roads.find((r) => r.spec.id === 'highway')!;
    const red = track(new THREE.MeshStandardMaterial({ color: 0xc43b2c, metalness: 0.3, roughness: 0.45 }));
    const deckMat = track(new THREE.MeshStandardMaterial({ color: 0x5b5e63, roughness: 0.8 }));
    const parts: THREE.BufferGeometry[] = [], deck: THREE.BufferGeometry[] = [];
    const deckSamples = highway.samples.filter((s) => s.bridge);
    deckSamples.forEach((s) => deck.push(boxAt(2.6, 1.4, 14, s.p.x, s.p.y - 0.6, s.p.z, Math.atan2(s.t.x, s.t.z) + Math.PI / 2)));
    const at = (x: number) => highway.samples.reduce((a, b) => (Math.abs(b.p.x - x) < Math.abs(a.p.x - x) ? b : a));
    const towersX = [W(-112, 0).x, W(-78, 0).x];
    const towerTop: THREE.Vector3[] = [];
    towersX.forEach((x) => {
      const s = at(x);
      const topY = s.p.y + 32;
      [-7.5, 7.5].forEach((off) => {
        parts.push(boxAt(1.8, topY, 1.8, s.p.x, topY / 2, s.p.z + off));
      });
      [s.p.y + 12, s.p.y + 22, topY - 1].forEach((y) => parts.push(boxAt(1.4, 1.6, 16.6, s.p.x, y, s.p.z)));
      towerTop.push(new THREE.Vector3(s.p.x, topY, s.p.z));
    });
    const a0 = deckSamples[0].p, a1 = deckSamples[deckSamples.length - 1].p;
    [-7.5, 7.5].forEach((off) => {
      // Main cable: abutment - tower - sag - tower - abutment.
      const pts = [
        new THREE.Vector3(a0.x - 6, a0.y + 1, a0.z + off),
        new THREE.Vector3(towerTop[0].x, towerTop[0].y, towerTop[0].z + off),
        new THREE.Vector3((towerTop[0].x + towerTop[1].x) / 2, at(W(-95, 0).x).p.y + 3.2, towerTop[0].z + off),
        new THREE.Vector3(towerTop[1].x, towerTop[1].y, towerTop[1].z + off),
        new THREE.Vector3(a1.x + 6, a1.y + 1, a1.z + off),
      ];
      const cable = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
      parts.push(new THREE.TubeGeometry(cable, 80, 0.35, 6, false));
      // Suspenders every 4 m between the towers.
      for (let x = towerTop[0].x + 3; x < towerTop[1].x - 1; x += 4) {
        const s = at(x);
        let u = 0.25 + ((x - towerTop[0].x) / (towerTop[1].x - towerTop[0].x)) * 0.5;
        const cp = cable.getPointAt(u);
        u = THREE.MathUtils.clamp(u + (x - cp.x) / cable.getLength(), 0, 1);
        const top = cable.getPointAt(u).y;
        const len = Math.max(0.5, top - s.p.y);
        parts.push(boxAt(0.14, len, 0.14, x, s.p.y + len / 2, s.p.z + off));
      }
    });
    const bridge = new THREE.Mesh(track(mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g))), red);
    bridge.name = 'bridge_west';
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    root.add(bridge);
    const deckMesh = new THREE.Mesh(track(mergeGeometries(deck)), deckMat);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    root.add(deckMesh);
  }

  // -------------------------------------------------------------- cities
  const cities = {} as Record<DealerCityKey, DealerCityHandle>;
  const windowTex = windowTextures();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const reserved: { x: number; z: number; r: number }[] = [];
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    let list = buckets.get(m);
    if (!list) buckets.set(m, (list = []));
    list.push(g);
  };
  const isReserved = (x: number, z: number, r: number) => reserved.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r);
  const ctx: LandmarkContext = {
    groundY,
    put,
    add: (o) => {
      o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      root.add(o);
    },
    animate: (fn) => { animated.push(fn); },
    night: (mat, day, nightI) => { nightMaterials.push({ mat, day, nightI }); },
    reserve: (x, z, r) => { reserved.push({ x, z, r }); },
    road: (id) => {
      const r = roads.find((q) => q.spec.id === id)!;
      return { samples: r.samples, width: r.spec.width };
    },
    clear: (x, z, margin) => clearOfRoads(x, z, margin),
    free: (x, z, r) => !isReserved(x, z, r),
    at: Wxz,
    track,
  };

  /** A window-textured facade material that lights up at night. */
  const facade = (color: number, glow: number, metalness = 0.1, roughness = 0.6, nightI = 1.5) => {
    const m = track(new THREE.MeshStandardMaterial({
      color, map: windowTex.map, emissive: glow, emissiveMap: windowTex.lit, emissiveIntensity: 0, metalness, roughness,
    }));
    nightMaterials.push({ mat: m, day: 0, nightI });
    return m;
  };
  const plain = (color: number, roughness = 0.7, extra: THREE.MeshStandardMaterialParameters = {}) =>
    track(new THREE.MeshStandardMaterial({ color, roughness, ...extra }));

  const F = {
    westStone: facade(0xd9ccb2, 0xfff0d0, 0.05, 0.7),
    westGlass: facade(0x86a9c4, 0xd8f0ff, 0.4, 0.25),
    northPastels: [facade(0xeadfc6, 0xffe6b8), facade(0xe6cf92, 0xffe6b8), facade(0xd9a898, 0xffe0c8), facade(0xb8c8b2, 0xfff0d0)],
    northRoofs: [plain(0xa8503a, 0.7), plain(0x4b5563, 0.6), plain(0x5f9e8f, 0.55)],
    eastDark: [facade(0x5a5462, 0xffd0de, 0.15, 0.5, 1.8), facade(0x434d5b, 0xcfe8ff, 0.15, 0.5, 1.8), facade(0x777180, 0xffe0b0, 0.15, 0.5, 1.8)],
    southGlass: [facade(0x92b6c8, 0xd8f4ff, 0.45, 0.2), facade(0xd0dbe2, 0xfff4dc, 0.35, 0.25)],
    crown: plain(0xc9d2da, 0.3, { metalness: 0.6 }),
    rooftop: plain(0x8b8f96, 0.8),
  };
  const buildingSpots: Record<DealerCityKey, { x: number; z: number; w: number; d: number; h: number; y: number; rot: number }[]> = {
    west: [], north: [], east: [], south: [],
  };

  // The home village at the centre, then the landmarks: both claim their
  // ground before the city blocks are laid out.
  const village = buildVillage(ctx, HUB.x, HUB.y);
  buildWestLandmarks(ctx, CITY_SPOTS.west.x, CITY_SPOTS.west.y, F.westStone, F.westGlass);
  buildNorthLandmarks(ctx, CITY_SPOTS.north.x, CITY_SPOTS.north.y);
  buildEastLandmarks(ctx, CITY_SPOTS.east.x, CITY_SPOTS.east.y);
  buildSouthLandmarks(ctx, CITY_SPOTS.south.x, CITY_SPOTS.south.y, F.southGlass[0]);

  CITY_KEYS.forEach((key) => {
    const style = CITY_STYLES[key];
    const spot = CITY_SPOTS[key];
    const base = cityBase[key];
    const random = makeRandom(style.seed);
    const accent = DEALER_CITY_COLORS[key];
    const centre = new THREE.Vector3(spot.x, base, spot.y);
    const pav = new THREE.Vector3(spot.x + style.pavilion[0], groundY(spot.x + style.pavilion[0], spot.y + style.pavilion[1]), spot.y + style.pavilion[1]);
    reserved.push({ x: pav.x, z: pav.z, r: 15 });

    // Blocks: rejection-sampled lots, taller toward the centre, in the city's style.
    const lots = buildingSpots[key];
    for (let attempt = 0; attempt < style.count * 90 && lots.length < style.count; attempt++) {
      const r = 10 + Math.sqrt(random()) * (style.radius - 10);
      const a = random() * Math.PI * 2;
      const x = spot.x + Math.cos(a) * r, z = spot.y + Math.sin(a) * r;
      const w = style.minF + random() * (style.maxF - style.minF);
      const d = style.minF + random() * (style.maxF - style.minF);
      const half = Math.max(w, d) * 0.72;
      if (!clearOfRoads(x, z, half + 2.2)) continue;
      if (coastDistance(x, z) < half + 3) continue;
      if (isReserved(x, z, half)) continue;
      if (lots.some((l) => Math.hypot(l.x - x, l.z - z) < (Math.max(l.w, l.d) + Math.max(w, d)) * 0.5 + 1.4)) continue;
      const centreBias = 1 - (r - 10) / (style.radius - 10);
      let h = style.minH + (style.maxH - style.minH) * Math.pow(random(), 1.5) * (0.4 + 0.6 * centreBias);
      const y = groundY(x, z) - 0.6;
      // Face the centre (old towns and grids line up with their streets).
      const rot = Math.atan2(spot.x - x, spot.y - z) + (random() - 0.5) * 0.2;
      const uo = random(), vo = random();

      if (style.arch === 'deco') {
        const mat = random() < 0.62 ? F.westStone : F.westGlass;
        put(mat, norm(buildingBox(w, h + 0.6, d, x, y, z, rot, uo, vo)));
        if (h > 34) {
          const h2 = h * 0.28;
          put(mat, norm(buildingBox(w * 0.72, h2, d * 0.72, x, y + h + 0.6, z, rot, uo, vo)));
          put(mat, norm(buildingBox(w * 0.46, h2 * 0.6, d * 0.46, x, y + h + 0.6 + h2, z, rot, uo, vo)));
          h += h2 * 1.6;
          if (random() < 0.5) put(F.crown, pyramid(w * 0.3, 5, x, y + h + 0.6, z, rot));
        } else if (random() < 0.7) {
          put(F.rooftop, lmBox(w * 0.4, 2.2, d * 0.35, x, y + h + 0.6, z, rot));
        }
      } else if (style.arch === 'gable') {
        h = Math.min(h, 22);
        put(F.northPastels[Math.floor(random() * 4)], norm(buildingBox(w, h + 0.6, d, x, y, z, rot, uo, vo)));
        put(F.northRoofs[Math.floor(random() * 3)], gableRoof(w, d, Math.min(w, d) * 0.5, x, y + h + 0.6, z, rot, 0.35));
      } else if (style.arch === 'dense') {
        put(F.eastDark[Math.floor(random() * 3)], norm(buildingBox(w, h + 0.6, d, x, y, z, rot, uo, vo)));
        if (h > 10 && random() < 0.75) put(F.rooftop, lmBox(w * 0.45, 2.4, d * 0.4, x, y + h + 0.6, z, rot));
        if (h > 30 && random() < 0.5) put(F.crown, lmBox(0.4, 8, 0.4, x, y + h + 0.6, z));
      } else {
        // Glass supertalls with podiums; low blocks near the edge.
        const mat = F.southGlass[random() < 0.6 ? 0 : 1];
        if (h > 45) {
          put(mat, norm(buildingBox(w * 1.4, 8, d * 1.4, x, y, z, rot, uo, vo)));
          put(mat, norm(buildingBox(w * 0.85, h, d * 0.85, x, y + 8, z, rot, uo, vo)));
          put(F.crown, pyramid(w * 0.6, 6 + random() * 6, x, y + h + 8, z, rot));
          h += 8;
        } else {
          put(mat, norm(buildingBox(w, h + 0.6, d, x, y, z, rot, uo, vo)));
        }
      }
      lots.push({ x, z, w, d, h, y, rot });
    }

    // Dealer pavilion: glass hall, roof slab, lit pylon, facing the centre.
    const glass = track(new THREE.MeshStandardMaterial({ color: 0x9fb6c3, metalness: 0.25, roughness: 0.12, emissive: accent, emissiveIntensity: 0.05 }));
    nightMaterials.push({ mat: glass, day: 0.05, nightI: 0.35 });
    const white = track(new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.6 }));
    const accentMat = track(new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6, roughness: 0.4 }));
    nightMaterials.push({ mat: accentMat, day: 0.6, nightI: 2.2 });
    const pavilion = new THREE.Group();
    pavilion.position.copy(pav);
    pavilion.rotation.y = Math.atan2(spot.x - pav.x, spot.y - pav.z) + Math.PI;
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(22, 7, 14)), glass);
    body.position.y = 3.5;
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(25, 0.8, 17)), white);
    roof.position.y = 7.4;
    const band = new THREE.Mesh(track(new THREE.BoxGeometry(25.2, 0.3, 17.2)), accentMat);
    band.position.y = 6.9;
    const pylon = new THREE.Mesh(track(new THREE.BoxGeometry(3.4, 20, 1.2)), white);
    pylon.position.set(14, 10, 0);
    const pylonGlow = new THREE.Mesh(track(new THREE.BoxGeometry(3.6, 3.2, 1.4)), accentMat);
    pylonGlow.position.set(14, 17.5, 0);
    [body, roof, band, pylon, pylonGlow].forEach((m) => { m.castShadow = true; m.receiveShadow = true; pavilion.add(m); });
    // Regional touches on the forecourt.
    if (key === 'west') {
      const flagTex = track(usFlagTexture());
      const flagMat = track(new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }));
      [-9, -4.5, 0].forEach((fx) => {
        const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.12, 12, 6)), white);
        pole.position.set(fx, 6, 10);
        const flag = new THREE.Mesh(track(new THREE.PlaneGeometry(3.8, 2)), flagMat);
        flag.position.set(fx + 1.95, 10.8, 10);
        pavilion.add(pole, flag);
      });
    } else if (key === 'east' || key === 'south') {
      const roofMat = track(new THREE.MeshStandardMaterial({ color: key === 'east' ? 0x363c44 : 0xd4a017, roughness: 0.6, side: THREE.DoubleSide }));
      const eave = new THREE.Mesh(track(curvedRoof(28, 20, 2.4, 1.2, 0, 0, 0)), roofMat);
      eave.position.y = 7.9;
      eave.castShadow = true;
      pavilion.add(eave);
    } else {
      const roofMat = track(new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.6 }));
      const gable = new THREE.Mesh(track(gableRoof(25, 17, 5, 0, 0, 0, 0, 0.2)), roofMat);
      gable.position.y = 7.8;
      gable.castShadow = true;
      pavilion.add(gable);
    }
    root.add(pavilion);

    // Hover: a ring of light round the district and a beacon over the showroom.
    const ringMat = track(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }));
    const ringGeo = new THREE.RingGeometry(style.radius + 5, style.radius + 6.4, 128);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(track(ringGeo), ringMat);
    ring.position.set(spot.x, base + 0.9, spot.y);
    ring.renderOrder = 2;
    root.add(ring);
    const beamMat = track(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(2.4, 5.5, 110, 24, 1, true)), beamMat);
    beam.position.set(pav.x, pav.y + 62, pav.z);
    root.add(beam);
    const hit = new THREE.Mesh(track(new THREE.CylinderGeometry(style.radius + 6, style.radius + 6, 120, 16)), track(new THREE.MeshBasicMaterial({ visible: false })));
    hit.position.set(spot.x, base + 50, spot.y);
    hit.name = `hit_${key}`;
    root.add(hit);
    let level = 0, target = 0;
    animated.push((t, dt) => {
      level += (target - level) * Math.min(1, dt * 6);
      ringMat.opacity = 0.18 + level * 0.62 + Math.sin(t * 2 + spot.x) * 0.04;
      beamMat.opacity = level * 0.22;
      beam.visible = level > 0.01;
    });
    cities[key] = { centre, hit, setHighlight: (l) => { target = l; } };
  });

  // Neon signs on East City's tallest blocks.
  {
    const lots = [...buildingSpots.east].sort((a, b) => b.h - a.h).slice(0, 16);
    const neonColors = [0xff2a7a, 0x22d3ee, 0xa855f7, 0xffb020];
    const neonMats = neonColors.map((color) => {
      const mat = track(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.4 }));
      nightMaterials.push({ mat, day: 0.4, nightI: 2.6 });
      return mat;
    });
    const random = makeRandom(71);
    lots.forEach((l, i) => {
      const face = Math.floor(random() * 4);
      const ang = l.rot + face * (Math.PI / 2);
      const off = (face % 2 === 0 ? l.d : l.w) / 2 + 0.25;
      const sh = Math.min(14, l.h * 0.45);
      put(neonMats[i % neonMats.length], lmBox(2.2, sh, 0.3, l.x + Math.sin(ang) * off, l.y + l.h * 0.55 - sh / 2, l.z + Math.cos(ang) * off, ang));
    });
  }

  flushBuckets(buckets, root);

  // -------------------------------------------------------------- South City: lighthouse, palms
  const lighthouseBeam = new THREE.Group();
  {
    const [x, z] = Wxz(100, 112);
    const y = groundY(x, z);
    const white = track(new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 }));
    const red = track(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 }));
    const lampMat = track(new THREE.MeshStandardMaterial({ color: 0xfff3c0, emissive: 0xffe39a, emissiveIntensity: 0.2 }));
    nightMaterials.push({ mat: lampMat, day: 0.2, nightI: 3.2 });
    const tower = new THREE.Group();
    tower.position.set(x, y, z);
    const shaft = new THREE.Mesh(track(new THREE.CylinderGeometry(1.7, 2.5, 22, 20)), white);
    shaft.position.y = 11;
    tower.add(shaft);
    [5, 12, 18.5].forEach((h) => {
      const bandMesh = new THREE.Mesh(track(new THREE.CylinderGeometry(2.3 - h * 0.035, 2.35 - h * 0.035, 2.2, 20)), red);
      bandMesh.position.y = h;
      tower.add(bandMesh);
    });
    const lamp = new THREE.Mesh(track(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 16)), lampMat);
    lamp.position.y = 23.2;
    const cap = new THREE.Mesh(track(new THREE.ConeGeometry(2.1, 2.2, 16)), red);
    cap.position.y = 25.5;
    tower.add(lamp, cap);
    tower.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(tower);
    const beamMat = track(new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const cone = new THREE.ConeGeometry(7, 70, 20, 1, true);
    cone.translate(0, -35, 0);
    cone.rotateZ(Math.PI / 2);
    const beamGeo = track(cone);
    const b1 = new THREE.Mesh(beamGeo, beamMat);
    const b2 = new THREE.Mesh(beamGeo, beamMat);
    b2.rotation.y = Math.PI;
    lighthouseBeam.add(b1, b2);
    lighthouseBeam.position.set(x, y + 23.2, z);
    root.add(lighthouseBeam);
    nightOnly.push(lighthouseBeam);
    animated.push((t) => { lighthouseBeam.rotation.y = t * 0.8; });
  }
  {
    // Palms along the south road, the coast road and round the marina.
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 8, 6);
    trunkGeo.translate(0, 4, 0);
    const fronds: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const f = new THREE.PlaneGeometry(0.9, 4.2, 1, 3);
      const p = f.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) {
        const along = (p.getY(k) + 2.1) / 4.2;
        p.setZ(k, -along * along * 1.4);
      }
      f.translate(0, 2.1, 0);
      f.rotateX(-1.05);
      f.rotateY((i / 7) * Math.PI * 2);
      f.translate(0, 8, 0);
      fronds.push(f);
    }
    const crownGeo = mergeGeometries(fronds);
    const spots: THREE.Vector3[] = [];
    ['south', 'coast'].forEach((id) => {
      const road = roads.find((r) => r.spec.id === id)!;
      for (let i = 4; i < road.samples.length; i += 7) {
        const s = road.samples[i];
        const side = (i / 7) % 2 < 1 ? 1 : -1;
        const p = s.p.clone().addScaledVector(s.n, side * (road.spec.width / 2 + 3));
        if (coastDistance(p.x, p.z) > 2 && clearOfRoads(p.x, p.z, 1.5)) spots.push(p.setY(groundY(p.x, p.z)));
      }
    });
    const trunks = new THREE.InstancedMesh(track(trunkGeo), track(new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 })), spots.length);
    const crowns = new THREE.InstancedMesh(track(crownGeo), track(new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.7, side: THREE.DoubleSide })), spots.length);
    const random = makeRandom(5);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    spots.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler((random() - 0.5) * 0.12, random() * Math.PI * 2, (random() - 0.5) * 0.12));
      sc.setScalar(0.85 + random() * 0.4);
      m4.compose(p, q, sc);
      trunks.setMatrixAt(i, m4);
      crowns.setMatrixAt(i, m4);
    });
    [trunks, crowns].forEach((m) => { m.castShadow = true; root.add(m); });
  }

  // -------------------------------------------------------------- boats (marina, harbour, bay)
  {
    const hull = new THREE.BoxGeometry(2.4, 1, 7);
    const hp = hull.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < hp.count; i++) if (hp.getZ(i) < 0) hp.setX(i, hp.getX(i) * 0.35);   // pointed bow
    hull.computeVertexNormals();
    const mast = new THREE.CylinderGeometry(0.06, 0.08, 7, 5);
    mast.translate(0, 4, 0.8);
    const cabin = new THREE.BoxGeometry(1.6, 0.9, 2.4);
    cabin.translate(0, 0.9, 1.2);
    const boatGeo = track(mergeGeometries([hull.toNonIndexed(), mast.toNonIndexed(), cabin.toNonIndexed()]));
    const spots: { x: number; z: number; rot: number; phase: number }[] = [];
    const random = makeRandom(31);
    const tryAdd = (cx: number, cz: number, rx: number, rz: number, count: number) => {
      for (let k = 0; k < count * 12 && spots.length < 200; k++) {
        const x = cx + (random() - 0.5) * rx * 2, z = cz + (random() - 0.5) * rz * 2;
        if (coastDistance(x, z) > -3) continue;
        if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 7)) continue;
        spots.push({ x, z, rot: random() * Math.PI * 2, phase: random() * 6 });
        if (--count <= 0) break;
      }
    };
    tryAdd(...Wxz(58, 128), 24 * K, 14 * K, 18);
    tryAdd(...Wxz(160, -18), 26 * K, 18 * K, 12);
    tryAdd(...Wxz(-95, 75), 26 * K, 40 * K, 14);
    const boats = new THREE.InstancedMesh(boatGeo, track(new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 })), spots.length);
    boats.castShadow = true;
    root.add(boats);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    animated.push((t) => {
      spots.forEach((s, i) => {
        e.set(Math.sin(t * 1.1 + s.phase) * 0.04, s.rot, Math.sin(t * 0.9 + s.phase) * 0.06);
        q.setFromEuler(e);
        v.set(s.x, 0.25 + Math.sin(t * 1.3 + s.phase) * 0.12, s.z);
        m4.compose(v, q, one);
        boats.setMatrixAt(i, m4);
      });
      boats.instanceMatrix.needsUpdate = true;
    });
  }

  // -------------------------------------------------------------- hub monument
  {
    const y = rawHeight(HUB.x, HUB.y);
    const island = new THREE.Mesh(track(new THREE.CylinderGeometry(HUB_RADIUS - 5.5, HUB_RADIUS - 5.2, 0.6, 48)), track(new THREE.MeshStandardMaterial({ color: 0x4f8a3c, roughness: 0.9 })));
    island.position.set(HUB.x, groundY(HUB.x, HUB.y) + 0.2, HUB.y);
    island.receiveShadow = true;
    root.add(island);
    // A small beacon for each city, on the side that faces it.
    CITY_KEYS.forEach((key) => {
      const dir = new THREE.Vector2(CITY_SPOTS[key].x - HUB.x, CITY_SPOTS[key].y - HUB.y).normalize();
      const mat = track(new THREE.MeshStandardMaterial({ color: DEALER_CITY_COLORS[key], emissive: DEALER_CITY_COLORS[key], emissiveIntensity: 0.8 }));
      nightMaterials.push({ mat, day: 0.8, nightI: 2.6 });
      // Little signposts at the edge of the green, one per city, facing it.
      const b = new THREE.Mesh(track(new THREE.BoxGeometry(0.4, 2.2, 0.4)), mat);
      b.position.set(HUB.x + dir.x * 7.2, y + 1.3, HUB.y + dir.y * 7.2);
      root.add(b);
    });
  }

  // -------------------------------------------------------------- trees
  {
    const random = makeRandom(77);
    const pines: THREE.Matrix4[] = [], rounds: THREE.Matrix4[] = [];
    const pineCol: THREE.Color[] = [], roundCol: THREE.Color[] = [];
    const q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < 14000 && pines.length + rounds.length < 3400; i++) {
      const [x, z] = Wxz(-340 + random() * 530, -260 + random() * 400);
      const land = coastDistance(x, z);
      if (land < 5) continue;
      if (fbm(x * 0.02 + 3, z * 0.02 + 8) < -0.05) continue;
      if (!clearOfRoads(x, z, 5)) continue;
      if (CITY_KEYS.some((k) => Math.hypot(x - CITY_SPOTS[k].x, z - CITY_SPOTS[k].y) < CITY_STYLES[k].radius + 8)) continue;
      if (isReserved(x, z, 3)) continue;
      if (Math.hypot(x - HUB.x, z - HUB.y) < VILLAGE_RADIUS) continue;
      const h = groundY(x, z);
      if (h > 46) continue;
      if (h > 16 && Math.hypot(x - VOLCANO.x, z - VOLCANO.y) < 125 * K) continue;   // keep the volcano's cone bare
      const pine = h > 9 || random() < 0.25;
      const s = 0.8 + random() * 0.7;
      q.setFromEuler(new THREE.Euler(0, random() * Math.PI * 2, 0));
      sc.set(s, s * (0.9 + random() * 0.3), s);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.2, z), q, sc);
      const tint = 0.85 + random() * 0.3;
      if (pine) { pines.push(m); pineCol.push(colorOf(0x2f5a35).multiplyScalar(tint)); } else { rounds.push(m); roundCol.push(colorOf(0x4e8a3a).multiplyScalar(tint)); }
    }
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 3, 5);
    trunkGeo.translate(0, 1.5, 0);
    const pineGeo = new THREE.ConeGeometry(2.4, 7.5, 7);
    pineGeo.translate(0, 6, 0);
    const roundGeo = new THREE.IcosahedronGeometry(2.8, 0);
    roundGeo.translate(0, 5, 0);
    const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.9 }));
    const leafMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }));
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], cols?: THREE.Color[]) => {
      const inst = new THREE.InstancedMesh(track(geo), mat, ms.length);
      ms.forEach((m, i) => { inst.setMatrixAt(i, m); if (cols) inst.setColorAt(i, cols[i]); });
      inst.castShadow = true;
      inst.receiveShadow = true;
      root.add(inst);
    };
    add(trunkGeo, trunkMat, [...pines, ...rounds]);
    add(pineGeo, leafMat, pines, pineCol);
    add(roundGeo, leafMat, rounds, roundCol);
  }

  // -------------------------------------------------------------- street lamps
  {
    const spots: { p: THREE.Vector3; yaw: number }[] = [];
    roads.forEach((road) => {
      if (road.spec.id === 'ring') return;
      const every = Math.max(1, Math.round(30 / road.step));
      road.samples.forEach((s, i) => {
        if (i % every !== 0 || s.bridge) return;
        const side = (i / every) % 2 === 0 ? 1 : -1;
        const p = s.p.clone().addScaledVector(s.n, side * (road.spec.width / 2 + 1.1));
        spots.push({ p, yaw: Math.atan2(-s.n.x * side, -s.n.z * side) });
      });
    });
    const pole = new THREE.CylinderGeometry(0.1, 0.14, 7, 6);
    pole.translate(0, 3.5, 0);
    const arm = new THREE.BoxGeometry(0.12, 0.12, 1.8);
    arm.translate(0, 7, 0.9);
    const poleGeo = track(mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed()]));
    const headGeo = track(new THREE.BoxGeometry(0.5, 0.18, 0.9));
    headGeo.translate(0, 6.9, 1.7);
    const poles = new THREE.InstancedMesh(poleGeo, track(new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.4 })), spots.length);
    const headMat = track(new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffd9a0, emissiveIntensity: 0 }));
    nightMaterials.push({ mat: headMat, day: 0, nightI: 3 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    spots.forEach((s, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      m4.compose(s.p, q, one);
      poles.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
    });
    poles.castShadow = true;
    root.add(poles, heads);
  }

  // -------------------------------------------------------------- traffic
  {
    interface Car { road: Road; s: number; speed: number; dir: 1 | -1; lane: number }
    const random = makeRandom(13);
    const carsList: Car[] = [];
    roads.forEach((road) => {
      const count = Math.max(2, Math.round(road.length / 55));
      for (let i = 0; i < count; i++) {
        const dir = (i % 2 === 0 ? 1 : -1) as 1 | -1;
        carsList.push({ road, s: random() * road.length, speed: 9 + random() * 6, dir, lane: road.spec.width * 0.22 });
      }
    });
    const body = new THREE.BoxGeometry(1.9, 1.1, 4.4);
    body.translate(0, 0.75, 0);
    const top = new THREE.BoxGeometry(1.7, 0.8, 2.3);
    top.translate(0, 1.65, -0.3);
    const carGeo = track(mergeGeometries([body.toNonIndexed(), top.toNonIndexed()]));
    const cars = new THREE.InstancedMesh(carGeo, track(new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 })), carsList.length);
    const palette = [0xe8e8e8, 0x1c1c1f, 0xc0392b, 0x2e86c1, 0x7f8c8d, 0xf1c40f, 0x16a085, 0xd35400];
    carsList.forEach((_, i) => cars.setColorAt(i, colorOf(palette[Math.floor(random() * palette.length)])));
    cars.castShadow = true;
    root.add(cars);
    const lightGeo = new THREE.BoxGeometry(1.6, 0.22, 0.1);
    const front = lightGeo.clone(); front.translate(0, 0.85, 2.22);
    const back = lightGeo.clone(); back.translate(0, 0.85, -2.22);
    const headlights = new THREE.InstancedMesh(track(front), track(new THREE.MeshBasicMaterial({ color: 0xfff4d6, toneMapped: false })), carsList.length);
    const taillights = new THREE.InstancedMesh(track(back), track(new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false })), carsList.length);
    root.add(headlights, taillights);
    nightOnly.push(headlights, taillights);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    animated.push((_t, dt) => {
      carsList.forEach((car, i) => {
        const road = car.road;
        car.s += car.speed * dt * car.dir;
        if (road.closed) car.s = ((car.s % road.length) + road.length) % road.length;
        else if (car.s > road.length - 2 || car.s < 2) { car.dir = (car.dir * -1) as 1 | -1; car.s = THREE.MathUtils.clamp(car.s, 2, road.length - 2); }
        const f = car.s / road.step;
        const i0 = Math.floor(f) % road.samples.length;
        const i1 = road.closed ? (i0 + 1) % road.samples.length : Math.min(road.samples.length - 1, i0 + 1);
        const a = road.samples[i0], b = road.samples[i1];
        const k = f - Math.floor(f);
        v.lerpVectors(a.p, b.p, k).addScaledVector(a.n, car.lane * car.dir);
        v.y += 0.12;
        q.setFromAxisAngle(up, Math.atan2(a.t.x * car.dir, a.t.z * car.dir));
        m4.compose(v, q, one);
        cars.setMatrixAt(i, m4);
        headlights.setMatrixAt(i, m4);
        taillights.setMatrixAt(i, m4);
      });
      cars.instanceMatrix.needsUpdate = true;
      headlights.instanceMatrix.needsUpdate = true;
      taillights.instanceMatrix.needsUpdate = true;
    });
  }

  // -------------------------------------------------------------- clouds
  {
    const random = makeRandom(97);
    const puffs: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const g = new THREE.IcosahedronGeometry(6 + random() * 5, 1);
      g.scale(1.4, 0.6, 1);
      g.translate((random() - 0.5) * 22, (random() - 0.5) * 3, (random() - 0.5) * 10);
      puffs.push(g.toNonIndexed());
    }
    const cloudGeo = track(mergeGeometries(puffs));
    const cloudMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 }));
    const clouds: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(cloudGeo, cloudMat);
      c.position.set(-500 + random() * 860, 120 + random() * 40, -440 + random() * 200);
      c.rotation.y = random() * Math.PI;
      c.scale.setScalar(0.8 + random() * 0.8);
      c.castShadow = true;
      root.add(c);
      clouds.push(c);
    }
    animated.push((_t, dt) => clouds.forEach((c) => { c.position.x += dt * 2.2; if (c.position.x > 420) c.position.x = -560; }));
  }

  // -------------------------------------------------------------- highway entry and sign
  const highway = roads.find((r) => r.spec.id === 'highway')!;
  const gateSample = highway.samples.reduce((a, b) => (Math.hypot(b.p.x - ENTRY_XZ.x, b.p.z - ENTRY_XZ.y) < Math.hypot(a.p.x - ENTRY_XZ.x, a.p.z - ENTRY_XZ.y) ? b : a));
  const gatePos = new THREE.Vector3(gateSample.p.x, gateSample.p.y + 0.12, gateSample.p.z);
  const gateForward = gateSample.t.clone();
  {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 320;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#0e5a3a';
    g.fillRect(0, 0, 1024, 320);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.strokeRect(14, 14, 996, 292);
    g.fillStyle = '#ffffff';
    g.font = '700 96px "Segoe UI", Arial, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('◀  CAREER RESORT', 60, 118);
    g.font = '500 56px "Segoe UI", Arial, sans-serif';
    g.fillText('DEALER DISTRICT  ▶', 60, 228);
    const tex = track(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Group();
    const panel = new THREE.Mesh(track(new THREE.PlaneGeometry(9, 2.8)), track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })));
    panel.position.y = 5.2;
    const back = new THREE.Mesh(track(new THREE.BoxGeometry(9.2, 3, 0.2)), track(new THREE.MeshStandardMaterial({ color: 0x2d3136 })));
    back.position.set(0, 5.2, -0.12);
    const postMat = track(new THREE.MeshStandardMaterial({ color: 0x5c6066, metalness: 0.5, roughness: 0.4 }));
    [-3.5, 3.5].forEach((x) => { const p = new THREE.Mesh(track(new THREE.BoxGeometry(0.25, 6.6, 0.25)), postMat); p.position.set(x, 3.3, -0.2); sign.add(p); });
    sign.add(panel, back);
    const at = gatePos.clone().addScaledVector(gateForward, 26).addScaledVector(gateSample.n, highway.spec.width / 2 + 4.5);
    sign.position.set(at.x, groundY(at.x, at.z), at.z);
    // Faces traffic coming out of the pass.
    sign.rotation.y = Math.atan2(-gateForward.x, -gateForward.z);
    sign.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    root.add(sign);
  }

  const focus = new THREE.Vector3(W(-36, 12).x, 0, 12);

  // Home: a warm ring and beacon on hover, like the cities.
  const home: DealerCityHandle = (() => {
    const colour = 0xffb45c;
    const { home: at, homeRadius } = village;
    const ringMat = track(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    const ringGeo = new THREE.RingGeometry(homeRadius, homeRadius + 1.1, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(track(ringGeo), ringMat);
    ring.position.set(at.x, at.y + 0.5, at.z);
    ring.renderOrder = 2;
    root.add(ring);
    const beamMat = track(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(1.2, 3, 60, 20, 1, true)), beamMat);
    beam.position.set(at.x, at.y + 34, at.z);
    root.add(beam);
    const hit = new THREE.Mesh(track(new THREE.CylinderGeometry(homeRadius, homeRadius, 30, 12)), track(new THREE.MeshBasicMaterial({ visible: false })));
    hit.position.set(at.x, at.y + 12, at.z);
    hit.name = 'hit_home';
    root.add(hit);
    let level = 0, target = 0;
    animated.push((t, dt) => {
      level += (target - level) * Math.min(1, dt * 6);
      ringMat.opacity = level * 0.8;
      beamMat.opacity = level * 0.25;
      ring.visible = beam.visible = level > 0.01;
    });
    return { centre: at.clone(), hit, setHighlight: (l: number) => { target = l; } };
  })();

  return {
    root,
    cities,
    entry: { position: gatePos, forward: gateForward },
    home,
    focus,
    update(elapsed, delta) {
      night += (nightTarget - night) * Math.min(1, delta * 1.5);
      nightMaterials.forEach(({ mat, day, nightI }) => { mat.emissiveIntensity = day + (nightI - day) * night; });
      nightOnly.forEach((o) => { o.visible = night > 0.5; });
      animated.forEach((fn) => fn(elapsed, delta));
    },
    setLampsOn(on) { nightTarget = on ? 1 : 0; },
    dispose() {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          const std = m as THREE.MeshStandardMaterial;
          std.map?.dispose();
          std.emissiveMap?.dispose();
          std.normalMap?.dispose();
          m.dispose();
        });
      });
      disposables.forEach((d) => d.dispose());
      root.removeFromParent();
    },
  };
};
