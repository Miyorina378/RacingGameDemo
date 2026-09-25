import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ============================================================================
   Landmarks of the Dealer District, one set per region:

     West  (American cars)  Art Deco towers, a football stadium, an EV plant,
                            a water tower, highway billboards, a hillside sign
     North (European cars)  gothic cathedral, clock tower, iron lattice tower,
                            a castle on the ridge, windmills
     East  (Japanese cars)  five-storey pagoda, a castle keep, a red-and-white
                            lattice tower, a torii standing in the harbour,
                            cherry trees, a container port
     South (Chinese and     a pearl tower, a tapered supertall, a paifang gate
            Korean cars)    over the main road, a temple hall, hanok houses,
                            a lantern street

   Every piece is built from primitives. Static parts go into per-material
   buckets that DealerWorld merges into one mesh each; moving parts (windmill
   sails) are separate objects.
   ========================================================================== */

export interface RoadSampleLike { p: THREE.Vector3; t: THREE.Vector3; n: THREE.Vector3 }

export interface LandmarkContext {
  groundY(x: number, z: number): number;
  /** Adds static geometry to the merged mesh of that material. */
  put(material: THREE.Material, geometry: THREE.BufferGeometry): void;
  add(object: THREE.Object3D): void;
  animate(fn: (t: number, dt: number) => void): void;
  /** Emissive strength follows the clock: `day` by day, `nightI` at night. */
  night(material: THREE.MeshStandardMaterial, day: number, nightI: number): void;
  /** Keeps random buildings and trees out of a circle. */
  reserve(x: number, z: number, r: number): void;
  road(id: string): { samples: RoadSampleLike[]; width: number };
  /** True when (x, z) is at least `margin` beyond the edge of every road. */
  clear(x: number, z: number, margin: number): boolean;
  /** True when a circle of radius r at (x, z) touches no reserved ground. */
  free(x: number, z: number, r: number): boolean;
  /** Layout (design) coordinates to world: the map is laid out at a smaller scale and spread out. */
  at(x: number, z: number): [number, number];
  track<T extends { dispose(): void }>(d: T): T;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- geometry

/** Non-indexed with position / normal / uv only, so everything merges. */
export const norm = (g: THREE.BufferGeometry) => {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.getAttribute('position').count * 2), 2));
  Object.keys(out.attributes).forEach((k) => { if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k); });
  return out;
};

export const box = (w: number, h: number, d: number, x: number, yBase: number, z: number, rotY = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, yBase + h / 2, z);
  return norm(g);
};

/** A square bar from a to b. */
export const beam = (a: THREE.Vector3, b: THREE.Vector3, t: number) => {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(t, t, len);
  const m = new THREE.Matrix4().lookAt(a, b, Math.abs(b.y - a.y) > 0.99 * len ? V(1, 0, 0) : V(0, 1, 0));
  g.applyMatrix4(m);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return norm(g);
};

export const cyl = (rTop: number, rBot: number, h: number, x: number, yBase: number, z: number, seg = 16) => {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, yBase + h / 2, z);
  return norm(g);
};

export const pyramid = (w: number, h: number, x: number, yBase: number, z: number, rotY = 0) => {
  const g = new THREE.ConeGeometry(w / Math.SQRT2, h, 4);
  g.rotateY(Math.PI / 4 + rotY);
  g.translate(x, yBase + h / 2, z);
  return norm(g);
};

export const cone = (r: number, h: number, x: number, yBase: number, z: number, seg = 16) => {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(x, yBase + h / 2, z);
  return norm(g);
};

export const sphere = (r: number, x: number, y: number, z: number) => norm(new THREE.SphereGeometry(r, 24, 16).translate(x, y, z));

/** Tapered box: CylinderGeometry with 4 sides, turned square. */
export const frustum = (wTop: number, wBot: number, h: number, x: number, yBase: number, z: number, rotY = 0) => {
  const g = new THREE.CylinderGeometry(wTop / Math.SQRT2, wBot / Math.SQRT2, h, 4);
  g.rotateY(Math.PI / 4 + rotY);
  g.translate(x, yBase + h / 2, z);
  return norm(g);
};

/**
 * East Asian hip roof: concave slopes (steep at the ridge, flat at the eaves)
 * and corners that sweep up. Single sheet - use a double-sided material.
 */
export const curvedRoof = (w: number, d: number, h: number, lift: number, x: number, yBase: number, z: number, rotY = 0) => {
  const N = 14;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const u = (i / N) * 2 - 1, v = (j / N) * 2 - 1;
    const px = (u * w) / 2, pz = (v * d) / 2;
    const m = Math.min(w / 2 - Math.abs(px), d / 2 - Math.abs(pz));
    const t = Math.min(1, m / (Math.min(w, d) / 2));
    const edge = Math.max(Math.abs(u), Math.abs(v));
    const py = h * Math.pow(t, 1.5) + lift * Math.pow(Math.abs(u) * Math.abs(v), 5) + lift * 0.2 * Math.pow(edge, 10);
    pos.push(px, py, pz);
    uv.push(i / N, j / N);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const a = i * (N + 1) + j, b = (i + 1) * (N + 1) + j, c = b + 1, dd = a + 1;
    idx.push(a, dd, b, b, dd, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (rotY) g.rotateY(rotY);
  g.translate(x, yBase, z);
  return norm(g);
};

/** Pitched roof with its ridge along local X; gable ends are closed. */
export const gableRoof = (w: number, d: number, h: number, x: number, yBase: number, z: number, rotY = 0, overhang = 0.5) => {
  const hw = w / 2 + overhang * 0.4, hd = d / 2 + overhang;
  const p = [
    [-hw, 0, -hd], [hw, 0, -hd], [hw, h, 0], [-hw, h, 0],   // north slope
    [-hw, 0, hd], [hw, 0, hd], [hw, h, 0], [-hw, h, 0],     // south slope
  ];
  const tri = (a: number[], b: number[], c: number[], out: number[]) => out.push(...a, ...b, ...c);
  const pos: number[] = [];
  tri(p[0], p[3], p[1], pos); tri(p[1], p[3], p[2], pos);
  tri(p[4], p[5], p[7], pos); tri(p[5], p[6], p[7], pos);
  tri([-hw, 0, -hd], [-hw, 0, hd], [-hw, h, 0], pos);
  tri([hw, 0, hd], [hw, 0, -hd], [hw, h, 0], pos);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  if (rotY) g.rotateY(rotY);
  g.translate(x, yBase, z);
  return norm(g);
};

/**
 * Four-legged lattice tower: legs curving in to the top, X-bracing on every
 * face, a ring at every level. `bandMat(i)` colours level i.
 */
export const latticeTower = (
  ctx: LandmarkContext, x: number, z: number, yBase: number, H: number, base: number, top: number,
  bandMat: (level: number, levels: number) => THREE.Material, decks: number[], deckMat: THREE.Material,
) => {
  const levels = 16;
  const half = (t: number) => top + (base - top) * Math.pow(1 - t, 2.2);
  const corners = (t: number) => {
    const h = half(t);
    return [[-h, -h], [h, -h], [h, h], [-h, h]].map(([dx, dz]) => V(x + dx, yBase + t * H, z + dz));
  };
  for (let i = 0; i < levels; i++) {
    const t0 = i / levels, t1 = (i + 1) / levels;
    const c0 = corners(t0), c1 = corners(t1);
    const mat = bandMat(i, levels);
    const th = THREE.MathUtils.lerp(1.3, 0.35, t0);
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      ctx.put(mat, beam(c0[k], c1[k], th));
      ctx.put(mat, beam(c0[k], c1[k1], th * 0.45));
      ctx.put(mat, beam(c0[k1], c1[k], th * 0.45));
      ctx.put(mat, beam(c1[k], c1[k1], th * 0.55));
    }
  }
  decks.forEach((t) => {
    const w = half(t) * 2 + 3;
    ctx.put(deckMat, box(w, 3.2, w, x, yBase + t * H - 1.6, z));
  });
  ctx.put(deckMat, cyl(0.35, 0.7, H * 0.16, x, yBase + H, z, 8));
  ctx.reserve(x, z, base + 4);
};

// ---------------------------------------------------------------- textures

const canvasTexture = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

// ---------------------------------------------------------------- shared materials

const makeMats = (ctx: LandmarkContext) => {
  const std = (color: number, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    ctx.track(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
  return {
    std,
    roof: (color: number) => std(color, 0.6, 0.1, { side: THREE.DoubleSide }),
    glow: (color: number, day: number, nightI: number) => {
      const m = std(color, 0.4, 0, { emissive: color, emissiveIntensity: day });
      ctx.night(m, day, nightI);
      return m;
    },
  };
};

// ================================================================ WEST

export const buildWestLandmarks = (ctx: LandmarkContext, cx: number, cz: number, facade: THREE.Material, glassFacade: THREE.Material) => {
  const M = makeMats(ctx);
  const steel = M.std(0xb9c2cc, 0.35, 0.7);
  const crownGlow = M.glow(0xfff1c8, 0.15, 1.8);

  // Art Deco skyscraper: stepped setbacks, a sunburst crown and a needle.
  const deco = (x: number, z: number, H: number, w: number, mat: THREE.Material) => {
    const y = ctx.groundY(x, z) - 0.5;
    const tiers = [[w, H * 0.55], [w * 0.78, H * 0.2], [w * 0.58, H * 0.1]];
    let h = y;
    tiers.forEach(([tw, th]) => { ctx.put(mat, box(tw, th, tw, x, h, z)); h += th; });
    for (let k = 0; k < 4; k++) {                    // stacked crown arches
      const cw = w * (0.5 - k * 0.1);
      ctx.put(steel, box(cw, 2.6, cw, x, h, z));
      ctx.put(crownGlow, box(cw * 0.8, 0.5, cw + 0.1, x, h + 1.2, z));
      h += 2.6;
    }
    ctx.put(steel, pyramid(w * 0.12, 6, x, h, z));
    ctx.put(steel, cyl(0.12, 0.45, 18, x, h + 5, z, 6));
    ctx.reserve(x, z, w * 0.8 + 3);
  };
  deco(cx + 24, cz - 34, 86, 18, facade);
  deco(cx + 34, cz - 6, 68, 15, facade);
  deco(cx + 26, cz + 22, 52, 13, glassFacade);

  // Football stadium: oval bowl, green field, four light towers.
  {
    const x = cx - 34, z = cz + 10, y = ctx.groundY(x, z) - 0.2;
    const S = 0.8;
    const bowl = new THREE.LatheGeometry([new THREE.Vector2(19 * S, 1.2), new THREE.Vector2(27 * S, 11), new THREE.Vector2(28.5 * S, 11.4), new THREE.Vector2(28.5 * S, 0)], 64);
    bowl.scale(1.3, 1, 1);
    bowl.translate(x, y, z);
    ctx.put(M.std(0xd7d9dc, 0.7, 0.05, { side: THREE.DoubleSide }), norm(bowl));
    const seats = new THREE.LatheGeometry([new THREE.Vector2(19.3 * S, 1.4), new THREE.Vector2(26.8 * S, 10.6)], 64);
    seats.scale(1.3, 1, 1);
    seats.translate(x, y + 0.15, z);
    ctx.put(M.std(0x2b4f8f, 0.8, 0, { side: THREE.DoubleSide }), norm(seats));
    const field = new THREE.CircleGeometry(19.2 * S, 48);
    field.rotateX(-Math.PI / 2);
    field.scale(1.3, 1, 1);
    field.translate(x, y + 0.3, z);
    ctx.put(M.std(0x3f8a3a, 0.9), norm(field));
    const lines = M.std(0xf2f2f2, 0.8);
    for (let k = -4; k <= 4; k++) ctx.put(lines, box(0.3, 0.05, 16 * S, x + k * 3.6 * S, y + 0.32, z));
    const lamp = M.glow(0xffffff, 0, 2.5);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
      const lx = x + sx * 34 * S, lz = z + sz * 24 * S;
      ctx.put(steel, cyl(0.4, 0.6, 30, lx, y, lz, 8));
      ctx.put(lamp, box(4, 2.4, 0.6, lx, y + 29, lz, Math.atan2(sx, sz)));
    });
    ctx.reserve(x, z, 32);
  }

  // EV plant: long white hall under a roof of solar panels.
  {
    const x = cx - 26, z = cz - 52, y = ctx.groundY(x, z) - 0.3;
    ctx.put(M.std(0xeef0f2, 0.6), box(48, 11, 20, x, y, z));
    const panels = ctx.track(canvasTexture(256, 128, (g) => {
      g.fillStyle = '#1b2d4f'; g.fillRect(0, 0, 256, 128);
      g.strokeStyle = '#8aa4c8'; g.lineWidth = 2;
      for (let i = 0; i <= 256; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); }
      for (let j = 0; j <= 128; j += 16) { g.beginPath(); g.moveTo(0, j); g.lineTo(256, j); g.stroke(); }
    }));
    const roof = new THREE.Mesh(ctx.track(new THREE.BoxGeometry(46, 0.4, 18)), M.std(0xffffff, 0.3, 0.5, { map: panels }));
    roof.position.set(x, y + 11.2, z);
    roof.castShadow = roof.receiveShadow = true;
    ctx.add(roof);
    ctx.reserve(x, z, 27);
  }

  // Water tower on the edge of town.
  {
    const x = cx + 44, z = cz - 24, y = ctx.groundY(x, z);
    const rust = M.std(0x9a6b4f, 0.8, 0.2);
    [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]].forEach(([dx, dz]) => ctx.put(rust, beam(V(x + dx * 1.3, y, z + dz * 1.3), V(x + dx, y + 16, z + dz), 0.5)));
    ctx.put(M.std(0xc9ccd0, 0.5, 0.5), cyl(4.5, 4.5, 6, x, y + 16, z, 20));
    ctx.put(rust, cone(5, 2.5, x, y + 22, z, 20));
    ctx.reserve(x, z, 7);
  }

  // Billboards along the highway into town.
  {
    const hw = ctx.road('highway');
    const ads = [['V8 • TRUCKS • EV', '#c1272d'], ['AMERICAN MUSCLE', '#0d3b66'], ['OPEN ROAD AUTO', '#1f7a4a']];
    let k = 0;
    hw.samples.forEach((s, i) => {
      if (k >= ads.length || i % 14 !== 0 || s.p.x < cx - 55 || s.p.x > cx + 25) return;
      const [text, bg] = ads[k++];
      const tex = ctx.track(canvasTexture(512, 192, (g) => {
        g.fillStyle = bg; g.fillRect(0, 0, 512, 192);
        g.fillStyle = '#ffffff'; g.font = `800 52px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, 256, 96);
      }));
      const p = s.p.clone().addScaledVector(s.n, -(hw.width / 2 + 5));
      const y = ctx.groundY(p.x, p.z);
      ctx.put(steel, cyl(0.35, 0.35, 9, p.x, y, p.z, 8));
      const board = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(10, 3.75)), M.std(0xffffff, 0.6, 0, { map: tex, side: THREE.DoubleSide }));
      board.position.set(p.x, y + 10.5, p.z);
      // Face the road (the board stands on the road's -n side).
      board.rotation.y = Math.atan2(-s.t.z, s.t.x);
      ctx.add(board);
    });
  }

  // Hillside sign on the ridge above the town.
  {
    const x = cx - 52, z = ctx.at(0, -190)[1];
    const y = ctx.groundY(x, z);
    const slope = (ctx.groundY(x, z - 6) - ctx.groundY(x, z + 6)) / 12;
    const tex = ctx.track(canvasTexture(2048, 256, (g) => {
      g.fillStyle = '#ffffff'; g.font = `900 210px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('M O T O R   C I T Y', 1024, 136);
    }));
    const sign = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(80, 10)), M.std(0xffffff, 0.8, 0, { map: tex, transparent: true, alphaTest: 0.4 }));
    sign.position.set(x, y + 3, z);
    sign.rotation.set(-Math.atan(slope), 0, 0, 'YXZ');
    ctx.add(sign);
  }
};

/** Stars-and-stripes flag texture for the West pavilion. */
export const usFlagTexture = () => canvasTexture(380, 200, (g) => {
  for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#b22234'; g.fillRect(0, (i * 200) / 13, 380, 200 / 13 + 1); }
  g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, 152, 108);
  g.fillStyle = '#ffffff';
  for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) {
    g.beginPath(); g.arc(12 + c * 25 + (r % 2 ? 12 : 0), 8 + r * 11.5, 3, 0, Math.PI * 2); g.fill();
  }
});

// ================================================================ NORTH

export const buildNorthLandmarks = (ctx: LandmarkContext, cx: number, cz: number) => {
  const M = makeMats(ctx);
  const stone = M.std(0xcbbd9f, 0.85);
  const slate = M.roof(0x4a4f57);
  const copper = M.roof(0x5f9e8f);
  const rose = M.glow(0x9b3fb5, 0.25, 2);

  // Gothic cathedral: nave, transept, apse, twin spired towers, rose window.
  {
    const x = cx - 24, z = cz - 12, y = ctx.groundY(x, z) - 0.4;
    ctx.put(stone, box(44, 17, 14, x, y, z));
    ctx.put(slate, gableRoof(44, 14, 9, x, y + 17, z));
    ctx.put(stone, box(12, 17, 32, x + 6, y, z));
    ctx.put(slate, gableRoof(32, 12, 9, x + 6, y + 17, z, Math.PI / 2));
    ctx.put(stone, cyl(7, 7, 17, x + 22, y, z, 20));
    ctx.put(slate, cone(7.6, 8, x + 22, y + 17, z, 20));
    [-4.5, 4.5].forEach((dz) => {
      ctx.put(stone, box(8, 36, 8, x - 22, y, z + dz * 1.4));
      ctx.put(stone, pyramid(8.6, 2, x - 22, y + 36, z + dz * 1.4));
      ctx.put(slate, pyramid(7, 18, x - 22, y + 38, z + dz * 1.4));
    });
    const window = new THREE.Mesh(ctx.track(new THREE.CircleGeometry(3.4, 32)), rose);
    window.position.set(x - 22.05, y + 20, z);
    window.rotation.y = -Math.PI / 2;
    ctx.add(window);
    ctx.reserve(x, z, 28);
  }

  // Clock tower with four faces.
  {
    const x = cx + 26, z = cz - 20, y = ctx.groundY(x, z) - 0.3;
    ctx.put(stone, box(7.5, 36, 7.5, x, y, z));
    ctx.put(stone, box(9, 7, 9, x, y + 36, z));
    ctx.put(copper, pyramid(9.4, 14, x, y + 43, z));
    const face = ctx.track(canvasTexture(256, 256, (g) => {
      g.fillStyle = '#f4eedc'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2b2b2b'; g.lineWidth = 10; g.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.lineWidth = i % 3 ? 5 : 10;
        g.beginPath(); g.moveTo(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); g.lineTo(128 + Math.sin(a) * 114, 128 - Math.cos(a) * 114); g.stroke();
      }
      g.lineWidth = 9; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 50, 128 - 30); g.stroke();
      g.lineWidth = 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 10, 128 - 92); g.stroke();
    }));
    const faceMat = M.std(0xffffff, 0.6, 0, { map: face, emissive: 0xfff2d0, emissiveMap: face, emissiveIntensity: 0 });
    ctx.night(faceMat, 0, 0.9);
    for (let k = 0; k < 4; k++) {
      const clock = new THREE.Mesh(ctx.track(new THREE.CircleGeometry(3.2, 32)), faceMat);
      const a = (k * Math.PI) / 2;
      clock.position.set(x + Math.sin(a) * 4.56, y + 39.5, z + Math.cos(a) * 4.56);
      clock.rotation.y = a;
      ctx.add(clock);
    }
    ctx.reserve(x, z, 8);
  }

  // Iron lattice tower over a round plaza.
  {
    const x = cx - 34, z = cz + 24, y = ctx.groundY(x, z) - 0.2;
    const iron = M.std(0x6f5a48, 0.7, 0.5);
    ctx.put(M.std(0xd9d4c8, 0.8), cyl(22, 22, 0.5, x, y, z, 48));
    latticeTower(ctx, x, z, y, 72, 9.5, 1.2, () => iron, [0.28, 0.58, 0.93], M.std(0x4f4238, 0.7, 0.4));
  }

  // Castle on the ridge north of town.
  {
    const x = cx + 42, z = cz - 72, y = ctx.groundY(x, z) - 1;
    const grey = M.std(0x9a9892, 0.9);
    const red = M.roof(0xa3412f);
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2;
      const p0 = V(x + Math.cos(a0) * 17, 0, z + Math.sin(a0) * 17), p1 = V(x + Math.cos(a1) * 17, 0, z + Math.sin(a1) * 17);
      ctx.put(grey, box(p0.distanceTo(p1) + 0.6, 8, 2.4, (p0.x + p1.x) / 2, y, (p0.z + p1.z) / 2, -Math.atan2(p1.z - p0.z, p1.x - p0.x)));
    }
    [0, 1, 2, 3].forEach((k) => {
      const a = (k / 4) * Math.PI * 2 + 0.3;
      const tx = x + Math.cos(a) * 17, tz = z + Math.sin(a) * 17;
      ctx.put(grey, cyl(3.6, 3.9, 14, tx, y, tz, 16));
      ctx.put(red, cone(4.4, 7, tx, y + 14, tz, 16));
    });
    ctx.put(grey, box(12, 22, 12, x, y, z));
    [[-1, -1], [1, 1]].forEach(([sx, sz]) => {
      ctx.put(grey, cyl(2, 2, 6, x + sx * 6, y + 22, z + sz * 6, 12));
      ctx.put(red, cone(2.6, 5, x + sx * 6, y + 28, z + sz * 6, 12));
    });
    ctx.put(red, pyramid(12.6, 7, x, y + 22, z));
    ctx.reserve(x, z, 22);
  }

  // Windmills on the downs west of town; the sails turn.
  const sailMat = M.std(0xf1ede4, 0.8);
  const bodyMat = M.std(0xefe9dc, 0.8);
  const capMat = M.roof(0x5a4a3c);
  [[cx - 96, cz - 6], [cx - 108, cz - 30], [cx - 84, cz - 40]].forEach(([x, z], i) => {
    const y = ctx.groundY(x, z) - 0.3;
    ctx.put(bodyMat, cyl(2.2, 3.4, 15, x, y, z, 12));
    ctx.put(capMat, cone(2.9, 4, x, y + 15, z, 12));
    const hub = new THREE.Group();
    hub.position.set(x, y + 15.5, z + 3);
    const blade = new THREE.BoxGeometry(1.8, 12, 0.2);
    blade.translate(0, 6.4, 0);
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(ctx.track(blade.clone()), sailMat);
      m.rotation.z = (k * Math.PI) / 2;
      m.castShadow = true;
      hub.add(m);
    }
    blade.dispose();
    ctx.add(hub);
    ctx.animate((t) => { hub.rotation.z = t * (0.6 + i * 0.1); });
    ctx.reserve(x, z, 8);
  });
};

// ================================================================ EAST

export const buildEastLandmarks = (ctx: LandmarkContext, cx: number, cz: number) => {
  const M = makeMats(ctx);
  const vermilion = M.std(0xd23a2b, 0.55);
  const darkRoof = M.roof(0x363c44);
  const gold = M.std(0xd4a44a, 0.35, 0.8);
  const white = M.std(0xf1efe8, 0.7);

  // Five-storey pagoda.
  {
    const x = cx - 6, z = cz - 38, y = ctx.groundY(x, z) - 0.2;
    ctx.put(M.std(0x9d9a90, 0.9), box(15, 1.6, 15, x, y, z));
    let h = y + 1.6;
    for (let i = 0; i < 5; i++) {
      const s = 10 - i * 1.35;
      ctx.put(M.std(0x7d2a20, 0.6), box(s, 4.4, s, x, h, z));
      ctx.put(darkRoof, curvedRoof(s + 5.4, s + 5.4, 1.7, 1.5, x, h + 4.2, z));
      h += 5.6;
    }
    ctx.put(gold, cyl(0.25, 0.4, 9, x, h, z, 8));
    for (let k = 0; k < 6; k++) ctx.put(gold, cyl(0.9 - k * 0.08, 0.9 - k * 0.08, 0.25, x, h + 1.5 + k * 1.1, z, 12));
    ctx.reserve(x, z, 12);
  }

  // Castle keep on a stone base.
  {
    const x = cx + 22, z = cz - 24, y = ctx.groundY(x, z) - 0.3;
    ctx.put(M.std(0x8a8780, 0.95), frustum(20, 26, 9, x, y, z));
    const roof = M.roof(0x4a5a58);
    const tiers = [[18, 12, 6], [14, 9.5, 5], [10.5, 7.5, 4.5], [7.5, 5.5, 4]];
    let h = y + 9;
    tiers.forEach(([w, d, th]) => {
      ctx.put(white, box(w, th, d, x, h, z));
      ctx.put(roof, curvedRoof(w + 4.5, d + 4.5, 2.2, 1.3, x, h + th - 0.2, z));
      h += th + 1.6;
    });
    ctx.put(gold, box(0.6, 1.4, 0.6, x - 2.6, h, z));
    ctx.put(gold, box(0.6, 1.4, 0.6, x + 2.6, h, z));
    ctx.reserve(x, z, 15);
  }

  // Red-and-white lattice tower.
  {
    const x = cx - 40, z = cz - 30, y = ctx.groundY(x, z) - 0.2;
    const orange = M.std(0xe8532b, 0.5, 0.2);
    const whiteSteel = M.std(0xf0f0ee, 0.5, 0.2);
    const H = 76;
    latticeTower(ctx, x, z, y, H, 10, 1.6, (i) => (Math.floor(i / 2) % 2 ? whiteSteel : orange), [0.42, 0.74], whiteSteel);
    const beacon = M.glow(0xff3030, 0.4, 3);
    ctx.put(beacon, sphere(0.5, x, y + H * 1.16, z));
  }

  // Torii standing in the harbour.
  {
    const [x, z] = ctx.at(156, -12);
    const y = -3;
    ctx.put(vermilion, cyl(1.1, 1.3, 19, x, y, z - 8, 16));
    ctx.put(vermilion, cyl(1.1, 1.3, 19, x, y, z + 8, 16));
    ctx.put(vermilion, box(1.1, 1.2, 21, x, y + 13.5, z));
    ctx.put(M.std(0x1c1c1c, 0.5), box(1.8, 1.4, 25, x, y + 16.6, z));
    ctx.put(vermilion, box(1.5, 1.2, 23.5, x, y + 15.4, z));
  }

  // Cherry trees round the pagoda and the castle.
  {
    const trunk = M.std(0x5b3a2a, 0.9);
    const blossom = M.std(0xf4b6c8, 0.8, 0, { flatShading: true });
    let seed = 41;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    [[cx - 6, cz - 38, 14], [cx + 22, cz - 24, 17]].forEach(([ox, oz, r]) => {
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + rnd() * 0.3;
        const tx = ox + Math.cos(a) * (r + rnd() * 3), tz = oz + Math.sin(a) * (r + rnd() * 3);
        if (!ctx.clear(tx, tz, 2)) continue;
        const ty = ctx.groundY(tx, tz);
        const s = 0.8 + rnd() * 0.5;
        ctx.put(trunk, cyl(0.25 * s, 0.4 * s, 3.2 * s, tx, ty, tz, 6));
        const crown = new THREE.IcosahedronGeometry(2.6 * s, 0);
        crown.scale(1.2, 0.8, 1.2);
        crown.translate(tx, ty + 4.3 * s, tz);
        ctx.put(blossom, norm(crown));
      }
    });
  }

  // Container port: gantry cranes and stacked boxes on the harbour edge.
  {
    const crane = M.std(0xd9533f, 0.5, 0.3);
    [[125, -10], [123, -20], [125, -30]].map(([dx, dz]) => ctx.at(dx, dz)).forEach(([x, z]) => {
      const y = ctx.groundY(x, z);
      [[-4, -4], [-4, 4], [4, -4], [4, 4]].forEach(([dx, dz]) => ctx.put(crane, box(0.8, 20, 0.8, x + dx, y, z + dz)));
      ctx.put(crane, box(9, 1.2, 9, x, y + 20, z));
      ctx.put(crane, box(34, 1.4, 2, x + 12, y + 21.5, z));
      ctx.put(crane, box(2.4, 3, 2.4, x + 2, y + 16, z));
      ctx.reserve(x, z, 7);
    });
    const palette = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf39c12, 0x8e44ad, 0x7f8c8d, 0xd35400];
    const mats = palette.map((c) => M.std(c, 0.7));
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const [ox, oz] = ctx.at(106, -2);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
      const x = ox + col * 3, z = oz - row * 8;
      if (!ctx.clear(x, z, 3.5)) continue;
      const levels = 1 + Math.floor(rnd() * 3);
      for (let lv = 0; lv < levels; lv++) ctx.put(mats[Math.floor(rnd() * mats.length)], box(2.4, 2.6, 6, x, ctx.groundY(x, z) + lv * 2.6, z));
    }
    ctx.reserve(ox + 6, oz - 8, 12);
  }
};

// ================================================================ SOUTH

export const buildSouthLandmarks = (ctx: LandmarkContext, cx: number, cz: number, glassMat: THREE.Material) => {
  const M = makeMats(ctx);
  const red = M.std(0xb3261e, 0.55);
  const yellowRoof = M.roof(0xd4a017);
  const greenRoof = M.roof(0x2f6b4f);
  const darkRoof = M.roof(0x3d3d44);

  // Pearl tower: three legs, a column, two glowing spheres and a spire.
  {
    const x = cx - 34, z = cz + 22, y = ctx.groundY(x, z) - 0.2;
    const frame = M.std(0xdadde2, 0.4, 0.5);
    const k = 0.62;   // scale: the south shore is nearest the camera
    const pearl = M.std(0xd6457a, 0.25, 0.3, { emissive: 0xd6457a, emissiveIntensity: 0.1 });
    ctx.night(pearl, 0.1, 1.1);
    for (let leg = 0; leg < 3; leg++) {
      const a = (leg / 3) * Math.PI * 2;
      ctx.put(frame, beam(V(x + Math.cos(a) * 9 * k, y, z + Math.sin(a) * 9 * k), V(x + Math.cos(a) * 1.8 * k, y + 44 * k, z + Math.sin(a) * 1.8 * k), 2.2 * k));
    }
    ctx.put(frame, cyl(2.2 * k, 2.6 * k, 104 * k, x, y, z, 16));
    ctx.put(pearl, sphere(9 * k, x, y + 38 * k, z));
    ctx.put(pearl, sphere(5.5 * k, x, y + 86 * k, z));
    ctx.put(pearl, sphere(2.4 * k, x, y + 106 * k, z));
    ctx.put(frame, cyl(0.3, 1.2 * k, 26 * k, x, y + 106 * k, z, 8));
    ctx.reserve(x, z, 12);
  }

  // Tapered supertall with an open crown, on the far (north) side of town so
  // it does not stand between the overview camera and the district.
  {
    const x = cx + 30, z = cz - 34, y = ctx.groundY(x, z) - 0.3;
    const H = 88;
    const g = new THREE.CylinderGeometry(3 * Math.SQRT2, 9 * Math.SQRT2, H, 4, 1);
    g.rotateY(Math.PI / 4);
    g.translate(x, y + H / 2, z);
    // Its own copy of the window texture, tiled to the tower's size.
    const src = glassMat as THREE.MeshStandardMaterial;
    const tiled = (t: THREE.Texture | null) => {
      if (!t) return null;
      const c = ctx.track(t.clone());
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(5, H / 7);
      c.needsUpdate = true;
      return c;
    };
    const towerMat = ctx.track(new THREE.MeshStandardMaterial({
      color: 0xb4cad6, metalness: 0.45, roughness: 0.18, map: tiled(src.map), emissive: src.emissive, emissiveMap: tiled(src.emissiveMap), emissiveIntensity: 0,
    }));
    ctx.night(towerMat, 0, 1.4);
    ctx.put(towerMat, norm(g));
    const crown = M.std(0xc9d3da, 0.3, 0.6);
    [-1, 1].forEach((side) => ctx.put(crown, frustum(1, 2.6, 18, x + side * 1.9, y + H, z)));
    const tip = M.glow(0xffffff, 0.2, 2.5);
    ctx.put(tip, sphere(0.6, x, y + H + 19, z));
    ctx.reserve(x, z, 12);
  }

  // Temple hall on a white platform, with hanok houses round it.
  {
    const x = cx - 40, z = cz - 10, y = ctx.groundY(x, z) - 0.2;
    ctx.put(M.std(0xe7e3da, 0.8), box(24, 2, 18, x, y, z));
    for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) ctx.put(red, cyl(0.45, 0.45, 6, x + i * 4, y + 2, z + s * 6.4, 10));
    ctx.put(M.std(0x8c2f24, 0.7), box(18, 6, 11, x, y + 2, z));
    ctx.put(yellowRoof, curvedRoof(25, 18, 2.6, 1.8, x, y + 8, z));
    ctx.put(red, box(13, 3, 8, x, y + 10, z));
    ctx.put(yellowRoof, curvedRoof(18.5, 13, 4, 1.6, x, y + 13, z));
    ctx.reserve(x, z, 15);
    const wall = M.std(0xf1ede4, 0.8);
    let seed = 17;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * 0.2 + (k / 9) * Math.PI * 1.3;
      const hx = x + Math.cos(a) * (20 + rnd() * 6), hz = z + Math.sin(a) * (20 + rnd() * 6);
      if (!ctx.clear(hx, hz, 7)) continue;
      const hy = ctx.groundY(hx, hz) - 0.2;
      const rot = a + Math.PI / 2;
      ctx.put(wall, box(9, 3.4, 5.5, hx, hy, hz, rot));
      ctx.put(darkRoof, curvedRoof(11.5, 8, 1.8, 0.9, hx, hy + 3.3, hz, rot));
      ctx.reserve(hx, hz, 6);
    }
  }

  // Paifang gate over the main road where it enters the city, then lanterns.
  {
    const road = ctx.road('south');
    const s = road.samples[Math.max(0, road.samples.length - 18)];
    const hw = road.width / 2 + 1.5;
    const rot = Math.atan2(s.n.x, s.n.z) - Math.PI / 2;
    const y = s.p.y;
    [-hw, -hw - 5, hw, hw + 5].forEach((off) => {
      const p = s.p.clone().addScaledVector(s.n, off);
      ctx.put(red, cyl(0.55, 0.6, Math.abs(off) > hw ? 7 : 10, p.x, y, p.z, 12));
    });
    ctx.put(M.std(0x1f5e8c, 0.6), box(hw * 2 + 1, 1.4, 0.8, s.p.x, y + 8, s.p.z, rot));
    ctx.put(greenRoof, curvedRoof(hw * 2 + 3, 3.6, 1.2, 1.2, s.p.x, y + 10.2, s.p.z, rot));
    [-1, 1].forEach((side) => {
      const p = s.p.clone().addScaledVector(s.n, side * (hw + 2.5));
      ctx.put(greenRoof, curvedRoof(7, 3, 0.9, 0.8, p.x, y + 7.2, p.z, rot));
    });

    const lantern = M.glow(0xd9322b, 0.3, 2.4);
    const post = M.std(0x2a1c1a, 0.7);
    for (let i = Math.max(1, road.samples.length - 14); i < road.samples.length - 1; i += 3) {
      const r = road.samples[i];
      const a = r.p.clone().addScaledVector(r.n, -(road.width / 2 + 1.4));
      const b = r.p.clone().addScaledVector(r.n, road.width / 2 + 1.4);
      ctx.put(post, box(0.3, 6.5, 0.3, a.x, r.p.y, a.z));
      ctx.put(post, box(0.3, 6.5, 0.3, b.x, r.p.y, b.z));
      for (let k = 1; k < 7; k++) {
        const u = k / 7;
        const p = a.clone().lerp(b, u);
        const g = new THREE.SphereGeometry(0.42, 8, 6);
        g.scale(1, 1.3, 1);
        g.translate(p.x, r.p.y + 6.2 - Math.sin(Math.PI * u) * 1.1, p.z);
        ctx.put(lantern, norm(g));
      }
    }
  }
};

// ================================================================ HOME VILLAGE

/**
 * A cute village round the central roundabout: pastel cottages with fenced
 * gardens, a chapel, a duck pond, a fountain on the green, fruit trees - and
 * Home, the player's own cottage with its garage and car. Returns where Home
 * stands so the map can highlight it.
 */
export const buildVillage = (ctx: LandmarkContext, hx: number, hz: number) => {
  const M = makeMats(ctx);
  const walls = [0xf4efe4, 0xf1e2b8, 0xdce8f0, 0xf2d6ce, 0xe2edd6].map((c) => M.std(c, 0.85));
  const roofs = [0xc0503a, 0x7a4b36, 0x4d6b8c, 0xc9a45c, 0x5d7f4a].map((c) => M.std(c, 0.7));
  const wood = M.std(0x6b4630, 0.8);
  const white = M.std(0xf7f5ef, 0.7);
  const stone = M.std(0xa8a39a, 0.9);
  const path = M.std(0xcfc4ae, 0.95);
  const windowGlow = M.glow(0xffd58a, 0.06, 1.8);
  const flowers = [0xe94f64, 0xf6c343, 0xb56fd6, 0xffffff, 0xff8c42].map((c) => M.std(c, 0.8));
  const leaf = M.std(0x5f9e45, 0.85, 0, { flatShading: true });
  const blossom = M.std(0xf6c1d2, 0.85, 0, { flatShading: true });
  const trunk = M.std(0x6b4a30, 0.9);
  const water = M.std(0x4f9fc4, 0.12, 0.1);
  let seed = 101;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  /** Local (lx along the front, lz toward the front) to world, for a lot turned by rot. */
  const place = (cx: number, cz: number, rot: number, lx: number, lz: number): [number, number] =>
    [cx + lx * Math.cos(rot) + lz * Math.sin(rot), cz - lx * Math.sin(rot) + lz * Math.cos(rot)];
  const faceHub = (x: number, z: number) => Math.atan2(hx - x, hz - z);

  const flowerBed = (cx: number, cz: number, rot: number, lx0: number, lx1: number, lz: number, y: number) => {
    for (let lx = lx0; lx <= lx1; lx += 0.7) {
      const [fx, fz] = place(cx, cz, rot, lx + (rnd() - 0.5) * 0.3, lz + (rnd() - 0.5) * 0.4);
      ctx.put(flowers[Math.floor(rnd() * flowers.length)], norm(new THREE.IcosahedronGeometry(0.26, 0).translate(fx, y + 0.3, fz)));
    }
  };
  const fence = (cx: number, cz: number, rot: number, w: number, d0: number, d1: number, y: number) => {
    const picket = (lx: number, lz: number) => {
      const [px, pz] = place(cx, cz, rot, lx, lz);
      ctx.put(white, box(0.12, 0.9, 0.12, px, y, pz, rot));
    };
    for (let lx = -w / 2; lx <= w / 2 + 0.01; lx += 0.55) if (Math.abs(lx) > 0.7) picket(lx, d1);
    for (let lz = d0; lz < d1; lz += 0.55) { picket(-w / 2, lz); picket(w / 2, lz); }
    [[-w / 4 - 0.35, w / 2 - 0.7], [w / 4 + 0.35, w / 2 - 0.7]].forEach(([lx, len]) => {
      const [rx, rz] = place(cx, cz, rot, lx, d1);
      ctx.put(white, box(len, 0.1, 0.06, rx, y + 0.55, rz, rot));
    });
  };

  const cottage = (cx: number, cz: number, rot: number, w: number, d: number, storeys: 1 | 2, wallMat: THREE.Material, roofMat: THREE.Material) => {
    const y = ctx.groundY(cx, cz) - 0.2;
    const h = storeys === 2 ? 5.6 : 3.2;
    const roofH = Math.min(w, d) * 0.55;
    ctx.put(wallMat, box(w, h, d, cx, y, cz, rot));
    ctx.put(roofMat, gableRoof(w, d, roofH, cx, y + h, cz, rot, 0.45));
    const [chx, chz] = place(cx, cz, rot, w * 0.28, -d * 0.18);
    ctx.put(stone, box(0.7, roofH * 0.6 + 1.4, 0.7, chx, y + h + roofH * 0.2, chz, rot));
    const [dx, dz] = place(cx, cz, rot, 0, d / 2 + 0.03);
    ctx.put(wood, box(0.95, 1.95, 0.1, dx, y + 0.2, dz, rot));
    for (const lx of [-w * 0.3, w * 0.3]) {
      for (let s = 0; s < storeys; s++) {
        const [wx, wz] = place(cx, cz, rot, lx, d / 2 + 0.04);
        ctx.put(windowGlow, box(0.8, 0.8, 0.08, wx, y + 1.3 + s * 2.4, wz, rot));
      }
    }
    for (const side of [-1, 1]) {
      const [wx, wz] = place(cx, cz, rot, side * (w / 2 + 0.04), 0);
      ctx.put(windowGlow, box(0.08, 0.8, 0.8, wx, y + 1.3, wz, rot));
    }
    const [px, pz] = place(cx, cz, rot, 0, d / 2 + 1.35);
    ctx.put(path, box(1, 0.06, 2.6, px, y + 0.2, pz, rot));
    fence(cx, cz, rot, w + 1, d / 2, d / 2 + 2.7, y + 0.2);
    flowerBed(cx, cz, rot, -w / 2 + 0.2, -0.9, d / 2 + 2.1, y + 0.2);
    flowerBed(cx, cz, rot, 0.9, w / 2 - 0.2, d / 2 + 2.1, y + 0.2);
    ctx.reserve(cx, cz, Math.max(w, d) * 0.72 + 2.8);
  };

  const tree = (x: number, z: number, s: number, crown: THREE.Material) => {
    const y = ctx.groundY(x, z) - 0.1;
    ctx.put(trunk, cyl(0.18 * s, 0.26 * s, 2.2 * s, x, y, z, 6));
    ctx.put(crown, norm(new THREE.IcosahedronGeometry(1.7 * s, 0).translate(x, y + 3.2 * s, z)));
  };

  // Fountain on the green inside the roundabout.
  {
    const y = ctx.groundY(hx, hz) + 0.2;
    ctx.put(stone, cyl(3.4, 3.6, 0.8, hx, y, hz, 32));
    ctx.put(water, cyl(3.0, 3.0, 0.1, hx, y + 0.72, hz, 32));
    ctx.put(stone, cyl(0.45, 0.6, 2.6, hx, y + 0.8, hz, 12));
    ctx.put(stone, cyl(1.4, 0.5, 0.5, hx, y + 3.2, hz, 20));
    ctx.put(water, cyl(1.2, 1.2, 0.08, hx, y + 3.62, hz, 20));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const r = 5.6 + (k % 2) * 0.6;
      ctx.put(flowers[k % flowers.length], norm(new THREE.IcosahedronGeometry(0.35, 0).translate(hx + Math.cos(a) * r, y + 0.1, hz + Math.sin(a) * r)));
    }
  }

  // Home: the player's two-storey cottage with its garage, car and garden.
  const homeSpots: [number, number][] = [[-20, 40], [-28, 36], [-34, 32], [34, 34]];
  const home = new THREE.Vector3(hx - 20, 0, hz + 40);
  for (const [dx, dz] of homeSpots) {
    const x = hx + dx, z = hz + dz;
    if (ctx.clear(x, z, 12) && ctx.free(x, z, 12)) { home.set(x, 0, z); break; }
  }
  {
    // Faces south-south-east: toward the map camera, so the front garden shows.
    const rot = 0.46;
    const y = ctx.groundY(home.x, home.z) - 0.2;
    home.y = y;
    const cream = M.std(0xf6ecd6, 0.85);
    const red = M.std(0xb8412f, 0.7);
    const w = 9, d = 7, h = 5.8;
    ctx.put(cream, box(w, h, d, home.x, y, home.z, rot));
    ctx.put(red, gableRoof(w, d, 4, home.x, y + h, home.z, rot, 0.5));
    const [chx, chz] = place(home.x, home.z, rot, -w * 0.3, -1);
    ctx.put(stone, box(0.9, 3.2, 0.9, chx, y + h + 1.2, chz, rot));
    // Garage beside it, with its door and a car on the drive.
    const [gx, gz] = place(home.x, home.z, rot, w / 2 + 2.9, -0.5);
    ctx.put(cream, box(5.4, 3.3, 6, gx, y, gz, rot));
    ctx.put(red, box(5.9, 0.35, 6.5, gx, y + 3.3, gz, rot));
    const [gdx, gdz] = place(home.x, home.z, rot, w / 2 + 2.9, 2.55);
    ctx.put(M.std(0xdedede, 0.5, 0.2), box(3.8, 2.6, 0.1, gdx, y + 0.2, gdz, rot));
    const [drx, drz] = place(home.x, home.z, rot, w / 2 + 2.9, 6.5);
    ctx.put(M.std(0x6d6a66, 0.9), box(3.8, 0.06, 7, drx, y + 0.2, drz, rot));
    // A gravel lane from the end of the drive to the nearest road.
    {
      const [ex, ez] = place(home.x, home.z, rot, w / 2 + 2.9, 10);
      let best: RoadSampleLike | null = null, bestD = Infinity;
      for (const id of ['south', 'highway']) {
        const r = ctx.road(id);
        r.samples.forEach((smp) => {
          const dist = Math.hypot(smp.p.x - ex, smp.p.z - ez) - r.width / 2;
          if (dist < bestD) { bestD = dist; best = smp; }
        });
      }
      if (best && bestD < 60) {
        const target = (best as RoadSampleLike).p;
        const a = V(ex, 0, ez), b = V(target.x, 0, target.z);
        const len = a.distanceTo(b);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const lane = new THREE.BoxGeometry(3.2, 0.08, len);
        lane.rotateY(Math.atan2(b.x - a.x, b.z - a.z));
        lane.translate(mid.x, (y + (best as RoadSampleLike).p.y) / 2 + 0.2, mid.z);
        ctx.put(M.std(0x8f877a, 0.95), norm(lane));
        for (let t = 0; t <= len; t += 3) {
          const q = a.clone().lerp(b, t / len);
          ctx.reserve(q.x, q.z, 3.2);
        }
      }
    }
    const [cx2, cz2] = place(home.x, home.z, rot, w / 2 + 2.9, 7);
    const carMat = M.std(0xd63a3a, 0.35, 0.4);
    ctx.put(carMat, box(1.9, 1.0, 4.2, cx2, y + 0.45, cz2, rot));
    ctx.put(carMat, box(1.7, 0.75, 2.2, cx2, y + 1.45, cz2, rot));
    ctx.put(M.std(0x1a1a1a, 0.6), box(2.0, 0.55, 0.7, cx2, y + 0.25, cz2, rot + Math.PI / 2));
    // Porch with a lamp, windows, garden.
    const [pdx, pdz] = place(home.x, home.z, rot, -1, d / 2 + 0.03);
    ctx.put(wood, box(1.1, 2.1, 0.12, pdx, y + 0.2, pdz, rot));
    const [prx, prz] = place(home.x, home.z, rot, -1, d / 2 + 0.9);
    ctx.put(red, box(2.6, 0.2, 1.8, prx, y + 2.6, prz, rot));
    const porchLamp = M.glow(0xffe0a0, 0.3, 3);
    const [plx, plz] = place(home.x, home.z, rot, 0.1, d / 2 + 0.1);
    ctx.put(porchLamp, box(0.3, 0.4, 0.3, plx, y + 2.1, plz, rot));
    for (const lx of [-3.2, 1.6, 3.2]) {
      for (let st = 0; st < 2; st++) {
        const [wx, wz] = place(home.x, home.z, rot, lx, d / 2 + 0.04);
        ctx.put(windowGlow, box(0.9, 0.9, 0.08, wx, y + 1.4 + st * 2.7, wz, rot));
      }
    }
    fence(home.x, home.z, rot, w + 2, d / 2, d / 2 + 4.2, y + 0.2);
    flowerBed(home.x, home.z, rot, -w / 2, -1.8, d / 2 + 3.4, y + 0.2);
    flowerBed(home.x, home.z, rot, 0, w / 2, d / 2 + 3.4, y + 0.2);
    const [mbx, mbz] = place(home.x, home.z, rot, 1.2, d / 2 + 4.6);
    ctx.put(wood, box(0.12, 1.1, 0.12, mbx, y + 0.2, mbz, rot));
    ctx.put(M.std(0x2f6fb5, 0.5, 0.3), box(0.5, 0.35, 0.3, mbx, y + 1.3, mbz, rot));
    [[-6, -4], [-6.5, 2], [7, -5]].forEach(([lx, lz]) => {
      const [tx, tz] = place(home.x, home.z, rot, lx, lz);
      tree(tx, tz, 1.1, rnd() < 0.5 ? blossom : leaf);
    });
    ctx.reserve(home.x, home.z, 13);
  }

  // Chapel with a bell tower, and a duck pond.
  const chapelAt: [number, number] = [hx + 34, hz - 26];
  if (ctx.clear(chapelAt[0], chapelAt[1], 9) && ctx.free(chapelAt[0], chapelAt[1], 8)) {
    const [x, z] = chapelAt;
    const rot = faceHub(x, z);
    const y = ctx.groundY(x, z) - 0.2;
    const roof = M.std(0x4d5f7a, 0.7);
    ctx.put(white, box(6, 5, 10, x, y, z, rot));
    ctx.put(roof, gableRoof(10, 6, 3.6, x, y + 5, z, rot + Math.PI / 2, 0.4));
    const [tx, tz] = place(x, z, rot, 0, 5.2);
    ctx.put(white, box(3, 10, 3, tx, y, tz, rot));
    ctx.put(roof, pyramid(3.4, 5.5, tx, y + 10, tz, rot));
    const bell = M.glow(0xd9b45a, 0.2, 1.2);
    ctx.put(bell, box(1.2, 1.2, 3.1, tx, y + 7.8, tz, rot));
    ctx.reserve(x, z, 9);
  }
  const pondAt: [number, number] = [hx - 30, hz - 28];
  if (ctx.clear(pondAt[0], pondAt[1], 9) && ctx.free(pondAt[0], pondAt[1], 8)) {
    const [x, z] = pondAt;
    const y = ctx.groundY(x, z);
    ctx.put(stone, cyl(7.4, 7.6, 0.3, x, y - 0.1, z, 32));
    ctx.put(water, cyl(7.0, 7.0, 0.1, x, y + 0.12, z, 32));
    const ducks = new THREE.Group();
    const duckBody = M.std(0xffffff, 0.6), beak = M.std(0xf08a24, 0.5);
    for (let k = 0; k < 4; k++) {
      const duck = new THREE.Group();
      const body = new THREE.Mesh(ctx.track(new THREE.SphereGeometry(0.42, 10, 8)), duckBody);
      body.scale.set(1, 0.7, 1.3);
      const head = new THREE.Mesh(ctx.track(new THREE.SphereGeometry(0.24, 10, 8)), duckBody);
      head.position.set(0, 0.42, 0.42);
      const bill = new THREE.Mesh(ctx.track(new THREE.BoxGeometry(0.12, 0.08, 0.2)), beak);
      bill.position.set(0, 0.4, 0.7);
      duck.add(body, head, bill);
      duck.userData.phase = (k / 4) * Math.PI * 2;
      ducks.add(duck);
    }
    ducks.position.set(x, y + 0.3, z);
    ctx.add(ducks);
    ctx.animate((t) => ducks.children.forEach((duck, k) => {
      const a = t * 0.25 + duck.userData.phase;
      const r = 3.2 + (k % 2) * 1.6;
      duck.position.set(Math.cos(a) * r, Math.sin(t * 2 + k) * 0.04, Math.sin(a) * r);
      duck.rotation.y = -a;
    }));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.3;
      tree(x + Math.cos(a) * 10, z + Math.sin(a) * 10, 0.9 + rnd() * 0.3, k % 3 === 0 ? blossom : leaf);
    }
    ctx.reserve(x, z, 11);
  }

  // Cottages round the green, facing the roundabout.
  let placed = 0;
  for (let attempt = 0; attempt < 900 && placed < 30; attempt++) {
    const r = 22 + rnd() * 38;
    const a = rnd() * Math.PI * 2;
    const x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r;
    const w = 5 + rnd() * 2.2, d = 4.6 + rnd() * 1.6;
    const half = Math.max(w, d) * 0.72 + 2.8;
    if (!ctx.clear(x, z, half + 1) || !ctx.free(x, z, half)) continue;
    const rot = faceHub(x, z) + (rnd() - 0.5) * 0.3;
    cottage(x, z, rot, w, d, rnd() < 0.3 ? 2 : 1, walls[Math.floor(rnd() * walls.length)], roofs[Math.floor(rnd() * roofs.length)]);
    placed++;
  }

  // Fruit trees in the gaps.
  for (let attempt = 0; attempt < 500; attempt++) {
    const r = 18 + rnd() * 46;
    const a = rnd() * Math.PI * 2;
    const x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r;
    if (!ctx.clear(x, z, 2.5) || !ctx.free(x, z, 1.8)) continue;
    tree(x, z, 0.8 + rnd() * 0.5, rnd() < 0.35 ? blossom : leaf);
    ctx.reserve(x, z, 1.8);
  }

  return { home, homeRadius: 14 };
};

/** Merges bucketed geometry into one mesh per material. */
export const flushBuckets = (buckets: Map<THREE.Material, THREE.BufferGeometry[]>, parent: THREE.Object3D) => {
  buckets.forEach((list, material) => {
    if (!list.length) return;
    const merged = mergeGeometries(list);
    list.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  });
  buckets.clear();
};
