'use client';

import React from 'react';
import { Coins, HelpCircle, Compass, Award, Lock, Paintbrush, Play, Timer, LogOut, Wrench, Settings, Check, Map } from 'lucide-react';
import * as THREE from 'three';
import { CARS_DATABASE, CarConfig } from '../config/CarDatabase';
import { TRACKS_DATABASE, TrackConfig } from '../config/TrackDatabase';
import {
  LICENSE_TESTS_BY_TIER,
  LICENSE_TIERS,
  LicenseProgress,
  LicenseTier,
  getLicenseTierCompletion,
  isLicenseTestUnlocked
} from '../config/LicenseDatabase';

// Custom Icons
const RacingFlagsIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="20" x2="18" y2="6" strokeWidth="2" />
    <line x1="20" y1="20" x2="6" y2="6" strokeWidth="2" />
    <path d="M4 6c3-1.5 6 .5 9-1 3-1.5 6-1 7 .5v6c-1-1.5-4-2-7-.5-3 1.5-6-.5-9 1V6z" fill="currentColor" fillOpacity="0.2" />
    <path d="M7 6.5h2v1.5H7z M11 5.8h2v1.5h-2z M15 5.2h2v1.5h-2z" fill="currentColor" />
    <path d="M20 6c-3-1.5-6 .5-9-1-3-1.5-6-1-7 .5v6c1-1.5 4-2 7-.5 3 1.5 6-.5 9 1V6z" fill="currentColor" fillOpacity="0.1" />
    <path d="M15 6.5h2v1.5h-2z M11 7.2h2v1.5h-2z M7 7.8h2v1.5H7z" fill="currentColor" />
  </svg>
);

const S2000Icon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6.5" cy="15.5" r="2" fill="currentColor" fillOpacity="0.25" strokeWidth="2" />
    <circle cx="17.5" cy="15.5" r="2" fill="currentColor" fillOpacity="0.25" strokeWidth="2" />
    <path d="M2 14h2c.2-1.1 1.1-2 2.3-2s2.1.9 2.3 2h6.8c.2-1.1 1.1-2 2.3-2s2.1.9 2.3 2h2v-2c-.3-1.5-1.5-3.5-3-3.8-1-.2-2.5-.2-3.5-.2h-2L12.5 8H8l-2.5 4H2v2z" strokeWidth="1.6" />
    <path d="M10.2 11.2L12 8.2" strokeWidth="1.8" />
    <path d="M9.8 14V11" />
    <path d="M19.5 10c.8 0 1.5.3 1.5.5" />
  </svg>
);

const RealisticWrenchIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7.5" y1="16.5" x2="16.5" y2="7.5" strokeWidth="3" />
    <line x1="8.5" y1="15.5" x2="15.5" y2="8.5" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
    <path d="M16 4.5c.7-.7 1.7-1 2.7-.8 1.5.3 2.5 1.5 2.5 3s-1 2.7-2.5 3c-1 .2-2-.1-2.7-.8l-1.5-1.5L16 4.5z" fill="currentColor" fillOpacity="0.25" strokeWidth="1.5" />
    <path d="M17.5 5.5l2.5 2.5" strokeWidth="2" />
    <path d="M8 19.5c-.7.7-1.7 1-2.7.8-1.5-.3-2.5-1.5-2.5-3s1-2.7 2.5-3c1-.2 2 .1 2.7.8l1.5 1.5L8 19.5z" fill="currentColor" fillOpacity="0.25" strokeWidth="1.5" />
    <path d="M4 16l2.5 2.5" strokeWidth="2" />
  </svg>
);

const MechanicalGearIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity="0.3" />
    <circle cx="12" cy="12" r="6" strokeWidth="1.5" />
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
        name: 'Racing Tires',
        description: 'Upgrades tire compounds from economy to racing super soft for extreme grip.',
        type: 'level',
        maxLevel: 5,
        costs: [400, 800, 1200, 1800, 2600],
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

const getEquippedLevel = (carUpgradesForCar: any, item: any) => {
  const currentCarUpgrades = carUpgradesForCar || DEFAULT_UPGRADES;
  let val: any = currentCarUpgrades;
  for (let i = 0; i < item.path.length; i++) {
    if (val !== undefined && val !== null) {
      val = val[item.path[i]];
    }
  }
  return typeof val === 'number' ? val : 0;
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

  const upgradedSpeed = car.speed + (gearboxLvl * 0.4) + (ecuLvl * 0.1) + (balancingLvl * 0.1);

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
  let tireHandlingBoost = 0;
  if (tireCompound === 'super_hard') tireHandlingBoost = 0.35;
  else if (tireCompound === 'hard') tireHandlingBoost = 0.7;
  else if (tireCompound === 'normal') tireHandlingBoost = 1.1;
  else if (tireCompound === 'soft') tireHandlingBoost = 1.5;
  else if (tireCompound === 'super_soft') tireHandlingBoost = 2.0;

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

interface GarageProps {
  activeGarageTab: null | 'drive' | 'dealer' | 'tuning' | 'setting';
  tuningState: 'closed' | 'entering' | 'open' | 'exiting';
  setActiveGarageTab: (tab: null | 'drive' | 'dealer' | 'tuning' | 'setting') => void;
  activeCarId: string;
  playerCredits: number;
  selectedColor: string;
  carUpgrades: { [carId: string]: any };
  purchasedCars: string[];
  hasLicense: boolean;
  licenseProgress: LicenseProgress;
  selectedBrand: string;
  setSelectedBrand: (brand: string) => void;
  isTransitioningDrive: boolean;
  settingsState: string;
  activeCarName: string;

  // Handlers
  buyCar: (car: CarConfig) => void;
  selectCar: (carId: string) => void;
  changeCarColor: (hex: string) => void;
  equipLevelUpgrade: (item: any, lvl: number) => void;
  buyUpgrade: (item: any, cost: number) => void;
  toggleUpgrade: (item: any) => void;
  startRace: (trackId?: string) => void;
  startFreeRoam: () => void;
  startTutorial: () => void;
  startLicenseTest: (testId?: string) => void;
  handleDriveClick: () => void;
  handleBackToGarageClick: () => void;
  handleSettingClick: () => void;
  handleTuningClick: () => void;
  handleExitTuningClick: () => void;
  placeholderRef: React.RefObject<HTMLDivElement | null>;
  setActiveMode: (mode: any) => void;
}

export default function Garage({
  activeGarageTab,
  tuningState,
  setActiveGarageTab,
  activeCarId,
  playerCredits,
  selectedColor,
  carUpgrades,
  purchasedCars,
  hasLicense,
  licenseProgress,
  selectedBrand,
  setSelectedBrand,
  isTransitioningDrive,
  settingsState,
  activeCarName,
  buyCar,
  selectCar,
  changeCarColor,
  equipLevelUpgrade,
  buyUpgrade,
  toggleUpgrade,
  startRace,
  startFreeRoam,
  startTutorial,
  startLicenseTest,
  handleDriveClick,
  handleBackToGarageClick,
  handleSettingClick,
  handleTuningClick,
  handleExitTuningClick,
  placeholderRef,
  setActiveMode,
}: GarageProps) {

  const getCarUpgradesSafe = (carId: string) => {
    return carUpgrades[carId] || JSON.parse(JSON.stringify(DEFAULT_UPGRADES));
  };

  const licenseTierStyles: Record<LicenseTier, { accent: string; icon: string; button: string; done: string }> = {
    bronze: {
      accent: 'text-amber-600',
      icon: 'bg-amber-950/35 border-amber-900/40',
      button: 'bg-amber-700 hover:bg-amber-600 text-white',
      done: 'bg-amber-950/50 border-amber-700 text-amber-300'
    },
    silver: {
      accent: 'text-zinc-300',
      icon: 'bg-zinc-800/70 border-zinc-600/60',
      button: 'bg-zinc-200 hover:bg-white text-zinc-950',
      done: 'bg-zinc-800 border-zinc-500 text-zinc-100'
    },
    gold: {
      accent: 'text-yellow-400',
      icon: 'bg-yellow-950/35 border-yellow-800/50',
      button: 'bg-yellow-500 hover:bg-yellow-400 text-zinc-950',
      done: 'bg-yellow-950/50 border-yellow-600 text-yellow-200'
    },
    platinum: {
      accent: 'text-cyan-300',
      icon: 'bg-cyan-950/35 border-cyan-800/50',
      button: 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950',
      done: 'bg-cyan-950/50 border-cyan-600 text-cyan-200'
    }
  };

  return (
    <>
      {/* TOP STATUS BAR */}
      {activeGarageTab !== 'drive' && (
        <div
          className={`absolute left-12 top-8 z-10 flex items-center gap-4 text-xs font-black tracking-widest bg-zinc-950/80 border border-zinc-800 backdrop-blur-md py-2.5 px-5 rounded-xl shadow-lg pointer-events-auto transition-all duration-700 ${(isTransitioningDrive || settingsState !== 'closed') ? '-translate-x-[350px] opacity-0' : 'translate-x-0 opacity-100 delay-[200ms]'
            }`}
        >
          <span className="text-white uppercase">{activeCarName}</span>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-1.5 font-mono text-amber-500 font-bold">
            <Coins className="w-4 h-4" />
            <span>{playerCredits.toLocaleString()} CR</span>
          </div>
        </div>
      )}

      {/* RIGHT FLOATING SHOWROOM ACTIONS MENU */}
      {activeGarageTab !== 'drive' && activeGarageTab !== 'tuning' && (
        <div className="absolute right-12 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-3.5 w-80 pointer-events-auto">
          {[
            { id: 'drive', label: 'DRIVE', icon: RacingFlagsIcon, onClick: handleDriveClick },
            {
              id: 'dealer',
              label: 'DEALER',
              icon: S2000Icon,
              onClick: () => setActiveGarageTab(activeGarageTab === 'dealer' ? null : 'dealer'),
            },
            {
              id: 'tuning',
              label: 'TUNING',
              icon: RealisticWrenchIcon,
              onClick: handleTuningClick,
            },
            {
              id: 'setting',
              label: 'SETTING',
              icon: MechanicalGearIcon,
              onClick: handleSettingClick,
            },
          ].map((item, index) => {
            const isActive = activeGarageTab === item.id;
            const isDrive = item.id === 'drive';
            const isHidden = isTransitioningDrive || settingsState !== 'closed';

            // Ladder offsets: index * 10% left, static on hover
            let baseClass = '';
            if (index === 0) baseClass = 'translate-x-0';
            else if (index === 1) baseClass = '-translate-x-[10%]';
            else if (index === 2) baseClass = '-translate-x-[20%]';
            else if (index === 3) baseClass = '-translate-x-[30%]';

            return (
              <div
                key={item.id}
                className={`transition-all duration-500 transform ${isHidden ? 'translate-x-[450px] opacity-0' : 'translate-x-0 opacity-100'
                  } ${isHidden
                    ? 'delay-0'
                    : index === 0
                      ? 'delay-[100ms]'
                      : index === 1
                        ? 'delay-[200ms]'
                        : index === 2
                          ? 'delay-[300ms]'
                          : 'delay-[400ms]'
                  }`}
              >
                <button
                  onClick={item.onClick}
                  className={`group w-full py-5 px-8 text-left text-sm font-black tracking-widest transition-all flex items-center justify-between border cursor-pointer transform -skew-x-12 duration-500 relative overflow-hidden ${baseClass} ${isActive
                    ? 'bg-rose-600 border-rose-500 text-white pl-10 shadow-[0_0_20px_rgba(244,63,94,0.3)]'
                    : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 shadow-lg'
                    }`}
                >
                  <span className="transform skew-x-12 flex items-center justify-between w-full relative z-10">
                    <span>{item.label}</span>
                  </span>

                  {isDrive && (
                    <div className="absolute right-0 top-0 bottom-0 w-[30%] group-hover:w-[40%] overflow-hidden pointer-events-none z-0 transition-all duration-500 ease-in-out">
                      <svg className="w-[150%] h-[150%] absolute -left-[25%] -top-[25%] transform skew-x-12 opacity-70 group-hover:opacity-100 transition-all duration-500 ease-in-out" preserveAspectRatio="none">
                        <defs>
                          <pattern id="drive-checkers" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="translate(0, 0)">
                            <animateTransform attributeName="patternTransform" type="translate" from="0,0" to="16,0" dur="1.2s" repeatCount="indefinite" />
                            <rect width="8" height="8" fill="#e11d48" />
                            <rect x="8" width="8" height="8" fill="#09090b" />
                            <rect y="8" width="8" height="8" fill="#09090b" />
                            <rect x="8" y="8" width="8" height="8" fill="#e11d48" />
                          </pattern>
                          <filter id="checkers-wave" x="-20%" y="-20%" width="140%" height="140%">
                            <feTurbulence type="fractalNoise" baseFrequency="0.02 0.0" numOctaves="1" stitchTiles="stitch" x="0" y="0" width="50" height="100%" result="noise" />
                            <feTile in="noise" result="tiledNoise" />
                            <feOffset dx="0" dy="0" in="tiledNoise" result="offsetNoise">
                              <animate attributeName="dx" from="0" to="-50" dur="1.5s" repeatCount="indefinite" />
                            </feOffset>
                            <feColorMatrix type="matrix" values="0 0 0 0 0.5   0 1 0 0 0   0 0 1 0 0   0 0 0 1 0" in="offsetNoise" result="neutralXNoise" />
                            <feDisplacementMap in="SourceGraphic" in2="neutralXNoise" scale="15" xChannelSelector="R" yChannelSelector="G" />
                          </filter>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#drive-checkers)" filter="url(#checkers-wave)" />
                      </svg>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* FLOATING DETAILS PANEL */}
      {activeGarageTab && activeGarageTab !== 'drive' && activeGarageTab !== 'setting' && activeGarageTab !== 'tuning' && (
        <div
          className="absolute right-[388px] top-12 bottom-12 w-[460px] z-10 flex flex-col p-6 bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-3xl shadow-2xl pointer-events-auto transition-all duration-500 overflow-y-auto"
        >
          {/* TAB: DEALER */}
          {activeGarageTab === 'dealer' && (
            <div className="flex flex-col gap-4 animate-fadeIn text-left">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                <h2 className="text-sm font-black text-white tracking-wider uppercase">DEALERSHIP</h2>
                <span className="text-[9px] text-zinc-500 font-mono">SELECT OR PURCHASE CARS</span>
              </div>

              {/* Brand Filter */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent shrink-0">
                {['All', 'Toyota', 'Ford', 'Nissan', 'Tesla', 'Porsche', 'Ferrari', 'Audi', 'Chevrolet'].map((brand) => (
                  <button
                    key={brand}
                    onClick={() => setSelectedBrand(brand)}
                    className={`px-3 py-1.5 text-[9px] font-bold rounded-lg whitespace-nowrap transition-all border cursor-pointer ${selectedBrand === brand
                      ? 'bg-zinc-100 border-zinc-100 text-zinc-950'
                      : 'bg-transparent border-zinc-850 text-zinc-400 hover:text-zinc-200'
                      }`}
                  >
                    {brand}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-4">
                {CARS_DATABASE.filter((car) => selectedBrand === 'All' || car.brand === selectedBrand).map((car) => {
                  const isUnlocked = purchasedCars.includes(car.id);
                  const isActive = activeCarId === car.id;
                  const canAfford = playerCredits >= car.price;
                  const isSuperLocked = car.requiresLicense && !hasLicense;

                  return (
                    <div
                      key={car.id}
                      className={`border p-4 rounded-2xl transition-all flex flex-col gap-3 ${isActive
                        ? 'bg-zinc-900/60 border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
                        : 'bg-zinc-900/20 border-zinc-855'
                        }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-zinc-100 text-sm">
                            {car.brand} {car.name}
                          </h3>
                          <div className="flex gap-2 items-center mt-0.5">
                            <span className="text-[9px] font-bold tracking-wider uppercase text-rose-500">
                              {car.tier}
                            </span>
                            <span className="text-zinc-700 text-[9px] font-bold">•</span>
                            <span className="text-[9px] font-bold tracking-wider uppercase text-zinc-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                              {car.driveType}
                            </span>
                          </div>
                        </div>
                        {isUnlocked ? (
                          <span className="text-[9px] font-bold text-rose-500 bg-rose-950/20 border border-rose-900/30 px-2.5 py-0.5 rounded-lg">
                            Owned
                          </span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Coins className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-xs font-mono font-bold text-amber-500">{car.price} Cr</span>
                          </div>
                        )}
                      </div>

                      {/* Spec bars */}
                      {(() => {
                        const upgradesForCar = getCarUpgradesSafe(car.id);
                        const upgradedStats = getUpgradedStats(car, upgradesForCar);
                        return (
                          <div className="flex flex-col gap-2 mt-0.5 bg-zinc-950/50 p-3 rounded-xl border border-zinc-900">
                            {/* Speed */}
                            <div>
                              <div className="flex justify-between text-[9px] font-bold text-zinc-500 mb-1">
                                <span>TOP SPEED</span>
                                <span>{Math.round(upgradedStats.speed * 10)}%</span>
                              </div>
                              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden relative">
                                <div
                                  className="absolute left-0 top-0 h-full bg-rose-600 transition-all duration-300"
                                  style={{ width: `${Math.min(100, upgradedStats.speed * 10)}%` }}
                                />
                                <div
                                  className="absolute left-0 top-0 h-full bg-zinc-450 transition-all duration-300"
                                  style={{ width: `${Math.min(100, car.speed * 10)}%` }}
                                />
                              </div>
                            </div>
                            {/* Acceleration */}
                            <div>
                              <div className="flex justify-between text-[9px] font-bold text-zinc-500 mb-1">
                                <span>ACCELERATION</span>
                                <span>{Math.round(upgradedStats.acceleration * 10)}%</span>
                              </div>
                              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden relative">
                                <div
                                  className="absolute left-0 top-0 h-full bg-rose-600 transition-all duration-300"
                                  style={{ width: `${Math.min(100, upgradedStats.acceleration * 10)}%` }}
                                />
                                <div
                                  className="absolute left-0 top-0 h-full bg-zinc-450 transition-all duration-300"
                                  style={{ width: `${Math.min(100, car.acceleration * 10)}%` }}
                                />
                              </div>
                            </div>
                            {/* Handling */}
                            <div>
                              <div className="flex justify-between text-[9px] font-bold text-zinc-500 mb-1">
                                <span>HANDLING</span>
                                <span>{Math.round(upgradedStats.handling * 10)}%</span>
                              </div>
                              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden relative">
                                <div
                                  className="absolute left-0 top-0 h-full bg-rose-600 transition-all duration-300"
                                  style={{ width: `${Math.min(100, upgradedStats.handling * 10)}%` }}
                                />
                                <div
                                  className="absolute left-0 top-0 h-full bg-zinc-450 transition-all duration-300"
                                  style={{ width: `${Math.min(100, car.handling * 10)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Dealership Action Buttons */}
                      {isUnlocked ? (
                        <button
                          disabled={isActive}
                          onClick={() => selectCar(car.id)}
                          className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${isActive
                            ? 'bg-zinc-950 border border-zinc-900 text-zinc-650 cursor-default'
                            : 'bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-200'
                            }`}
                        >
                          {isActive ? 'Active Vehicle' : 'Select Vehicle'}
                        </button>
                      ) : (
                        <button
                          disabled={!canAfford || isSuperLocked}
                          onClick={() => buyCar(car)}
                          className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${isSuperLocked
                            ? 'bg-zinc-800 border border-zinc-750 text-zinc-550 cursor-not-allowed'
                            : canAfford
                              ? 'bg-rose-600 hover:bg-rose-500 border border-rose-500 text-white'
                              : 'bg-zinc-800 border border-zinc-750 text-zinc-550 cursor-not-allowed'
                            }`}
                        >
                          {isSuperLocked
                            ? 'Requires Bronze License'
                            : canAfford
                              ? `Purchase Vehicle (-${car.price} CR)`
                              : 'Insufficient Credits'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* DEDICATED DRIVE MODES INTERFACE */}
      {activeGarageTab === 'drive' && (
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center p-8 bg-zinc-950/40 backdrop-blur-md pointer-events-auto transition-all duration-700 ${isTransitioningDrive ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
        >
          <div className="w-full max-w-4xl flex flex-col gap-6 text-left">
            <div className="flex justify-between items-center pb-4 border-b border-zinc-900">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold tracking-[0.4em] text-rose-500 uppercase italic">
                  VELOCITY
                </span>
                <h2 className="text-2xl font-black text-white tracking-wider uppercase">
                  DRIVING CHALLENGES
                </h2>
              </div>
              <button
                onClick={handleBackToGarageClick}
                className="px-5 py-2.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-xs font-black tracking-widest text-zinc-300 rounded-xl transition-all cursor-pointer"
              >
                BACK TO GARAGE
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Driving School */}
              <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="w-10 h-10 rounded-xl bg-rose-950/40 border border-rose-900/40 flex items-center justify-center">
                      <HelpCircle className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base">Driving School</h3>
                      <span className="text-[9px] font-bold text-rose-500 tracking-wider uppercase">TUTORIAL</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Learn acceleration, braking, yaw physics, and drifting. Rewards <span className="text-amber-500 font-bold font-mono">+200 Credits</span>.
                  </p>
                </div>
                <button
                  onClick={startTutorial}
                  className="w-full bg-rose-600 hover:bg-rose-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Start Training
                </button>
              </div>

              {/* Free Roam */}
              <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="w-10 h-10 rounded-xl bg-rose-950/40 border border-rose-900/40 flex items-center justify-center">
                      <Compass className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base">Free Roam</h3>
                      <span className="text-[9px] font-bold text-rose-500 tracking-wider uppercase">OPEN WORLD</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Explore the test course, practice jumps, and chain drift combinations to earn passive credit payouts.
                  </p>
                </div>
                <button
                  onClick={startFreeRoam}
                  className="w-full bg-rose-600 hover:bg-rose-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Enter Open World
                </button>
              </div>

              {/* License Academy */}
              <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-950/40 border border-rose-900/40 flex items-center justify-center">
                    <Award className="w-5 h-5 text-rose-500" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-base">License Academy</h3>
                    <span className="text-[9px] font-bold text-rose-500 tracking-wider uppercase">40 TESTS</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 max-h-[260px] overflow-y-auto pr-1">
                  {LICENSE_TIERS.map((tier) => {
                    const tests = LICENSE_TESTS_BY_TIER[tier.id];
                    const completed = getLicenseTierCompletion(licenseProgress, tier.id);
                    const styles = licenseTierStyles[tier.id];
                    const nextTest = tests.find((test) =>
                      !licenseProgress[test.tier][test.testNumber - 1] && isLicenseTestUnlocked(test, licenseProgress)
                    );

                    return (
                      <div key={tier.id} className="bg-zinc-950 border border-zinc-850 p-3 rounded-xl">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${styles.icon}`}>
                              <Award className={`w-4 h-4 ${styles.accent}`} />
                            </div>
                            <div>
                              <div className="text-xs font-extrabold text-white uppercase">{tier.name}</div>
                              <div className="text-[9px] font-mono text-zinc-500">{completed}/10 COMPLETE</div>
                            </div>
                          </div>
                          {completed === 10 && (
                            <span className={`text-[9px] font-black px-2 py-1 rounded-lg border ${styles.done}`}>
                              COMPLETE
                            </span>
                          )}
                        </div>

                        <p className="text-[10px] text-zinc-500 leading-relaxed mb-3">
                          {tier.description}
                        </p>
                        <div className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 mb-3">
                          {nextTest ? `Next: ${nextTest.lesson}` : 'Tier exam complete'}
                        </div>

                        <div className="grid grid-cols-5 gap-1.5">
                          {tests.map((test) => {
                            const isComplete = licenseProgress[test.tier][test.testNumber - 1];
                            const isUnlocked = isLicenseTestUnlocked(test, licenseProgress);
                            return (
                              <button
                                key={test.id}
                                disabled={!isUnlocked}
                                onClick={() => startLicenseTest(test.id)}
                                title={test.name}
                                className={`h-9 rounded-lg border text-[10px] font-black transition-all flex items-center justify-center ${isComplete
                                  ? styles.done
                                  : isUnlocked
                                    ? `${styles.button} border-transparent cursor-pointer`
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed'
                                  }`}
                              >
                                {isComplete ? <Check className="w-3.5 h-3.5" /> : isUnlocked ? test.testNumber : <Lock className="w-3 h-3" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
              {/* Map Editor */}
              <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="w-10 h-10 rounded-xl bg-rose-950/40 border border-rose-900/40 flex items-center justify-center">
                      <Map className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base">Custom Map Editor</h3>
                      <span className="text-[9px] font-bold text-rose-500 tracking-wider uppercase">3D BUILDER</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Design layout elevation, banking, and scenery objects. Test drive instantly with custom settings.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActiveMode('editor');
                    setActiveGarageTab(null);
                  }}
                  className="w-full bg-rose-600 hover:bg-rose-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Open Map Editor
                </button>
              </div>

              {/* Circuit Racing Selection List (Span 2 cols) */}
              <div className="md:col-span-2 bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-3 max-h-[300px] overflow-y-auto">
                <span className="text-[10px] font-bold text-rose-500 tracking-wider uppercase">CIRCUIT RACING CHALLENGES</span>

                <div className="flex flex-col gap-3">
                  {TRACKS_DATABASE.filter((t) => t.id !== 'license' && t.id !== 'custom').map((track) => {
                    const isLocked = track.requiresLicense && !hasLicense;
                    const length = getTrackLength(track.path.map((p) => ('isVector3' in p ? p : p.pos)));
                    return (
                      <div
                        key={track.id}
                        className="bg-zinc-950 border border-zinc-850 p-4 rounded-xl flex items-center justify-between gap-4"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-white text-sm">{track.name}</h4>
                            {isLocked && <Lock className="w-3.5 h-3.5 text-zinc-550" />}
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                            {track.description}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2.5">
                          <div className="text-right">
                            <span className={`text-[10px] font-mono font-bold block ${!isLocked ? 'text-amber-500' : 'text-zinc-550'}`}>
                              +{track.baseReward} CR
                            </span>
                            <span className="text-[9px] font-mono text-zinc-550">{formatDistance(length)}</span>
                          </div>
                          <button
                            disabled={isLocked}
                            onClick={() => startRace(track.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${!isLocked
                              ? 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer'
                              : 'bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed'
                              }`}
                          >
                            {!isLocked ? 'Enter' : 'Locked'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}      {tuningState !== 'closed' && (
        <div
          className="absolute inset-0 z-10 flex items-stretch pointer-events-auto bg-zinc-950/95 backdrop-blur-sm"
          style={{
            animation: tuningState === 'entering' ? 'fadeIn 0.7s ease-out forwards' : tuningState === 'exiting' ? 'fadeOut 0.7s ease-out forwards' : 'none',
            opacity: tuningState === 'open' ? 1 : undefined,
          }}
        >

          {/* LEFT SIDE: Viewport area (static car view - no box, car sits on background) */}
          <div
            className={`w-[25%] pointer-events-none relative flex flex-col items-stretch justify-end z-10 ${tuningState === 'entering' ? 'animate-slideInLeft' : tuningState === 'exiting' ? 'animate-slideOutLeft' : ''
              }`}
          >
            <div
              ref={placeholderRef}
              className="absolute inset-0 pointer-events-auto"
            />

            <div className="relative mb-8 ml-8 bg-zinc-950/90 border border-zinc-800 backdrop-blur-md px-6 py-4 rounded-2xl pointer-events-auto select-none flex flex-col gap-1 shadow-xl z-20 w-fit">
              <span className="text-[10px] font-extrabold tracking-widest text-rose-500 uppercase leading-none">Vehicle Focus</span>
              <h3 className="text-base font-black text-white uppercase mt-1 leading-none">{activeCarName}</h3>
              <span className="text-[9px] font-bold text-zinc-550 uppercase tracking-widest mt-1 block">Tuning Bay Live Feed</span>
            </div>
          </div>

          {/* RIGHT SIDE: Upgrades Panel */}
          <div
            className={`w-[75%] p-6 flex flex-col gap-6 overflow-hidden z-10 ${tuningState === 'entering' ? 'animate-slideInRight' : tuningState === 'exiting' ? 'animate-slideOutRight' : ''
              }`}
          >
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-zinc-900 shrink-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-extrabold tracking-[0.4em] text-rose-500 uppercase italic">PERFORMANCE</span>
                <h2 className="text-xl font-black text-white tracking-wider uppercase">TUNING BAY</h2>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 font-mono text-amber-500 font-bold text-sm bg-zinc-900 border border-zinc-850 px-3.5 py-1.5 rounded-xl">
                  <Coins className="w-4 h-4" />
                  <span>{playerCredits.toLocaleString()} CR</span>
                </div>
                <button
                  onClick={handleExitTuningClick}
                  className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-xs font-black tracking-widest text-zinc-300 rounded-xl transition-all cursor-pointer"
                >
                  EXIT BAY
                </button>
              </div>
            </div>

            {/* Custom Paint Color Segment */}
            <div className="bg-zinc-950/40 p-4 border border-zinc-900 rounded-2xl shrink-0 flex items-center justify-between gap-4">
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5">
                  <Paintbrush className="w-4 h-4 text-rose-500" />
                  <span className="text-xs font-bold text-zinc-200 uppercase tracking-wide">Custom Paint Color</span>
                </div>
                <span className="text-[10px] text-zinc-555 mt-0.5">Change exterior paint finish</span>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {PAINT_SWATCHES.map((swatch) => {
                  const isSelected = selectedColor === swatch.hex;
                  return (
                    <button
                      key={swatch.name}
                      onClick={() => changeCarColor(swatch.hex)}
                      className={`group relative w-8 h-8 rounded-lg flex items-center justify-center border hover:scale-105 transition-all cursor-pointer ${isSelected
                        ? 'border-white ring-2 ring-rose-500 ring-offset-2 ring-offset-zinc-950'
                        : 'border-zinc-850'
                        }`}
                      style={{ backgroundColor: swatch.hex }}
                      title={swatch.name}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Upgradable items list - Scrollable */}
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-6 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {UPGRADES_CONFIG.map((group) => (
                <div key={group.group} className="flex flex-col gap-3">
                  <span className="text-[10px] font-black text-rose-500 tracking-wider uppercase text-left">
                    {group.group}
                  </span>

                  {/* Grid of box-styled cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.items.map((item) => {
                      const upgradesForCar = getCarUpgradesSafe(activeCarId);

                      if (item.type === 'level') {
                        const levelItem = item as any;
                        const equippedLvl = getEquippedLevel(upgradesForCar, levelItem);
                        const purchasedLvl = getPurchasedLevel(upgradesForCar, levelItem);
                        const isMax = purchasedLvl >= levelItem.maxLevel;
                        const nextCost = isMax ? 0 : levelItem.costs[purchasedLvl];
                        const canAfford = playerCredits >= nextCost;

                        return (
                          <div
                            key={item.id}
                            className="bg-zinc-900/30 border border-zinc-850 hover:border-zinc-800 p-4 rounded-2xl flex flex-col justify-between gap-3 transition-all text-left"
                          >
                            <div className="flex flex-col gap-1">
                              {/* Large Icon Placeholder box */}
                              <div className="w-full h-24 bg-zinc-950 border border-zinc-900 rounded-xl flex items-center justify-center relative overflow-hidden group select-none">
                                <MechanicalGearIcon className="w-10 h-10 text-zinc-850 group-hover:rotate-45 transition-transform duration-700" />
                                <span className="absolute bottom-2 right-2 text-[8px] font-mono font-bold text-rose-500 bg-rose-955/10 border border-rose-900/20 px-1.5 py-0.5 rounded">
                                  {isMax ? 'MAX STAGE' : `STAGE ${purchasedLvl + 1}`}
                                </span>
                              </div>

                              <div className="flex items-center justify-between mt-1">
                                <h4 className="font-extrabold text-zinc-100 text-xs truncate max-w-[120px]">{item.name}</h4>
                                <span className="text-[9px] font-bold text-zinc-500 font-mono">
                                  LVL {equippedLvl}/{levelItem.maxLevel}
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-500 leading-normal line-clamp-2 h-7">{item.description}</p>
                            </div>

                            {/* Stage Selector Buttons */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              <button
                                onClick={() => equipLevelUpgrade(item, 0)}
                                className={`px-2 py-0.5 rounded text-[8px] font-bold transition-all border cursor-pointer ${equippedLvl === 0
                                  ? 'bg-rose-955/40 border-rose-800 text-rose-400'
                                  : 'bg-zinc-950 border border-zinc-900 text-zinc-650 hover:text-zinc-400'
                                  }`}
                              >
                                {item.id === 'tireLevel' ? 'Economy' : 'Stock'}
                              </button>
                              {Array.from({ length: levelItem.maxLevel }).map((_, i) => {
                                const lvl = i + 1;
                                const isUnlocked = purchasedLvl >= lvl;
                                if (!isUnlocked) return null;
                                const isEquipped = equippedLvl === lvl;
                                const btnLabel = item.id === 'tireLevel'
                                  ? ['S-Hard', 'Hard', 'Normal', 'Soft', 'S-Soft'][i]
                                  : `Stg ${lvl}`;

                                return (
                                  <button
                                    key={lvl}
                                    onClick={() => equipLevelUpgrade(item, lvl)}
                                    className={`px-2 py-0.5 rounded text-[8px] font-bold transition-all border cursor-pointer ${isEquipped
                                      ? 'bg-rose-955/40 border-rose-800 text-rose-400'
                                      : 'bg-zinc-950 border border-zinc-900 text-zinc-300 hover:text-zinc-200'
                                      }`}
                                  >
                                    {btnLabel}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Purchase Button */}
                            {!isMax && (
                              <button
                                onClick={() => buyUpgrade(item, nextCost)}
                                disabled={!canAfford}
                                className={`w-full py-1.5 rounded-lg text-[10px] font-bold font-mono transition-all flex items-center justify-center gap-1 border cursor-pointer ${canAfford
                                  ? 'bg-rose-600 hover:bg-rose-500 border-rose-500 text-white'
                                  : 'bg-zinc-800 border-zinc-750 text-zinc-550 cursor-not-allowed'
                                  }`}
                              >
                                <Coins className="w-3 h-3" />
                                <span>Buy Stage {purchasedLvl + 1} (-{nextCost} Cr)</span>
                              </button>
                            )}
                          </div>
                        );
                      } else {
                        // Toggle type (ABS, ESC, Turbo)
                        const isPurchased = isTogglePurchased(upgradesForCar, item.id);
                        const path = item.path;
                        let target = upgradesForCar;
                        for (let i = 0; i < path.length - 1; i++) {
                          if (target) target = target[path[i]];
                        }
                        const isEquipped = target ? (target[path[path.length - 1]] === 'turbo' || target[path[path.length - 1]] === true) : false;
                        const cost = item.cost || 0;
                        const canAfford = playerCredits >= cost;

                        return (
                          <div
                            key={item.id}
                            className="bg-zinc-900/30 border border-zinc-850 hover:border-zinc-800 p-4 rounded-2xl flex flex-col justify-between gap-3 transition-all text-left"
                          >
                            <div className="flex flex-col gap-1">
                              {/* Large Icon Placeholder box */}
                              <div className="w-full h-24 bg-zinc-950 border border-zinc-900 rounded-xl flex items-center justify-center relative overflow-hidden group select-none">
                                <MechanicalGearIcon className="w-10 h-10 text-zinc-855 group-hover:rotate-45 transition-transform duration-700" />
                                {isPurchased && (
                                  <span className="absolute bottom-2 right-2 text-[8px] font-mono font-bold text-rose-500 bg-rose-955/10 border border-rose-900/20 px-1.5 py-0.5 rounded">
                                    OWNED
                                  </span>
                                )}
                              </div>

                              <h4 className="font-extrabold text-zinc-100 text-xs mt-1 truncate">{item.name}</h4>
                              <p className="text-[10px] text-zinc-500 leading-normal line-clamp-2 h-7">{item.description}</p>
                            </div>

                            {/* Purchase or Toggle Button */}
                            {!isPurchased ? (
                              <button
                                onClick={() => buyUpgrade(item, cost)}
                                disabled={!canAfford}
                                className={`w-full py-1.5 rounded-lg text-[10px] font-bold font-mono transition-all flex items-center justify-center gap-1 border cursor-pointer ${canAfford
                                  ? 'bg-rose-600 hover:bg-rose-500 border-rose-500 text-white'
                                  : 'bg-zinc-800 border-zinc-750 text-zinc-550 cursor-not-allowed'
                                  }`}
                              >
                                <Coins className="w-3 h-3" />
                                <span>Buy Option (-{cost} Cr)</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => toggleUpgrade(item)}
                                className={`w-full py-1.5 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${isEquipped
                                  ? 'bg-rose-955/40 border-rose-800 text-rose-400 font-bold'
                                  : 'bg-zinc-800 hover:bg-zinc-750 border-zinc-700 text-zinc-400'
                                  }`}
                              >
                                {isEquipped ? 'EQUIPPED' : 'INSTALL'}
                              </button>
                            )}
                          </div>
                        );
                      }
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
