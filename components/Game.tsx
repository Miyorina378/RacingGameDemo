'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GameEngine } from './gameEngine';
import { CARS_DATABASE, CarConfig } from './config/CarDatabase';
import { TRACKS_DATABASE, TrackConfig, TrackNode, TrackScenery } from './config/TrackDatabase';
import {
  Wrench,
  Coins,
  Award,
  Compass,
  Flag,
  RotateCcw,
  LogOut,
  Volume2,
  VolumeX,
  HelpCircle,
  Check,
  Lock,
  Paintbrush,
  Trophy,
  Map,
  Copy,
  Play,
  Timer,
  Car,
  Settings
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  HUDConfig,
  DEFAULT_HUD_CONFIG,
  loadHUDConfig,
  saveHUDConfig,
  loadMirrorInTPS,
  saveMirrorInTPS,
  loadSoundEnabled,
  saveSoundEnabled,
  KeyBindings,
  DEFAULT_KEY_BINDINGS,
  loadKeyBindings,
  saveKeyBindings
} from './option';

import Garage from './ui/Garage';
import Setting from './ui/Setting';
import HUD from './ui/HUD';
import GameOverlays from './ui/GameOverlays';
import HelpModal from './ui/HelpModal';
import HUDCustomizer from './ui/HUDCustomizer';
import MapEditor from './ui/MapEditor';
import { GraphicsFeatures, QUALITY_PRESETS } from './PostProcessing';
import {
  DEFAULT_LICENSE_TEST_ID,
  LicenseProgress,
  createDefaultLicenseProgress,
  hasAnyLicense,
  loadLicenseProgress
} from './config/LicenseDatabase';

const RacingFlagsIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Flagpoles */}
    <line x1="4" y1="20" x2="18" y2="6" strokeWidth="2" />
    <line x1="20" y1="20" x2="6" y2="6" strokeWidth="2" />
    {/* Waving chequered flag 1 */}
    <path d="M4 6c3-1.5 6 .5 9-1 3-1.5 6-1 7 .5v6c-1-1.5-4-2-7-.5-3 1.5-6-.5-9 1V6z" fill="currentColor" fillOpacity="0.2" />
    <path d="M7 6.5h2v1.5H7z M11 5.8h2v1.5h-2z M15 5.2h2v1.5h-2z" fill="currentColor" />
    {/* Waving chequered flag 2 */}
    <path d="M20 6c-3-1.5-6 .5-9-1-3-1.5-6-1-7 .5v6c1-1.5 4-2 7-.5 3 1.5 6-.5 9 1V6z" fill="currentColor" fillOpacity="0.1" />
    <path d="M15 6.5h2v1.5h-2z M11 7.2h2v1.5h-2z M7 7.8h2v1.5H7z" fill="currentColor" />
  </svg>
);

const S2000Icon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Car wheels */}
    <circle cx="6.5" cy="15.5" r="2" fill="currentColor" fillOpacity="0.25" strokeWidth="2" />
    <circle cx="17.5" cy="15.5" r="2" fill="currentColor" fillOpacity="0.25" strokeWidth="2" />
    {/* Roadster body line */}
    <path d="M2 14h2c.2-1.1 1.1-2 2.3-2s2.1.9 2.3 2h6.8c.2-1.1 1.1-2 2.3-2s2.1.9 2.3 2h2v-2c-.3-1.5-1.5-3.5-3-3.8-1-.2-2.5-.2-3.5-.2h-2L12.5 8H8l-2.5 4H2v2z" strokeWidth="1.6" />
    {/* Windshield */}
    <path d="M10.2 11.2L12 8.2" strokeWidth="1.8" />
    {/* Door line */}
    <path d="M9.8 14V11" />
    {/* Spoiler */}
    <path d="M19.5 10c.8 0 1.5.3 1.5.5" />
  </svg>
);

const RealisticWrenchIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Solid metallic handle shaft */}
    <line x1="7.5" y1="16.5" x2="16.5" y2="7.5" strokeWidth="3" />
    {/* Inner metallic line detail */}
    <line x1="8.5" y1="15.5" x2="15.5" y2="8.5" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
    {/* Wrench head claw 1 */}
    <path d="M16 4.5c.7-.7 1.7-1 2.7-.8 1.5.3 2.5 1.5 2.5 3s-1 2.7-2.5 3c-1 .2-2-.1-2.7-.8l-1.5-1.5L16 4.5z" fill="currentColor" fillOpacity="0.25" strokeWidth="1.5" />
    {/* Wrench jaw cutout 1 */}
    <path d="M17.5 5.5l2.5 2.5" strokeWidth="2" />
    {/* Wrench head claw 2 */}
    <path d="M8 19.5c-.7.7-1.7 1-2.7.8-1.5-.3-2.5-1.5-2.5-3s1-2.7 2.5-3c1-.2 2 .1 2.7.8l1.5 1.5L8 19.5z" fill="currentColor" fillOpacity="0.25" strokeWidth="1.5" />
    {/* Wrench jaw cutout 2 */}
    <path d="M4 16l2.5 2.5" strokeWidth="2" />
  </svg>
);

const MechanicalGearIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Center spoke holes */}
    <circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity="0.3" />
    {/* Outer gear circle */}
    <circle cx="12" cy="12" r="6" strokeWidth="1.5" />
    {/* 8 detailed teeth */}
    <path d="M11 4h2l.5 2h-3L11 4z M11 18h2l.5 2h-3L11 18z M4 11v2l2 .5v-3L4 11z M18 11v2l2 .5v-3L18 11z M6.4 6.4l1.4 1.4-1.4 1.4-1.4-1.4 1.4-1.4z M16.2 16.2l1.4 1.4-1.4 1.4-1.4-1.4 1.4-1.4z M6.4 17.6l1.4-1.4 1.4 1.4-1.4 1.4-1.4-1.4z M16.2 7.8l1.4-1.4 1.4 1.4-1.4 1.4-1.4-1.4z" fill="currentColor" />
  </svg>
);

const PAINT_SWATCHES = [
  { name: 'Rose Red', hex: '#f43f5e' },
  { name: 'Cyber Cyan', hex: '#06b6d4' },
  { name: 'Fuchsia Pink', hex: '#d946ef' },
  { name: 'Volt Yellow', hex: '#eab308' },
  { name: 'Lime Green', hex: '#22c55e' },
  { name: 'Sunset Orange', hex: '#f97316' },
  { name: 'Deep Purple', hex: '#8b5cf6' }
];

const DEFAULT_UPGRADES = {
  mufflers: 0,
  brake: {
    level: 0,
    hasABS: false,
    hasESC: false
  },
  aspiration: 'natural' as 'natural' | 'turbo',
  weightReduction: 0,
  driveTrain: {
    gearboxLevel: 0,
    clutchLevel: 0,
    flywheelLevel: 0,
    propellerShaftLevel: 0
  },
  engine: {
    ecuLevel: 0,
    engineBalancingLevel: 0,
    portGrindingLevel: 0
  },
  suspensionLevel: 0,
  bodyControlModuleLevel: 0,
  tireLevel: 0,
  tireCompound: 'economy',
  purchasedToggles: {
    hasABS: false,
    hasESC: false,
    turbo: false
  },
  purchasedLevels: {} as { [key: string]: number }
};

const UPGRADES_CONFIG = [
  {
    group: 'Engine & Exhaust',
    items: [
      {
        id: 'mufflers',
        name: 'Sports Mufflers',
        description: 'Reduces exhaust backpressure for improved torque.',
        type: 'level',
        maxLevel: 3,
        costs: [300, 600, 1200],
        path: ['mufflers']
      },
      {
        id: 'ecuLevel',
        name: 'Sports ECU Tuning',
        description: 'Digitally remapped fuel tables for flat torque gains.',
        type: 'level',
        maxLevel: 3,
        costs: [400, 800, 1600],
        path: ['engine', 'ecuLevel']
      },
      {
        id: 'engineBalancingLevel',
        name: 'Engine Balancing',
        description: 'Harmonizes internal components, raising max RPM limit.',
        type: 'level',
        maxLevel: 3,
        costs: [500, 1000, 2000],
        path: ['engine', 'engineBalancingLevel']
      },
      {
        id: 'portGrindingLevel',
        name: 'Cylinder Port Grinding',
        description: 'Smooths cylinder airflow for high RPM torque gains.',
        type: 'level',
        maxLevel: 3,
        costs: [600, 1200, 2400],
        path: ['engine', 'portGrindingLevel']
      },
      {
        id: 'aspiration',
        name: 'Turbocharger',
        description: 'Adds a force-fed turbo boost spike at mid-to-high RPM.',
        type: 'toggle',
        cost: 2500,
        path: ['aspiration']
      }
    ]
  },
  {
    group: 'Drivetrain',
    items: [
      {
        id: 'gearboxLevel',
        name: 'Race Gearbox',
        description: 'Lowers shift times and optimizes top-end gear ratios.',
        type: 'level',
        maxLevel: 3,
        costs: [500, 1000, 2000],
        path: ['driveTrain', 'gearboxLevel']
      },
      {
        id: 'clutchLevel',
        name: 'Heavy Duty Clutch',
        description: 'Minimizes drivetrain slipping, boosting transmission efficiency.',
        type: 'level',
        maxLevel: 3,
        costs: [300, 600, 1200],
        path: ['driveTrain', 'clutchLevel']
      },
      {
        id: 'flywheelLevel',
        name: 'Lightweight Flywheel',
        description: 'Lightens rotational inertia, allowing faster RPM response.',
        type: 'level',
        maxLevel: 3,
        costs: [450, 900, 1800],
        path: ['driveTrain', 'flywheelLevel']
      },
      {
        id: 'propellerShaftLevel',
        name: 'Carbon Propeller Shaft',
        description: 'Lightweight shaft reduces power loss to the driving wheels.',
        type: 'level',
        maxLevel: 2,
        costs: [800, 1600],
        path: ['driveTrain', 'propellerShaftLevel']
      }
    ]
  },
  {
    group: 'Chassis & Electronics',
    items: [
      {
        id: 'suspensionLevel',
        name: 'Sports Suspension',
        description: 'Lowers center of gravity, sharpens turn-in, and reduces body roll.',
        type: 'level',
        maxLevel: 3,
        costs: [400, 800, 1600],
        path: ['suspensionLevel']
      },
      {
        id: 'weightReduction',
        name: 'Weight Reduction',
        description: 'Directly drops mass, improving speed, acceleration, and braking.',
        type: 'level',
        maxLevel: 3,
        costs: [600, 1200, 2400],
        path: ['weightReduction']
      },
      {
        id: 'brakeLevel',
        name: 'Brake Upgrade',
        description: 'Increases absolute braking force and clamping power.',
        type: 'level',
        maxLevel: 3,
        costs: [300, 600, 1200],
        path: ['brake', 'level']
      },
      {
        id: 'hasABS',
        name: 'ABS (Anti-lock Brakes)',
        description: 'Prevents wheel lock and maintains steering control under heavy braking.',
        type: 'toggle',
        cost: 1000,
        path: ['brake', 'hasABS']
      },
      {
        id: 'hasESC',
        name: 'ESC (Stability Control)',
        description: 'Electronic Stability Control dampens drift angles when sliding out.',
        type: 'toggle',
        cost: 1500,
        path: ['brake', 'hasESC']
      },
      {
        id: 'bodyControlModuleLevel',
        name: 'Traction Control System (TCS)',
        description: 'Electronic system preventing low-speed wheel spin.',
        type: 'level',
        maxLevel: 3,
        costs: [500, 1000, 2000],
        path: ['bodyControlModuleLevel']
      },
      {
        id: 'tireLevel',
        name: 'Sport & Racing Tires',
        description: 'Progresses from stable sport tires to high-grip racing and qualifying compounds.',
        type: 'level',
        maxLevel: 8,
        costs: [300, 550, 850, 1200, 1650, 2200, 2900, 3800],
        path: ['tireLevel']
      }
    ]
  }
];

const getTrackLength = (path: THREE.Vector3[]) => {
  if (!path || path.length < 3) return 0;
  const roadPoints = path.map(p => new THREE.Vector3(p.x, 0.01, p.z));
  const curve = new THREE.CatmullRomCurve3(roadPoints, true);
  return curve.getLength();
};

const formatDistance = (meters: number) => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
};

const formatTime = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 1000);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const formatResultTime = (timeInSecs: number) => {
  const m = Math.floor(timeInSecs / 60);
  const s = Math.floor(timeInSecs % 60);
  const ms = Math.floor((timeInSecs % 1) * 1000);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const getUpgradedStats = (car: CarConfig, upgrades: any) => {
  if (!upgrades) return { speed: car.speed, acceleration: car.acceleration, handling: car.handling };

  const gearboxLvl = upgrades.driveTrain?.gearboxLevel || 0;
  const mufflersLvl = upgrades.mufflers || 0;
  const ecuLvl = upgrades.engine?.ecuLevel || 0;
  const balancingLvl = upgrades.engine?.engineBalancingLevel || 0;
  const portGrindingLvl = upgrades.engine?.portGrindingLevel || 0;
  const weightLvl = upgrades.weightReduction || 0;
  const clutchLvl = upgrades.driveTrain?.clutchLevel || 0;
  const flywheelLvl = upgrades.driveTrain?.flywheelLevel || 0;
  const propLvl = upgrades.driveTrain?.propellerShaftLevel || 0;
  const suspensionLvl = upgrades.suspensionLevel || 0;
  const isTurbo = upgrades.aspiration === 'turbo' || upgrades.purchasedToggles?.turbo;

  // Speed increases with gearbox level and ECU level (RPM raising)
  const upgradedSpeed = car.speed + (gearboxLvl * 0.4) + (ecuLvl * 0.1) + (balancingLvl * 0.1);

  // Acceleration increases with engine modifications, drivetrain, turbo, and weight reduction
  const upgradedAcceleration = car.acceleration +
    (mufflersLvl * 0.15) +
    (ecuLvl * 0.2) +
    (portGrindingLvl * 0.25) +
    (isTurbo ? 0.8 : 0) +
    (clutchLvl * 0.15) +
    (flywheelLvl * 0.1) +
    (propLvl * 0.1) +
    (weightLvl * 0.3);

  const tireCompound = upgrades.tireCompound || 'economy';
  const tireHandlingBoosts: Record<string, number> = {
    economy: 0,
    sport_hard: 0.3,
    sport_medium: 0.55,
    sport_soft: 0.85,
    super_hard: 1.25,
    hard: 1.55,
    normal: 1.9,
    soft: 2.2,
    super_soft: 2.5
  };
  const tireHandlingBoost = tireHandlingBoosts[tireCompound] ?? 0;

  // Handling increases with suspension, weight reduction (lighter is more nimble), and stabilizer levels
  const upgradedHandling = car.handling +
    (suspensionLvl * 0.5) +
    (weightLvl * 0.2) +
    (upgrades.brake?.level * 0.1 || 0) +
    tireHandlingBoost;

  return {
    speed: Math.min(15, upgradedSpeed),
    acceleration: Math.min(15, upgradedAcceleration),
    handling: Math.min(15, upgradedHandling)
  };
};

const isTogglePurchased = (carUpgradesForCar: any, itemId: string) => {
  const currentCarUpgrades = carUpgradesForCar || DEFAULT_UPGRADES;
  if (!currentCarUpgrades.purchasedToggles) return false;
  if (itemId === 'hasABS') return !!currentCarUpgrades.purchasedToggles.hasABS;
  if (itemId === 'hasESC') return !!currentCarUpgrades.purchasedToggles.hasESC;
  if (itemId === 'aspiration') return !!currentCarUpgrades.purchasedToggles.turbo;
  return false;
};

// HUDConfig is imported from root option.ts

const renderToolIcon = (tool: string, isActive: boolean) => {
  switch (tool) {
    case 'node':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 6,36 C 18,36 30,30 30,18 C 30,12 36,6 42,6" stroke={isActive ? "#d946ef" : "#a855f7"} strokeWidth="6" strokeLinecap="round" />
          <path d="M 6,36 C 18,36 30,30 30,18 C 30,12 36,6 42,6" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3,3" strokeLinecap="round" />
          <circle cx="30" cy="18" r="4" fill="#06b6d4" />
        </svg>
      );
    case 'tree1':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="22" y="32" width="4" height="10" rx="1" fill="#78350f" />
          <path d="M 24,6 L 12,22 L 36,22 Z" fill={isActive ? "#22c55e" : "#16a34a"} />
          <path d="M 24,14 L 8,30 L 40,30 Z" fill={isActive ? "#16a34a" : "#15803d"} />
        </svg>
      );
    case 'tree2':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="21" y="30" width="6" height="12" rx="1.5" fill="#78350f" />
          <circle cx="24" cy="20" r="12" fill={isActive ? "#16a34a" : "#15803d"} />
          <circle cx="20" cy="16" r="7" fill={isActive ? "#4ade80" : "#22c55e"} style={{ opacity: 0.85 }} />
        </svg>
      );
    case 'tree3':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 24,42 Q 22,28 24,18" stroke="#a16207" strokeWidth="3" strokeLinecap="round" />
          <path d="M 24,18 Q 14,14 10,22" stroke={isActive ? "#4ade80" : "#22c55e"} strokeWidth="3" strokeLinecap="round" />
          <path d="M 24,18 Q 34,14 38,22" stroke={isActive ? "#4ade80" : "#22c55e"} strokeWidth="3" strokeLinecap="round" />
          <path d="M 24,18 Q 16,10 20,6" stroke={isActive ? "#86efac" : "#4ade80"} strokeWidth="3" strokeLinecap="round" />
          <path d="M 24,18 Q 32,10 28,6" stroke={isActive ? "#86efac" : "#4ade80"} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'rock':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 24,8 L 38,20 L 32,38 L 16,38 L 10,20 Z" fill={isActive ? "#a8a29e" : "#78716c"} stroke="#57534e" strokeWidth="2" />
          <path d="M 24,8 L 24,24 L 10,20" stroke="#44403c" strokeWidth="1.5" />
          <path d="M 24,24 L 38,20" stroke="#44403c" strokeWidth="1.5" />
          <path d="M 24,24 L 32,38" stroke="#44403c" strokeWidth="1.5" />
          <path d="M 24,24 L 16,38" stroke="#44403c" strokeWidth="1.5" />
        </svg>
      );
    case 'mountain':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 24,8 L 6,38 L 42,38 Z" fill={isActive ? "#71717a" : "#3f3f46"} />
          <path d="M 24,8 L 18,18 L 24,16 L 30,18 Z" fill="#ffffff" />
          <path d="M 24,8 L 24,38" stroke="#18181b" strokeWidth="1.5" />
        </svg>
      );
    case 'hill':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 4,38 Q 24,12 44,38 Z" fill={isActive ? "#d97706" : "#b45309"} />
          <path d="M 8,38 Q 24,16 40,38 Z" fill={isActive ? "#22c55e" : "#15803d"} style={{ opacity: 0.85 }} />
        </svg>
      );
    case 'podium':
      return (
        <svg className="w-10 h-10" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 8,36 L 40,36 L 40,24 L 28,24 L 28,16 L 8,16 Z" fill={isActive ? "#475569" : "#334155"} stroke="#1e293b" strokeWidth="1.5" />
          <line x1="8" y1="28" x2="40" y2="28" stroke="#06b6d4" strokeWidth="2" />
          <line x1="8" y1="20" x2="28" y2="20" stroke="#06b6d4" strokeWidth="2" />
          <line x1="10" y1="16" x2="10" y2="8" stroke="#64748b" strokeWidth="2" />
          <line x1="38" y1="24" x2="38" y2="8" stroke="#64748b" strokeWidth="2" />
          <path d="M 6,10 L 42,6 L 38,10 L 10,12 Z" fill={isActive ? "#f43f5e" : "#d946ef"} />
        </svg>
      );
    default:
      return null;
  }
};

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const quickPlayOriginalCarRef = useRef<string | null>(null);

  // Synced States with Engine
  const [activeMode, setActiveMode] = useState<'garage' | 'free_roam' | 'license' | 'race' | 'tutorial' | 'editor'>('garage');
  const [tutorialStep, setTutorialStep] = useState<number>(0);
  const [activeCarId, setActiveCarId] = useState<string>('starter');
  const [playerCredits, setPlayerCredits] = useState<number>(500);
  const [hasLicense, setHasLicense] = useState<boolean>(false);
  const [licenseProgress, setLicenseProgress] = useState<LicenseProgress>(() => createDefaultLicenseProgress(false));
  const [activeLicenseTestId, setActiveLicenseTestId] = useState<string>(DEFAULT_LICENSE_TEST_ID);
  const [purchasedCars, setPurchasedCars] = useState<string[]>(['starter']);
  const [activeTrackId, setActiveTrackId] = useState<string>('sprint_circuit');

  // Customization
  const [selectedColor, setSelectedColor] = useState<string>('#f43f5e');

  // Real-time HUD States
  const [speed, setSpeed] = useState<number>(0);
  const [rpm, setRpm] = useState<number>(1000);
  const [gear, setGear] = useState<number>(1);
  const [isShifting, setIsShifting] = useState<boolean>(false);
  const [throttleInput, setThrottleInput] = useState<number>(0);
  const [brakeInput, setBrakeInput] = useState<number>(0);
  const [fuelLiters, setFuelLiters] = useState<number>(0);
  const [fuelCapacityLiters, setFuelCapacityLiters] = useState<number>(0);
  const [fuelConsumptionLitersPerHour, setFuelConsumptionLitersPerHour] = useState<number>(0);
  const [isEngineStalled, setIsEngineStalled] = useState<boolean>(false);
  const [tireWear, setTireWear] = useState<number>(0);
  const [tireTemperature, setTireTemperature] = useState<number>(25);
  const [tireCompound, setTireCompound] = useState<string>('economy');
  const [tireWearEnabled, setTireWearEnabled] = useState<boolean>(false);
  const [cameraViewMode, setCameraViewMode] = useState<'chase' | 'driver'>('chase');
  const [showMirrorInTPS, setShowMirrorInTPS] = useState<boolean>(false);
  const [hudConfig, setHudConfig] = useState<HUDConfig>(DEFAULT_HUD_CONFIG);
  const [showHUDCustomizer, setShowHUDCustomizer] = useState<boolean>(false);
  const [driftScore, setDriftScore] = useState<number>(0);
  const [driftMultiplier, setDriftMultiplier] = useState<number>(1);
  const [recentDriftGain, setRecentDriftGain] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [totalRaceTime, setTotalRaceTime] = useState<number>(0);
  const [bestLapTime, setBestLapTime] = useState<number>(Infinity);
  const [currentLapTime, setCurrentLapTime] = useState<number>(0);
  const [checkpointIndex, setCheckpointIndex] = useState<number>(0);
  const [totalCheckpoints, setTotalCheckpoints] = useState<number>(0);
  const [placement, setPlacement] = useState<number>(1);
  const [prevPlacement, setPrevPlacement] = useState<number>(1);
  const [placementShift, setPlacementShift] = useState<'up' | 'down' | null>(null);
  const [totalParticipants, setTotalParticipants] = useState<number>(3);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Status Overlays
  const [gameStatus, setGameStatus] = useState<'idle' | 'countdown' | 'playing' | 'success' | 'failed'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [raceResults, setRaceResults] = useState<any[] | null>(null);

  // Sound toggle (visual only for retro feel)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Key bindings State
  const [keyBindings, setKeyBindings] = useState<KeyBindings>(DEFAULT_KEY_BINDINGS);

  // Graphics Quality State
  const [graphicsQuality, setGraphicsQuality] = useState<'low' | 'medium' | 'high'>(() => {
    if (typeof window !== 'undefined') {
      const q = localStorage.getItem('cyberdrive_graphics_quality');
      if (q === 'low' || q === 'medium' || q === 'high') return q;
    }
    return 'high';
  });

  // Individual Graphics Feature Flags
  const [graphicsFeatures, setGraphicsFeatures] = useState<GraphicsFeatures>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cyberdrive_graphics_features');
      if (saved) {
        try { return { ...QUALITY_PRESETS['high'], ...JSON.parse(saved) }; } catch { /* fallback */ }
      }
      const q = localStorage.getItem('cyberdrive_graphics_quality');
      if (q === 'low' || q === 'medium' || q === 'high') return { ...QUALITY_PRESETS[q] };
    }
    return { ...QUALITY_PRESETS['high'] };
  });

  const changeGraphicsQuality = (quality: 'low' | 'medium' | 'high') => {
    setGraphicsQuality(quality);
    localStorage.setItem('cyberdrive_graphics_quality', quality);
    const preset = QUALITY_PRESETS[quality];
    setGraphicsFeatures({ ...preset });
    if (engineRef.current && engineRef.current.postProcessing) {
      engineRef.current.postProcessing.setQuality(quality);
    }
  };

  const changeGraphicsFeature = (feature: keyof GraphicsFeatures, value: boolean) => {
    const updated = { ...graphicsFeatures, [feature]: value };
    setGraphicsFeatures(updated);
    localStorage.setItem('cyberdrive_graphics_features', JSON.stringify(updated));
    if (engineRef.current && engineRef.current.postProcessing) {
      engineRef.current.postProcessing.setFeatures({ [feature]: value });
    }
  };

  // Bloom Intensity State
  const [bloomIntensity, setBloomIntensity] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const b = localStorage.getItem('cyberdrive_bloom_intensity');
      const parsed = b !== null ? parseFloat(b) : 0.30;
      // Normalise to 0.30 if stored value is high from old default
      return parsed > 0.5 ? 0.30 : parsed;
    }
    return 0.30;
  });

  const changeBloomIntensity = (intensity: number) => {
    setBloomIntensity(intensity);
    if (engineRef.current && engineRef.current.postProcessing) {
      engineRef.current.postProcessing.setBloomIntensity(intensity);
    }
  };

  // Screen Brightness State
  const [brightness, setBrightness] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const b = localStorage.getItem('cyberdrive_brightness');
      if (b !== null) {
        const val = parseInt(b, 10);
        if (val >= 0 && val <= 10) return val;
      }
    }
    return 5;
  });

  const changeBrightness = (val: number) => {
    setBrightness(val);
    localStorage.setItem('cyberdrive_brightness', val.toString());
  };

  // Audio Volume State
  const [masterVolume, setMasterVolume] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('cyberdrive_master_volume');
      if (v !== null) {
        const val = parseInt(v, 10);
        if (val >= 0 && val <= 100) return val;
      }
    }
    return 80;
  });

  const changeMasterVolume = (val: number) => {
    setMasterVolume(val);
    localStorage.setItem('cyberdrive_master_volume', val.toString());
  };

  const [musicVolume, setMusicVolume] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('cyberdrive_music_volume');
      if (v !== null) {
        const val = parseInt(v, 10);
        if (val >= 0 && val <= 100) return val;
      }
    }
    return 70;
  });

  const changeMusicVolume = (val: number) => {
    setMusicVolume(val);
    localStorage.setItem('cyberdrive_music_volume', val.toString());
  };

  const [sfxVolume, setSfxVolume] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('cyberdrive_sfx_volume');
      if (v !== null) {
        const val = parseInt(v, 10);
        if (val >= 0 && val <= 100) return val;
      }
    }
    return 90;
  });

  const changeSfxVolume = (val: number) => {
    setSfxVolume(val);
    localStorage.setItem('cyberdrive_sfx_volume', val.toString());
  };


  const handleKeyBindingsChange = (newBindings: KeyBindings) => {
    setKeyBindings(newBindings);
    saveKeyBindings(newBindings);
    if (engineRef.current) {
      engineRef.current.keyBindings = newBindings;
    }
  };

  // UI Upgrades State
  const [carUpgrades, setCarUpgrades] = useState<{ [carId: string]: any }>({});

  // UI Tabs
  const [activeGarageTab, setActiveGarageTab] = useState<null | 'drive' | 'dealer' | 'tuning' | 'setting'>(null);
  const [tuningState, setTuningState] = useState<'closed' | 'entering' | 'open' | 'exiting'>('closed');
  const [settingsSubTab, setSettingsSubTab] = useState<'audio' | 'graphics' | 'control' | 'layout'>('graphics');

  // Shrink Canvas Preview states & ref
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [placeholderRect, setPlaceholderRect] = useState<DOMRect | null>(null);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const [settingsTransitionComplete, setSettingsTransitionComplete] = useState<boolean>(false);
  const [settingsState, setSettingsState] = useState<'closed' | 'entering' | 'open' | 'exiting_ui' | 'expanding_canvas'>('closed');
  const [noTransition, setNoTransition] = useState<boolean>(false);

  useEffect(() => {
    const isShrunk = (activeGarageTab === 'setting' && settingsSubTab === 'graphics' &&
      (settingsState === 'open' || settingsState === 'exiting_ui' ||
        settingsState === 'entering')) || (tuningState !== 'closed');

    if (!isShrunk) {
      setPlaceholderRect(null);
      return;
    }

    let alive = true;

    const updateRect = () => {
      if (!alive || !placeholderRef.current) return;
      const rect = placeholderRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setPlaceholderRect(rect);
      }
    };

    // ResizeObserver catches all layout shifts
    const ro = new ResizeObserver(updateRect);
    if (placeholderRef.current) ro.observe(placeholderRef.current);

    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    updateRect(); // initial attempt

    return () => {
      alive = false;
      ro.disconnect();
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [activeGarageTab, settingsSubTab, settingsState, tuningState]);

  // Call resize only at key transition milestones to avoid dynamic layout thrashing
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.handleResize();
    }
  }, [activeGarageTab, settingsSubTab, placeholderRect, settingsTransitionComplete, settingsState]);

  useEffect(() => {
    if (engineRef.current) {
      (engineRef.current as any).tuningState = tuningState;
    }
  }, [tuningState]);

  const [isTransitioningDrive, setIsTransitioningDrive] = useState<boolean>(false);
  const [isBlackOverlay, setIsBlackOverlay] = useState<boolean>(false);
  const [selectedBrand, setSelectedBrand] = useState<string>('All');

  // Keyboard help modal toggle
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Custom Map Editor States
  const [livePreview, setLivePreview] = useState<boolean>(false);
  const [editorNodes, setEditorNodes] = useState<{ x: number; z: number; y?: number; width?: number; banking?: number }[]>([]);
  const [editorScenery, setEditorScenery] = useState<{ type: 'tree' | 'tree1' | 'tree2' | 'tree3' | 'rock' | 'mountain' | 'hill' | 'podium'; x: number; z: number; scale: number; heightScale?: number; rotation?: number }[]>([]);
  const [editorTool, setEditorTool] = useState<'node' | 'tree1' | 'tree2' | 'tree3' | 'rock' | 'mountain' | 'hill' | 'podium'>('node');
  const [editorCornerHeight, setEditorCornerHeight] = useState<number>(2);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null);
  const [selectedSceneryIndex, setSelectedSceneryIndex] = useState<number | null>(null);
  const [editorTrackName, setEditorTrackName] = useState<string>('Custom Gridway');
  const [editorRoadWidth, setEditorRoadWidth] = useState<number>(18);
  const [editorTimeLimit, setEditorTimeLimit] = useState<number>(45);
  const [editorHasObstacles, setEditorHasObstacles] = useState<boolean>(false);
  const [editorHaveGrass, setEditorHaveGrass] = useState<boolean>(true);
  const [editorGrassWidth, setEditorGrassWidth] = useState<number>(6);
  const [snapToGrid, setSnapToGrid] = useState<number>(10);
  const [draggedNodeIndex, setDraggedNodeIndex] = useState<number | null>(null);
  const [draggedSceneryIndex, setDraggedSceneryIndex] = useState<number | null>(null);
  const [editorGridLimit, setEditorGridLimit] = useState<number>(250);

  // Load persistent user data from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCredits = localStorage.getItem('cyberdrive_credits');
      const savedCars = localStorage.getItem('cyberdrive_cars');
      const savedColor = localStorage.getItem('cyberdrive_color');
      const savedActiveCar = localStorage.getItem('cyberdrive_active_car');
      const loadedLicenseProgress = loadLicenseProgress();

      if (savedCredits) setPlayerCredits(parseInt(savedCredits));
      setLicenseProgress(loadedLicenseProgress);
      setHasLicense(hasAnyLicense(loadedLicenseProgress));
      if (savedCars) setPurchasedCars(JSON.parse(savedCars));
      if (savedColor) setSelectedColor(savedColor);
      if (savedActiveCar) setActiveCarId(savedActiveCar);

      const savedUpgrades = localStorage.getItem('cyberdrive_upgrades');
      if (savedUpgrades) {
        try {
          setCarUpgrades(JSON.parse(savedUpgrades));
        } catch (e) { }
      }

      setHudConfig(loadHUDConfig());
      setShowMirrorInTPS(loadMirrorInTPS());
      setSoundEnabled(loadSoundEnabled());
      setKeyBindings(loadKeyBindings());

      const savedTrack = localStorage.getItem('cyberdrive_custom_track');
      if (savedTrack) {
        try {
          const parsed = JSON.parse(savedTrack);
          if (parsed.nodes) setEditorNodes(parsed.nodes);
          if (parsed.gridLimit) {
            setEditorGridLimit(parsed.gridLimit);
          } else if (parsed.nodes) {
            let maxVal = 250;
            parsed.nodes.forEach((n: any) => {
              const absX = Math.abs(n.x);
              const absZ = Math.abs(n.z);
              if (absX > maxVal) maxVal = absX;
              if (absZ > maxVal) maxVal = absZ;
            });
            if (maxVal > 500) setEditorGridLimit(1000);
            else if (maxVal > 250) setEditorGridLimit(500);
            else setEditorGridLimit(250);
          }
          if (parsed.name) setEditorTrackName(parsed.name);
          if (parsed.roadWidth) setEditorRoadWidth(parsed.roadWidth);
          if (parsed.timeLimit) setEditorTimeLimit(parsed.timeLimit);
          if (parsed.hasObstacles !== undefined) setEditorHasObstacles(parsed.hasObstacles);
          if (parsed.HaveGrass !== undefined) setEditorHaveGrass(parsed.HaveGrass);
          if (parsed.GrassWidth !== undefined) setEditorGrassWidth(parsed.GrassWidth);
          if (parsed.scenery) setEditorScenery(parsed.scenery);
        } catch (e) {
          console.error("Error loading custom track", e);
        }
      } else {
        // Load default oval preset
        setEditorNodes([
          { x: 0, z: -80 },
          { x: 100, z: -80 },
          { x: 150, z: 0 },
          { x: 100, z: 80 },
          { x: -100, z: 80 },
          { x: -150, z: 0 },
          { x: -100, z: -80 }
        ]);
      }
    }
  }, []);

  // Save options whenever they change
  useEffect(() => {
    saveHUDConfig(hudConfig);
  }, [hudConfig]);

  useEffect(() => {
    saveMirrorInTPS(showMirrorInTPS);
  }, [showMirrorInTPS]);

  useEffect(() => {
    saveSoundEnabled(soundEnabled);
  }, [soundEnabled]);

  // Trigger shift animation on placement changes
  useEffect(() => {
    if (placement !== prevPlacement) {
      if (placement < prevPlacement) {
        setPlacementShift('up');
      } else {
        setPlacementShift('down');
      }
      setPrevPlacement(placement);

      const timer = setTimeout(() => {
        setPlacementShift(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [placement, prevPlacement]);

  // Sync activeGarageTab state to the Three.js game engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.activeGarageTab = activeGarageTab;
    }
  }, [activeGarageTab]);

  // Initialize Game Engine
  useEffect(() => {
    if (!canvasRef.current) return;

    // Callbacks to sync logic from Three.js render loop to React UI state
    const callbacks = {
      onSpeedChange: (s: number) => {
        const displayS = hudConfig.speedUnit === 'mph' ? Math.round(s * 0.621371) : s;
        setSpeed(displayS);
        if (engineRef.current && engineRef.current.activeMode === 'tutorial') {
          const status = engineRef.current.getTutorialStatus();
          setTutorialStep((prevStep) => {
            if (prevStep === 0 && displayS > 15) return 1;
            if (prevStep === 1 && status.turnKeyPressed) return 2;
            if (prevStep === 2 && status.isDrifting) return 3;
            if (prevStep === 3 && !status.isGrounded && status.carPosY > 1.5) return 4;
            if (prevStep === 4 && status.crystalCollected) {
              engineRef.current?.handleSuccess();
              return 5;
            }
            return prevStep;
          });
        }
      },
      onVehicleStatsChange: (
        s: number,
        r: number,
        g: number,
        shifting: boolean,
        throttle?: number,
        brake?: number,
        fuel?: number,
        fuelCapacity?: number,
        fuelRate?: number,
        stalled?: boolean,
        tireWear?: number,
        tireTemp?: number,
        tireComp?: string,
        wearEnabled?: boolean
      ) => {
        const displayS = hudConfig.speedUnit === 'mph' ? Math.round(s * 0.621371) : s;
        setSpeed(displayS);
        setRpm(r);
        setGear(g);
        setIsShifting(shifting);
        if (throttle !== undefined) setThrottleInput(throttle);
        if (brake !== undefined) setBrakeInput(brake);
        if (fuel !== undefined) setFuelLiters(fuel);
        if (fuelCapacity !== undefined) setFuelCapacityLiters(fuelCapacity);
        if (fuelRate !== undefined) setFuelConsumptionLitersPerHour(fuelRate);
        if (stalled !== undefined) setIsEngineStalled(stalled);
        if (tireWear !== undefined) setTireWear(tireWear);
        if (tireTemp !== undefined) setTireTemperature(tireTemp);
        if (tireComp !== undefined) setTireCompound(tireComp);
        if (wearEnabled !== undefined) setTireWearEnabled(wearEnabled);
        if (engineRef.current) {
          setCameraViewMode(engineRef.current.cameraViewMode);
        }
      },
      onDriftScoreChange: (score: number, mult: number) => {
        setDriftScore(score);
        setDriftMultiplier(mult);
      },
      onCreditsChange: (credits: number) => {
        setPlayerCredits(credits);
        localStorage.setItem('cyberdrive_credits', credits.toString());
      },
      onTimerChange: (secs: number) => setTimeRemaining(secs),
      onRaceTimeUpdate: (totalTime: number, bestLap: number, currentLap: number) => {
        setTotalRaceTime(totalTime);
        setBestLapTime(bestLap);
        setCurrentLapTime(currentLap);
      },
      onCheckpointChange: (current: number, total: number) => {
        setCheckpointIndex(current);
        setTotalCheckpoints(total);
      },
      onPlacementChange: (place: number, total: number) => {
        setPlacement(place);
        setTotalParticipants(total);
      },
      onGameStatus: (status: typeof gameStatus, message?: string, results?: any[]) => {
        setGameStatus(status);
        if (message) setStatusMessage(message);
        if (results) {
          setRaceResults(results);
        } else {
          setRaceResults(null);
        }

        // Trigger celebratory confetti on special events
        if (status === 'success') {
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 }
          });

          // Sync license state from engine to React UI
          if (engineRef.current) {
            setHasLicense(engineRef.current.hasLicense);
            setLicenseProgress(engineRef.current.licenseProgress);
          }
        }
      },
      onLicenseProgressChange: (progress: LicenseProgress, unlocked: boolean) => {
        setLicenseProgress(progress);
        setHasLicense(unlocked);
      },
      onDriftCompleted: (points: number) => {
        setRecentDriftGain(points);
        setTimeout(() => setRecentDriftGain(0), 2000);
      }
    };

    const engine = new GameEngine(canvasRef.current, callbacks);
    engineRef.current = engine;

    // Sync initial states to engine from localStorage to avoid React state timing race conditions
    let initialCredits = playerCredits;
    let initialLicense = hasLicense;
    let initialLicenseProgress = licenseProgress;
    let initialCarId = activeCarId;
    let initialColor = selectedColor;
    let initialUpgrades = DEFAULT_UPGRADES;

    if (typeof window !== 'undefined') {
      const savedCredits = localStorage.getItem('cyberdrive_credits');
      if (savedCredits) {
        initialCredits = parseInt(savedCredits, 10);
        setPlayerCredits(initialCredits);
      }
      initialLicenseProgress = loadLicenseProgress();
      initialLicense = hasAnyLicense(initialLicenseProgress);
      setLicenseProgress(initialLicenseProgress);
      setHasLicense(initialLicense);
      const savedActiveCar = localStorage.getItem('cyberdrive_active_car');
      if (savedActiveCar) {
        initialCarId = savedActiveCar;
        setActiveCarId(initialCarId);
      }
      const savedColor = localStorage.getItem('cyberdrive_color');
      if (savedColor) {
        initialColor = savedColor;
        setSelectedColor(initialColor);
      }
      const savedUpgrades = localStorage.getItem('cyberdrive_upgrades');
      if (savedUpgrades) {
        try {
          const parsed = JSON.parse(savedUpgrades);
          setCarUpgrades(parsed);
          if (parsed[initialCarId]) {
            initialUpgrades = parsed[initialCarId];
          }
        } catch (e) { }
      }
    }

    engine.playerCredits = initialCredits;
    engine.hasLicense = initialLicense;
    engine.licenseProgress = initialLicenseProgress;
    engine.keyBindings = loadKeyBindings();
    engine.setActiveCar(initialCarId, initialColor, initialUpgrades);

    return () => {
      engine.destroy();
    };
  }, []);

  // Helpers to get specific car upgrades safely
  const getCarUpgrades = (carId: string) => {
    return carUpgrades[carId] || JSON.parse(JSON.stringify(DEFAULT_UPGRADES));
  };

  // Sync state modifications to Engine
  const changeCarColor = (hex: string) => {
    setSelectedColor(hex);
    localStorage.setItem('cyberdrive_color', hex);
    if (engineRef.current) {
      const activeUpgrades = getCarUpgrades(activeCarId);
      engineRef.current.setActiveCar(activeCarId, hex, activeUpgrades);
    }
  };

  const selectCar = (carId: string) => {
    setActiveCarId(carId);
    localStorage.setItem('cyberdrive_active_car', carId);

    // Auto color matches database if first select, otherwise keeps active color
    const carDb = CARS_DATABASE.find(c => c.id === carId);
    const colorToUse = carDb ? carDb.color : selectedColor;
    setSelectedColor(colorToUse);

    if (engineRef.current) {
      const activeUpgrades = getCarUpgrades(carId);
      engineRef.current.setActiveCar(carId, colorToUse, activeUpgrades);
    }
  };

  const buyCar = (car: CarConfig) => {
    if (playerCredits >= car.price) {
      const updatedCredits = playerCredits - car.price;
      const updatedCars = [...purchasedCars, car.id];

      setPlayerCredits(updatedCredits);
      setPurchasedCars(updatedCars);

      localStorage.setItem('cyberdrive_credits', updatedCredits.toString());
      localStorage.setItem('cyberdrive_cars', JSON.stringify(updatedCars));

      if (engineRef.current) {
        engineRef.current.playerCredits = updatedCredits;
      }

      selectCar(car.id);

      confetti({
        particleCount: 100,
        spread: 80,
        colors: ['#00ffff', '#ff00ff', '#facc15']
      });
    }
  };

  const getPurchasedLevel = (carUpgradesForCar: any, item: any) => {
    const currentCarUpgrades = carUpgradesForCar || DEFAULT_UPGRADES;
    if (!currentCarUpgrades.purchasedLevels) {
      let equippedVal: any = currentCarUpgrades;
      for (let i = 0; i < item.path.length; i++) {
        if (equippedVal !== undefined && equippedVal !== null) {
          equippedVal = equippedVal[item.path[i]];
        }
      }
      return equippedVal || 0;
    }
    return currentCarUpgrades.purchasedLevels[item.id] || 0;
  };

  const equipLevelUpgrade = (item: any, targetLevel: number) => {
    const currentCarUpgrades = JSON.parse(JSON.stringify(getCarUpgrades(activeCarId)));

    if (!currentCarUpgrades.purchasedLevels) {
      currentCarUpgrades.purchasedLevels = {};
      UPGRADES_CONFIG.forEach(group => {
        group.items.forEach(it => {
          if (it.type === 'level') {
            let val: any = currentCarUpgrades;
            for (let i = 0; i < it.path.length; i++) {
              if (val !== undefined && val !== null) {
                val = val[it.path[i]];
              }
            }
            currentCarUpgrades.purchasedLevels[it.id] = val || 0;
          }
        });
      });
    }

    const path = item.path;
    let target = currentCarUpgrades;
    for (let i = 0; i < path.length - 1; i++) {
      target = target[path[i]];
    }
    const lastKey = path[path.length - 1];

    target[lastKey] = targetLevel;

    if (item.id === 'tireLevel') {
      const compounds = [
        'economy',
        'sport_hard',
        'sport_medium',
        'sport_soft',
        'super_hard',
        'hard',
        'normal',
        'soft',
        'super_soft'
      ];
      currentCarUpgrades.tireCompound = compounds[targetLevel] || 'economy';
    }

    const newUpgrades = {
      ...carUpgrades,
      [activeCarId]: currentCarUpgrades
    };
    setCarUpgrades(newUpgrades);
    localStorage.setItem('cyberdrive_upgrades', JSON.stringify(newUpgrades));

    if (engineRef.current) {
      engineRef.current.setActiveCar(activeCarId, selectedColor, currentCarUpgrades);
    }
  };

  const buyUpgrade = (item: any, cost: number) => {
    if (playerCredits < cost) {
      alert("Insufficient Credits!");
      return;
    }

    const currentCarUpgrades = JSON.parse(JSON.stringify(getCarUpgrades(activeCarId)));

    // Set the value based on path
    const path = item.path;
    let target = currentCarUpgrades;
    for (let i = 0; i < path.length - 1; i++) {
      target = target[path[i]];
    }
    const lastKey = path[path.length - 1];

    if (item.type === 'level') {
      if (!currentCarUpgrades.purchasedLevels) {
        currentCarUpgrades.purchasedLevels = {};
        UPGRADES_CONFIG.forEach(group => {
          group.items.forEach(it => {
            if (it.type === 'level') {
              let val: any = currentCarUpgrades;
              for (let i = 0; i < it.path.length; i++) {
                if (val !== undefined && val !== null) {
                  val = val[it.path[i]];
                }
              }
              currentCarUpgrades.purchasedLevels[it.id] = val || 0;
            }
          });
        });
      }

      const nextLvl = (currentCarUpgrades.purchasedLevels[item.id] || 0) + 1;
      currentCarUpgrades.purchasedLevels[item.id] = nextLvl;
      target[lastKey] = nextLvl;

      if (item.id === 'tireLevel') {
        const compounds = [
          'economy',
          'sport_hard',
          'sport_medium',
          'sport_soft',
          'super_hard',
          'hard',
          'normal',
          'soft',
          'super_soft'
        ];
        currentCarUpgrades.tireCompound = compounds[nextLvl] || 'economy';
      }
    } else {
      // Toggle type - Mark as purchased in purchasedToggles
      if (!currentCarUpgrades.purchasedToggles) {
        currentCarUpgrades.purchasedToggles = { hasABS: false, hasESC: false, turbo: false };
      }

      if (lastKey === 'hasABS') {
        currentCarUpgrades.purchasedToggles.hasABS = true;
        currentCarUpgrades.brake.hasABS = true;
      } else if (lastKey === 'hasESC') {
        currentCarUpgrades.purchasedToggles.hasESC = true;
        currentCarUpgrades.brake.hasESC = true;
      } else if (lastKey === 'aspiration') {
        currentCarUpgrades.purchasedToggles.turbo = true;
        currentCarUpgrades.aspiration = 'turbo';
      }
    }

    const newCredits = playerCredits - cost;
    const newUpgrades = {
      ...carUpgrades,
      [activeCarId]: currentCarUpgrades
    };

    setPlayerCredits(newCredits);
    setCarUpgrades(newUpgrades);

    localStorage.setItem('cyberdrive_credits', newCredits.toString());
    localStorage.setItem('cyberdrive_upgrades', JSON.stringify(newUpgrades));

    if (engineRef.current) {
      engineRef.current.playerCredits = newCredits;
      engineRef.current.setActiveCar(activeCarId, selectedColor, currentCarUpgrades);
    }

    confetti({
      particleCount: 50,
      spread: 50,
      colors: ['#ff00ff', '#00ffff']
    });
  };

  const toggleUpgrade = (item: any) => {
    const currentCarUpgrades = JSON.parse(JSON.stringify(getCarUpgrades(activeCarId)));
    const path = item.path;
    let target = currentCarUpgrades;
    for (let i = 0; i < path.length - 1; i++) {
      target = target[path[i]];
    }
    const lastKey = path[path.length - 1];

    if (lastKey === 'aspiration') {
      target[lastKey] = target[lastKey] === 'turbo' ? 'natural' : 'turbo';
    } else {
      target[lastKey] = !target[lastKey];
    }

    const newUpgrades = {
      ...carUpgrades,
      [activeCarId]: currentCarUpgrades
    };
    setCarUpgrades(newUpgrades);
    localStorage.setItem('cyberdrive_upgrades', JSON.stringify(newUpgrades));

    if (engineRef.current) {
      engineRef.current.setActiveCar(activeCarId, selectedColor, currentCarUpgrades);
    }
  };

  // Launch different modes in engine
  const startFreeRoam = () => {
    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);

    setTimeout(() => {
      if (engineRef.current) {
        engineRef.current.isPaused = false;
        setIsPaused(false);
        engineRef.current.buildOpenWorld();
        setActiveMode('free_roam');
      }
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
    }, 1050);
  };

  const startTutorial = () => {
    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);

    setTimeout(() => {
      if (engineRef.current) {
        engineRef.current.isPaused = false;
        setIsPaused(false);
        engineRef.current.buildTutorial();
        setActiveMode('tutorial');
        setTutorialStep(0);
      }
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
    }, 1050);
  };

  const startLicenseTest = (testId: string = activeLicenseTestId) => {
    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);

    setTimeout(() => {
      if (engineRef.current) {
        engineRef.current.isPaused = false;
        setIsPaused(false);
        engineRef.current.buildLicenseTest(testId);
        setActiveLicenseTestId(engineRef.current.activeLicenseTestId);
        setActiveMode('license');
      }
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
    }, 1050);
  };

  const startRace = (trackId: string = 'sprint_circuit') => {
    const track = TRACKS_DATABASE.find(t => t.id === trackId);
    if (!track) return;
    if (track.requiresLicense && !hasLicense) return; // Prevent unauthorized entry

    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);

    setTimeout(() => {
      setActiveTrackId(trackId);
      setPlacement(1);
      setPrevPlacement(1);
      setPlacementShift(null);
      setRaceResults(null);
      if (engineRef.current) {
        engineRef.current.isPaused = false;
        setIsPaused(false);
        engineRef.current.buildRaceTrack(trackId);
        setActiveMode('race');
      }
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
    }, 1050);
  };

  const startQuickPlayRace = (carId: string, trackId: string) => {
    const track = TRACKS_DATABASE.find(t => t.id === trackId);
    if (!track) return;

    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);

    setTimeout(() => {
      quickPlayOriginalCarRef.current = activeCarId;

      setActiveTrackId(trackId);
      setPlacement(1);
      setPrevPlacement(1);
      setPlacementShift(null);
      setRaceResults(null);
      if (engineRef.current) {
        engineRef.current.isPaused = false;
        setIsPaused(false);
        
        const carDb = CARS_DATABASE.find(c => c.id === carId);
        const colorToUse = carDb ? carDb.color : selectedColor;

        engineRef.current.setActiveCar(carId, colorToUse, DEFAULT_UPGRADES);
        engineRef.current.buildRaceTrack(trackId);
        setActiveMode('race');
      }
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
    }, 1050);
  };

  const exitToGarage = () => {
    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);

    setTimeout(() => {
      if (engineRef.current) {
        engineRef.current.isPaused = false;
        setIsPaused(false);
        engineRef.current.buildGarage();
        setActiveMode('garage');
        setGameStatus('idle');
        setStatusMessage('');
        setSpeed(0);
        setDriftScore(0);
        setPlacement(1);
        setPrevPlacement(placement);
        setPlacementShift(null);
        setRaceResults(null);

        if (quickPlayOriginalCarRef.current) {
          const originalCarId = quickPlayOriginalCarRef.current;
          quickPlayOriginalCarRef.current = null;
          const activeUpgrades = getCarUpgrades(originalCarId);
          engineRef.current.setActiveCar(originalCarId, selectedColor, activeUpgrades);
        }
      }
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
    }, 1050);
  };

  const handleDriveClick = () => {
    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);

    setTimeout(() => {
      setActiveGarageTab('drive');
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
    }, 1050);
  };

  const handleBackToGarageClick = () => {
    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);

    setTimeout(() => {
      setActiveGarageTab(null);
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
    }, 1050);
  };

  const handleTuningClick = () => {
    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);

    setTimeout(() => {
      setActiveGarageTab('tuning');
      setTuningState('entering');
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
      setTuningState('open');
    }, 1550);
  };

  const handleExitTuningClick = () => {
    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);
    setTuningState('exiting');

    setTimeout(() => {
      setActiveGarageTab(null);
      setTuningState('closed');
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
    }, 1050);
  };

  const handleDealerClick = () => {
    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);

    setTimeout(() => {
      setActiveGarageTab('dealer');
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
    }, 1050);
  };

  const handleExitDealerClick = () => {
    setIsTransitioningDrive(true);
    setIsBlackOverlay(true);

    setTimeout(() => {
      setActiveGarageTab(null);
    }, 700);

    setTimeout(() => {
      setIsBlackOverlay(false);
    }, 850);

    setTimeout(() => {
      setIsTransitioningDrive(false);
    }, 1050);
  };

  const handleSettingClick = () => {
    setActiveGarageTab('setting');
    setSettingsSubTab('graphics');
    setSettingsTransitionComplete(false);
    setSettingsState('entering');
    setSettingsVisible(true);
    setIsBlackOverlay(false);

    setTimeout(() => {
      setSettingsTransitionComplete(true);
      setSettingsState('open');
    }, 700);
  };

  const handleSettingBackClick = () => {
    if (settingsSubTab !== 'graphics') {
      setIsBlackOverlay(true);

      setTimeout(() => {
        setSettingsState('closed');
        setSettingsVisible(false);
        setSettingsTransitionComplete(false);
        setActiveGarageTab(null);
      }, 700);

      setTimeout(() => {
        setIsBlackOverlay(false);
      }, 850);
    } else {
      setSettingsState('exiting_ui');
      setSettingsVisible(false);
      setSettingsTransitionComplete(false);

      // 1. Settings UI animates out first. We wait 400ms for settings card to fade out.
      setTimeout(() => {
        setSettingsState('expanding_canvas');
      }, 400);

      // 2. Canvas expands (takes 700ms). So we wait 400ms + 700ms = 1100ms.
      setTimeout(() => {
        setSettingsState('closed');
        setActiveGarageTab(null);
      }, 1100);
    }
  };

  const handleSettingsSubTabChange = (tab: 'audio' | 'graphics' | 'control' | 'layout') => {
    setNoTransition(true);
    setSettingsSubTab(tab);
    setTimeout(() => {
      setNoTransition(false);
    }, 50);
  };

  const handleSettingClickNoFade = () => {
    setActiveGarageTab('setting');
    setSettingsSubTab('graphics');
    setSettingsTransitionComplete(false);
    setSettingsState('entering');
    setSettingsVisible(true);

    setTimeout(() => {
      setSettingsTransitionComplete(true);
      setSettingsState('open');
    }, 700);
  };

  const handleResetTransitionNoFade = () => {
    setNoTransition(true);
    setSettingsState('closed');
    setSettingsVisible(false);
    setSettingsTransitionComplete(false);
    setActiveGarageTab(null);
    setPlaceholderRect(null);
    setTimeout(() => {
      setNoTransition(false);
    }, 50);
  };

  const handleResetTransitionClick = () => {
    // Phase 1: Fade to black overlay (covers Scene 2 / Settings)
    setIsBlackOverlay(true);

    // Phase 2: After overlay is fully dark (500ms), snap canvas back to fullscreen instantly
    setTimeout(() => {
      // Disable CSS transitions so canvas snaps instantly
      setNoTransition(true);
      // Reset all settings state
      setSettingsState('closed');
      setSettingsVisible(false);
      setSettingsTransitionComplete(false);
      setActiveGarageTab(null);
      setPlaceholderRect(null);

      // Phase 3: After a paint frame, fade out the overlay to reveal fullscreen Garage
      setTimeout(() => {
        setIsBlackOverlay(false);

        // Phase 4: Re-enable CSS transitions after overlay fade-out completes
        setTimeout(() => {
          setNoTransition(false);
        }, 550);
      }, 50);
    }, 500);
  };

  const resetCar = () => {
    if (engineRef.current) {
      engineRef.current.isPaused = false;
      setIsPaused(false);
      engineRef.current.resetCar();
    }
  };

  const cheatCredits = () => {
    const updatedCredits = playerCredits + 1000;
    setPlayerCredits(updatedCredits);
    localStorage.setItem('cyberdrive_credits', updatedCredits.toString());
    if (engineRef.current) {
      engineRef.current.playerCredits = updatedCredits;
    }
    confetti({ particleCount: 20 });
  };

  const saveCustomTrack = (
    nodes: { x: number; z: number; y?: number; width?: number; banking?: number }[],
    name: string,
    width: number,
    time: number,
    obstacles: boolean,
    gridLimit: number,
    grass: boolean = editorHaveGrass,
    grassWidth: number = editorGrassWidth,
    scenery: { type: 'tree' | 'tree1' | 'tree2' | 'tree3' | 'rock' | 'mountain' | 'hill' | 'podium' | 'tree'; x: number; z: number; scale: number; heightScale?: number; rotation?: number }[] = editorScenery
  ) => {
    if (typeof window !== 'undefined') {
      const trackData = {
        name,
        roadWidth: width,
        timeLimit: time,
        hasObstacles: obstacles,
        nodes,
        gridLimit,
        HaveGrass: grass,
        GrassWidth: grassWidth,
        scenery
      };
      localStorage.setItem('cyberdrive_custom_track', JSON.stringify(trackData));
    }
  };

  const importTrack = (text: string) => {
    try {
      const vectorRegex = /(?:THREE\.)?Vector3\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/gi;
      const nodes: { x: number; z: number; y?: number; width?: number; banking?: number }[] = [];
      let match;
      while ((match = vectorRegex.exec(text)) !== null) {
        nodes.push({
          x: parseFloat(match[1]),
          y: parseFloat(match[2]),
          z: parseFloat(match[3])
        });
      }

      const detectLimit = (nodesList: { x: number; z: number }[]) => {
        let maxVal = 250;
        nodesList.forEach(n => {
          const absX = Math.abs(n.x);
          const absZ = Math.abs(n.z);
          if (absX > maxVal) maxVal = absX;
          if (absZ > maxVal) maxVal = absZ;
        });
        if (maxVal > 2000) return 3000;
        if (maxVal > 1000) return 2000;
        if (maxVal > 500) return 1000;
        if (maxVal > 250) return 500;
        return 250;
      };

      if (nodes.length >= 3) {
        const gridL = detectLimit(nodes);
        setEditorGridLimit(gridL);
        setEditorNodes(nodes);
        saveCustomTrack(nodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, gridL);
        alert(`Successfully imported ${nodes.length} track nodes!`);
      } else {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            const jsonNodes = parsed.map(n => {
              if (Array.isArray(n)) {
                return {
                  x: Number(n[0]),
                  y: n.length >= 3 ? Number(n[1]) : 2,
                  z: n.length >= 3 ? Number(n[2]) : Number(n[1])
                };
              } else {
                return {
                  x: Number(n.x),
                  y: n.y !== undefined ? Number(n.y) : 2,
                  z: Number(n.z)
                };
              }
            });
            if (jsonNodes.length >= 3 && !jsonNodes.some(n => isNaN(n.x) || isNaN(n.z))) {
              const gridL = detectLimit(jsonNodes);
              setEditorGridLimit(gridL);
              setEditorNodes(jsonNodes);
              saveCustomTrack(jsonNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, gridL);
              alert(`Successfully imported ${jsonNodes.length} nodes from JSON!`);
              return;
            }
          }
        } catch (jsonErr) { }
        alert("Could not parse any valid coordinates. Make sure the text contains Vector3(x, y, z) lines or a JSON array.");
      }
    } catch (e) {
      alert("Error importing track. Check format.");
    }
  };

  const syncCustomTrackToDatabase = (
    nodes = editorNodes,
    name = editorTrackName,
    width = editorRoadWidth,
    time = editorTimeLimit,
    obstacles = editorHasObstacles,
    grass = editorHaveGrass,
    grassW = editorGrassWidth,
    scenery = editorScenery
  ) => {
    const customTrack: TrackConfig = {
      id: 'custom',
      name: name || 'Custom Gridway',
      description: 'Your custom designed track.',
      timeLimit: time,
      roadWidth: width,
      hasObstacles: obstacles,
      requiresLicense: false,
      baseReward: 300,
      path: nodes.map(n => ({ pos: new THREE.Vector3(n.x, n.y ?? 2, n.z), width: n.width ?? width, banking: n.banking ?? 0 })),
      scenery: scenery.map(s => ({
        type: s.type,
        position: new THREE.Vector3(s.x, 0, s.z),
        scale: s.scale,
        heightScale: s.heightScale,
        rotation: s.rotation
      })),
      HaveCrub: true,
      HaveFence: true,
      HaveGrass: grass,
      GrassWidth: grassW
    };

    const existingIdx = TRACKS_DATABASE.findIndex(t => t.id === 'custom');
    if (existingIdx !== -1) {
      TRACKS_DATABASE[existingIdx] = customTrack;
    } else {
      TRACKS_DATABASE.push(customTrack);
    }
  };

  const launchTestDrive = () => {
    if (editorNodes.length < 3) return;
    syncCustomTrackToDatabase();
    startRace('custom');
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear all nodes and scenery?")) {
      setEditorNodes([]);
      setEditorScenery([]);
      saveCustomTrack([], editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, editorHaveGrass, editorGrassWidth, []);
    }
  };

  const handleApplyTemplate = (type: 'oval' | 'scurve' | 'figure8') => {
    let nodes: { x: number; z: number }[] = [];
    const scaleFactor = editorGridLimit / 250;
    if (type === 'oval') {
      nodes = [
        { x: 0 * scaleFactor, z: -80 * scaleFactor },
        { x: 100 * scaleFactor, z: -80 * scaleFactor },
        { x: 150 * scaleFactor, z: 0 * scaleFactor },
        { x: 100 * scaleFactor, z: 80 * scaleFactor },
        { x: -100 * scaleFactor, z: 80 * scaleFactor },
        { x: -150 * scaleFactor, z: 0 * scaleFactor },
        { x: -100 * scaleFactor, z: -80 * scaleFactor }
      ];
    } else if (type === 'scurve') {
      nodes = [
        { x: 0 * scaleFactor, z: -100 * scaleFactor },
        { x: 80 * scaleFactor, z: -100 * scaleFactor },
        { x: 120 * scaleFactor, z: -50 * scaleFactor },
        { x: 60 * scaleFactor, z: 0 * scaleFactor },
        { x: 120 * scaleFactor, z: 50 * scaleFactor },
        { x: 80 * scaleFactor, z: 100 * scaleFactor },
        { x: -80 * scaleFactor, z: 100 * scaleFactor },
        { x: -120 * scaleFactor, z: 50 * scaleFactor },
        { x: -60 * scaleFactor, z: 0 * scaleFactor },
        { x: -120 * scaleFactor, z: -50 * scaleFactor },
        { x: -80 * scaleFactor, z: -100 * scaleFactor }
      ];
    } else if (type === 'figure8') {
      nodes = [
        { x: 0 * scaleFactor, z: 0 * scaleFactor },
        { x: 60 * scaleFactor, z: 60 * scaleFactor },
        { x: 120 * scaleFactor, z: 0 * scaleFactor },
        { x: 60 * scaleFactor, z: -60 * scaleFactor },
        { x: 0 * scaleFactor, z: 0 * scaleFactor },
        { x: -60 * scaleFactor, z: 60 * scaleFactor },
        { x: -120 * scaleFactor, z: 0 * scaleFactor },
        { x: -60 * scaleFactor, z: -60 * scaleFactor }
      ];
    }
    setEditorNodes(nodes);
    saveCustomTrack(nodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit);
  };

  const getDefaultScale = (tool: string) => {
    if (tool.startsWith('tree')) return 2;
    if (tool === 'hill') return 8;
    if (tool === 'mountain') return 1.0;
    if (tool === 'podium') return 1.0;
    if (tool === 'rock') return 2;
    return 1;
  };



  useEffect(() => {
    if (activeMode === 'editor') {
      const txtarea = document.getElementById('import-export-textarea') as HTMLTextAreaElement;
      if (txtarea) {
        txtarea.value = editorNodes.map(n => `new THREE.Vector3(${Math.round(n.x)}, ${n.y !== undefined ? Math.round(n.y) : 2}, ${Math.round(n.z)})`).join(',\n');
      }
    }
  }, [editorNodes, activeMode]);

  // Rebuild 3D preview in real-time when track data changes, skipping when dragging for performance
  useEffect(() => {
    if (activeMode === 'editor' && livePreview && engineRef.current && draggedNodeIndex === null && draggedSceneryIndex === null) {
      syncCustomTrackToDatabase();
      engineRef.current.buildPreviewTrack('custom');
    }
  }, [editorNodes, editorScenery, livePreview, activeMode, draggedNodeIndex, draggedSceneryIndex, editorRoadWidth, editorHaveGrass, editorGrassWidth, editorHasObstacles]);

  // Escape key handler to toggle pause overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Can only pause during active play or countdown in gameplay modes
        if (
          activeMode !== 'garage' &&
          (gameStatus === 'playing' || gameStatus === 'countdown')
        ) {
          e.preventDefault();
          setIsPaused(prev => {
            const nextPaused = !prev;
            if (engineRef.current) {
              engineRef.current.isPaused = nextPaused;
            }
            return nextPaused;
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMode, gameStatus]);

  // Bind engine editorState callbacks to React state setters
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.editorState.onUpdateNodes = (nodes) => {
        setEditorNodes(nodes);
      };
      engineRef.current.editorState.onUpdateScenery = (scenery) => {
        setEditorScenery(scenery);
      };
      engineRef.current.editorState.onSelectNode = (idx) => {
        setSelectedNodeIndex(idx);
        setSelectedSceneryIndex(null);
      };
      engineRef.current.editorState.onSelectScenery = (idx) => {
        setSelectedSceneryIndex(idx);
        setSelectedNodeIndex(null);
      };
      engineRef.current.editorState.onDragNodeStart = (idx) => {
        setDraggedNodeIndex(idx);
      };
      engineRef.current.editorState.onDragNodeEnd = () => {
        setDraggedNodeIndex(null);
      };
      engineRef.current.editorState.onDragSceneryStart = (idx) => {
        setDraggedSceneryIndex(idx);
      };
      engineRef.current.editorState.onDragSceneryEnd = () => {
        setDraggedSceneryIndex(null);
      };
    }
  }, [activeMode]);

  // Sync React states to engine.editorState
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.editorState.nodes = editorNodes;
      engineRef.current.editorState.scenery = editorScenery;
      engineRef.current.editorState.tool = editorTool;
      engineRef.current.editorState.snapToGrid = snapToGrid;
      engineRef.current.editorState.cornerHeight = editorCornerHeight;
      engineRef.current.editorState.selectedNodeIndex = selectedNodeIndex;
      engineRef.current.editorState.selectedSceneryIndex = selectedSceneryIndex;
      engineRef.current.editorState.roadWidth = editorRoadWidth;
      engineRef.current.editorState.activeMode = activeMode;
    }
  }, [editorNodes, editorScenery, editorTool, snapToGrid, editorCornerHeight, selectedNodeIndex, selectedSceneryIndex, editorRoadWidth, activeMode]);

  // Automatically start 3D preview mode when entering editor
  useEffect(() => {
    if (activeMode === 'editor' && engineRef.current) {
      setLivePreview(true);
      syncCustomTrackToDatabase();
      engineRef.current.buildPreviewTrack('custom');
    } else if (activeMode !== 'editor' && livePreview) {
      setLivePreview(false);
    }
  }, [activeMode]);

  // Helper to dynamically darken a hex color for dot outliners
  const darkenColor = (hex: string, amount = 0.45) => {
    let color = hex.replace('#', '');
    if (color.length === 3) {
      color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
    }
    const num = parseInt(color, 16);
    if (isNaN(num)) return '#000000';
    let r = (num >> 16);
    let g = ((num >> 8) & 0x00ff);
    let b = (num & 0x0000ff);

    r = Math.max(0, Math.floor(r * (1 - amount)));
    g = Math.max(0, Math.floor(g * (1 - amount)));
    b = Math.max(0, Math.floor(b * (1 - amount)));

    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  };

  // Canvas minimap rendering loop
  useEffect(() => {
    let animFrameId: number;

    const drawMinimap = () => {
      animFrameId = requestAnimationFrame(drawMinimap);

      const canvas = minimapCanvasRef.current;
      if (!canvas || !engineRef.current || activeMode === 'garage' || gameStatus === 'idle') return;

      const engine = engineRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const activeTrack = TRACKS_DATABASE.find(t => t.id === activeTrackId);
      if (!activeTrack) return;

      const path = activeTrack.path;
      if (path.length === 0) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Set translucent background
      ctx.fillStyle = 'rgba(9, 13, 22, 0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const getPos = (pt: THREE.Vector3 | TrackNode) => 'isVector3' in pt ? pt : pt.pos;
      const pathPositions = path.map((pt) => getPos(pt));
      const minimapCurve =
        pathPositions.length > 2
          ? new THREE.CatmullRomCurve3(
              pathPositions.map((pt) => new THREE.Vector3(pt.x, 0, pt.z)),
              true,
              activeTrack.curveType || 'centripetal',
              activeTrack.tension || 0.5
            )
          : null;
      const minimapPoints = minimapCurve
        ? minimapCurve.getSpacedPoints(Math.max(96, pathPositions.length * 16))
        : pathPositions;

      // Find boundaries of the track to scale and center it
      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      minimapPoints.forEach(pos => {
        if (pos.x < minX) minX = pos.x;
        if (pos.x > maxX) maxX = pos.x;
        if (pos.z < minZ) minZ = pos.z;
        if (pos.z > maxZ) maxZ = pos.z;
      });

      // Add padding to bounds
      const padding = 15;
      const width = canvas.width - padding * 2;
      const height = canvas.height - padding * 2;

      const rangeX = maxX - minX || 1;
      const rangeZ = maxZ - minZ || 1;

      const scale = Math.min(width / rangeX, height / rangeZ);

      // Center offsets
      const offsetX = padding + (width - rangeX * scale) / 2;
      const offsetZ = padding + (height - rangeZ * scale) / 2;

      const mapX = (x: number) => offsetX + (x - minX) * scale;
      const mapZ = (z: number) => offsetZ + (z - minZ) * scale;

      // Draw road line
      ctx.beginPath();
      ctx.moveTo(mapX(minimapPoints[0].x), mapZ(minimapPoints[0].z));
      for (let i = 1; i < minimapPoints.length; i++) {
        ctx.lineTo(mapX(minimapPoints[i].x), mapZ(minimapPoints[i].z));
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.55)'; // cyan road line
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Draw AI Opponents
      if (activeMode === 'race' && engine.currentModeInstance && 'aiCars' in engine.currentModeInstance) {
        const aiCars = (engine.currentModeInstance as any).aiCars as any[];
        if (aiCars) {
          aiCars.forEach(ai => {
            const aiPos = ai.vehicle.pos;
            const dotColor = ai.config.color || '#a855f7';
            ctx.fillStyle = dotColor;
            ctx.beginPath();
            ctx.arc(mapX(aiPos.x), mapZ(aiPos.z), 4, 0, Math.PI * 2);
            ctx.fill();

            // Draw a darker outliner than the dot color
            ctx.strokeStyle = darkenColor(dotColor, 0.45);
            ctx.lineWidth = 1.25;
            ctx.stroke();
          });
        }
      }

      // Draw Player Position (Blue dot)
      if (engine.vehicle) {
        const playerPos = engine.vehicle.pos;
        const playerDotColor = '#0084ff'; // Vibrant Blue
        ctx.fillStyle = playerDotColor;
        ctx.shadowColor = '#0084ff';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(mapX(playerPos.x), mapZ(playerPos.z), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw a darker outliner than the dot color
        ctx.strokeStyle = darkenColor(playerDotColor, 0.5);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    if (activeMode !== 'garage' && gameStatus !== 'idle') {
      animFrameId = requestAnimationFrame(drawMinimap);
    }

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [activeMode, gameStatus, activeTrackId]);

  const activeCar = CARS_DATABASE.find((c) => c.id === activeCarId);
  const activeCarName = activeCar ? `${activeCar.brand} ${activeCar.name}` : 'Starter Hatchback';

  // Calculate GPU transform scale factors for picture-in-picture transition
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const scaleX = placeholderRect ? placeholderRect.width / screenWidth : 1;
  const scaleY = placeholderRect ? placeholderRect.height / screenHeight : 1;

  return (
    <div
      className="relative w-screen h-screen overflow-hidden font-sans text-white select-none bg-slate-950"
      style={{
        filter: `brightness(${0.4 + (brightness / 5.0) * 0.6})`
      }}
    >
      {/* 3D Canvas Wrapper (decouples CSS transitions from WebGL canvas drawing buffer resizing) */}
      <div
        id="canvas-container"
        className={tuningState === 'entering' ? 'animate-slideInLeft' : ''}
        style={
          placeholderRect
            ? (activeGarageTab === 'tuning'
              ? {
                position: 'fixed',
                left: '0px',
                top: '0px',
                width: `${placeholderRect.width}px`,
                height: `${placeholderRect.height}px`,
                transform: `translate(${placeholderRect.left}px, ${placeholderRect.top}px)`,
                transformOrigin: 'top left',
                borderRadius: '0px',
                zIndex: 80,
                overflow: 'hidden',
                pointerEvents: 'auto',
                transition: 'none',
              }
              : {
                position: 'fixed',
                left: '0px',
                top: '0px',
                width: typeof window !== 'undefined' ? `${window.innerWidth}px` : '100vw',
                height: typeof window !== 'undefined' ? `${window.innerHeight}px` : '100vh',
                transform: `translate(${placeholderRect.left}px, ${placeholderRect.top}px) scale(${scaleX}, ${scaleY})`,
                transformOrigin: 'top left',
                borderRadius: `${16 / scaleX}px`,
                zIndex: 80,
                overflow: 'hidden',
                pointerEvents: 'auto',
                transition: noTransition
                  ? 'none'
                  : 'transform 0.7s ease-in-out, border-radius 0.7s ease-in-out',
              })
            : {
              position: 'fixed',
              left: '0px',
              top: '0px',
              width: typeof window !== 'undefined' ? `${window.innerWidth}px` : '100vw',
              height: typeof window !== 'undefined' ? `${window.innerHeight}px` : '100vh',
              transform: 'translate(0px, 0px) scale(1)',
              transformOrigin: 'top left',
              borderRadius: '0px',
              zIndex: (activeGarageTab === 'setting' && settingsSubTab === 'graphics') ? 60 : 0,
              overflow: 'hidden',
              pointerEvents: 'auto',
              transition: noTransition
                ? 'none'
                : 'transform 0.7s ease-in-out, border-radius 0.7s ease-in-out',
            }
        }
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />
      </div>

      {/* HELP MODAL OVERLAY */}
      <HelpModal showHelp={showHelp} setShowHelp={setShowHelp} />

      {/* HUD LAYOUT CUSTOMIZER OVERLAY */}
      <HUDCustomizer
        showHUDCustomizer={showHUDCustomizer}
        setShowHUDCustomizer={setShowHUDCustomizer}
        hudConfig={hudConfig}
        setHudConfig={setHudConfig}
        defaultHudConfig={DEFAULT_HUD_CONFIG}
        setShowMirrorInTPS={setShowMirrorInTPS}
      />

      {/* GAMEPLAY OVERLAYS: Countdown, Success, Failed */}
      <GameOverlays
        gameStatus={gameStatus}
        statusMessage={statusMessage}
        activeMode={activeMode}
        raceResults={raceResults}
        placement={placement}
        activeTrackId={activeTrackId}
        activeLicenseTestId={activeLicenseTestId}
        exitToGarage={exitToGarage}
        startLicenseTest={startLicenseTest}
        startRace={startRace}
        startTutorial={startTutorial}
      />

      {/* DRIVING HUD: Speedometer, Timers, Checkpoints, Drift */}
      <HUD
        activeMode={activeMode}
        gameStatus={gameStatus}
        hudConfig={hudConfig}
        timeRemaining={timeRemaining}
        currentLapTime={currentLapTime}
        checkpointIndex={checkpointIndex}
        totalCheckpoints={totalCheckpoints}
        activeTrackId={activeTrackId}
        minimapCanvasRef={minimapCanvasRef}
        placement={placement}
        totalParticipants={totalParticipants}
        placementShift={placementShift}
        totalRaceTime={totalRaceTime}
        bestLapTime={bestLapTime}
        tutorialStep={tutorialStep}
        driftScore={driftScore}
        driftMultiplier={driftMultiplier}
        recentDriftGain={recentDriftGain}
        brakeInput={brakeInput}
        throttleInput={throttleInput}
        speed={speed}
        gear={speed === 0 ? 'N' : (speed < 0 ? 'R' : gear)}
        rpm={rpm}
        isShifting={isShifting}
        fuelLiters={fuelLiters}
        fuelCapacityLiters={fuelCapacityLiters}
        fuelConsumptionLitersPerHour={fuelConsumptionLitersPerHour}
        isEngineStalled={isEngineStalled}
        cameraViewMode={cameraViewMode}
        showMirrorInTPS={showMirrorInTPS}
        engineRef={engineRef}
        tireWear={tireWear}
        tireTemperature={tireTemperature}
        tireCompound={tireCompound}
        tireWearEnabled={tireWearEnabled}
      />

      {/* PAUSE MENU OVERLAY (When Esc is pressed in gameplay) */}
      {isPaused && (
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-md z-40 flex items-center justify-center p-6 pointer-events-auto">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col gap-6 animate-scaleIn">
            {/* Header */}
            <div className="text-center">
              <span className="text-[10px] font-extrabold tracking-widest text-cyan-400 uppercase">Simulation Paused</span>
              <h2 className="text-3xl font-black italic text-white tracking-wider mt-1 uppercase">Pause Menu</h2>
            </div>

            {/* Time / Laps Stats block */}
            <div className="bg-slate-950/60 border border-slate-800/50 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center px-2">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Time</span>
                <span className="text-xl font-mono font-black text-white">
                  {formatTime(activeMode === 'race' ? totalRaceTime : timeRemaining)}
                </span>
              </div>

              {activeMode === 'race' && (
                <>
                  <div className="h-px bg-slate-800/85" />
                  <div className="flex justify-between items-center px-2">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Best Lap Time</span>
                    <span className="text-xl font-mono font-black text-cyan-400">
                      {bestLapTime === Infinity ? '--:--.__-' : formatTime(bestLapTime)}
                    </span>
                  </div>
                  <div className="h-px bg-slate-800/85" />
                  <div className="flex justify-between items-center px-2">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Current Lap</span>
                    <span className="text-sm font-mono font-bold text-white">
                      {checkpointIndex} / {totalCheckpoints}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Buttons list */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setIsPaused(false);
                  if (engineRef.current) {
                    engineRef.current.isPaused = false;
                  }
                }}
                className="w-full bg-cyan-600 hover:bg-cyan-500 border border-cyan-500 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                Resume Simulation
              </button>

              <button
                onClick={() => {
                  resetCar();
                  setIsPaused(false);
                  if (engineRef.current) {
                    engineRef.current.isPaused = false;
                  }
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-3 px-6 rounded-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Car Position (R)
              </button>

              {/* Customize HUD Layout Button */}
              <button
                onClick={() => setShowHUDCustomizer(true)}
                className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 font-bold py-3 px-6 rounded-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(34,211,238,0.1)]"
              >
                <Wrench className="w-4 h-4 text-cyan-400" />
                Customize HUD Layout
              </button>

              {/* Dedicated Settings Section */}
              <div className="bg-slate-950/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col gap-3.5 text-left select-none">
                <span className="text-[10px] font-extrabold tracking-widest text-cyan-400 uppercase leading-none block mb-1">
                  SETTINGS
                </span>

                {/* TPS Rear Mirror Toggle */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200">TPS Rear Mirror</span>
                    <span className="text-[9px] text-slate-500">Show mirror overlay in third-person view</span>
                  </div>
                  <button
                    onClick={() => setShowMirrorInTPS(!showMirrorInTPS)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${showMirrorInTPS
                      ? 'bg-cyan-950/50 border-cyan-800/80 text-cyan-400'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-350'
                      }`}
                  >
                    {showMirrorInTPS ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="h-px bg-slate-800/60" />

                {/* Sound Toggle */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200">Game Audio</span>
                    <span className="text-[9px] text-slate-500">Toggle retro synth engine sound effects</span>
                  </div>
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${soundEnabled
                      ? 'bg-cyan-950/50 border-cyan-800/80 text-cyan-400'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-350'
                      }`}
                  >
                    {soundEnabled ? 'ENABLED' : 'MUTED'}
                  </button>
                </div>

                <div className="h-px bg-slate-800/60" />

                {/* Graphics Quality Settings */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200">Graphics Quality</span>
                    <span className="text-[9px] text-slate-505">Bloom, anti-aliasing, and speed shaders</span>
                  </div>
                  <div className="flex gap-1.5">
                    {(['low', 'medium', 'high'] as const).map((q) => (
                      <button
                        key={q}
                        onClick={() => changeGraphicsQuality(q)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border uppercase cursor-pointer ${graphicsQuality === q
                          ? 'bg-cyan-950/50 border-cyan-800/85 text-cyan-400 font-extrabold shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                          }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {graphicsQuality !== 'low' && (
                  <>
                    <div className="h-px bg-slate-800/60" />
                    {/* Bloom Intensity Toggle */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-bold text-slate-200">Bloom Glow Effect</span>
                        <span className="text-[9px] text-slate-505">Toggle environment bloom glow</span>
                      </div>
                      <button
                        onClick={() => changeBloomIntensity(bloomIntensity > 0.17 ? 0.05 : 0.30)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${bloomIntensity > 0.17
                          ? 'bg-slate-900 border border-slate-700 text-cyan-400 font-black'
                          : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-350'
                          }`}
                      >
                        {bloomIntensity > 0.17 ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Bottom Actions Row */}
              <div className="grid grid-cols-2 gap-3 mt-1">
                <button
                  onClick={() => setShowHelp(!showHelp)}
                  className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 cursor-pointer ${showHelp
                    ? 'bg-cyan-950/60 border-cyan-800/85 text-cyan-400'
                    : 'bg-slate-800/60 border-slate-750 text-slate-355 hover:text-white'
                    }`}
                >
                  <HelpCircle className="w-4 h-4" />
                  Controls Help
                </button>

                <button
                  onClick={exitToGarage}
                  className="bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 hover:text-white py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer hover:shadow-[0_0_15px_rgba(244,63,94,0.15)]"
                >
                  <LogOut className="w-4 h-4" />
                  Abort Session
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN GARAGE INTERFACE */}
      {activeMode === 'garage' && (
        <div className="absolute inset-0 pointer-events-none z-[70]">
          <Garage
            activeGarageTab={activeGarageTab}
            tuningState={tuningState}
            setActiveGarageTab={setActiveGarageTab}
            activeCarId={activeCarId}
            playerCredits={playerCredits}
            selectedColor={selectedColor}
            carUpgrades={carUpgrades}
            purchasedCars={purchasedCars}
            hasLicense={hasLicense}
            licenseProgress={licenseProgress}
            selectedBrand={selectedBrand}
            setSelectedBrand={setSelectedBrand}
            isTransitioningDrive={isTransitioningDrive}
            settingsState={settingsState}
            activeCarName={activeCarName}
            buyCar={buyCar}
            selectCar={selectCar}
            changeCarColor={changeCarColor}
            equipLevelUpgrade={equipLevelUpgrade}
            buyUpgrade={buyUpgrade}
            toggleUpgrade={toggleUpgrade}
            startRace={startRace}
            startQuickPlayRace={startQuickPlayRace}
            startFreeRoam={startFreeRoam}
            startTutorial={startTutorial}
            startLicenseTest={startLicenseTest}
            handleDriveClick={handleDriveClick}
            handleBackToGarageClick={handleBackToGarageClick}
            handleSettingClick={handleSettingClick}
            handleTuningClick={handleTuningClick}
            handleExitTuningClick={handleExitTuningClick}
            handleDealerClick={handleDealerClick}
            handleExitDealerClick={handleExitDealerClick}
            placeholderRef={placeholderRef}
            setActiveMode={setActiveMode}
          />
        </div>
      )}

      {/* DEDICATED SETTINGS PAGE */}
      <Setting
        activeGarageTab={activeGarageTab}
        settingsSubTab={settingsSubTab}
        setSettingsSubTab={handleSettingsSubTabChange}
        settingsVisible={settingsVisible}
        settingsTransitionComplete={settingsTransitionComplete}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        showMirrorInTPS={showMirrorInTPS}
        setShowMirrorInTPS={setShowMirrorInTPS}
        graphicsQuality={graphicsQuality}
        changeGraphicsQuality={changeGraphicsQuality}
        graphicsFeatures={graphicsFeatures}
        changeGraphicsFeature={changeGraphicsFeature}
        bloomIntensity={bloomIntensity}
        changeBloomIntensity={changeBloomIntensity}
        placeholderRef={placeholderRef}
        placeholderRect={placeholderRect}
        hudConfig={hudConfig}
        setHudConfig={setHudConfig}
        defaultHudConfig={DEFAULT_HUD_CONFIG}
        handleSettingBackClick={handleSettingBackClick}
        keyBindings={keyBindings}
        onKeyBindingsChange={handleKeyBindingsChange}
        brightness={brightness}
        changeBrightness={changeBrightness}
        masterVolume={masterVolume}
        changeMasterVolume={changeMasterVolume}
        musicVolume={musicVolume}
        changeMusicVolume={changeMusicVolume}
        sfxVolume={sfxVolume}
        changeSfxVolume={changeSfxVolume}
      />

      {/* MAP EDITOR PANEL */}
      <MapEditor
        activeMode={activeMode}
        editorNodes={editorNodes}
        setEditorNodes={setEditorNodes}
        editorScenery={editorScenery}
        setEditorScenery={setEditorScenery}
        editorTool={editorTool}
        setEditorTool={setEditorTool}
        editorCornerHeight={editorCornerHeight}
        setEditorCornerHeight={setEditorCornerHeight}
        selectedNodeIndex={selectedNodeIndex}
        setSelectedNodeIndex={setSelectedNodeIndex}
        selectedSceneryIndex={selectedSceneryIndex}
        setSelectedSceneryIndex={setSelectedSceneryIndex}
        editorTrackName={editorTrackName}
        setEditorTrackName={setEditorTrackName}
        editorRoadWidth={editorRoadWidth}
        setEditorRoadWidth={setEditorRoadWidth}
        editorTimeLimit={editorTimeLimit}
        setEditorTimeLimit={setEditorTimeLimit}
        editorHasObstacles={editorHasObstacles}
        setEditorHasObstacles={setEditorHasObstacles}
        editorHaveGrass={editorHaveGrass}
        setEditorHaveGrass={setEditorHaveGrass}
        editorGrassWidth={editorGrassWidth}
        setEditorGrassWidth={setEditorGrassWidth}
        editorGridLimit={editorGridLimit}
        setEditorGridLimit={setEditorGridLimit}
        snapToGrid={snapToGrid}
        setSnapToGrid={setSnapToGrid}
        livePreview={livePreview}
        setLivePreview={setLivePreview}
        saveCustomTrack={saveCustomTrack}
        importTrack={importTrack}
        handleClearAll={handleClearAll}
        handleApplyTemplate={handleApplyTemplate}
        launchTestDrive={launchTestDrive}
        exitToGarage={exitToGarage}
      />
      {/* Cinematic Blackout Overlay for Drive transition */}
      <div
        className={`fixed inset-0 bg-black z-[80] pointer-events-none transition-opacity duration-500 ease-in-out ${isBlackOverlay ? 'opacity-100' : 'opacity-0'
          }`}
      />
    </div>
  );
}
