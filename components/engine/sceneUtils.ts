import * as THREE from 'three';

type ShadowMaterial = THREE.Material & {
  color?: THREE.Color;
  customProgramCacheKey?: () => string;
};

export function applyShadowsToScene(scene: THREE.Scene) {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh)) return;
    const material = Array.isArray(child.material) ? child.material[0] as ShadowMaterial | undefined : child.material as ShadowMaterial | undefined;

    if (material?.type === 'MeshBasicMaterial') {
      const isGroundGrid = child.geometry &&
        child.geometry.type === 'PlaneGeometry' &&
        material.color &&
        material.color.getHex() === 0x0a0a14;

      if (!isGroundGrid) {
        child.castShadow = false;
        child.receiveShadow = false;
        return;
      }
    }

    const isFlatGround = child.name === 'ground' ||
      (child.geometry && (child.geometry.type === 'BufferGeometry' || child.geometry.type === 'PlaneGeometry') &&
        material?.color &&
        (material.color.getHex() === 0x1f1f23 ||
          material.color.getHex() === 0x7bb369 ||
          material.color.getHex() === 0x0a0a14 ||
          material.color.getHex() === 0xeeeeee ||
          material.color.getHex() === 0xffcc00));

    if (isFlatGround) {
      child.receiveShadow = true;
      child.castShadow = false;
    } else if (child instanceof THREE.InstancedMesh && material?.customProgramCacheKey?.() === 'grass_leaves') {
      child.receiveShadow = true;
      child.castShadow = false;
    } else {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

export function disposeSceneObjects(scene: THREE.Scene) {
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;

    obj.geometry?.dispose();

    if (Array.isArray(obj.material)) {
      obj.material.forEach((mat) => mat.dispose());
    } else {
      obj.material?.dispose();
    }
  });
}
