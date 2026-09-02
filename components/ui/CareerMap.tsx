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
  MapPin
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
  startRace: (trackId: string, layoutId?: string) => void;
  startFreeRoam: () => void;
  startTutorial: () => void;
  startLicenseTest: (testId?: string) => void;
  onOpenMapEditor: () => void;
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
  position: [number, number, number]; // 3D coordinates
  cameraOffset: [number, number, number]; // Camera offset for close-up
  description: string;
}

const SECTORS: SectorMeta[] = [
  {
    id: 'academy',
    name: 'License Academy',
    subtitle: 'Driver Licensing & Training Complex',
    tag: '40 LICENSES & TUTORIAL',
    color: '#06b6d4', // Cyan
    themeHex: 0x06b6d4,
    icon: Award,
    position: [-42, 4.5, 26],
    cameraOffset: [-24, 18, 48],
    description: 'Master apex control, threshold braking, and racecraft across 4 license tiers. Complete exams to unlock high-tier championships and hypercars.'
  },
  {
    id: 'editor',
    name: 'Circuit Forge Studio',
    subtitle: '3D Track Creation & Fabrication',
    tag: 'CUSTOM 3D BUILDER',
    color: '#f59e0b', // Amber
    themeHex: 0xf59e0b,
    icon: Hammer,
    position: [42, 5.0, 30],
    cameraOffset: [26, 18, 52],
    description: 'Design custom circuits with 3D terrain sculpting, road elevation, banking angles, curb placement, and scenery. Test drive your creations instantly.'
  },
  {
    id: 'free_roam',
    name: 'Horizon Proving Grounds',
    subtitle: 'Coastline & Mountain Open World',
    tag: 'FREE ROAM & DRIFT',
    color: '#10b981', // Emerald
    themeHex: 0x10b981,
    icon: Compass,
    position: [-46, 6.0, -32],
    cameraOffset: [-28, 20, -10],
    description: 'Cruise the boundless open highway, hit jump ramps, test top speeds, and link continuous drift combos to earn passive credit rewards.'
  },
  {
    id: 'amateur',
    name: 'Amateur Racing Field',
    subtitle: 'Clubman League & Oval Speedways',
    tag: 'TIER 1 RACING',
    color: '#38bdf8', // Sky
    themeHex: 0x38bdf8,
    icon: Flag,
    position: [0, 3.5, 48],
    cameraOffset: [0, 16, 72],
    description: 'Entry-level competitive circuit events designed for beginner racing. Ideal for fine-tuning steering lines and racking up early prize payouts.'
  },
  {
    id: 'intermediate',
    name: 'Intermediate Racing Field',
    subtitle: 'Challenger Trophy & City Expressways',
    tag: 'TIER 2 RACING',
    color: '#a855f7', // Purple
    themeHex: 0xa855f7,
    icon: Zap,
    position: [46, 5.5, -28],
    cameraOffset: [28, 20, -6],
    description: 'Technical mid-tier circuits featuring the high-speed Tokyo Megaloop and the complex curves of Driver Dojo. Demands higher vehicle power.'
  },
  {
    id: 'professional',
    name: 'Professional Racing Field',
    subtitle: 'Grand Prix Masters & Mountain Passes',
    tag: 'TIER 3 CHAMPIONSHIP',
    color: '#f43f5e', // Rose
    themeHex: 0xf43f5e,
    icon: Trophy,
    position: [0, 7.5, -48],
    cameraOffset: [0, 22, -22],
    description: 'High-stakes championship races against elite competitors on demanding circuits. Requires verified driver license certification.'
  }
];

// Helper to play synthesized sci-fi audio blips
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
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.04);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'select') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(1040, now + 0.09);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'launch') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.22);
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
  const roadPoints = path.map(p => {
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

const SectorHoverBar = ({ sector }: { sector: SectorMeta | null }) => {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [activeSector, setActiveSector] = useState<SectorMeta | null>(null);

  useEffect(() => {
    if (sector) {
      setActiveSector(sector);
    }
  }, [sector]);

  useEffect(() => {
    if (!activeSector) return;
    const measure = () => {
      const windowEl = windowRef.current;
      const trackEl = trackRef.current;
      if (!windowEl || !trackEl) return;
      setIsOverflowing(trackEl.scrollWidth > windowEl.clientWidth + 2);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeSector?.description, activeSector?.subtitle]);

  const isVisible = !!sector;

  return (
    <div
      className={`dealer-movie-bar pointer-events-none absolute inset-x-0 bottom-0 z-20 overflow-hidden border-y border-white/12 bg-black/92 px-6 py-4 text-center shadow-[0_0_35px_rgba(0,0,0,0.65)] transition-all duration-400 ease-in-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
      <div ref={windowRef} className="dealer-marquee-window text-sm font-semibold text-zinc-100">
        <div ref={trackRef} className={`dealer-marquee-track ${isOverflowing ? 'is-overflowing' : 'is-centered'}`}>
          <span className="text-zinc-200">{activeSector?.description || ''}</span>
        </div>
      </div>
    </div>
  );
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
  onOpenMapEditor
}: CareerMapProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<CareerSectorId>('overview');
  const [hoveredSectorId, setHoveredSectorId] = useState<CareerSectorId | null>(null);
  const [activeAcademyTier, setActiveAcademyTier] = useState<LicenseTier>('bronze');
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [activeTierScreen, setActiveTierScreen] = useState<CareerTierId | null>(null);
  const [isFadeInFromBlack, setIsFadeInFromBlack] = useState<boolean>(false);

  // Active sector to show in bottom hover bar (matches dealer city mode)
  const activeDisplaySector = useMemo(() => {
    if (hoveredSectorId) {
      return SECTORS.find(s => s.id === hoveredSectorId) || null;
    }
    if (selectedSectorId && selectedSectorId !== 'overview' && !isDetailOpen) {
      return SECTORS.find(s => s.id === selectedSectorId) || null;
    }
    return null;
  }, [hoveredSectorId, selectedSectorId, isDetailOpen]);

  // Calculate total license completion stats
  const totalLicenseTests = 40;
  const completedLicenseCount = useMemo(() => {
    return Object.values(licenseProgress).reduce(
      (sum, tierArr) => sum + tierArr.filter(Boolean).length,
      0
    );
  }, [licenseProgress]);

  const activeLicenseBadge = useMemo(() => {
    if (licenseProgress.platinum.every(Boolean)) return { name: 'Platinum License', color: 'text-amber-300 border-amber-400 bg-amber-950/40' };
    if (licenseProgress.gold.every(Boolean)) return { name: 'Gold License', color: 'text-yellow-400 border-yellow-500 bg-yellow-950/40' };
    if (licenseProgress.silver.every(Boolean)) return { name: 'Silver License', color: 'text-slate-200 border-slate-400 bg-slate-800/40' };
    if (licenseProgress.bronze.every(Boolean)) return { name: 'Bronze License', color: 'text-amber-600 border-amber-600 bg-amber-950/30' };
    return { name: 'Novice Driver', color: 'text-zinc-400 border-zinc-700 bg-zinc-900/40' };
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

  // Filter track groups for the 3 racing fields
  const amateurTracks = useMemo(() => {
    return TRACKS_DATABASE.filter(t => t.id === 'canopy_speedway' || t.id === 'sprint_circuit');
  }, []);

  const intermediateTracks = useMemo(() => {
    return TRACKS_DATABASE.filter(t => t.id === 'tokyo_megaloop' || t.id === 'driver_dojo');
  }, []);

  const professionalTracks = useMemo(() => {
    return TRACKS_DATABASE.filter(t => t.id === 'pro_race' || t.id === 'fuji_speedway' || t.id === 'east_hill_mountain');
  }, []);

  // -------------------------------------------------------------
  // THREE.JS 3D WORLD MAP INITIALIZATION & RENDER LOOP
  // -------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090e);
    scene.fog = new THREE.FogExp2(0x07090e, 0.0075);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 500);
    const initialCamPos = new THREE.Vector3(0, 68, 92);
    const initialTarget = new THREE.Vector3(0, 0, 0);
    camera.position.copy(initialCamPos);
    camera.lookAt(initialTarget);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x222a38, 1.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e6, 2.2);
    sunLight.position.set(60, 90, 45);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 250;
    sunLight.shadow.camera.left = -90;
    sunLight.shadow.camera.right = 90;
    sunLight.shadow.camera.top = 90;
    sunLight.shadow.camera.bottom = -90;
    scene.add(sunLight);

    const blueFillLight = new THREE.DirectionalLight(0x38bdf8, 1.0);
    blueFillLight.position.set(-60, 40, -50);
    scene.add(blueFillLight);

    // Central Cyber Grid Plane (Void Floor)
    const gridHelper = new THREE.GridHelper(260, 52, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -0.2;
    scene.add(gridHelper);

    // Ocean Water Floor
    const waterGeom = new THREE.PlaneGeometry(350, 350, 32, 32);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.12,
      metalness: 0.85,
      transparent: true,
      opacity: 0.95
    });
    const waterPlane = new THREE.Mesh(waterGeom, waterMat);
    waterPlane.rotation.x = -Math.PI / 2;
    waterPlane.position.y = -0.15;
    waterPlane.receiveShadow = true;
    scene.add(waterPlane);

    // --- MAIN ARCHIPELAGO ISLAND TERRAIN ---
    const islandGroup = new THREE.Group();
    scene.add(islandGroup);

    // Stylized Hexagonal / Low-poly Terrain Hubs
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.65,
      metalness: 0.25,
      flatShading: true
    });
    const terrainAccentMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.35,
      flatShading: true
    });

    // Central Main Base
    const centerGeom = new THREE.CylinderGeometry(28, 34, 4, 32);
    const centerIsland = new THREE.Mesh(centerGeom, islandMat);
    centerIsland.position.set(0, 1, 0);
    centerIsland.receiveShadow = true;
    islandGroup.add(centerIsland);

    // Sector Islands
    SECTORS.forEach((sec) => {
      const secRadius = 15;
      const secGeom = new THREE.CylinderGeometry(secRadius, secRadius + 3, 3.5, 16);
      const secIsland = new THREE.Mesh(secGeom, terrainAccentMat);
      secIsland.position.set(sec.position[0], sec.position[1] - 2, sec.position[2]);
      secIsland.receiveShadow = true;
      islandGroup.add(secIsland);

      // Glowing Base Perimeter Ring
      const ringGeom = new THREE.RingGeometry(secRadius - 0.2, secRadius + 0.4, 32);
      ringGeom.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: sec.themeHex,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.set(sec.position[0], sec.position[1] - 0.2, sec.position[2]);
      islandGroup.add(ringMesh);
    });

    // --- CONNECTING HIGH-TECH HIGHWAYS / NEON SPLINE ROADS ---
    const roadsGroup = new THREE.Group();
    scene.add(roadsGroup);

    SECTORS.forEach((sec, idx) => {
      const nextSec = SECTORS[(idx + 1) % SECTORS.length];
      
      // Road 1: Center to sector
      const p1 = new THREE.Vector3(0, 3, 0);
      const pMid = new THREE.Vector3(sec.position[0] * 0.5, 3.8, sec.position[2] * 0.5);
      const p2 = new THREE.Vector3(sec.position[0], sec.position[1], sec.position[2]);
      const curve = new THREE.CatmullRomCurve3([p1, pMid, p2]);

      const tubeGeom = new THREE.TubeGeometry(curve, 24, 0.4, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.7,
        roughness: 0.3
      });
      const tubeMesh = new THREE.Mesh(tubeGeom, tubeMat);
      roadsGroup.add(tubeMesh);

      // Neon road center stripe
      const points = curve.getPoints(40);
      const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: sec.themeHex,
        linewidth: 2,
        transparent: true,
        opacity: 0.75
      });
      const roadLine = new THREE.Line(lineGeom, lineMat);
      roadLine.position.y += 0.25;
      roadsGroup.add(roadLine);

      // Inter-sector outer highway loop
      const ringMid = new THREE.Vector3(
        (sec.position[0] + nextSec.position[0]) * 0.5 * 1.15,
        4.2,
        (sec.position[2] + nextSec.position[2]) * 0.5 * 1.15
      );
      const outerCurve = new THREE.CatmullRomCurve3([p2, ringMid, new THREE.Vector3(nextSec.position[0], nextSec.position[1], nextSec.position[2])]);
      const outerTube = new THREE.Mesh(
        new THREE.TubeGeometry(outerCurve, 20, 0.3, 8, false),
        tubeMat
      );
      roadsGroup.add(outerTube);
    });

    // --- 3D LANDMARK ARCHITECTURES & HOLOGRAPHIC PINS ---
    const landmarksGroup = new THREE.Group();
    scene.add(landmarksGroup);

    const interactiveLandmarkMeshes: THREE.Object3D[] = [];
    const pulsingRings: Array<{ mesh: THREE.Mesh; baseScale: number; speed: number }> = [];
    const floatingBadges: Array<{ group: THREE.Group; initialY: number; bobSpeed: number }> = [];

    SECTORS.forEach((sec) => {
      const landmarkHub = new THREE.Group();
      landmarkHub.position.set(...sec.position);
      landmarkHub.userData = { sectorId: sec.id };
      landmarksGroup.add(landmarkHub);

      // 1. SPECIFIC 3D LANDMARK MODELS ACCORDING TO SECTOR TYPE
      if (sec.id === 'academy') {
        // Futuristic Glass Training Dome + Training Gateway Arches
        const domeGeom = new THREE.SphereGeometry(4.2, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const domeMat = new THREE.MeshPhysicalMaterial({
          color: 0x06b6d4,
          transparent: true,
          opacity: 0.65,
          roughness: 0.1,
          transmission: 0.8,
          emissive: 0x083344,
          emissiveIntensity: 0.6
        });
        const dome = new THREE.Mesh(domeGeom, domeMat);
        dome.position.y = 0;
        landmarkHub.add(dome);

        // Surrounding orbital track loop
        const loopGeom = new THREE.TorusGeometry(7.5, 0.3, 12, 48);
        loopGeom.rotateX(Math.PI / 2.3);
        const loopMat = new THREE.MeshStandardMaterial({
          color: 0x22d3ee,
          emissive: 0x0891b2,
          emissiveIntensity: 0.8
        });
        const loop = new THREE.Mesh(loopGeom, loopMat);
        loop.position.y = 1.8;
        landmarkHub.add(loop);
      } else if (sec.id === 'editor') {
        // Holographic Drafting Grid Plinth + Laser Construction Towers
        const gridBox = new THREE.Mesh(
          new THREE.BoxGeometry(6, 0.6, 6),
          new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.4 })
        );
        gridBox.position.y = 0.3;
        landmarkHub.add(gridBox);

        // 4 Corner Laser Pylons
        [-2.5, 2.5].forEach(x => {
          [-2.5, 2.5].forEach(z => {
            const pylon = new THREE.Mesh(
              new THREE.CylinderGeometry(0.2, 0.35, 4.5, 8),
              new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xb45309, emissiveIntensity: 0.5 })
            );
            pylon.position.set(x, 2.25, z);
            landmarkHub.add(pylon);
          });
        });

        // Floating holographic track bezier symbol
        const knot = new THREE.Mesh(
          new THREE.TorusKnotGeometry(1.4, 0.25, 64, 16, 2, 3),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.8 })
        );
        knot.position.y = 3.5;
        landmarkHub.add(knot);
      } else if (sec.id === 'free_roam') {
        // Mountain Ridge Peak + Winding Coastal Road Loop
        const mtnGeom = new THREE.ConeGeometry(5, 6, 7);
        const mtnMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.8, flatShading: true });
        const mtn = new THREE.Mesh(mtnGeom, mtnMat);
        mtn.position.set(0, 3, 0);
        landmarkHub.add(mtn);

        const mtn2 = new THREE.Mesh(
          new THREE.ConeGeometry(3.5, 4.5, 6),
          new THREE.MeshStandardMaterial({ color: 0x047857, roughness: 0.8, flatShading: true })
        );
        mtn2.position.set(3, 2.2, 2);
        landmarkHub.add(mtn2);

        const roadLoop = new THREE.Mesh(
          new THREE.TorusGeometry(6.5, 0.35, 12, 32),
          new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.7 })
        );
        roadLoop.rotateX(Math.PI / 2);
        roadLoop.position.y = 0.5;
        landmarkHub.add(roadLoop);
      } else if (sec.id === 'amateur') {
        // Neon Oval Racing Stadium Arena
        const stadiumGeom = new THREE.TorusGeometry(6, 1.2, 16, 32);
        stadiumGeom.rotateX(Math.PI / 2);
        stadiumGeom.scale(1.3, 1, 0.9);
        const stadiumMat = new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          emissive: 0x0369a1,
          emissiveIntensity: 0.6
        });
        const stadium = new THREE.Mesh(stadiumGeom, stadiumMat);
        stadium.position.y = 1;
        landmarkHub.add(stadium);

        // Floodlight Pylons
        [-6, 6].forEach(x => {
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.25, 6, 8),
            new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.7 })
          );
          pole.position.set(x, 3, 0);
          landmarkHub.add(pole);
        });
      } else if (sec.id === 'intermediate') {
        // Cyber City Expressway Cloverleaf & High-rise Spires
        [-2.5, 0, 2.5].forEach((x, i) => {
          const height = 4.5 + i * 2.2;
          const tower = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, height, 1.6),
            new THREE.MeshStandardMaterial({ color: 0x581c87, emissive: 0x3b0764, emissiveIntensity: 0.6 })
          );
          tower.position.set(x, height * 0.5, -2 + i * 1.5);
          landmarkHub.add(tower);
        });

        // Double-deck elevated loop
        const loop1 = new THREE.Mesh(
          new THREE.TorusGeometry(5.5, 0.35, 16, 32),
          new THREE.MeshStandardMaterial({ color: 0xc084fc, emissive: 0x9333ea, emissiveIntensity: 0.8 })
        );
        loop1.rotateX(Math.PI / 2.2);
        loop1.position.y = 2.5;
        landmarkHub.add(loop1);
      } else if (sec.id === 'professional') {
        // Grand Prix Colosseum Circuit Stadium with Golden Champion Spires
        const colosseum = new THREE.Mesh(
          new THREE.CylinderGeometry(7, 8, 3, 32, 1, true),
          new THREE.MeshStandardMaterial({
            color: 0xbe123c,
            emissive: 0x881337,
            emissiveIntensity: 0.6,
            side: THREE.DoubleSide
          })
        );
        colosseum.position.y = 1.5;
        landmarkHub.add(colosseum);

        // Golden Champion Trophy Monolith
        const trophyGeom = new THREE.OctahedronGeometry(1.8, 0);
        const trophyMat = new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          metalness: 0.9,
          roughness: 0.1,
          emissive: 0xd97706,
          emissiveIntensity: 0.8
        });
        const trophyMesh = new THREE.Mesh(trophyGeom, trophyMat);
        trophyMesh.position.y = 4.5;
        landmarkHub.add(trophyMesh);
      }

      // 2. VERTICAL HOLOGRAPHIC LASER BEACON (Shooting skyward)
      const beaconGeom = new THREE.CylinderGeometry(0.12, 0.4, 38, 8, 1, true);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: sec.themeHex,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide
      });
      const beacon = new THREE.Mesh(beaconGeom, beaconMat);
      beacon.position.y = 19;
      landmarkHub.add(beacon);

      // 3. GROUND PULSING EXPANDING WAVE RINGS
      const waveGeom = new THREE.RingGeometry(0.8, 1.2, 32);
      waveGeom.rotateX(-Math.PI / 2);
      const waveMat = new THREE.MeshBasicMaterial({
        color: sec.themeHex,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
      });
      const waveMesh = new THREE.Mesh(waveGeom, waveMat);
      waveMesh.position.y = 0.2;
      landmarkHub.add(waveMesh);
      pulsingRings.push({ mesh: waveMesh, baseScale: 1.0, speed: 1.5 });

      // 4. FLOATING 3D ICON BADGE PIN (Interactive Raycast Target)
      const badgeGroup = new THREE.Group();
      badgeGroup.position.y = 7.5;
      landmarkHub.add(badgeGroup);

      const diamondGeom = new THREE.OctahedronGeometry(1.3, 0);
      const diamondMat = new THREE.MeshStandardMaterial({
        color: sec.themeHex,
        emissive: sec.themeHex,
        emissiveIntensity: 0.85,
        metalness: 0.5,
        roughness: 0.2
      });
      const diamond = new THREE.Mesh(diamondGeom, diamondMat);
      diamond.castShadow = true;
      badgeGroup.add(diamond);

      // Outer glowing halo
      const haloGeom = new THREE.TorusGeometry(1.9, 0.1, 16, 32);
      const haloMat = new THREE.MeshBasicMaterial({
        color: sec.themeHex,
        transparent: true,
        opacity: 0.8
      });
      const halo = new THREE.Mesh(haloGeom, haloMat);
      badgeGroup.add(halo);

      floatingBadges.push({ group: badgeGroup, initialY: 7.5, bobSpeed: 2.0 });

      // Invisible larger click collider for easy clicking
      const clickSphere = new THREE.Mesh(
        new THREE.SphereGeometry(6, 12, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      clickSphere.position.y = 4;
      clickSphere.userData = { sectorId: sec.id };
      landmarkHub.add(clickSphere);
      interactiveLandmarkMeshes.push(clickSphere);
    });

    // Floating Atmospheric Sparks / Cyber Particles
    const particleCount = 180;
    const particleGeom = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 160;
      particlePositions[i + 1] = Math.random() * 30 + 1;
      particlePositions[i + 2] = (Math.random() - 0.5) * 160;
    }
    particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.8,
      transparent: true,
      opacity: 0.6
    });
    const particles = new THREE.Points(particleGeom, particleMat);
    scene.add(particles);

    // --- INTERACTIVE ORBIT CONTROLS & CAMERA LERPING ---
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let orbitAngleX = 0;
    let orbitAngleY = 0;
    let zoomLevel = 1.0;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        orbitAngleX += deltaX * 0.005;
        orbitAngleY = Math.max(-0.4, Math.min(0.4, orbitAngleY + deltaY * 0.005));

        previousMousePosition = { x: e.clientX, y: e.clientY };
      }

      // Check raycast hover
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveLandmarkMeshes, false);
      if (intersects.length > 0) {
        const hitSecId = intersects[0].object.userData.sectorId as CareerSectorId;
        setHoveredSectorId(hitSecId);
        container.style.cursor = 'pointer';
      } else {
        setHoveredSectorId(null);
        container.style.cursor = isDragging ? 'grabbing' : 'grab';
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
      container.style.cursor = 'grab';
    };

    const handleClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveLandmarkMeshes, false);
      if (intersects.length > 0) {
        const hitSecId = intersects[0].object.userData.sectorId as CareerSectorId;
        handleSelectSector(hitSecId);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomLevel = Math.max(0.65, Math.min(1.5, zoomLevel + e.deltaY * 0.001));
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('click', handleClick);
    container.addEventListener('wheel', handleWheel, { passive: false });

    // Handle Window Resize
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // --- ANIMATION RENDER LOOP ---
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const currentCamTarget = new THREE.Vector3().copy(initialTarget);
    const desiredCamPos = new THREE.Vector3().copy(initialCamPos);
    const desiredLookAt = new THREE.Vector3().copy(initialTarget);

    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);
      const elapsedTime = clock.getElapsedTime();

      // 1. Update Camera Position & Target based on Selected Sector
      if (selectedSectorId === 'overview') {
        // Isometric wide view with gentle orbital drift
        const orbitRadius = 98 * zoomLevel;
        const camX = Math.sin(orbitAngleX) * orbitRadius;
        const camZ = Math.cos(orbitAngleX) * orbitRadius;
        const camY = Math.max(25, 68 * zoomLevel + orbitAngleY * 40);

        desiredCamPos.set(camX, camY, camZ);
        desiredLookAt.set(0, 0, 0);
      } else {
        const targetSec = SECTORS.find(s => s.id === selectedSectorId);
        if (targetSec) {
          const secPos = new THREE.Vector3(...targetSec.position);
          const camOffset = new THREE.Vector3(...targetSec.cameraOffset).multiplyScalar(zoomLevel);

          // Apply orbit adjustments to close-up view
          camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitAngleX);
          desiredCamPos.copy(secPos).add(camOffset);
          desiredLookAt.copy(secPos).add(new THREE.Vector3(0, 3, 0));
        }
      }

      // Smooth camera interpolation
      camera.position.lerp(desiredCamPos, 0.055);
      currentCamTarget.lerp(desiredLookAt, 0.055);
      camera.lookAt(currentCamTarget);

      // 2. Animate Pulsing Ground Wave Rings
      pulsingRings.forEach(ring => {
        const scale = ((elapsedTime * ring.speed) % 1) * 8 + 1;
        ring.mesh.scale.set(scale, scale, 1);
        (ring.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - scale / 9);
      });

      // 3. Animate Floating 3D Diamond Badges (Hover bob & spin)
      floatingBadges.forEach((badge, idx) => {
        badge.group.position.y = badge.initialY + Math.sin(elapsedTime * badge.bobSpeed + idx) * 0.45;
        badge.group.rotation.y = elapsedTime * 0.8 + idx;
      });

      // 4. Animate Central Sky Particles
      particles.rotation.y = elapsedTime * 0.02;

      renderer.render(scene, camera);
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('click', handleClick);
      container.removeEventListener('wheel', handleWheel);

      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      scene.clear();
    };
  }, [selectedSectorId, handleSelectSector]);

  // Selected Sector Object
  const currentSector = useMemo(() => {
    return SECTORS.find(s => s.id === selectedSectorId) || null;
  }, [selectedSectorId]);

  // Render Dedicated Tier Screen if active (Amateur Sky, Intermediate Forest, Professional Racetrack)
  if (activeTierScreen) {
    return (
      <EventTierScreen
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
    <div className="absolute inset-0 z-50 flex flex-col bg-zinc-950 text-white select-none overflow-hidden font-sans">
      {/* Black Fade-In Transition Overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black pointer-events-none transition-opacity duration-400 ease-out ${
          isFadeInFromBlack ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 3D WEBGL VIEWPORT CANVAS CONTAINER */}
      <div ref={mountRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" />

      {/* TOP HEADER STATUS & NAVIGATION BAR */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-zinc-950/95 via-zinc-950/80 to-transparent pointer-events-auto backdrop-blur-sm border-b border-zinc-800/40">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black tracking-[0.35em] text-rose-500 uppercase flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
              VELOCITY MOTORSPORT OVERWORLD
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wider uppercase flex items-center gap-2">
              CAREER 3D WORLD MAP
            </h1>
          </div>
        </div>

        {/* Player Stats Dashboard & Back Button */}
        <div className="flex items-center gap-3 sm:gap-5">
          {/* License Badge */}
          <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black tracking-wider uppercase ${activeLicenseBadge.color}`}>
            <Award className="w-4 h-4" />
            <span>{activeLicenseBadge.name}</span>
            <span className="text-[9px] opacity-75 font-mono">({completedLicenseCount}/40)</span>
          </div>

          {/* Credits Counter */}
          <div className="flex items-center gap-2 bg-zinc-900/90 border border-zinc-800 px-4 py-1.5 rounded-xl shadow-lg">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">BANK</span>
            <span className="text-sm font-black font-mono text-amber-400">
              {playerCredits.toLocaleString()} <span className="text-[10px] text-amber-500 font-bold">CR</span>
            </span>
          </div>

          {/* Back to Garage Button */}
          <button
            onClick={() => {
              playSoundBlip('select');
              onBackToGarage();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600/90 hover:bg-rose-500 text-white rounded-xl text-xs font-black tracking-widest uppercase transition-all shadow-lg hover:shadow-rose-600/30 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">RETURN TO GARAGE</span>
            <span className="sm:hidden">EXIT</span>
          </button>
        </div>
      </div>

      {/* QUICK SECTOR CAROUSEL PILL NAVIGATION */}
      <div className="relative z-10 flex items-center justify-start sm:justify-center gap-2 px-6 py-2 overflow-x-auto scrollbar-none pointer-events-auto bg-zinc-950/40 backdrop-blur-md">
        <button
          onClick={() => handleSelectSector('overview')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap border ${
            selectedSectorId === 'overview'
              ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/30 scale-105'
              : 'bg-zinc-900/80 hover:bg-zinc-800/90 border-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Overview</span>
        </button>

        {SECTORS.map((sector) => {
          const Icon = sector.icon;
          const isSelected = selectedSectorId === sector.id;
          const isHovered = hoveredSectorId === sector.id;

          return (
            <button
              key={sector.id}
              onClick={() => handleSelectSector(sector.id)}
              onMouseEnter={() => {
                setHoveredSectorId(sector.id);
                playSoundBlip('hover');
              }}
              onMouseLeave={() => setHoveredSectorId(null)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap border ${
                isSelected
                  ? 'bg-zinc-900 border-zinc-600 text-white shadow-xl scale-105'
                  : isHovered
                  ? 'bg-zinc-850 border-zinc-700 text-zinc-200'
                  : 'bg-zinc-900/70 hover:bg-zinc-850 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              style={{
                borderColor: isSelected ? sector.color : undefined,
                boxShadow: isSelected ? `0 0 16px ${sector.color}40` : undefined
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: sector.color }}
              />
              <Icon className="w-3.5 h-3.5" style={{ color: sector.color }} />
              <span>{sector.name}</span>
            </button>
          );
        })}
      </div>

      {/* 3D INTERACTIVE HUD OVERLAY HINTS */}
      {selectedSectorId === 'overview' && (
        <div className="absolute bottom-6 left-6 z-10 pointer-events-none flex flex-col gap-1.5 bg-zinc-950/80 border border-zinc-800/80 px-4 py-3 rounded-2xl backdrop-blur-md max-w-sm">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-cyan-400 uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            3D INTERACTIVE MAP CONTROLS
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Click on any 3D Landmark beacon or use the sector buttons above to focus camera and access races, licensing, and map tools. Drag to rotate world view.
          </p>
        </div>
      )}

      {/* SLIDE-IN GLASSMORPHIC MISSION DISPATCH / SECTOR DETAILS DRAWER */}
      {currentSector && isDetailOpen && (
        <div className="absolute top-24 right-4 sm:right-6 bottom-6 w-[min(520px,calc(100%-32px))] z-20 pointer-events-auto flex flex-col bg-zinc-950/92 border border-zinc-800 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-8 duration-300">
          {/* Drawer Header Banner */}
          <div
            className="p-5 border-b border-zinc-850 flex items-center justify-between"
            style={{
              background: `linear-gradient(135deg, ${currentSector.color}15, transparent)`
            }}
          >
            <div className="flex items-center gap-3.5">
              <div
                className="w-12 h-12 rounded-2xl border flex items-center justify-center shadow-lg"
                style={{
                  backgroundColor: `${currentSector.color}20`,
                  borderColor: `${currentSector.color}50`
                }}
              >
                {React.createElement(currentSector.icon, {
                  className: 'w-6 h-6',
                  style: { color: currentSector.color }
                })}
              </div>
              <div>
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
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Close
            </button>
          </div>

          {/* Drawer Content Body */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 scrollbar-thin scrollbar-thumb-zinc-800">
            {/* Sector Description */}
            <p className="text-xs text-zinc-400 leading-relaxed font-normal">
              {currentSector.description}
            </p>

            {/* ------------------------------------------------------------- */}
            {/* SECTOR 1: LICENSE ACADEMY CONTENT */}
            {/* ------------------------------------------------------------- */}
            {currentSector.id === 'academy' && (
              <div className="flex flex-col gap-4">
                {/* Driving School Tutorial Card */}
                <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-950/50 border border-cyan-800/40 flex items-center justify-center">
                      <HelpCircle className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-white">Driving School Tutorial</h4>
                      <span className="text-[10px] text-zinc-400">Basic acceleration, braking & yaw physics</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      playSoundBlip('launch');
                      startTutorial();
                    }}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                  >
                    Start (+200 CR)
                  </button>
                </div>

                {/* License Tier Navigation Tabs */}
                <div className="flex gap-1.5 bg-zinc-900/90 p-1.5 rounded-xl border border-zinc-800">
                  {LICENSE_TIERS.map(tier => {
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
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                        }`}
                      >
                        <span>{tier.name}</span>
                        <span className="text-[8px] font-mono opacity-80">{completed}/10</span>
                      </button>
                    );
                  })}
                </div>

                {/* 10 Tests for Active Tier */}
                {(() => {
                  const tests = LICENSE_TESTS_BY_TIER[activeAcademyTier] || [];
                  const completedCount = getLicenseTierCompletion(licenseProgress, activeAcademyTier);

                  return (
                    <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-2xl flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-white uppercase tracking-wider">
                          {activeAcademyTier} License Tests
                        </span>
                        <span className="text-[10px] font-mono text-cyan-400 font-bold">
                          {completedCount === 10 ? 'TIER COMPLETED' : `${10 - completedCount} REMAINING`}
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-2">
                        {tests.map(test => {
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
                                  ? 'bg-zinc-850 hover:bg-cyan-600/80 border-cyan-500/50 text-cyan-300 hover:text-white shadow-md'
                                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-650 cursor-not-allowed'
                              }`}
                            >
                              {isComplete ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : isUnlocked ? (
                                <>
                                  <span className="text-[11px]">T-{test.testNumber}</span>
                                </>
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

            {/* ------------------------------------------------------------- */}
            {/* SECTOR 2: CIRCUIT FORGE STUDIO (CUSTOM MAP EDITOR) */}
            {/* ------------------------------------------------------------- */}
            {currentSector.id === 'editor' && (
              <div className="flex flex-col gap-4">
                <div className="bg-zinc-900/90 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-950/40 border border-amber-800/40 flex items-center justify-center">
                      <Hammer className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base">3D Circuit Creation Bay</h3>
                      <span className="text-[9px] font-bold text-amber-500 tracking-wider uppercase">ARCHITECT SUITE</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-zinc-950 border border-zinc-850 p-2.5 rounded-xl text-left">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block">Elevation & Banking</span>
                      <span className="text-xs font-mono text-white">Full 3D Terrain & Splines</span>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-850 p-2.5 rounded-xl text-left">
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

            {/* ------------------------------------------------------------- */}
            {/* SECTOR 3: HORIZON PROVING GROUNDS (FREE ROAM) */}
            {/* ------------------------------------------------------------- */}
            {currentSector.id === 'free_roam' && (
              <div className="flex flex-col gap-4">
                <div className="bg-zinc-900/90 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center">
                      <Compass className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base">Open World Coastline</h3>
                      <span className="text-[9px] font-bold text-emerald-500 tracking-wider uppercase">INFINITE TEST DRIVE</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-zinc-950 border border-zinc-850 p-2.5 rounded-xl text-left">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block">Drift Rewards</span>
                      <span className="text-xs font-mono text-emerald-400">Passive Credit Payout</span>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-850 p-2.5 rounded-xl text-left">
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

            {/* ------------------------------------------------------------- */}
            {/* SECTOR 4: AMATEUR RACING FIELD */}
            {/* ------------------------------------------------------------- */}
            {currentSector.id === 'amateur' && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setActiveTierScreen('amateur')}
                  className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl text-xs font-black tracking-widest uppercase transition-all shadow-lg hover:shadow-sky-600/30 flex items-center justify-center gap-2 cursor-pointer mb-2"
                >
                  <Trophy className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>OPEN AMATEUR EVENT ARENA</span>
                </button>

                <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">
                  QUICK SPRINT RACES
                </span>

                {amateurTracks.map(track => {
                  const length = getTrackLength(track.path);
                  return (
                    <div
                      key={track.id}
                      className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between gap-4"
                    >
                      <div className="flex-1 text-left">
                        <h4 className="font-extrabold text-white text-sm">{track.name}</h4>
                        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                          {track.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-zinc-400">
                          <span>{formatDistance(length)}</span>
                          <span>•</span>
                          <span className="text-amber-400 font-bold">+{track.baseReward} CR</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          playSoundBlip('launch');
                          startRace(track.id);
                        }}
                        className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black tracking-wider uppercase transition-all shadow-md cursor-pointer whitespace-nowrap"
                      >
                        Enter
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SECTOR 5: INTERMEDIATE RACING FIELD */}
            {/* ------------------------------------------------------------- */}
            {currentSector.id === 'intermediate' && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setActiveTierScreen('intermediate')}
                  className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-black tracking-widest uppercase transition-all shadow-lg hover:shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer mb-2"
                >
                  <Trophy className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>OPEN INTERMEDIATE EVENT ARENA</span>
                </button>

                <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">
                  QUICK CHALLENGER RACES
                </span>

                {intermediateTracks.map(track => {
                  const isLocked = track.requiresLicense && !hasLicense;
                  const length = getTrackLength(track.path);
                  return (
                    <div
                      key={track.id}
                      className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between gap-4"
                    >
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-white text-sm">{track.name}</h4>
                          {isLocked && <Lock className="w-3.5 h-3.5 text-zinc-550" />}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                          {track.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-zinc-400">
                          <span>{formatDistance(length)}</span>
                          <span>•</span>
                          <span className="text-amber-400 font-bold">+{track.baseReward} CR</span>
                        </div>
                      </div>
                      <button
                        disabled={isLocked}
                        onClick={() => {
                          playSoundBlip('launch');
                          startRace(track.id);
                        }}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-all whitespace-nowrap ${
                          !isLocked
                            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md cursor-pointer'
                            : 'bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed'
                        }`}
                      >
                        {!isLocked ? 'Enter' : 'Locked'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SECTOR 6: PROFESSIONAL RACING FIELD */}
            {/* ------------------------------------------------------------- */}
            {currentSector.id === 'professional' && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setActiveTierScreen('professional')}
                  className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl text-xs font-black tracking-widest uppercase transition-all shadow-lg hover:shadow-rose-600/30 flex items-center justify-center gap-2 cursor-pointer mb-2"
                >
                  <Trophy className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>OPEN PROFESSIONAL GRAND PRIX</span>
                </button>

                <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                  QUICK GRAND PRIX RACES
                </span>

                {professionalTracks.map(track => {
                  const isLocked = track.requiresLicense && !hasLicense;
                  const length = getTrackLength(track.path);
                  return (
                    <div
                      key={track.id}
                      className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between gap-4"
                    >
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-white text-sm">{track.name}</h4>
                          {isLocked && <Lock className="w-3.5 h-3.5 text-zinc-550" />}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                          {track.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-zinc-400">
                          <span>{formatDistance(length)}</span>
                          <span>•</span>
                          <span className="text-amber-400 font-bold">+{track.baseReward} CR</span>
                        </div>
                      </div>
                      <button
                        disabled={isLocked}
                        onClick={() => {
                          playSoundBlip('launch');
                          startRace(track.id);
                        }}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-all whitespace-nowrap ${
                          !isLocked
                            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md cursor-pointer'
                            : 'bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed'
                        }`}
                      >
                        {!isLocked ? 'Enter' : 'Locked'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTOR HOVER MOVIE BAR (Matching Dealer in City Mode) */}
      <SectorHoverBar sector={activeDisplaySector} />
    </div>
  );
}
