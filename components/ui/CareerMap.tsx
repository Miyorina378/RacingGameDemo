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
import { CARS_DATABASE, CarConfig } from '../config/CarDatabase';
import { CareerConcoursHud } from './CareerConcoursHud';
import { buildCareerValley, VALLEY_CENTER } from '../objects/CareerValley';
import { sampleDayNight } from '../engine/dayNight';
import { CareerMapGraphics } from '../engine/CareerMapGraphics';
import { loadMapGraphics, MAP_GRAPHICS_EVENT, MapGraphicsSettings } from '../option';

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
  /** Came back from the Dealer District: the camera comes out of the gate. */
  arrivingFromDealer?: boolean;
  brightness?: number;
  activeCarId?: string;
  activeCarName?: string;
  selectedColor?: string;
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
    position: [20, 2.6, 70],
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
    position: [-123, 7.6, 34],
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
    position: [-167.4, 33.7, -83],
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
    // Over the License Center main hall where it stands in career_valley.blend
    // (object license_main_hall, placed by hand) - not the venue marker.
    position: [48, 13.5, -31],
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
    position: [25, 21.6, -95],
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
    position: [-87, 9.6, 92],
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

// road_approach in career_valley.blend: the valley's southern road, from the
// ring beside Horizon Proving Grounds out through the valley mouth. This is the
// road to the Dealer District. Centreline sampled every 16 m from
// career_valley.glb, in three.js world coordinates (x, y, z).
const APPROACH_ROAD = new THREE.CatmullRomCurve3(
  ([
    [-103.7, 6.93, 119.7], [-104.0, 4.3, 135.7], [-96.9, 1.96, 151.7], [-80.45, 1.31, 167.7],
    [-66.24, 0.96, 183.7], [-65.66, 0.74, 199.7], [-77.16, 0.9, 215.7], [-90.06, 0.98, 231.7],
    [-98.47, 0.77, 247.7], [-95.71, 0.43, 263.7], [-79.43, 0.1, 279.7], [-55.21, 0.1, 295.7],
    [-32.34, 0.15, 311.7], [-18.77, 0.38, 327.7], [-14.39, 0.58, 343.7], [-16.36, 0.7, 359.7],
    [-21.05, 0.59, 375.7], [-26.96, 0.49, 391.7],
  ] as const).map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  false,
  'centripetal'
);
/** A point `up` metres above road_approach, `u` of the way from the ring (0) to the valley mouth (1). */
const onApproachRoad = (u: number, up: number) => APPROACH_ROAD.getPointAt(u).add(new THREE.Vector3(0, up, 0));

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
  arrivingFromDealer = false,
  brightness,
  activeCarId,
  activeCarName,
  selectedColor
}: CareerMapProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const currentCar = useMemo(() => {
    if (activeCarId) {
      const found = CARS_DATABASE.find((c) => c.id === activeCarId);
      if (found) {
        return selectedColor ? { ...found, color: selectedColor } : found;
      }
    }
    return CARS_DATABASE[0];
  }, [activeCarId, selectedColor]);
  const [selectedSectorId, setSelectedSectorId] = useState<CareerSectorId>('overview');
  const [hoveredSectorId, setHoveredSectorId] = useState<CareerSectorId | null>(null);
  const [activeAcademyTier, setActiveAcademyTier] = useState<LicenseTier>('bronze');
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [activeTierScreen, setActiveTierScreen] = useState<CareerTierId | null>(null);
  const [isFadeInFromBlack, setIsFadeInFromBlack] = useState<boolean>(false);
  // Gate flights to and from the Dealer District (see the render loop).
  const hazeRef = useRef<HTMLDivElement>(null);
  const departRequestRef = useRef(false);
  const arrivalPendingRef = useRef(arrivingFromDealer);
  // Read once: the render loop drives the haze from here on.
  // Pins and panels step aside while the camera flies the gate road.
  const [gateFlightActive, setGateFlightActive] = useState(arrivingFromDealer);
  const [initialHaze] = useState(() => ({
    opacity: arrivingFromDealer ? 1 : 0,
    backgroundColor: `#${sampleDayNight(new Date()).fog.getHexString()}`,
  }));
  const onNavigateToDealerRef = useRef(onNavigateToDealer);
  useEffect(() => { onNavigateToDealerRef.current = onNavigateToDealer; }, [onNavigateToDealer]);
  const [pinPositions, setPinPositions] = useState<
    Record<string, { x: number; y: number; visible: boolean; edge?: boolean; angle?: number }>
  >({});

  // Dynamic Live Time & Date for GT7 Header (e.g. 23:25 \n 23 Sep 26)
  const [currentDateTime, setCurrentDateTime] = useState<{ time: string; date: string }>(() => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[now.getMonth()];
    const year = String(now.getFullYear()).slice(-2);
    return {
      time: `${hours}:${minutes}`,
      date: `${day} ${month} ${year}`
    };
  });

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[now.getMonth()];
      const year = String(now.getFullYear()).slice(-2);
      setCurrentDateTime({
        time: `${hours}:${minutes}`,
        date: `${day} ${month} ${year}`
      });
    };

    updateDateTime();
    const timer = setInterval(updateDateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut to return to garage (ESC)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBackToGarage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBackToGarage]);

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

  // Highest fully-completed licence tier, engraved on the concours HUD seal
  const licenseSealTier = useMemo(() => {
    if (licenseProgress.platinum.every(Boolean)) return 'Platinum';
    if (licenseProgress.gold.every(Boolean)) return 'Gold';
    if (licenseProgress.silver.every(Boolean)) return 'Silver';
    if (licenseProgress.bronze.every(Boolean)) return 'Bronze';
    return 'Novice';
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

  // The trip to the dealers runs down road_exit and through the gate before the
  // Dealer District opens (the render loop flies it, then calls onNavigateToDealer).
  const handleNavigateToDealerClick = () => {
    playSoundBlip('select');
    if (!onNavigateToDealer) return;
    if (selectedSectorId !== 'overview') {
      onNavigateToDealer();
      return;
    }
    departRequestRef.current = true;
    setGateFlightActive(true);
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

    // 1. Scene & Atmosphere
    //    Colours are not fixed here: section 4a reads the player's clock and
    //    repaints sky, fog and every light to match the hour.
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7fb4dd);
    scene.fog = new THREE.FogExp2(0xa8cbe4, 0.0011);

    // 2. Camera Setup (Elevated 3/4 Isometric Perspective)
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 1600);
    const overviewCamPos = new THREE.Vector3(-24, 62, 78);
    const overviewTarget = new THREE.Vector3(-30, 2, 0);
    camera.position.copy(overviewCamPos);
    camera.lookAt(overviewTarget);

    // 3. High Fidelity WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Shadow type, tone mapping and exposure are set by CareerMapGraphics
    // (section 4b), which follows the player's map graphics settings.
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    // 4. Valley Lighting Rig
    //    Four lights, all driven by the clock in section 5a: a key that stands
    //    in for the sun (or the moon), a hemisphere for the sky, a cool fill
    //    from the far side and a faint bounce off the grass. Intensities are
    //    deliberately modest - a rig summing over 4 flattens everything white.
    const hemiLight = new THREE.HemisphereLight(0xbfe4ff, 0x33632f, 0.62);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffe9c4, 1.55);
    sunLight.position.set(-95, 95, 130);
    // Shadows are cast around the valley, not around the world origin, so the
    // box can stay tight enough to keep 4096 map pixels worth using.
    sunLight.target.position.set(VALLEY_CENTER.x, 0, VALLEY_CENTER.z);
    scene.add(sunLight.target);
    scene.add(sunLight);

    // Cool shadow fill from the opposite side, plus a faint bounce off the
    // valley floor so shadowed slopes keep a little green in them.
    const skyFillLight = new THREE.DirectionalLight(0x9ec4e8, 0.34);
    skyFillLight.position.set(80, 50, -70);
    scene.add(skyFillLight);

    const groundBounce = new THREE.DirectionalLight(0x86b36a, 0.2);
    groundBounce.position.set(0, -40, 30);
    scene.add(groundBounce);

    // 4b. Render pipeline: shadows, light balance, material grading and the
    //     post-processing chain. Each part is a switch in Settings > Graphics
    //     (Career Map), and changes there reach an open map immediately.
    const graphics = new CareerMapGraphics(
      renderer,
      scene,
      camera,
      { sun: sunLight, hemi: hemiLight, fill: skyFillLight, bounce: groundBounce },
      loadMapGraphics()
    );
    const handleMapGraphicsChange = (event: Event) => {
      const detail = (event as CustomEvent<MapGraphicsSettings>).detail;
      graphics.setSettings(detail ?? loadMapGraphics());
    };
    window.addEventListener(MAP_GRAPHICS_EVENT, handleMapGraphicsChange);

    // 5. Inland Valley World
    //    Terrain, roads, trees and the colosseum arenas all arrive as one
    //    Blender-authored model. Venue coordinates here must stay in step with
    //    the VENUES table in scripts/build_career_valley.py.
    const valley = buildCareerValley(scene, {
      onLoad: (model) => graphics.prepareModel(model)
    });

    // 5a. Day & Night, from the player's own clock
    //     One sample of the local time decides sky, fog, the direction and
    //     colour of the key light - so shadows swing east to west through the
    //     day - and whether the street lamps are lit. The sample carries the
    //     previous lamp answer back in, which is what stops them flickering
    //     while the sun sits on the switching point.
    const SUN_DISTANCE = 420;
    let lampsLit = false;

    const applyDayNight = (now: Date) => {
      const sky = sampleDayNight(now, lampsLit);
      lampsLit = sky.lampsOn;

      // Sky and fog colours are applied by the graphics pipeline further down,
      // which has to compensate them when post-processing is on.
      sunLight.position
        .copy(sky.sunDirection)
        .multiplyScalar(SUN_DISTANCE)
        .add(sunLight.target.position);

      // The fill sits opposite the key, so it swings with it.
      skyFillLight.position.set(
        -sky.sunDirection.x * 300,
        180,
        -sky.sunDirection.z * 300
      );

      // Sky, fog, light colours, intensities and exposure: the graphics
      // pipeline applies the reading, rebalanced when enhanced lighting is on.
      graphics.applyDayNight(sky);
      valley.setLampsOn(sky.lampsOn);
    };

    applyDayNight(new Date());

    // 12. Constrained Valley-Facing Orbit & Zoom Controls
    //     The bowl is only open toward the camera, so the view swings through a
    //     narrow arc (+/- 35 degrees) instead of a full 360 orbit - you can
    //     never end up looking at the back of the mountain ring.
    const islandCenter = new THREE.Vector3(VALLEY_CENTER.x, 4.0, VALLEY_CENTER.z);
    const AZIMUTH_LIMIT = Math.PI * (35 / 180);
    const ELEVATION_MIN = 0.3;
    const ELEVATION_MAX = 0.82;
    let orbitRadius = 268;
    let orbitAzimuth = 0;
    let orbitElevation = 0.5;

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

      // Horizontal swing, clamped to the mouth of the valley
      orbitAzimuth = Math.max(
        -AZIMUTH_LIMIT,
        Math.min(AZIMUTH_LIMIT, orbitAzimuth - deltaX * 0.005)
      );

      // Vertical pitch, kept between a low valley view and a high ridge view
      orbitElevation = Math.max(
        ELEVATION_MIN,
        Math.min(ELEVATION_MAX, orbitElevation + deltaY * 0.004)
      );

      previousPosition = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = () => {
      isDragging = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRadius = Math.max(90, Math.min(360, orbitRadius + e.deltaY * 0.16));
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
      graphics.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // 14. Animation & 2D Pin Projection Loop
    let animationFrameId: number;
    const currentCamTarget = new THREE.Vector3().copy(islandCenter);
    // THREE.Clock is deprecated; Timer is its replacement and also skips the
    // huge delta a hidden tab would otherwise build up.
    const timer = new THREE.Timer();
    timer.connect(document);

    let nextSkyUpdate = 0;

    const orbitPosition = () => new THREE.Vector3(
      islandCenter.x + orbitRadius * Math.cos(orbitElevation) * Math.sin(orbitAzimuth),
      islandCenter.y + orbitRadius * Math.sin(orbitElevation),
      islandCenter.z + orbitRadius * Math.cos(orbitElevation) * Math.cos(orbitAzimuth)
    );
    // Local copy: React's dev double-mount runs this effect twice, and the
    // flag is only cleared once the arrival flight has actually finished.
    let arrivalPending = arrivalPendingRef.current;
    let gateFlight: {
      pos: THREE.CatmullRomCurve3; look: THREE.CatmullRomCurve3; start: number; duration: number;
      haze: 'in' | 'out'; done?: () => void;
    } | null = null;
    // The haze is the fog colour of the hour, the same on both maps.
    const setHaze = (opacity: number) => {
      const el = hazeRef.current;
      if (!el) return;
      el.style.backgroundColor = `#${sampleDayNight(new Date()).fog.getHexString()}`;
      el.style.opacity = String(opacity);
    };

    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);
      timer.update();
      const elapsedTime = timer.getElapsed();

      // The sun moves a quarter of a degree a minute, so re-reading the clock
      // once a second is smooth to the eye and free next to a shadow pass.
      if (elapsedTime >= nextSkyUpdate) {
        nextSkyUpdate = elapsedTime + 1;
        applyDayNight(new Date());
      }
      valley.update(elapsedTime);

      // Road trip to / from the Dealer District along road_approach overrides the camera.
      if (!gateFlight && arrivalPending && selectedSectorId === 'overview') {
        arrivalPending = false;
        const endPos = orbitPosition();
        gateFlight = {
          // Coming up road_approach from the valley mouth toward the ring,
          // then lifting away into the overview.
          pos: new THREE.CatmullRomCurve3([onApproachRoad(0.74, 6.5), onApproachRoad(0.58, 6.5), onApproachRoad(0.42, 8), onApproachRoad(0.3, 28), endPos]),
          look: new THREE.CatmullRomCurve3([onApproachRoad(0.6, 4), onApproachRoad(0.44, 4), onApproachRoad(0.28, 5), onApproachRoad(0.1, 6), islandCenter.clone()]),
          start: elapsedTime, duration: 5.0, haze: 'in',
          done: () => { arrivalPendingRef.current = false; setGateFlightActive(false); },
        };
        setHaze(1);
      }
      if (!gateFlight && departRequestRef.current) {
        departRequestRef.current = false;
        const lookAhead = new THREE.Vector3();
        camera.getWorldDirection(lookAhead);
        // Down onto road_approach and away along it out of the valley mouth,
        // watching the valley recede behind, then into the haze.
        gateFlight = {
          pos: new THREE.CatmullRomCurve3([camera.position.clone(), onApproachRoad(0.2, 30), onApproachRoad(0.36, 8), onApproachRoad(0.52, 7), onApproachRoad(0.7, 7)]),
          look: new THREE.CatmullRomCurve3([lookAhead.multiplyScalar(120).add(camera.position), onApproachRoad(0.02, 6), onApproachRoad(0.14, 5), onApproachRoad(0.3, 4), onApproachRoad(0.48, 4)]),
          start: elapsedTime, duration: 4.5, haze: 'out',
          done: () => onNavigateToDealerRef.current?.(),
        };
      }
      if (gateFlight) {
        const u = Math.min(1, (elapsedTime - gateFlight.start) / gateFlight.duration);
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        camera.position.copy(gateFlight.pos.getPoint(e));
        currentCamTarget.copy(gateFlight.look.getPoint(e));
        camera.lookAt(currentCamTarget);
        setHaze(gateFlight.haze === 'in' ? 1 - Math.min(1, u / 0.14) : Math.max(0, (u - 0.8) / 0.2));
        if (u >= 1) {
          const done = gateFlight.done;
          gateFlight = null;
          done?.();
        }
        graphics.render();
        return;
      }

      // Camera Target Position Handling (Constrained Valley Arc)
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
          const closeRadius = 46;
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
      const updatedPins: Record<string, { x: number; y: number; visible: boolean; edge?: boolean; angle?: number }> = {};
      SECTORS.forEach((sec) => {
        const pos = new THREE.Vector3(...sec.position);
        pos.y += 13; // float clear of the scaled colosseum crown
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
      // The road to the dealers: a pin over road_approach, which slides to the
      // screen edge (pointing the way) whenever that stretch is out of view.
      {
        // Just south of the ring, where road_approach leaves it and is on screen.
        const gp = onApproachRoad(0.05, 9);
        gp.project(camera);
        let gx = (gp.x * 0.5 + 0.5) * width;
        let gy = (-(gp.y * 0.5) + 0.5) * height;
        const behind = gp.z > 1;
        const inView = !behind && gx > 70 && gx < width - 70 && gy > 110 && gy < height - 70;
        let angle = 0;
        if (!inView) {
          if (behind) { gx = width - gx; gy = height - gy; }
          angle = (Math.atan2(gy - height / 2, gx - width / 2) * 180) / Math.PI;
          gx = Math.min(width - 56, Math.max(56, gx));
          gy = Math.min(height - 90, Math.max(130, gy));
          // Keep clear of the controls hint in the bottom-left corner.
          if (gy > height - 200 && gx < 400) gx = 400;
        }
        updatedPins.dealer_gate = { x: gx, y: gy, visible: true, edge: !inView, angle };
      }
      setPinPositions(updatedPins);

      graphics.render();
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener(MAP_GRAPHICS_EVENT, handleMapGraphicsChange);
      timer.dispose();

      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      valley.dispose();
      graphics.dispose();
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

      {/* Haze wipe for the gate flights to / from the Dealer District */}
      <div ref={hazeRef} className="fixed inset-0 z-[60] pointer-events-none" style={initialHaze} />

      {/* 3D WEBGL VIEWPORT CANVAS CONTAINER */}
      <div ref={mountRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }} />

      {/* FLOATING CONCOURS HUD - maison mark + driver plaque, no solid header slab */}
      <div className={`transition-opacity duration-500 ${gateFlightActive ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      <CareerConcoursHud
        car={currentCar}
        carName={activeCarName}
        credits={playerCredits}
        licenseLabel={licenseSealTier}
        time={currentDateTime.time}
        date={currentDateTime.date}
        onReturnToGarage={() => {
          playSoundBlip('select');
          onBackToGarage();
        }}
        onHover={() => playSoundBlip('hover')}
      />
      </div>

      {/* 2D SCREEN-PROJECTED GRAN TURISMO 7 FLOATING LANDMARK PINS */}
      <div className={`absolute inset-0 z-10 pointer-events-none overflow-hidden transition-opacity duration-500 ${gateFlightActive ? 'opacity-0' : 'opacity-100'}`}>
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

      {/* ROAD TO THE DEALER DISTRICT - a map pin over road_approach, like the venues */}
      {(() => {
        const pin = pinPositions.dealer_gate;
        if (!pin || gateFlightActive || selectedSectorId !== 'overview') return null;
        const amber = '#f59e0b';
        return (
          <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
            <button
              type="button"
              onClick={handleNavigateToDealerClick}
              onMouseEnter={() => playSoundBlip('hover')}
              style={{ transform: `translate(${pin.x}px, ${pin.y}px) translate(-50%, ${pin.edge ? '-50%' : '-100%'})` }}
              className="group absolute left-0 top-0 pointer-events-auto flex flex-col items-center cursor-pointer"
              title="Take the south road to the Dealer District"
            >
              {!pin.edge && (
                <div className="absolute bottom-full mb-3 w-60 rounded-2xl border border-slate-700/80 bg-slate-950/95 p-3 text-left opacity-0 shadow-2xl backdrop-blur-xl transition-opacity duration-200 group-hover:opacity-100">
                  <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: amber }}>South road</span>
                  <h4 className="mt-0.5 text-sm font-black uppercase tracking-wide text-white">Dealer District</h4>
                  <span className="mt-0.5 block text-[10px] text-zinc-400">Four cities of new, used and race cars</span>
                </div>
              )}
              <div
                className={`flex items-center justify-center rounded-full border-2 bg-slate-950/90 backdrop-blur-md transition-all duration-200 group-hover:-translate-y-1 group-hover:scale-110 ${pin.edge ? 'h-9 w-9' : 'h-12 w-12'}`}
                style={{ borderColor: amber, boxShadow: `0 8px 24px rgba(0,0,0,0.6), 0 0 16px ${amber}60` }}
              >
                <Building2 className={pin.edge ? 'h-4 w-4' : 'h-6 w-6'} style={{ color: amber }} />
              </div>
              <div className="mt-1.5 flex items-center gap-0.5 whitespace-nowrap rounded-full border border-slate-700/80 bg-slate-950/85 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-zinc-200 shadow-xl backdrop-blur-md transition-colors group-hover:border-white group-hover:bg-slate-900 group-hover:text-white">
                Car Dealers
                {pin.edge && <ChevronRight className="h-3.5 w-3.5" style={{ color: amber, transform: `rotate(${pin.angle ?? 0}deg)` }} />}
              </div>
            </button>
          </div>
        );
      })()}

      {/* 3D MAP CONTROLS HINT */}
      {selectedSectorId === 'overview' && !gateFlightActive && (
        <div className="absolute bottom-6 left-6 z-10 pointer-events-none flex flex-col gap-1.5 bg-slate-950/85 border border-slate-800 px-4 py-3 rounded-2xl backdrop-blur-md max-w-xs shadow-xl">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cyan-400 uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            MOTORSPORT VALLEY
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Drag to swing the view across the valley, scroll to zoom. Click any colosseum pin to enter championships, license academy, or free roam.
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
