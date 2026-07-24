'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Coins, HelpCircle, Compass, Award, Lock, Paintbrush, Play, Timer, LogOut, Wrench, Settings, Check, Map as MapIcon, Trophy, Building2, Trees, FlagTriangleRight, Route, ChevronLeft, ChevronRight } from 'lucide-react';
import * as THREE from 'three';
import { CARS_DATABASE, CarConfig } from '../config/CarDatabase';
import { TRACKS_DATABASE, TrackConfig } from '../config/TrackDatabase';
import { Vehicle } from '../objects/Vehicle';
import type { DrivingMode } from '../option';
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

const DealerThreeCarIcon = ({
  car,
  className = "dealer-three-car absolute left-[80%] top-1/2 z-10",
  centerModel = false,
  isSliderIcon = false
}: {
  car: CarConfig;
  className?: string;
  centerModel?: boolean;
  isSliderIcon?: boolean;
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [staticImageUrl, setStaticImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // For slider icons, we'll render one frame, export as image, then dispose
    // For dealer icons, we keep the persistent animation loop
    const shouldCenter = centerModel || isSliderIcon;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
    camera.position.set(3.2, 1.0, 5.0);
    camera.lookAt(0, isSliderIcon ? 0 : 0.55, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: isSliderIcon });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    if (!isSliderIcon) {
      mount.appendChild(renderer.domElement);
    }

    const paint = new THREE.Color('#ff0258');
    const silhouetteMat = new THREE.MeshStandardMaterial({
      color: paint,
      roughness: 0.28,
      metalness: 0.42,
      emissive: paint,
      emissiveIntensity: 0.18,
    });
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x050507,
      roughness: 0.32,
      metalness: 0.18,
    });
    const displayRoot = new THREE.Group();
    displayRoot.rotation.y = isSliderIcon ? -Math.PI / 4 : -0.55;
    displayRoot.rotation.x = -0.08;
    scene.add(displayRoot);

    let isGltfLoaded = car.id !== 'honda_s2000' && car.id !== 'ford_gt_2006' && car.id !== 'cybertruck';
    const iconVehicle = new Vehicle(car.id, car.color, undefined, undefined, () => {
      isGltfLoaded = true;
    });
    iconVehicle.mesh.rotation.y = 269.8 + (isSliderIcon ? (130 * Math.PI) / 180 : 0);
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

    let lastFitSignature: string | null = null;
    let isFitted = false;
    const fitVehicleToIcon = () => {
      // Refit only when the vehicle mesh changes, such as after an async GLTF load.
      const meshSignature = iconVehicle.mesh.children.map((child) => child.uuid).join('|');
      if (meshSignature === lastFitSignature) return;

      iconVehicle.mesh.scale.setScalar(1);
      iconVehicle.mesh.position.set(0, 0, 0);
      if (!isSliderIcon) {
        applySilhouetteMaterials();
      } else {
        iconVehicle.mesh.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          if (object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((mat) => {
              if ('metalness' in mat) mat.metalness = 0.0;
              if ('roughness' in mat) mat.roughness = 0.85;
              if ('clearcoat' in mat) mat.clearcoat = 0.0;
              if ('clearcoatRoughness' in mat) mat.clearcoatRoughness = 1.0;
            });
          }
        });
      }
      iconVehicle.mesh.updateMatrixWorld(true);
      const box = getVehicleLocalBox();
      if (box.isEmpty()) return;

      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const maxSize = Math.max(size.x, size.y, size.z, 0.1);
      const scale = 5.25 / maxSize;
      iconVehicle.mesh.scale.setScalar(scale);
      if (isSliderIcon) {
        iconVehicle.mesh.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      } else {
        iconVehicle.mesh.position.set(-center.x * scale, -box.min.y * scale - 0.55, -center.z * scale);
      }
      lastFitSignature = meshSignature;
      isFitted = true;
    };
    fitVehicleToIcon();

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
    floor.position.y = isSliderIcon ? -999 : -0.02;
    scene.add(floor);

    const resize = () => {
      const width = isSliderIcon ? (mount.clientWidth || 112) : 112;
      const height = isSliderIcon ? (mount.clientHeight || 64) : 64;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();

    // For slider icons: render to static image to free up WebGL context
    if (isSliderIcon) {
      let sliderFrameId = 0;
      let sliderRetryCount = 0;
      const maxRetries = 600; // ~10 seconds at 60fps for GLTF model downloads

      const tryRenderStatic = () => {
        fitVehicleToIcon();
        renderer.render(scene, camera);

        if (isFitted && isGltfLoaded && sliderRetryCount > 3) {
          // Model is loaded and fitted, capture the image
          const dataUrl = renderer.domElement.toDataURL('image/png');
          setStaticImageUrl(dataUrl);

          // Dispose everything - free the WebGL context
          renderer.dispose();
          scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.geometry.dispose();
              const materials = Array.isArray(object.material) ? object.material : [object.material];
              materials.forEach((material) => material.dispose());
            }
          });
          return;
        }

        sliderRetryCount++;
        if (sliderRetryCount < maxRetries) {
          sliderFrameId = requestAnimationFrame(tryRenderStatic);
        }
      };
      sliderFrameId = requestAnimationFrame(tryRenderStatic);

      return () => {
        cancelAnimationFrame(sliderFrameId);
        try { renderer.dispose(); } catch { }
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
      };
    }

    // For dealer icons: keep the persistent animation loop
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
  }, [car.id, car.color, car.hasSpoiler, centerModel, isSliderIcon]);

  // For slider icons, render a static image instead of a live WebGL canvas
  if (isSliderIcon) {
    return (
      <div ref={mountRef} className={className} aria-hidden="true">
        {staticImageUrl && (
          <img
            src={staticImageUrl}
            alt={car.name}
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
        )}
      </div>
    );
  }

  return <div ref={mountRef} className={className} aria-hidden="true" />;
};

export function DrivingModeSelector({
  drivingMode,
  setDrivingMode,
  className = '',
  shortLabel = false,
}: {
  drivingMode: DrivingMode;
  setDrivingMode: (mode: DrivingMode) => void;
  className?: string;
  shortLabel?: boolean;
}) {
  const isArcade = drivingMode === 'arcade';

  return (
    <div
      className={`relative flex items-center p-[3px] bg-black/60 border border-white/10 rounded-full select-none cursor-pointer overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] ${className}`}
    >
      {/* Animated Sliding Indicator */}
      <div
        className="absolute top-[3px] bottom-[3px] w-[calc(50%-4px)] rounded-full transition-all duration-300 cubic-bezier(0.25, 1, 0.5, 1) flex items-center justify-center bg-rose-600 shadow-[0_0_8px_rgba(244,63,94,0.35)]"
        style={{
          left: isArcade ? '3px' : 'calc(50% + 1px)',
        }}
      />

      {/* Arcade Button */}
      <button
        type="button"
        onClick={() => setDrivingMode('arcade')}
        className={`flex-1 py-1.5 text-[9.5px] uppercase tracking-wider transition-all duration-300 z-10 text-center cursor-pointer ${isArcade
          ? 'text-white font-bold'
          : 'text-zinc-400/80 font-medium hover:text-zinc-200'
          }`}
      >
        Arcade
      </button>

      {/* Simulation/Sim Button */}
      <button
        type="button"
        onClick={() => setDrivingMode('simulation')}
        className={`flex-1 py-1.5 text-[9.5px] uppercase tracking-wider transition-all duration-300 z-10 text-center cursor-pointer ${!isArcade
          ? 'text-white font-bold'
          : 'text-zinc-400/80 font-medium hover:text-zinc-200'
          }`}
      >
        {shortLabel ? 'Sim' : 'Simulation'}
      </button>
    </div>
  );
}

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
type DealerMarketMode = 'new' | 'used' | 'race' | 'museum';
type DealerPage = 'map' | 'city';
type QuickPlayStep = 'map' | 'car';
type QuickPlayMapFilter = 'city' | 'forest' | 'racetrack';
type QuickPlayDifficulty = 'easy' | 'normal' | 'hard' | 'veryHard';

interface QuickPlayMapMeta {
  category: QuickPlayMapFilter;
  logo: string;
  location: string;
  surface: string;
  accent: string;
  backgroundImage: string;
  city: DealerCityId;
}

const QUICK_PLAY_TRACK_META: Record<string, QuickPlayMapMeta> = {
  sprint_circuit: {
    category: 'city',
    logo: 'SC',
    location: 'Metro Sprint',
    surface: 'Street circuit',
    accent: '#06b6d4',
    backgroundImage: 'radial-gradient(circle at 68% 28%, rgba(6, 182, 212, 0.24), transparent 34%), linear-gradient(115deg, rgba(8, 47, 73, 0.68), rgba(2, 6, 23, 0.96)), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
    city: 'west'
  },
  pro_race: {
    category: 'city',
    logo: 'PR',
    location: 'Night Core',
    surface: 'Technical city loop',
    accent: '#f43f5e',
    backgroundImage: 'radial-gradient(circle at 74% 22%, rgba(244, 63, 94, 0.26), transparent 36%), linear-gradient(125deg, rgba(76, 5, 25, 0.72), rgba(9, 9, 11, 0.96)), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
    city: 'west'
  },
  tokyo_megaloop: {
    category: 'city',
    logo: 'TM',
    location: 'Tokyo Highway',
    surface: 'High speed expressway',
    accent: '#38bdf8',
    backgroundImage: 'radial-gradient(circle at 62% 30%, rgba(56, 189, 248, 0.22), transparent 34%), linear-gradient(120deg, rgba(12, 74, 110, 0.66), rgba(0, 0, 0, 0.96)), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
    city: 'east'
  },
  canopy_speedway: {
    category: 'forest',
    logo: '/logo/canopy_speedway.svg',
    location: 'Canopy Belt',
    surface: 'Forest speedway',
    accent: '#22c55e',
    backgroundImage: 'radial-gradient(circle at 68% 24%, rgba(34, 197, 94, 0.24), transparent 34%), linear-gradient(125deg, rgba(20, 83, 45, 0.68), rgba(3, 7, 18, 0.96)), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
    city: 'north'
  },
  east_hill_mountain: {
    category: 'forest',
    logo: '/logo/east_hill_mountain.svg',
    location: 'East Hill',
    surface: 'Mountain grassland',
    accent: '#84cc16',
    backgroundImage: 'radial-gradient(circle at 70% 30%, rgba(132, 204, 22, 0.22), transparent 34%), linear-gradient(120deg, rgba(63, 98, 18, 0.58), rgba(9, 9, 11, 0.97)), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
    city: 'south'
  },
  driver_dojo: {
    category: 'forest',
    logo: 'DD',
    location: 'Proving Grounds',
    surface: 'Natural test route',
    accent: '#eab308',
    backgroundImage: 'radial-gradient(circle at 66% 24%, rgba(234, 179, 8, 0.24), transparent 34%), linear-gradient(130deg, rgba(113, 63, 18, 0.56), rgba(9, 9, 11, 0.97)), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
    city: 'north'
  },
  fuji_speedway: {
    category: 'racetrack',
    logo: 'FS',
    location: 'Fuji Speedway',
    surface: 'Real world circuit',
    accent: '#f97316',
    backgroundImage: 'radial-gradient(circle at 70% 24%, rgba(249, 115, 22, 0.25), transparent 34%), linear-gradient(120deg, rgba(124, 45, 18, 0.62), rgba(9, 9, 11, 0.97)), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
    city: 'east'
  }
};

const QUICK_PLAY_MAP_FILTERS: Array<{
  id: QuickPlayMapFilter;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
    { id: 'city', label: 'City maps', Icon: Building2 },
    { id: 'forest', label: 'Forest maps', Icon: Trees },
    { id: 'racetrack', label: 'Real race tracks', Icon: FlagTriangleRight }
  ];

const QUICK_PLAY_DIFFICULTIES: Array<{
  id: QuickPlayDifficulty;
  label: string;
}> = [
    { id: 'easy', label: 'Easy' },
    { id: 'normal', label: 'Normal' },
    { id: 'hard', label: 'Hard' },
    { id: 'veryHard', label: 'Very Hard' }
  ];

interface BrandLore {
  name: string;
  origin: string;
  established: string;
  specialty: string;
  description: string;
  achievements: string[];
  signatureCarId: string;
  signatureCarName: string;
}

const BRAND_LORE: Record<string, BrandLore> = {
  Toyota: {
    name: 'Toyota',
    origin: 'Japan',
    established: '1937',
    specialty: 'Reliability & Drift Heritage',
    description: 'From pioneering hybrid street technology to dominating the gravel of the World Rally Championship and the asphalt of Le Mans, Toyota has built a legacy of speed, engineering precision, and indestructible performance.',
    achievements: [
      'Four consecutive Le Mans 24 Hours victories (2018-2021)',
      'Multiple WRC Manufacturer titles with the GR Yaris',
      'The legendary AE86 and Supra defined modern drifting culture'
    ],
    signatureCarId: 'driftmaster',
    signatureCarName: 'Tokyo Driftmaster'
  },
  Nissan: {
    name: 'Nissan',
    origin: 'Japan',
    established: '1933',
    specialty: 'Turbocharged Precision & GT-R Legend',
    description: 'Known worldwide for the legendary "Godzilla" Skyline and Z-car bloodlines, Nissan is synonymous with high-performance sports cars, twin-turbocharged street machines, and absolute racing control.',
    achievements: [
      'Bathurst 12 Hour victories and JTCC domination with Skyline GT-R',
      'Pioneering Super GT GT500 engineering innovations',
      'Unmatched street tuner status with RB26 and SR20 engines'
    ],
    signatureCarId: 'sport',
    signatureCarName: 'Volt Interceptor'
  },
  Honda: {
    name: 'Honda',
    origin: 'Japan',
    established: '1948',
    specialty: 'VTEC Revs & Front-Wheel-Drive Dominance',
    description: 'Driven by the philosophy of "The Power of Dreams," Honda created some of the most rev-happy naturally-aspirated engines in history. Their racing bloodline runs deep, from Formula 1 engines to FWD track records.',
    achievements: [
      'Engineered the legendary NSX supercar with Ayrton Senna\'s input',
      'FWD records at Nürburgring Nordschleife with Civic Type R',
      'Dominant Formula 1 engine supplier across multiple championship eras'
    ],
    signatureCarId: 'honda_s2000',
    signatureCarName: 'S2000 Roadster'
  },
  Ford: {
    name: 'Ford',
    origin: 'USA',
    established: '1903',
    specialty: 'V8 Muscle & Le Mans Pedigree',
    description: 'Ford forged its legacy in raw steel, V8 rumble, and international racing dominance. They famously challenged and beat the world\'s best at Le Mans with the GT40, and continue to dominate Rally stages worldwide.',
    achievements: [
      'Historic 1-2-3 finish at Le Mans 24 Hours in 1966 with GT40',
      'Decades of rally supremacy with Escort, Focus, and Puma WRC models',
      'The Mustang remains the world\'s best-selling sports coupe'
    ],
    signatureCarId: 'ford_gt_2006',
    signatureCarName: 'Ford GT 2006'
  },
  Tesla: {
    name: 'Tesla',
    origin: 'USA',
    established: '2003',
    specialty: 'Instant Electric Torque & Tech Integration',
    description: 'Tesla revolutionized the automotive landscape by proving that electric cars can be faster, sleeker, and more technologically advanced than traditional combustion vehicles. Instant torque redefined acceleration standards.',
    achievements: [
      'Pioneered Plaid tri-motor powertrain pushing 0-60 in under 2 seconds',
      'Instantaneous torque delivery outpaces traditional combustion supercars',
      'Setting EV track records at Laguna Seca and Nürburgring'
    ],
    signatureCarId: 'solaris',
    signatureCarName: 'Solaris eV'
  },
  Porsche: {
    name: 'Porsche',
    origin: 'Germany',
    established: '1931',
    specialty: 'Rear-Engine Perfection & Surgical Handling',
    description: 'For Porsche, there is no substitute. By perfecting the rear-engine layout of the iconic 911, they created the benchmark for modern sports cars, blending track-focused capability with everyday usability.',
    achievements: [
      'Most overall victories at Le Mans 24 Hours (19 wins)',
      'The 911 Carrera and GT3 series represent the pinnacle of track precision',
      '919 Hybrid Evo holds legendary outright lap records'
    ],
    signatureCarId: 'phantom',
    signatureCarName: 'Ghost Phantom'
  },
  Ferrari: {
    name: 'Ferrari',
    origin: 'Italy',
    established: '1939',
    specialty: 'Formula 1 Pedigree & Screaming V12s',
    description: 'Enzo Ferrari\'s passion was simple: build road cars only to fund the racing team. Ferrari represents the ultimate dream of speed, prestige, and screaming V12 engines, colored in signature Rosso Corsa.',
    achievements: [
      'The most successful team in Formula 1 history with over 240 wins',
      'Iconic supercars like the F40, Enzo, and LaFerrari set the standards',
      'Le Mans Centenary victory in 2023 returning to top tier'
    ],
    signatureCarId: 'vortex',
    signatureCarName: 'Vortex R'
  },
  Audi: {
    name: 'Audi',
    origin: 'Germany',
    established: '1909',
    specialty: 'Quattro AWD & High-Tech Performance',
    description: 'Guided by "Vorsprung durch Technik" (Progress through Technology), Audi revolutionized motorsport with the Quattro all-wheel-drive system. They went on to dominate rally, touring cars, and Le Mans prototypes.',
    achievements: [
      'Quattro system permanently changed the face of WRC Group B rallying',
      'Unprecedented Le Mans dominance with TDI diesel and Hybrid prototypes',
      'R8 supercar established Audi as a premier supercar builder'
    ],
    signatureCarId: 'quantum',
    signatureCarName: 'Quantum Flux'
  },
  Chevrolet: {
    name: 'Chevrolet',
    origin: 'USA',
    established: '1911',
    specialty: 'V8 Small-Block Muscle & Corvette Legacy',
    description: 'Chevrolet is the heart of American performance. Powered by the legendary Small-Block V8, cars like the Corvette and Camaro have brought track-slaying performance to the masses for over a century.',
    achievements: [
      'Corvette Racing dominates international GT endurance classes',
      'Small-block V8 is one of the most successful engine architectures in history',
      'Corvette C8 Z06 redefined American mid-engine capability'
    ],
    signatureCarId: 'blade',
    signatureCarName: 'Blade Runner'
  }
};

const DEALER_CITIES: Array<{
  id: DealerCityId;
  name: string;
  region: string;
  description: string;
  hoverDescription: string;
  brands: string[];
  accent: string;
}> = [
    {
      id: 'east',
      name: 'East City',
      region: 'Far East Imports',
      description: 'Japanese and street-spec imports line the neon port roads.',
      hoverDescription: 'East City stocks Toyota, Nissan, and Honda around a lantern street, compact towers, and late-night import shops.',
      brands: ['Toyota', 'Nissan', 'Honda'],
      accent: 'rose',
    },
    {
      id: 'west',
      name: 'West City',
      region: 'Far West Brands',
      description: 'A bridge city for American power and European exotics.',
      hoverDescription: 'West City wraps Ford, Tesla, Porsche, Ferrari, Audi, and Chevrolet around a red suspension bridge and bay road.',
      brands: ['Ford', 'Tesla', 'Porsche', 'Ferrari', 'Audi', 'Chevrolet'],
      accent: 'cyan',
    },
    {
      id: 'north',
      name: 'North City',
      region: 'Cold Line Exchange',
      description: 'A crisp city square with a tall steel landmark.',
      hoverDescription: 'North City is a specialist market under a tall steel tower, cold plazas, and narrow dealer lanes.',
      brands: ['Porsche', 'Audi'],
      accent: 'blue',
    },
    {
      id: 'south',
      name: 'South City',
      region: 'Coastal Auto Market',
      description: 'Coastal garages sit beside palms, marina roads, and tuned muscle.',
      hoverDescription: 'South City serves Chevrolet, Ford, and Toyota beside palm-lined roads, low garages, and a harbor lighthouse.',
      brands: ['Chevrolet', 'Ford', 'Toyota'],
      accent: 'amber',
    },
  ];

const getDealerCityCars = (city: DealerCityId | null) => {
  if (!city) return [];
  const cityConfig = DEALER_CITIES.find((item) => item.id === city);
  if (!cityConfig || cityConfig.brands.length === 0) return [];
  return CARS_DATABASE.filter((car) => cityConfig.brands.includes(car.brand));
};

const DEALER_CITY_LABEL_POSITIONS: Record<DealerCityId, { left: string; top: string }> = {
  west: { left: '52%', top: '56%' },
  north: { left: '78%', top: '48%' },
  east: { left: '86%', top: '61%' },
  south: { left: '72%', top: '82%' },
};

const BRAND_STOCK_IMAGES: Record<string, string> = {
  Ferrari: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=1920&q=80',
  Lamborghini: 'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?auto=format&fit=crop&w=1920&q=80',
  Porsche: 'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=1920&q=80',
  Nissan: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=1920&q=80',
  Toyota: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1920&q=80',
  Honda: 'https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?auto=format&fit=crop&w=1920&q=80',
  BMW: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1920&q=80',
  Mercedes: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1920&q=80',
  Audi: 'https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=1920&q=80',
  Bugatti: 'https://images.unsplash.com/photo-1541348263662-e082662dc370?auto=format&fit=crop&w=1920&q=80',
  McLaren: 'https://images.unsplash.com/photo-1621135802920-133df287f89c?auto=format&fit=crop&w=1920&q=80'
};
const DEFAULT_BRAND_STOCK_IMAGE = 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1920&q=80';

const getDealerBrandInitials = (brand: string) => {
  if (brand === 'Chevrolet') return 'CH';
  return brand.slice(0, 2).toUpperCase();
};

const getDealerBrandTone = (brand: string) => {
  const tones: Record<string, string> = {
    Toyota: 'from-rose-500/24 to-zinc-950 border-rose-400/45 text-rose-100',
    Nissan: 'from-red-500/20 to-zinc-950 border-red-300/40 text-red-100',
    Honda: 'from-sky-400/22 to-zinc-950 border-sky-300/45 text-sky-100',
    Ford: 'from-cyan-400/22 to-zinc-950 border-cyan-300/45 text-cyan-100',
    Tesla: 'from-fuchsia-400/20 to-zinc-950 border-fuchsia-300/40 text-fuchsia-100',
    Porsche: 'from-yellow-400/20 to-zinc-950 border-yellow-300/45 text-yellow-100',
    Ferrari: 'from-amber-400/24 to-zinc-950 border-amber-300/45 text-amber-100',
    Audi: 'from-zinc-200/18 to-zinc-950 border-zinc-300/40 text-zinc-100',
    Chevrolet: 'from-orange-400/22 to-zinc-950 border-orange-300/45 text-orange-100',
  };

  return tones[brand] || 'from-zinc-300/18 to-zinc-950 border-zinc-300/35 text-zinc-100';
};

const getBrandColor = (brand: string): string => {
  const colors: Record<string, string> = {
    Toyota: '#f59e0b',
    Nissan: '#f43f5e',
    Honda: '#3b82f6',
    Ford: '#06b6d4',
    Tesla: '#d946ef',
    Porsche: '#eab308',
    Ferrari: '#ef4444',
    Audi: '#a1a1aa',
    Chevrolet: '#f97316',
  };
  return colors[brand] || '#71717a';
};


const DealerHoverBar = ({ city }: { city: typeof DEALER_CITIES[number] | null }) => {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [activeCity, setActiveCity] = useState<typeof DEALER_CITIES[number] | null>(null);

  useEffect(() => {
    if (city) {
      setActiveCity(city);
    }
  }, [city]);

  useEffect(() => {
    if (!activeCity) return;
    const measure = () => {
      const windowEl = windowRef.current;
      const trackEl = trackRef.current;
      if (!windowEl || !trackEl) return;
      setIsOverflowing(trackEl.scrollWidth > windowEl.clientWidth + 2);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeCity?.hoverDescription]);

  const isVisible = !!city;

  return (
    <div className={`dealer-movie-bar pointer-events-none absolute inset-x-0 bottom-0 z-20 overflow-hidden border-y border-white/12 bg-black/92 px-5 py-4 text-center shadow-[0_0_35px_rgba(0,0,0,0.55)] transition-all duration-400 ease-in-out ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
      <div ref={windowRef} className="dealer-marquee-window text-sm font-bold text-zinc-100">
        <div ref={trackRef} className={`dealer-marquee-track ${isOverflowing ? 'is-overflowing' : 'is-centered'}`}>
          {activeCity?.hoverDescription || ''}
        </div>
      </div>
    </div>
  );
};

const MapDescriptionSlider = ({ description }: { description: string }) => {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const measure = () => {
      const windowEl = windowRef.current;
      const trackEl = trackRef.current;
      if (!windowEl || !trackEl) return;
      setIsOverflowing(trackEl.scrollWidth > windowEl.clientWidth + 2);
    };

    measure();
    const timer = setTimeout(measure, 60);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [description]);

  return (
    <div ref={windowRef} className="dealer-marquee-window text-xs font-semibold text-zinc-300">
      <div ref={trackRef} className={`dealer-marquee-track ${isOverflowing ? 'is-overflowing' : 'is-centered'}`}>
        {description}
      </div>
    </div>
  );
};

interface StaticWireframeCarProps {
  color: string;
}

const StaticWireframeCar: React.FC<StaticWireframeCarProps> = ({ color }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;
    const scale = Math.min(width, height) * 0.18;
    const cx = width / 2;
    const cy = height / 2 + 5;

    // Static angle (isometric view)
    const angle = 0.65;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Tilt slightly down
    const cosB = Math.cos(0.35);
    const sinB = Math.sin(0.35);

    // Define 3D vertices of a simplified car
    const vertices = [
      { x: -1.2, y: -0.3, z: 2.0 }, // FL
      { x: 1.2, y: -0.3, z: 2.0 },  // FR
      { x: 1.2, y: -0.3, z: -2.0 }, // RR
      { x: -1.2, y: -0.3, z: -2.0 },// RL

      { x: -1.2, y: 0.1, z: 1.2 },  // Hood L
      { x: 1.2, y: 0.1, z: 1.2 },   // Hood R
      { x: 1.2, y: 0.1, z: -1.7 },  // Trunk R
      { x: -1.2, y: 0.1, z: -1.7 }, // Trunk L

      { x: -0.8, y: 0.6, z: 0.3 },  // Roof Front L
      { x: 0.8, y: 0.6, z: 0.3 },   // Roof Front R
      { x: 0.8, y: 0.6, z: -0.9 },  // Roof Rear R
      { x: -0.8, y: 0.6, z: -0.9 }, // Roof Rear L
    ];

    // Edges
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
      [8, 9], [9, 10], [10, 11], [11, 8],
      [4, 8], [5, 9], [6, 10], [7, 11]
    ];

    const projected = vertices.map(v => {
      let x1 = v.x * cosA - v.z * sinA;
      let z1 = v.x * sinA + v.z * cosA;

      let y2 = v.y * cosB - z1 * sinB;
      let z2 = v.y * sinB + z1 * cosB;

      const fov = 3.0;
      const distance = 4.0;
      const factor = fov / (distance + z2);

      return {
        x: cx + x1 * factor * scale,
        y: cy - y2 * factor * scale
      };
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    edges.forEach(([p1, p2]) => {
      ctx.moveTo(projected[p1].x, projected[p1].y);
      ctx.lineTo(projected[p2].x, projected[p2].y);
    });
    ctx.stroke();

  }, [color]);

  return <canvas ref={canvasRef} width={130} height={70} className="w-full h-full" />;
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

const DealerCityMapScene = ({
  selectedCity,
  lastSelectedCity,
  hoveredCity,
  onHoverCity,
  onClickCity,
}: {
  selectedCity: DealerCityId | null;
  lastSelectedCity: DealerCityId | null;
  hoveredCity: DealerCityId | null;
  onHoverCity: (cityId: DealerCityId | null) => void;
  onClickCity: (cityId: DealerCityId) => void;
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const hoveredCityRef = useRef<DealerCityId | null>(hoveredCity);
  const selectedCityRef = useRef<DealerCityId | null>(selectedCity);
  const lastSelectedCityRef = useRef<DealerCityId | null>(lastSelectedCity);

  useEffect(() => {
    hoveredCityRef.current = hoveredCity;
  }, [hoveredCity]);

  useEffect(() => {
    selectedCityRef.current = selectedCity;
  }, [selectedCity]);

  useEffect(() => {
    lastSelectedCityRef.current = lastSelectedCity;
  }, [lastSelectedCity]);

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
      west: new THREE.Vector3(-3.8, 0, -1.6),
      north: new THREE.Vector3(-0.6, 0, -2.55),
      east: new THREE.Vector3(3.75, 0, -0.9),
      south: new THREE.Vector3(1.35, 0, 2.55),
    };

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(10.8, 0.12, 7.2),
      new THREE.MeshBasicMaterial({ color: 0x0b0f0d, transparent: true, opacity: 0.92 })
    );
    base.position.y = -0.08;
    mapRoot.add(base);

    const grid = new THREE.GridHelper(12, 24, 0x3f3f46, 0x27272a);
    grid.position.y = 0.01;
    mapRoot.add(grid);

    const roadMat = new THREE.MeshBasicMaterial({ color: 0x171719, transparent: true, opacity: 0.96 });
    const laneMat = new THREE.MeshBasicMaterial({ color: 0xb7b7a6, transparent: true, opacity: 0.42 });
    const grassMat = new THREE.MeshBasicMaterial({ color: 0x12311f, transparent: true, opacity: 0.76 });
    const trunkMat = new THREE.MeshBasicMaterial({ color: 0x6b3f20, transparent: true, opacity: 0.9 });
    const leafMat = new THREE.MeshBasicMaterial({ color: 0x2f8f46, transparent: true, opacity: 0.9 });
    const roofMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0d, transparent: true, opacity: 0.9 });
    const glowMats = Object.fromEntries(
      DEALER_CITIES.map((city) => [
        city.id,
        new THREE.MeshBasicMaterial({
          color: cityColors[city.id],
          transparent: true,
          opacity: selectedCityRef.current === city.id || selectedCityRef.current === null ? 0.34 : 0.12,
        }),
      ])
    ) as Record<DealerCityId, THREE.MeshBasicMaterial>;

    const makeRoad = (x: number, z: number, width: number, depth: number, rotation = 0, lane = true) => {
      const road = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, depth), roadMat);
      road.position.set(x, 0.04, z);
      road.rotation.y = rotation;
      mapRoot.add(road);
      if (lane) {
        const laneStrip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.84, 0.012, Math.max(depth * 0.08, 0.018)), laneMat);
        laneStrip.position.set(x, 0.068, z);
        laneStrip.rotation.y = rotation;
        mapRoot.add(laneStrip);
      }
      return road;
    };

    makeRoad(0, -0.05, 9.6, 0.28, -0.1);
    makeRoad(-1.65, -0.05, 0.26, 5.7, 0.34);
    makeRoad(2.35, 0.55, 0.26, 5.4, -0.48);
    makeRoad(-0.2, -2.35, 6.3, 0.22, 0.12);
    makeRoad(0.6, 2.35, 7.2, 0.22, -0.18);
    makeRoad(-4.1, 0.75, 0.22, 3.7, -0.72);
    makeRoad(3.78, 0.92, 0.22, 3.3, 0.64);

    const parkPatches = [
      [-3.05, 1.8, 1.3, 0.75, 0.16],
      [3.18, 1.72, 1.05, 0.62, -0.22],
      [0.1, -1.05, 0.95, 0.54, 0.4],
    ];
    parkPatches.forEach(([x, z, width, depth, rotation]) => {
      const park = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, depth), grassMat);
      park.position.set(x, 0.055, z);
      park.rotation.y = rotation;
      mapRoot.add(park);
    });

    const makeTree = (x: number, z: number, scale = 1) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * scale, 0.045 * scale, 0.28 * scale, 6), trunkMat);
      trunk.position.y = 0.22 * scale;
      tree.add(trunk);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.18 * scale, 0.42 * scale, 8), leafMat);
      leaves.position.y = 0.56 * scale;
      tree.add(leaves);
      tree.position.set(x, 0.04, z);
      mapRoot.add(tree);
      return tree;
    };

    [
      [-4.7, 1.55, 0.9], [-4.25, 2.05, 1], [-3.5, 1.55, 0.8], [-2.7, 2.16, 0.9],
      [2.55, 1.65, 0.85], [3.05, 2.08, 0.9], [3.7, 1.58, 0.75],
      [-0.7, -0.98, 0.72], [0.34, -1.15, 0.72],
    ].forEach(([x, z, scale]) => makeTree(x, z, scale));

    // Raycasting setup
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let raycastHoveredCity: DealerCityId | null = null;

    // Map each city's meshes to its cityId for raycasting
    const meshToCityId = new Map<THREE.Object3D, DealerCityId>();

    const cityGroups: Partial<Record<DealerCityId, THREE.Group>> = {};
    // Store per-city materials for hover effects
    const cityMaterials: Partial<Record<DealerCityId, {
      pad: THREE.MeshBasicMaterial;
      ring: THREE.MeshBasicMaterial;
      buildingMats: THREE.MeshBasicMaterial[];
    }>> = {};

    const makeLandmark = (cityId: DealerCityId, color: number) => {
      const landmark = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 });
      const darkDetailMat = new THREE.MeshBasicMaterial({ color: 0x050507, transparent: true, opacity: 0.88 });

      if (cityId === 'west') {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.12), mat);
        deck.position.set(0, 0.72, -0.78);
        landmark.add(deck);
        [-0.62, 0.62].forEach((x) => {
          const tower = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), mat);
          tower.position.set(x, 0.92, -0.78);
          landmark.add(tower);
          const cable = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.035), mat);
          cable.position.set(x / 2, 1.28, -0.78);
          cable.rotation.z = x < 0 ? 0.34 : -0.34;
          landmark.add(cable);
        });
      } else if (cityId === 'north') {
        const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.56, 0.16, 4), mat);
        towerBase.position.set(0, 0.58, -0.62);
        towerBase.rotation.y = Math.PI / 4;
        landmark.add(towerBase);
        const towerMid = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.18, 4), mat);
        towerMid.position.set(0, 1.18, -0.62);
        towerMid.rotation.y = Math.PI / 4;
        landmark.add(towerMid);
        const towerCut = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 0.09), darkDetailMat);
        towerCut.position.set(0, 1.03, -0.62);
        landmark.add(towerCut);
      } else if (cityId === 'east') {
        const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.92, 0.12), mat);
        leftPost.position.set(-0.42, 0.86, -0.7);
        landmark.add(leftPost);
        const rightPost = leftPost.clone();
        rightPost.position.x = 0.42;
        landmark.add(rightPost);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 0.14), mat);
        beam.position.set(0, 1.3, -0.7);
        landmark.add(beam);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.08, 0.18), roofMat);
        roof.position.set(0, 1.46, -0.7);
        landmark.add(roof);
      } else {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.9, 12), mat);
        body.position.set(0.36, 0.9, -0.62);
        landmark.add(body);
        const light = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.2, 12), new THREE.MeshBasicMaterial({ color: 0xfff3a3, transparent: true, opacity: 0.9 }));
        light.position.set(0.36, 1.45, -0.62);
        landmark.add(light);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 12), roofMat);
        cap.position.set(0.36, 1.66, -0.62);
        landmark.add(cap);
      }

      return landmark;
    };

    DEALER_CITIES.forEach((city) => {
      const cityGroup = new THREE.Group();
      const position = cityPositions[city.id];
      cityGroup.position.copy(position);
      cityGroups[city.id] = cityGroup;

      const isActive = selectedCityRef.current === city.id || selectedCityRef.current === null;
      const color = cityColors[city.id];

      const padMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isActive ? 0.42 : 0.16 });
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.92, 1.08, 0.16, 6),
        padMat
      );
      pad.position.y = 0.12;
      pad.rotation.y = Math.PI / 6;
      cityGroup.add(pad);
      meshToCityId.set(pad, city.id);

      const ringMat = glowMats[city.id];
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.08, 0.035, 8, 36),
        ringMat
      );
      ring.position.y = 0.24;
      ring.rotation.x = Math.PI / 2;
      cityGroup.add(ring);
      meshToCityId.set(ring, city.id);

      const buildingMats: THREE.MeshBasicMaterial[] = [];
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
        if (index % 2 === 0) buildingMats.push(buildingMat);
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.32, height, 0.32), mat);
        block.position.set(x, 0.24 + height / 2, z);
        cityGroup.add(block);
        meshToCityId.set(block, city.id);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.035, 0.38), roofMat);
        roof.position.set(x, 0.27 + height, z);
        cityGroup.add(roof);
        meshToCityId.set(roof, city.id);
      });

      const landmark = makeLandmark(city.id, color);
      cityGroup.add(landmark);
      landmark.traverse((child) => {
        if (child instanceof THREE.Mesh) meshToCityId.set(child, city.id);
      });

      cityMaterials[city.id] = { pad: padMat, ring: ringMat, buildingMats };
      mapRoot.add(cityGroup);
    });

    // Add invisible hit-test spheres for easier raycasting
    const hitSpheres: THREE.Mesh[] = [];
    DEALER_CITIES.forEach((city) => {
      const hitSphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.3, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitSphere.position.copy(cityPositions[city.id]);
      hitSphere.position.y = 0.5;
      mapRoot.add(hitSphere);
      hitSpheres.push(hitSphere);
      meshToCityId.set(hitSphere, city.id);
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

    const t1 = setTimeout(resize, 100);
    const t2 = setTimeout(resize, 350);
    const t3 = setTimeout(resize, 750);

    // Mouse event handlers for raycasting
    const onMouseMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onClick = () => {
      if (raycastHoveredCity) {
        onClickCity(raycastHoveredCity);
      }
    };

    const onMouseLeave = () => {
      mouse.x = -999;
      mouse.y = -999;
      if (raycastHoveredCity !== null) {
        raycastHoveredCity = null;
        onHoverCity(null);
      }
    };

    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mouseleave', onMouseLeave);
    renderer.domElement.style.cursor = 'default';

    let frameId = 0;
    const startTime = performance.now();
    let lastTime = performance.now();
    let zoomProgress = 0;
    let lastActiveCityId: DealerCityId | null = selectedCityRef.current;

    if (selectedCityRef.current === null && lastSelectedCityRef.current !== null) {
      zoomProgress = 1;
      lastActiveCityId = lastSelectedCityRef.current;
    }

    const animate = (time: number) => {
      const t = (time - startTime) / 1000;
      mapRoot.rotation.y = Math.sin(t * 0.18) * 0.05;

      const now = performance.now();
      const deltaTime = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Update zoom progress
      const isZoomed = selectedCityRef.current !== null;
      if (isZoomed) {
        zoomProgress = Math.min(1, zoomProgress + deltaTime / 0.68);
      } else {
        zoomProgress = Math.max(0, zoomProgress - deltaTime / 0.68);
      }

      if (selectedCityRef.current) {
        lastActiveCityId = selectedCityRef.current;
      }

      // Cosine ease-in-out
      const easeT = 0.5 - Math.cos(zoomProgress * Math.PI) / 2;

      const defaultCamPos = new THREE.Vector3(0, 8.5, 11);
      const defaultLookAt = new THREE.Vector3(0, 0, 0);

      const targetCamPos = new THREE.Vector3().copy(defaultCamPos);
      const targetLookAt = new THREE.Vector3().copy(defaultLookAt);

      const activeCityId = selectedCityRef.current || lastActiveCityId;
      if (activeCityId) {
        const cityPos = cityPositions[activeCityId];
        const zoomedCamPos = cityPos.clone().addScaledVector(defaultCamPos, 0.28);
        targetCamPos.lerpVectors(defaultCamPos, zoomedCamPos, easeT);
        targetLookAt.lerpVectors(defaultLookAt, cityPos, easeT);
      }

      camera.position.copy(targetCamPos);
      camera.lookAt(targetLookAt);

      // Raycast to detect hovered city
      raycaster.setFromCamera(mouse, camera);
      const allHitTargets = [...hitSpheres];
      // Also test city group meshes
      DEALER_CITIES.forEach((city) => {
        const group = cityGroups[city.id];
        if (group) {
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) allHitTargets.push(child);
          });
        }
      });
      const intersects = raycaster.intersectObjects(allHitTargets, false);
      let newRaycastHover: DealerCityId | null = null;
      for (const hit of intersects) {
        const cid = meshToCityId.get(hit.object);
        if (cid) {
          newRaycastHover = cid;
          break;
        }
      }
      if (newRaycastHover !== raycastHoveredCity) {
        raycastHoveredCity = newRaycastHover;
        onHoverCity(newRaycastHover);
      }

      // Determine effective hover: either from 3D raycast or from 2D card hover
      const effectiveHover = hoveredCityRef.current;

      // Update cursor
      renderer.domElement.style.cursor = raycastHoveredCity ? 'pointer' : 'default';

      DEALER_CITIES.forEach((city, index) => {
        const group = cityGroups[city.id];
        if (!group) return;
        const isHovered = effectiveHover === city.id;
        const isSelected = selectedCityRef.current === city.id || selectedCityRef.current === null;
        const target = isSelected ? 1 : 0.86;
        const hoverBoost = isHovered ? 1.12 : 1;
        const pulse = 1 + Math.sin(t * 1.4 + index) * 0.035;
        group.scale.setScalar(target * pulse * hoverBoost);
        const baseY = Math.sin(t * 1.2 + index * 0.7) * 0.04;
        group.position.y = isHovered ? baseY + 0.15 : baseY;

        // Update material opacities for hover glow
        const mats = cityMaterials[city.id];
        if (mats) {
          const padTarget = isHovered ? 0.72 : (isSelected ? 0.42 : 0.16);
          const ringTarget = isHovered ? 0.65 : (isSelected ? 0.34 : 0.12);
          const buildingTarget = isHovered ? 1.0 : (isSelected ? 0.72 : 0.25);
          mats.pad.opacity += (padTarget - mats.pad.opacity) * 0.12;
          mats.ring.opacity += (ringTarget - mats.ring.opacity) * 0.12;
          mats.buildingMats.forEach((bm) => {
            bm.opacity += (buildingTarget - bm.opacity) * 0.12;
          });
        }
      });

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('mouseleave', onMouseLeave);
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
  }, [onHoverCity, onClickCity]);

  return <div ref={mountRef} className="absolute inset-0 z-[1]" aria-hidden="true" />;
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

const getTrackVectors = (track: TrackConfig) => (
  track.path.map((point) => ('isVector3' in point ? point : point.pos))
);

const getRaceableQuickPlayTracks = () => (
  TRACKS_DATABASE.filter((track) => track.id !== 'license' && track.id !== 'custom')
);

const getQuickPlayTrackMeta = (track: TrackConfig): QuickPlayMapMeta => (
  QUICK_PLAY_TRACK_META[track.id] || {
    category: 'city',
    logo: track.name.slice(0, 2).toUpperCase(),
    location: 'Quick Play',
    surface: 'Circuit route',
    accent: '#06b6d4',
    backgroundImage: 'radial-gradient(circle at 68% 28%, rgba(6, 182, 212, 0.22), transparent 34%), linear-gradient(115deg, rgba(8, 47, 73, 0.58), rgba(0, 0, 0, 0.96)), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
    city: 'west'
  }
);

const getDefaultQuickPlayTrackId = (category: QuickPlayMapFilter = 'city') => {
  const tracks = getRaceableQuickPlayTracks();
  return tracks.find((track) => getQuickPlayTrackMeta(track).category === category)?.id || tracks[0]?.id || null;
};

const getQuickPlayTypeLabel = (category: QuickPlayMapFilter) => {
  if (category === 'racetrack') return 'Race Track';
  if (category === 'forest') return 'Forest Track';
  return 'City Track';
};

const getQuickPlayTypeIcon = (category: QuickPlayMapFilter) => (
  QUICK_PLAY_MAP_FILTERS.find((filter) => filter.id === category)?.Icon || Route
);

const getQuickPlayDifficultyLabel = (difficulty: QuickPlayDifficulty) => (
  QUICK_PLAY_DIFFICULTIES.find((item) => item.id === difficulty)?.label || 'Normal'
);

const getTrackPreviewPath = (track: TrackConfig, width = 100, height = 70, padding = 8) => {
  const points = getTrackVectors(track);
  if (!points.length) return '';

  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const rangeX = Math.max(maxX - minX, 1);
  const rangeZ = Math.max(maxZ - minZ, 1);

  const scaled = points.map((point) => {
    const x = padding + ((point.x - minX) / rangeX) * (width - padding * 2);
    const y = height - padding - ((point.z - minZ) / rangeZ) * (height - padding * 2);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  return `M ${scaled.join(' L ')} Z`;
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
  startQuickPlayRace: (carId: string, trackId: string, lapCount?: number, difficulty?: QuickPlayDifficulty, drivingMode?: DrivingMode, opponentCount?: number) => void;
  drivingMode: DrivingMode;
  setDrivingMode: (mode: DrivingMode) => void;
  startFreeRoam: () => void;
  startTutorial: () => void;
  startLicenseTest: (testId?: string) => void;
  handleDriveClick: () => void;
  handleBackToGarageClick: () => void;
  handleSettingClick: () => void;
  handleTuningClick: () => void;
  handleExitTuningClick: () => void;
  handleDealerClick: () => void;
  handleExitDealerClick: () => void;
  placeholderRef: React.RefObject<HTMLDivElement | null>;
  setActiveMode: (mode: any) => void;
  previewCar?: (carId: string) => void;
  onQuickPlayCarSelectChange?: (isCarSelect: boolean, isActiveCarSelectStep: boolean, isInteractable: boolean) => void;
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
  drivingMode,
  setDrivingMode,
  startFreeRoam,
  startTutorial,
  startLicenseTest,
  handleDriveClick,
  handleBackToGarageClick,
  handleSettingClick,
  handleTuningClick,
  handleExitTuningClick,
  handleDealerClick,
  handleExitDealerClick,
  placeholderRef,
  setActiveMode,
  previewCar,
  onQuickPlayCarSelectChange,
}: GarageProps) {

  // Local states for Drive Sub-modes
  const [driveSubMode, setDriveSubMode] = useState<null | 'quickplay' | 'career'>(null);
  const [quickPlayStep, setQuickPlayStep] = useState<QuickPlayStep>('map');
  const [quickPlayTrackId, setQuickPlayTrackId] = useState<string | null>(() => getDefaultQuickPlayTrackId('city'));
  const [quickPlayLapCount, setQuickPlayLapCount] = useState(3);
  const [quickPlayDifficulty, setQuickPlayDifficulty] = useState<QuickPlayDifficulty>('normal');
  const [quickPlaySelectedBrand, setQuickPlaySelectedBrand] = useState<string>('All');
  const [quickPlayCarId, setQuickPlayCarId] = useState<string | null>(null);
  const [dealerSelectedCarId, setDealerSelectedCarId] = useState<string | null>(null);
  const [quickPlayCarHasBeenClicked, setQuickPlayCarHasBeenClicked] = useState(false);
  const [quickPlayCarInteractable, setQuickPlayCarInteractable] = useState(true);

  React.useEffect(() => {
    if (quickPlaySelectedBrand !== 'All') {
      const brandCars = CARS_DATABASE.filter((car) => car.brand === quickPlaySelectedBrand);
      if (brandCars.length > 0) {
        const activeCarInBrand = brandCars.find((car) => car.id === (quickPlayCarId || activeCarId));
        if (activeCarInBrand) {
          setQuickPlayCarHasBeenClicked(true);
        } else {
          setQuickPlayCarId(brandCars[0].id);
          setQuickPlayCarHasBeenClicked(true);
        }
      }
    } else {
      setQuickPlayCarHasBeenClicked(false);
    }
    setQuickPlayCarInteractable(true);
  }, [quickPlaySelectedBrand]);

  React.useEffect(() => {
    setQuickPlayCarInteractable(true);
  }, [activeCarId, driveSubMode]);

  const [quickPlayMapFilter, setQuickPlayMapFilter] = useState<QuickPlayMapFilter>('city');
  const [lapChangeDir, setLapChangeDir] = useState<'up' | 'down'>('up');
  const [diffChangeDir, setDiffChangeDir] = useState<'up' | 'down'>('up');
  const [quickPlayOpponentCount, setQuickPlayOpponentCount] = useState(5);
  const [opponentsChangeDir, setOpponentsChangeDir] = useState<'up' | 'down'>('up');
  const [dealerPage, setDealerPage] = useState<DealerPage>('map');
  const [dealerCity, setDealerCity] = useState<DealerCityId | null>(null);
  const [hoveredCity, setHoveredCity] = useState<DealerCityId | null>(null);
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);
  const [lastSelectedCity, setLastSelectedCity] = useState<DealerCityId | null>(null);
  const [dealerMarketMode, setDealerMarketMode] = useState<DealerMarketMode | null>(null);
  const [dealerMapTransitioning, setDealerMapTransitioning] = useState(false);
  const [dealerExiting, setDealerExiting] = useState(false);
  const [dealerBrandTransitioning, setDealerBrandTransitioning] = useState(false);
  const dealerCityTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dealerExitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dealerBrandTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickPlayCarouselDragStartRef = useRef<number | null>(null);

  React.useEffect(() => {
    if (dealerCity) {
      setLastSelectedCity(dealerCity);
    }
  }, [dealerCity]);

  React.useEffect(() => {
    const isActiveStep = driveSubMode === 'quickplay' && quickPlayStep === 'car';
    const isCarSelect = isActiveStep;
    onQuickPlayCarSelectChange?.(isCarSelect, isActiveStep, quickPlayCarInteractable);
    return () => {
      onQuickPlayCarSelectChange?.(false, false, false);
    };
  }, [driveSubMode, quickPlayStep, quickPlaySelectedBrand, quickPlayCarHasBeenClicked, quickPlayCarInteractable, onQuickPlayCarSelectChange]);

  React.useEffect(() => {
    const isCarSelectStep = driveSubMode === 'quickplay' && quickPlayStep === 'car';
    if (isCarSelectStep && quickPlayCarId) {
      previewCar?.(quickPlayCarId);
    }
  }, [quickPlayCarId, driveSubMode, quickPlayStep, previewCar]);

  React.useEffect(() => {
    if (activeGarageTab === 'dealer' && dealerSelectedCarId) {
      previewCar?.(dealerSelectedCarId);
    }
  }, [dealerSelectedCarId, activeGarageTab, previewCar]);

  React.useEffect(() => {
    const isCarSelectStep = driveSubMode === 'quickplay' && quickPlayStep === 'car';
    if (!isCarSelectStep && activeGarageTab !== 'dealer') {
      previewCar?.(activeCarId);
    }
  }, [driveSubMode, quickPlayStep, activeGarageTab, activeCarId, previewCar]);

  React.useEffect(() => {
    const tracks = getRaceableQuickPlayTracks().filter(
      (track) => getQuickPlayTrackMeta(track).category === quickPlayMapFilter
    );
    if (tracks.length > 0) {
      const isCurrentTrackInFilter = tracks.some((t) => t.id === quickPlayTrackId);
      if (!isCurrentTrackInFilter) {
        setQuickPlayTrackId(tracks[0].id);
      }
    }
  }, [quickPlayMapFilter, quickPlayTrackId]);

  // Reset drive submode states when tab changes from drive
  React.useEffect(() => {
    if (activeGarageTab !== 'drive') {
      setDriveSubMode(null);
      setQuickPlayStep('map');
      setQuickPlayTrackId(getDefaultQuickPlayTrackId('city'));
      setQuickPlayLapCount(3);
      setQuickPlayDifficulty('normal');
      setQuickPlaySelectedBrand('All');
      setQuickPlayOpponentCount(5);
    }
  }, [activeGarageTab]);

  React.useEffect(() => {
    if (activeGarageTab !== 'dealer') {
      setDealerPage('map');
      setDealerCity(null);
      setHoveredCity(null);
      setDealerMarketMode(null);
      setDealerMapTransitioning(false);
      setDealerExiting(false);
      setDealerBrandTransitioning(false);
      setLastSelectedCity(null);
      if (selectedBrand !== 'All') setSelectedBrand('All');
    }
  }, [activeGarageTab, selectedBrand, setSelectedBrand]);

  React.useEffect(() => {
    return () => {
      if (dealerCityTransitionTimeoutRef.current) clearTimeout(dealerCityTransitionTimeoutRef.current);
      if (dealerExitTimeoutRef.current) clearTimeout(dealerExitTimeoutRef.current);
      if (dealerBrandTransitionTimeoutRef.current) clearTimeout(dealerBrandTransitionTimeoutRef.current);
    };
  }, []);

  const handleBackToGarage = () => {
    setDriveSubMode(null);
    setQuickPlayStep('map');
    setQuickPlayTrackId(getDefaultQuickPlayTrackId('city'));
    setQuickPlayLapCount(3);
    setQuickPlayDifficulty('normal');
    setQuickPlaySelectedBrand('All');
    setQuickPlayOpponentCount(5);
    handleBackToGarageClick();
  };

  const getCarUpgradesSafe = (carId: string) => {
    return carUpgrades[carId] || JSON.parse(JSON.stringify(DEFAULT_UPGRADES));
  };

  const handleDealerCitySelect = React.useCallback((cityId: DealerCityId) => {
    if (dealerMapTransitioning || dealerExiting) return;
    if (dealerCityTransitionTimeoutRef.current) clearTimeout(dealerCityTransitionTimeoutRef.current);
    setDealerCity(cityId);
    setDealerMarketMode(null);
    setSelectedBrand('All');
    setHoveredCity(null);
    setDealerMapTransitioning(true);

    dealerCityTransitionTimeoutRef.current = setTimeout(() => {
      setDealerPage('city');
      setDealerMapTransitioning(false);
    }, 680);
  }, [dealerExiting, dealerMapTransitioning, setSelectedBrand]);

  const handleBrandSelect = React.useCallback((brand: string) => {
    if (dealerBrandTransitioning) return;
    setDealerBrandTransitioning(true);

    if (dealerBrandTransitionTimeoutRef.current) clearTimeout(dealerBrandTransitionTimeoutRef.current);

    dealerBrandTransitionTimeoutRef.current = setTimeout(() => {
      setSelectedBrand(brand);
      setDealerMarketMode(null);
      setDealerBrandTransitioning(false);
    }, 450);
  }, [dealerBrandTransitioning, setSelectedBrand]);

  const handleDealerReturnToMap = React.useCallback(() => {
    setDealerPage('map');
    setDealerCity(null);
    setHoveredCity(null);
    setDealerMarketMode(null);
    setSelectedBrand('All');
  }, [setSelectedBrand]);

  const handleDealerBackClick = React.useCallback(() => {
    if (selectedBrand !== 'All' || dealerMarketMode !== null) {
      setSelectedBrand('All');
      setDealerMarketMode(null);
    } else if (dealerPage === 'city') {
      handleDealerReturnToMap();
    } else {
      if (dealerExitTimeoutRef.current) clearTimeout(dealerExitTimeoutRef.current);
      if (dealerCityTransitionTimeoutRef.current) clearTimeout(dealerCityTransitionTimeoutRef.current);

      setDealerExiting(true);
      setDealerMapTransitioning(false);
      setLastSelectedCity(null);
      handleExitDealerClick();
    }
  }, [selectedBrand, dealerMarketMode, dealerPage, handleDealerReturnToMap, handleExitDealerClick, setLastSelectedCity]);

  const handleDealerMarketChoice = React.useCallback((mode: DealerMarketMode) => {
    setDealerMarketMode(mode);
    const cityConfig = DEALER_CITIES.find((city) => city.id === dealerCity);
    if (selectedBrand === 'All' && cityConfig?.brands[0]) setSelectedBrand(cityConfig.brands[0]);
  }, [dealerCity, selectedBrand, setSelectedBrand]);

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
  const dealerHoverConfig = DEALER_CITIES.find((city) => city.id === hoveredCity);
  const dealerFilteredCars = dealerCars.filter((car) => selectedBrand === 'All' || car.brand === selectedBrand);
  const dealerMarketCars = dealerMarketMode === 'used'
    ? dealerFilteredCars.filter((car) => car.tier === 'Entry Tier' || car.price <= 1800)
    : dealerMarketMode === 'race'
      ? dealerFilteredCars.filter((car) => car.tier === 'Hyper Tier' || car.tier === 'Legendary Tier' || car.requiresLicense)
      : dealerMarketMode === 'new'
        ? dealerFilteredCars.filter((car) => car.tier !== 'Hyper Tier' && car.tier !== 'Legendary Tier' && !car.requiresLicense)
        : dealerFilteredCars;
  const dealerActiveBrands = dealerCityConfig?.brands || [];
  const quickPlayTracks = getRaceableQuickPlayTracks().filter(
    (track) => getQuickPlayTrackMeta(track).category === quickPlayMapFilter
  );
  const quickPlayMapTrack = quickPlayTracks.find((track) => track.id === quickPlayTrackId) || quickPlayTracks[0];
  const quickPlayChosenTrack = quickPlayTracks.find((track) => track.id === quickPlayTrackId) || quickPlayMapTrack;
  const quickPlaySelectedTrackIndex = Math.max(0, quickPlayTracks.findIndex((track) => track.id === quickPlayMapTrack?.id));
  const quickPlaySelectedMeta = quickPlayMapTrack ? getQuickPlayTrackMeta(quickPlayMapTrack) : null;
  const QuickPlaySelectedTypeIcon = quickPlaySelectedMeta ? getQuickPlayTypeIcon(quickPlaySelectedMeta.category) : Route;
  const quickPlayDifficultyIndex = Math.max(0, QUICK_PLAY_DIFFICULTIES.findIndex((item) => item.id === quickPlayDifficulty));
  const isQuickPlayMapSelect = driveSubMode === 'quickplay';
  const isQuickPlayCarSelectStep = isQuickPlayMapSelect && quickPlayStep === 'car';
  const hideGarageBackground = isQuickPlayMapSelect && (!isQuickPlayCarSelectStep || !quickPlayCarHasBeenClicked);

  const dealerSelectedCarConfig = CARS_DATABASE.find((c) => c.id === dealerSelectedCarId);
  const isShowroomActive = isQuickPlayCarSelectStep || activeGarageTab === 'dealer';
  const showroomBrandName = activeGarageTab === 'dealer'
    ? (selectedBrand !== 'All' ? selectedBrand : (dealerSelectedCarConfig?.brand || activeCarConfig.brand))
    : ((quickPlaySelectedBrand && quickPlaySelectedBrand !== 'All') ? quickPlaySelectedBrand : activeCarConfig.brand);

  const selectQuickPlayTrackByOffset = (offset: number) => {
    if (!quickPlayTracks.length) return;
    const currentIndex = quickPlaySelectedTrackIndex >= 0 ? quickPlaySelectedTrackIndex : 0;
    const nextIndex = (currentIndex + offset + quickPlayTracks.length) % quickPlayTracks.length;
    setQuickPlayTrackId(quickPlayTracks[nextIndex].id);
  };

  const adjustQuickPlayDifficulty = (offset: number) => {
    setDiffChangeDir(offset > 0 ? 'up' : 'down');
    const nextIndex = Math.max(0, Math.min(QUICK_PLAY_DIFFICULTIES.length - 1, quickPlayDifficultyIndex + offset));
    setQuickPlayDifficulty(QUICK_PLAY_DIFFICULTIES[nextIndex].id);
  };

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
              onClick: handleDealerClick,
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
          className={`absolute inset-0 z-10 overflow-hidden pointer-events-auto transition-colors duration-700 ${dealerPage === 'city' ? 'bg-transparent' : 'bg-zinc-950'}`}
        >
          {dealerPage !== 'city' && (
            <div
              style={{
                transformOrigin: lastSelectedCity ? `${DEALER_CITY_LABEL_POSITIONS[lastSelectedCity].left} ${DEALER_CITY_LABEL_POSITIONS[lastSelectedCity].top}` : 'center'
              }}
              className={`absolute inset-0 transition-all duration-700 ease-out ${!dealerExiting ? 'animate-dealerContentIn' : ''} ${dealerMapTransitioning
                ? 'scale-[2.0] opacity-0 blur-md'
                : 'scale-100 opacity-100'
                }`}
            >
              <DealerCityMapScene
                selectedCity={dealerCity}
                lastSelectedCity={lastSelectedCity}
                hoveredCity={hoveredCity}
                onHoverCity={setHoveredCity}
                onClickCity={handleDealerCitySelect}
              />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(244,63,94,0.12),transparent_24%),radial-gradient(circle_at_78%_78%,rgba(6,182,212,0.12),transparent_28%),linear-gradient(90deg,rgba(9,9,11,0.58),rgba(9,9,11,0.28),rgba(9,9,11,0.58))]" aria-hidden="true" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-zinc-950 to-transparent" aria-hidden="true" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-zinc-950 to-transparent" aria-hidden="true" />
            </div>
          )}

          {/* TAB: DEALER */}
          {activeGarageTab === 'dealer' && (
            <div className={`pointer-events-none fixed inset-0 z-10 flex min-h-0 flex-col gap-6 p-8 text-left ${!dealerExiting ? 'animate-dealerContentIn' : 'animate-fadeOut'}`}>
              <div className="pointer-events-auto absolute right-8 top-8 z-30">
                <button
                  onClick={handleDealerBackClick}
                  className="group flex h-14 w-14 items-center justify-center cursor-pointer"
                  aria-label="Back"
                  title="Back"
                >
                  <img
                    src="/icon/back_button.svg"
                    alt=""
                    className="h-full w-full object-contain drop-shadow-[0_0_18px_rgba(0,0,0,0.65)] transition-[filter] duration-300 ease-in-out scale-200 brightness-100 group-hover:brightness-125"
                    draggable={false}
                  />
                </button>
              </div>

              {dealerPage === 'map' && !dealerMapTransitioning && !dealerExiting && !dealerCityConfig && (
                <>
                  {dealerHoverConfig && (
                    <div
                      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full border border-white/15 bg-black/88 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-white shadow-[0_0_20px_rgba(0,0,0,0.55)]"
                      style={DEALER_CITY_LABEL_POSITIONS[dealerHoverConfig.id]}
                    >
                      {dealerHoverConfig.name}
                    </div>
                  )}
                  <DealerHoverBar city={dealerHoverConfig || null} />
                </>
              )}

              {dealerPage === 'city' && dealerCityConfig && (
                <div className="pointer-events-auto absolute left-0 top-8 z-30 flex items-center select-none gap-3">
                  <div className="flex items-stretch">
                    {/* City Indicator */}
                    <div
                      className={`transition-all duration-500 ease-out pl-8 pr-4 py-2.5 flex items-center justify-center font-black uppercase tracking-[0.08em] text-white text-s ${selectedBrand !== 'All'
                        ? 'bg-zinc-900 border-r border-white/10 rounded-r-none'
                        : 'bg-rose-600 rounded-r-full pr-6 shadow-[0_0_24px_rgba(244,63,94,0.4)]'
                        }`}
                    >
                      {dealerCityConfig.name}
                    </div>
                    {/* Extended Brand Indicator */}
                    <div
                      className={`transition-all duration-500 ease-out py-2.5 flex items-center justify-center font-black uppercase tracking-[0.08em] text-white text-s overflow-hidden ${selectedBrand !== 'All'
                        ? dealerMarketMode !== null
                          ? 'bg-zinc-900 border-r border-white/10 rounded-r-none pl-4 pr-4'
                          : 'bg-rose-600 rounded-r-full pl-4 pr-6 shadow-[0_0_24px_rgba(244,63,94,0.4)]'
                        : 'max-w-0 opacity-0 pl-0 pr-0'
                        }`}
                      style={{
                        maxWidth: selectedBrand !== 'All' ? '200px' : '0px'
                      }}
                    >
                      <span className="whitespace-nowrap">{selectedBrand}</span>
                    </div>
                    {/* Category Indicator Pill */}
                    {selectedBrand !== 'All' && dealerMarketMode !== null && (
                      <div className="bg-rose-600 rounded-r-full py-2.5 flex items-center justify-center font-black uppercase tracking-[0.08em] text-white text-s shadow-[0_0_24px_rgba(244,63,94,0.4)] transition-all duration-500 ease-out px-5">
                        <span className="whitespace-nowrap">
                          {dealerMarketMode === 'new'
                            ? 'NEW CAR'
                            : dealerMarketMode === 'used'
                              ? 'USED CAR'
                              : dealerMarketMode === 'race'
                                ? 'RACE CAR'
                                : dealerMarketMode === 'museum'
                                  ? 'HERITAGE'
                                  : 'ALL CARS'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {dealerPage === 'city' && dealerCityConfig && selectedBrand === 'All' && !dealerMarketMode && (
                <div className="pointer-events-auto absolute left-1/2 top-1/2 z-20 w-[min(980px,calc(100%-64px))] -translate-x-1/2 -translate-y-1/2 animate-fadeIn">
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    {dealerActiveBrands.map((brand, index) => {
                      const brandColor = getBrandColor(brand);
                      return (
                        <button
                          key={brand}
                          onClick={() => handleBrandSelect(brand)}
                          onMouseEnter={() => setHoveredBrand(brand)}
                          onMouseLeave={() => setHoveredBrand(null)}
                          className="group flex flex-col items-center justify-center gap-4 py-8 px-6 bg-transparent border-none outline-none cursor-pointer transition-all duration-300 transform hover:scale-110 hover:brightness-125 animate-brandPop"
                          style={{ animationDelay: `${index * 80}ms` }}
                        >
                          {/* Circular double-ring emblem */}
                          <div className="relative flex h-24 w-24 items-center justify-center">
                            {/* Outer glowing ring */}
                            <div
                              className="absolute inset-0 border border-white/10 rounded-full transition-all duration-500 group-hover:scale-110 group-hover:rotate-[180deg]"
                              style={{
                                borderColor: `${brandColor}33`,
                                boxShadow: `0 0 15px ${brandColor}00`,
                              }}
                            />
                            {/* Inner dashed ring */}
                            <div
                              className="absolute inset-2 border border-dashed border-white/5 rounded-full transition-all duration-300 group-hover:scale-105"
                              style={{
                                borderColor: `${brandColor}55`,
                              }}
                            />
                            {/* Monogram initials */}
                            <span
                              className="relative text-2xl font-black font-mono tracking-widest text-zinc-300 transition-all duration-300 group-hover:text-white"
                              style={{
                                textShadow: `0 0 10px ${brandColor}66`
                              }}
                            >
                              {getDealerBrandInitials(brand)}
                            </span>
                          </div>

                          {/* Brand name */}
                          <span
                            className="text-xs font-black uppercase tracking-[0.25em] text-zinc-400 transition-all duration-300 group-hover:text-white"
                            style={{
                              textShadow: `0 0 10px ${brandColor}33`
                            }}
                          >
                            {brand}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stock Brand Atmosphere Backdrop (Cross-dissolves straight to 3D Showroom) */}
              {dealerPage === 'city' && dealerCityConfig && selectedBrand !== 'All' && (() => {
                const brandColor = getBrandColor(selectedBrand);
                const stockImageUrl = BRAND_STOCK_IMAGES[selectedBrand] || DEFAULT_BRAND_STOCK_IMAGE;
                const isShowroom = dealerMarketMode !== null;

                return (
                  <div
                    className={`absolute inset-0 z-0 pointer-events-none overflow-hidden transition-all duration-700 ease-in-out bg-zinc-950 ${
                      isShowroom ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
                    }`}
                  >
                    <img
                      src={stockImageUrl}
                      alt={`${selectedBrand} Stock`}
                      className="absolute inset-0 w-full h-full object-cover opacity-45 filter brightness-90 contrast-110"
                    />
                    <div
                      className="absolute inset-0 opacity-70"
                      style={{
                        background: `radial-gradient(ellipse at 50% 50%, ${brandColor}33 0%, rgba(9,9,11,0.85) 65%, rgba(5,5,7,0.98) 100%)`
                      }}
                    />
                  </div>
                );
              })()}

              {/* Category Choice Step at bottom before entering 3D Showroom */}
              {dealerPage === 'city' && dealerCityConfig && selectedBrand !== 'All' && !dealerMarketMode && (
                <div className="pointer-events-auto absolute left-1/2 bottom-10 z-20 w-[min(980px,calc(100%-64px))] -translate-x-1/2 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-8 py-6 backdrop-blur-sm animate-fadeIn">
                  <div className="flex flex-col gap-5 items-center">
                    <div className="text-center">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
                        SELECT MARKET CATEGORY
                      </span>
                      <h3 className="text-2xl font-black uppercase tracking-wider text-white mt-1">
                        {selectedBrand}
                      </h3>
                    </div>

                    {/* Category Choices (wide gap, sleek icon tokens, non-button feel) */}
                    <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14 w-full mt-2">
                      {[
                        { id: 'new', label: 'NEW CAR', icon: '/icon/new_car.svg', accent: 'group-hover:border-rose-500 group-hover:shadow-[0_0_20px_rgba(244,63,94,0.4)]', textColor: 'group-hover:text-rose-400' },
                        { id: 'used', label: 'USED CAR', icon: '/icon/used_car.svg', accent: 'group-hover:border-amber-500 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]', textColor: 'group-hover:text-amber-400' },
                        { id: 'race', label: 'RACE CAR', icon: '/icon/race_car.svg', accent: 'group-hover:border-cyan-500 group-hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]', textColor: 'group-hover:text-cyan-400' },
                        { id: 'museum', label: 'HERITAGE', icon: '/icon/heritage.svg', accent: 'group-hover:border-purple-500 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]', textColor: 'group-hover:text-purple-400' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleDealerMarketChoice(item.id as DealerMarketMode)}
                          className="group relative flex flex-col items-center gap-3 bg-transparent border-none outline-none cursor-pointer transition-all duration-300 transform hover:scale-110 active:scale-95"
                        >
                          {/* Circular icon token */}
                          <div className={`relative flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-950/80 border border-white/12 transition-all duration-300 ${item.accent}`}>
                            <img
                              src={item.icon}
                              alt={item.label}
                              className="h-8 w-8 filter invert opacity-80 transition-all duration-300 group-hover:opacity-100 group-hover:scale-110"
                            />
                          </div>
                          {/* Label */}
                          <span className={`text-xs font-black uppercase tracking-widest text-zinc-300 transition-colors duration-300 ${item.textColor}`}>
                            {item.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}



              {selectedBrand === '__legacy__' && !dealerCityConfig && (
                <div className="relative mx-auto grid w-full max-w-5xl flex-1 min-h-0 content-center grid-cols-2 gap-5 py-4">
                  {DEALER_CITIES.map((city) => {
                    const cityCars = getDealerCityCars(city.id);
                    const cityClasses = getDealerCityClasses(city.accent);
                    const isHovered = hoveredCity === city.id;
                    const accentGlowColor =
                      city.accent === 'cyan' ? 'border-cyan-500/55 shadow-[0_0_28px_rgba(6,182,212,0.16)]' :
                        city.accent === 'blue' ? 'border-blue-500/55 shadow-[0_0_28px_rgba(59,130,246,0.16)]' :
                          city.accent === 'amber' ? 'border-amber-500/55 shadow-[0_0_28px_rgba(245,158,11,0.16)]' :
                            'border-rose-500/55 shadow-[0_0_28px_rgba(244,63,94,0.16)]';

                    return (
                      <button
                        key={city.id}
                        onClick={() => setDealerCity(city.id)}
                        onMouseEnter={() => setHoveredCity(city.id)}
                        onMouseLeave={() => setHoveredCity(null)}
                        className={`group relative min-h-[240px] overflow-hidden rounded-2xl border bg-zinc-950/65 p-5 text-left backdrop-blur-md transition-all duration-300 ${isHovered
                          ? `-translate-y-1 bg-zinc-900/75 ${accentGlowColor}`
                          : `border-zinc-855 hover:-translate-y-1 hover:bg-zinc-900/75 ${cityClasses.glow}`
                          }`}
                      >
                        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-950/80 to-transparent pointer-events-none" />
                        <div className="relative z-10 flex h-full flex-col justify-between gap-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${cityClasses.icon}`}>
                              <MapIcon className="h-5 w-5" />
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

              {dealerPage === 'city' && dealerCityConfig && dealerMarketMode && dealerMarketMode !== 'museum' && dealerMarketCars.length === 0 && (
                <div className="pointer-events-auto mx-auto mt-10 w-full max-w-xl rounded-2xl border border-zinc-850 bg-zinc-950/70 p-8 text-center backdrop-blur-md">
                  <h3 className="text-lg font-black uppercase tracking-wide text-white">No Cars Stocked Yet</h3>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                    No stock for this brand in this lot.
                  </p>
                </div>
              )}

              {dealerPage === 'city' && dealerCityConfig && dealerMarketMode === 'museum' && (() => {
                const lore = BRAND_LORE[selectedBrand];
                if (!lore) return null;
                const brandColor = getBrandColor(selectedBrand);
                const signatureCar = CARS_DATABASE.find((c) => c.id === lore.signatureCarId);

                return (
                  <div className="pointer-events-auto flex flex-col gap-6 overflow-y-auto pb-6 pr-2 min-h-0 flex-1 animate-fadeIn">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                      {/* Left Block: Brand Overview & Info */}
                      <div className="lg:col-span-2 border border-zinc-850 bg-zinc-950/75 p-6 rounded-2xl flex flex-col gap-4 backdrop-blur-md">
                        <div className="flex justify-between items-start border-b border-white/10 pb-4">
                          <div>
                            <h2 className="text-3xl font-black uppercase tracking-wider text-white" style={{ textShadow: `0 0 15px ${brandColor}44` }}>
                              {lore.name}
                            </h2>
                            <p className="text-xs font-bold text-zinc-400 mt-1 uppercase tracking-widest">
                              {lore.specialty}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Origin</span>
                            <div className="text-sm font-black text-white">{lore.origin}</div>
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1 block">Established</span>
                            <div className="text-sm font-bold text-zinc-300">{lore.established}</div>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 block mb-2">Heritage & Philosophy</span>
                          <p className="text-sm font-bold leading-relaxed text-zinc-300">
                            {lore.description}
                          </p>
                        </div>

                        <div className="mt-2 flex flex-col gap-3">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 block">Historic Milestones</span>
                          {lore.achievements.map((ach, idx) => (
                            <div key={idx} className="flex gap-3 items-start border border-zinc-900 bg-zinc-900/30 p-3.5 rounded-xl">
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-black text-white" style={{ backgroundColor: `${brandColor}33`, color: brandColor }}>
                                {idx + 1}
                              </div>
                              <p className="text-xs font-bold leading-relaxed text-zinc-300">
                                {ach}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right Block: Signature Vehicle Show */}
                      <div className="border border-zinc-850 bg-zinc-950/75 p-6 rounded-2xl flex flex-col gap-4 backdrop-blur-md justify-between">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 block mb-3">Signature Vehicle</span>
                          {signatureCar && (
                            <div className="flex flex-col gap-4">
                              <div className="border border-zinc-900 bg-zinc-900/40 p-4 rounded-xl flex flex-col gap-1">
                                <span className="text-[9px] font-black uppercase tracking-wider text-rose-500">
                                  {signatureCar.tier}
                                </span>
                                <h4 className="text-lg font-black text-zinc-100 uppercase tracking-wide">
                                  {signatureCar.brand} {signatureCar.name}
                                </h4>
                                <div className="flex items-center gap-1.5 font-mono text-amber-500 text-xs font-bold mt-1">
                                  <Coins className="w-3.5 h-3.5" />
                                  <span>{signatureCar.price === 0 ? 'Reward Car' : `${signatureCar.price.toLocaleString()} CR`}</span>
                                </div>
                              </div>

                              {/* Spec chart */}
                              <div className="flex flex-col gap-3 bg-zinc-900/20 p-4 rounded-xl border border-zinc-900/50">
                                {/* Speed */}
                                <div>
                                  <div className="flex justify-between text-[9px] font-black text-zinc-500 mb-1">
                                    <span>TOP SPEED</span>
                                    <span className="font-mono text-zinc-300">{Math.round(signatureCar.speed * 10)}%</span>
                                  </div>
                                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden relative">
                                    <div
                                      className="absolute left-0 top-0 h-full bg-rose-600 transition-all duration-300"
                                      style={{ width: `${signatureCar.speed * 10}%`, backgroundColor: brandColor }}
                                    />
                                  </div>
                                </div>
                                {/* Acceleration */}
                                <div>
                                  <div className="flex justify-between text-[9px] font-black text-zinc-500 mb-1">
                                    <span>ACCELERATION</span>
                                    <span className="font-mono text-zinc-300">{Math.round(signatureCar.acceleration * 10)}%</span>
                                  </div>
                                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden relative">
                                    <div
                                      className="absolute left-0 top-0 h-full bg-rose-600 transition-all duration-300"
                                      style={{ width: `${signatureCar.acceleration * 10}%`, backgroundColor: brandColor }}
                                    />
                                  </div>
                                </div>
                                {/* Handling */}
                                <div>
                                  <div className="flex justify-between text-[9px] font-black text-zinc-500 mb-1">
                                    <span>HANDLING</span>
                                    <span className="font-mono text-zinc-300">{Math.round(signatureCar.handling * 10)}%</span>
                                  </div>
                                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden relative">
                                    <div
                                      className="absolute left-0 top-0 h-full bg-rose-600 transition-all duration-300"
                                      style={{ width: `${signatureCar.handling * 10}%`, backgroundColor: brandColor }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-4">
                          <button
                            onClick={() => {
                              if (signatureCar) selectCar(signatureCar.id);
                            }}
                            disabled={!signatureCar || !purchasedCars.includes(signatureCar.id) || activeCarId === signatureCar.id}
                            className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${!signatureCar
                              ? 'bg-zinc-800 border border-zinc-750 text-zinc-550 cursor-not-allowed'
                              : activeCarId === signatureCar.id
                                ? 'bg-zinc-950 border border-zinc-900 text-zinc-650 cursor-default'
                                : purchasedCars.includes(signatureCar.id)
                                  ? 'bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-200 hover:border-zinc-500'
                                  : 'bg-zinc-950 border border-zinc-900/60 text-zinc-600 cursor-not-allowed'
                              }`}
                          >
                            {!signatureCar
                              ? 'Preview Unavailable'
                              : activeCarId === signatureCar.id
                                ? 'Active Vehicle'
                                : purchasedCars.includes(signatureCar.id)
                                  ? 'Select Vehicle'
                                  : 'Not Owned'}
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })()}

              {dealerPage === 'city' && dealerCityConfig && dealerMarketMode && dealerMarketMode !== 'museum' && dealerMarketCars.length > 0 && (() => {
                const activeDealerCar = CARS_DATABASE.find((c) => c.id === dealerSelectedCarId) || dealerMarketCars[0];
                const isCarUnlocked = purchasedCars.includes(activeDealerCar.id);
                const isCarActive = activeCarId === activeDealerCar.id;
                const canAffordCar = playerCredits >= activeDealerCar.price;
                const isSuperLockedCar = activeDealerCar.requiresLicense && !hasLicense;

                return (
                  <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col animate-fadeIn">
                    {/* Bottom Specs & Action Bar */}
                    <div className="pointer-events-auto w-full border-t border-white/10 bg-gradient-to-r from-zinc-950/95 via-zinc-900/90 to-zinc-950/95 py-3.5 px-6 shadow-[0_-8px_32px_rgba(0,0,0,0.7)] backdrop-blur-2xl flex flex-col md:flex-row justify-between items-center gap-4 text-left">
                      {/* Left: Brand + Car Name + Price */}
                      <div className="flex items-center gap-3 text-left w-full md:w-auto">
                        <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-black text-cyan-400 tracking-widest uppercase">
                          {activeDealerCar.brand}
                        </span>
                        <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                          {activeDealerCar.name}
                        </h2>
                        <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2.5 py-1 rounded-lg flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5 text-amber-500" />
                          {isCarUnlocked ? 'OWNED' : `${activeDealerCar.price.toLocaleString()} CR`}
                        </span>
                      </div>

                      {/* Center: Stat Bars (SPD / ACC / HDL) */}
                      {(() => {
                        const upgradesForCar = getCarUpgradesSafe(activeDealerCar.id);
                        const upgradedStats = getUpgradedStats(activeDealerCar, upgradesForCar);
                        return (
                          <div className="flex gap-5 items-center text-xs font-bold text-zinc-300 w-full md:w-auto justify-between md:justify-start">
                            {/* Speed */}
                            <div className="flex flex-col gap-1 w-20">
                              <div className="flex justify-between items-center text-[9px] font-black tracking-wider text-zinc-400 uppercase">
                                <span>SPD</span>
                                <span className="text-cyan-400 font-extrabold">{Math.round(upgradedStats.speed * 10)}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-zinc-800/80 rounded-full overflow-hidden border border-white/5 p-0.5">
                                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 rounded-full transition-all duration-500 shadow-[0_0_6px_#06b6d4]" style={{ width: `${Math.min(100, Math.round(upgradedStats.speed * 10))}%` }} />
                              </div>
                            </div>

                            {/* Acceleration */}
                            <div className="flex flex-col gap-1 w-20">
                              <div className="flex justify-between items-center text-[9px] font-black tracking-wider text-zinc-400 uppercase">
                                <span>ACC</span>
                                <span className="text-cyan-400 font-extrabold">{Math.round(upgradedStats.acceleration * 10)}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-zinc-800/80 rounded-full overflow-hidden border border-white/5 p-0.5">
                                <div className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full transition-all duration-500 shadow-[0_0_6px_#06b6d4]" style={{ width: `${Math.min(100, Math.round(upgradedStats.acceleration * 10))}%` }} />
                              </div>
                            </div>

                            {/* Handling */}
                            <div className="flex flex-col gap-1 w-20">
                              <div className="flex justify-between items-center text-[9px] font-black tracking-wider text-zinc-400 uppercase">
                                <span>HDL</span>
                                <span className="text-cyan-400 font-extrabold">{Math.round(upgradedStats.handling * 10)}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-zinc-800/80 rounded-full overflow-hidden border border-white/5 p-0.5">
                                <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-500 shadow-[0_0_6px_#06b6d4]" style={{ width: `${Math.min(100, Math.round(upgradedStats.handling * 10))}%` }} />
                              </div>
                            </div>

                            {/* Drive Type Pill */}
                            <div className="bg-zinc-900/90 px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-black tracking-widest uppercase text-cyan-300 shadow-inner">
                              {activeDealerCar.driveType}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Right: Action Buttons */}
                      <div className="flex gap-3 items-center w-full md:w-auto justify-end">
                        <button
                          onClick={() => setDealerMarketMode(null)}
                          className="px-4 py-2.5 border border-cyan-500/30 hover:border-cyan-400 bg-zinc-900/80 hover:bg-cyan-950/40 text-[10px] font-black uppercase tracking-widest text-cyan-300 rounded-xl transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.15)] hover:shadow-[0_0_16px_rgba(6,182,212,0.35)]"
                        >
                          CATEGORIES
                        </button>

                        {isCarUnlocked ? (
                          <button
                            disabled={isCarActive}
                            onClick={() => selectCar(activeDealerCar.id)}
                            className={`group relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${isCarActive
                              ? 'bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-default'
                              : 'bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-zinc-950 shadow-[0_0_20px_rgba(6,182,212,0.5)] hover:scale-105 active:scale-95'
                              }`}
                          >
                            <span>{isCarActive ? 'ACTIVE VEHICLE' : 'EQUIP VEHICLE'}</span>
                            {!isCarActive && <Check className="w-4 h-4" />}
                          </button>
                        ) : (
                          <button
                            disabled={!canAffordCar || isSuperLockedCar}
                            onClick={() => {
                              buyCar(activeDealerCar);
                              if (typeof window !== 'undefined') {
                                (window as any).gameEngine?.triggerPurchaseCelebration?.();
                              }
                            }}
                            className={`group relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${isSuperLockedCar
                              ? 'bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed'
                              : canAffordCar
                                ? 'bg-gradient-to-r from-rose-600 via-amber-600 to-yellow-500 hover:from-rose-500 hover:to-yellow-400 text-white shadow-[0_0_24px_rgba(244,63,94,0.6)] hover:scale-105 active:scale-95'
                                : 'bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed'
                              }`}
                          >
                            <span>
                              {isSuperLockedCar
                                ? 'REQUIRES BRONZE LICENSE'
                                : canAffordCar
                                  ? `PURCHASE VEHICLE (-${activeDealerCar.price.toLocaleString()} CR)`
                                  : 'INSUFFICIENT CREDITS'}
                            </span>
                            {canAffordCar && !isSuperLockedCar && <Coins className="w-4 h-4 fill-current" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bottom Horizontal Car Carousel Slider */}
                    <div className="pointer-events-auto h-32 overflow-hidden border-t border-white/5 bg-zinc-950/60 px-16 flex items-center backdrop-blur-2xl shadow-[0_-12px_36px_rgba(0,0,0,0.7)]">
                      <div className="flex h-full w-full items-center justify-start gap-4 overflow-x-auto py-2 scrollbar-none px-4">
                        {dealerMarketCars.map((car) => {
                          const isSelected = car.id === activeDealerCar.id;
                          const isUnlocked = purchasedCars.includes(car.id);
                          const isActive = car.id === activeCarId;

                          return (
                            <button
                              key={car.id}
                              type="button"
                              onClick={() => {
                                setDealerSelectedCarId(car.id);
                              }}
                              className={`quick-play-logo-token group relative flex items-center justify-center transition-all duration-300 cursor-pointer border rounded-2xl bg-gradient-to-b from-zinc-900/90 to-black text-white shrink-0 h-22 w-44 overflow-hidden ${isSelected
                                ? 'border-cyan-400 shadow-[0_0_24px_rgba(6,182,212,0.5)] scale-105 bg-gradient-to-b from-cyan-950/40 to-zinc-950 ring-1 ring-cyan-400/50'
                                : 'border-white/10 opacity-75 hover:opacity-100 hover:border-white/30 hover:scale-105'
                                }`}
                              title={`${car.brand} ${car.name}`}
                            >
                              {/* Status Badge */}
                              {isActive ? (
                                <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-cyan-400 text-zinc-950 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md shadow-[0_0_8px_#06b6d4]">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  <span>ACTIVE</span>
                                </div>
                              ) : isUnlocked ? (
                                <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-rose-500 text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md shadow-[0_0_8px_rgba(244,63,94,0.5)]">
                                  <span>OWNED</span>
                                </div>
                              ) : (
                                <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-amber-500/90 text-zinc-950 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md shadow-[0_0_8px_rgba(245,158,11,0.5)]">
                                  <Coins className="w-2.5 h-2.5 stroke-[3]" />
                                  <span>{car.price} CR</span>
                                </div>
                              )}

                              {/* Drive Type badge */}
                              <span className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-md text-[8px] font-black bg-black/75 border border-white/10 text-cyan-300 uppercase tracking-wider backdrop-blur-sm">
                                {car.driveType}
                              </span>

                              {/* 3D Car Icon */}
                              <DealerThreeCarIcon car={car} isSliderIcon={true} className="absolute inset-0 w-full h-full z-0 pointer-events-none opacity-85 group-hover:opacity-100 transition-opacity" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* BRAND SHOWCASE BACKGROUND */}
          {dealerPage === 'city' && selectedBrand === 'All' && !dealerMarketMode && dealerCityConfig && (() => {
            const brandColor = hoveredBrand ? getBrandColor(hoveredBrand) : (
              dealerCityConfig.accent === 'rose' ? '#f43f5e' :
                dealerCityConfig.accent === 'cyan' ? '#06b6d4' :
                  dealerCityConfig.accent === 'blue' ? '#3b82f6' : '#f59e0b'
            );
            const displayName = hoveredBrand || dealerCityConfig.name;
            return (
              <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden flex items-center justify-center bg-zinc-950 animate-fadeIn">
                {/* Subtle glowing radial gradient in center */}
                <div
                  className="absolute w-[600px] h-[600px] rounded-full filter blur-[120px] opacity-15 mix-blend-screen transition-all duration-700"
                  style={{
                    background: `radial-gradient(circle, ${brandColor} 0%, transparent 70%)`
                  }}
                />

                {/* Cyberpunk Grid Overlay */}
                <div
                  className="absolute inset-0 opacity-5"
                  style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                  }}
                />

                {/* City-Specific Overlays */}
                {dealerCityConfig.id === 'east' && (
                  <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden animate-fadeIn">
                    {/* Pagoda silhouette */}
                    <svg className="absolute bottom-0 w-full h-[35%] opacity-20 text-zinc-800" viewBox="0 0 1000 300" preserveAspectRatio="none" fill="currentColor">
                      <path d="M 0 300 L 0 250 L 50 220 L 70 220 L 90 250 L 150 250 L 180 180 L 195 180 L 210 160 L 230 180 L 245 180 L 275 250 L 380 250 L 410 140 L 450 140 L 460 120 L 470 140 L 510 140 L 540 250 L 650 250 L 670 200 L 730 200 L 750 250 L 850 250 L 890 100 L 920 100 L 930 80 L 940 100 L 970 100 L 1000 250 L 1000 300 Z" />
                    </svg>
                    {/* Lanterns */}
                    <div className="absolute top-0 inset-x-0 h-48 flex justify-around px-12 opacity-35">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="animate-lantern-swing flex flex-col items-center" style={{ animationDelay: `${i * 0.4}s` }}>
                          <div className="w-0.5 h-16 bg-zinc-700" />
                          <div className="w-6 h-1.5 bg-zinc-800 rounded-sm" />
                          <div
                            className="w-8 h-10 rounded-xl relative animate-lantern-flicker"
                            style={{
                              background: `radial-gradient(circle, ${brandColor}dd 0%, ${brandColor}88 70%)`,
                              boxShadow: `0 0 20px ${brandColor}88`,
                              animationDelay: `${i * 0.3}s`
                            }}
                          >
                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-1 h-3 bg-amber-500 rounded-b-sm" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dealerCityConfig.id === 'west' && (
                  <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden animate-fadeIn">
                    {/* Suspension bridge outline */}
                    <svg className="absolute bottom-0 w-full h-[60%] opacity-20 transition-colors duration-700" style={{ color: brandColor }} viewBox="0 0 1000 400" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="0" y1="350" x2="1000" y2="350" strokeWidth="4" />
                      <path d="M 250 400 L 280 80 L 320 80 L 350 400" fill="currentColor" opacity="0.3" />
                      <line x1="280" y1="80" x2="320" y2="80" strokeWidth="3" />
                      <line x1="285" y1="150" x2="315" y2="150" strokeWidth="2" />
                      <line x1="290" y1="220" x2="310" y2="220" strokeWidth="2" />
                      <line x1="295" y1="290" x2="305" y2="290" strokeWidth="2" />
                      <path d="M 650 400 L 680 80 L 720 80 L 750 400" fill="currentColor" opacity="0.3" />
                      <line x1="680" y1="80" x2="720" y2="80" strokeWidth="3" />
                      <line x1="685" y1="150" x2="715" y2="150" strokeWidth="2" />
                      <line x1="690" y1="220" x2="710" y2="220" strokeWidth="2" />
                      <line x1="695" y1="290" x2="705" y2="290" strokeWidth="2" />
                      <path d="M 0 120 Q 300 350 300 80 Q 500 240 700 80 Q 700 350 1000 120" strokeWidth="3" />
                      {[50, 100, 150, 200, 370, 420, 470, 520, 570, 630, 800, 850, 900, 950].map((x, idx) => {
                        let yCable = 350;
                        if (x < 250) {
                          yCable = 120 + ((x - 0) / 250) * 120;
                        } else if (x > 350 && x < 650) {
                          const t = (x - 300) / 400;
                          yCable = 80 + 4 * (160) * (t - 0.5) * (t - 0.5);
                        } else if (x > 750) {
                          yCable = 120 + ((1000 - x) / 250) * 120;
                        }
                        return <line key={idx} x1={x} y1={yCable} x2={x} y2={350} strokeWidth="1" opacity="0.6" />;
                      })}
                    </svg>
                    {/* Speed lines */}
                    <div className="absolute bottom-[48px] inset-x-0 h-10 flex flex-col justify-around opacity-40">
                      <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent animate-speed-line" style={{ animationDelay: '0s' }} />
                      <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-fuchsia-500 to-transparent animate-speed-line" style={{ animationDelay: '0.7s', animationDuration: '3s' }} />
                      <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500 to-transparent animate-speed-line" style={{ animationDelay: '1.4s', animationDuration: '2.5s' }} />
                    </div>
                  </div>
                )}

                {dealerCityConfig.id === 'north' && (
                  <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden animate-fadeIn">
                    {/* Tall steel tower */}
                    <svg className="absolute bottom-0 right-[10%] w-[300px] h-[80%] opacity-20 transition-colors duration-700" style={{ color: brandColor }} viewBox="0 0 200 500" fill="currentColor">
                      <path d="M 30 500 L 70 500 L 90 280 L 110 280 L 130 500 L 170 500 L 125 150 L 135 150 L 135 120 L 115 120 L 105 0 L 95 0 L 85 120 L 65 120 L 65 150 L 75 150 Z" />
                      {[100, 180, 260, 340, 420].map((y, idx) => (
                        <line key={idx} x1={40 + idx * 5} y1={y} x2={160 - idx * 5} y2={y} stroke="#0f172a" strokeWidth="4" />
                      ))}
                    </svg>
                    {/* Vertical laser lines */}
                    <div className="absolute inset-0 flex justify-around opacity-15">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="w-[1px] h-full bg-gradient-to-t from-transparent via-blue-400 to-transparent" />
                      ))}
                    </div>
                    {/* Digital snow particles */}
                    <div className="absolute inset-0">
                      {[1, 2, 3, 4].map((group) => (
                        <div key={group} className={`absolute inset-0 animate-snow-${group}`}>
                          {[...Array(12)].map((_, idx) => {
                            const left = `${(idx * 8 + group * 23) % 100}%`;
                            const top = `${(idx * 7) % 30 - 30}px`;
                            const size = `${((idx % 3) + 2) * 2}px`;
                            return (
                              <div
                                key={idx}
                                className="absolute rounded-full transition-colors duration-750"
                                style={{
                                  left,
                                  top,
                                  width: size,
                                  height: size,
                                  backgroundColor: brandColor,
                                  boxShadow: `0 0 8px ${brandColor}`,
                                  opacity: 0.7
                                }}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dealerCityConfig.id === 'south' && (
                  <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden animate-fadeIn">
                    <div className="absolute bottom-0 inset-x-0 h-[40%] bg-gradient-to-t from-amber-500/10 via-transparent to-transparent" />
                    {/* Lighthouse */}
                    <svg className="absolute bottom-0 left-[8%] w-[120px] h-[55%] opacity-25 text-zinc-400" viewBox="0 0 100 300" fill="currentColor">
                      <path d="M 20 300 L 30 60 L 70 60 L 80 300 Z" />
                      <rect x="25" y="45" width="50" height="15" rx="2" fill="currentColor" />
                      <rect x="35" y="15" width="30" height="30" rx="3" fill="#0f172a" />
                      <path d="M 32 15 C 32 -5, 68 -5, 68 15 Z" fill="currentColor" />
                    </svg>
                    {/* Palm Trees */}
                    <svg className="absolute bottom-0 right-[5%] w-[280px] h-[65%] opacity-20 text-zinc-900" viewBox="0 0 200 300" fill="currentColor">
                      <path d="M 60 300 Q 80 180 120 100 Q 123 100 122 103 Q 83 182 63 300 Z" />
                      <path d="M 120 100 Q 150 120 180 150 Q 150 135 120 100 Z" />
                      <path d="M 120 100 Q 160 90 190 95 Q 150 95 120 100 Z" />
                      <path d="M 120 100 Q 140 60 160 30 Q 135 65 120 100 Z" />
                      <path d="M 120 100 Q 100 50 75 20 Q 105 65 120 100 Z" />
                      <path d="M 120 100 Q 80 80 50 90 Q 95 95 120 100 Z" />
                      <path d="M 140 300 Q 150 200 170 140 Q 172 140 171 142 Q 152 201 142 300 Z" />
                      <path d="M 170 140 Q 190 155 210 175 Q 190 165 170 140 Z" />
                      <path d="M 170 140 Q 200 135 220 138 Q 190 138 170 140 Z" />
                      <path d="M 170 140 Q 185 110 200 85 Q 180 110 170 140 Z" />
                      <path d="M 170 140 Q 155 100 135 80 Q 155 115 170 140 Z" />
                    </svg>
                    {/* Light beam */}
                    <div className="absolute left-[13%] bottom-[82.5%] w-[2000px] h-[2000px] -translate-x-1/2 translate-y-1/2 pointer-events-none">
                      <div
                        className="w-full h-full animate-lighthouse-rotate transition-all duration-700"
                        style={{
                          background: `conic-gradient(from 0deg at 50% 50%, transparent 42%, ${brandColor}22 45%, ${brandColor}44 48%, ${brandColor}22 51%, transparent 54%)`
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Giant outlined brand/city name in center */}
                <div
                  className="select-none text-center font-black tracking-[0.15em] uppercase select-none pointer-events-none animate-scaleIn z-10 transition-all duration-700"
                  style={{
                    fontSize: '15vw',
                    lineHeight: 1,
                    fontFamily: 'system-ui, sans-serif',
                    WebkitTextStroke: '2px rgba(255, 255, 255, 0.05)',
                    color: 'transparent',
                  }}
                >
                  {displayName}
                </div>
              </div>
            );
          })()}

          {/* LOCAL TRANSITION OVERLAY FOR INTERNAL DEALER TRANSITIONS */}
          {dealerMapTransitioning && (
            <div
              className="pointer-events-none absolute inset-0 z-40 bg-black animate-fadeIn"
              style={{ animationDuration: '450ms' }}
            />
          )}
        </div>
      )}


      {/* DEDICATED DRIVE MODES INTERFACE */}
      {activeGarageTab === 'drive' && (
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center pointer-events-auto transition-all duration-700 ${isQuickPlayMapSelect
            ? (hideGarageBackground ? 'bg-black p-0' : 'bg-transparent p-0')
            : 'bg-zinc-950/40 backdrop-blur-md p-8'
            } ${isTransitioningDrive ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
        >
          <div className={`w-full flex flex-col text-left h-full justify-center ${isQuickPlayMapSelect ? 'max-w-none max-h-none gap-0' : 'max-w-4xl max-h-[620px] gap-6'}`}>
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
                      setQuickPlayStep('map');
                      setQuickPlayTrackId(getDefaultQuickPlayTrackId('city'));
                      setQuickPlayLapCount(3);
                      setQuickPlayDifficulty('normal');
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
                      CHOOSE MAP &rarr;
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
            {driveSubMode === 'quickplay' && (() => {
              const selectedTrack = quickPlayMapTrack || getRaceableQuickPlayTracks()[0];
              const selectedMeta = getQuickPlayTrackMeta(selectedTrack);
              const selectedLength = getTrackLength(getTrackVectors(selectedTrack));
              const selectedPreviewPath = getTrackPreviewPath(selectedTrack);
              const isCarStep = quickPlayStep === 'car';
              const showBottomSlider = !isCarStep || (isCarStep && quickPlaySelectedBrand !== 'All');
              const activeCarConfig = CARS_DATABASE.find((car) => car.id === activeCarId) || CARS_DATABASE[0];
              const currentBrandName = (quickPlaySelectedBrand && quickPlaySelectedBrand !== 'All') ? quickPlaySelectedBrand : activeCarConfig.brand;

              return (
                <div className={`relative w-full h-full min-h-[520px] overflow-hidden ${hideGarageBackground ? 'bg-black' : 'bg-transparent'} text-left animate-fadeIn`}>

                  {/* Map Background (slides down to bottom) */}
                  <div
                    className={`quick-play-map-video absolute inset-0 opacity-95 transition-transform duration-700 ease-in-out ${isCarStep ? 'translate-y-full' : 'translate-y-0'
                      }`}
                    style={{ backgroundImage: selectedMeta.backgroundImage }}
                  />

                  {/* Dedicated Car Selection Showcase Studio Background */}
                  <div
                    className={`absolute inset-0 z-0 pointer-events-none transition-all duration-700 ease-in-out overflow-hidden ${isShowroomActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                      }`}
                  >
                    {/* Deep Low-Light Charcoal Studio Radial Ambient & Dark Vignette */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,_rgba(30,41,59,0.30)_0%,_rgba(15,15,18,0.92)_50%,_rgba(5,5,7,0.99)_100%)]" />

                    {/* Overhead Low-Key Neutral Spotlight Conic Light Beams */}
                    <div className="absolute -top-1/4 left-1/2 -translate-x-1/2 w-[120vw] h-[100vh] bg-[conic-gradient(from_255deg_at_50%_0%,transparent_0deg,rgba(255,255,255,0.06)_25deg,transparent_50deg)] mix-blend-screen blur-xl pointer-events-none" />
                    <div className="absolute -top-1/4 left-1/2 -translate-x-1/2 w-[100vw] h-[100vh] bg-[conic-gradient(from_85deg_at_50%_0%,transparent_0deg,rgba(203,213,225,0.05)_20deg,transparent_40deg)] mix-blend-screen blur-lg pointer-events-none" />

                    {/* Subtle Turntable Pedestal Floor Ring (No Grid Floor!) */}
                    <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 w-[600px] sm:w-[800px] h-[160px] sm:h-[220px] rounded-full border border-zinc-700/30 bg-white/[0.01] shadow-[0_0_40px_rgba(255,255,255,0.04)] [transform:rotateX(72deg)] pointer-events-none flex items-center justify-center">
                      <div className="w-[85%] h-[85%] rounded-full border border-zinc-600/20 shadow-[0_0_20px_rgba(255,255,255,0.03)]" />
                    </div>

                    {/* Side Studio Telemetry Lines & Dark Studio Vignette */}
                    <div className="absolute left-6 top-1/4 bottom-1/4 w-[1px] bg-gradient-to-b from-transparent via-zinc-700/40 to-transparent hidden md:block" />
                    <div className="absolute right-6 top-1/4 bottom-1/4 w-[1px] bg-gradient-to-b from-transparent via-zinc-700/40 to-transparent hidden md:block" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/90 pointer-events-none" />
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-black/92 pointer-events-none" />

                  {/* Main Map Selection UI Grid / Layout */}
                  <main className="relative z-10 h-full min-h-[520px] overflow-hidden p-5 sm:p-8 lg:p-10 text-left">

                    {/* Mobile Route info (goes right) */}
                    <div className={`pointer-events-none absolute left-5 top-5 z-10 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-400 sm:left-8 sm:top-8 md:hidden transition-transform duration-700 ease-in-out ${isCarStep ? 'translate-x-[200%]' : 'translate-x-0'
                      }`}>
                      <Route className="h-4 w-4" style={{ color: selectedMeta.accent }} />
                      <span>{formatDistance(selectedLength)}</span>
                    </div>

                    {/* Desktop Left Sidebar (goes left) */}
                    <div className={`hidden md:flex absolute left-0 top-0 bottom-0 w-80 border-r border-white/10 bg-zinc-950/70 backdrop-blur-md p-6 flex-col gap-6 z-30 text-left transition-transform duration-700 ease-in-out ${isCarStep ? '-translate-x-full' : 'translate-x-0'
                      }`}>
                      {/* Route/Distance Info */}
                      <div className="flex items-center gap-2.5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-400">
                        <Route className="h-5.5 w-5.5" style={{ color: selectedMeta.accent }} />
                        <span>{formatDistance(selectedLength)}</span>
                      </div>

                      <div className="h-[1px] w-full bg-white/10" />

                      {/* Filter By Type Selector */}
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">
                          {getQuickPlayTypeLabel(selectedMeta.category)}
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {(['city', 'forest', 'racetrack'] as const).map((filterId) => {
                            const filterMeta = QUICK_PLAY_MAP_FILTERS.find((f) => f.id === filterId)!;
                            const IconComponent = filterMeta.Icon;
                            const isActive = quickPlayMapFilter === filterId;
                            return (
                              <button
                                key={filterId}
                                type="button"
                                onClick={() => setQuickPlayMapFilter(filterId)}
                                className={`flex aspect-square items-center justify-center transition-all duration-300 cursor-pointer rounded border ${isActive
                                  ? 'bg-rose-600 border-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.25)]'
                                  : 'bg-black/40 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                                  }`}
                                style={isActive ? {} : { color: selectedMeta.accent }}
                                title={filterMeta.label}
                              >
                                <IconComponent className="h-7.5 w-7.5 shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="h-[1px] w-full bg-white/10" />

                      {/* Laps and Opponents Count Selector */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Laps</span>
                          <div className="flex items-center justify-between w-full px-1 py-1">
                            <button
                              type="button"
                              aria-label="Less laps"
                              onClick={() => {
                                setLapChangeDir('down');
                                setQuickPlayLapCount((laps) => Math.max(1, laps - 1));
                              }}
                              className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                            >
                              <ChevronLeft className="h-6.5 w-6.5" strokeWidth={3.5} />
                            </button>
                            <span key={`${quickPlayLapCount}-${lapChangeDir}`} className={`w-10 text-center font-mono text-xl font-black text-white inline-block ${lapChangeDir === 'up' ? 'animate-slideRightToLeft' : 'animate-slideLeftToRight'}`}>
                              {quickPlayLapCount}
                            </span>
                            <button
                              type="button"
                              aria-label="More laps"
                              onClick={() => {
                                setLapChangeDir('up');
                                setQuickPlayLapCount((laps) => Math.min(99, laps + 1));
                              }}
                              className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                            >
                              <ChevronRight className="h-6.5 w-6.5" strokeWidth={3.5} />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Opponents</span>
                          <div className="flex items-center justify-between w-full px-1 py-1">
                            <button
                              type="button"
                              aria-label="Less opponents"
                              onClick={() => {
                                setOpponentsChangeDir('down');
                                setQuickPlayOpponentCount((c) => Math.max(1, c - 1));
                              }}
                              className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                            >
                              <ChevronLeft className="h-6.5 w-6.5" strokeWidth={3.5} />
                            </button>
                            <span key={`${quickPlayOpponentCount}-${opponentsChangeDir}`} className={`w-10 text-center font-mono text-xl font-black text-white inline-block ${opponentsChangeDir === 'up' ? 'animate-slideRightToLeft' : 'animate-slideLeftToRight'}`}>
                              {quickPlayOpponentCount}
                            </span>
                            <button
                              type="button"
                              aria-label="More opponents"
                              onClick={() => {
                                setOpponentsChangeDir('up');
                                setQuickPlayOpponentCount((c) => Math.min(12, c + 1));
                              }}
                              className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                            >
                              <ChevronRight className="h-6.5 w-6.5" strokeWidth={3.5} />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="h-[1px] w-full bg-white/10" />

                      {/* Opponent Selector */}
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Difficulty</span>
                        <div className="flex items-center justify-between w-full px-1 py-1">
                          <button
                            type="button"
                            aria-label="Lower opponent difficulty"
                            onClick={() => adjustQuickPlayDifficulty(-1)}
                            className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all disabled:opacity-25 disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer"
                            disabled={quickPlayDifficultyIndex === 0}
                          >
                            <ChevronLeft className="h-6.5 w-6.5" strokeWidth={3.5} />
                          </button>
                          <span key={`${quickPlayDifficulty}-${diffChangeDir}`} className={`w-24 text-center text-[11px] font-black uppercase tracking-wider text-zinc-100 inline-block ${diffChangeDir === 'up' ? 'animate-slideRightToLeft' : 'animate-slideLeftToRight'}`}>
                            {getQuickPlayDifficultyLabel(quickPlayDifficulty)}
                          </span>
                          <button
                            type="button"
                            aria-label="Higher opponent difficulty"
                            onClick={() => adjustQuickPlayDifficulty(1)}
                            className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all disabled:opacity-25 disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer"
                            disabled={quickPlayDifficultyIndex === QUICK_PLAY_DIFFICULTIES.length - 1}
                          >
                            <ChevronRight className="h-6.5 w-6.5" strokeWidth={3.5} />
                          </button>
                        </div>
                      </div>

                      <div className="h-[1px] w-full bg-white/10" />

                      {/* Driving Mode Selector */}
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Driving Mode</span>
                        <DrivingModeSelector
                          drivingMode={drivingMode}
                          setDrivingMode={setDrivingMode}
                          className="w-full"
                        />
                      </div>

                      {/* Sidebar Footer Quote */}
                      <div className="mt-auto flex flex-col items-center gap-3 pt-2">
                        <div
                          className="h-14 w-44 opacity-45 hover:opacity-80 bg-rose-500 transition-opacity duration-300 pointer-events-auto"
                          style={{
                            maskImage: "url('/icon/logo.svg')",
                            maskRepeat: "no-repeat",
                            maskSize: "contain",
                            maskPosition: "center",
                            WebkitMaskImage: "url('/icon/logo.svg')",
                            WebkitMaskRepeat: "no-repeat",
                            WebkitMaskSize: "contain",
                            WebkitMaskPosition: "center",
                          }}
                        />
                        <p className="text-[9px] text-center font-bold tracking-[0.12em] text-zinc-500 uppercase leading-relaxed max-w-[240px]">
                          Every corner is carved with rubber and heat. Pull off the feat and become the legend
                        </p>
                      </div>
                    </div>

                    {/* Back Button (goes right) */}
                    <button
                      type="button"
                      onClick={() => setDriveSubMode(null)}
                      className={`absolute right-5 top-5 z-20 border border-white/10 bg-black/45 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 backdrop-blur-md transition-all hover:border-white/25 hover:text-white cursor-pointer sm:right-8 sm:top-8 transition-transform duration-700 ease-in-out ${isCarStep ? 'translate-x-[200%]' : 'translate-x-0'
                        }`}
                    >
                      BACK
                    </button>

                    {/* Map Surface and Name Info (goes right) */}
                    <div className={`pointer-events-none absolute inset-x-0 top-12 z-10 px-5 text-right sm:top-16 sm:px-8 lg:px-10 transition-transform duration-700 ease-in-out ${isCarStep ? 'translate-x-full' : 'translate-x-0'
                      }`}>
                      <span className="text-[9px] font-black uppercase tracking-[0.28em]" style={{ color: selectedMeta.accent }}>
                        {selectedMeta.surface}
                      </span>
                      <h2 className="ml-auto mt-2 max-w-[780px] text-3xl font-black uppercase leading-[0.92] tracking-normal text-white sm:text-5xl lg:text-6xl">
                        {selectedTrack.name}
                      </h2>
                    </div>

                    {/* Map Preview Path SVG (fades out) */}
                    <div className={`pointer-events-none absolute inset-0 flex items-center justify-center px-4 pb-28 pt-20 sm:px-10 transition-opacity duration-700 ${isCarStep ? 'opacity-0' : 'opacity-80'
                      }`}>
                      <svg className="h-[64%] w-[78%] max-w-[860px] drop-shadow-[0_0_32px_rgba(255,255,255,0.08)]" viewBox="0 0 100 70" aria-hidden="true">
                        <path d={selectedPreviewPath} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                        <path d={selectedPreviewPath} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d={selectedPreviewPath} fill="none" stroke={selectedMeta.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="quick-play-map-path-runner" />
                      </svg>
                    </div>

                    {/* Center Logo Button (fades/goes left) */}
                    <button
                      key={selectedTrack.id}
                      type="button"
                      onClick={() => setQuickPlayStep('car')}
                      className={`absolute z-20 flex items-center justify-center transition-all hover:scale-105 cursor-pointer transition-transform duration-700 ease-in-out ${isCarStep ? 'translate-x-[-200%] opacity-0' : 'translate-x-0'
                        } ${selectedMeta.logo.startsWith('/')
                          ? 'quick-play-center-logo-img left-10 top-6 md:left-[125px] md:top-5 w-full h-16 sm:max-w-[360px] sm:h-24 md:max-w-[640px] md:h-40'
                          : 'quick-play-center-logo left-20 top-10 md:left-[400px] md:top-18 overflow-hidden border rounded-2xl bg-black/65 text-white backdrop-blur-md aspect-square w-14 md:w-20'
                        }`}
                      style={
                        selectedMeta.logo.startsWith('/')
                          ? {}
                          : { borderColor: selectedMeta.accent, boxShadow: `0 0 36px ${selectedMeta.accent}44` }
                      }
                    >
                      <span className="relative z-10 text-xl font-black tracking-[0.16em] md:text-3xl flex items-center justify-center w-full h-full">
                        {selectedMeta.logo.startsWith('/') ? (
                          <img
                            src={selectedMeta.logo}
                            alt={`${selectedTrack.name} Logo`}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          selectedMeta.logo
                        )}
                      </span>
                    </button>

                    {/* Bottom selector pane (slides down/up based on showBottomSlider) */}
                    <div className={`absolute left-0 md:left-80 right-0 bottom-0 z-30 transition-transform duration-700 ease-in-out pointer-events-auto ${showBottomSlider ? 'translate-y-0' : 'translate-y-full'
                      }`}>
                      <div className="w-full">
                        {!isCarStep && (
                          <div className="mb-4 px-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto] md:items-end md:hidden">
                            {/* Track Type Selector (Mobile) */}
                            <div className="flex items-center justify-between gap-3 border border-white/10 bg-black/50 px-3 py-2 backdrop-blur-md">
                              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">
                                {getQuickPlayTypeLabel(selectedMeta.category)}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {(['city', 'forest', 'racetrack'] as const).map((filterId) => {
                                  const filterMeta = QUICK_PLAY_MAP_FILTERS.find((f) => f.id === filterId)!;
                                  const IconComponent = filterMeta.Icon;
                                  const isActive = quickPlayMapFilter === filterId;
                                  return (
                                    <button
                                      key={filterId}
                                      type="button"
                                      onClick={() => setQuickPlayMapFilter(filterId)}
                                      className={`flex aspect-square h-9 items-center justify-center transition-all cursor-pointer border rounded-md ${isActive
                                        ? 'bg-rose-600 border-rose-500 text-white shadow-[0_0_8px_rgba(244,63,94,0.25)]'
                                        : 'bg-black/40 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                                        }`}
                                      style={isActive ? {} : { color: selectedMeta.accent }}
                                      title={filterMeta.label}
                                    >
                                      <IconComponent className="h-4.5 w-4.5 shrink-0" />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 md:min-w-[180px] px-1 py-1">
                              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Laps</span>
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  aria-label="Less laps"
                                  onClick={() => {
                                    setLapChangeDir('down');
                                    setQuickPlayLapCount((laps) => Math.max(1, laps - 1));
                                  }}
                                  className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                                >
                                  <ChevronLeft className="h-6.5 w-6.5" strokeWidth={3.5} />
                                </button>
                                <span key={`${quickPlayLapCount}-${lapChangeDir}`} className={`w-10 text-center font-mono text-xl font-black text-white inline-block ${lapChangeDir === 'up' ? 'animate-slideRightToLeft' : 'animate-slideLeftToRight'}`}>
                                  {quickPlayLapCount}
                                </span>
                                <button
                                  type="button"
                                  aria-label="More laps"
                                  onClick={() => {
                                    setLapChangeDir('up');
                                    setQuickPlayLapCount((laps) => Math.min(99, laps + 1));
                                  }}
                                  className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                                >
                                  <ChevronRight className="h-6.5 w-6.5" strokeWidth={3.5} />
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 md:min-w-[180px] px-1 py-1">
                              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Opponents</span>
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  aria-label="Less opponents"
                                  onClick={() => {
                                    setOpponentsChangeDir('down');
                                    setQuickPlayOpponentCount((c) => Math.max(1, c - 1));
                                  }}
                                  className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                                >
                                  <ChevronLeft className="h-6.5 w-6.5" strokeWidth={3.5} />
                                </button>
                                <span key={`${quickPlayOpponentCount}-${opponentsChangeDir}`} className={`w-10 text-center font-mono text-xl font-black text-white inline-block ${opponentsChangeDir === 'up' ? 'animate-slideRightToLeft' : 'animate-slideLeftToRight'}`}>
                                  {quickPlayOpponentCount}
                                </span>
                                <button
                                  type="button"
                                  aria-label="More opponents"
                                  onClick={() => {
                                    setOpponentsChangeDir('up');
                                    setQuickPlayOpponentCount((c) => Math.min(12, c + 1));
                                  }}
                                  className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                                >
                                  <ChevronRight className="h-6.5 w-6.5" strokeWidth={3.5} />
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 md:min-w-[230px] px-1 py-1">
                              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Difficulty</span>
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  aria-label="Lower opponent difficulty"
                                  onClick={() => adjustQuickPlayDifficulty(-1)}
                                  className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all disabled:opacity-25 disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer"
                                  disabled={quickPlayDifficultyIndex === 0}
                                >
                                  <ChevronLeft className="h-6.5 w-6.5" strokeWidth={3.5} />
                                </button>
                                <span key={`${quickPlayDifficulty}-${diffChangeDir}`} className={`w-24 text-center text-[11px] font-black uppercase tracking-wider text-zinc-100 inline-block ${diffChangeDir === 'up' ? 'animate-slideRightToLeft' : 'animate-slideLeftToRight'}`}>
                                  {getQuickPlayDifficultyLabel(quickPlayDifficulty)}
                                </span>
                                <button
                                  type="button"
                                  aria-label="Higher opponent difficulty"
                                  onClick={() => adjustQuickPlayDifficulty(1)}
                                  className="flex h-8 w-8 items-center justify-center text-rose-500 hover:text-rose-450 hover:scale-110 active:scale-95 transition-all disabled:opacity-25 disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer"
                                  disabled={quickPlayDifficultyIndex === QUICK_PLAY_DIFFICULTIES.length - 1}
                                >
                                  <ChevronRight className="h-6.5 w-6.5" strokeWidth={3.5} />
                                </button>
                              </div>
                            </div>

                            {/* Driving Mode Selector (Desktop) */}
                            <div className="flex items-center justify-between gap-3 border border-white/10 bg-black/50 px-3 py-2 backdrop-blur-md md:min-w-[230px]">
                              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Mode</span>
                              <DrivingModeSelector
                                drivingMode={drivingMode}
                                setDrivingMode={setDrivingMode}
                                className="w-36 h-8"
                                shortLabel
                              />
                            </div>
                          </div>
                        )}

                        {/* Track Description or Car Info Slider */}
                        {isCarStep ? (() => {
                          const activeCarConfig = CARS_DATABASE.find((car) => car.id === (quickPlayCarId || activeCarId)) || CARS_DATABASE[0];
                          if (!quickPlayCarHasBeenClicked) {
                            return (
                              <div className="w-full border-t border-cyan-500/20 bg-gradient-to-r from-zinc-950 via-cyan-950/20 to-zinc-950 py-3.5 px-6 shadow-[0_-8px_24px_rgba(0,0,0,0.6)] backdrop-blur-xl flex justify-between items-center gap-4 text-left pointer-events-auto">
                                <div className="flex items-center gap-3 text-left w-full md:w-auto">
                                  <span className="flex h-3 w-3 relative shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500 shadow-[0_0_8px_#06b6d4]" />
                                  </span>
                                  <span className="text-xs font-black uppercase tracking-widest text-cyan-300">
                                    SELECT A VEHICLE FROM THE SLIDER BELOW TO PREVIEW IN 3D
                                  </span>
                                </div>
                                <button
                                  onClick={() => setQuickPlaySelectedBrand('All')}
                                  className="px-4 py-2 border border-cyan-500/30 hover:border-cyan-400 bg-zinc-900/80 hover:bg-cyan-950/40 text-[10px] font-black uppercase tracking-widest text-cyan-300 rounded-xl transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.15)] hover:shadow-[0_0_16px_rgba(6,182,212,0.35)] shrink-0"
                                >
                                  CHANGE BRAND
                                </button>
                              </div>
                            );
                          }
                          return (
                            <div className="w-full border-t border-white/10 bg-gradient-to-r from-zinc-950/95 via-zinc-900/90 to-zinc-950/95 py-3.5 px-6 shadow-[0_-8px_32px_rgba(0,0,0,0.7)] backdrop-blur-2xl flex flex-col md:flex-row justify-between items-center gap-4 text-left pointer-events-auto">
                              {/* Car Name */}
                              <div className="flex items-center gap-3 text-left w-full md:w-auto">
                                <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-black text-cyan-400 tracking-widest uppercase">
                                  {activeCarConfig.brand}
                                </span>
                                <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                                  {activeCarConfig.name}
                                </h2>
                              </div>

                              {/* Quick Specs with HUD Visual Stat Bars */}
                              <div className="flex gap-5 items-center text-xs font-bold text-zinc-300 w-full md:w-auto justify-between md:justify-start">
                                {/* Speed */}
                                <div className="flex flex-col gap-1 w-20">
                                  <div className="flex justify-between items-center text-[9px] font-black tracking-wider text-zinc-400 uppercase">
                                    <span>SPD</span>
                                    <span className="text-cyan-400 font-extrabold">{Math.round(activeCarConfig.speed * 10)}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-zinc-800/80 rounded-full overflow-hidden border border-white/5 p-0.5">
                                    <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 rounded-full transition-all duration-500 shadow-[0_0_6px_#06b6d4]" style={{ width: `${Math.min(100, Math.round(activeCarConfig.speed * 10))}%` }} />
                                  </div>
                                </div>

                                {/* Acceleration */}
                                <div className="flex flex-col gap-1 w-20">
                                  <div className="flex justify-between items-center text-[9px] font-black tracking-wider text-zinc-400 uppercase">
                                    <span>ACC</span>
                                    <span className="text-cyan-400 font-extrabold">{Math.round(activeCarConfig.acceleration * 10)}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-zinc-800/80 rounded-full overflow-hidden border border-white/5 p-0.5">
                                    <div className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full transition-all duration-500 shadow-[0_0_6px_#06b6d4]" style={{ width: `${Math.min(100, Math.round(activeCarConfig.acceleration * 10))}%` }} />
                                  </div>
                                </div>

                                {/* Handling */}
                                <div className="flex flex-col gap-1 w-20">
                                  <div className="flex justify-between items-center text-[9px] font-black tracking-wider text-zinc-400 uppercase">
                                    <span>HDL</span>
                                    <span className="text-cyan-400 font-extrabold">{Math.round(activeCarConfig.handling * 10)}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-zinc-800/80 rounded-full overflow-hidden border border-white/5 p-0.5">
                                    <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-500 shadow-[0_0_6px_#06b6d4]" style={{ width: `${Math.min(100, Math.round(activeCarConfig.handling * 10))}%` }} />
                                  </div>
                                </div>

                                {/* Drive Type Pill */}
                                <div className="bg-zinc-900/90 px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-black tracking-widest uppercase text-cyan-300 shadow-inner">
                                  {activeCarConfig.driveType}
                                </div>
                              </div>

                              {/* Buttons */}
                              <div className="flex gap-3 items-center w-full md:w-auto justify-end">
                                <button
                                  onClick={() => setQuickPlaySelectedBrand('All')}
                                  className="px-4 py-2.5 border border-cyan-500/30 hover:border-cyan-400 bg-zinc-900/80 hover:bg-cyan-950/40 text-[10px] font-black uppercase tracking-widest text-cyan-300 rounded-xl transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.15)] hover:shadow-[0_0_16px_rgba(6,182,212,0.35)]"
                                >
                                  CHANGE BRAND
                                </button>
                                <button
                                  onClick={() => {
                                    const trackId = quickPlayChosenTrack?.id || getDefaultQuickPlayTrackId('city');
                                    const carToDrive = quickPlayCarId || activeCarId;
                                    if (trackId) startQuickPlayRace(carToDrive, trackId, quickPlayLapCount, quickPlayDifficulty, drivingMode, quickPlayOpponentCount);
                                  }}
                                  className="group relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-zinc-950 transition-all cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.5)] hover:shadow-[0_0_28px_rgba(6,182,212,0.8)] hover:scale-105 active:scale-95"
                                >
                                  <span>START RACE</span>
                                  <Play className="w-4 h-4 fill-current transition-transform group-hover:translate-x-0.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })() : (
                          <div className="w-full border-t border-white/10 bg-zinc-950/80 py-3 px-6 shadow-[0_-4px_16px_rgba(0,0,0,0.35)] backdrop-blur-md">
                            <MapDescriptionSlider description={selectedTrack.description} />
                          </div>
                        )}

                        {/* Carousel (Maps or Brand Cars) */}
                        <div
                          className="relative h-32 overflow-hidden border-t border-white/5 bg-zinc-950/60 px-16 flex items-center backdrop-blur-2xl shadow-[0_-12px_36px_rgba(0,0,0,0.7)]"
                          onPointerDown={(event) => {
                            if (isCarStep) return;
                            quickPlayCarouselDragStartRef.current = event.clientX;
                          }}
                          onPointerUp={(event) => {
                            if (isCarStep) return;
                            const startX = quickPlayCarouselDragStartRef.current;
                            quickPlayCarouselDragStartRef.current = null;
                            if (startX === null) return;
                            const deltaX = event.clientX - startX;
                            if (Math.abs(deltaX) < 36) return;
                            selectQuickPlayTrackByOffset(deltaX < 0 ? 1 : -1);
                          }}
                          onPointerCancel={() => {
                            quickPlayCarouselDragStartRef.current = null;
                          }}
                        >
                          {isCarStep ? (
                            <div className="flex h-full w-full items-center justify-start gap-4 overflow-x-auto py-2 scrollbar-none px-4 pointer-events-auto">
                              {CARS_DATABASE.filter((car) => car.brand === quickPlaySelectedBrand).map((car) => {
                                const isActive = car.id === (quickPlayCarId || activeCarId) && quickPlayCarHasBeenClicked;
                                return (
                                  <button
                                    key={car.id}
                                    type="button"
                                    onClick={() => {
                                      setQuickPlayCarId(car.id);
                                      setQuickPlayCarHasBeenClicked(true);
                                    }}
                                    className={`quick-play-logo-token group relative flex items-center justify-center transition-all duration-300 cursor-pointer border rounded-2xl bg-gradient-to-b from-zinc-900/90 to-black text-white shrink-0 h-22 w-40 overflow-hidden ${isActive
                                      ? 'border-cyan-400 shadow-[0_0_24px_rgba(6,182,212,0.5)] scale-105 bg-gradient-to-b from-cyan-950/40 to-zinc-950 ring-1 ring-cyan-400/50'
                                      : 'border-white/10 opacity-75 hover:opacity-100 hover:border-white/30 hover:scale-105'
                                      }`}
                                    title={`${car.brand} ${car.name}`}
                                  >
                                    {/* Active badge */}
                                    {isActive && (
                                      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-cyan-400 text-zinc-950 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md shadow-[0_0_8px_#06b6d4]">
                                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                                        <span>ACTIVE</span>
                                      </div>
                                    )}

                                    {/* Drive Type badge */}
                                    <span className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-md text-[8px] font-black bg-black/75 border border-white/10 text-cyan-300 uppercase tracking-wider backdrop-blur-sm">
                                      {car.driveType}
                                    </span>

                                    {/* Car 3D Canvas / Icon */}
                                    <DealerThreeCarIcon car={car} isSliderIcon={true} className="absolute inset-0 w-full h-full z-0 pointer-events-none opacity-85 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                aria-label="Previous map"
                                onClick={() => selectQuickPlayTrackByOffset(-1)}
                                className="absolute left-4 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-zinc-950/70 text-rose-500 hover:text-rose-450 shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-all hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-md"
                              >
                                <ChevronLeft className="h-7 w-7" strokeWidth={2.5} />
                              </button>

                              <div className="quick-play-logo-rail flex h-full w-full items-center justify-center gap-4">
                                {quickPlayTracks.map((track, index) => {
                                  const meta = getQuickPlayTrackMeta(track);
                                  const previewPath = getTrackPreviewPath(track);
                                  const isActive = track.id === selectedTrack.id;
                                  const distanceFromActive = Math.abs(index - quickPlaySelectedTrackIndex);
                                  const isNear = distanceFromActive <= 2 || distanceFromActive >= quickPlayTracks.length - 2;

                                  return (
                                    <button
                                      key={track.id}
                                      type="button"
                                      onClick={() => {
                                        if (isActive) {
                                          setQuickPlayStep('car');
                                          return;
                                        }
                                        setQuickPlayTrackId(track.id);
                                      }}
                                      className={`quick-play-logo-token relative flex items-center justify-center transition-all duration-350 cursor-pointer hover:scale-105 ${meta.logo.startsWith('/')
                                        ? 'h-20 w-36 sm:h-24 sm:w-44'
                                        : 'aspect-square h-16 shrink-0 overflow-hidden border rounded-2xl bg-black/80 text-white sm:h-20'
                                        } ${isActive ? 'is-active' : isNear ? 'opacity-80 hover:opacity-100' : 'hidden lg:flex opacity-45 hover:opacity-80'}`}
                                      style={
                                        meta.logo.startsWith('/')
                                          ? {}
                                          : isActive
                                            ? { borderColor: meta.accent, boxShadow: `0 0 28px ${meta.accent}44` }
                                            : { borderColor: 'rgba(255,255,255,0.06)' }
                                      }
                                      aria-label={`${isActive ? 'Choose' : 'Select'} ${track.name}`}
                                      title={track.name}
                                    >
                                      {!meta.logo.startsWith('/') && (
                                        <svg className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] opacity-70" viewBox="0 0 100 70" aria-hidden="true">
                                          <path d={previewPath} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                                          <path d={previewPath} fill="none" stroke={meta.accent} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      )}
                                      <span className="relative z-10 text-lg font-black tracking-[0.14em] sm:text-xl flex items-center justify-center w-full h-full">
                                        {meta.logo.startsWith('/') ? (
                                          <img
                                            src={meta.logo}
                                            alt={`${track.name} Logo`}
                                            className="w-full h-full object-contain"
                                          />
                                        ) : (
                                          meta.logo
                                        )}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>

                              <button
                                type="button"
                                aria-label="Next map"
                                onClick={() => selectQuickPlayTrackByOffset(1)}
                                className="absolute right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-zinc-950/70 text-rose-500 hover:text-rose-450 shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-all hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-md"
                              >
                                <ChevronRight className="h-7 w-7" strokeWidth={2.5} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </main>

                  {/* 2b. Dropdown Vehicle Selection Drawer */}
                  <div
                    className={`absolute inset-x-0 top-0 z-40 bg-gradient-to-b from-zinc-950 via-zinc-950/98 to-black/95 border-b border-cyan-500/30 backdrop-blur-3xl flex flex-col p-6 sm:p-8 transition-transform duration-700 ease-in-out overflow-hidden h-[46vh] shadow-[0_20px_50px_rgba(0,0,0,0.9)] ${(isCarStep && quickPlaySelectedBrand === 'All') ? 'translate-y-0' : '-translate-y-full pointer-events-none'
                      }`}
                  >
                    {/* Header */}
                    <div className="flex justify-between items-center pb-4 border-b border-white/10 shrink-0">
                      <div className="flex flex-col gap-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#06b6d4]" />
                          <span className="text-[10px] font-extrabold tracking-[0.4em] text-cyan-400 uppercase italic">
                            QUICK PLAY VEHICLE SELECT
                          </span>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black text-white tracking-wider uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
                          {quickPlaySelectedBrand && quickPlaySelectedBrand !== 'All'
                            ? `AVAILABLE CARS: ${quickPlaySelectedBrand.toUpperCase()}`
                            : 'CHOOSE BRAND BY REGION'}
                        </h2>
                      </div>
                      <button
                        onClick={() => {
                          setQuickPlayStep('map');
                        }}
                        className="group flex items-center gap-2 px-5 py-2.5 border border-white/10 hover:border-rose-500/40 bg-zinc-900/80 hover:bg-rose-950/30 text-xs font-black tracking-widest text-zinc-300 hover:text-rose-400 rounded-xl transition-all cursor-pointer shadow-lg"
                      >
                        <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                        <span>BACK TO MAP</span>
                      </button>
                    </div>

                    {/* Columns by Dealer City */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 w-full max-w-6xl mx-auto py-5 shrink-0">
                      {DEALER_CITIES.map((city) => {
                        const accentColor =
                          city.id === 'east' ? '#f43f5e' :
                            city.id === 'west' ? '#06b6d4' :
                              city.id === 'north' ? '#3b82f6' :
                                '#eab308';
                        return (
                          <div
                            key={city.id}
                            className="group relative flex flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-900/40 p-4 backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:bg-zinc-900/60 shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden"
                          >
                            {/* Glowing accent bar */}
                            <div
                              className="absolute top-0 inset-x-0 h-1"
                              style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
                            />

                            <div className="flex justify-between items-center pb-2 border-b border-white/10 text-left">
                              <div className="flex flex-col">
                                <span className="text-xs font-black uppercase tracking-widest" style={{ color: accentColor }}>
                                  {city.name}
                                </span>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                                  {city.region}
                                </span>
                              </div>
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                                {city.brands.length} BRANDS
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2.5 justify-items-center py-1">
                              {city.brands.map((brandName) => {
                                const isActive = quickPlaySelectedBrand === brandName;
                                const brandColor = getBrandColor(brandName);
                                const initials = getDealerBrandInitials(brandName);
                                return (
                                  <button
                                    key={brandName}
                                    onClick={() => setQuickPlaySelectedBrand(brandName)}
                                    className={`group/brand relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border transition-all duration-300 cursor-pointer ${isActive
                                      ? 'scale-110 shadow-[0_0_24px_rgba(6,182,212,0.5)] ring-1 ring-cyan-400'
                                      : 'hover:scale-105'
                                      }`}
                                    style={{
                                      borderColor: isActive ? '#06b6d4' : 'rgba(255, 255, 255, 0.12)',
                                      backgroundColor: isActive ? 'rgba(6, 182, 212, 0.2)' : 'rgba(15, 15, 20, 0.75)'
                                    }}
                                    title={brandName}
                                  >
                                    {/* Outer glowing ring */}
                                    <div
                                      className="absolute inset-0 border border-white/5 rounded-2xl transition-all duration-500 group-hover/brand:rotate-[45deg]"
                                      style={{
                                        borderColor: isActive ? '#06b6d4' : `${brandColor}33`,
                                      }}
                                    />
                                    {/* Inner dashed ring */}
                                    <div
                                      className="absolute inset-1 border border-dashed border-white/10 rounded-xl"
                                      style={{
                                        borderColor: isActive ? '#06b6d4aa' : `${brandColor}55`,
                                      }}
                                    />
                                    {/* Monogram initials */}
                                    <span
                                      className="relative text-[11px] font-black font-mono tracking-wider text-zinc-300 group-hover/brand:text-white transition-colors"
                                      style={{
                                        textShadow: `0 0 10px ${brandColor}88`,
                                        color: isActive ? '#22d3ee' : '#e4e4e7'
                                      }}
                                    >
                                      {initials}
                                    </span>

                                    {/* Brand Name Tooltip */}
                                    <span className="pointer-events-none absolute -bottom-8 z-30 opacity-0 group-hover/brand:opacity-100 transition-all duration-200 text-[9px] font-black uppercase tracking-wider text-white bg-zinc-950/95 px-2 py-1 rounded-md border border-white/20 whitespace-nowrap shadow-xl">
                                      {brandName}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pointer-events-none absolute inset-0 z-40 bg-black quick-play-black-wipe" />
                </div>
              );
            })()}            {/* 3. Career Mode Screen */}
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
                            <MapIcon className="w-5 h-5 text-rose-500" />
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
                  className="group flex h-12 w-12 items-center justify-center cursor-pointer"
                  aria-label="Back"
                  title="Back"
                >
                  <img
                    src="/icon/back_button.svg"
                    alt=""
                    className="h-full w-full object-contain drop-shadow-[0_0_18px_rgba(0,0,0,0.65)] transition-[filter] duration-300 ease-in-out scale-200 brightness-100 group-hover:brightness-125"
                    draggable={false}
                  />
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
                                  ? ['Sp-H', 'Sp-M', 'Sp-S', 'R-H', 'R-M', 'R-S', 'R-SS', 'Quali'][i]
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
