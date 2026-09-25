import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHOWROOM_STAGE_TOP, ShowroomRoom } from './ShowroomRooms';
import {
  buildLeafyTree, buildMirrorFloor, canvasTexture, drawMark, drawMarble, faceCentre, makeRandom, polar, shadowed, toRad,
} from './ShowroomKit';

/**
 * Race-car flagship showroom: a round black-and-bronze hall. A marble brand wall
 * stands behind the turntable, with glass on the right looking out on a night
 * city, LED story screens on the left, a lounge, and planted trees. Every
 * texture is drawn on a canvas here, so the room needs no image assets.
 * Shared placement, textures and trees live in ShowroomKit.ts.
 */

export const BRAND_NAME = 'TRIFILA';
export const BRAND_TAGLINE = 'DRIVE YOUR STORY';

const R = 11;          // wall radius
const H = 7.6;         // ceiling height
const WARM = 0xffd7a8;

const bronzeGradient = (g: CanvasRenderingContext2D, y0: number, y1: number) => {
  const grad = g.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, '#f6e2c4');
  grad.addColorStop(0.5, '#c9a27a');
  grad.addColorStop(1, '#8c6a4a');
  return grad;
};

const brandWallTexture = () => canvasTexture(2048, 1250, (g, w, h) => {
  drawMarble(g, w, h, '#15120f', ['#8a7a66', '#c9b89e', '#5a4c3e'], 7, 70);
  const vignette = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, w, h);
  drawMark(g, w / 2 - 150, h * 0.26, 220, bronzeGradient(g, h * 0.26, h * 0.26 + 140));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '300 150px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  g.fillStyle = bronzeGradient(g, h * 0.52, h * 0.62);
  const letters = BRAND_NAME.split('');
  const spacing = 150;
  letters.forEach((ch, i) => g.fillText(ch, w / 2 + (i - (letters.length - 1) / 2) * spacing, h * 0.57));
  g.font = '400 42px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  g.fillStyle = '#cdb89a';
  const tag = BRAND_TAGLINE.split('');
  tag.forEach((ch, i) => g.fillText(ch, w / 2 + (i - (tag.length - 1) / 2) * 38, h * 0.70));
});

/** Night city seen through the glass. */
const skylineTexture = () => canvasTexture(4096, 1024, (g, w, h) => {
  const random = makeRandom(99);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#070b18');
  sky.addColorStop(0.45, '#1b2448');
  sky.addColorStop(0.62, '#4a3a66');
  sky.addColorStop(0.70, '#b0708a');
  sky.addColorStop(0.72, '#1a1c30');
  sky.addColorStop(1, '#05060c');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const horizon = h * 0.71;
  // Far hills.
  g.fillStyle = '#12142a';
  g.beginPath();
  g.moveTo(0, horizon);
  for (let x = 0; x <= w; x += 32) g.lineTo(x, horizon - 30 - 40 * Math.sin(x * 0.002) - 20 * Math.sin(x * 0.011));
  g.lineTo(w, horizon);
  g.fill();
  // Towers with lit windows.
  for (let layer = 0; layer < 2; layer++) {
    let x = 0;
    while (x < w) {
      const bw = 30 + random() * (layer ? 90 : 60);
      const tall = random() < 0.12;
      const bh = (layer ? 60 : 30) + random() * (layer ? 180 : 110) + (tall ? 200 + random() * 160 : 0);
      g.fillStyle = layer ? '#0b0d1a' : '#15182c';
      g.fillRect(x, horizon - bh, bw, bh);
      for (let wy = horizon - bh + 8; wy < horizon - 6; wy += 9) {
        for (let wx = x + 4; wx < x + bw - 4; wx += 7) {
          if (random() < (layer ? 0.32 : 0.18)) {
            g.fillStyle = random() < 0.8 ? '#ffd9a0' : '#bcd8ff';
            g.globalAlpha = 0.5 + random() * 0.5;
            g.fillRect(wx, wy, 3, 4);
          }
        }
      }
      g.globalAlpha = 1;
      x += bw + random() * (layer ? 8 : 20);
    }
  }
  // Water with light streaks.
  for (let i = 0; i < 600; i++) {
    g.fillStyle = random() < 0.8 ? 'rgba(255,210,150,0.35)' : 'rgba(150,190,255,0.3)';
    g.fillRect(random() * w, horizon + 6 + random() * (h - horizon), 2 + random() * 14, 1);
  }
});

/** LED story screens: a winding mountain road at dusk, one with the tagline. */
const screenTexture = (variant: number) => canvasTexture(640, 1280, (g, w, h) => {
  const random = makeRandom(300 + variant);
  const sky = g.createLinearGradient(0, 0, 0, h * 0.55);
  sky.addColorStop(0, variant === 1 ? '#2a3350' : '#1e2238');
  sky.addColorStop(1, variant === 1 ? '#d9a27a' : '#8a6a8a');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const ridge = (y: number, amp: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y - amp * Math.abs(Math.sin(x * 0.01 + y)) - random() * amp * 0.3);
    g.lineTo(w, h);
    g.fill();
  };
  ridge(h * 0.42, 160, '#3a3e5c');
  ridge(h * 0.52, 120, '#2a2c40');
  ridge(h * 0.62, 90, '#1a1b28');
  // A road snaking down the valley with a trail of lights.
  g.strokeStyle = '#ffcf8a';
  g.lineWidth = 5;
  g.shadowColor = '#ffb060';
  g.shadowBlur = 18;
  g.beginPath();
  let x = w * 0.2;
  g.moveTo(x, h);
  for (let y = h; y > h * 0.5; y -= 40) {
    x = w * 0.5 + Math.sin(y * 0.012 + variant) * w * 0.32 * ((y - h * 0.45) / h);
    g.lineTo(x, y);
  }
  g.stroke();
  g.shadowBlur = 0;
  if (variant === 0) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, w, h * 0.3);
    g.fillStyle = '#f2f2f2';
    g.font = '600 76px "Segoe UI", Arial, sans-serif';
    ['REAL CARS.', 'REAL ROADS.', 'REAL STORIES.'].forEach((line, i) => g.fillText(line, 48, 130 + i * 92));
    drawMark(g, 50, 380, 90, '#f2f2f2');
  }
});

/** A car silhouette in a frame, for the display shelf. */
const framedCarTexture = (hue: string) => canvasTexture(512, 360, (g, w, h) => {
  g.fillStyle = '#0c0c0e';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1b1b20';
  g.fillRect(24, 24, w - 48, h - 48);
  g.fillStyle = hue;
  g.beginPath();
  g.moveTo(80, 250); g.lineTo(120, 200); g.lineTo(200, 170); g.lineTo(330, 165);
  g.lineTo(400, 200); g.lineTo(440, 215); g.lineTo(440, 250); g.closePath();
  g.fill();
  g.fillStyle = '#050505';
  [[150, 250], [370, 250]].forEach(([cx, cy]) => { g.beginPath(); g.arc(cx, cy, 30, 0, Math.PI * 2); g.fill(); });
});

// ---------------------------------------------------------------- pieces

/** L-shaped sectional with a chaise, on a rug, with a coffee table. */
const buildLounge = (fabric: THREE.Material, dark: THREE.Material, metal: THREE.Material): THREE.Group => {
  const group = new THREE.Group();
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.6), new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.006, 0.3);
  rug.receiveShadow = true;
  group.add(rug);
  const piece = (w: number, h: number, d: number, x: number, y: number, z: number, r = 0.06) => {
    const m = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), fabric));
    m.position.set(x, y, z);
    group.add(m);
  };
  piece(3.4, 0.36, 1.0, -0.3, 0.22, -1.0);             // long run: base
  piece(3.4, 0.5, 0.25, -0.3, 0.62, -1.4);             // back
  piece(1.0, 0.36, 2.2, 1.9, 0.22, -0.4);              // chaise
  piece(0.25, 0.5, 2.2, 2.3, 0.62, -0.4);              // chaise back
  for (let i = 0; i < 3; i++) piece(1.08, 0.14, 0.85, -1.4 + i * 1.12, 0.47, -0.95);
  piece(0.2, 0.3, 1.0, -2.1, 0.55, -1.0);              // arm
  const table = shadowed(new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.08, 0.8, 3, 0.02), dark));
  table.position.set(-0.3, 0.38, 0.35);
  group.add(table);
  [[-0.9, 0.05], [0.3, 0.05], [-0.9, 0.65], [0.3, 0.65]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.04), metal);
    leg.position.set(x, 0.17, z);
    group.add(leg);
  });
  return group;
};

/** Arc floor lamp: weighted base, a long arc, a dome shade with a warm bulb. */
const buildArcLamp = (metal: THREE.Material, glow: THREE.Material): THREE.Group => {
  const group = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 32), metal));
  base.position.y = 0.025;
  group.add(base);
  const arc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0.5, 2.3, 0),
    new THREE.Vector3(1.3, 2.25, 0), new THREE.Vector3(1.75, 1.85, 0),
  ]);
  group.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(arc, 40, 0.018, 8, false), metal)));
  const shade = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), metal));
  shade.position.set(1.75, 1.85, 0);
  group.add(shade);
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), glow);
  bulb.rotation.x = Math.PI / 2;
  bulb.position.set(1.75, 1.84, 0);
  group.add(bulb);
  const light = new THREE.PointLight(WARM, 1.6, 4.5, 1.6);
  light.position.set(1.75, 1.7, 0);
  group.add(light);
  return group;
};

/** Dark display wall with lit shelves, framed cars and small plants. */
const buildDisplayWall = (dark: THREE.Material, glow: THREE.Material): THREE.Group => {
  const group = new THREE.Group();
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.2, 0.5), dark), false);
  body.position.y = 1.6;
  group.add(body);
  [1.15, 2.1].forEach((y) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 0.3), dark);
    shelf.position.set(0, y, 0.3);
    group.add(shelf);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.012, 0.02), glow);
    strip.position.set(0, y - 0.03, 0.44);
    group.add(strip);
  });
  [['#d8d8dc', -0.55], ['#c8c8cc', 0.55]].forEach(([hue, x]) => {
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.63), new THREE.MeshBasicMaterial({ map: framedCarTexture(hue as string) }));
    frame.position.set(x as number, 1.56, 0.255);
    group.add(frame);
  });
  [-1.3, 1.3].forEach((x) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.18, 16), dark);
    pot.position.set(x, 2.21, 0.3);
    group.add(pot);
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 0.7 }));
    bush.position.set(x, 2.4, 0.3);
    group.add(bush);
  });
  return group;
};

// ---------------------------------------------------------------- room

export const buildLuxuryRoom = (): ShowroomRoom => {
  const group = new THREE.Group();
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6d5642, metalness: 0.9, roughness: 0.32 });
  const blackGloss = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, metalness: 0.35, roughness: 0.3 });
  const blackMatte = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, metalness: 0.2, roughness: 0.7 });
  // Light strips run brighter than 1.0 so they bloom while lit surfaces do not.
  const warmGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(WARM).multiplyScalar(2.2), toneMapped: false });
  const whiteGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4e6).multiplyScalar(2.0), toneMapped: false });

  // Floor: polished marble over a mirror.
  const marbleMap = canvasTexture(1024, 1024, (g, w, h) => drawMarble(g, w, h, '#b9b4ad', ['#6f6a64', '#8f8a83', '#ffffff'], 21, 120));
  marbleMap.wrapS = marbleMap.wrapT = THREE.RepeatWrapping;
  marbleMap.repeat.set(3, 3);
  group.add(buildMirrorFloor(R + 1, new THREE.MeshStandardMaterial({
    map: marbleMap, color: 0x8c8781, roughness: 0.24, metalness: 0.0, transparent: true, opacity: 0.8,
  }), 0x8a8a8a));

  // Night city outside the glass.
  const outside = new THREE.Mesh(
    new THREE.CylinderGeometry(34, 34, 40, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: skylineTexture(), side: THREE.BackSide, fog: false })
  );
  outside.position.y = 8;
  outside.rotation.y = Math.PI * 0.6;
  group.add(outside);

  // Walls round the hall: glass with bronze mullions, broken by the brand wall
  // (back), the LED screens (left) and the display wall (right).
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0c1220, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false,
  });
  const solid = new THREE.MeshStandardMaterial({ color: 0x100e0d, metalness: 0.3, roughness: 0.6 });
  for (let deg = -180; deg < 180; deg += 10) {
    const mid = deg + 5;
    const isGlass = (mid > 32 && mid < 200) || mid < -150;
    const chord = 2 * R * Math.sin(toRad(5));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(chord, H), isGlass ? glass : solid);
    panel.position.copy(polar(mid, R * Math.cos(toRad(5)))).setY(H / 2);
    faceCentre(panel, mid);
    group.add(panel);
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.1, H, 0.14), isGlass ? bronze : solid);
    mullion.position.copy(polar(deg, R)).setY(H / 2);
    faceCentre(mullion, deg);
    group.add(mullion);
  }

  // Brand wall: marble slab between lit bronze pillars, over a raised step.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(8.6, 5.3, 0.2), new THREE.MeshStandardMaterial({
    map: brandWallTexture(), roughness: 0.25, metalness: 0.1,
  }));
  slab.position.set(0, 3.25, -R + 0.9);
  group.add(slab);
  [-1, 1].forEach((side) => {
    const pillar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.1, H, 0.9), bronze), false);
    pillar.position.set(side * 5.0, H / 2, -R + 1.0);
    group.add(pillar);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 5.6, 0.05), whiteGlow);
    strip.position.set(side * 4.42, 3.3, -R + 1.47);
    group.add(strip);
    const outerStrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 4.8, 0.05), warmGlow);
    outerStrip.position.set(side * 6.3, 3.2, -R + 1.6);
    group.add(outerStrip);
  });
  const header = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.9, 1.0), blackMatte);
  header.position.set(0, H - 0.45, -R + 1.0);
  group.add(header);
  const step = shadowed(new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.28, 1.8), blackGloss), false);
  step.position.set(0, 0.14, -R + 1.8);
  group.add(step);
  const stepGlow = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.03, 0.04), warmGlow);
  stepGlow.position.set(0, 0.03, -R + 2.72);
  group.add(stepGlow);

  // LED story screens down the left side.
  [-58, -78, -98].forEach((deg, i) => {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 5.0), new THREE.MeshBasicMaterial({
      map: screenTexture(i), color: 0xd0d0d0,
    }));
    screen.position.copy(polar(deg, R - 0.45)).setY(3.1);
    faceCentre(screen, deg);
    group.add(screen);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(2.45, 5.15, 0.12), blackMatte);
    bezel.position.copy(polar(deg, R - 0.38)).setY(3.1);
    faceCentre(bezel, deg);
    group.add(bezel);
  });

  // Ceiling: dark, with a stepped round recess ringed in light over the stage.
  const ceiling = new THREE.Mesh(new THREE.CircleGeometry(R + 1, 96), blackMatte);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  group.add(ceiling);
  [[4.4, H - 0.02, 0.08], [6.6, H - 0.55, 0.06], [8.9, H - 0.02, 0.05]].forEach(([radius, y, tube]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 12, 160), whiteGlow);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  });
  const drop = new THREE.Mesh(new THREE.CylinderGeometry(6.7, 6.7, 0.55, 128, 1, true), new THREE.MeshStandardMaterial({
    color: 0x0b0b0c, roughness: 0.6, side: THREE.DoubleSide,
  }));
  drop.position.y = H - 0.27;
  group.add(drop);
  const downlights: THREE.BufferGeometry[] = [];
  for (let deg = 0; deg < 360; deg += 15) {
    const d = new THREE.CircleGeometry(0.07, 16);
    d.rotateX(Math.PI / 2);
    const p = polar(deg, 10.1);
    d.translate(p.x, H - 0.01, p.z);
    downlights.push(d);
  }
  group.add(new THREE.Mesh(mergeGeometries(downlights), whiteGlow));

  // Turntable: dark glossy disc floating on a ring of warm light.
  const stageBase = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.08, 128), blackMatte);
  stageBase.position.y = 0.04;
  group.add(stageBase);
  // Satin, not mirror: the orbit camera looks at it from every side, and a
  // mirror-gloss top threw each light back as a bloom blob.
  const stageSatin = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, metalness: 0.3, roughness: 0.55 });
  const stageTop = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3.95, 3.85, SHOWROOM_STAGE_TOP - 0.08, 128), stageSatin), false);
  stageTop.position.y = 0.08 + (SHOWROOM_STAGE_TOP - 0.08) / 2;
  group.add(stageTop);
  const underGlow = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.035, 8, 160), warmGlow);
  underGlow.rotation.x = Math.PI / 2;
  underGlow.position.y = 0.07;
  group.add(underGlow);

  // Lounge on the right, in front of the glass, with its lamp and display wall.
  const lounge = buildLounge(new THREE.MeshStandardMaterial({ color: 0xb9b3ab, roughness: 0.9 }), blackGloss, bronze);
  lounge.position.copy(polar(62, 7.4));
  faceCentre(lounge, 62);
  group.add(lounge);
  const lamp = buildArcLamp(blackGloss, warmGlow);
  lamp.position.copy(polar(48, 9.3));
  lamp.rotation.y = -toRad(48) + Math.PI * 0.75;
  group.add(lamp);
  const display = buildDisplayWall(solid, warmGlow);
  display.position.copy(polar(38, R - 0.6));
  faceCentre(display, 38);
  group.add(display);

  // Trees in black planters, lit from the pot.
  const planter = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, metalness: 0.4, roughness: 0.4 });
  [[-34, 8.9, 5, 2.6], [-66, 9.7, 13, 1.7], [-88, 9.7, 17, 1.6], [104, 9.6, 23, 2.2], [-125, 9.6, 29, 2.3],
   [150, 9.6, 31, 2.0], [-165, 9.6, 37, 2.0]].forEach(([deg, r, seed, h]) => {
    const tree = buildLeafyTree(seed, h, planter, warmGlow);
    tree.position.copy(polar(deg, r));
    group.add(tree);
  });

  // Light: warm key over the car, wall washers on the brand wall, soft fill.
  const target = new THREE.Object3D();
  target.position.set(0, 0.7, 0);
  group.add(target);
  const keyIntensity = 4.6;
  // Straight over the car, so its sheen on the stage never faces the orbit camera.
  const key = new THREE.SpotLight(0xfff2e2, keyIntensity, 26, Math.PI / 4.2, 0.85, 0.6);
  key.position.set(0, H - 0.4, 0);
  key.target = target;
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0008;
  group.add(key);
  const wallTarget = new THREE.Object3D();
  wallTarget.position.set(0, 3.2, -R + 0.9);
  group.add(wallTarget);
  [-3, 3].forEach((x) => {
    const washer = new THREE.SpotLight(WARM, 3.2, 12, Math.PI / 5, 0.9, 1.0);
    washer.position.set(x, H - 0.3, -R + 4.5);
    washer.target = wallTarget;
    group.add(washer);
  });
  // Fills sit high so their hotspots on the glossy stage fall outside the orbit view.
  [[-7, 6.8, 5], [7, 6.8, -4]].forEach(([x, y, z]) => {
    const fill = new THREE.SpotLight(0xffe6cc, 1.6, 22, Math.PI / 3.2, 0.95, 0.8);
    fill.position.set(x, y, z);
    fill.target = target;
    group.add(fill);
  });

  group.visible = false;
  return {
    group,
    background: new THREE.Color(0x05060b),
    ambientColor: 0xffe9d2,
    ambientIntensity: 0.14,
    // The studio probe's light panels flared off the polished floor at grazing
    // angles; the mirror floor already supplies the real reflections here.
    environmentIntensity: 0.28,
    keyLight: key,
    keyIntensity,
    bloom: { threshold: 1.4, strengthFactor: 0.3 },
    setAccent: (color) => warmGlow.color.setHex(color).multiplyScalar(2.2),
  };
};
