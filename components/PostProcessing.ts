import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderEffects } from './ShaderEffects';

// Custom Shader combining Vignette, Chromatic Aberration, and Checkpoint Flash
const CustomEffectsShader = {
  name: 'CustomEffectsShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2() },
    uSpeed: { value: 0.0 },         // Kept to avoid breaking outer game loop uniform updates
    uDrift: { value: 0.0 },         // Normalized 0.0 to 1.0 drift intensity
    uFlash: { value: 0.0 },         // Checkpoint flash intensity 0.0 to 1.0
    uBoost: { value: 0.0 },         // Kept to avoid breaking outer game loop uniform updates
    uTime: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uSpeed;
    uniform float uDrift;
    uniform float uFlash;
    uniform float uBoost;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 center = vec2(0.5);
      vec2 dir = uv - center;
      float dist = length(dir);

      // 1. Chromatic Aberration (Drift-based RGB shift, heavier at screen edges, no speed-based stretching)
      float maxChroma = 0.008 * uDrift;
      float chromaShift = dist * maxChroma;
      
      vec4 color = vec4(0.0);
      if (chromaShift > 0.0) {
        color.r = texture2D(tDiffuse, uv - dir * chromaShift).r;
        color.g = texture2D(tDiffuse, uv).g;
        color.b = texture2D(tDiffuse, uv + dir * chromaShift).b;
        color.a = texture2D(tDiffuse, uv).a;
      } else {
        color = texture2D(tDiffuse, uv);
      }

      // 2. Realistic Vignette (Turns slightly orange-red when drifting)
      float vignette = smoothstep(0.8, 0.35, dist);
      vec3 vignetteColor = mix(vec3(0.0), vec3(0.9, 0.15, 0.0), uDrift * 0.4);
      color.rgb = mix(vignetteColor, color.rgb, mix(0.4, 1.0, vignette));

      // 3. Checkpoint Fullscreen Flash
      if (uFlash > 0.01) {
        float flashFactor = uFlash * (1.0 - dist * 0.6);
        color.rgb = mix(color.rgb, vec3(1.0, 1.0, 1.0), flashFactor);
      }

      gl_FragColor = color;
    }
  `
};

export interface GraphicsFeatures {
  shadows: boolean;
  bloom: boolean;
  vignette: boolean;
  fxaa: boolean;
}

// Preset definitions mapping tier names to feature flags
export const QUALITY_PRESETS: Record<'low' | 'medium' | 'high', GraphicsFeatures> = {
  low:    { shadows: false, bloom: false, vignette: false, fxaa: false },
  medium: { shadows: true,  bloom: true,  vignette: false, fxaa: false },
  high:   { shadows: true,  bloom: true,  vignette: true,  fxaa: true  },
};

export class PostProcessing {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  
  public composer!: EffectComposer;
  private renderPass!: RenderPass;
  private bloomPass?: UnrealBloomPass;
  private fxaaPass?: FXAAPass;
  private effectsPass?: ShaderPass;
  private outputPass!: OutputPass;

  // Keep quality for backward compat / bloom strength scaling
  private quality: 'low' | 'medium' | 'high' = 'high';
  private bloomIntensity: number = 1.1;
  private width: number;
  private height: number;

  // Individual feature flags
  public features: GraphicsFeatures = { shadows: true, bloom: true, vignette: true, fxaa: true };

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.width = renderer.domElement.clientWidth || window.innerWidth;
    this.height = renderer.domElement.clientHeight || window.innerHeight;

    // Load settings from localStorage if available
    if (typeof window !== 'undefined') {
      const savedQuality = localStorage.getItem('cyberdrive_graphics_quality');
      if (savedQuality === 'low' || savedQuality === 'medium' || savedQuality === 'high') {
        this.quality = savedQuality;
      }
      const savedBloom = localStorage.getItem('cyberdrive_bloom_intensity');
      if (savedBloom !== null) {
        this.bloomIntensity = parseFloat(savedBloom);
      }
      // Load individual feature flags (override preset if saved)
      const savedFeatures = localStorage.getItem('cyberdrive_graphics_features');
      if (savedFeatures) {
        try {
          const parsed = JSON.parse(savedFeatures);
          this.features = { ...this.features, ...parsed };
        } catch { /* use defaults */ }
      } else {
        // Initialize from quality preset
        this.features = { ...QUALITY_PRESETS[this.quality] };
      }
    }

    this.applyShadowSettings();
    this.initComposer();
  }

  private initComposer() {
    const needsComposer = this.features.bloom || this.features.vignette || this.features.fxaa;

    if (!needsComposer) {
      // No post-processing needed, render directly
      return;
    }

    // Create the composer and its main render targets
    const renderTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType // Enable HDR
    });

    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.setSize(this.width, this.height);

    // 1. Render Pass
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // 2. Bloom Pass (if enabled)
    if (this.features.bloom) {
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(this.width, this.height),
        this.bloomIntensity,  // Strength
        0.5,  // Radius
        0.18  // Threshold
      );
      this.composer.addPass(this.bloomPass);
    }

    // 3. Custom Effects Pass - vignette + chromatic aberration (if enabled)
    if (this.features.vignette) {
      this.effectsPass = new ShaderPass(CustomEffectsShader);
      this.effectsPass.uniforms.uResolution.value.set(this.width, this.height);
      this.composer.addPass(this.effectsPass);
    }

    // 4. FXAA Pass (if enabled)
    if (this.features.fxaa) {
      this.fxaaPass = new FXAAPass();
      this.fxaaPass.setSize(this.width, this.height);
      this.composer.addPass(this.fxaaPass);
    }

    // 5. Output Pass (Tone mapping & Color space conversion)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  private applyShadowSettings() {
    if (this.features.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.scene.traverse((child) => {
        if (child instanceof THREE.DirectionalLight || child instanceof THREE.SpotLight) {
          child.castShadow = true;
        }
      });
    } else {
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((child) => {
        if (child instanceof THREE.DirectionalLight || child instanceof THREE.SpotLight) {
          child.castShadow = false;
        }
      });
    }
  }

  /**
   * Set quality via preset tier (backward compat). Maps to feature flags.
   */
  public setQuality(quality: 'low' | 'medium' | 'high') {
    this.quality = quality;
    if (typeof window !== 'undefined') {
      localStorage.setItem('cyberdrive_graphics_quality', quality);
    }
    const preset = QUALITY_PRESETS[quality];
    this.setFeatures(preset);
  }

  /**
   * Set individual graphics features. Only reconstructs composer if post-processing flags change.
   */
  public setFeatures(features: Partial<GraphicsFeatures>) {
    const prev = { ...this.features };
    this.features = { ...this.features, ...features };

    // Persist
    if (typeof window !== 'undefined') {
      localStorage.setItem('cyberdrive_graphics_features', JSON.stringify(this.features));
    }

    // Handle shadows separately (no recompose needed)
    if (features.shadows !== undefined && features.shadows !== prev.shadows) {
      this.applyShadowSettings();
    }

    // Check if any post-processing flag changed
    const ppChanged =
      prev.bloom !== this.features.bloom ||
      prev.vignette !== this.features.vignette ||
      prev.fxaa !== this.features.fxaa;

    if (ppChanged) {
      this.disposeComposer();
      this.initComposer();
    }
  }

  public getQuality(): 'low' | 'medium' | 'high' {
    return this.quality;
  }

  public getFeatures(): GraphicsFeatures {
    return { ...this.features };
  }

  public setBloomIntensity(intensity: number) {
    this.bloomIntensity = intensity;
    if (typeof window !== 'undefined') {
      localStorage.setItem('cyberdrive_bloom_intensity', intensity.toString());
    }
    if (this.bloomPass) {
      this.bloomPass.strength = intensity;
    }
  }

  public getBloomIntensity(): number {
    return this.bloomIntensity;
  }

  public setSize(width: number, height: number) {
    this.width = width;
    this.height = height;

    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.fxaaPass) {
      this.fxaaPass.setSize(width, height);
    }
    if (this.effectsPass) {
      this.effectsPass.uniforms.uResolution.value.set(width, height);
    }
  }

  public update(deltaTime: number, speed: number, isDrifting: boolean, driftPoints: number, isBoosting: boolean, checkpointFlash: number, timeOfDayVal: number = 1.0) {
    // Skip if no composer (all post-processing off)
    if (!this.composer) return;

    // Dynamically adjust bloom parameters based on time of day (daylight vs night)
    if (this.bloomPass) {
      const baseThreshold = 0.18;
      
      // Interpolate threshold: higher in afternoon (0.85) to prevent sky/ground glow, lower at night
      this.bloomPass.threshold = THREE.MathUtils.lerp(0.85, baseThreshold, timeOfDayVal);
      
      // Interpolate strength: softer in afternoon (50% strength) to prevent blinding, full at night
      const strengthFactor = THREE.MathUtils.lerp(0.5, 1.0, timeOfDayVal);
      this.bloomPass.strength = this.bloomIntensity * strengthFactor;
    }

    if (!this.effectsPass) return;

    const uniforms = this.effectsPass.uniforms;
    
    // Increment time
    uniforms.uTime.value += deltaTime;

    // 1. Normalized speed
    const normalizedSpeed = Math.min(speed / 280, 1.0);
    uniforms.uSpeed.value = THREE.MathUtils.lerp(uniforms.uSpeed.value, normalizedSpeed, 0.1);

    // 2. Drift intensity
    const targetDrift = isDrifting ? Math.min(driftPoints / 1200 + 0.3, 1.0) : 0.0;
    uniforms.uDrift.value = THREE.MathUtils.lerp(uniforms.uDrift.value, targetDrift, 0.08);

    // 3. Boost intensity
    const targetBoost = isBoosting ? 1.0 : 0.0;
    uniforms.uBoost.value = THREE.MathUtils.lerp(uniforms.uBoost.value, targetBoost, 0.15);

    // 4. Checkpoint Flash
    uniforms.uFlash.value = checkpointFlash;
  }

  public render(deltaTime: number) {
    if (!this.composer) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render(deltaTime);
    }
  }

  private disposeComposer() {
    if (this.composer) {
      // Disposing passes
      this.composer.passes.forEach((pass: any) => {
        if (pass.dispose) pass.dispose();
      });
      this.composer = null as any;
    }
    this.bloomPass = undefined;
    this.fxaaPass = undefined;
    this.effectsPass = undefined;
  }

  public destroy() {
    this.disposeComposer();
  }
}
