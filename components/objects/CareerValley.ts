import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/* ============================================================================
   CAREER VALLEY
   ----------------------------------------------------------------------------
   Loads the career-map world. The whole thing - terrain, roads, trees, the
   colosseum arenas, the street lamps and the east pass - is authored in Blender
   and shipped as one model, so what you see in career_valley.blend is exactly
   what the player sees. Nothing here generates terrain.

   To change the world, edit it in Blender and re-export:

     scripts/build_career_valley.py   rebuilds everything from the formula
                                      (wipes hand edits)
     scripts/export_career_valley.py  exports the scene as-is
                                      (keeps hand edits)

   Venue positions live in the VENUES table of the build script and must stay
   in step with SECTORS in components/ui/CareerMap.tsx, which drives the 2D
   pins and the camera focus.

   The lamps are the one thing this file adds to the model: the poles arrive in
   the GLB, but their glow is drawn here so it can be switched by the clock.
   Their positions come from the manifest the build script writes beside the
   model.
   ========================================================================== */

export interface CareerValleyHandle {
  group: THREE.Group;
  /** Lights every street lamp, or puts them all out. Safe to call before load. */
  setLampsOn: (on: boolean) => void;
  dispose: () => void;
}

/** Where the model is anchored in world space. */
export const VALLEY_CENTER = new THREE.Vector3(-35, 0, 0);
/** Base height of the valley floor. */
export const VALLEY_FLOOR_Y = 0;

const TERRAIN_URL = '/models/career_valley.glb';
const LAMP_URL = '/models/career_valley_lamps.json';

/** Emissive strength of a lit lamp lens. The model ships its own; this wins. */
const LAMP_LENS_GLOW = 4.2;
/** Width of the pool of light a lamp throws on the road. */
const LAMP_POOL_SIZE = 19;

interface LampRecord {
  x: number;
  y: number;
  z: number;
  ground: number;
}

interface LampManifest {
  lensMaterial?: string;
  lamps?: LampRecord[];
}

/**
 * Soft round falloff, drawn once and shared by the head glows and the pools.
 * A texture rather than a shader because both uses are additive sprites and
 * this keeps them to two draw calls between them.
 */
const makeGlowTexture = (): THREE.Texture => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0.0, 'rgba(255,245,215,1)');
    gradient.addColorStop(0.25, 'rgba(255,224,164,0.65)');
    gradient.addColorStop(0.6, 'rgba(255,198,120,0.18)');
    gradient.addColorStop(1.0, 'rgba(255,190,110,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export function buildCareerValley(scene: THREE.Scene): CareerValleyHandle {
  const root = new THREE.Group();
  root.name = 'career-valley';
  root.position.copy(VALLEY_CENTER);
  scene.add(root);

  let disposed = false;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  // The clock may ask for lamps before the model has arrived, so the answer is
  // remembered and applied to whatever loads afterwards.
  let lampsOn = false;
  let lensMaterials: THREE.MeshStandardMaterial[] = [];
  let lampGlow: THREE.Object3D | null = null;

  const applyLamps = () => {
    lensMaterials.forEach((material) => {
      material.emissiveIntensity = lampsOn ? LAMP_LENS_GLOW : 0;
      material.needsUpdate = true;
    });
    if (lampGlow) lampGlow.visible = lampsOn;
  };

  /**
   * Bare stand-in ground, used only if the model cannot be fetched, so the
   * career map is never a blank sky.
   */
  const buildFallbackFloor = () => {
    const geom = new THREE.PlaneGeometry(1240, 1240, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4c9a4f, roughness: 0.92 });
    geometries.push(geom);
    materials.push(mat);

    const floor = new THREE.Mesh(geom, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    root.add(floor);
  };

  /**
   * The light itself: a bright point at each lamp head and a pool of it on the
   * road below. Both are additive sprites rather than real lights - thirty-odd
   * point lights would cost more than the rest of the map put together, and
   * from this camera height the difference does not show.
   */
  const buildLampGlow = (lamps: LampRecord[]) => {
    const texture = makeGlowTexture();
    textures.push(texture);

    const glow = new THREE.Group();
    glow.name = 'career-valley-lamp-glow';
    glow.visible = lampsOn;

    const heads = new THREE.BufferGeometry();
    heads.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        lamps.flatMap((lamp) => [lamp.x, lamp.y, lamp.z]),
        3
      )
    );
    const headMaterial = new THREE.PointsMaterial({
      map: texture,
      color: 0xffd9a0,
      size: 7.5,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    geometries.push(heads);
    materials.push(headMaterial);
    glow.add(new THREE.Points(heads, headMaterial));

    // Pools lie flat on the ground, one instanced quad each.
    const poolGeometry = new THREE.PlaneGeometry(1, 1);
    poolGeometry.rotateX(-Math.PI / 2);
    const poolMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffc98a,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    geometries.push(poolGeometry);
    materials.push(poolMaterial);

    const pools = new THREE.InstancedMesh(poolGeometry, poolMaterial, lamps.length);
    const placement = new THREE.Matrix4();
    lamps.forEach((lamp, index) => {
      placement.makeScale(LAMP_POOL_SIZE, 1, LAMP_POOL_SIZE);
      placement.setPosition(lamp.x, lamp.ground + 0.32, lamp.z);
      pools.setMatrixAt(index, placement);
    });
    pools.instanceMatrix.needsUpdate = true;
    pools.frustumCulled = false;
    glow.add(pools);

    lampGlow = glow;
    root.add(glow);
  };

  const loader = new GLTFLoader();
  loader.load(
    TERRAIN_URL,
    (gltf) => {
      if (disposed) return;

      const lenses = new Set<THREE.MeshStandardMaterial>();

      gltf.scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Tracked so dispose() can release the GPU buffers. Trees share mesh
        // data across many nodes, so the same geometry shows up repeatedly -
        // disposing the same buffer twice is harmless.
        geometries.push(mesh.geometry);
        const material = mesh.material as THREE.Material | THREE.Material[];
        const list = Array.isArray(material) ? material : [material];
        materials.push(...list);

        list.forEach((entry) => {
          const standard = entry as THREE.MeshStandardMaterial;
          if (standard.isMeshStandardMaterial && standard.name === 'ValleyLampLens') {
            lenses.add(standard);
          }
        });
      });

      lensMaterials = [...lenses];
      root.add(gltf.scene);
      applyLamps();
    },
    undefined,
    () => {
      if (disposed) return;
      buildFallbackFloor();
    }
  );

  fetch(LAMP_URL)
    .then((response) => (response.ok ? response.json() : null))
    .then((manifest: LampManifest | null) => {
      if (disposed || !manifest?.lamps?.length) return;
      buildLampGlow(manifest.lamps);
    })
    // No lamps is a dimmer night, not a broken map.
    .catch(() => undefined);

  return {
    group: root,
    setLampsOn: (on: boolean) => {
      if (on === lampsOn) return;
      lampsOn = on;
      applyLamps();
    },
    dispose: () => {
      disposed = true;
      scene.remove(root);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      geometries.length = 0;
      materials.length = 0;
      textures.length = 0;
      lensMaterials = [];
      lampGlow = null;
    }
  };
}
