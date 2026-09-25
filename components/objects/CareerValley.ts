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
  /** Advances the water (pond ripples, falling streaks). Call once a frame. */
  update: (elapsedSeconds: number) => void;
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
/** License Center glazing: a faint daytime sheen, lit up with the street lamps. */
const WINDOW_MATERIAL = 'LicenseWindow';
const WINDOW_GLOW_DAY = 0.25;
const WINDOW_GLOW_NIGHT = 2.2;

/**
 * Water is authored still in Blender; all of its movement is added here, from
 * one shared clock. The shaders read world position, so no UVs are needed:
 *  - still:   the pond and pool get drifting glints
 *  - falling: the falls get streaks pouring down, each column at its own pace
 *  - foam:    the splash foam churns and bubbles
 *  - ripple:  rings (one object each, origin at the splash) grow and fade
 */
type WaterKind = 'still' | 'falling' | 'foam' | 'ripple';

const WATER_MATERIALS: Record<string, WaterKind> = {
  ValleyWater: 'still',
  ValleyWaterfall: 'falling',
  ValleyFoam: 'foam',
  ValleyRipple: 'ripple'
};

const waterClock = { value: 0 };

const WATER_VERTEX: Record<WaterKind, string[]> = {
  still: [],
  falling: [
    // a slight sway, so the sheet is not a rigid panel
    'transformed.x += sin( uWaterTime * 2.6 + position.y * 0.7 ) * 0.07;'
  ],
  foam: [
    'transformed += objectNormal * ( 0.22 * sin( uWaterTime * 5.0 + position.x * 3.1 + position.y * 2.3 )',
    '                             + 0.12 * sin( uWaterTime * 7.7 + position.z * 5.0 + position.x ) );'
  ],
  ripple: [
    // each ring takes its phase from where it stands, so the rings of one
    // splash are staggered instead of pulsing together
    'float cmPhase = fract( dot( modelMatrix[ 3 ].xz, vec2( 2.7, 1.9 ) ) );',
    'vRippleLife = fract( uWaterTime * 0.35 + cmPhase );',
    'transformed.xz *= 1.0 + vRippleLife * 6.0;'
  ]
};

const WATER_FRAGMENT: Record<WaterKind, string[]> = {
  still: [
    'float cmW1 = sin( vWaterWorld.x * 0.55 + uWaterTime * 1.1 ) * sin( vWaterWorld.z * 0.47 - uWaterTime * 0.8 );',
    'float cmW2 = sin( ( vWaterWorld.x + vWaterWorld.z ) * 0.9 + uWaterTime * 1.7 );',
    'float cmGlint = smoothstep( 0.55, 1.0, cmW1 * 0.6 + cmW2 * 0.4 );',
    'diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.78, 0.92, 1.0 ), cmGlint * 0.35 ) * ( 0.94 + 0.06 * cmW2 );'
  ],
  falling: [
    'float cmCol = floor( ( vWaterWorld.x + vWaterWorld.z ) * 1.1 );',
    'float cmRand = fract( sin( cmCol * 12.9898 ) * 43758.5453 );',
    'float cmS = fract( vWaterWorld.y * 0.16 + uWaterTime * ( 1.2 + cmRand * 0.9 ) + cmRand );',
    'float cmStreak = smoothstep( 0.0, 0.15, cmS ) * smoothstep( 0.55, 0.2, cmS );',
    'diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.97, 0.99, 1.0 ), cmStreak * 0.8 );'
  ],
  foam: [
    'float cmF = 0.5 + 0.5 * sin( uWaterTime * 6.0 + vWaterWorld.x * 2.0 + vWaterWorld.z * 1.7 );',
    'diffuseColor.rgb *= 0.9 + 0.1 * cmF;'
  ],
  ripple: ['diffuseColor.a *= ( 1.0 - vRippleLife ) * 0.75;']
};

const animateWater = (material: THREE.MeshStandardMaterial, kind: WaterKind) => {
  if (kind === 'ripple') {
    material.transparent = true;
    material.depthWrite = false;
  }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterClock;
    const varyings = 'varying vec3 vWaterWorld;\nvarying float vRippleLife;\nuniform float uWaterTime;';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${varyings}`)
      .replace(
        '#include <begin_vertex>',
        ['#include <begin_vertex>', ...WATER_VERTEX[kind],
          'vWaterWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'].join('\n')
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${varyings}`)
      .replace('#include <color_fragment>', ['#include <color_fragment>', '{', ...WATER_FRAGMENT[kind], '}'].join('\n'));
  };
  material.customProgramCacheKey = () => `career-water-${kind}`;
  material.needsUpdate = true;
};

/**
 * Spray rising from each splash: a loop of soft points whose motion lives
 * entirely in the vertex shader, so nothing is updated per frame but the clock.
 */
const buildSpray = (bases: THREE.Vector3[], texture: THREE.Texture) => {
  const PER_SPLASH = 60;
  const positions: number[] = [];
  const seeds: number[] = [];
  bases.forEach((base) => {
    for (let i = 0; i < PER_SPLASH; i++) {
      positions.push(base.x, base.y, base.z);
      seeds.push(Math.random());
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uWaterTime: waterClock, map: { value: texture } },
    transparent: true,
    depthWrite: false,
    vertexShader: [
      'attribute float seed;',
      'uniform float uWaterTime;',
      'varying float vAlpha;',
      'void main() {',
      '  float life = fract( uWaterTime * 0.45 + seed );',
      '  float ang = seed * 6283.1853;',
      '  vec3 drift = vec3( cos( ang ), 0.0, sin( ang ) ) * ( 0.8 + life * 4.5 * fract( seed * 7.3 ) );',
      '  float rise = life * 7.0 * ( 0.6 + 0.4 * fract( seed * 3.1 ) ) - life * life * 3.0;',
      '  vec4 mv = modelViewMatrix * vec4( position + drift + vec3( 0.0, rise, 0.0 ), 1.0 );',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = ( 4.0 + life * 14.0 ) * ( 300.0 / -mv.z );',
      '  vAlpha = ( 1.0 - life ) * 0.5;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D map;',
      'varying float vAlpha;',
      'void main() {',
      '  vec4 t = texture2D( map, gl_PointCoord );',
      '  gl_FragColor = vec4( vec3( 0.95, 0.98, 1.0 ), t.a * vAlpha );',
      '}'
    ].join('\n')
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'career-valley-spray';
  points.frustumCulled = false;
  return points;
};

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

export interface CareerValleyOptions {
  /** Called once the model has loaded and joined the scene. */
  onLoad?: (model: THREE.Object3D) => void;
}

export function buildCareerValley(
  scene: THREE.Scene,
  options: CareerValleyOptions = {}
): CareerValleyHandle {
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
  let windowMaterials: THREE.MeshStandardMaterial[] = [];
  let lampGlow: THREE.Object3D | null = null;

  const applyLamps = () => {
    lensMaterials.forEach((material) => {
      material.emissiveIntensity = lampsOn ? LAMP_LENS_GLOW : 0;
      material.needsUpdate = true;
    });
    windowMaterials.forEach((material) => {
      material.emissiveIntensity = lampsOn ? WINDOW_GLOW_NIGHT : WINDOW_GLOW_DAY;
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
      const windows = new Set<THREE.MeshStandardMaterial>();
      const water = new Map<THREE.MeshStandardMaterial, WaterKind>();

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
          if (standard.isMeshStandardMaterial && standard.name === WINDOW_MATERIAL) {
            windows.add(standard);
          }
          if (standard.isMeshStandardMaterial && WATER_MATERIALS[standard.name]) {
            water.set(standard, WATER_MATERIALS[standard.name]);
          }
        });
      });

      lensMaterials = [...lenses];
      windowMaterials = [...windows];
      water.forEach((kind, material) => animateWater(material, kind));
      root.add(gltf.scene);

      // Spray rises from every splash; each foam object's origin is its splash.
      root.updateMatrixWorld(true);
      const splashes: THREE.Vector3[] = [];
      gltf.scene.traverse((child) => {
        if (child.name.startsWith('water_foam_')) {
          splashes.push(root.worldToLocal(child.getWorldPosition(new THREE.Vector3())));
        }
      });
      if (splashes.length) {
        const sprayTexture = makeGlowTexture();
        const spray = buildSpray(splashes, sprayTexture);
        textures.push(sprayTexture);
        geometries.push(spray.geometry);
        materials.push(spray.material as THREE.Material);
        root.add(spray);
      }
      applyLamps();
      options.onLoad?.(gltf.scene);
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
    update: (elapsedSeconds: number) => {
      waterClock.value = elapsedSeconds;
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
      windowMaterials = [];
      lampGlow = null;
    }
  };
}
