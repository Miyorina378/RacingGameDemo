'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GameEngine } from './gameEngine';
import { CARS_DATABASE, CarConfig } from './config/CarDatabase';
import { TRACKS_DATABASE, TrackConfig } from './config/TrackDatabase';
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
  Timer
} from 'lucide-react';
import confetti from 'canvas-confetti';

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
  purchasedToggles: {
    hasABS: false,
    hasESC: false,
    turbo: false
  }
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

  // Handling increases with suspension, weight reduction (lighter is more nimble), and stabilizer levels
  const upgradedHandling = car.handling +
    (suspensionLvl * 0.5) +
    (weightLvl * 0.2) +
    (upgrades.brake?.level * 0.1 || 0);

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

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Synced States with Engine
  const [activeMode, setActiveMode] = useState<'garage' | 'free_roam' | 'license' | 'race' | 'tutorial'>('garage');
  const [tutorialStep, setTutorialStep] = useState<number>(0);
  const [activeCarId, setActiveCarId] = useState<string>('starter');
  const [playerCredits, setPlayerCredits] = useState<number>(500);
  const [hasLicense, setHasLicense] = useState<boolean>(false);
  const [purchasedCars, setPurchasedCars] = useState<string[]>(['starter']);
  const [activeTrackId, setActiveTrackId] = useState<string>('sprint_circuit');

  // Customization
  const [selectedColor, setSelectedColor] = useState<string>('#f43f5e');

  // Real-time HUD States
  const [speed, setSpeed] = useState<number>(0);
  const [rpm, setRpm] = useState<number>(1000);
  const [gear, setGear] = useState<number>(1);
  const [isShifting, setIsShifting] = useState<boolean>(false);
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

  // UI Upgrades State
  const [carUpgrades, setCarUpgrades] = useState<{ [carId: string]: any }>({});

  // UI Tabs
  const [activeGarageTab, setActiveGarageTab] = useState<'paint' | 'dealership' | 'modes' | 'tuning'>('modes');
  const [selectedBrand, setSelectedBrand] = useState<string>('All');

  // Keyboard help modal toggle
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Custom Map Editor States
  const [showEditor, setShowEditor] = useState<boolean>(false);
  const [editorNodes, setEditorNodes] = useState<{ x: number; z: number }[]>([]);
  const [editorTrackName, setEditorTrackName] = useState<string>('Custom Gridway');
  const [editorRoadWidth, setEditorRoadWidth] = useState<number>(18);
  const [editorTimeLimit, setEditorTimeLimit] = useState<number>(45);
  const [editorHasObstacles, setEditorHasObstacles] = useState<boolean>(false);
  const [editorHaveGrass, setEditorHaveGrass] = useState<boolean>(true);
  const [editorGrassWidth, setEditorGrassWidth] = useState<number>(6);
  const [snapToGrid, setSnapToGrid] = useState<number>(10);
  const [editorScale, setEditorScale] = useState<number>(1.0);
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState<number | null>(null);
  const [draggedNodeIndex, setDraggedNodeIndex] = useState<number | null>(null);
  const [editorGridLimit, setEditorGridLimit] = useState<number>(250);
  const editorCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load persistent user data from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCredits = localStorage.getItem('cyberdrive_credits');
      const savedLicense = localStorage.getItem('cyberdrive_license');
      const savedCars = localStorage.getItem('cyberdrive_cars');
      const savedColor = localStorage.getItem('cyberdrive_color');
      const savedActiveCar = localStorage.getItem('cyberdrive_active_car');

      if (savedCredits) setPlayerCredits(parseInt(savedCredits));
      if (savedLicense) setHasLicense(savedLicense === 'true');
      if (savedCars) setPurchasedCars(JSON.parse(savedCars));
      if (savedColor) setSelectedColor(savedColor);
      if (savedActiveCar) setActiveCarId(savedActiveCar);

      const savedUpgrades = localStorage.getItem('cyberdrive_upgrades');
      if (savedUpgrades) {
        try {
          setCarUpgrades(JSON.parse(savedUpgrades));
        } catch (e) { }
      }

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

  // Initialize Game Engine
  useEffect(() => {
    if (!canvasRef.current) return;

    // Callbacks to sync logic from Three.js render loop to React UI state
    const callbacks = {
      onSpeedChange: (s: number) => {
        setSpeed(s);
        if (engineRef.current && engineRef.current.activeMode === 'tutorial') {
          const status = engineRef.current.getTutorialStatus();
          setTutorialStep((prevStep) => {
            if (prevStep === 0 && s > 15) return 1;
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
      onVehicleStatsChange: (s: number, r: number, g: number, shifting: boolean) => {
        setSpeed(s);
        setRpm(r);
        setGear(g);
        setIsShifting(shifting);
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
          }
        }
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
    let initialCarId = activeCarId;
    let initialColor = selectedColor;
    let initialUpgrades = DEFAULT_UPGRADES;

    if (typeof window !== 'undefined') {
      const savedCredits = localStorage.getItem('cyberdrive_credits');
      if (savedCredits) {
        initialCredits = parseInt(savedCredits, 10);
        setPlayerCredits(initialCredits);
      }
      const savedLicense = localStorage.getItem('cyberdrive_license');
      if (savedLicense) {
        initialLicense = savedLicense === 'true';
        setHasLicense(initialLicense);
      }
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
      target[lastKey] = (target[lastKey] || 0) + 1;
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
    if (engineRef.current) {
      engineRef.current.isPaused = false;
      setIsPaused(false);
      engineRef.current.buildOpenWorld();
      setActiveMode('free_roam');
    }
  };

  const startTutorial = () => {
    if (engineRef.current) {
      engineRef.current.isPaused = false;
      setIsPaused(false);
      engineRef.current.buildTutorial();
      setActiveMode('tutorial');
      setTutorialStep(0);
    }
  };

  const startLicenseTest = () => {
    if (engineRef.current) {
      engineRef.current.isPaused = false;
      setIsPaused(false);
      engineRef.current.buildLicenseTest();
      setActiveMode('license');
    }
  };

  const startRace = (trackId: string = 'sprint_circuit') => {
    const track = TRACKS_DATABASE.find(t => t.id === trackId);
    if (!track) return;
    if (track.requiresLicense && !hasLicense) return; // Prevent unauthorized entry

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
  };

  const exitToGarage = () => {
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
      setPrevPlacement(1);
      setPlacementShift(null);
      setRaceResults(null);
    }
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
    nodes: { x: number; z: number }[],
    name: string,
    width: number,
    time: number,
    obstacles: boolean,
    gridLimit: number,
    grass: boolean = editorHaveGrass,
    grassWidth: number = editorGrassWidth
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
        GrassWidth: grassWidth
      };
      localStorage.setItem('cyberdrive_custom_track', JSON.stringify(trackData));
    }
  };

  const importTrack = (text: string) => {
    try {
      const vectorRegex = /(?:THREE\.)?Vector3\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*-?\d+(?:\.\d+)?\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/gi;
      const nodes: { x: number; z: number }[] = [];
      let match;
      while ((match = vectorRegex.exec(text)) !== null) {
        nodes.push({
          x: parseFloat(match[1]),
          z: parseFloat(match[2])
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
            const jsonNodes = parsed.map(n => ({
              x: Number(n.x !== undefined ? n.x : n[0]),
              z: Number(n.z !== undefined ? n.z : n[1])
            }));
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

  const launchTestDrive = () => {
    if (editorNodes.length < 3) return;

    const customTrack: TrackConfig = {
      id: 'custom',
      name: editorTrackName || 'Custom Gridway',
      description: 'Your custom designed track.',
      timeLimit: editorTimeLimit,
      roadWidth: editorRoadWidth,
      hasObstacles: editorHasObstacles,
      requiresLicense: false,
      baseReward: 300,
      path: editorNodes.map(n => new THREE.Vector3(n.x, 2, n.z)),
      HaveCrub: true,
      HaveFence: true,
      HaveGrass: editorHaveGrass,
      GrassWidth: editorGrassWidth
    };

    const existingIdx = TRACKS_DATABASE.findIndex(t => t.id === 'custom');
    if (existingIdx !== -1) {
      TRACKS_DATABASE[existingIdx] = customTrack;
    } else {
      TRACKS_DATABASE.push(customTrack);
    }

    startRace('custom');
    setShowEditor(false);
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear all nodes?")) {
      setEditorNodes([]);
      saveCustomTrack([], editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit);
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

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editorCanvasRef.current) return;
    const canvas = editorCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const zoom = (canvas.width / (editorGridLimit * 2)) * editorScale;

    const gameX = (x - cx) / zoom;
    const gameZ = (y - cy) / zoom;

    let foundIdx = -1;
    for (let i = 0; i < editorNodes.length; i++) {
      const node = editorNodes[i];
      const nodePixelX = cx + node.x * zoom;
      const nodePixelY = cy + node.z * zoom;
      const dist = Math.sqrt((x - nodePixelX) ** 2 + (y - nodePixelY) ** 2);
      if (dist < 12) {
        foundIdx = i;
        break;
      }
    }

    if (foundIdx !== -1) {
      setDraggedNodeIndex(foundIdx);
    } else {
      let finalX = gameX;
      let finalZ = gameZ;
      if (snapToGrid > 0) {
        finalX = Math.round(gameX / snapToGrid) * snapToGrid;
        finalZ = Math.round(gameZ / snapToGrid) * snapToGrid;
      }
      finalX = Math.max(-editorGridLimit, Math.min(editorGridLimit, finalX));
      finalZ = Math.max(-editorGridLimit, Math.min(editorGridLimit, finalZ));

      const newNodes = [...editorNodes, { x: finalX, z: finalZ }];
      setEditorNodes(newNodes);
      saveCustomTrack(newNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editorCanvasRef.current) return;
    const canvas = editorCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const zoom = (canvas.width / (editorGridLimit * 2)) * editorScale;

    const gameX = (x - cx) / zoom;
    const gameZ = (y - cy) / zoom;

    if (draggedNodeIndex !== null) {
      let finalX = gameX;
      let finalZ = gameZ;
      if (snapToGrid > 0) {
        finalX = Math.round(gameX / snapToGrid) * snapToGrid;
        finalZ = Math.round(gameZ / snapToGrid) * snapToGrid;
      }
      finalX = Math.max(-editorGridLimit, Math.min(editorGridLimit, finalX));
      finalZ = Math.max(-editorGridLimit, Math.min(editorGridLimit, finalZ));

      const newNodes = [...editorNodes];
      newNodes[draggedNodeIndex] = { x: finalX, z: finalZ };
      setEditorNodes(newNodes);
    } else {
      let hoveredIdx: number | null = null;
      for (let i = 0; i < editorNodes.length; i++) {
        const node = editorNodes[i];
        const nodePixelX = cx + node.x * zoom;
        const nodePixelY = cy + node.z * zoom;
        const dist = Math.sqrt((x - nodePixelX) ** 2 + (y - nodePixelY) ** 2);
        if (dist < 12) {
          hoveredIdx = i;
          break;
        }
      }
      setHoveredNodeIndex(hoveredIdx);
    }
  };

  const handleCanvasMouseUp = () => {
    if (draggedNodeIndex !== null) {
      saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit);
      setDraggedNodeIndex(null);
    }
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editorCanvasRef.current) return;
    const canvas = editorCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const zoom = (canvas.width / (editorGridLimit * 2)) * editorScale;

    let foundIdx = -1;
    for (let i = 0; i < editorNodes.length; i++) {
      const node = editorNodes[i];
      const nodePixelX = cx + node.x * zoom;
      const nodePixelY = cy + node.z * zoom;
      const dist = Math.sqrt((x - nodePixelX) ** 2 + (y - nodePixelY) ** 2);
      if (dist < 12) {
        foundIdx = i;
        break;
      }
    }

    if (foundIdx !== -1) {
      const newNodes = editorNodes.filter((_, idx) => idx !== foundIdx);
      setEditorNodes(newNodes);
      setHoveredNodeIndex(null);
      setDraggedNodeIndex(null);
      saveCustomTrack(newNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit);
    }
  };

  // Canvas drawing effect
  useEffect(() => {
    if (!showEditor || !editorCanvasRef.current) return;
    const canvas = editorCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const zoom = (width / (editorGridLimit * 2)) * editorScale;

    const gameToPixel = (pt: { x: number, z: number }) => ({
      x: cx + pt.x * zoom,
      y: cy + pt.z * zoom
    });

    // 1. Draw Grid Lines
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.05)';
    ctx.lineWidth = 1;
    const maxGameCoord = editorGridLimit / editorScale;

    const gridSpacing = editorGridLimit === 3000 ? 300 : (editorGridLimit === 2000 ? 200 : (editorGridLimit === 1000 ? 100 : (editorGridLimit === 500 ? 50 : 25)));
    const labelSpacing = gridSpacing * 2;

    for (let g = -Math.floor(maxGameCoord); g <= Math.floor(maxGameCoord); g += gridSpacing) {
      const p1 = gameToPixel({ x: g, z: -maxGameCoord });
      const p2 = gameToPixel({ x: g, z: maxGameCoord });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const h1 = gameToPixel({ x: -maxGameCoord, z: g });
      const h2 = gameToPixel({ x: maxGameCoord, z: g });
      ctx.beginPath();
      ctx.moveTo(h1.x, h1.y);
      ctx.lineTo(h2.x, h2.y);
      ctx.stroke();

      if (g % labelSpacing === 0 && g !== 0) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.font = '9px monospace';

        const xPos = gameToPixel({ x: g, z: 5 / editorScale });
        ctx.fillText(`${g}m`, xPos.x - 10, xPos.y);

        const zPos = gameToPixel({ x: 5 / editorScale, z: g });
        ctx.fillText(`${g}m`, zPos.x, zPos.y + 3);
      }
    }

    ctx.strokeStyle = 'rgba(168, 85, 247, 0.2)';
    ctx.lineWidth = 1.5;

    const ax1 = gameToPixel({ x: -maxGameCoord, z: 0 });
    const ax2 = gameToPixel({ x: maxGameCoord, z: 0 });
    ctx.beginPath();
    ctx.moveTo(ax1.x, ax1.y);
    ctx.lineTo(ax2.x, ax2.y);
    ctx.stroke();

    const az1 = gameToPixel({ x: 0, z: -maxGameCoord });
    const az2 = gameToPixel({ x: 0, z: maxGameCoord });
    ctx.beginPath();
    ctx.moveTo(az1.x, az1.y);
    ctx.lineTo(az2.x, az2.y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(168, 85, 247, 0.5)';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // 2. Draw road path (Closed loop connect lines)
    if (editorNodes.length > 0) {
      ctx.beginPath();
      const p0 = gameToPixel(editorNodes[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < editorNodes.length; i++) {
        const pi = gameToPixel(editorNodes[i]);
        ctx.lineTo(pi.x, pi.y);
      }
      ctx.closePath();

      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#e2f8ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#06b6d4';
      for (let i = 0; i < editorNodes.length; i++) {
        const current = editorNodes[i];
        const next = editorNodes[(i + 1) % editorNodes.length];

        const midX = (current.x + next.x) / 2;
        const midZ = (current.z + next.z) / 2;
        const midPixel = gameToPixel({ x: midX, z: midZ });

        const angle = Math.atan2(next.z - current.z, next.x - current.x);

        ctx.save();
        ctx.translate(midPixel.x, midPixel.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-6, -4);
        ctx.lineTo(6, 0);
        ctx.lineTo(-6, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      if (editorNodes.length > 1) {
        const startPt = editorNodes[0];
        const nextPt = editorNodes[1];
        const startPixel = gameToPixel(startPt);

        const dx = nextPt.x - startPt.x;
        const dz = nextPt.z - startPt.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0.001) {
          const tx = dx / len;
          const tz = dz / len;
          const nx = -tz;
          const nz = tx;

          const rWidthPixel = (editorRoadWidth / 2) * zoom;
          const leftLine = { x: startPixel.x + nx * rWidthPixel, y: startPixel.y + nz * rWidthPixel };
          const rightLine = { x: startPixel.x - nx * rWidthPixel, y: startPixel.y - nz * rWidthPixel };

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(leftLine.x, leftLine.y);
          ctx.lineTo(rightLine.x, rightLine.y);
          ctx.stroke();

          ctx.save();
          ctx.translate(startPixel.x, startPixel.y);
          ctx.rotate(Math.atan2(dz, dx));
          ctx.fillStyle = '#10b981';
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(12, 0);
          ctx.lineTo(2, -6);
          ctx.lineTo(2, -2);
          ctx.lineTo(-12, -2);
          ctx.lineTo(-12, 2);
          ctx.lineTo(2, 2);
          ctx.lineTo(2, 6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      editorNodes.forEach((node, idx) => {
        const pixel = gameToPixel(node);
        const isHovered = hoveredNodeIndex === idx;
        const isStart = idx === 0;

        ctx.beginPath();
        const nodeRadius = isHovered ? 8 : 6;
        ctx.arc(pixel.x, pixel.y, nodeRadius, 0, Math.PI * 2);

        if (isStart) {
          ctx.fillStyle = '#10b981';
          ctx.strokeStyle = '#e6fffa';
          ctx.shadowColor = '#10b981';
        } else if (isHovered) {
          ctx.fillStyle = '#d946ef';
          ctx.strokeStyle = '#ffffff';
          ctx.shadowColor = '#d946ef';
        } else {
          ctx.fillStyle = '#06b6d4';
          ctx.strokeStyle = '#bffffc';
          ctx.shadowColor = '#06b6d4';
        }

        ctx.shadowBlur = isHovered ? 12 : 6;
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(idx.toString(), pixel.x - 3, pixel.y - 10);
      });
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px monospace';
    ctx.fillText('Click to add node | Drag to move | Double-click to delete', 15, height - 15);
  }, [editorNodes, editorScale, hoveredNodeIndex, editorRoadWidth, showEditor]);

  useEffect(() => {
    if (showEditor) {
      const txtarea = document.getElementById('import-export-textarea') as HTMLTextAreaElement;
      if (txtarea) {
        txtarea.value = editorNodes.map(n => `new THREE.Vector3(${Math.round(n.x)}, 2, ${Math.round(n.z)})`).join(',\n');
      }
    }
  }, [editorNodes, showEditor]);

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

      // Find boundaries of the track to scale and center it
      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      path.forEach(pt => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.z < minZ) minZ = pt.z;
        if (pt.z > maxZ) maxZ = pt.z;
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
      ctx.moveTo(mapX(path[0].x), mapZ(path[0].z));
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(mapX(path[i].x), mapZ(path[i].z));
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

  return (
    <div className="relative w-screen h-screen overflow-hidden font-sans text-white select-none bg-slate-950">
      {/* 3D Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Top Middle HUD Timer */}
      {(activeMode === 'license') && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto z-20">
          <div className={`bg-slate-950/80 border backdrop-blur-md px-6 py-2.5 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] flex flex-col items-center min-w-[120px] transition-colors ${timeRemaining <= 7 ? 'border-rose-600 shadow-[0_0_20px_rgba(244,63,94,0.35)] animate-pulse' : 'border-slate-800'
            }`}>
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              Time Limit
            </span>
            <span className={`text-3xl font-black font-mono tracking-wider ${timeRemaining <= 7 ? 'text-rose-500' : 'text-white'
              }`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
        </div>
      )}

      {/* Top Middle HUD Timer for Race Mode (Current Lap Timer) */}
      {activeMode === 'race' && (gameStatus === 'playing' || gameStatus === 'success') && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto z-20">
          <div className="bg-slate-950/80 border border-slate-800 backdrop-blur-md px-6 py-2.5 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] flex flex-col items-center min-w-[120px]">
            <span className="text-slate-400 text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-0.5">
              LAP TIMER
            </span>
            <span className="text-3xl font-black font-mono tracking-wider text-white">
              {formatTime(currentLapTime)}
            </span>
          </div>
        </div>
      )}

      {/* TOP HEADER: Credits & HUD values */}
      <div className="absolute top-6 inset-x-6 flex items-start justify-between pointer-events-none z-10">
        {/* Left Side: Game Logo, Credits, and Lap/Length in race mode */}
        <div className="flex flex-col gap-3 pointer-events-auto">
          {activeMode === 'garage' && (
            <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-3 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
              <div className="flex items-center gap-2" onClick={cheatCredits} title="Double-click to get test credits!">
                <Coins className="w-5 h-5 text-yellow-400 cursor-pointer hover:scale-110 transition-transform" />
                <span className="font-mono font-bold text-yellow-400 text-lg">
                  {playerCredits.toLocaleString()} <span className="text-xs">CR</span>
                </span>
              </div>
              {hasLicense && (
                <>
                  <div className="h-4 w-px bg-slate-800" />
                  <div className="flex items-center gap-1.5 bg-cyan-950/50 border border-cyan-800/80 px-2 py-0.5 rounded-md">
                    <Award className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
                      A-License
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Move lap and length to there instead (top left) */}
          {(activeMode === 'license' || activeMode === 'race') && (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center gap-4">
                {/* Checkpoint counters */}
                <div className="flex items-baseline gap-1 select-none">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2 leading-none">
                    {activeMode === 'race' ? 'LAP' : 'GATE'}
                  </span>
                  <span className="text-4xl font-black text-white font-mono leading-none tracking-tight">
                    {checkpointIndex}
                  </span>
                  <span className="text-slate-500 text-sm font-bold font-mono leading-none">
                    /{totalCheckpoints}
                  </span>
                </div>

                {/* Track length */}
                {(() => {
                  const activeTrack = TRACKS_DATABASE.find(t => t.id === activeTrackId);
                  const trackLength = activeTrack ? getTrackLength(activeTrack.path) : 0;
                  if (trackLength <= 0) return null;
                  return (
                    <div className="bg-slate-950/60 border border-slate-800/60 px-3 py-1 rounded-xl shadow-[0_0_10px_rgba(0,0,0,0.35)] flex items-center gap-2">
                      <span className="text-slate-500 text-[8px] font-extrabold uppercase tracking-wider leading-none">Length</span>
                      <span className="text-xs font-mono font-bold text-cyan-400 leading-none">
                        {formatDistance(trackLength)}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Minimap canvas rendering directly below */}
              <div className="w-40 h-40 bg-slate-950/40 backdrop-blur-md rounded-2xl overflow-hidden border border-slate-800/80 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                <canvas 
                  ref={minimapCanvasRef} 
                  width={160} 
                  height={160} 
                  className="w-full h-full"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Options / Reset */}
        <div className="flex flex-col items-end gap-2.5 pointer-events-auto">
          <div className="flex items-center gap-3">
            {activeMode === 'race' && (
              <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-2.5 shadow-[0_0_15px_rgba(0,0,0,0.5)] select-none overflow-hidden relative">
                <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                    POS
                  </span>
                  <div className="flex items-baseline gap-0.5 h-5 overflow-hidden">
                    <span
                      key={placement}
                      className={`text-base font-black leading-none bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent font-mono transition-transform duration-300 ${placementShift === 'up'
                        ? 'animate-slideUp'
                        : placementShift === 'down'
                          ? 'animate-slideDown'
                          : ''
                        }`}
                    >
                      {placement === 1 ? '1st' : placement === 2 ? '2nd' : placement === 3 ? '3rd' : `${placement}th`}
                    </span>
                    <span className="text-slate-500 text-[10px] font-bold font-mono">/ {totalParticipants}</span>
                  </div>
                </div>
                {placementShift && (
                  <div className={`absolute inset-0 pointer-events-none opacity-15 blur-sm transition-colors duration-500 ${placementShift === 'up' ? 'bg-cyan-500' : 'bg-rose-500'
                    }`} />
                )}
              </div>
            )}

            {/* Hide reset, help, sound, exit in gameplay modes since they are in the ESC pause menu instead */}
            {activeMode === 'garage' && (
              <>
                <button
                  onClick={() => setShowHelp(!showHelp)}
                  className="bg-slate-900/85 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white p-2.5 rounded-xl transition-all"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>

                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="bg-slate-900/85 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white p-2.5 rounded-xl transition-all"
                >
                  {soundEnabled ? <Volume2 className="w-5 h-5 text-cyan-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
                </button>
              </>
            )}
          </div>

          {/* Time & Best Lap stats block directly below/next to POS in driving mode */}
          {activeMode !== 'garage' && (
            <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-xl flex flex-col gap-2 shadow-[0_0_15px_rgba(0,0,0,0.5)] min-w-[150px] select-none">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Time</span>
                </div>
                <span className="text-sm font-bold font-mono text-white">
                  {formatTime(activeMode === 'race' ? totalRaceTime : timeRemaining)}
                </span>
              </div>
              {activeMode === 'race' && (
                <>
                  <div className="h-px bg-slate-800" />
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Best</span>
                    </div>
                    <span className="text-sm font-bold font-mono text-pink-500">
                      {bestLapTime === Infinity ? '--:--.---' : formatTime(bestLapTime)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* DRIVING HUD: Speedometer, Timers, Checkpoints, Drift */}
      {activeMode !== 'garage' && (
        <div className="absolute inset-0 pointer-events-none z-0 flex flex-col justify-between p-6">
          {/* Top Center: Tutorial Step HUD */}
          {activeMode === 'tutorial' && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-pink-500/40 backdrop-blur-md px-6 py-4 rounded-2xl shadow-[0_0_25px_rgba(236,72,153,0.25)] text-center max-w-md w-full pointer-events-auto flex flex-col gap-2 z-20">
              <span className="text-[10px] font-extrabold tracking-widest text-pink-400 uppercase">Interactive Driver Training</span>
              <h3 className="font-extrabold text-sm text-slate-100">
                {tutorialStep === 0 && "Step 1/5: Hold 'W' or 'Up Arrow' to accelerate forward"}
                {tutorialStep === 1 && "Step 2/5: Great job! Now press 'A' or 'D' to steer"}
                {tutorialStep === 2 && "Step 3/5: Feel the steering! Now speed up and hold Spacebar while turning to drift"}
                {tutorialStep === 3 && "Step 4/5: Excellent drift! Drive straight over the glowing ramp ahead to jump"}
                {tutorialStep === 4 && "Step 5/5: Soft landing! Drive into the golden crystal ahead to finish your training"}
                {tutorialStep === 5 && "Congratulations! You have completed the training. Exit to showroom or try again!"}
              </h3>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full bg-pink-500 transition-all duration-300"
                  style={{ width: `${(tutorialStep / 5) * 100}%` }}
                />
              </div>
            </div>
          )}
          {/* Middle: Drift Score Notification */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {driftScore > 0 && (
              <div className="bg-slate-950/60 border border-pink-500/30 backdrop-blur-sm px-6 py-3 rounded-2xl flex flex-col items-center shadow-[0_0_30px_rgba(217,70,239,0.2)] animate-pulse">
                <span className="text-pink-400 font-bold tracking-widest text-xs uppercase">
                  Drifting
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-white font-mono">
                    {driftScore}
                  </span>
                  <span className="text-pink-400 font-extrabold text-2xl font-mono">
                    x{driftMultiplier}
                  </span>
                </div>
                <span className="text-pink-500 text-xs font-bold mt-0.5">
                  {(driftScore * driftMultiplier).toLocaleString()} pts
                </span>
              </div>
            )}

            {recentDriftGain > 0 && (
              <div className="bg-yellow-950/60 border border-yellow-500/30 backdrop-blur-sm px-4 py-2 rounded-xl flex items-center gap-2 shadow-[0_0_20px_rgba(234,179,8,0.25)] animate-bounce mt-4">
                <Coins className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-400 font-bold font-mono">
                  +{recentDriftGain} CR EARNED
                </span>
              </div>
            )}
          </div>

          {/* Bottom HUD: Speed, Timer, Checkpoint Progress */}
          <div className="w-full flex items-end justify-between">
            {/* Speedometer & Transmission HUD */}
            <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800 p-5 rounded-2xl shadow-[0_0_25px_rgba(0,0,0,0.5)] flex flex-col items-center min-w-[180px] pointer-events-auto">
              <div className="flex items-center gap-4 mt-1">
                <div className="flex flex-col items-center min-w-[36px]">
                  <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">Gear</span>
                  <span className={`text-3xl font-black font-mono mt-1 transition-all duration-150 ${isShifting ? 'text-slate-600 scale-95' : 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]'}`}>
                    {speed === 0 ? 'N' : (speed < 0 ? 'R' : gear)}
                  </span>
                </div>
                <div className="h-10 w-px bg-slate-800" />
                <div className="flex flex-col items-center">
                  <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">Speed</span>
                  <div className="flex items-baseline gap-0.5 mt-0.5">
                    <span className="text-4xl font-black font-mono tracking-tight bg-gradient-to-b from-white to-slate-300 bg-clip-text text-transparent">
                      {speed}
                    </span>
                    <span className="text-slate-400 font-bold text-[10px]">KM/H</span>
                  </div>
                </div>
              </div>

              {/* Real RPM indicator bar */}
              <div className="w-full flex justify-between items-center mt-3 px-1 text-[8px] text-slate-500 font-mono">
                <span>1K RPM</span>
                <span className={rpm > 5500 ? 'text-rose-400 font-bold animate-pulse' : ''}>
                  {rpm > 5500 ? 'LIMITER' : `${Math.round(rpm)}`}
                </span>
                <span className="text-rose-500 font-bold">6.5K REDLINE</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full mt-1 overflow-hidden border border-slate-700/50">
                <div
                  className={`h-full transition-all duration-75 ${rpm > 5500 ? 'bg-gradient-to-r from-red-500 to-rose-600 animate-pulse' : 'bg-gradient-to-r from-cyan-400 via-indigo-500 to-pink-500'
                    }`}
                  style={{ width: `${Math.min(100, (rpm / 6500) * 100)}%` }}
                />
              </div>
            </div>


          </div>
        </div>
      )}

      {/* GAMEPLAY OVERLAYS: Countdown, Success, Failed */}
      {gameStatus !== 'idle' && gameStatus !== 'playing' && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm z-30 flex items-center justify-center p-6">
          {/* Countdown timer */}
          {gameStatus === 'countdown' && (
            <div className="text-center animate-scaleIn">
              <span className="text-7xl md:text-9xl font-black tracking-widest italic bg-gradient-to-r from-cyan-400 via-pink-500 to-yellow-400 bg-clip-text text-transparent">
                {statusMessage}
              </span>
            </div>
          )}

          {/* Success screen */}
          {gameStatus === 'success' && (
            activeMode === 'race' && raceResults ? (
              <div className="flex flex-col items-center max-w-2xl w-full">
                {/* Staggered F I N I S H letters */}
                <div className="flex justify-center gap-2.5 md:gap-4 mb-8">
                  {['F', 'I', 'N', 'I', 'S', 'H'].map((char, index) => (
                    <span
                      key={index}
                      className="text-5xl md:text-7xl font-black tracking-widest italic bg-gradient-to-r from-cyan-400 via-pink-500 to-yellow-400 bg-clip-text text-transparent animate-slideUp inline-block"
                      style={{
                        animationDelay: `${index * 0.25}s`,
                        animationFillMode: 'both',
                        display: 'inline-block'
                      }}
                    >
                      {char}
                    </span>
                  ))}
                </div>

                {/* Sliding results table container */}
                <div
                  className="animate-slideUp w-full p-4"
                  style={{
                    animationDelay: '1.75s',
                    animationFillMode: 'both'
                  }}
                >
                  <h3 className="text-2xl font-black text-slate-100 uppercase tracking-widest mb-6 text-center bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
                    Race Standings
                  </h3>

                  <div className="overflow-hidden rounded-xl border border-slate-800/30 bg-slate-950/30">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-sm uppercase tracking-wider text-slate-400 font-bold bg-slate-950/80">
                          <th className="py-4 px-5">pos.</th>
                          <th className="py-4 px-5">car.</th>
                          <th className="py-4 px-5 text-right">time.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {raceResults.map((result, idx) => (
                          <tr
                            key={idx}
                            className={`border-b border-slate-900/30 text-base font-semibold transition-colors ${result.isPlayer
                              ? 'bg-cyan-500/10 text-cyan-400 border-l-2 border-l-cyan-400 font-bold font-mono'
                              : 'text-slate-300 font-mono'
                              }`}
                          >
                            <td className="py-4 px-5">
                              {result.pos === 1 ? '1st' : result.pos === 2 ? '2nd' : result.pos === 3 ? '3rd' : `${result.pos}th`}
                            </td>
                            <td className="py-4 px-5">
                              {result.isPlayer ? (
                                <span className="flex items-center gap-2">
                                  {result.car}
                                  <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider">YOU</span>
                                </span>
                              ) : (
                                <span>{result.car}</span>
                              )}
                            </td>
                            <td className="py-4 px-5 text-right font-mono">
                              {formatResultTime(result.time)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Credit Reward Info */}
                  <div className="flex items-center justify-between bg-yellow-950/40 border border-yellow-800/50 rounded-2xl px-5 py-4 mt-6">
                    <span className="text-sm font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Coins className="w-4.5 h-4.5" /> Credits Reward
                    </span>
                    <span className="text-lg font-black font-mono text-yellow-400">
                      +{placement === 1 ? '1,000' : placement === 2 ? '600' : placement === 3 ? '300' : placement === 4 ? '150' : placement === 5 ? '100' : '50'} CR
                    </span>
                  </div>

                  {/* Action link */}
                  <div className="mt-8 flex justify-center">
                    <button
                      onClick={exitToGarage}
                      className="text-slate-400 hover:text-cyan-400 font-mono text-base tracking-wider transition-colors duration-200 hover:underline cursor-pointer bg-transparent border-0 outline-none flex items-center gap-1"
                    >
                      return to garage -&gt;
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // Default success screen (License / Tutorial)
              <div className="bg-slate-900/90 border border-emerald-500/40 p-8 rounded-3xl max-w-md w-full shadow-[0_0_50px_rgba(16,185,129,0.25)] text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-800/80 mx-auto flex items-center justify-center mb-4">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-3xl font-black italic text-emerald-400 tracking-wider">
                  COMPLETED
                </h2>
                <p className="text-slate-300 font-medium text-sm mt-3 px-2">
                  {statusMessage}
                </p>

                <div className="mt-8 flex flex-col gap-3">
                  <button
                    onClick={() => {
                      if (activeMode === 'license') startLicenseTest();
                      else if (activeMode === 'race') startRace(activeTrackId);
                      else if (activeMode === 'tutorial') startTutorial();
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                  >
                    Retry Challenge
                  </button>
                  <button
                    onClick={exitToGarage}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-3 px-6 rounded-xl transition-all"
                  >
                    Return to Garage
                  </button>
                </div>
              </div>
            )
          )}

          {/* Failed screen */}
          {gameStatus === 'failed' && (
            <div className="bg-slate-900/90 border border-rose-500/40 p-8 rounded-3xl max-w-md w-full shadow-[0_0_50px_rgba(244,63,94,0.25)] text-center">
              <div className="w-16 h-16 rounded-full bg-rose-950/80 border border-rose-800/80 mx-auto flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-rose-400" />
              </div>
              <h2 className="text-3xl font-black italic text-rose-500 tracking-wider">
                CHALLENGE FAILED
              </h2>
              <p className="text-slate-300 font-medium text-sm mt-3 px-2">
                {statusMessage}
              </p>

              <div className="mt-8 flex flex-col gap-3">
                <button
                  onClick={() => {
                    if (activeMode === 'license') startLicenseTest();
                    else if (activeMode === 'race') startRace(activeTrackId);
                    else if (activeMode === 'tutorial') startTutorial();
                    else exitToGarage();
                  }}
                  className="bg-rose-600 hover:bg-rose-500 border border-rose-500 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)] hover:shadow-[0_0_20px_rgba(244,63,94,0.5)]"
                >
                  Try Again
                </button>
                <button
                  onClick={exitToGarage}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-3 px-6 rounded-xl transition-all"
                >
                  Return to Garage
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MAIN GARAGE INTERFACE (When in Garage) */}
      {activeMode === 'garage' && (
        <div className="absolute inset-y-0 right-0 w-full md:w-[420px] bg-slate-950/85 backdrop-blur-xl border-l border-slate-900 shadow-2xl p-6 flex flex-col justify-between z-10">

          {/* Garage Header */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-pink-950/60 border border-pink-900/60">
                <Wrench className="w-5 h-5 text-pink-400" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-widest text-slate-100 uppercase">
                  CYBER SHOWROOM
                </h1>
                <p className="text-xs font-semibold text-slate-400">
                  Inspect and upgrade your fleet
                </p>
              </div>
            </div>

            {/* Mode selection tabs */}
            <div className="grid grid-cols-4 gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80 mt-5">
              <button
                onClick={() => setActiveGarageTab('modes')}
                className={`py-2 px-1 text-[11px] font-bold rounded-lg transition-all ${activeGarageTab === 'modes'
                  ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/25'
                  : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                Modes
              </button>
              <button
                onClick={() => setActiveGarageTab('dealership')}
                className={`py-2 px-1 text-[11px] font-bold rounded-lg transition-all ${activeGarageTab === 'dealership'
                  ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/25'
                  : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                Dealer
              </button>
              <button
                onClick={() => setActiveGarageTab('paint')}
                className={`py-2 px-1 text-[11px] font-bold rounded-lg transition-all ${activeGarageTab === 'paint'
                  ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/25'
                  : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                Paint
              </button>
              <button
                onClick={() => setActiveGarageTab('tuning')}
                className={`py-2 px-1 text-[11px] font-bold rounded-lg transition-all ${activeGarageTab === 'tuning'
                  ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/25'
                  : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                Tuning
              </button>
            </div>
          </div>

          {/* Garage Tab Content Section (Scrollable) */}
          <div className="flex-1 my-6 overflow-y-auto pr-1">

            {/* TAB: DRIVING MODES */}
            {activeGarageTab === 'modes' && (
              <div className="flex flex-col gap-4 animate-fadeIn">
                {/* 0. Interactive Tutorial */}
                <div className="group bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition-all duration-200 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-pink-950/60 border border-pink-900/60 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <HelpCircle className="w-5 h-5 text-pink-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-100">Driving School</h3>
                        <span className="text-[10px] font-bold text-pink-400 tracking-wider uppercase">Interactive Tutorial</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Learn the basic driving controls step-by-step. Master acceleration, steering, drifting, and launching off jumps! Rewards +200 Credits.
                  </p>
                  <button
                    onClick={startTutorial}
                    className="w-full bg-pink-600 hover:bg-pink-500 border border-pink-500 py-2.5 rounded-xl text-xs font-bold shadow-[0_0_15px_rgba(236,72,153,0.2)] hover:shadow-[0_0_20px_rgba(236,72,153,0.4)] transition-all mt-2"
                  >
                    Start Training
                  </button>
                </div>

                {/* 1. Free Roam */}
                <div className="group bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition-all duration-200 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-900/60 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Compass className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-100">Free Roam</h3>
                        <span className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase">Open World</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Test your driving skills in a neon playground. Jump off ramps, collect score crystals, and test your drift capabilities to earn extra credits.
                  </p>
                  <button
                    onClick={startFreeRoam}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 border border-cyan-500 py-2.5 rounded-xl text-xs font-bold shadow-[0_0_15px_rgba(6,182,212,0.2)] hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all mt-2"
                  >
                    Enter Open World
                  </button>
                </div>

                {/* 2. License Trial */}
                <div className="group bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition-all duration-200 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-yellow-950/60 border border-yellow-900/60 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Award className="w-5 h-5 text-yellow-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-100">License A-Test</h3>
                        <span className="text-[10px] font-bold text-yellow-400 tracking-wider uppercase">Time Trial</span>
                      </div>
                    </div>
                    {hasLicense && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900 px-2 py-0.5 rounded">Passed</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Pass through all {11} checkpoint rings in order within 35 seconds. Unlocks the high-speed Pro Hypercar Race. Rewards 500 Credits.
                  </p>
                  <button
                    onClick={startLicenseTest}
                    className="w-full bg-yellow-600 hover:bg-yellow-500 border border-yellow-500 py-2.5 rounded-xl text-xs font-bold shadow-[0_0_15px_rgba(234,179,8,0.2)] hover:shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-all mt-2"
                  >
                    Start License Test
                  </button>
                </div>

                {/* 2.5 Custom Track Editor trigger panel */}
                <div className="group bg-gradient-to-br from-slate-900/80 to-purple-950/40 border border-purple-900/50 hover:border-purple-500/50 p-4 rounded-2xl transition-all duration-200 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-900/60 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Map className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-100">Custom Map Editor</h3>
                        <span className="text-[10px] font-bold text-purple-400 tracking-wider uppercase">Interactive Grid</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Visually design custom racetracks. Place/drag nodes, adjust road width, add obstacles, and test-drive instantly with AI!
                  </p>
                  <button
                    onClick={() => setShowEditor(true)}
                    className="w-full bg-purple-600 hover:bg-purple-500 border border-purple-500 py-2.5 rounded-xl text-xs font-bold shadow-[0_0_15px_rgba(168,85,247,0.2)] hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all mt-2 cursor-pointer"
                  >
                    Open Map Editor
                  </button>
                </div>

                {/* 3. Races Grid */}
                <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl flex flex-col gap-3">
                  <span className="text-[10px] font-bold text-pink-400 tracking-widest uppercase">Circuit Racing</span>

                  <div className="grid grid-cols-1 gap-3">
                    {TRACKS_DATABASE.filter(t => t.id !== 'license' && t.id !== 'custom').map((track) => {
                      const isLocked = track.requiresLicense && !hasLicense;
                      const length = getTrackLength(track.path);
                      return (
                        <div key={track.id} className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm">{track.name}</h4>
                              {isLocked && <Lock className="w-3.5 h-3.5 text-slate-500" />}
                            </div>
                            <div className="flex flex-col items-end">
                              <span className={`text-[10px] font-mono ${!isLocked ? 'text-cyan-400' : 'text-slate-500'}`}>
                                Up to +1000 CR
                              </span>
                              <span className="text-[9px] font-mono text-slate-500">
                                {formatDistance(length)}
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            {track.description}
                          </p>
                          <button
                            disabled={isLocked}
                            onClick={() => startRace(track.id)}
                            className={`w-full py-2 rounded-xl text-xs font-bold transition-all mt-1 ${!isLocked
                              ? 'bg-pink-600 hover:bg-pink-500 border border-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.25)] hover:shadow-[0_0_15px_rgba(236,72,153,0.45)]'
                              : 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                              }`}
                          >
                            {!isLocked ? `Enter ${track.name}` : 'Requires A-License'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: DEALERSHIP */}
            {activeGarageTab === 'dealership' && (
              <div className="flex flex-col gap-4 animate-fadeIn">
                {/* Brand Filter Tab Row */}
                <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                  {['All', 'Toyota', 'Ford', 'Nissan', 'Tesla', 'Porsche', 'Ferrari', 'Audi', 'Chevrolet'].map((brand) => (
                    <button
                      key={brand}
                      onClick={() => setSelectedBrand(brand)}
                      className={`px-3 py-1.5 text-[10px] font-bold rounded-lg whitespace-nowrap transition-all border ${selectedBrand === brand
                        ? 'bg-pink-600 border-pink-500 text-white shadow-md shadow-pink-600/25'
                        : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:text-slate-200'
                        }`}
                    >
                      {brand}
                    </button>
                  ))}
                </div>

                {CARS_DATABASE
                  .filter((car) => selectedBrand === 'All' || car.brand === selectedBrand)
                  .map((car) => {
                    const isUnlocked = purchasedCars.includes(car.id);
                    const isActive = activeCarId === car.id;
                    const canAfford = playerCredits >= car.price;
                    const isSuperLocked = car.requiresLicense && !hasLicense;

                    return (
                      <div
                        key={car.id}
                        className={`border p-4 rounded-2xl transition-all flex flex-col gap-3 ${isActive
                          ? 'bg-slate-900 border-pink-500/80 shadow-[0_0_15px_rgba(236,72,153,0.15)]'
                          : 'bg-slate-900/60 border-slate-800'
                          }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold text-slate-100">{car.brand} {car.name}</h3>
                            <span
                              className="text-[10px] font-bold tracking-wider uppercase"
                              style={{ color: car.color }}
                            >
                              {car.tier}
                            </span>
                          </div>
                          {isUnlocked ? (
                            <span className="text-[10px] font-bold text-pink-400 bg-pink-950/40 border border-pink-900 px-2 py-0.5 rounded">Owned</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Coins className="w-3.5 h-3.5 text-yellow-400" />
                              <span className="text-xs font-mono font-bold text-yellow-400">{car.price} Cr</span>
                            </div>
                          )}
                        </div>

                        {/* Spec bar-graphs */}
                        {(() => {
                          const upgradesForCar = getCarUpgrades(car.id);
                          const upgradedStats = getUpgradedStats(car, upgradesForCar);
                          return (
                            <div className="flex flex-col gap-1.5 mt-1 bg-slate-950/50 p-3 rounded-xl border border-slate-800/40">
                              {/* Speed */}
                              <div>
                                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-0.5">
                                  <span>TOP SPEED</span>
                                  <span>{Math.round(upgradedStats.speed * 10)}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                                  <div className="absolute left-0 top-0 h-full bg-pink-500 transition-all duration-300" style={{ width: `${Math.min(100, upgradedStats.speed * 10)}%` }} />
                                  <div className="absolute left-0 top-0 h-full bg-cyan-500 transition-all duration-300" style={{ width: `${Math.min(100, car.speed * 10)}%` }} />
                                </div>
                              </div>
                              {/* Acceleration */}
                              <div>
                                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-0.5">
                                  <span>ACCELERATION</span>
                                  <span>{Math.round(upgradedStats.acceleration * 10)}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                                  <div className="absolute left-0 top-0 h-full bg-pink-500 transition-all duration-300" style={{ width: `${Math.min(100, upgradedStats.acceleration * 10)}%` }} />
                                  <div className="absolute left-0 top-0 h-full bg-cyan-500 transition-all duration-300" style={{ width: `${Math.min(100, car.acceleration * 10)}%` }} />
                                </div>
                              </div>
                              {/* Handling */}
                              <div>
                                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-0.5">
                                  <span>HANDLING</span>
                                  <span>{Math.round(upgradedStats.handling * 10)}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                                  <div className="absolute left-0 top-0 h-full bg-pink-500 transition-all duration-300" style={{ width: `${Math.min(100, upgradedStats.handling * 10)}%` }} />
                                  <div className="absolute left-0 top-0 h-full bg-cyan-500 transition-all duration-300" style={{ width: `${Math.min(100, car.handling * 10)}%` }} />
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
                            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${isActive
                              ? 'bg-slate-950 border border-slate-800 text-slate-500 cursor-default'
                              : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200'
                              }`}
                          >
                            {isActive ? 'Active Vehicle' : 'Select Vehicle'}
                          </button>
                        ) : (
                          <button
                            disabled={!canAfford || isSuperLocked}
                            onClick={() => buyCar(car)}
                            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${isSuperLocked
                              ? 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                              : canAfford
                                ? 'bg-yellow-600 hover:bg-yellow-500 border border-yellow-500 text-white shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                                : 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                              }`}
                          >
                            {isSuperLocked
                              ? 'Requires A-License'
                              : canAfford
                                ? `Purchase Vehicle (-${car.price} CR)`
                                : 'Insufficient Credits'}
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {/* TAB: PAINT SHOP */}
            {activeGarageTab === 'paint' && (
              <div className="flex flex-col gap-4 animate-fadeIn">
                <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Paintbrush className="w-4 h-4 text-pink-400" />
                    <span className="text-xs font-bold text-slate-300 uppercase">Body Paint Color</span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Select a custom paint finish for your active cyber car. Applied immediately to the 3D showcase stand.
                  </p>

                  <div className="grid grid-cols-4 gap-3 mt-2">
                    {PAINT_SWATCHES.map((swatch) => {
                      const isSelected = selectedColor === swatch.hex;
                      return (
                        <button
                          key={swatch.name}
                          onClick={() => changeCarColor(swatch.hex)}
                          className={`group relative w-12 h-12 rounded-xl flex items-center justify-center border hover:scale-105 transition-all ${isSelected
                            ? 'border-white ring-2 ring-pink-500 ring-offset-2 ring-offset-slate-950'
                            : 'border-slate-800'
                            }`}
                          style={{ backgroundColor: swatch.hex }}
                          title={swatch.name}
                        >
                          {isSelected && <Check className="w-5 h-5 text-white filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: PERFORMANCE TUNING */}
            {activeGarageTab === 'tuning' && (
              <div className="flex flex-col gap-5 animate-fadeIn">
                <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-pink-400" />
                    <span className="text-xs font-bold text-slate-300 uppercase">Performance Tuning</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Install high-performance parts to tune your engine, drivetrain, and chassis. Upgrades apply directly to the active vehicle.
                  </p>
                </div>

                {UPGRADES_CONFIG.map((group) => (
                  <div key={group.group} className="flex flex-col gap-3">
                    <h3 className="text-xs font-black tracking-wider text-cyan-400 uppercase pl-1 border-l-2 border-cyan-500">
                      {group.group}
                    </h3>

                    <div className="flex flex-col gap-3">
                      {group.items.map((item) => {
                        const currentCarUpgrades = getCarUpgrades(activeCarId);

                        // Resolve current value based on path
                        let currentVal: any = currentCarUpgrades;
                        for (let i = 0; i < item.path.length; i++) {
                          if (currentVal !== undefined && currentVal !== null) {
                            currentVal = currentVal[item.path[i]];
                          }
                        }

                        if (item.type === 'level') {
                          const maxLvl = item.maxLevel || 3;
                          const costs = item.costs || [100, 200, 300];
                          const currentLvl = currentVal || 0;
                          const isMaxed = currentLvl >= maxLvl;
                          const cost = isMaxed ? 0 : (costs[currentLvl] || 0);
                          const canAfford = playerCredits >= cost;

                          return (
                            <div
                              key={item.id}
                              className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700/80 transition-all"
                            >
                              <div className="flex-1">
                                <h4 className="font-bold text-slate-100 text-sm">{item.name}</h4>
                                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.description}</p>

                                {/* Level indicator dots */}
                                <div className="flex gap-1.5 mt-2.5">
                                  {Array.from({ length: maxLvl }).map((_, idx) => {
                                    const isOwned = idx < currentLvl;
                                    return (
                                      <div
                                        key={idx}
                                        className={`w-6 h-1.5 rounded-sm transition-all duration-300 ${isOwned
                                          ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                                          : 'bg-slate-800 border border-slate-750'
                                          }`}
                                      />
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center">
                                {isMaxed ? (
                                  <span className="text-[10px] font-bold text-pink-400 bg-pink-950/40 border border-pink-900/50 px-3 py-1.5 rounded-lg uppercase tracking-wider">
                                    Maxed
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => buyUpgrade(item, cost)}
                                    disabled={!canAfford}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 border border-pink-500/80 ${canAfford
                                      ? 'bg-pink-600 hover:bg-pink-500 border-pink-500 text-white shadow-[0_0_10px_rgba(236,72,153,0.2)] shadow-pink-600/30'
                                      : 'bg-slate-800 border-slate-750 text-slate-500 cursor-not-allowed'
                                      }`}
                                  >
                                    <Coins className="w-3.5 h-3.5" />
                                    <span>{cost} Cr</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        } else {
                          // Toggle item
                          const isPurchased = isTogglePurchased(currentCarUpgrades, item.id);

                          // Check active equipped state
                          let isEquipped = false;
                          if (item.id === 'hasABS') isEquipped = !!currentVal;
                          else if (item.id === 'hasESC') isEquipped = !!currentVal;
                          else if (item.id === 'aspiration') isEquipped = currentVal === 'turbo';

                          const cost = item.cost || 0;
                          const canAfford = playerCredits >= cost;

                          return (
                            <div
                              key={item.id}
                              className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700/80 transition-all"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-slate-100 text-sm">{item.name}</h4>
                                  {isPurchased && (
                                    <span className="text-[9px] font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-900/50 px-1.5 py-0.5 rounded uppercase">
                                      Owned
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center">
                                {!isPurchased ? (
                                  <button
                                    onClick={() => buyUpgrade(item, cost)}
                                    disabled={!canAfford}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 border border-pink-500/80 ${canAfford
                                      ? 'bg-pink-600 hover:bg-pink-500 border-pink-500 text-white shadow-[0_0_10px_rgba(236,72,153,0.2)] shadow-pink-600/30'
                                      : 'bg-slate-800 border-slate-750 text-slate-500 cursor-not-allowed'
                                      }`}
                                  >
                                    <Coins className="w-3.5 h-3.5" />
                                    <span>{cost} Cr</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => toggleUpgrade(item)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isEquipped
                                      ? 'bg-cyan-600 hover:bg-cyan-500 border-cyan-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.2)] shadow-cyan-600/30'
                                      : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-350'
                                      }`}
                                  >
                                    {isEquipped ? 'EQUIPPED' : 'INSTALL'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        }
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Garage Footer Quick Info */}
          <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl">
            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block mb-1">Quick Controls</span>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 font-mono text-[10px] text-slate-400">
              <div><span className="text-cyan-400 font-bold">W / S</span> Acceleration/Brake</div>
              <div><span className="text-cyan-400 font-bold">A / D</span> Steering</div>
              <div><span className="text-cyan-400 font-bold">Space</span> Handbrake Drift</div>
              <div><span className="text-cyan-400 font-bold">R</span> Reset Position</div>
            </div>
          </div>
        </div>
      )}

      {/* HELP / INSTRUCTIONS MODAL OVERLAY */}
      {showHelp && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md z-40 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-lg w-full shadow-[0_0_40px_rgba(0,255,255,0.15)] flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black italic tracking-wider text-cyan-400">
                DRIVING MANUAL & DETAILS
              </h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-slate-500 hover:text-slate-300 font-bold p-1"
              >
                CLOSE
              </button>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <div>
                <h4 className="font-bold text-slate-100 flex items-center gap-2 mb-1.5">
                  <span className="w-1.5 h-3 bg-pink-500 rounded" />
                  Vehicle Controls
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-400">
                  <li>Use <span className="text-white font-semibold">W / A / S / D</span> or the <span className="text-white font-semibold">Arrow Keys</span> to steer, accelerate, and brake.</li>
                  <li>Hold <span className="text-white font-semibold">Spacebar</span> while turning to engage high-speed drifting.</li>
                  <li>Press <span className="text-white font-semibold">R</span> to reset the car position if you get stuck or go out-of-bounds.</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-slate-100 flex items-center gap-2 mb-1.5">
                  <span className="w-1.5 h-3 bg-pink-500 rounded" />
                  Earning Credits (CR)
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-400">
                  <li><span className="text-white font-semibold">Drifting</span>: Accumulate slide points. Completing a drift successfully awards credits.</li>
                  <li><span className="text-white font-semibold">Crystals</span>: Search the Open World to find yellow crystals (+50 Credits each).</li>
                  <li><span className="text-white font-semibold">Racing</span>: Complete circuit laps before the countdown limit. Medals award massive Credit payouts!</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-slate-100 flex items-center gap-2 mb-1.5">
                  <span className="w-1.5 h-3 bg-pink-500 rounded" />
                  A-License Unlock
                </h4>
                <p className="text-slate-400 leading-relaxed">
                  Start the <span className="text-yellow-400 font-semibold">License Test</span>, which is a timed gate navigation. Complete all checkpoints before time runs out to unlock the license, giving access to the high-difficulty <span className="text-pink-500 font-semibold">Pro Race</span> and the <span className="text-fuchsia-400 font-semibold">Apex Hypercar</span>!
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="w-full bg-cyan-600 hover:bg-cyan-500 border border-cyan-500 py-3 rounded-xl text-xs font-bold transition-all text-white mt-2 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
            >
              Back to Game
            </button>
          </div>
        </div>
      )}

      {/* PAUSE OVERLAY */}
      {isPaused && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900/90 border border-slate-800/85 backdrop-blur-xl p-8 rounded-3xl max-w-md w-full shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col gap-6 text-center animate-scaleIn">
            <div>
              <span className="text-[10px] font-extrabold tracking-widest text-cyan-400 uppercase">
                {activeMode === 'race' ? 'Circuit Race' : activeMode === 'license' ? 'License Test' : activeMode === 'tutorial' ? 'Tutorial' : 'Free Roam'}
              </span>
              <h2 className="text-3xl font-black italic bg-gradient-to-r from-cyan-400 via-indigo-400 to-pink-500 bg-clip-text text-transparent uppercase tracking-wider mt-1">
                Game Paused
              </h2>
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
                      {bestLapTime === Infinity ? '--:--.---' : formatTime(bestLapTime)}
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

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowHelp(!showHelp)}
                  className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 cursor-pointer ${showHelp
                      ? 'bg-cyan-950/60 border-cyan-800/80 text-cyan-400'
                      : 'bg-slate-800/60 border-slate-750 text-slate-300 hover:text-white'
                    }`}
                >
                  <HelpCircle className="w-4 h-4" />
                  Controls Help
                </button>

                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="bg-slate-800/60 border border-slate-750 text-slate-350 hover:text-white py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {soundEnabled ? (
                    <>
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                      Sound On
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-4 h-4 text-slate-500" />
                      Sound Muted
                    </>
                  )}
                </button>
              </div>

              <button
                onClick={exitToGarage}
                className="w-full bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 hover:text-white py-3 px-6 rounded-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer hover:shadow-[0_0_15px_rgba(244,63,94,0.15)] mt-2"
              >
                <LogOut className="w-4 h-4" />
                Abort Session & Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM MAP EDITOR OVERLAY */}
      {showEditor && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl z-30 flex items-center justify-center p-4 md:p-8 animate-fadeIn">
          <div className="bg-slate-900/90 border border-purple-500/30 w-full max-w-6xl h-[90vh] rounded-3xl shadow-[0_0_60px_rgba(168,85,247,0.25)] flex flex-col md:flex-row overflow-hidden relative">

            {/* Left: Canvas Area */}
            <div className="flex-1 bg-slate-950 p-6 flex flex-col items-center justify-center relative border-r border-slate-800/80">
              {/* Header inside canvas area */}
              <div className="absolute top-4 left-6 flex flex-col">
                <span className="text-[10px] font-bold text-purple-400 tracking-wider uppercase">Visual Grid Canvas</span>
                <h2 className="text-xl font-black text-slate-100 tracking-wider flex items-center gap-2">
                  {editorTrackName || 'Untitled Track'}
                </h2>
              </div>

              {/* Canvas controls (Zoom / Snap) */}
              <div className="absolute top-4 right-6 flex items-center gap-4 bg-slate-900/85 border border-slate-800 px-3 py-1.5 rounded-xl text-xs z-10">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Snap:</span>
                  <select
                    value={snapToGrid}
                    onChange={(e) => setSnapToGrid(parseInt(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-[11px] rounded px-1.5 py-0.5 outline-none cursor-pointer"
                  >
                    <option value={0}>Off</option>
                    <option value={5}>5m</option>
                    <option value={10}>10m</option>
                    <option value={20}>20m</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Zoom:</span>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={editorScale}
                    onChange={(e) => setEditorScale(parseFloat(e.target.value))}
                    className="w-16 accent-purple-500 cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-slate-400">{Math.round(editorScale * 100)}%</span>
                </div>
              </div>

              {/* Canvas element */}
              <div className="relative border border-slate-800/80 rounded-2xl overflow-hidden shadow-inner bg-[#090d16] flex items-center justify-center">
                <canvas
                  ref={editorCanvasRef}
                  width={600}
                  height={600}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  onDoubleClick={handleCanvasDoubleClick}
                  className="cursor-crosshair block"
                />
              </div>

              <div className="mt-3 text-[10px] font-mono text-slate-500 flex justify-between w-full max-w-[600px] px-1">
                <span>Nodes: {editorNodes.length} / Max 30 (Min 3 required)</span>
                <span>Length: {formatDistance(getTrackLength(editorNodes.map(n => new THREE.Vector3(n.x, 0, n.z))))}</span>
              </div>
            </div>

            {/* Right: Controls & Parameters panel */}
            <div className="w-full md:w-[380px] bg-slate-900/60 p-6 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-355 uppercase tracking-wider mb-3">Track Design & Setup</h3>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Track Name</label>
                    <input
                      type="text"
                      value={editorTrackName}
                      onChange={(e) => {
                        setEditorTrackName(e.target.value);
                        saveCustomTrack(editorNodes, e.target.value, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit);
                      }}
                      placeholder="My Custom Track"
                      maxLength={24}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5 mt-4">
                    <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Grid Size (Map Scale)</label>
                    <select
                      value={editorGridLimit}
                      onChange={(e) => {
                        const newLimit = parseInt(e.target.value);
                        setEditorGridLimit(newLimit);
                        saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, newLimit);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none transition-colors cursor-pointer"
                    >
                      <option value={250}>250m (Total 500m area)</option>
                      <option value={500}>500m (Total 1.0km area)</option>
                      <option value={1000}>1000m (Total 2.0km area)</option>
                      <option value={2000}>2000m (Total 4.0km area)</option>
                      <option value={3000}>3000m (Total 6.0km area)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 mt-4">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                      <span>Road Width</span>
                      <span className="text-purple-400 font-mono">{editorRoadWidth}m</span>
                    </div>
                    <input
                      type="range"
                      min="12"
                      max="40"
                      step="2"
                      value={editorRoadWidth}
                      onChange={(e) => {
                        const width = parseInt(e.target.value);
                        setEditorRoadWidth(width);
                        saveCustomTrack(editorNodes, editorTrackName, width, editorTimeLimit, editorHasObstacles, editorGridLimit);
                      }}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5 mt-4">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                      <span>Time Limit (Lap)</span>
                      <span className="text-purple-400 font-mono">{editorTimeLimit}s</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="120"
                      step="5"
                      value={editorTimeLimit}
                      onChange={(e) => {
                        const time = parseInt(e.target.value);
                        setEditorTimeLimit(time);
                        saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, time, editorHasObstacles, editorGridLimit);
                      }}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between mt-4 bg-slate-950/40 border border-slate-800 p-2.5 rounded-xl">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-slate-355">Active Obstacles</span>
                      <span className="text-[9px] text-slate-500">Spawns barrier cones along paths</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={editorHasObstacles}
                      onChange={(e) => {
                        setEditorHasObstacles(e.target.checked);
                        saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, e.target.checked, editorGridLimit);
                      }}
                      className="w-4 h-4 accent-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between mt-4 bg-slate-950/40 border border-slate-800 p-2.5 rounded-xl">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-slate-355">Trackside Grass</span>
                      <span className="text-[9px] text-slate-500">Renders grass strips along the curbs</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={editorHaveGrass}
                      onChange={(e) => {
                        setEditorHaveGrass(e.target.checked);
                        saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, e.target.checked);
                      }}
                      className="w-4 h-4 accent-purple-500 cursor-pointer"
                    />
                  </div>

                  {editorHaveGrass && (
                    <div className="space-y-1.5 mt-4">
                      <div className="flex justify-between text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                        <span>Grass Field Width (Length)</span>
                        <span className="text-purple-400 font-mono">{editorGrassWidth}m</span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="12"
                        step="1"
                        value={editorGrassWidth}
                        onChange={(e) => {
                          const width = parseInt(e.target.value);
                          setEditorGrassWidth(width);
                          saveCustomTrack(editorNodes, editorTrackName, editorRoadWidth, editorTimeLimit, editorHasObstacles, editorGridLimit, editorHaveGrass, width);
                        }}
                        className="w-full accent-purple-500 cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-355 uppercase tracking-wider mb-2">Track Presets</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleApplyTemplate('oval')}
                      className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] font-bold py-2 rounded-xl transition-all cursor-pointer text-slate-300"
                    >
                      Oval Loop
                    </button>
                    <button
                      onClick={() => handleApplyTemplate('scurve')}
                      className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] font-bold py-2 rounded-xl transition-all cursor-pointer text-slate-300"
                    >
                      S-Curves
                    </button>
                    <button
                      onClick={() => handleApplyTemplate('figure8')}
                      className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] font-bold py-2 rounded-xl transition-all cursor-pointer text-slate-300"
                    >
                      Figure 8
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-355 uppercase tracking-wider">Vector3 Code Tools</h3>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          editorNodes.map(n => `new THREE.Vector3(${Math.round(n.x)}, 2, ${Math.round(n.z)})`).join(',\n')
                        );
                        alert("Vector3 coordinate code copied to clipboard!");
                      }}
                      className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer bg-transparent border-0 font-bold"
                    >
                      <Copy className="w-3 h-3" /> Copy Code
                    </button>
                  </div>

                  <textarea
                    placeholder="Paste new THREE.Vector3(x, 2, z) lines here and click 'Import Code' to load a custom track path..."
                    id="import-export-textarea"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-[10px] font-mono text-slate-400 outline-none transition-colors h-24 resize-none leading-relaxed"
                  />

                  <button
                    onClick={() => {
                      const txtarea = document.getElementById('import-export-textarea') as HTMLTextAreaElement;
                      if (txtarea) importTrack(txtarea.value);
                    }}
                    className="w-full bg-slate-950 hover:bg-slate-800 border border-slate-800 py-1.5 rounded-xl text-[10px] font-bold transition-all text-slate-200 cursor-pointer"
                  >
                    Import Code
                  </button>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <button
                  disabled={editorNodes.length < 3}
                  onClick={launchTestDrive}
                  className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 border cursor-pointer ${editorNodes.length >= 3
                    ? 'bg-purple-600 hover:bg-purple-500 border-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)] hover:shadow-[0_0_20px_rgba(168,85,247,0.55)]'
                    : 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                >
                  <Play className="w-4 h-4 fill-current" />
                  {editorNodes.length >= 3 ? 'Test Drive Track' : 'Needs Min. 3 Nodes'}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleClearAll}
                    className="bg-slate-950 hover:bg-red-950/40 border border-slate-800 hover:border-red-900/60 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-red-400 transition-all cursor-pointer"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={() => setShowEditor(false)}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 py-2 rounded-xl text-xs font-bold text-slate-250 transition-all cursor-pointer"
                  >
                    Close Editor
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
