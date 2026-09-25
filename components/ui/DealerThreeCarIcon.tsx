'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CarConfig } from '../config/CarDatabase';
import { Vehicle } from '../objects/Vehicle';

export const CAR_ICON_CACHE = new Map<string, string>();

export const DealerThreeCarIcon = ({
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
  const cacheKey = `${isSliderIcon ? 'store-native-v4' : 'dealer-silhouette-v4'}_${car.id}_${car.color}_${car.hasSpoiler || false}_${centerModel || false}`;
  const [staticImageUrl, setStaticImageUrl] = useState<string | null>(() => CAR_ICON_CACHE.get(cacheKey) || null);

  useEffect(() => {
    if (isSliderIcon && CAR_ICON_CACHE.has(cacheKey)) {
      setStaticImageUrl(CAR_ICON_CACHE.get(cacheKey)!);
      return;
    }
    const mount = mountRef.current;
    if (!mount) return;

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

    const paint = isSliderIcon ? new THREE.Color(car.color) : new THREE.Color('#ff0258');
    const dealerSilhouetteMat = new THREE.MeshStandardMaterial({
      color: paint,
      roughness: 0.46,
      metalness: 0.24,
      emissive: paint,
      emissiveIntensity: 0.1,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
    });
    const dealerBlackMat = new THREE.MeshStandardMaterial({
      color: 0x050507,
      roughness: 0.5,
      metalness: 0.05,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
    });
    const displayRoot = new THREE.Group();
    displayRoot.rotation.y = isSliderIcon ? -Math.PI / 4 : -0.55;
    displayRoot.rotation.x = -0.08;
    scene.add(displayRoot);

    let isGltfReady = car.id !== 'honda_s2000' && car.id !== 'honda_accord_2026' && car.id !== 'ford_gt_2006' && car.id !== 'cybertruck' && car.id !== 'toyota_gt_one_1998';
    const iconVehicle = new Vehicle(car.id, car.color, undefined, undefined, () => {
      isGltfReady = true;
    });

    const dealerSideRotation = THREE.MathUtils.degToRad(338.4013);
    const storeCardRotation = THREE.MathUtils.degToRad(269.8) + (130 * Math.PI) / 180;
    iconVehicle.mesh.rotation.y = isSliderIcon ? storeCardRotation : dealerSideRotation;
    displayRoot.add(iconVehicle.mesh);

    const localBox = new THREE.Box3();
    const meshBox = new THREE.Box3();
    const rootInverse = new THREE.Matrix4();
    const relativeMatrix = new THREE.Matrix4();
    const blackPartByMesh = new WeakMap<THREE.Mesh, boolean>();

    const applyDealerMaterials = () => {
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

        const isKnownBlackPart =
          materialNames.includes('black') ||
          materialNames.includes('tire') ||
          materialNames.includes('rubber') ||
          materialNames.includes('wheel') ||
          materialNames.includes('rim') ||
          materialNames.includes('window') ||
          materialNames.includes('glass') ||
          materialNames.includes('intake') ||
          materialNames.includes('grille') ||
          materialNames.includes('trim') ||
          materialNames.includes('diffuser') ||
          materialNames.includes('splitter') ||
          objectPathName.includes('wheel') ||
          objectPathName.includes('tire') ||
          objectPathName.includes('caliper') ||
          objectPathName.includes('window') ||
          objectPathName.includes('glass') ||
          objectPathName.includes('grille') ||
          objectPathName.includes('intake') ||
          objectPathName.includes('trim') ||
          objectPathName.includes('seam') ||
          objectPathName.includes('mirror stem') ||
          objectPathName.includes('license') ||
          hasDarkSourceColor;

        blackPartByMesh.set(object, isKnownBlackPart);
        object.material = isKnownBlackPart ? dealerBlackMat : dealerSilhouetteMat;
      });
    };

    const applyPreviewMaterials = () => {
      if (isSliderIcon) return;
      applyDealerMaterials();
    };

    const getVehicleLocalBox = () => {
      localBox.makeEmpty();
      iconVehicle.mesh.updateMatrixWorld(true);
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
      const meshSignature = iconVehicle.mesh.children.map((child) => child.uuid).join('|');
      if (meshSignature === lastFitSignature) return;

      iconVehicle.mesh.scale.setScalar(1);
      iconVehicle.mesh.position.set(0, 0, 0);
      applyPreviewMaterials();
      iconVehicle.mesh.updateMatrixWorld(true);
      const box = getVehicleLocalBox();
      if (box.isEmpty()) return;

      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const longitudinalSize = size.z > 0.1 ? size.z : Math.max(size.x, size.y, 0.1);
      const scale = 5.25 / longitudinalSize;
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

    const resize = () => {
      const width = isSliderIcon ? (mount.clientWidth || 112) : 112;
      const height = isSliderIcon ? (mount.clientHeight || 64) : 64;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();

    if (isSliderIcon) {
      let sliderFrameId = 0;
      let sliderRetryCount = 0;
      const maxRetries = 600;

      const tryRenderStatic = () => {
        fitVehicleToIcon();
        if ((!isFitted || !isGltfReady) && sliderRetryCount < maxRetries) {
          sliderRetryCount++;
          sliderFrameId = requestAnimationFrame(tryRenderStatic);
          return;
        }
        renderer.render(scene, camera);
        try {
          const dataUrl = renderer.domElement.toDataURL('image/png');
          CAR_ICON_CACHE.set(cacheKey, dataUrl);
          setStaticImageUrl(dataUrl);
        } catch {
          // Canvas export failed
        }
        renderer.dispose();
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
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
