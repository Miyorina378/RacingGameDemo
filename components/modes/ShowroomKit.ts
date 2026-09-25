import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/**
 * Shared pieces for the dealer showrooms (ShowroomLuxury, ShowroomWhite): room
 * placement by angle, canvas-drawn textures, trees and the mirror-marble floor.
 *
 * Angles run round the room from the back wall (-Z, 0 deg) towards +X (the
 * right side seen from the default front camera).
 */

export const toRad = (deg: number) => (deg * Math.PI) / 180;
/** Point on the floor at `deg` round the room, `r` from the centre. */
export const polar = (deg: number, r: number) => new THREE.Vector3(Math.sin(toRad(deg)) * r, 0, -Math.cos(toRad(deg)) * r);
/** Turns an object at `deg` to face the centre of the room. */
export const faceCentre = (obj: THREE.Object3D, deg: number) => { obj.rotation.y = -toRad(deg); };

export const makeRandom = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

export const canvasTexture = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

export const shadowed = (m: THREE.Mesh, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };

// ---------------------------------------------------------------- textures

/** Stone with meandering veins. */
export const drawMarble = (g: CanvasRenderingContext2D, w: number, h: number, base: string, veins: string[], seed: number, count: number) => {
  const random = makeRandom(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {   // soft clouding
    const x = random() * w, y = random() * h, r = 40 + random() * 220;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${0.025 * random()})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < count; i++) {
    g.strokeStyle = veins[i % veins.length];
    g.globalAlpha = 0.25 + random() * 0.55;
    g.lineWidth = 0.6 + random() * (i % 7 === 0 ? 3.2 : 1.4);
    let x = random() * w, y = random() * h;
    let angle = random() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 30 + Math.floor(random() * 60);
    for (let s = 0; s < steps; s++) {
      angle += (random() - 0.5) * 0.7;
      const len = 8 + random() * 22;
      const cx = x + Math.cos(angle) * len * 0.6 + (random() - 0.5) * 10;
      const cy = y + Math.sin(angle) * len * 0.6 + (random() - 0.5) * 10;
      x += Math.cos(angle) * len;
      y += Math.sin(angle) * len;
      g.quadraticCurveTo(cx, cy, x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
};

/** The brand mark: three slanted bars. */
export const drawMark = (g: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string | CanvasGradient) => {
  g.fillStyle = fill;
  for (let i = 0; i < 3; i++) {
    const bx = x + i * size * 0.42;
    g.beginPath();
    g.moveTo(bx + size * 0.30, y);
    g.lineTo(bx + size * 0.52, y);
    g.lineTo(bx + size * 0.22, y + size * 0.62);
    g.lineTo(bx, y + size * 0.62);
    g.closePath();
    g.fill();
  }
};

/** Leafy tree (ficus/bamboo look): thin trunks and clusters of small leaves. */
export const buildLeafyTree = (seed: number, height: number, planter: THREE.Material, glow: THREE.Material): THREE.Group => {
  const random = makeRandom(seed);
  const group = new THREE.Group();
  const potH = 0.7;
  const pot = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.9, potH, 0.9, 3, 0.04), planter));
  pot.position.y = potH / 2;
  group.add(pot);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.015, 0.92), glow);
  lip.position.y = potH + 0.01;
  group.add(lip);
  const trunks: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const leaf = new THREE.PlaneGeometry(0.13, 0.07);
  for (let t = 0; t < 4; t++) {
    const lean = new THREE.Vector3((random() - 0.5) * 0.6, 1, (random() - 0.5) * 0.6).normalize();
    const top = new THREE.Vector3(0, potH, 0).addScaledVector(lean, height * (0.7 + random() * 0.3));
    trunks.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, potH, 0), new THREE.Vector3(0, potH, 0).lerp(top, 0.5).add(new THREE.Vector3(0.05, 0, 0)), top,
    ]), 8, 0.025, 6, false));
    for (let c = 0; c < 5; c++) {          // leaf clusters round each trunk's upper part
      const centre = new THREE.Vector3(0, potH, 0).lerp(top, 0.55 + random() * 0.45)
        .add(new THREE.Vector3((random() - 0.5) * 0.7, (random() - 0.2) * 0.3, (random() - 0.5) * 0.7));
      for (let l = 0; l < 70; l++) {
        const q = leaf.clone();
        q.rotateX(random() * Math.PI);
        q.rotateY(random() * Math.PI * 2);
        q.rotateZ(random() * Math.PI);
        const r = 0.38 * Math.cbrt(random());
        const dir = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
        q.translate(centre.x + dir.x * r, centre.y + dir.y * r * 0.7, centre.z + dir.z * r);
        leaves.push(q);
      }
    }
  }
  group.add(shadowed(new THREE.Mesh(mergeGeometries(trunks), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8 }))));
  group.add(shadowed(new THREE.Mesh(mergeGeometries(leaves), new THREE.MeshStandardMaterial({
    color: 0x2d5a2a, roughness: 0.6, side: THREE.DoubleSide,
  }))));
  return group;
};

/**
 * Polished stone floor: a mirror under a sheet of marble, so the car, stage
 * and lights reflect the way they do on real polished stone.
 */
export const buildMirrorFloor = (radius: number, marble: THREE.MeshStandardMaterial, tint: number): THREE.Group => {
  const group = new THREE.Group();
  const mirror = new Reflector(new THREE.CircleGeometry(radius, 96), {
    clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: tint,
  });
  mirror.rotation.x = -Math.PI / 2;
  group.add(mirror);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), marble);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  floor.receiveShadow = true;
  group.add(floor);
  // The marble must not appear in its own reflection.
  const renderMirror = mirror.onBeforeRender.bind(mirror);
  mirror.onBeforeRender = (...args: Parameters<typeof mirror.onBeforeRender>) => {
    floor.visible = false;
    renderMirror(...args);
    floor.visible = true;
  };
  return group;
};
