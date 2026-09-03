'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  Award,
  Compass,
  Trophy,
  Hammer,
  Flag,
  RotateCcw,
  LogOut,
  Check,
  Lock,
  Play,
  HelpCircle,
  Zap,
  Globe,
  ChevronRight,
  Maximize2,
  Minimize2,
  Sparkles,
  Flame,
  Layers,
  MapPin,
  Car,
  Building2,
  ExternalLink
} from 'lucide-react';
import { TRACKS_DATABASE, TrackConfig } from '../config/TrackDatabase';
import {
  LICENSE_TIERS,
  LICENSE_TESTS_BY_TIER,
  LicenseProgress,
  LicenseTier,
  getLicenseTierCompletion,
  isLicenseTestUnlocked
} from '../config/LicenseDatabase';
import EventTierScreen from './EventTierScreen';
import { CareerTierId } from '../config/CareerEventDatabase';

export interface CareerMapProps {
  playerCredits: number;
  hasLicense: boolean;
  licenseProgress: LicenseProgress;
  onBackToGarage: () => void;
  startRace: (trackId: string, layoutId?: string, entryFee?: number) => boolean;
  startFreeRoam: () => void;
  startTutorial: () => void;
  startLicenseTest: (testId?: string) => void;
  onOpenMapEditor: () => void;
  onNavigateToDealer?: () => void;
  brightness?: number;
}

export type CareerSectorId =
  | 'overview'
  | 'academy'
  | 'editor'
  | 'free_roam'
  | 'amateur'
  | 'intermediate'
  | 'professional';

interface SectorMeta {
  id: CareerSectorId;
  name: string;
  subtitle: string;
  tag: string;
  color: string;
  themeHex: number;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  position: [number, number, number]; // 3D coordinates on the Left Island
  cameraOffset: [number, number, number]; // Camera offset when focusing
  description: string;
  thumbnail: string;
  statsLabel: string;
}

// Gran Turismo 7 Luxury World Map Destinations (Positioned on the Left Motorsport Island)
const SECTORS: SectorMeta[] = [
  {
    id: 'amateur',
    name: 'Amateur Racing Field',
    subtitle: 'Clubman League & Oval Speedways',
    tag: 'TIER 1 RACING',
    color: '#38bdf8', // Sky Blue
    themeHex: 0x38bdf8,
    icon: Flag,
    position: [-22, 3.8, 20],
    cameraOffset: [-10, 14, 36],
    description: 'Entry-level competitive circuit events designed for beginner racing. Perfect for honing cornering lines and earning starter prize money.',
    thumbnail: '/images/amateur_sky_bg.jpg',
    statsLabel: '5 Events • 15 Stages Available'
  },
  {
    id: 'intermediate',
    name: 'Intermediate Racing Field',
    subtitle: 'Challenger Trophy & Forest Circuits',
    tag: 'TIER 2 RACING',
    color: '#a855f7', // Purple
    themeHex: 0xa855f7,
    icon: Zap,
    position: [-42, 5.0, 4],
    cameraOffset: [-28, 15, 20],
    description: 'Demanding mid-tier circuits featuring the high-speed Tokyo Megaloop and the twisty curves of Driver Dojo. Higher horsepower recommended.',
    thumbnail: '/images/intermediate_forest_bg.jpg',
    statsLabel: '5 Events • 15 Stages Available'
  },
  {
    id: 'professional',
    name: 'Professional Racing Field',
    subtitle: 'Grand Prix Masters & Apex Championships',
    tag: 'TIER 3 CHAMPIONSHIP',
    color: '#f43f5e', // Rose
    themeHex: 0xf43f5e,
    icon: Trophy,
    position: [-54, 7.5, 26],
    cameraOffset: [-38, 18, 42],
    description: 'High-stakes championship races against elite motorsport competitors on championship arenas. Requires verified driver license certification.',
    thumbnail: '/images/professional_racetrack_bg.jpg',
    statsLabel: '5 Events • High Credit Purses'
  },
  {
    id: 'academy',
    name: 'License Center',
    subtitle: 'Driver Licensing & Academy Complex',
    tag: '40 LICENSES & TRAINING',
    color: '#06b6d4', // Cyan
    themeHex: 0x06b6d4,
    icon: Award,
    position: [-48, 4.2, -18],
    cameraOffset: [-34, 14, -2],
    description: 'Master apex control, threshold braking, and racecraft across 4 license tiers. Complete exams to unlock high-tier championships and prototype race cars.',
    thumbnail: '/images/amateur_sky_bg.jpg',
    statsLabel: '40 Tests • 4 License Tiers'
  },
  {
    id: 'editor',
    name: 'Circuit Forge Studio',
    subtitle: 'Track Fabrication & Architecture Bay',
    tag: 'CUSTOM 3D BUILDER',
    color: '#f59e0b', // Amber
    themeHex: 0xf59e0b,
    icon: Hammer,
    position: [-16, 4.0, -14],
    cameraOffset: [-4, 13, 2],
    description: 'Design custom circuits with 3D terrain sculpting, road elevation, banking angles, curb placement, and scenery. Test drive your creations instantly.',
    thumbnail: '/images/amateur_sky_bg.jpg',
    statsLabel: '3D Splines & Terrain Sculpting'
  },
  {
    id: 'free_roam',
    name: 'Horizon Proving Grounds',
    subtitle: 'Coastal Highway & Open World Run',
    tag: 'FREE ROAM & DRIFT',
    color: '#10b981', // Emerald
    themeHex: 0x10b981,
    icon: Compass,
    position: [-36, 4.6, -34],
    cameraOffset: [-22, 16, -18],
    description: 'Cruise the boundless open highway, hit jump ramps, test top speeds, and link continuous drift combos to earn passive credit payouts.',
    thumbnail: '/images/amateur_sky_bg.jpg',
    statsLabel: 'Open Highway • Continuous Drift'
  }
];

// Helper to play synthesized audio blips
const playSoundBlip = (type: 'hover' | 'select' | 'launch') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'hover') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(460, now);
      osc.frequency.exponentialRampToValueAtTime(820, now + 0.04);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'select') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.09);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'launch') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(1300, now + 0.22);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (e) {
    // AudioContext blocked or not supported
  }
};

const getTrackLength = (path: (THREE.Vector3 | any)[]) => {
  if (!path || path.length < 3) return 0;
  const roadPoints = path.map((p) => {
    const v = 'isVector3' in p ? p : p.pos;
    return new THREE.Vector3(v.x, 0.01, v.z);
  });
  const curve = new THREE.CatmullRomCurve3(roadPoints, true);
  return curve.getLength();
};

const formatDistance = (meters: number) => {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
};

export default function CareerMap({
  playerCredits,
  hasLicense,
  licenseProgress,
  onBackToGarage,
  startRace,
  startFreeRoam,
  startTutorial,
  startLicenseTest,
  onOpenMapEditor,
  onNavigateToDealer,
  brightness
}: CareerMapProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<CareerSectorId>('overview');
  const [hoveredSectorId, setHoveredSectorId] = useState<CareerSectorId | null>(null);
  const [activeAcademyTier, setActiveAcademyTier] = useState<LicenseTier>('bronze');
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [activeTierScreen, setActiveTierScreen] = useState<CareerTierId | null>(null);
  const [isFadeInFromBlack, setIsFadeInFromBlack] = useState<boolean>(false);
  const [pinPositions, setPinPositions] = useState<
    Record<string, { x: number; y: number; visible: boolean }>
  >({});

  // License completion count
  const completedLicenseCount = useMemo(() => {
    return Object.values(licenseProgress).reduce(
      (sum, tierArr) => sum + tierArr.filter(Boolean).length,
      0
    );
  }, [licenseProgress]);

  const activeLicenseBadge = useMemo(() => {
    if (licenseProgress.platinum.every(Boolean))
      return { name: 'Platinum License', color: 'text-amber-300 border-amber-400 bg-amber-950/50' };
    if (licenseProgress.gold.every(Boolean))
      return { name: 'Gold License', color: 'text-yellow-400 border-yellow-500 bg-yellow-950/50' };
    if (licenseProgress.silver.every(Boolean))
      return { name: 'Silver License', color: 'text-slate-200 border-slate-400 bg-slate-800/50' };
    if (licenseProgress.bronze.every(Boolean))
      return { name: 'Bronze License', color: 'text-amber-600 border-amber-600 bg-amber-950/40' };
    return { name: 'Novice Driver', color: 'text-zinc-400 border-zinc-700 bg-zinc-900/50' };
  }, [licenseProgress]);

  // Handle Sector Navigation & Focus
  const handleSelectSector = useCallback((sectorId: CareerSectorId) => {
    setSelectedSectorId(sectorId);
    playSoundBlip('select');
    if (sectorId === 'amateur' || sectorId === 'intermediate' || sectorId === 'professional') {
      setActiveTierScreen(sectorId);
    } else if (sectorId === 'overview') {
      setIsDetailOpen(false);
    } else {
      setIsDetailOpen(true);
    }
  }, []);

  const handleNavigateToDealerClick = () => {
    playSoundBlip('select');
    if (onNavigateToDealer) {
      onNavigateToDealer();
    }
  };

  // Filter track groups for the 3 racing fields
  const amateurTracks = useMemo(() => {
    return TRACKS_DATABASE.filter((t) => t.id === 'canopy_speedway' || t.id === 'sprint_circuit');
  }, []);

  const intermediateTracks = useMemo(() => {
    return TRACKS_DATABASE.filter((t) => t.id === 'tokyo_megaloop' || t.id === 'driver_dojo');
  }, []);

  const professionalTracks = useMemo(() => {
    return TRACKS_DATABASE.filter(
      (t) => t.id === 'pro_race' || t.id === 'fuji_speedway' || t.id === 'east_hill_mountain'
    );
  }, []);

  // -------------------------------------------------------------
  // THREE.JS GRAN TURISMO 7 WORLD MAP SCENE INITIALIZATION
  // -------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene & Atmosphere (Sunny Gran Turismo 7 Daylight Sky)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sunny azure sky
    scene.fog = new THREE.FogExp2(0xcde5f7, 0.004); // Soft coastal morning haze

    // 2. Camera Setup (Elevated 3/4 Isometric Perspective)
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 600);
    const overviewCamPos = new THREE.Vector3(-24, 62, 78);
    const overviewTarget = new THREE.Vector3(-30, 2, 0);
    camera.position.copy(overviewCamPos);
    camera.lookAt(overviewTarget);

    // 3. High Fidelity WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    // 4. Natural Sunny Lighting
    const hemiLight = new THREE.HemisphereLight(0x9bd8ff, 0x3d7042, 1.4);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.5);
    sunLight.position.set(-20, 110, 65);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.camera.left = -110;
    sunLight.shadow.camera.right = 110;
    sunLight.shadow.camera.top = 110;
    sunLight.shadow.camera.bottom = -110;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    const coastalFillLight = new THREE.DirectionalLight(0x88ccee, 0.8);
    coastalFillLight.position.set(60, 40, -40);
    scene.add(coastalFillLight);

    // 5. Sparkling Ocean Water Floor
    const waterGeom = new THREE.PlaneGeometry(700, 700, 32, 32);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x166e88,
      roughness: 0.18,
      metalness: 0.45,
      transparent: true,
      opacity: 0.94
    });
    const waterMesh = new THREE.Mesh(waterGeom, waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = 0.05;
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);

    // 6. Sculpted Resort Island Terrain (Left Half: X = -75 to X = 5)
    const islandGroup = new THREE.Group();
    scene.add(islandGroup);

    // Island Materials
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x2e7d32,
      roughness: 0.75,
      metalness: 0.1,
      flatShading: true
    });
    const grassHillMat = new THREE.MeshStandardMaterial({
      color: 0x388e3c,
      roughness: 0.7,
      metalness: 0.1,
      flatShading: true
    });
    const sandBeachMat = new THREE.MeshStandardMaterial({
      color: 0xe5d4a7,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true
    });
    const rockCliffMat = new THREE.MeshStandardMaterial({
      color: 0x546e7a,
      roughness: 0.85,
      metalness: 0.2,
      flatShading: true
    });

    // Sandy Shoreline Base Terrace
    const beachGeom = new THREE.CylinderGeometry(46, 52, 1.8, 32);
    beachGeom.scale(1.2, 1, 0.95);
    const beachMesh = new THREE.Mesh(beachGeom, sandBeachMat);
    beachMesh.position.set(-35, 0.9, 0);
    beachMesh.receiveShadow = true;
    islandGroup.add(beachMesh);

    // Main Emerald Green Island Landmass
    const mainGrassGeom = new THREE.CylinderGeometry(42, 46, 3.2, 32);
    mainGrassGeom.scale(1.18, 1, 0.92);
    const mainGrass = new THREE.Mesh(mainGrassGeom, grassMat);
    mainGrass.position.set(-35, 2.4, 0);
    mainGrass.receiveShadow = true;
    islandGroup.add(mainGrass);

    // Rolling Hills & Mountain Ridges
    const hillConfigs = [
      { x: -55, z: 28, r: 16, h: 5.5, mat: rockCliffMat },
      { x: -44, z: 6, r: 14, h: 4.0, mat: grassHillMat },
      { x: -48, z: -20, r: 13, h: 3.5, mat: grassHillMat },
      { x: -22, z: 20, r: 14, h: 3.0, mat: grassMat },
      { x: -16, z: -14, r: 12, h: 3.2, mat: grassMat },
      { x: -36, z: -34, r: 13, h: 4.2, mat: rockCliffMat }
    ];

    hillConfigs.forEach((h) => {
      const hGeom = new THREE.CylinderGeometry(h.r * 0.8, h.r, h.h, 16);
      const hMesh = new THREE.Mesh(hGeom, h.mat);
      hMesh.position.set(h.x, 2.2 + h.h * 0.5, h.z);
      hMesh.receiveShadow = true;
      hMesh.castShadow = true;
      islandGroup.add(hMesh);
    });

    // 7. Winding Scenic Asphalt Roadways with Red/White Curbs
    const roadsGroup = new THREE.Group();
    scene.add(roadsGroup);

    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.6,
      metalness: 0.2
    });

    // Main Island Circuit Spline connecting all venues
    const circuitPoints = [
      new THREE.Vector3(-22, 4.0, 20),
      new THREE.Vector3(-34, 4.5, 28),
      new THREE.Vector3(-54, 7.6, 26),
      new THREE.Vector3(-48, 5.8, 14),
      new THREE.Vector3(-42, 5.2, 4),
      new THREE.Vector3(-48, 4.4, -18),
      new THREE.Vector3(-36, 4.8, -34),
      new THREE.Vector3(-24, 4.2, -26),
      new THREE.Vector3(-16, 4.2, -14),
      new THREE.Vector3(-14, 4.0, 4),
      new THREE.Vector3(-22, 4.0, 20)
    ];
    const circuitCurve = new THREE.CatmullRomCurve3(circuitPoints, true);
    const circuitTube = new THREE.Mesh(
      new THREE.TubeGeometry(circuitCurve, 64, 0.75, 8, true),
      roadMat
    );
    circuitTube.receiveShadow = true;
    roadsGroup.add(circuitTube);

    // 8. Sweeping Highway Suspension Bridge to Dealer District (East / Right)
    const bridgePoints = [
      new THREE.Vector3(-14, 4.0, 4),
      new THREE.Vector3(4, 3.8, 4),
      new THREE.Vector3(26, 3.8, 2),
      new THREE.Vector3(52, 3.6, 0)
    ];
    const bridgeCurve = new THREE.CatmullRomCurve3(bridgePoints);
    const bridgeTube = new THREE.Mesh(
      new THREE.TubeGeometry(bridgeCurve, 24, 0.85, 8, false),
      roadMat
    );
    bridgeTube.receiveShadow = true;
    roadsGroup.add(bridgeTube);

    // Bridge Concrete Support Pillars
    [6, 20, 36, 48].forEach((bx) => {
      const p = bridgeCurve.getPointAt((bx + 14) / 66);
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.65, 4.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 })
      );
      pillar.position.set(p.x, 1.8, p.z);
      pillar.castShadow = true;
      roadsGroup.add(pillar);
    });

    // 9. Distant Dealer District Skyline (Far Right: X = 50 to X = 80)
    const dealerSkylineGroup = new THREE.Group();
    dealerSkylineGroup.position.set(58, 2.5, 0);
    scene.add(dealerSkylineGroup);

    // Dealer Island Base in the distance
    const dealerBase = new THREE.Mesh(
      new THREE.CylinderGeometry(20, 24, 2.5, 24),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, flatShading: true })
    );
    dealerBase.receiveShadow = true;
    dealerSkylineGroup.add(dealerBase);

    // Stylized Architectural Towers of the 4 Dealer Cities
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.3,
      metalness: 0.7
    });
    const towerConfigs = [
      { x: -4, z: -3, w: 3, h: 12, color: 0x06b6d4 }, // West City (Cyan)
      { x: 2, z: -6, w: 3.5, h: 16, color: 0x3b82f6 }, // North Tower (Blue)
      { x: 5, z: 3, w: 3, h: 14, color: 0xff0258 }, // East City (Rose)
      { x: -2, z: 5, w: 4, h: 10, color: 0xf59e0b } // South City (Amber)
    ];
    towerConfigs.forEach((t) => {
      const tw = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.w), towerMat);
      tw.position.set(t.x, t.h * 0.5 + 1.2, t.z);
      tw.castShadow = true;
      dealerSkylineGroup.add(tw);

      // Crown beacon light
      const beacon = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.9, 0.6, t.w * 0.9),
        new THREE.MeshBasicMaterial({ color: t.color })
      );
      beacon.position.set(t.x, t.h + 1.5, t.z);
      dealerSkylineGroup.add(beacon);
    });

    // 10. Low-Poly 3D Trees on the Island
    const foliageGroup = new THREE.Group();
    scene.add(foliageGroup);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x1e4620, roughness: 0.8, flatShading: true });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7, flatShading: true });

    const treeLocations = [
      [-30, 2.5, 12], [-32, 2.5, -8], [-20, 2.5, 2], [-40, 4.5, 18],
      [-48, 5.0, -6], [-52, 6.0, 16], [-28, 3.0, -22], [-44, 4.0, -26],
      [-18, 3.5, 12], [-26, 3.0, 32], [-38, 3.5, 36], [-12, 2.5, -4]
    ];

    treeLocations.forEach(([tx, ty, tz], i) => {
      const tree = new THREE.Group();
      tree.position.set(tx, ty, tz);

      // Trunk
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6), trunkMat);
      trunk.position.y = 0.7;
      trunk.castShadow = true;
      tree.add(trunk);

      // Leaves
      if (i % 2 === 0) {
        const pine = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.6, 7), pineMat);
        pine.position.y = 2.4;
        pine.castShadow = true;
        tree.add(pine);
      } else {
        const sphere = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1), canopyMat);
        sphere.position.y = 2.2;
        sphere.castShadow = true;
        tree.add(sphere);
      }
      foliageGroup.add(tree);
    });

    // 11. Architectural 3D Models for Gran Turismo Pavilions
    const pavilionsGroup = new THREE.Group();
    scene.add(pavilionsGroup);

    SECTORS.forEach((sec) => {
      const hub = new THREE.Group();
      hub.position.set(...sec.position);
      pavilionsGroup.add(hub);

      // Base Foundation Plinth
      const plinth = new THREE.Mesh(
        new THREE.CylinderGeometry(5.2, 5.6, 0.6, 24),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.1 })
      );
      plinth.position.y = 0.3;
      plinth.receiveShadow = true;
      hub.add(plinth);

      // Colored Accent Ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(4.8, 5.3, 32),
        new THREE.MeshBasicMaterial({ color: sec.themeHex, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.62;
      hub.add(ring);

      if (sec.id === 'amateur') {
        // Coastal Speedway Stadium with Grandstand
        const trackLoop = new THREE.Mesh(
          new THREE.TorusGeometry(3.2, 0.45, 12, 32),
          new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 })
        );
        trackLoop.rotation.x = Math.PI / 2;
        trackLoop.position.y = 0.7;
        hub.add(trackLoop);

        // Curved Grandstand
        const grandstand = new THREE.Mesh(
          new THREE.CylinderGeometry(3.8, 4.2, 1.6, 16, 1, false, 0, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 })
        );
        grandstand.position.y = 1.4;
        grandstand.castShadow = true;
        hub.add(grandstand);

        // Race Flags
        [-2.5, 2.5].forEach((fx) => {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), trunkMat);
          pole.position.set(fx, 1.6, -1.8);
          hub.add(pole);

          const flag = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.55, 0.05),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
          );
          flag.position.set(fx + 0.45, 2.8, -1.8);
          hub.add(flag);
        });
      } else if (sec.id === 'intermediate') {
        // Forest Circuit Arena with Sloped Pavilion Roof
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(4.2, 1.8, 3.4),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 })
        );
        building.position.y = 1.2;
        building.castShadow = true;
        hub.add(building);

        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(3.2, 1.5, 4),
          new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.4 })
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 2.8;
        roof.castShadow = true;
        hub.add(roof);
      } else if (sec.id === 'professional') {
        // Grand Prix Apex Stadium Arena
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(3.4, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.3 })
        );
        dome.position.y = 0.6;
        dome.castShadow = true;
        hub.add(dome);

        // Surrounding Championship Gold Arch
        const arch = new THREE.Mesh(
          new THREE.TorusGeometry(3.8, 0.25, 12, 32, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0xf43f5e, metalness: 0.6, roughness: 0.2 })
        );
        arch.position.y = 0.6;
        hub.add(arch);
      } else if (sec.id === 'academy') {
        // Modern Automotive Campus with Glass Facade
        const campus = new THREE.Mesh(
          new THREE.BoxGeometry(4.4, 1.4, 3.2),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 })
        );
        campus.position.y = 1.0;
        campus.castShadow = true;
        hub.add(campus);

        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(3.8, 1.0, 0.2),
          new THREE.MeshPhysicalMaterial({
            color: 0x06b6d4,
            transmission: 0.85,
            opacity: 0.8,
            transparent: true,
            roughness: 0.1
          })
        );
        glass.position.set(0, 1.0, 1.62);
        hub.add(glass);

        // Slanted Solar Roof
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(4.8, 0.2, 3.6),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 })
        );
        roof.position.set(0, 1.9, 0);
        roof.rotation.x = 0.08;
        roof.castShadow = true;
        hub.add(roof);
      } else if (sec.id === 'editor') {
        // High-Tech Fabrication Studio & Drafting Deck
        const studio = new THREE.Mesh(
          new THREE.BoxGeometry(3.8, 1.8, 3.8),
          new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.4 })
        );
        studio.position.y = 1.2;
        studio.castShadow = true;
        hub.add(studio);

        // Steel Truss Frame
        [-1.8, 1.8].forEach((tx) => {
          [-1.8, 1.8].forEach((tz) => {
            const beam = new THREE.Mesh(
              new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6),
              new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 })
            );
            beam.position.set(tx, 1.9, tz);
            hub.add(beam);
          });
        });
      } else if (sec.id === 'free_roam') {
        // Coastal Lookout Overpass & Mountain Tunnel Portal
        const tunnelArch = new THREE.Mesh(
          new THREE.TorusGeometry(2.4, 0.6, 12, 24, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 })
        );
        tunnelArch.position.y = 0.6;
        hub.add(tunnelArch);

        const lookOutDeck = new THREE.Mesh(
          new THREE.BoxGeometry(3.6, 0.3, 2.4),
          new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.4 })
        );
        lookOutDeck.position.set(0, 2.6, 0.5);
        hub.add(lookOutDeck);
      }
    });

    // 12. True 360-Degree Mouse Drag Orbit & Zoom Controls
    const islandCenter = new THREE.Vector3(-35, 3.5, 0);
    let orbitRadius = 95;
    let orbitAzimuth = 0.35;
    let orbitElevation = 0.62;

    let isDragging = false;
    let previousPosition = { x: 0, y: 0 };

    const handlePointerDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest('button, a, input, select')) return;
      isDragging = true;
      previousPosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      // If left button is not held down, stop dragging
      if (e.buttons !== 1) {
        isDragging = false;
        return;
      }
      // If left button is held down but wasn't flagged yet, start drag
      if (!isDragging) {
        if ((e.target as HTMLElement)?.closest('button, a, input, select')) return;
        isDragging = true;
        previousPosition = { x: e.clientX, y: e.clientY };
        return;
      }
      const deltaX = e.clientX - previousPosition.x;
      const deltaY = e.clientY - previousPosition.y;

      // Full 360-degree horizontal azimuth rotation around island
      orbitAzimuth -= deltaX * 0.006;

      // Vertical elevation pitch (constrained to pleasant viewing angles)
      orbitElevation = Math.max(0.12, Math.min(1.35, orbitElevation + deltaY * 0.005));

      previousPosition = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = () => {
      isDragging = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRadius = Math.max(45, Math.min(160, orbitRadius + e.deltaY * 0.08));
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('wheel', handleWheel, { passive: false });

    // 13. Window Resize Handler
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // 14. Animation & 2D Pin Projection Loop
    let animationFrameId: number;
    const currentCamTarget = new THREE.Vector3().copy(islandCenter);
    let clock = new THREE.Clock();

    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);
      const elapsedTime = clock.getElapsedTime();

      // Camera Target Position Handling (Full 360-degree Orbit)
      const desiredCamPos = new THREE.Vector3();
      const desiredLookAt = new THREE.Vector3();

      if (selectedSectorId === 'overview') {
        const x = islandCenter.x + orbitRadius * Math.cos(orbitElevation) * Math.sin(orbitAzimuth);
        const y = islandCenter.y + orbitRadius * Math.sin(orbitElevation);
        const z = islandCenter.z + orbitRadius * Math.cos(orbitElevation) * Math.cos(orbitAzimuth);
        desiredCamPos.set(x, y, z);
        desiredLookAt.copy(islandCenter);
      } else {
        const sec = SECTORS.find((s) => s.id === selectedSectorId);
        if (sec) {
          const secPos = new THREE.Vector3(...sec.position);
          const closeRadius = 28;
          const x = secPos.x + closeRadius * Math.cos(orbitElevation) * Math.sin(orbitAzimuth);
          const y = secPos.y + closeRadius * Math.sin(orbitElevation);
          const z = secPos.z + closeRadius * Math.cos(orbitElevation) * Math.cos(orbitAzimuth);
          desiredCamPos.set(x, y, z);
          desiredLookAt.copy(secPos).add(new THREE.Vector3(0, 2, 0));
        }
      }

      // Smooth Camera Lerping (snappy 0.10)
      camera.position.lerp(desiredCamPos, 0.10);
      currentCamTarget.lerp(desiredLookAt, 0.10);
      camera.lookAt(currentCamTarget);

      // Project 3D Venue Positions to 2D Screen Space for Gran Turismo Floating Pins
      const updatedPins: Record<string, { x: number; y: number; visible: boolean }> = {};
      SECTORS.forEach((sec) => {
        const pos = new THREE.Vector3(...sec.position);
        pos.y += 5.4; // float above pavilion roof
        pos.project(camera);

        const screenX = (pos.x * 0.5 + 0.5) * width;
        const screenY = (-(pos.y * 0.5) + 0.5) * height;
        const isVisible = pos.z < 1.0 && pos.x >= -1.1 && pos.x <= 1.1 && pos.y >= -1.1 && pos.y <= 1.1;

        updatedPins[sec.id] = {
          x: screenX,
          y: screenY,
          visible: isVisible
        };
      });
      setPinPositions(updatedPins);

      renderer.render(scene, camera);
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('wheel', handleWheel);

      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      scene.clear();
    };
  }, [selectedSectorId]);

  const currentSector = useMemo(() => {
    return SECTORS.find((s) => s.id === selectedSectorId) || null;
  }, [selectedSectorId]);

  // Render Dedicated Tier Screen if active (Amateur Sky, Intermediate Forest, Professional Racetrack)
  if (activeTierScreen) {
    return (
      <EventTierScreen
        brightness={brightness}
        initialTier={activeTierScreen}
        playerCredits={playerCredits}
        hasLicense={hasLicense}
        onBackToMap={() => {
          playSoundBlip('select');
          setActiveTierScreen(null);
          setSelectedSectorId('overview');
          setIsFadeInFromBlack(true);
          setTimeout(() => {
            setIsFadeInFromBlack(false);
          }, 50);
        }}
        startRace={startRace}
      />
    );
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-sky-200 text-white select-none overflow-hidden font-sans">
      {/* Black Fade-In Transition Overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black pointer-events-none transition-opacity duration-400 ease-out ${
          isFadeInFromBlack ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 3D WEBGL VIEWPORT CANVAS CONTAINER */}
      <div ref={mountRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }} />

      {/* GRAN TURISMO 7 LUXURY TOP STATUS & NAVIGATION BAR */}
      <div className="relative z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-slate-950/90 via-slate-950/70 to-transparent pointer-events-auto backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black tracking-[0.35em] text-cyan-400 uppercase flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              AUTODRIVE MOTORSPORT RESORT // OVERWORLD
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wider uppercase flex items-center gap-2">
              WORLD MAP
            </h1>
          </div>
        </div>

        {/* Player Stats Dashboard & Back Button */}
        <div className="flex items-center gap-3 sm:gap-5">
          {/* Driver License Badge */}
          <div
            className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black tracking-wider uppercase ${activeLicenseBadge.color}`}
          >
            <Award className="w-4 h-4" />
            <span>{activeLicenseBadge.name}</span>
            <span className="text-[9px] opacity-75 font-mono">({completedLicenseCount}/40)</span>
          </div>

          {/* Credits Counter in Gran Turismo Gold */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 px-4 py-1.5 rounded-xl shadow-lg backdrop-blur-md">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CR</span>
            <span className="text-sm font-black font-mono text-amber-400">
              {playerCredits.toLocaleString()} <span className="text-[10px] text-amber-500 font-bold">CR</span>
            </span>
          </div>

          {/* Return to Garage Button */}
          <button
            onClick={() => {
              playSoundBlip('select');
              onBackToGarage();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black tracking-widest uppercase transition-all shadow-lg hover:shadow-rose-600/30 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">GARAGE</span>
            <span className="sm:hidden">EXIT</span>
          </button>
        </div>
      </div>



      {/* 2D SCREEN-PROJECTED GRAN TURISMO 7 FLOATING LANDMARK PINS */}
      <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
        {SECTORS.map((sec) => {
          const pin = pinPositions[sec.id];
          if (!pin || !pin.visible) return null;

          const Icon = sec.icon;
          const isHovered = hoveredSectorId === sec.id;
          const isSelected = selectedSectorId === sec.id;

          return (
            <div
              key={sec.id}
              style={{
                transform: `translate(${pin.x}px, ${pin.y}px) translate(-50%, -100%)`
              }}
              className="absolute left-0 top-0 pointer-events-auto flex flex-col items-center cursor-pointer transition-transform duration-200"
              onClick={() => handleSelectSector(sec.id)}
              onMouseEnter={() => {
                setHoveredSectorId(sec.id);
                playSoundBlip('hover');
              }}
              onMouseLeave={() => setHoveredSectorId(null)}
            >
              {/* GT7 Hover Preview Card Popover */}
              {isHovered && (
                <div className="absolute bottom-full mb-3 w-64 bg-slate-950/95 border border-slate-700/80 rounded-2xl p-3 shadow-2xl backdrop-blur-xl pointer-events-none animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-2 z-30">
                  <div className="relative h-24 w-full rounded-xl overflow-hidden">
                    <img src={sec.thumbnail} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent" />
                    <span
                      className="absolute bottom-1.5 left-2 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md"
                      style={{ backgroundColor: `${sec.color}30`, color: sec.color }}
                    >
                      {sec.tag}
                    </span>
                  </div>
                  <div className="text-left">
                    <h4 className="text-sm font-black text-white uppercase tracking-wide">
                      {sec.name}
                    </h4>
                    <span className="text-[10px] text-zinc-400 block mt-0.5">{sec.statsLabel}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px] font-bold text-cyan-400 uppercase">
                    <span>Click to Enter</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              )}

              {/* GT7 Circular Icon Pin Badge */}
              <div
                className={`group flex items-center justify-center w-12 h-12 rounded-full bg-slate-950/90 border-2 shadow-2xl backdrop-blur-md transition-all duration-200 ${
                  isHovered || isSelected ? 'scale-115 -translate-y-1' : 'hover:scale-110'
                }`}
                style={{
                  borderColor: sec.color,
                  boxShadow: `0 8px 24px rgba(0,0,0,0.6), 0 0 16px ${sec.color}60`
                }}
              >
                <Icon className="w-6 h-6 transition-transform group-hover:scale-110" style={{ color: sec.color }} />
              </div>

              {/* Pill Name Tag Underneath */}
              <div
                className={`mt-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider whitespace-nowrap shadow-xl border backdrop-blur-md transition-all ${
                  isHovered || isSelected
                    ? 'bg-slate-900 border-white text-white'
                    : 'bg-slate-950/85 border-slate-700/80 text-zinc-200'
                }`}
              >
                {sec.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* SEAMLESS RIGHT-SIDE DEALER DISTRICT PORTAL PROMPT */}
      <div className="absolute top-1/2 right-6 -translate-y-1/2 z-20 pointer-events-auto">
        <button
          onClick={handleNavigateToDealerClick}
          className="group flex flex-col items-center gap-2 p-3.5 rounded-3xl bg-slate-950/90 hover:bg-slate-900 border-2 border-amber-400/60 hover:border-amber-400 text-white shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-105 cursor-pointer"
          title="Seamlessly move to Car Dealer District"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-400/40 border border-amber-400/60 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-black transition-colors shadow-lg">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="flex flex-col text-center">
            <span className="text-[8px] font-black tracking-widest text-amber-400 uppercase">
              EAST DISTRICT
            </span>
            <span className="text-xs font-black text-white uppercase tracking-wider flex items-center justify-center gap-0.5 mt-0.5">
              CAR DEALERS
              <ChevronRight className="w-3.5 h-3.5 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
        </button>
      </div>

      {/* 3D MAP CONTROLS HINT */}
      {selectedSectorId === 'overview' && (
        <div className="absolute bottom-6 left-6 z-10 pointer-events-none flex flex-col gap-1.5 bg-slate-950/85 border border-slate-800 px-4 py-3 rounded-2xl backdrop-blur-md max-w-xs shadow-xl">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cyan-400 uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            GT7 WORLD RESORT
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Drag to pan view. Click on any resort venue pin to enter championships, license academy, or free roam.
          </p>
        </div>
      )}

      {/* SLIDE-IN GRAN TURISMO DISPATCH DRAWER */}
      {currentSector && isDetailOpen && (
        <div className="absolute top-28 right-4 sm:right-6 bottom-6 w-[min(520px,calc(100%-32px))] z-30 pointer-events-auto flex flex-col bg-slate-950/95 border border-slate-700/80 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-8 duration-300">
          {/* Drawer Header Banner */}
          <div
            className="p-5 border-b border-slate-800 flex items-center justify-between"
            style={{
              background: `linear-gradient(135deg, ${currentSector.color}20, transparent)`
            }}
          >
            <div className="flex items-center gap-3.5">
              <div
                className="w-12 h-12 rounded-2xl border flex items-center justify-center shadow-lg"
                style={{
                  backgroundColor: `${currentSector.color}25`,
                  borderColor: `${currentSector.color}60`
                }}
              >
                {React.createElement(currentSector.icon, {
                  className: 'w-6 h-6',
                  style: { color: currentSector.color }
                })}
              </div>
              <div className="text-left">
                <span
                  className="text-[9px] font-black tracking-[0.25em] uppercase block"
                  style={{ color: currentSector.color }}
                >
                  {currentSector.tag}
                </span>
                <h2 className="text-lg font-black text-white tracking-wide uppercase">
                  {currentSector.name}
                </h2>
              </div>
            </div>

            <button
              onClick={() => handleSelectSector('overview')}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Close
            </button>
          </div>

          {/* Drawer Content Body */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 scrollbar-thin scrollbar-thumb-slate-800">
            <p className="text-xs text-zinc-300 leading-relaxed font-normal text-left">
              {currentSector.description}
            </p>

            {/* SECTOR: LICENSE ACADEMY CONTENT */}
            {currentSector.id === 'academy' && (
              <div className="flex flex-col gap-4">
                <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-10 h-10 rounded-xl bg-cyan-950/50 border border-cyan-800/40 flex items-center justify-center">
                      <HelpCircle className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-white">Driving School Tutorial</h4>
                      <span className="text-[10px] text-zinc-400">Basic acceleration, braking & cornering</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      playSoundBlip('launch');
                      startTutorial();
                    }}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-md"
                  >
                    Start (+200 CR)
                  </button>
                </div>

                <div className="flex gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
                  {LICENSE_TIERS.map((tier) => {
                    const completed = getLicenseTierCompletion(licenseProgress, tier.id);
                    const isActive = activeAcademyTier === tier.id;
                    return (
                      <button
                        key={tier.id}
                        onClick={() => {
                          playSoundBlip('hover');
                          setActiveAcademyTier(tier.id);
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center cursor-pointer ${
                          isActive
                            ? 'bg-cyan-600 text-white shadow-md'
                            : 'text-zinc-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                      >
                        <span>{tier.name}</span>
                        <span className="text-[8px] font-mono opacity-80">{completed}/10</span>
                      </button>
                    );
                  })}
                </div>

                {(() => {
                  const tests = LICENSE_TESTS_BY_TIER[activeAcademyTier] || [];
                  const completedCount = getLicenseTierCompletion(licenseProgress, activeAcademyTier);

                  return (
                    <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-white uppercase tracking-wider">
                          {activeAcademyTier} License Tests
                        </span>
                        <span className="text-[10px] font-mono text-cyan-400 font-bold">
                          {completedCount === 10 ? 'TIER COMPLETED' : `${10 - completedCount} REMAINING`}
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-2">
                        {tests.map((test) => {
                          const isComplete = licenseProgress[test.tier][test.testNumber - 1];
                          const isUnlocked = isLicenseTestUnlocked(test, licenseProgress);

                          return (
                            <button
                              key={test.id}
                              disabled={!isUnlocked}
                              onClick={() => {
                                playSoundBlip('launch');
                                startLicenseTest(test.id);
                              }}
                              title={`${test.name}: ${test.lesson}`}
                              className={`h-11 rounded-xl border text-xs font-black transition-all flex flex-col items-center justify-center cursor-pointer ${
                                isComplete
                                  ? 'bg-emerald-950/60 border-emerald-600 text-emerald-400'
                                  : isUnlocked
                                  ? 'bg-slate-800 hover:bg-cyan-600 border-cyan-500/50 text-cyan-300 hover:text-white shadow-md'
                                  : 'bg-slate-900/60 border-slate-800 text-zinc-650 cursor-not-allowed'
                              }`}
                            >
                              {isComplete ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : isUnlocked ? (
                                <span className="text-[11px]">T-{test.testNumber}</span>
                              ) : (
                                <Lock className="w-3.5 h-3.5" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* SECTOR: CIRCUIT FORGE STUDIO */}
            {currentSector.id === 'editor' && (
              <div className="flex flex-col gap-4">
                <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl flex flex-col gap-3 text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-950/40 border border-amber-800/40 flex items-center justify-center">
                      <Hammer className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base">3D Circuit Creation Bay</h3>
                      <span className="text-[9px] font-bold text-amber-500 tracking-wider uppercase">
                        ARCHITECT SUITE
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-left">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block">Elevation & Banking</span>
                      <span className="text-xs font-mono text-white">Full 3D Terrain & Splines</span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-left">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block">Scenery & Props</span>
                      <span className="text-xs font-mono text-white">Trees, Hills, Lighting</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      playSoundBlip('launch');
                      onOpenMapEditor();
                    }}
                    className="w-full mt-2 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black tracking-widest uppercase transition-all shadow-lg hover:shadow-amber-600/30 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Hammer className="w-4 h-4" />
                    LAUNCH 3D MAP EDITOR
                  </button>
                </div>
              </div>
            )}

            {/* SECTOR: HORIZON PROVING GROUNDS */}
            {currentSector.id === 'free_roam' && (
              <div className="flex flex-col gap-4">
                <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl flex flex-col gap-3 text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center">
                      <Compass className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base">Open World Coastline</h3>
                      <span className="text-[9px] font-bold text-emerald-500 tracking-wider uppercase">
                        INFINITE TEST DRIVE
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-left">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block">Drift Rewards</span>
                      <span className="text-xs font-mono text-emerald-400">Passive Credit Payout</span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-left">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block">Stunt Physics</span>
                      <span className="text-xs font-mono text-white">Jumps & High-Speed Run</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      playSoundBlip('launch');
                      startFreeRoam();
                    }}
                    className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black tracking-widest uppercase transition-all shadow-lg hover:shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    ENTER FREE ROAM
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
