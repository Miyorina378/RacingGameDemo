import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHOWROOM_STAGE_TOP, ShowroomRoom } from './ShowroomRooms';
import {
  buildLeafyTree, buildMirrorFloor, canvasTexture, drawMark, drawMarble, faceCentre, makeRandom, polar, shadowed, toRad,
} from './ShowroomKit';

/**
 * New & used car showroom: a bright white gallery. The back wall is a backlit
 * feature wall flanked by "new arrivals" and "quality used cars" screens. On
 * the left are the welcome wall and reception desk; on the right, full-height
 * glass onto a daytime city by the water. Round café tables, plants, a
 * ring-lit ceiling and a white turntable complete it.
 */

export const WHITE_TAGLINE = 'DRIVE YOUR NEXT CHAPTER';

const R = 11;
const H = 7.2;
const TEXT = '#23252a';
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

// ---------------------------------------------------------------- textures

const featureWallTexture = () => canvasTexture(2048, 1180, (g, w, h) => {
  g.fillStyle = '#f4f4f2';
  g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w / 2, h * 0.45, 50, w / 2, h * 0.45, w * 0.6);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(1, 'rgba(225,225,222,0.6)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  drawMark(g, w / 2 - 140, h * 0.3, 200, '#2c2e33');
  g.fillStyle = TEXT;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 52px ${FONT}`;
  const letters = WHITE_TAGLINE.split('');
  letters.forEach((ch, i) => g.fillText(ch, w / 2 + (i - (letters.length - 1) / 2) * 46, h * 0.58));
});

const welcomeWallTexture = () => canvasTexture(1600, 1000, (g, w, h) => {
  g.fillStyle = '#f2f2f0';
  g.fillRect(0, 0, w, h);
  g.fillStyle = TEXT;
  g.textBaseline = 'alphabetic';
  const spaced = (text: string, x: number, y: number, px: number, weight: number, gap: number) => {
    g.font = `${weight} ${px}px ${FONT}`;
    let cx = x;
    for (const ch of text) {
      g.fillText(ch, cx, y);
      cx += g.measureText(ch).width + gap;
    }
  };
  spaced('NEW & USED CARS', 110, 330, 100, 500, 14);
  spaced('GOOD CARS', 116, 470, 50, 500, 8);
  spaced('BETTER JOURNEYS', 116, 540, 50, 500, 8);
  g.fillRect(118, 600, 220, 3);
});

/** Daytime city across the water. */
const daySkylineTexture = () => canvasTexture(4096, 1024, (g, w, h) => {
  const random = makeRandom(7);
  const sky = g.createLinearGradient(0, 0, 0, h * 0.72);
  sky.addColorStop(0, '#6fa8dc');
  sky.addColorStop(0.7, '#bcd9f0');
  sky.addColorStop(1, '#e6f0f8');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {               // soft clouds
    const x = random() * w, y = h * (0.1 + random() * 0.35), r = 80 + random() * 200;
    const c = g.createRadialGradient(x, y, 0, x, y, r);
    c.addColorStop(0, 'rgba(255,255,255,0.55)');
    c.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = c;
    g.fillRect(x - r, y - r * 0.5, r * 2, r);
  }
  const horizon = h * 0.72;
  g.fillStyle = '#9fb3c4';
  g.beginPath();
  g.moveTo(0, horizon);
  for (let x = 0; x <= w; x += 32) g.lineTo(x, horizon - 40 - 50 * Math.abs(Math.sin(x * 0.0015)));
  g.lineTo(w, horizon);
  g.fill();
  let x = 0;
  while (x < w) {
    const bw = 30 + random() * 70;
    const bh = 40 + random() * 150 + (random() < 0.15 ? 180 + random() * 150 : 0);
    const shade = 150 + Math.floor(random() * 60);
    g.fillStyle = `rgb(${shade - 20},${shade},${shade + 20})`;
    g.fillRect(x, horizon - bh, bw, bh);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let wy = horizon - bh + 6; wy < horizon - 4; wy += 10) g.fillRect(x + 3, wy, bw - 6, 2);
    x += bw + random() * 30;
  }
  const water = g.createLinearGradient(0, horizon, 0, h);
  water.addColorStop(0, '#7fa7c4');
  water.addColorStop(1, '#4f7ea3');
  g.fillStyle = water;
  g.fillRect(0, horizon, w, h - horizon);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(random() * w, horizon + 4 + random() * (h - horizon), 4 + random() * 20, 1);
  }
});

/** Portrait screen: a sunny mountain road with a caption. */
const promoScreenTexture = (lines: string[], seed: number) => canvasTexture(600, 1140, (g, w, h) => {
  const random = makeRandom(seed);
  const sky = g.createLinearGradient(0, 0, 0, h * 0.5);
  sky.addColorStop(0, '#8fb9e0');
  sky.addColorStop(1, '#e8f1f8');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const ridge = (y: number, amp: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) g.lineTo(x, y - amp * Math.abs(Math.sin(x * 0.012 + y * 0.01)) - random() * amp * 0.25);
    g.lineTo(w, h);
    g.fill();
  };
  ridge(h * 0.45, 150, '#9aaec0');
  ridge(h * 0.55, 110, '#6f8f6a');
  ridge(h * 0.66, 70, '#58784f');
  // Road running into the distance.
  g.fillStyle = '#5f646b';
  g.beginPath();
  g.moveTo(w * 0.2, h); g.lineTo(w * 0.47, h * 0.62); g.lineTo(w * 0.53, h * 0.62); g.lineTo(w * 0.8, h);
  g.fill();
  g.strokeStyle = '#f2f2f2';
  g.lineWidth = 3;
  g.setLineDash([22, 18]);
  g.beginPath();
  g.moveTo(w * 0.5, h); g.lineTo(w * 0.5, h * 0.63);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,255,255,0.0)';
  g.fillStyle = '#ffffff';
  g.font = `500 44px ${FONT}`;
  lines.forEach((line, i) => g.fillText(line, 44, 90 + i * 56));
  drawMark(g, 46, 90 + lines.length * 56, 40, '#ffffff');
});

const bannerTexture = () => canvasTexture(400, 1400, (g, w, h) => {
  g.fillStyle = '#f5f5f3';
  g.fillRect(0, 0, w, h);
  drawMark(g, w / 2 - 70, 220, 110, '#3a3c42');
  g.fillStyle = TEXT;
  g.font = `400 34px ${FONT}`;
  ['TRUST', 'QUALITY', 'VALUE'].forEach((word, i) => g.fillText(word, 70, 820 + i * 56));
  g.fillRect(72, 1020, 120, 3);
});

// ---------------------------------------------------------------- pieces

const buildChair = (shell: THREE.Material, legs: THREE.Material): THREE.Group => {
  const group = new THREE.Group();
  const seat = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.08, 0.48, 3, 0.03), shell));
  seat.position.y = 0.46;
  group.add(seat);
  const back = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.42, 0.07, 3, 0.03), shell));
  back.position.set(0, 0.72, -0.22);
  back.rotation.x = -0.12;
  group.add(back);
  [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.44, 8), legs);
    leg.position.set(x, 0.22, z);
    group.add(leg);
  });
  return group;
};

/** Round café table with three chairs round it. */
const buildCafeSet = (shell: THREE.Material, top: THREE.Material, metal: THREE.Material): THREE.Group => {
  const group = new THREE.Group();
  const slab = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 40), top));
  slab.position.y = 0.74;
  group.add(slab);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 16), metal);
  stem.position.y = 0.36;
  group.add(stem);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.025, 32), metal);
  foot.position.y = 0.012;
  group.add(foot);
  [0, 120, 240].forEach((deg) => {
    const chair = buildChair(shell, metal);
    chair.position.set(Math.sin(toRad(deg)) * 0.85, 0, Math.cos(toRad(deg)) * 0.85);
    chair.rotation.y = toRad(deg) + Math.PI;
    group.add(chair);
  });
  return group;
};

/** Slim information kiosk: a pedestal with a tilted screen. */
const buildKiosk = (body: THREE.Material, screen: THREE.Material): THREE.Group => {
  const group = new THREE.Group();
  const post = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.28, 1.1, 0.12, 3, 0.03), body));
  post.position.y = 0.55;
  group.add(post);
  const head = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.46, 0.05, 3, 0.02), body));
  head.position.set(0, 1.3, 0);
  head.rotation.x = -0.2;
  group.add(head);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.38), screen);
  display.position.set(0, 1.305, 0.028);
  display.rotation.x = -0.2;
  group.add(display);
  return group;
};

// ---------------------------------------------------------------- room

export const buildWhiteRoom = (): ShowroomRoom => {
  const group = new THREE.Group();
  // Off-white surfaces: the lights, not the albedo, make the room read white,
  // so shading and light pools stay visible instead of clipping flat.
  const white = new THREE.MeshStandardMaterial({ color: 0xd6d6d2, roughness: 0.75 });
  const whiteSatin = new THREE.MeshStandardMaterial({ color: 0xdededa, roughness: 0.4, metalness: 0.05 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xc4c4c0, roughness: 0.85 });
  const champagne = new THREE.MeshStandardMaterial({ color: 0xc9b89f, metalness: 0.7, roughness: 0.35 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc7cbd0, metalness: 0.9, roughness: 0.3 });
  const greyTop = new THREE.MeshStandardMaterial({ color: 0x8e9196, roughness: 0.4 });
  // Light lines run above 1.0 so they glow gently over a high bloom threshold.
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.0), toneMapped: false });
  const accentGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8f4ff).multiplyScalar(2.0), toneMapped: false });

  const marbleMap = canvasTexture(1024, 1024, (g, w, h) => drawMarble(g, w, h, '#f0f0ee', ['#cfcfcc', '#bdbdb9', '#e2e2df'], 5, 90));
  marbleMap.wrapS = marbleMap.wrapT = THREE.RepeatWrapping;
  marbleMap.repeat.set(3, 3);
  group.add(buildMirrorFloor(R + 1, new THREE.MeshStandardMaterial({
    map: marbleMap, color: 0xcfcfcb, roughness: 0.22, transparent: true, opacity: 0.86,
  }), 0x9a9a9a));

  // City by the water, seen through the right-hand glass.
  const outside = new THREE.Mesh(
    new THREE.CylinderGeometry(34, 34, 40, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: daySkylineTexture(), side: THREE.BackSide, fog: false })
  );
  outside.position.y = 8;
  outside.rotation.y = -Math.PI * 0.35;
  group.add(outside);

  // Walls: glass from the right round to the front, white elsewhere.
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdfeaf2, metalness: 0.05, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false,
  });
  for (let deg = -180; deg < 180; deg += 10) {
    const mid = deg + 5;
    const isGlass = mid > 45 && mid < 160;
    const chord = 2 * R * Math.sin(toRad(5));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(chord, H), isGlass ? glass : white);
    panel.position.copy(polar(mid, R * Math.cos(toRad(5)))).setY(H / 2);
    faceCentre(panel, mid);
    group.add(panel);
    if (isGlass) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, H, 0.1), steel);
      mullion.position.copy(polar(deg, R)).setY(H / 2);
      faceCentre(mullion, deg);
      group.add(mullion);
    }
  }
  // Banner pillars inside the glass.
  [70, 120].forEach((deg) => {
    const pillar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.1, H, 0.9), white), false);
    pillar.position.copy(polar(deg, R - 0.6)).setY(H / 2);
    faceCentre(pillar, deg);
    group.add(pillar);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.2), new THREE.MeshBasicMaterial({ map: bannerTexture(), color: 0xc4c4c0 }));
    banner.position.copy(polar(deg, R - 1.06)).setY(3.6);
    faceCentre(banner, deg);
    group.add(banner);
  });

  // Back: backlit feature wall between white pillars, flanked by promo screens.
  // Text walls are backlit panels (unlit material), so the lettering keeps its
  // contrast however bright the room is.
  const feature = new THREE.Mesh(new THREE.BoxGeometry(8.0, 4.6, 0.16), new THREE.MeshBasicMaterial({
    map: featureWallTexture(), color: 0xd2d2ce,
  }));
  feature.position.set(0, 2.9, -R + 1.0);
  group.add(feature);
  const frame: THREE.BufferGeometry[] = [];
  [[0, 5.24, 8.2, 0.04], [0, 0.56, 8.2, 0.04], [-4.1, 2.9, 0.04, 4.72], [4.1, 2.9, 0.04, 4.72]].forEach(([x, y, w, h]) => {
    const bar = new THREE.BoxGeometry(w, h, 0.04);
    bar.translate(x, y, -R + 0.9);
    frame.push(bar);
  });
  group.add(new THREE.Mesh(mergeGeometries(frame), accentGlow));
  [-1, 1].forEach((side) => {
    const pillar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.0, H, 1.0), white), false);
    pillar.position.set(side * 5.0, H / 2, -R + 1.1);
    group.add(pillar);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.04, 5.8, 0.04), glow);
    slit.position.set(side * 4.49, 3.3, -R + 1.62);
    group.add(slit);
  });
  const header = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.7, 1.1), white);
  header.position.set(0, H - 0.35, -R + 1.1);
  group.add(header);
  const screenMaterial = new THREE.MeshBasicMaterial({ color: 0xcfd9e6 });
  [[-34, ['NEW', 'ARRIVALS'], 3], [34, ['QUALITY', 'USED CARS'], 9]].forEach(([deg, lines, seed]) => {
    const d = deg as number;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 3.6), new THREE.MeshBasicMaterial({
      map: promoScreenTexture(lines as string[], seed as number), color: 0xe0e0e0,
    }));
    screen.position.copy(polar(d, R - 0.55)).setY(2.6);
    faceCentre(screen, d);
    group.add(screen);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.7, 0.08), steel);
    bezel.position.copy(polar(d, R - 0.5)).setY(2.6);
    faceCentre(bezel, d);
    group.add(bezel);
    const kiosk = buildKiosk(whiteSatin, screenMaterial);
    kiosk.position.copy(polar(d + Math.sign(d) * -9, R - 1.6));
    faceCentre(kiosk, d + Math.sign(d) * -9);
    group.add(kiosk);
    const cafe = buildCafeSet(whiteSatin, greyTop, steel);
    cafe.position.copy(polar(d + Math.sign(d) * 6, R - 3.6));
    group.add(cafe);
  });

  // Left: welcome wall, reception desk and champagne fins.
  const welcome = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 3.75), new THREE.MeshBasicMaterial({
    map: welcomeWallTexture(), color: 0xbdbdb9,
  }));
  // In front of the curved wall panels (they sit at R * cos 5deg).
  welcome.position.copy(polar(-80, R - 0.35)).setY(3.6);
  faceCentre(welcome, -80);
  group.add(welcome);
  const desk = shadowed(new THREE.Mesh(new RoundedBoxGeometry(3.6, 1.05, 0.8, 4, 0.08), whiteSatin));
  desk.position.copy(polar(-92, 8.6)).setY(0.525);
  faceCentre(desk, -92);
  group.add(desk);
  const deskGlow = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.02, 0.02), accentGlow);
  deskGlow.position.copy(polar(-92, 8.18)).setY(0.04);
  faceCentre(deskGlow, -92);
  group.add(deskGlow);
  const fins: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const deg = -60 + i * 1.6;
    const fin = new THREE.BoxGeometry(0.06, H - 0.4, 0.35);
    fin.rotateY(-toRad(deg));
    const p = polar(deg, R - 0.35);
    fin.translate(p.x, (H - 0.4) / 2, p.z);
    fins.push(fin);
  }
  group.add(shadowed(new THREE.Mesh(mergeGeometries(fins), champagne), false));

  // Ceiling: white, a stepped ring recess over the stage, track lights round it.
  const ceiling = new THREE.Mesh(new THREE.CircleGeometry(R + 1, 96), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  group.add(ceiling);
  [[4.6, H - 0.02, 0.07], [6.2, H - 0.5, 0.05], [7.8, H - 0.02, 0.05]].forEach(([radius, y, tube]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 12, 160), glow);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  });
  const drop = new THREE.Mesh(new THREE.CylinderGeometry(6.3, 6.3, 0.5, 128, 1, true), new THREE.MeshStandardMaterial({
    color: 0xcacac6, roughness: 0.7, side: THREE.DoubleSide,
  }));
  drop.position.y = H - 0.25;
  group.add(drop);
  const spots: THREE.BufferGeometry[] = [];
  for (let deg = 0; deg < 360; deg += 12) {
    const c = new THREE.CircleGeometry(0.06, 16);
    c.rotateX(Math.PI / 2);
    const p = polar(deg, 9.6);
    c.translate(p.x, H - 0.01, p.z);
    spots.push(c);
  }
  group.add(new THREE.Mesh(mergeGeometries(spots), glow));

  // Turntable: white satin disc on a ring of light.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.08, 128), steel);
  base.position.y = 0.04;
  group.add(base);
  const top = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3.95, 3.9, SHOWROOM_STAGE_TOP - 0.08, 128), whiteSatin), false);
  top.position.y = 0.08 + (SHOWROOM_STAGE_TOP - 0.08) / 2;
  group.add(top);
  const underGlow = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.03, 8, 160), accentGlow);
  underGlow.rotation.x = Math.PI / 2;
  underGlow.position.y = 0.07;
  group.add(underGlow);

  // Plants in white pots.
  const pot = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.5 });
  [[-44, 9.4, 3, 2.1], [44, 9.4, 11, 2.0], [-105, 9.3, 19, 2.4], [-70, 8.9, 25, 1.4], [150, 9.4, 33, 2.4],
   [-150, 9.4, 41, 2.3], [95, 9.6, 47, 2.2]].forEach(([deg, r, seed, h]) => {
    const tree = buildLeafyTree(seed, h, pot, pot);
    tree.position.copy(polar(deg, r));
    group.add(tree);
  });

  // Light: little ambient; the room is lit by real sources so it has shape.
  // Key over the car, sun through the glass (with shadows), wall washers that
  // scallop the walls and the feature wall, and a warm bounce from the front.
  const target = new THREE.Object3D();
  target.position.set(0, 0.7, 0);
  group.add(target);
  const keyIntensity = 5.2;
  const key = new THREE.SpotLight(0xfffaf2, keyIntensity, 26, Math.PI / 4.2, 0.8, 0.6);
  key.position.set(0, H - 0.4, 0);
  key.target = target;
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0008;
  group.add(key);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(14, 10, 3);
  sun.target = target;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.camera.left = -13;
  sun.shadow.camera.right = 13;
  sun.shadow.camera.top = 13;
  sun.shadow.camera.bottom = -13;
  sun.shadow.camera.far = 40;
  group.add(sun);
  // Washers: down-lights near the wall aimed at its foot, so each throws a
  // bright scallop fading up the wall.
  [-150, -115, -80, -45, 0, 45, 160].forEach((deg) => {
    const at = polar(deg, R - 0.6);
    const from = polar(deg, R - 1.6);
    const washer = new THREE.SpotLight(0xfff4e4, 2.6, 9, Math.PI / 5.5, 0.7, 1.2);
    washer.position.set(from.x, H - 0.2, from.z);
    const aim = new THREE.Object3D();
    aim.position.set(at.x, 0.4, at.z);
    group.add(aim);
    washer.target = aim;
    group.add(washer);
  });
  const bounce = new THREE.SpotLight(0xffe9cf, 1.2, 24, Math.PI / 3, 0.95, 0.8);
  bounce.position.set(0, 3.5, 9);
  bounce.target = target;
  group.add(bounce);

  group.visible = false;
  return {
    group,
    background: new THREE.Color(0xe9eef3),
    ambientColor: 0xffffff,
    ambientIntensity: 0.12,
    environmentIntensity: 0.32,
    keyLight: key,
    keyIntensity,
    bloom: { threshold: 1.25, strengthFactor: 0.2 },
    setAccent: (color) => accentGlow.color.setHex(color).multiplyScalar(2.0),
  };
};
