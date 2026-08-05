import * as THREE from 'three';
import { SceneryType, TimeOfDay } from '../engine/types';

export interface TrackNode {
  pos: THREE.Vector3;
  width?: number; // Override road width at this node
  banking?: number; // Bank angle in degrees
  curb?: boolean; // Override both curbs at this node
  leftCurb?: boolean;
  rightCurb?: boolean;
  grassWidth?: number; // Override both grass strips. 0 disables grass locally.
  leftGrassWidth?: number;
  rightGrassWidth?: number;
  fence?: boolean; // Override both fences at this node
  leftFence?: boolean;
  rightFence?: boolean;
  sharp?: boolean; // Meet the neighbouring runs as a hard corner instead of a smooth spline
  cornerRadius?: number; // Fillet setback from the vertex. Only used when sharp.
}

export interface TrackScenery {
  type: SceneryType;
  position: THREE.Vector3;
  scale?: number;
  heightScale?: number;
  depthScale?: number;
  rotation?: number;
  variant?: number;
}

export interface TrackConfig {
  id: string;
  name: string;
  description: string;
  timeLimit: number;
  roadWidth: number;
  hasObstacles: boolean;
  requiresLicense: boolean;
  baseReward: number;
  path: (THREE.Vector3 | TrackNode)[];
  curveType?: 'centripetal' | 'chordal' | 'catmullrom';
  tension?: number;
  scenery?: TrackScenery[];
  HaveCrub: boolean;
  HaveFence: boolean;
  FenceType?: 'guardrail' | 'silverstone';
  HaveGrass?: boolean;
  GrassWidth?: number;
  time?: TimeOfDay;
  /**
   * Distance at which the horizon fully fades into the sky colour. Omit for the
   * per-time default; 0 switches fog off entirely.
   */
  fogDistance?: number;
}

export const TRACKS_DATABASE: TrackConfig[] = [
  {
    id: 'license',
    name: 'Bronze License Trial',
    description: 'Pass through all checkpoint rings within the time limit. Unlocks the Pro Race and Hypercars.',
    timeLimit: 35,
    roadWidth: 18,
    hasObstacles: false,
    requiresLicense: false,
    baseReward: 500,
    path: [
      new THREE.Vector3(0, 2, -20),
      new THREE.Vector3(15, 2, -50),
      new THREE.Vector3(45, 2, -70),
      new THREE.Vector3(60, 2, -40),
      new THREE.Vector3(40, 2, -10),
      new THREE.Vector3(0, 2, 10),
      new THREE.Vector3(-30, 2, 30),
      new THREE.Vector3(-60, 2, 10),
      new THREE.Vector3(-50, 2, -30),
      new THREE.Vector3(-15, 2, -10),
      new THREE.Vector3(0, 2, 12)
    ],
    HaveCrub: true,
    HaveFence: false,
    time: 'afternoon'
  },
  {
    id: 'sprint_circuit',
    name: 'Sprint Circuit',
    description: 'A quick 3-lap loop race. Get Gold by finishing in under 25 seconds.',
    timeLimit: 40,
    roadWidth: 18,
    hasObstacles: false,
    requiresLicense: false,
    baseReward: 300, // Gold awards 1000, Silver 600, Bronze 300
    path: [
      new THREE.Vector3(0, 2, -40),
      new THREE.Vector3(30, 2, -80),
      new THREE.Vector3(80, 2, -80),
      new THREE.Vector3(100, 2, -30),
      new THREE.Vector3(80, 2, 20),
      new THREE.Vector3(30, 2, 40),
      new THREE.Vector3(-30, 2, 40),
      new THREE.Vector3(-70, 2, 10),
      new THREE.Vector3(-50, 2, -30),
      new THREE.Vector3(0, 2, 12)
    ],
    HaveCrub: true,
    HaveFence: true,
    time: 'afternoon'
  },
  {
    id: 'pro_race',
    name: 'Pro Hyper-Race',
    description: 'Complex 3-lap winding track with active obstacles. Requires Bronze License.',
    timeLimit: 45,
    roadWidth: 18,
    hasObstacles: false,
    requiresLicense: true,
    baseReward: 300, // Gold awards 1000, Silver 600, Bronze 300
    path: [
      new THREE.Vector3(0, 2, -30),
      new THREE.Vector3(20, 2, -60),
      new THREE.Vector3(60, 2, -80),
      new THREE.Vector3(90, 2, -110),
      new THREE.Vector3(120, 2, -90),
      new THREE.Vector3(100, 2, -40),
      new THREE.Vector3(60, 2, -15),
      new THREE.Vector3(80, 2, 30),
      new THREE.Vector3(90, 2, 70),
      new THREE.Vector3(50, 2, 100),
      new THREE.Vector3(10, 2, 75),
      new THREE.Vector3(-20, 2, 40),
      new THREE.Vector3(-60, 2, 70),
      new THREE.Vector3(-100, 2, 50),
      new THREE.Vector3(-80, 2, 0),
      new THREE.Vector3(-40, 2, -20),
      new THREE.Vector3(0, 2, 12)
    ],
    HaveCrub: true,
    HaveFence: true,
    FenceType: 'silverstone',
    time: 'night'
  },
  {
    id: 'fuji_speedway',
    name: 'Swordfish Racing Course',
    description: 'A Medium size map with many difficult corners to negotiate with. Perfect for trying to master cornering',
    timeLimit: 55,
    roadWidth: 30,
    hasObstacles: false,
    requiresLicense: true,
    baseReward: 5000,
    curveType: 'catmullrom',
    tension: 0.8, // Make curves tighter
    path: [
      new THREE.Vector3(-10, 2, 0),
      new THREE.Vector3(700, 2, 0),
      new THREE.Vector3(610, 2, 110),
      new THREE.Vector3(260, 2, 190),
      new THREE.Vector3(180, 2, 390),
      new THREE.Vector3(80, 2, 440),
      new THREE.Vector3(0, 2, 400),
      new THREE.Vector3(10, 2, 190),
      new THREE.Vector3(-130, 2, 220),
      new THREE.Vector3(-200, 2, 340),
      new THREE.Vector3(-720, 2, 410),
      new THREE.Vector3(-710, 2, 340),
      new THREE.Vector3(-760, 2, 320),
      new THREE.Vector3(-790, 2, 210),
      new THREE.Vector3(-640, 2, 200),
      new THREE.Vector3(-640, 2, 110),
      new THREE.Vector3(-890, 2, 100),
      new THREE.Vector3(-880, 2, 20),
      new THREE.Vector3(-780, 2, -10)
    ],
    scenery: [
    ],
    HaveCrub: true,
    HaveFence: true,
    HaveGrass: true,
    GrassWidth: 6.0,
    time: 'afternoon'
  },
  {
    id: 'tokyo_megaloop',
    name: 'Tokyo Megaloop',
    description: 'A massive, extra-wide high-speed 3-lap loop highway. Ideal for testing top speeds. Requires Bronze License.',
    timeLimit: 55,
    roadWidth: 22,
    hasObstacles: false,
    requiresLicense: true,
    baseReward: 300, // Gold awards 1000, Silver 600, Bronze 300
    path: [
      new THREE.Vector3(0, 2, -50),
      new THREE.Vector3(40, 2, -100),
      new THREE.Vector3(100, 2, -150),
      new THREE.Vector3(160, 2, -120),
      new THREE.Vector3(180, 2, -60),
      new THREE.Vector3(150, 2, 20),
      new THREE.Vector3(100, 2, 80),
      new THREE.Vector3(40, 2, 130),
      new THREE.Vector3(-40, 2, 130),
      new THREE.Vector3(-100, 2, 80),
      new THREE.Vector3(-150, 2, 20),
      new THREE.Vector3(-180, 2, -60),
      new THREE.Vector3(-140, 2, -120),
      new THREE.Vector3(-80, 2, -150),
      new THREE.Vector3(0, 2, 12)
    ],
    HaveCrub: false,
    HaveFence: true,
    time: 'night'
  },
  {
    id: 'canopy_speedway',
    name: 'Canopy Speedway',
    description: 'A beginner-friendly 3-lap speedway. Great for racing and high-speed test drives.',
    timeLimit: 55,
    roadWidth: 30,
    hasObstacles: false,
    requiresLicense: false,
    baseReward: 300, // Gold awards 1000, Silver 600, Bronze 300
    path: [
      new THREE.Vector3(0, 5, -250),
      new THREE.Vector3(134, 5, -231),
      new THREE.Vector3(247, 5, -177),
      new THREE.Vector3(323, 5, -96),
      new THREE.Vector3(350, 5, 0),
      new THREE.Vector3(323, 5, 96),
      new THREE.Vector3(247, 5, 177),
      new THREE.Vector3(134, 5, 231),
      new THREE.Vector3(0, 5, 250),
      new THREE.Vector3(-134, 5, 231),
      new THREE.Vector3(-247, 5, 177),
      new THREE.Vector3(-323, 5, 96),
      new THREE.Vector3(-350, 5, 0),
      new THREE.Vector3(-323, 5, -96),
      new THREE.Vector3(-247, 5, -177),
      new THREE.Vector3(-134, 5, -231)
    ],
    HaveCrub: true,
    HaveFence: false,
    time: 'afternoon'
  },
  {
    id: 'east_hill_mountain',
    name: 'East Hill Mountain',
    description: 'A long grassland field track among the mountain with a challenging curve',
    timeLimit: 55,
    roadWidth: 30,
    hasObstacles: false,
    requiresLicense: true,
    baseReward: 5000,
    curveType: 'catmullrom',
    tension: 0.8, // Make curves tighter
    path: [
      { pos: new THREE.Vector3(0, 2, -1200), width: 30 },
      { pos: new THREE.Vector3(1780, 2, -2210), width: 45 }, // Widen corner
      { pos: new THREE.Vector3(2150, 2, -2140), width: 40 },
      { pos: new THREE.Vector3(2160, 2, -1870), width: 35 },
      { pos: new THREE.Vector3(280, 2, -640), width: 25 }, // Narrow straight
      { pos: new THREE.Vector3(970, 2, -250), width: 30 },
      { pos: new THREE.Vector3(960, 2, 330), width: 30 },
      { pos: new THREE.Vector3(240, 2, 70), width: 40 }, // Wide corner
      { pos: new THREE.Vector3(-600, 2, 720), width: 30 },
      { pos: new THREE.Vector3(-1160, 2, 760), width: 30 },
      { pos: new THREE.Vector3(-880, 2, 270), width: 25 },
      { pos: new THREE.Vector3(-1570, 2, -230), width: 30 },
      { pos: new THREE.Vector3(-1520, 2, -890), width: 30 },
      { pos: new THREE.Vector3(-630, 2, -830), width: 30 }
    ],
    scenery: [
      { type: 'hill', position: new THREE.Vector3(1200, 0, -1500), scale: 8 },
      { type: 'hill', position: new THREE.Vector3(400, 0, -100), scale: 6 },
      { type: 'hill', position: new THREE.Vector3(-1000, 0, 0), scale: 10 },
      { type: 'tree', position: new THREE.Vector3(100, 0, -1100), scale: 2 },
      { type: 'tree', position: new THREE.Vector3(150, 0, -1150), scale: 1.5 },
      { type: 'tree', position: new THREE.Vector3(200, 0, -1050), scale: 2.2 },
      { type: 'tree', position: new THREE.Vector3(-400, 0, -500), scale: 1.8 }
    ],
    HaveCrub: true,
    HaveFence: true,
    FenceType: 'silverstone',
    HaveGrass: true,
    GrassWidth: 6.0,
    time: 'evening'
  },
  {
    id: 'driver_dojo',
    name: 'Driver Dojo Proving Grounds',
    description: 'An imaginary test-driver circuit with a full-throttle runway, hairpins, sweepers, esses, chicanes, banking, and tightening-radius corners.',
    timeLimit: 120,
    roadWidth: 32,
    hasObstacles: false,
    requiresLicense: false,
    baseReward: 1200,
    curveType: 'catmullrom',
    tension: 0.72,
    path: [
      { pos: new THREE.Vector3(-920, 2, -760), width: 48, banking: 0 },
      { pos: new THREE.Vector3(-240, 2, -760), width: 50, banking: 0 },
      { pos: new THREE.Vector3(620, 2, -760), width: 52, banking: 0 },
      { pos: new THREE.Vector3(1540, 2, -760), width: 54, banking: 0 },
      { pos: new THREE.Vector3(1830, 2, -560), width: 46, banking: 6, curb: true, grassWidth: 8, fence: true },
      { pos: new THREE.Vector3(1700, 2, -250), width: 38, banking: 10, curb: true, grassWidth: 8, fence: true },
      { pos: new THREE.Vector3(1300, 2, -110), width: 34, banking: 7, curb: true, grassWidth: 7, fence: true },
      { pos: new THREE.Vector3(1010, 2, -310), width: 30, banking: -3, curb: true, grassWidth: 6 },
      { pos: new THREE.Vector3(1160, 2, -560), width: 28, banking: -5, curb: true, grassWidth: 5 },
      { pos: new THREE.Vector3(1450, 2, -500), width: 32, banking: 4, curb: true, grassWidth: 5 },
      { pos: new THREE.Vector3(1560, 2, -120), width: 34, banking: 8, curb: true, grassWidth: 7, fence: true },
      { pos: new THREE.Vector3(1300, 2, 160), width: 36, banking: 5, curb: true, grassWidth: 7, fence: true },
      { pos: new THREE.Vector3(850, 2, 210), width: 28, banking: -4, curb: true, grassWidth: 5 },
      { pos: new THREE.Vector3(620, 2, 20), width: 26, banking: 0, curb: true, grassWidth: 4 },
      { pos: new THREE.Vector3(760, 2, -170), width: 26, banking: 0, curb: true, grassWidth: 4 },
      { pos: new THREE.Vector3(520, 2, -320), width: 28, banking: 0, curb: true, grassWidth: 5 },
      { pos: new THREE.Vector3(180, 2, -200), width: 30, banking: 3, curb: true, grassWidth: 6 },
      { pos: new THREE.Vector3(20, 2, 90), width: 34, banking: 7, curb: true, grassWidth: 7, fence: true },
      { pos: new THREE.Vector3(220, 2, 410), width: 38, banking: 11, curb: true, grassWidth: 8, fence: true },
      { pos: new THREE.Vector3(650, 2, 520), width: 40, banking: 12, curb: true, grassWidth: 8, fence: true },
      { pos: new THREE.Vector3(980, 2, 390), width: 34, banking: 5, curb: true, grassWidth: 6, fence: true },
      { pos: new THREE.Vector3(1100, 2, 680), width: 30, banking: -6, curb: true, grassWidth: 6 },
      { pos: new THREE.Vector3(720, 2, 930), width: 28, banking: -4, curb: true, grassWidth: 5 },
      { pos: new THREE.Vector3(330, 2, 780), width: 26, banking: 0, curb: true, grassWidth: 4 },
      { pos: new THREE.Vector3(90, 2, 1000), width: 26, banking: 0, rightCurb: true, rightGrassWidth: 4 },
      { pos: new THREE.Vector3(-250, 2, 830), width: 28, banking: 3, leftCurb: true, leftGrassWidth: 5 },
      { pos: new THREE.Vector3(-140, 2, 560), width: 26, banking: -3, rightCurb: true, rightGrassWidth: 4 },
      { pos: new THREE.Vector3(-470, 2, 410), width: 26, banking: 0, curb: true, grassWidth: 5 },
      { pos: new THREE.Vector3(-760, 2, 620), width: 34, banking: 8, curb: true, grassWidth: 8, fence: true },
      { pos: new THREE.Vector3(-1120, 2, 520), width: 36, banking: 10, curb: true, grassWidth: 9, fence: true },
      { pos: new THREE.Vector3(-1350, 2, 150), width: 34, banking: 6, curb: true, grassWidth: 8, fence: true },
      { pos: new THREE.Vector3(-1260, 2, -210), width: 30, banking: -5, curb: true, grassWidth: 6, fence: true },
      { pos: new THREE.Vector3(-1500, 2, -390), width: 28, banking: -8, curb: true, grassWidth: 6, fence: true },
      { pos: new THREE.Vector3(-1320, 2, -690), width: 34, banking: 4, curb: true, grassWidth: 6, fence: true }
    ],
    scenery: [
      { type: 'podium', position: new THREE.Vector3(-940, 0, -830), scale: 1.8, rotation: 0 },
      { type: 'mountain', position: new THREE.Vector3(1950, 0, -150), scale: 7, heightScale: 1.5 },
      { type: 'hill', position: new THREE.Vector3(980, 0, 1080), scale: 8 },
      { type: 'hill', position: new THREE.Vector3(-1320, 0, 720), scale: 7 },
      { type: 'rock', position: new THREE.Vector3(430, 0, -520), scale: 2.2 },
      { type: 'rock', position: new THREE.Vector3(-980, 0, -360), scale: 2.6 },
      { type: 'tree1', position: new THREE.Vector3(-780, 0, 780), scale: 2.0 },
      { type: 'tree2', position: new THREE.Vector3(-620, 0, 700), scale: 1.7 },
      { type: 'tree3', position: new THREE.Vector3(1180, 0, 760), scale: 2.1 },
      { type: 'tree', position: new THREE.Vector3(1390, 0, 610), scale: 1.9 }
    ],
    HaveCrub: false,
    HaveFence: false,
    FenceType: 'silverstone',
    HaveGrass: false,
    GrassWidth: 0,
    time: 'afternoon'
  }
];
