'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Coins, HelpCircle, Compass, Award, Lock, Paintbrush, Play, Timer, LogOut, Wrench, Settings, Check, Map, Trophy } from 'lucide-react';
import * as THREE from 'three';
import { CARS_DATABASE, CarConfig } from '../config/CarDatabase';
import { TRACKS_DATABASE, TrackConfig } from '../config/TrackDatabase';
import { Vehicle } from '../objects/Vehicle';
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

const DealerThreeCarIcon = ({ car }: { car: CarConfig }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
    camera.position.set(3.2, 2.0, 5.2);
    camera.lookAt(0, 0.55, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const paint = new THREE.Color('#ff0258');
    const silhouetteMat = new THREE.MeshBasicMaterial({
      color: paint,
    });
    const blackMat = new THREE.MeshBasicMaterial({
      color: 0x050507,
    });
    const displayRoot = new THREE.Group();
    displayRoot.rotation.y = -0.55;
    displayRoot.rotation.x = -0.08;
    scene.add(displayRoot);

    const iconVehicle = new Vehicle(car.id, car.color);
    iconVehicle.mesh.rotation.y = 269.8;
    displayRoot.add(iconVehicle.mesh);

    const localBox = new THREE.Box3();
    const meshBox = new THREE.Box3();
    const rootInverse = new THREE.Matrix4();
    const relativeMatrix = new THREE.Matrix4();
    const blackPartByMesh = new WeakMap<THREE.Mesh, boolean>();

    const applySilhouetteMaterials = () => {
      iconVehicle.mesh.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;

        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const materialNames = Array.isArray(object.material)
          ? object.material.map((material) => material.name.toLowerCase()).join(' ')
          : object.material.name.toLowerCase();
        const objectPathName = (() => {
          const names: string[] = [];
          let current: THREE.Object3D | null = object;
          while (current) {
            if (current.name) names.push(current.name.toLowerCase());
            current = current.parent;
          }
          return names.join(' ');
        })();
        const hasDarkSourceColor = materials.some((material) => {
          if (!('color' in material) || !(material.color instanceof THREE.Color)) return false;
          return material.color.r < 0.36 && material.color.g < 0.36 && material.color.b < 0.36;
        });
        const hasGlassMaterial = materials.some((material) => {
          const transmission = 'transmission' in material && typeof material.transmission === 'number' ? material.transmission : 0;
          return material.transparent || material.opacity < 0.95 || transmission > 0.1;
        });
        const isTire =
          objectPathName.includes('tire') ||
          objectPathName.includes('tyre') ||
          objectPathName.includes('wheel') ||
          materialNames.includes('tire') ||
          materialNames.includes('tyre') ||
          materialNames.includes('rubber');
        const isWindow =
          objectPathName.includes('window') ||
          objectPathName.includes('glass') ||
          objectPathName.includes('windshield') ||
          objectPathName.includes('windscreen') ||
          materialNames.includes('window') ||
          materialNames.includes('glass') ||
          materialNames.includes('windshield') ||
          materialNames.includes('windscreen') ||
          hasGlassMaterial;
        const isBlackPart = blackPartByMesh.get(object) ?? (isTire || isWindow || hasDarkSourceColor);
        blackPartByMesh.set(object, isBlackPart);

        object.material = isBlackPart ? blackMat : silhouetteMat;
      });
    };

    const getVehicleLocalBox = () => {
      localBox.makeEmpty();
      iconVehicle.mesh.updateWorldMatrix(true, true);
      rootInverse.copy(iconVehicle.mesh.matrixWorld).invert();

      iconVehicle.mesh.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !object.geometry) return;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        if (!object.geometry.boundingBox) return;

        relativeMatrix.multiplyMatrices(rootInverse, object.matrixWorld);
        meshBox.copy(object.geometry.boundingBox).applyMatrix4(relativeMatrix);
        localBox.union(meshBox);
      });

      return localBox;
    };

    const fitVehicleToIcon = () => {
      iconVehicle.mesh.scale.setScalar(1);
      iconVehicle.mesh.position.set(0, 0, 0);
      applySilhouetteMaterials();
      iconVehicle.mesh.updateMatrixWorld(true);
      const box = getVehicleLocalBox();
      if (box.isEmpty()) return;

      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const maxSize = Math.max(size.x, size.y, size.z, 0.1);
      const scale = 5.25 / maxSize;
      iconVehicle.mesh.scale.setScalar(scale);
      iconVehicle.mesh.position.set(-center.x * scale, -box.min.y * scale - 0.55, -center.z * scale);
    };
    fitVehicleToIcon();

    const ambient = new THREE.AmbientLight(0xffffff, 1.15);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(paint, 2.2);
    rim.position.set(-3, 1.5, -2.5);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 40),
      new THREE.MeshBasicMaterial({ color: paint, transparent: true, opacity: 0.12 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);

    const resize = () => {
      const width = 112;
      const height = 64;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();

    let frameId = 0;
    let lastTime = performance.now();
    const spinRate = (Math.PI * 2) / 5.4;

    const animate = (time: number) => {
      const delta = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      const button = mount.closest('button');
      const isHovering = !!button?.matches(':hover');
      fitVehicleToIcon();

      if (isHovering) {
        displayRoot.rotation.y += spinRate * delta;
      } else {
        const target = -0.55;
        displayRoot.rotation.y += (target - displayRoot.rotation.y) * Math.min(delta * 5, 1);
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.domElement.remove();
    };
  }, [car.id, car.color, car.hasSpoiler]);

  return <div ref={mountRef} className="dealer-three-car absolute left-[80%] top-1/2 z-10" aria-hidden="true" />;
};

const PAINT_SWATCHES = [
  { name: 'Rose Red', hex: '#f43f5e' },
  { name: 'Cyber Cyan', hex: '#06b6d4' },
  { name: 'Fuchsia Pink', hex: '#d946ef' },
  { name: 'Volt Yellow', hex: '#eab308' },
  { name: 'Lime Green', hex: '#22c55e' },
  { name: 'Sunset Orange', hex: '#f97316' },
  { name: 'Deep Purple', hex: '#8b5cf6' }
];

type DealerCityId = 'east' | 'west' | 'north' | 'south';

const DEALER_CITIES: Array<{
  id: DealerCityId;
  name: string;
  region: string;
  description: string;
  brands: string[];
  accent: string;
}> = [
    {
      id: 'east',
      name: 'East City',
      region: 'Far East Imports',
      description: 'Japanese, Korean, and Chinese performance cars.',
      brands: ['Toyota', 'Nissan', 'Honda'],
      accent: 'rose',
    },
    {
      id: 'west',
      name: 'West City',
      region: 'Far West Brands',
      description: 'American and European road machines.',
      brands: ['Ford', 'Tesla', 'Porsche', 'Ferrari', 'Audi', 'Chevrolet'],
      accent: 'cyan',
    },
    {
      id: 'north',
      name: 'North City',
      region: 'Cold Line Exchange',
      description: 'Reserved for future northern specialist dealers.',
      brands: [],
      accent: 'blue',
    },
    {
      id: 'south',
      name: 'South City',
      region: 'Coastal Auto Market',
      description: 'Reserved for future southern specialist dealers.',
      brands: [],
      accent: 'amber',
    },
  ];

const getDealerCityCars = (city: DealerCityId | null) => {
  if (!city) return [];
  const cityConfig = DEALER_CITIES.find((item) => item.id === city);
  if (!cityConfig || cityConfig.brands.length === 0) return [];
  return CARS_DATABASE.filter((car) => cityConfig.brands.includes(car.brand));
};

const getDealerCityClasses = (accent: string) => {
  if (accent === 'cyan') {
    return {
      icon: 'bg-cyan-950/40 border-cyan-900/50 text-cyan-300',
      glow: 'hover:border-cyan-500/55 hover:shadow-[0_0_28px_rgba(6,182,212,0.16)]',
      text: 'text-cyan-300',
    };
  }
  if (accent === 'blue') {
    return {
      icon: 'bg-blue-950/40 border-blue-900/50 text-blue-300',
      glow: 'hover:border-blue-500/55 hover:shadow-[0_0_28px_rgba(59,130,246,0.16)]',
      text: 'text-blue-300',
    };
  }
  if (accent === 'amber') {
    return {
      icon: 'bg-amber-950/35 border-amber-900/45 text-amber-300',
      glow: 'hover:border-amber-500/55 hover:shadow-[0_0_28px_rgba(245,158,11,0.16)]',
      text: 'text-amber-300',
    };
  }

  return {
    icon: 'bg-rose-950/40 border-rose-900/50 text-rose-300',
    glow: 'hover:border-rose-500/55 hover:shadow-[0_0_28px_rgba(244,63,94,0.16)]',
    text: 'text-rose-300',
  };
};

const DealerCityMapScene = ({ selectedCity }: { selectedCity: DealerCityId | null }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050507, 8, 22);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 8.5, 11);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const mapRoot = new THREE.Group();
    mapRoot.rotation.x = -0.08;
    scene.add(mapRoot);

    const cityColors: Record<DealerCityId, number> = {
      east: 0xff0258,
      west: 0x06b6d4,
      north: 0x3b82f6,
      south: 0xf59e0b,
    };
    const cityPositions: Record<DealerCityId, THREE.Vector3> = {
      east: new THREE.Vector3(-3.8, 0, -2.2),
      west: new THREE.Vector3(3.7, 0, -1.7),
      north: new THREE.Vector3(-1.1, 0, 2.7),
      south: new THREE.Vector3(2.0, 0, 2.3),
    };

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(10.8, 0.12, 7.2),
      new THREE.MeshBasicMaterial({ color: 0x09090b, transparent: true, opacity: 0.84 })
    );
    base.position.y = -0.08;
    mapRoot.add(base);

    const grid = new THREE.GridHelper(12, 24, 0x3f3f46, 0x27272a);
    grid.position.y = 0.01;
    mapRoot.add(grid);

    const roadMat = new THREE.MeshBasicMaterial({ color: 0x18181b, transparent: true, opacity: 0.9 });
    const glowMats = Object.fromEntries(
      DEALER_CITIES.map((city) => [
        city.id,
        new THREE.MeshBasicMaterial({
          color: cityColors[city.id],
          transparent: true,
          opacity: selectedCity === city.id || selectedCity === null ? 0.34 : 0.12,
        }),
      ])
    ) as Record<DealerCityId, THREE.MeshBasicMaterial>;

    const makeRoad = (x: number, z: number, width: number, depth: number, rotation = 0) => {
      const road = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, depth), roadMat);
      road.position.set(x, 0.04, z);
      road.rotation.y = rotation;
      mapRoot.add(road);
      return road;
    };

    makeRoad(0, 0.15, 8.7, 0.22, -0.12);
    makeRoad(-1.4, 0.2, 0.22, 5.4, 0.32);
    makeRoad(2.2, 0.08, 0.22, 5.7, -0.52);
    makeRoad(-0.2, 2.4, 6.8, 0.2, 0.17);
    makeRoad(0.7, -2.0, 7.0, 0.2, -0.24);

    const cityGroups: Partial<Record<DealerCityId, THREE.Group>> = {};
    DEALER_CITIES.forEach((city) => {
      const cityGroup = new THREE.Group();
      const position = cityPositions[city.id];
      cityGroup.position.copy(position);
      cityGroups[city.id] = cityGroup;

      const isActive = selectedCity === city.id || selectedCity === null;
      const color = cityColors[city.id];

      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.92, 1.08, 0.16, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isActive ? 0.42 : 0.16 })
      );
      pad.position.y = 0.12;
      pad.rotation.y = Math.PI / 6;
      cityGroup.add(pad);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.08, 0.035, 8, 36),
        glowMats[city.id]
      );
      ring.position.y = 0.24;
      ring.rotation.x = Math.PI / 2;
      cityGroup.add(ring);

      const buildingMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isActive ? 0.72 : 0.25 });
      const darkMat = new THREE.MeshBasicMaterial({ color: 0x111113, transparent: true, opacity: 0.88 });
      const blockOffsets = [
        [-0.34, -0.18, 0.58],
        [0.2, 0.08, 0.88],
        [0.48, -0.32, 0.42],
        [-0.1, 0.42, 0.64],
      ];
      blockOffsets.forEach(([x, z, height], index) => {
        const mat = index % 2 === 0 ? buildingMat : darkMat;
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.32, height, 0.32), mat);
        block.position.set(x, 0.24 + height / 2, z);
        cityGroup.add(block);
      });

      mapRoot.add(cityGroup);
    });

    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(2, 5, 4);
    scene.add(key);

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    window.addEventListener('resize', resize);

    let frameId = 0;
    const startTime = performance.now();
    const animate = (time: number) => {
      const t = (time - startTime) / 1000;
      mapRoot.rotation.y = Math.sin(t * 0.18) * 0.05;

      DEALER_CITIES.forEach((city, index) => {
        const group = cityGroups[city.id];
        if (!group) return;
        const target = selectedCity === city.id || selectedCity === null ? 1 : 0.86;
        const pulse = 1 + Math.sin(t * 1.4 + index) * 0.035;
        group.scale.setScalar(target * pulse);
        group.position.y = Math.sin(t * 1.2 + index * 0.7) * 0.04;
      });

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.domElement.remove();
    };
  }, [selectedCity]);

  return <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />;
};

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
  startQuickPlayRace: (carId: string, trackId: string) => void;
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
  startQuickPlayRace,
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

  // Local states for Drive Sub-modes
  const [driveSubMode, setDriveSubMode] = useState<null | 'quickplay' | 'career'>(null);
  const [quickPlayStep, setQuickPlayStep] = useState<'car' | 'map'>('car');
  const [quickPlayCarId, setQuickPlayCarId] = useState<string | null>(null);
  const [quickPlaySelectedBrand, setQuickPlaySelectedBrand] = useState<string>('All');
  const [dealerCity, setDealerCity] = useState<DealerCityId | null>(null);

  // Reset drive submode states when tab changes from drive
  React.useEffect(() => {
    if (activeGarageTab !== 'drive') {
      setDriveSubMode(null);
      setQuickPlayStep('car');
      setQuickPlayCarId(null);
      setQuickPlaySelectedBrand('All');
    }
  }, [activeGarageTab]);

  React.useEffect(() => {
    if (activeGarageTab !== 'dealer') {
      setDealerCity(null);
      if (selectedBrand !== 'All') setSelectedBrand('All');
    }
  }, [activeGarageTab, selectedBrand, setSelectedBrand]);

  const handleBackToGarage = () => {
    setDriveSubMode(null);
    setQuickPlayStep('car');
    setQuickPlayCarId(null);
    setQuickPlaySelectedBrand('All');
    handleBackToGarageClick();
  };

  const getCarUpgradesSafe = (carId: string) => {
    return carUpgrades[carId] || JSON.parse(JSON.stringify(DEFAULT_UPGRADES));
  };

  const handleExitClick = () => {
    // If Tauri
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      try {
        (window as any).__TAURI__.process.exit(0);
        return;
      } catch (e) {
        try {
          (window as any).__TAURI__.window.getCurrent().close();
          return;
        } catch (err) { }
      }
    }

    // If Electron / custom ipcRenderer
    if (typeof window !== 'undefined' && (window as any).ipcRenderer) {
      try {
        (window as any).ipcRenderer.send('exit-app');
        return;
      } catch (e) { }
    }
    if (typeof window !== 'undefined' && (window as any).electron) {
      try {
        (window as any).electron.send('exit-app');
        return;
      } catch (e) { }
      try {
        (window as any).electron.ipcRenderer.send('exit-app');
        return;
      } catch (e) { }
    }

    // NW.js
    if (typeof window !== 'undefined' && (window as any).nw) {
      try {
        (window as any).nw.App.quit();
        return;
      } catch (e) { }
    }

    // Standard window.close fallback
    if (typeof window !== 'undefined') {
      window.close();
    }
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

  const activeCarConfig = CARS_DATABASE.find((car) => car.id === activeCarId) || CARS_DATABASE[0];
  const dealerCityConfig = DEALER_CITIES.find((city) => city.id === dealerCity);
  const dealerCars = getDealerCityCars(dealerCity);

  return (
    <>
      {/* TOP STATUS BAR */}
      {activeGarageTab !== 'drive' && activeGarageTab !== 'dealer' && (
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
              onClick: () => setActiveGarageTab('dealer'),
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
            {
              id: 'exit',
              label: 'EXIT',
              icon: LogOut,
              onClick: handleExitClick,
            },
          ].map((item, index) => {
            const isActive = activeGarageTab === item.id;
            const isDrive = item.id === 'drive';
            const isDealer = item.id === 'dealer';
            const isExit = item.id === 'exit';
            const isTuning = item.id === 'tuning';
            const isSetting = item.id === 'setting';
            const isHidden = isTransitioningDrive || settingsState !== 'closed' || activeGarageTab === 'dealer';

            // Ladder offsets: index * 10% left, static on hover
            let baseClass = '';
            if (index === 0) baseClass = 'translate-x-0';
            else if (index === 1) baseClass = '-translate-x-[10%]';
            else if (index === 2) baseClass = '-translate-x-[20%]';
            else if (index === 3) baseClass = '-translate-x-[30%]';
            else if (index === 4) baseClass = '-translate-x-[40%]';

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
                          : index === 3
                            ? 'delay-[400ms]'
                            : 'delay-[500ms]'
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
                          <pattern id="drive-checkers" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="translate(0, 0)">
                            <rect width="10" height="10" fill="#e11d48" />
                            <rect x="10" width="10" height="10" fill="#09090b" />
                            <rect y="10" width="10" height="10" fill="#09090b" />
                            <rect x="10" y="10" width="10" height="10" fill="#e11d48" />
                          </pattern>
                          <filter id="checkers-wave" x="-20%" y="-20%" width="140%" height="140%">
                            <feTurbulence type="fractalNoise" baseFrequency="0.02 0.003" numOctaves="1" seed="2" result="sineWave" />
                            <feDisplacementMap in="SourceGraphic" in2="sineWave" scale="25" xChannelSelector="R" yChannelSelector="G" />
                          </filter>
                        </defs>
                        <g filter="url(#checkers-wave)">
                          <rect className="animate-checkers-move" width="120%" height="100%" fill="url(#drive-checkers)" />
                        </g>
                      </svg>
                    </div>
                  )}

                  {isDealer && (
                    <div className="absolute right-0 top-0 bottom-0 w-full overflow-hidden pointer-events-none z-0 transform skew-x-12">
                      <DealerThreeCarIcon car={activeCarConfig} />
                    </div>
                  )}

                  {isTuning && (
                    <div className="absolute right-0 top-0 bottom-0 w-full overflow-hidden pointer-events-none z-0 transform skew-x-12">
                      <img
                        src="/icon/wrench.svg"
                        alt=""
                        className="tuning-wrench absolute left-[82.5%] top-1/2 w-[100px] h-[56px] opacity-50 group-hover:opacity-100 transition-opacity duration-300 origin-center will-change-transform"
                        draggable={false}
                      />
                      <img
                        src="/icon/screwdriver.svg"
                        alt=""
                        className="tuning-screwdriver absolute left-[90%] top-1/2 w-[100px] h-[56px] opacity-50 group-hover:opacity-100 transition-opacity duration-300 origin-center will-change-transform"
                        draggable={false}
                      />
                    </div>
                  )}

                  {isSetting && (
                    <div className="absolute right-0 top-0 bottom-0 w-full overflow-hidden pointer-events-none z-0 transform skew-x-12">
                      <div className="absolute left-[84%] top-1/2 h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2">
                        <img
                          src="/icon/setting_gear.svg"
                          alt=""
                          className="h-full w-full scale-200 origin-center opacity-55 transition-opacity duration-300 will-change-transform group-hover:animate-[spin_1.8s_linear_infinite] group-hover:opacity-100"
                          draggable={false}
                        />
                      </div>
                    </div>
                  )}

                  {isExit && (
                    <div className="absolute right-0 top-0 bottom-0 w-full overflow-hidden pointer-events-none z-0 transform skew-x-12">
                      {/* Door - stays put on the right edge */}
                      <img
                        src="/icon/exit_door.svg"
                        alt=""
                        className="absolute right-[-10%] top-[-5%] z-25 h-[115%] w-auto opacity-60 scale-85 transition-opacity duration-300 group-hover:opacity-100"
                        draggable={false}
                      />
                      {/* Person - sits at 70% from the left side */}
                      <div className="exit-person-runner absolute left-[70%] top-[67.5%] z-20 h-[90%] w-auto">
                        <div className="exit-trail pointer-events-none" aria-hidden="true">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                        <img
                          src="/icon/exit_person.svg"
                          alt=""
                          className="exit-person h-full w-auto scale-95"
                          draggable={false}
                        />
                      </div>
                      {/* Smoke puffs */}
                      <div className="absolute right-[8%] top-[56%] z-30 -translate-y-1/2 opacity-0 transition-opacity delay-500 duration-500 group-hover:opacity-100">
                        <div className="exit-smoke-puff exit-smoke-1 pointer-events-none absolute -top-1.5 left-0 h-2.5 w-2.5 rounded-full bg-[radial-gradient(circle,rgba(200,200,200,0.7)_0%,rgba(160,160,160,0)_70%)] opacity-0"></div>
                        <div className="exit-smoke-puff exit-smoke-2 pointer-events-none absolute top-0.5 -left-2 h-2.5 w-2.5 rounded-full bg-[radial-gradient(circle,rgba(200,200,200,0.7)_0%,rgba(160,160,160,0)_70%)] opacity-0"></div>
                        <div className="exit-smoke-puff exit-smoke-3 pointer-events-none absolute -top-3 left-1 h-2.5 w-2.5 rounded-full bg-[radial-gradient(circle,rgba(200,200,200,0.7)_0%,rgba(160,160,160,0)_70%)] opacity-0"></div>
                      </div>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* DEDICATED DEALER CITY MAP */}
      {activeGarageTab === 'dealer' && (
        <div
          className="absolute inset-0 z-10 overflow-hidden bg-zinc-950 pointer-events-auto animate-fadeIn"
        >
          <DealerCityMapScene selectedCity={dealerCity} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(244,63,94,0.16),transparent_24%),radial-gradient(circle_at_78%_78%,rgba(6,182,212,0.14),transparent_28%),linear-gradient(90deg,rgba(9,9,11,0.92),rgba(9,9,11,0.72))]" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-zinc-950 to-transparent" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-zinc-950 to-transparent" aria-hidden="true" />

          {/* TAB: DEALER */}
          {activeGarageTab === 'dealer' && (
            <div className="relative z-10 flex h-full min-h-0 flex-col gap-6 p-8 animate-fadeIn text-left">
              <div className="flex shrink-0 justify-between items-center pb-4 border-b border-zinc-800/80">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-wider uppercase">
                    {dealerCityConfig ? dealerCityConfig.name : 'DEALER CITY SELECT'}
                  </h2>
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.25em]">
                    {dealerCityConfig ? dealerCityConfig.region : 'CHOOSE WHERE TO BUY CARS'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {dealerCityConfig && (
                    <button
                      onClick={() => setDealerCity(null)}
                      className="px-3 py-2 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-[9px] font-black tracking-widest text-zinc-300 rounded-xl transition-all cursor-pointer"
                    >
                      CITY MAP
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setDealerCity(null);
                      setActiveGarageTab(null);
                    }}
                    className="px-3 py-2 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-[9px] font-black tracking-widest text-zinc-300 rounded-xl transition-all cursor-pointer"
                  >
                    BACK
                  </button>
                </div>
              </div>

              {!dealerCityConfig && (
                <div className="relative mx-auto grid w-full max-w-5xl flex-1 min-h-0 content-center grid-cols-2 gap-5 py-4">
                  {DEALER_CITIES.map((city) => {
                    const cityCars = getDealerCityCars(city.id);
                    const cityClasses = getDealerCityClasses(city.accent);

                    return (
                      <button
                        key={city.id}
                        onClick={() => setDealerCity(city.id)}
                        className={`group relative min-h-[240px] overflow-hidden rounded-2xl border border-zinc-850 bg-zinc-950/65 p-5 text-left backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:bg-zinc-900/75 ${cityClasses.glow}`}
                      >
                        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-950/80 to-transparent pointer-events-none" />
                        <div className="relative z-10 flex h-full flex-col justify-between gap-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${cityClasses.icon}`}>
                              <Map className="h-5 w-5" />
                            </div>
                            <div className="text-right">
                              <div className={`text-2xl font-black font-mono ${cityClasses.text}`}>{cityCars.length}</div>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Cars</div>
                            </div>
                          </div>
                          <div>
                            <h3 className="text-2xl font-black uppercase tracking-wide text-white transition-colors group-hover:text-zinc-100">
                              {city.name}
                            </h3>
                            <div className={`mt-1 text-[10px] font-black uppercase tracking-[0.24em] ${cityClasses.text}`}>
                              {city.region}
                            </div>
                            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                              {city.description}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {(city.brands.length > 0 ? city.brands : ['Coming Soon']).map((brand) => (
                                <span key={brand} className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                                  {brand}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {dealerCityConfig && dealerCars.length === 0 && (
                <div className="mx-auto mt-10 w-full max-w-xl rounded-2xl border border-zinc-850 bg-zinc-950/70 p-8 text-center backdrop-blur-md">
                  <h3 className="text-lg font-black uppercase tracking-wide text-white">No Cars Stocked Yet</h3>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                    This city is open, but its dealer inventory has not arrived yet.
                  </p>
                </div>
              )}

              {dealerCityConfig && dealerCars.length > 0 && (
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pb-6 pr-2 xl:grid-cols-2">
                {dealerCars.map((car) => {
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
              )}
            </div>
          )}
        </div>
      )}
      {/* DEDICATED DRIVE MODES INTERFACE */}
      {activeGarageTab === 'drive' && (
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center p-8 bg-zinc-950/40 backdrop-blur-md pointer-events-auto transition-all duration-700 ${isTransitioningDrive ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
        >
          <div className="w-full max-w-4xl flex flex-col gap-6 text-left h-full max-h-[620px] justify-center">
            {/* 1. Mode Selection Screen */}
            {driveSubMode === null && (
              <>
                <div className="flex justify-between items-center pb-4 border-b border-zinc-900 shrink-0">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-extrabold tracking-[0.4em] text-rose-500 uppercase italic">
                      VELOCITY
                    </span>
                    <h2 className="text-2xl font-black text-white tracking-wider uppercase">
                      SELECT MODE
                    </h2>
                  </div>
                  <button
                    onClick={handleBackToGarage}
                    className="px-5 py-2.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-xs font-black tracking-widest text-zinc-300 rounded-xl transition-all cursor-pointer"
                  >
                    BACK TO GARAGE
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-auto py-4">
                  {/* Quick Play Card */}
                  <button
                    onClick={() => {
                      setDriveSubMode('quickplay');
                      setQuickPlayStep('car');
                      setQuickPlayCarId(null);
                    }}
                    className="group relative border border-zinc-855 bg-zinc-900/40 hover:bg-zinc-900/70 p-8 rounded-3xl flex flex-col justify-between text-left transition-all duration-300 transform hover:-translate-y-1.5 hover:animate-glowPulseCyan h-80 cursor-pointer overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 via-cyan-500/0 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                    <div className="flex flex-col gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-cyan-950/40 border border-cyan-900/50 flex items-center justify-center group-hover:scale-110 group-hover:border-cyan-500/40 group-hover:bg-cyan-950/65 transition-all duration-300">
                        <Play className="w-6 h-6 text-cyan-400 fill-cyan-400/20 group-hover:text-cyan-300 group-hover:fill-cyan-300/40 transition-colors" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-white tracking-wide uppercase group-hover:text-cyan-300 transition-colors">
                          Quick Play
                        </h3>
                        <p className="text-[10px] font-extrabold tracking-[0.2em] text-cyan-400 uppercase mt-1">
                          No Restrictions
                        </p>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mt-1">
                        Drive any car in the game immediately on any circuit. Cars use stock configuration. Races do not award credits.
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-black tracking-widest text-cyan-400 group-hover:translate-x-1.5 transition-transform duration-300">
                      CHOOSE VEHICLE &rarr;
                    </div>
                  </button>

                  {/* Career Mode Card */}
                  <button
                    onClick={() => setDriveSubMode('career')}
                    className="group relative border border-zinc-855 bg-zinc-900/40 hover:bg-zinc-900/70 p-8 rounded-3xl flex flex-col justify-between text-left transition-all duration-300 transform hover:-translate-y-1.5 hover:animate-glowPulseRose h-80 cursor-pointer overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-rose-500/0 via-rose-500/0 to-rose-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                    <div className="flex flex-col gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-rose-950/40 border border-rose-900/50 flex items-center justify-center group-hover:scale-110 group-hover:border-rose-500/40 group-hover:bg-rose-950/65 transition-all duration-300">
                        <Trophy className="w-6 h-6 text-rose-550 group-hover:text-rose-400 transition-colors" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-white tracking-wide uppercase group-hover:text-rose-400 transition-colors">
                          Career Mode
                        </h3>
                        <p className="text-[10px] font-extrabold tracking-[0.2em] text-rose-500 uppercase mt-1">
                          Championships & School
                        </p>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mt-1">
                        Complete Driving School, earn Licenses, and race in Circuits using your owned cars. Earn credits to buy and tune cars.
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-black tracking-widest text-rose-500 group-hover:translate-x-1.5 transition-transform duration-300">
                      ENTER CAREER &rarr;
                    </div>
                  </button>
                </div>
              </>
            )}

            {/* 2. Quick Play Mode */}
            {driveSubMode === 'quickplay' && (
              <>
                {/* 2a. Quick Play Car Selection */}
                {quickPlayStep === 'car' && (
                  <>
                    <div className="flex justify-between items-center pb-4 border-b border-zinc-900 shrink-0">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-extrabold tracking-[0.4em] text-cyan-400 uppercase italic">
                          QUICK PLAY
                        </span>
                        <h2 className="text-2xl font-black text-white tracking-wider uppercase">
                          SELECT VEHICLE
                        </h2>
                      </div>
                      <button
                        onClick={() => setDriveSubMode(null)}
                        className="px-5 py-2.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-xs font-black tracking-widest text-zinc-300 rounded-xl transition-all cursor-pointer"
                      >
                        BACK
                      </button>
                    </div>

                    {/* Brand Filter */}
                    <div className="flex gap-1.5 overflow-x-auto pb-2 shrink-0">
                      {['All', 'Toyota', 'Ford', 'Nissan', 'Tesla', 'Porsche', 'Ferrari', 'Audi', 'Chevrolet'].map((brand) => (
                        <button
                          key={brand}
                          onClick={() => setQuickPlaySelectedBrand(brand)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${quickPlaySelectedBrand === brand
                            ? 'bg-cyan-950/40 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                            : 'bg-zinc-900 border-zinc-855 text-zinc-400 hover:text-zinc-300'
                            }`}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-1 flex-1 py-1">
                      {CARS_DATABASE.filter((car) => quickPlaySelectedBrand === 'All' || car.brand === quickPlaySelectedBrand).map((car) => (
                        <div
                          key={car.id}
                          className="bg-zinc-900/40 border border-zinc-850 p-4 rounded-2xl flex flex-col justify-between gap-3"
                        >
                          <div>
                            <div className="flex justify-between items-start">
                              <h3 className="font-extrabold text-white text-sm">
                                {car.brand} {car.name}
                              </h3>
                            </div>
                            <div className="flex gap-2 items-center mt-1">
                              <span className="text-[9px] font-bold tracking-wider uppercase text-cyan-400">
                                {car.tier}
                              </span>
                              <span className="text-zinc-700 text-[9px] font-bold">•</span>
                              <span className="text-[9px] font-bold tracking-wider uppercase text-zinc-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-850">
                                {car.driveType}
                              </span>
                            </div>
                          </div>

                          {/* Spec bars (Stock Stats) */}
                          <div className="flex flex-col gap-2 mt-0.5 bg-zinc-950/50 p-3 rounded-xl border border-zinc-900">
                            {/* Speed */}
                            <div>
                              <div className="flex justify-between text-[9px] font-bold text-zinc-500 mb-1">
                                <span>TOP SPEED</span>
                                <span>{Math.round(car.speed * 10)}%</span>
                              </div>
                              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden relative">
                                <div
                                  className="absolute left-0 top-0 h-full bg-cyan-500 transition-all duration-300"
                                  style={{ width: `${Math.min(100, car.speed * 10)}%` }}
                                />
                              </div>
                            </div>
                            {/* Acceleration */}
                            <div>
                              <div className="flex justify-between text-[9px] font-bold text-zinc-500 mb-1">
                                <span>ACCELERATION</span>
                                <span>{Math.round(car.acceleration * 10)}%</span>
                              </div>
                              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden relative">
                                <div
                                  className="absolute left-0 top-0 h-full bg-cyan-500 transition-all duration-300"
                                  style={{ width: `${Math.min(100, car.acceleration * 10)}%` }}
                                />
                              </div>
                            </div>
                            {/* Handling */}
                            <div>
                              <div className="flex justify-between text-[9px] font-bold text-zinc-500 mb-1">
                                <span>HANDLING</span>
                                <span>{Math.round(car.handling * 10)}%</span>
                              </div>
                              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden relative">
                                <div
                                  className="absolute left-0 top-0 h-full bg-cyan-500 transition-all duration-300"
                                  style={{ width: `${Math.min(100, car.handling * 10)}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setQuickPlayCarId(car.id);
                              setQuickPlayStep('map');
                            }}
                            className="w-full py-2 rounded-xl text-xs font-black bg-cyan-600 hover:bg-cyan-500 text-white transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.1)] hover:shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                          >
                            SELECT CAR
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* 2b. Quick Play Map Selection */}
                {quickPlayStep === 'map' && (
                  <>
                    <div className="flex justify-between items-center pb-4 border-b border-zinc-900 shrink-0">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-extrabold tracking-[0.4em] text-cyan-400 uppercase italic">
                            QUICK PLAY
                          </span>
                          {(() => {
                            const chosenCar = CARS_DATABASE.find(c => c.id === quickPlayCarId);
                            return chosenCar ? (
                              <span className="text-[9px] font-bold tracking-wider text-zinc-400 bg-zinc-900 border border-zinc-850 px-2.5 py-0.5 rounded-lg uppercase">
                                Vehicle: {chosenCar.brand} {chosenCar.name}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <h2 className="text-2xl font-black text-white tracking-wider uppercase">
                          SELECT CIRCUIT
                        </h2>
                      </div>
                      <button
                        onClick={() => setQuickPlayStep('car')}
                        className="px-5 py-2.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-xs font-black tracking-widest text-zinc-300 rounded-xl transition-all cursor-pointer"
                      >
                        BACK
                      </button>
                    </div>

                    <div className="flex flex-col gap-3 overflow-y-auto pr-1 flex-1 py-1">
                      {TRACKS_DATABASE.filter((t) => t.id !== 'license' && t.id !== 'custom').map((track) => {
                        const length = getTrackLength(track.path.map((p) => ('isVector3' in p ? p : p.pos)));
                        return (
                          <div
                            key={track.id}
                            className="bg-zinc-900/40 border border-zinc-850 p-4 rounded-2xl flex items-center justify-between gap-4"
                          >
                            <div className="flex-1 text-left">
                              <h4 className="font-extrabold text-white text-sm">{track.name}</h4>
                              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                                {track.description}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2.5">
                              <div className="text-right">
                                <span className="text-[10px] font-mono font-bold block text-zinc-500">
                                  0 CR (Quick Play)
                                </span>
                                <span className="text-[9px] font-mono text-zinc-555">{formatDistance(length)}</span>
                              </div>
                              <button
                                onClick={() => {
                                  if (quickPlayCarId) {
                                    startQuickPlayRace(quickPlayCarId, track.id);
                                  }
                                }}
                                className="px-5 py-2 rounded-xl text-xs font-black bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer transition-all shadow-[0_0_10px_rgba(6,182,212,0.1)] hover:shadow-[0_0_15px_rgba(6,182,212,0.25)]"
                              >
                                RACE
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {/* 3. Career Mode Screen */}
            {driveSubMode === 'career' && (
              <>
                <div className="flex justify-between items-center pb-4 border-b border-zinc-900 shrink-0">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-extrabold tracking-[0.4em] text-rose-500 uppercase italic">
                      VELOCITY
                    </span>
                    <h2 className="text-2xl font-black text-white tracking-wider uppercase">
                      CAREER CHALLENGES
                    </h2>
                  </div>
                  <button
                    onClick={() => setDriveSubMode(null)}
                    className="px-5 py-2.5 border border-zinc-850 hover:border-zinc-750 bg-zinc-900 hover:bg-zinc-850 text-xs font-black tracking-widest text-rose-500 rounded-xl transition-all cursor-pointer"
                  >
                    BACK
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-6 py-1 scrollbar-thin">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
                    {/* Driving School */}
                    <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between gap-4 text-left">
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
                        <p className="text-xs text-zinc-400 leading-relaxed text-left">
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
                    <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between gap-4 text-left">
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
                        <p className="text-xs text-zinc-400 leading-relaxed text-left">
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
                    <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-4 text-left">
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
                            <div key={tier.id} className="bg-zinc-950 border border-zinc-855 p-3 rounded-xl text-left">
                              <div className="flex items-center justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${styles.icon}`}>
                                    <Award className={`w-4 h-4 ${styles.accent}`} />
                                  </div>
                                  <div>
                                    <div className="text-xs font-extrabold text-white uppercase">{tier.name}</div>
                                    <div className="text-[9px] font-mono text-zinc-550">{completed}/10 COMPLETE</div>
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
                                          : 'bg-zinc-900 border-zinc-800 text-zinc-650 cursor-not-allowed'
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0 mt-2">
                    {/* Map Editor */}
                    <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between gap-4 text-left">
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
                        <p className="text-xs text-zinc-400 leading-relaxed text-left font-normal">
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
                    <div className="md:col-span-2 bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-3 max-h-[300px] overflow-y-auto text-left">
                      <span className="text-[10px] font-bold text-rose-500 tracking-wider uppercase text-left">CIRCUIT RACING CHALLENGES</span>

                      <div className="flex flex-col gap-3">
                        {TRACKS_DATABASE.filter((t) => t.id !== 'license' && t.id !== 'custom').map((track) => {
                          const isLocked = track.requiresLicense && !hasLicense;
                          const length = getTrackLength(track.path.map((p) => ('isVector3' in p ? p : p.pos)));
                          return (
                            <div
                              key={track.id}
                              className="bg-zinc-950 border border-zinc-850 p-4 rounded-xl flex items-center justify-between gap-4"
                            >
                              <div className="flex-1 text-left">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-extrabold text-white text-sm">{track.name}</h4>
                                  {isLocked && <Lock className="w-3.5 h-3.5 text-zinc-550" />}
                                </div>
                                <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed text-left font-normal">
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
              </>
            )}
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
