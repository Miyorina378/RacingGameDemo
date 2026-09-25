import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { DEFAULT_MAP_GRAPHICS, MapGraphicsSettings } from '../option';
import type { DayNightSample } from './dayNight';

/* ============================================================================
   CAREER MAP GRAPHICS
   ----------------------------------------------------------------------------
   The render pipeline for the 3D career map: shadows, the light balance,
   material grading, terrain shading and post-processing (GTAO + bloom).

   Every part follows MapGraphicsSettings (components/option.ts) and can be
   switched on or off while the map is open - setSettings() rebuilds only what
   changed. With everything off the map renders exactly as it used to.

   CareerMap.tsx owns the scene, camera and lights; this class only tunes them.
   ========================================================================== */

export interface MapLightRig {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
  bounce: THREE.DirectionalLight;
}

/** Shadow box round the valley. Tight enough that 2048 texels stay sharp. */
const SHADOW_HALF_EXTENT = 270;
const SHADOW_MAP_SIZE = 2048;

/** Enhanced rig. The day/night sample is the base; these reshape it. */
const AMBIENT_DAY_INTENSITY = 0.34;        // held within 0.3 - 0.5 through the day
const HEMI_SKY_TINT = new THREE.Color(0x9fcaf0);    // soft sky blue
const HEMI_GROUND_TINT = new THREE.Color(0x6f5f45); // muted warm dirt / dry grass
const BOUNCE_TINT = new THREE.Color(0x9b8a62);
const AMBIENT_WARM_WHITE = new THREE.Color(0xfff2e0);
/** The day/night table peaks at 0.94-0.95; normalise so daylight sits on 1.0. */
const EXPOSURE_REFERENCE = 0.94;

/** Fog density scale through the composer - see applySky(). */
const COMPOSER_FOG_SCALE = 0.6;

/** Materials darker than this (linear luminance) are lifted toward grey. */
const MIN_ALBEDO_LUMINANCE = 0.06;
const ALBEDO_LIFT_TARGET = new THREE.Color(0x5a5f69);
const MAX_METALNESS = 0.12;

/** Terrain grade when enhanced: pull the mint green back toward natural grass. */
const TERRAIN_DESATURATE = 0.1;
const TERRAIN_GAIN = 0.93;

const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

// three.js' ACES filmic curve (tonemapping_pars_fragment), as row-major matrices.
const ACES_INPUT = new THREE.Matrix3().set(
  0.59719, 0.35458, 0.04823,
  0.07600, 0.90834, 0.01566,
  0.02840, 0.13383, 0.83777
);
const ACES_OUTPUT = new THREE.Matrix3().set(
  1.60475, -0.53108, -0.07367,
  -0.10208, 1.10813, -0.00605,
  -0.00327, -0.07276, 1.07602
);
const ACES_INPUT_INVERSE = ACES_INPUT.clone().invert();
const ACES_OUTPUT_INVERSE = ACES_OUTPUT.clone().invert();

/** Inverse of RRTAndODTFit for one channel: the positive root of its quadratic. */
const inverseRrt = (y: number) => {
  const t = Math.min(Math.max(y, 0), 0.99 / 0.983729);
  const a = 1 - 0.983729 * t;
  const b = 0.0245786 - 0.432951 * t;
  const c = -0.000090537 - 0.238081 * t;
  return (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
};

/**
 * The linear colour that ACES (at this exposure) maps onto `target`.
 *
 * Rendering straight to the canvas, three.js tone-maps each material but
 * leaves the clear colour alone and adds fog after tone mapping. Through the
 * composer the whole frame is tone-mapped at the end - sky and fog included -
 * which washes them out into a milky haze. Feeding the composer these
 * pre-compensated colours makes both paths look the same.
 */
const inverseAces = (target: THREE.Color, exposure: number, out = new THREE.Color()) => {
  const v = new THREE.Vector3(target.r, target.g, target.b).applyMatrix3(ACES_OUTPUT_INVERSE);
  v.set(inverseRrt(v.x), inverseRrt(v.y), inverseRrt(v.z)).applyMatrix3(ACES_INPUT_INVERSE);
  v.multiplyScalar(0.6 / Math.max(exposure, 1e-3));
  return out.setRGB(Math.max(0, v.x), Math.max(0, v.y), Math.max(0, v.z));
};

interface MaterialOriginal {
  color: THREE.Color;
  metalness: number;
  roughness: number;
}

/**
 * GTAO that also ignores additive, depth-less sprites (the lamp light pools),
 * and works at CSS-pixel resolution so a 2x display does not pay 4x for it.
 */
class MapGTAOPass extends GTAOPass {
  private resolutionScale?: number;

  setResolutionScale(scale: number) {
    this.resolutionScale = scale;
  }

  setSize(width: number, height: number) {
    const scale = this.resolutionScale ?? 1;
    super.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  }

  _overrideVisibility() {
    const cache = (this as unknown as { _visibilityCache: THREE.Object3D[] })._visibilityCache;
    this.scene.traverse((object) => {
      if (!object.visible) return;
      const material = (object as THREE.Mesh).material as THREE.Material | undefined;
      const glowSprite = !!material && !Array.isArray(material) && material.transparent && !material.depthWrite;
      const points = (object as THREE.Points).isPoints || (object as THREE.Line).isLine;
      if (points || glowSprite) {
        object.visible = false;
        cache.push(object);
      }
    });
  }
}

export class CareerMapGraphics {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rig: MapLightRig;
  private settings: MapGraphicsSettings;

  private ambient = new THREE.AmbientLight(0xffffff, 0);
  private legacyBounceColor: THREE.Color;
  private lastSample: DayNightSample | null = null;

  private composer: EffectComposer | null = null;
  private width = 1;
  private height = 1;

  private terrainMaterial: THREE.MeshStandardMaterial | null = null;
  private terrainUniforms = {
    uCmDesat: { value: 0 },
    uCmGain: { value: 1 },
    uCmDetail: { value: 0 },
  };
  private materialOriginals = new Map<THREE.MeshStandardMaterial, MaterialOriginal>();

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    rig: MapLightRig,
    settings: MapGraphicsSettings = DEFAULT_MAP_GRAPHICS
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.rig = rig;
    this.settings = { ...settings };
    this.legacyBounceColor = rig.bounce.color.clone();

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // PCFSoftShadowMap is deprecated in r18x; PCF with a shadow radius now
    // gives the soft (Vogel-disk filtered) edge instead.
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const shadow = rig.sun.shadow;
    shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    shadow.camera.near = 20;
    shadow.camera.far = 1000;
    shadow.camera.left = -SHADOW_HALF_EXTENT;
    shadow.camera.right = SHADOW_HALF_EXTENT;
    shadow.camera.top = SHADOW_HALF_EXTENT;
    shadow.camera.bottom = -SHADOW_HALF_EXTENT;
    shadow.camera.updateProjectionMatrix();
    shadow.bias = -0.0004;
    shadow.normalBias = 0.35;
    shadow.radius = 3.5;

    scene.add(this.ambient);

    const size = renderer.getSize(new THREE.Vector2());
    this.width = Math.max(1, size.x);
    this.height = Math.max(1, size.y);

    this.applyShadows();
    this.rebuildComposer();
  }

  // -------------------------------------------------------------------------
  // settings
  // -------------------------------------------------------------------------

  setSettings(next: MapGraphicsSettings) {
    const previous = this.settings;
    this.settings = { ...next };

    if (previous.shadows !== next.shadows) this.applyShadows();
    if (previous.ambientOcclusion !== next.ambientOcclusion || previous.bloom !== next.bloom) {
      this.rebuildComposer();
      this.refreshSky();
    }
    if (previous.enhancedLighting !== next.enhancedLighting) {
      this.applyMaterials();
      if (this.lastSample) this.applyDayNight(this.lastSample);
    }
    if (previous.terrainDetail !== next.terrainDetail || previous.flatShading !== next.flatShading) {
      this.applyTerrainShading();
    }
  }

  // -------------------------------------------------------------------------
  // model
  // -------------------------------------------------------------------------

  /** Call once the valley GLB has arrived: sorts shadow roles and grabs materials. */
  prepareModel(root: THREE.Object3D) {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Multi-material nodes arrive as a group of meshes, so check the parent.
      const isRoad = mesh.name.startsWith('road_') || !!mesh.parent?.name.startsWith('road_')
        // Water sheets (pond, pool, falls) lie flat or hang thin: a cast
        // shadow from them would be a hard dark patch where none belongs.
        || mesh.name.startsWith('water_') || !!mesh.parent?.name.startsWith('water_');

      // Ground-hugging surfaces only receive; anything standing up casts too.
      if (isRoad) {
        mesh.castShadow = false;
        mesh.receiveShadow = true;
      } else {
        // terrain and cliff_rock cast as well, so the butte and the ridge
        // throw their shadows across the valley floor.
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }

      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      list.forEach((material) => {
        const standard = material as THREE.MeshStandardMaterial;
        if (!standard.isMeshStandardMaterial) return;
        if (standard.name === 'ValleyTerrain') {
          this.hookTerrainMaterial(standard);
          return;
        }
        if (!this.materialOriginals.has(standard)) {
          this.materialOriginals.set(standard, {
            color: standard.color.clone(),
            metalness: standard.metalness,
            roughness: standard.roughness,
          });
        }
      });
    });

    this.applyMaterials();
    this.applyTerrainShading();
    this.refreshMaterials();
  }

  /**
   * Terrain and cliff rock share one vertex-coloured material. Its shader
   * gains a grade (desaturate + gain), slope shading and height contours,
   * all driven by uniforms so the toggles never recompile it.
   */
  private hookTerrainMaterial(material: THREE.MeshStandardMaterial) {
    if (this.terrainMaterial === material) return;
    this.terrainMaterial = material;
    const uniforms = this.terrainUniforms;

    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vCmWorld;\nvarying vec3 vCmNormal;'
        )
        .replace(
          '#include <begin_vertex>',
          [
            '#include <begin_vertex>',
            'vCmWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
            'vCmNormal = normalize( mat3( modelMatrix ) * objectNormal );',
          ].join('\n')
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          [
            '#include <common>',
            'varying vec3 vCmWorld;',
            'varying vec3 vCmNormal;',
            'uniform float uCmDesat;',
            'uniform float uCmGain;',
            'uniform float uCmDetail;',
          ].join('\n')
        )
        .replace(
          '#include <color_fragment>',
          [
            '#include <color_fragment>',
            '{',
            '  float cmLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );',
            '  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( cmLum ), uCmDesat ) * uCmGain;',
            // Slopes a touch darker, so the form of the ground reads.
            '  float cmSlope = 1.0 - clamp( normalize( vCmNormal ).y, 0.0, 1.0 );',
            '  diffuseColor.rgb *= mix( 1.0, 0.84, smoothstep( 0.2, 0.75, cmSlope ) * uCmDetail );',
            // Height contours every 4 m. They fade out where they would crowd
            // together (cliffs, far away) and on the flat valley floor.
            '  float cmC = vCmWorld.y / 4.0;',
            '  float cmW = max( fwidth( cmC ), 1e-4 );',
            '  float cmLine = 1.0 - smoothstep( 0.0, cmW * 1.4, abs( fract( cmC + 0.5 ) - 0.5 ) );',
            '  float cmFade = smoothstep( 2.5, 7.0, vCmWorld.y ) * ( 1.0 - smoothstep( 0.25, 0.5, cmW ) );',
            '  diffuseColor.rgb *= 1.0 - cmLine * cmFade * 0.16 * uCmDetail;',
            '}',
          ].join('\n')
        );
    };
    material.customProgramCacheKey = () => 'career-map-terrain';
    material.needsUpdate = true;
  }

  private applyTerrainShading() {
    this.terrainUniforms.uCmDetail.value = this.settings.terrainDetail ? 1 : 0;
    const material = this.terrainMaterial;
    if (material && material.flatShading !== this.settings.flatShading) {
      material.flatShading = this.settings.flatShading;
      material.needsUpdate = true;
    }
  }

  /** Lifts pitch-black albedo and tames bare metal, or puts the originals back. */
  private applyMaterials() {
    const enhanced = this.settings.enhancedLighting;

    this.terrainUniforms.uCmDesat.value = enhanced ? TERRAIN_DESATURATE : 0;
    this.terrainUniforms.uCmGain.value = enhanced ? TERRAIN_GAIN : 1;

    this.materialOriginals.forEach((original, material) => {
      // Emissive trim (arena theme colours, lamp lenses) keeps its colour:
      // that is what the bloom picks up.
      const emissive = material.emissive && luminance(material.emissive) > 0.001;
      if (!enhanced || emissive) {
        material.color.copy(original.color);
        material.metalness = original.metalness;
        material.roughness = original.roughness;
        return;
      }

      const lum = luminance(original.color);
      const color = original.color.clone();
      if (lum < MIN_ALBEDO_LUMINANCE) {
        const targetLum = luminance(ALBEDO_LIFT_TARGET);
        const t = (MIN_ALBEDO_LUMINANCE - lum) / Math.max(1e-4, targetLum - lum);
        color.lerp(ALBEDO_LIFT_TARGET, Math.min(1, t));
      }
      material.color.copy(color);
      // With no environment map a metal has nothing to reflect but black.
      material.metalness = Math.min(original.metalness, MAX_METALNESS);
      material.roughness = Math.max(original.roughness, 0.5);
    });
  }

  private applyShadows() {
    const on = this.settings.shadows;
    this.renderer.shadowMap.enabled = on;
    this.rig.sun.castShadow = on;
    this.rig.sun.shadow.needsUpdate = true;
    this.refreshMaterials();
  }

  /** Shadow and shading switches change shader defines: recompile. */
  private refreshMaterials() {
    const seen = new Set<THREE.Material>();
    this.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      list.forEach((material) => {
        if (seen.has(material)) return;
        seen.add(material);
        material.needsUpdate = true;
      });
    });
  }

  // -------------------------------------------------------------------------
  // lighting
  // -------------------------------------------------------------------------

  /** Applies one day/night reading to sky, fog and the rig, reshaped when enhanced. */
  applyDayNight(sample: DayNightSample) {
    this.lastSample = sample;
    this.applyLights(sample);
    this.applySky(sample);
  }

  private applySky(sample: DayNightSample) {
    const exposure = this.renderer.toneMappingExposure;
    const throughComposer = !!this.composer;

    if (this.scene.background instanceof THREE.Color) {
      if (throughComposer) inverseAces(sample.sky, exposure, this.scene.background);
      else this.scene.background.copy(sample.sky);
    }
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      // Direct rendering blends fog in display (sRGB) space; the composer
      // blends it in linear light, where the same amount reads far heavier -
      // and bluer - over dark ground. So through the composer the fog keeps
      // its plain colour (a tone-map-compensated one tints the whole valley
      // teal) and is thinned to match.
      fog.color.copy(sample.fog);
      fog.density = sample.fogDensity * (throughComposer ? COMPOSER_FOG_SCALE : 1);
    }
  }

  private applyLights(sample: DayNightSample) {
    const { sun, hemi, fill, bounce } = this.rig;
    sun.color.copy(sample.sunColor);

    if (!this.settings.enhancedLighting) {
      sun.intensity = sample.sunIntensity;
      hemi.color.copy(sample.hemiSky);
      hemi.groundColor.copy(sample.hemiGround);
      hemi.intensity = sample.hemiIntensity;
      fill.intensity = sample.fillIntensity;
      bounce.color.copy(this.legacyBounceColor);
      bounce.intensity = sample.bounceIntensity;
      this.ambient.intensity = 0;
      this.renderer.toneMappingExposure = sample.exposure;
      return;
    }

    // How bright the sky is right now, 1 at the daytime reference.
    const daylight = sample.hemiIntensity / 0.62;

    sun.intensity = sample.sunIntensity * 1.08;

    // Ambient: tinted by the sky rather than pure white, 0.3-0.5 in daylight.
    this.ambient.color.copy(sample.hemiSky).lerp(AMBIENT_WARM_WHITE, 0.8);
    this.ambient.intensity = THREE.MathUtils.clamp(AMBIENT_DAY_INTENSITY * daylight, 0.08, 0.5);

    // Hemisphere: soft sky blue over warm dirt, so undersides are never black
    // and never green-tinted either.
    hemi.color.copy(sample.hemiSky).lerp(HEMI_SKY_TINT, 0.15).lerp(AMBIENT_WARM_WHITE, 0.25);
    hemi.groundColor.copy(HEMI_GROUND_TINT).lerp(sample.hemiGround, 0.35);
    hemi.intensity = sample.hemiIntensity * 0.5;

    fill.intensity = sample.fillIntensity * 0.75;
    bounce.color.copy(BOUNCE_TINT);
    bounce.intensity = sample.bounceIntensity * 0.45;

    this.renderer.toneMappingExposure = sample.exposure / EXPOSURE_REFERENCE;
  }

  // -------------------------------------------------------------------------
  // post-processing
  // -------------------------------------------------------------------------

  private disposeComposer() {
    if (!this.composer) return;
    this.composer.passes.forEach((pass) => pass.dispose());
    this.composer.dispose();
    this.composer = null;
  }

  private rebuildComposer() {
    this.disposeComposer();

    const { ambientOcclusion, bloom } = this.settings;
    if (!ambientOcclusion && !bloom) return;

    const pixelRatio = this.renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(this.width * pixelRatio, this.height * pixelRatio, {
      type: THREE.HalfFloatType,
      samples: 4, // the canvas' own antialias does not reach render targets
    });
    const composer = new EffectComposer(this.renderer, target);
    composer.setPixelRatio(pixelRatio);

    composer.addPass(new RenderPass(this.scene, this.camera));

    if (ambientOcclusion) {
      const gtao = new MapGTAOPass(this.scene, this.camera, this.width, this.height);
      gtao.setResolutionScale(1 / pixelRatio);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.9;
      gtao.updateGtaoMaterial({
        radius: 5.0,           // metres: arena bases, cliff feet, tree roots
        distanceExponent: 1.4,
        thickness: 2.5,
        scale: 1.15,
        samples: 16,
        distanceFallOff: 1.0,
        screenSpaceRadius: false,
      });
      gtao.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 2,
        normalPhi: 3,
        radius: 6,
        radiusExponent: 1,
        rings: 2,
        samples: 16,
      });
      composer.addPass(gtao);
    }

    if (bloom) {
      // High threshold, low radius: only the neon arena trim, road paint in
      // full sun and lit lamps glow - never the whole sky.
      composer.addPass(
        new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.32, 0.25, 0.85)
      );
    }

    // Tone mapping (ACES, from the renderer) and sRGB output.
    composer.addPass(new OutputPass());
    composer.setSize(this.width, this.height);
    this.composer = composer;
  }

  /** Sky and fog colours depend on which path renders the frame. */
  private refreshSky() {
    if (this.lastSample) this.applySky(this.lastSample);
  }

  setSize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.composer?.setSize(this.width, this.height);
  }

  render() {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    this.disposeComposer();
    this.scene.remove(this.ambient);
    this.ambient.dispose();
    this.materialOriginals.clear();
    this.terrainMaterial = null;
  }
}
