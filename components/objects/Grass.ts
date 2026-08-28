import * as THREE from 'three';
import { Vehicle } from './Vehicle';

/**
 * Helper utilities for grass‑related physics.
 * Keeps Vehicle.update() tidy while preserving existing public API.
 */
export function updateGrassInstability(vehicle: Vehicle, deltaTime: number): void {
  const onGrass = vehicle.isOnGrass
    ? vehicle.isOnGrass(vehicle.pos.x, vehicle.pos.z, vehicle.pos.y)
    : false;
  if (onGrass) {
    vehicle.grassInstability = THREE.MathUtils.clamp(vehicle.grassInstability + deltaTime * 1.5, 0, 1);
  } else {
    vehicle.grassInstability = THREE.MathUtils.clamp(vehicle.grassInstability - deltaTime * 2.0, 0, 1);
  }
}

/**
 * Uneven ground on grass unsettles the car sideways. This is a genuine
 * acceleration applied to the velocity vector, so the tires resist it through the
 * normal slip-angle path on the following step.
 *
 * The previous version multiplied its acceleration by `deltaTime * 60`, which made
 * the peak roughly 9 m/s² — close to a full g of sideways shove — and described
 * itself as "mild". 0.9 m/s² is the intended order of magnitude for a car crossing
 * a rough verge.
 */
export function applyGrassLateralSlide(vehicle: Vehicle, deltaTime: number): void {
  if (vehicle.grassInstability <= 0 || Math.abs(vehicle.speed) <= 4.2) return;

  // Driven from simulated time, not wall-clock, so the fixed physics step stays
  // reproducible.
  const lateralSlideAccel =
    Math.sin(vehicle.physicsTime * 5.0) * 0.9 * vehicle.grassInstability;

  const cosYaw = Math.cos(vehicle.yaw);
  const sinYaw = Math.sin(vehicle.yaw);

  // Right vector in world space: (cosYaw, 0, -sinYaw)
  vehicle.velocityX += cosYaw * lateralSlideAccel * deltaTime;
  vehicle.velocityZ += -sinYaw * lateralSlideAccel * deltaTime;
}

/**
 * Extra drag from thick grass, applied as a decay along the whole velocity vector.
 *
 * Two things were wrong before: the speed test read only the forward component, so
 * a car sliding sideways across grass at 100 km/h with 20 km/h of forward speed was
 * left completely alone; and the decay hard-floored at 60 km/h, meaning grass could
 * not slow a car below that no matter how long it stayed off-line. Rolling
 * resistance in Vehicle already scales with grassInstability, so this only needs to
 * add the high-speed component.
 */
export function applyGrassSpeedReduction(vehicle: Vehicle, deltaTime: number): void {
  if (vehicle.grassInstability <= 0) return;

  const groundSpeed = Math.hypot(vehicle.velocityX, vehicle.velocityZ);
  const dragOnsetSpeed = 60 / 3.6; // ~16.67 m/s
  if (groundSpeed <= dragOnsetSpeed) return;

  const dampRate = 0.85;
  const decay = Math.exp(-dampRate * vehicle.grassInstability * deltaTime);
  const targetSpeed = Math.max(dragOnsetSpeed, groundSpeed * decay);

  vehicle.scaleVelocity(targetSpeed / groundSpeed);
}

/**
 * Height of one blade in metres. The scatter code needs it to lean blades along a
 * slope, so it lives next to the geometry that defines it.
 */
export const GRASS_BLADE_HEIGHT = 0.55;

/** Blade tints. A single flat green reads as plastic, so instances pick from these. */
export const GRASS_LEAF_COLORS = [
  0x2ecc71, // fresh spring green
  0x27ae60, // rich green
  0xa3e635, // fresh lime green
  0x4ade80, // bright neon light green
  0x10b981, // vibrant emerald
  0x7bb369  // sage, same as the grass ground
];

/** One blade: a single upright triangle, cheap enough to instance in thousands. */
export function createGrassBladeGeometry(): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    -0.07, 0, 0,              // bottom left
    0.07, 0, 0,               // bottom right
    0.0, GRASS_BLADE_HEIGHT, 0 // top tip
  ]);
  geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Wind-animated blade material, shared by the trackside verge and by free-standing
 * grass patches so both bend to the same gust and fade the same way with distance.
 * Both callers hand in the same `uTime` uniform the mode already ticks.
 */
export function createGrassBladeMaterial(
  uniforms: {
    uTime: { value: number };
  },
  /**
   * 0 to 1 growth. Blades come up on a per-blade delay, so a fresh patch sprouts in
   * instead of appearing whole. Omit for grass that is already there.
   */
  grow?: { value: number }
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0.1,
    side: THREE.DoubleSide
  });

  material.customProgramCacheKey = () => 'grass_leaves';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uGrow = grow ?? { value: 1 };

    // Pass height to fragment shader for tip bleaching and ambient occlusion
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uTime;
       uniform float uGrow;
       varying float vHeight;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vHeight = position.y; // 0.0 at base to 0.55 at tip

      // Multi-octave wind + gust model
      float instX = instanceMatrix[3].x;
      float instZ = instanceMatrix[3].z;
      float timeScale = uTime * 2.8;

      // Low-frequency gusts
      float gust = sin(instX * 0.08 + instZ * 0.05 + timeScale * 0.5) * 0.35;
      // High-frequency turbulence
      float turb = sin(instX * 0.4 + instZ * 0.3 + timeScale * 2.2) * 0.12;
      float wind = gust + turb;

      // Quadratic bending factor
      float bend = position.y * position.y * 3.0;

      // Apply displacement to vertices
      transformed.x += wind * bend * 1.5;
      transformed.z += wind * bend * 0.9;

      // Growth. Each blade waits its own fraction of the sprout, so a new patch
      // thickens up over time rather than snapping into existence all at once.
      float sprout = fract(sin(instX * 12.9898 + instZ * 78.233) * 43758.5453);
      float grown = clamp((uGrow - sprout * 0.55) / 0.45, 0.0, 1.0);
      transformed.y *= grown;
      transformed.x *= mix(0.55, 1.0, grown);
      transformed.z *= mix(0.55, 1.0, grown);
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying float vHeight;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       // 1. Tip bleaching (sun-bleached tips)
       float hNormalized = clamp(vHeight / 0.55, 0.0, 1.0);
       vec3 bleachedTip = vec3(0.75, 0.88, 0.32); // Lime gold
       gl_FragColor.rgb = mix(gl_FragColor.rgb, bleachedTip, hNormalized * 0.32);

       // 2. Ambient occlusion at the base (darkening at base)
       float ao = mix(0.42, 1.0, hNormalized);
       gl_FragColor.rgb *= ao;

       // 3. Distance fade to sage green ground color (0x7bb369) to reduce aliasing shimmering
       float distToCam = length(vViewPosition);
       float fadeFactor = smoothstep(110.0, 240.0, distToCam);
       vec3 groundColor = vec3(0.482, 0.702, 0.412); // sage green
       gl_FragColor.rgb = mix(gl_FragColor.rgb, groundColor, fadeFactor * 0.85);`
    );
  };

  return material;
}

/** World radius of a grass patch for a given authored scale. */
export const GRASS_PATCH_RADIUS_PER_SCALE = 4;

export const grassPatchRadius = (scale: number) =>
  Math.max(3, scale * GRASS_PATCH_RADIUS_PER_SCALE);

/** Patch scale that fills a brush of this radius, so painted grass matches the ring. */
export const grassPatchScaleForRadius = (radius: number) =>
  Math.max(0.75, radius / GRASS_PATCH_RADIUS_PER_SCALE);

/** The shape the paint helpers need. Matches EditorScenery without importing it. */
export interface GrassPaintItem {
  type: string;
  x: number;
  z: number;
  scale: number;
}

/**
 * True when a grass patch already covers this spot. Painting is a drag, so without
 * this a single stroke would stack dozens of discs on the same ground.
 */
export function hasGrassPatchNear(
  items: readonly GrassPaintItem[],
  x: number,
  z: number,
  minGap: number
): boolean {
  const gapSq = minGap * minGap;
  for (const item of items) {
    if (item.type !== 'grass_patch') continue;
    const dx = item.x - x;
    const dz = item.z - z;
    if (dx * dx + dz * dz < gapSq) return true;
  }
  return false;
}

/** Drops every grass patch whose centre falls inside the brush. Other props stay. */
export function eraseGrassPatchesWithin<T extends GrassPaintItem>(
  items: readonly T[],
  x: number,
  z: number,
  radius: number
): T[] {
  const radiusSq = radius * radius;
  return items.filter((item) => {
    if (item.type !== 'grass_patch') return true;
    const dx = item.x - x;
    const dz = item.z - z;
    return dx * dx + dz * dz > radiusSq;
  });
}
