import * as THREE from 'three';

export interface TrackConfig {
  id: string;
  name: string;
  description: string;
  timeLimit: number;
  roadWidth: number;
  hasObstacles: boolean;
  requiresLicense: boolean;
  baseReward: number;
  path: THREE.Vector3[];
  HaveCrub: boolean;
  HaveFence: boolean;
  FenceType?: 'guardrail' | 'silverstone';
  HaveGrass?: boolean;
  GrassWidth?: number;
  time?: 'afternoon' | 'evening' | 'night';
}

export const TRACKS_DATABASE: TrackConfig[] = [
  {
    id: 'license',
    name: 'License A-Test',
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
    description: 'Complex 3-lap winding track with active obstacles. Requires A-License.',
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
    id: 'tokyo_megaloop',
    name: 'Tokyo Megaloop',
    description: 'A massive, extra-wide high-speed 3-lap loop highway. Ideal for testing top speeds. Requires A-License.',
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
    path: [
      new THREE.Vector3(0, 2, -1200),
      new THREE.Vector3(1780, 2, -2210),
      new THREE.Vector3(2150, 2, -2140),
      new THREE.Vector3(2160, 2, -1870),
      new THREE.Vector3(280, 2, -640),
      new THREE.Vector3(970, 2, -250),
      new THREE.Vector3(960, 2, 330),
      new THREE.Vector3(240, 2, 70),
      new THREE.Vector3(-600, 2, 720),
      new THREE.Vector3(-1160, 2, 760),
      new THREE.Vector3(-880, 2, 270),
      new THREE.Vector3(-1570, 2, -230),
      new THREE.Vector3(-1520, 2, -890),
      new THREE.Vector3(-630, 2, -830)
    ],
    HaveCrub: true,
    HaveFence: true,
    FenceType: 'silverstone',
    HaveGrass: true,
    GrassWidth: 6.0,
    time: 'evening'
  }
];
