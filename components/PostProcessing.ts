import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

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

const TAA_JITTER_SEQUENCE: [number, number][] = [
  [0.0, -0.1666667],
  [-0.25, 0.1666667],
  [0.25, -0.3888889],
  [-0.375, -0.0555556],
  [0.125, 0.2777778],
  [-0.125, -0.2777778],
  [0.375, 0.0555556],
  [-0.4375, 0.3888889],
];

const MotionBlurShader = {
  name: 'SpeedMotionBlurShader',
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.0 },
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
    uniform float uStrength;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5);
      vec2 dir = vUv - center;
      float edge = smoothstep(0.10, 0.78, length(dir));
      vec2 velocity = dir * uStrength * edge;

      vec4 color = texture2D(tDiffuse, vUv) * 0.28;
      color += texture2D(tDiffuse, clamp(vUv - velocity * 0.35, 0.0, 1.0)) * 0.18;
      color += texture2D(tDiffuse, clamp(vUv - velocity * 0.70, 0.0, 1.0)) * 0.16;
      color += texture2D(tDiffuse, clamp(vUv - velocity * 1.05, 0.0, 1.0)) * 0.14;
      color += texture2D(tDiffuse, clamp(vUv - velocity * 1.40, 0.0, 1.0)) * 0.12;
      color += texture2D(tDiffuse, clamp(vUv - velocity * 1.75, 0.0, 1.0)) * 0.08;
      color += texture2D(tDiffuse, clamp(vUv - velocity * 2.10, 0.0, 1.0)) * 0.04;

      gl_FragColor = color;
    }
  `
};

class TemporalAAPass extends Pass {
  private historyTarget: THREE.WebGLRenderTarget;
  private blendMaterial: THREE.ShaderMaterial;
  private copyMaterial: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;
  private texelSize = new THREE.Vector2(1, 1);
  private historyReady = false;

  constructor(width: number, height: number) {
    super();
    this.needsSwap = true;

    this.historyTarget = this.createRenderTarget(width, height);
    this.blendMaterial = new THREE.ShaderMaterial({
      name: 'TemporalAABlendShader',
      uniforms: {
        tDiffuse: { value: null },
        tHistory: { value: this.historyTarget.texture },
        uFeedback: { value: 0.88 },
        uTexelSize: { value: this.texelSize },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tHistory;
        uniform float uFeedback;
        uniform vec2 uTexelSize;
        varying vec2 vUv;

        void main() {
          vec4 current = texture2D(tDiffuse, vUv);
          vec4 history = texture2D(tHistory, vUv);

          vec4 minColor = current;
          vec4 maxColor = current;
          for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
              vec4 sampleColor = texture2D(tDiffuse, vUv + vec2(float(x), float(y)) * uTexelSize);
              minColor = min(minColor, sampleColor);
              maxColor = max(maxColor, sampleColor);
            }
          }

          history = clamp(history, minColor - 0.025, maxColor + 0.025);
          gl_FragColor = mix(current, history, uFeedback);
        }
      `,
    });

    this.copyMaterial = new THREE.ShaderMaterial({
      name: 'TemporalAACopyShader',
      uniforms: {
        tDiffuse: { value: null },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `,
    });

    this.fsQuad = new FullScreenQuad(this.blendMaterial);
    this.setSize(width, height);
  }

  private createRenderTarget(width: number, height: number) {
    return new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  public reset() {
    this.historyReady = false;
  }

  public setSize(width: number, height: number) {
    this.historyTarget.setSize(width, height);
    this.texelSize.set(1 / Math.max(width, 1), 1 / Math.max(height, 1));
    this.reset();
  }

  public render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.blendMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.blendMaterial.uniforms.tHistory.value = this.historyTarget.texture;
    this.blendMaterial.uniforms.uFeedback.value = this.historyReady ? 0.88 : 0.0;

    this.fsQuad.material = this.blendMaterial;
    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    this.fsQuad.render(renderer);

    this.copyMaterial.uniforms.tDiffuse.value = writeBuffer.texture;
    this.fsQuad.material = this.copyMaterial;
    renderer.setRenderTarget(this.historyTarget);
    this.fsQuad.render(renderer);

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    }

    this.historyReady = true;
  }

  public dispose() {
    this.historyTarget.dispose();
    this.blendMaterial.dispose();
    this.copyMaterial.dispose();
    this.fsQuad.dispose();
  }
}

export interface GraphicsFeatures {
  shadows: boolean;
  bloom: boolean;
  vignette: boolean;
  fxaa: boolean;
  taa: boolean;
  motionBlur: boolean;
}

const normalizeGraphicsFeatures = (features: GraphicsFeatures): GraphicsFeatures => {
  if (features.taa && features.fxaa) {
    return { ...features, fxaa: false };
  }
  return features;
};

// Preset definitions mapping tier names to feature flags
export const QUALITY_PRESETS: Record<'low' | 'medium' | 'high', GraphicsFeatures> = {
  low:    { shadows: false, bloom: false, vignette: false, fxaa: false, taa: false, motionBlur: false },
  medium: { shadows: true,  bloom: true,  vignette: false, fxaa: false, taa: false, motionBlur: false },
  high:   { shadows: true,  bloom: true,  vignette: true,  fxaa: false, taa: true,  motionBlur: false },
};

export class PostProcessing {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  
  public composer?: EffectComposer;
  private renderPass!: RenderPass;
  private bloomPass?: UnrealBloomPass;
  private taaPass?: TemporalAAPass;
  private motionBlurPass?: ShaderPass;
  private fxaaPass?: FXAAPass;
  private effectsPass?: ShaderPass;
  private outputPass!: OutputPass;
  private jitterIndex = 0;

  // Keep quality for backward compat / bloom strength scaling
  private quality: 'low' | 'medium' | 'high' = 'high';
  private bloomIntensity: number = 1.1;
  private width: number;
  private height: number;

  // Individual feature flags
  public features: GraphicsFeatures = { shadows: true, bloom: true, vignette: true, fxaa: false, taa: true, motionBlur: false };

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
          this.features = normalizeGraphicsFeatures({ ...this.features, ...parsed });
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
    const needsComposer = this.features.bloom || this.features.vignette || this.features.fxaa || this.features.taa || this.features.motionBlur;

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

    // 4. Temporal AA Pass (if enabled)
    if (this.features.taa) {
      this.taaPass = new TemporalAAPass(this.width, this.height);
      this.composer.addPass(this.taaPass);
    }

    // 5. Motion Blur Pass (if enabled)
    if (this.features.motionBlur) {
      this.motionBlurPass = new ShaderPass(MotionBlurShader);
      this.composer.addPass(this.motionBlurPass);
    }

    // 6. FXAA Pass (if enabled)
    if (this.features.fxaa) {
      this.fxaaPass = new FXAAPass();
      this.fxaaPass.setSize(this.width, this.height);
      this.composer.addPass(this.fxaaPass);
    }

    // 7. Output Pass (Tone mapping & Color space conversion)
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
    const next = { ...this.features, ...features };
    if (features.taa === true) next.fxaa = false;
    if (features.fxaa === true) next.taa = false;
    this.features = normalizeGraphicsFeatures(next);

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
      prev.fxaa !== this.features.fxaa ||
      prev.taa !== this.features.taa ||
      prev.motionBlur !== this.features.motionBlur;

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
    if (this.taaPass) {
      this.taaPass.setSize(width, height);
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

    const normalizedSpeed = Math.min(speed / 280, 1.0);

    if (this.motionBlurPass) {
      const currentStrength = this.motionBlurPass.uniforms.uStrength.value;
      const boostBonus = isBoosting ? 0.006 : 0;
      const targetStrength = Math.min(0.026, Math.pow(normalizedSpeed, 1.35) * 0.018 + boostBonus);
      this.motionBlurPass.uniforms.uStrength.value = THREE.MathUtils.lerp(currentStrength, targetStrength, 0.12);
    }

    if (!this.effectsPass) return;

    const uniforms = this.effectsPass.uniforms;

    // Increment time
    uniforms.uTime.value += deltaTime;

    // 1. Normalized speed
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
      const jitterApplied = this.applyCameraJitter();
      try {
        this.composer.render(deltaTime);
      } finally {
        if (jitterApplied) this.camera.clearViewOffset();
      }
    }
  }

  private applyCameraJitter() {
    if (!this.features.taa || !this.taaPass || this.width <= 0 || this.height <= 0) return false;

    const pixelRatio = Math.max(this.renderer.getPixelRatio(), 1);
    const jitter = TAA_JITTER_SEQUENCE[this.jitterIndex % TAA_JITTER_SEQUENCE.length];
    this.jitterIndex += 1;
    this.camera.setViewOffset(
      this.width,
      this.height,
      jitter[0] / pixelRatio,
      jitter[1] / pixelRatio,
      this.width,
      this.height
    );
    return true;
  }

  private disposeComposer() {
    if (this.composer) {
      // Disposing passes
      this.composer.passes.forEach((pass: Pass) => {
        if (pass.dispose) pass.dispose();
      });
      this.composer = undefined;
    }
    this.bloomPass = undefined;
    this.taaPass = undefined;
    this.motionBlurPass = undefined;
    this.fxaaPass = undefined;
    this.effectsPass = undefined;
  }

  public destroy() {
    this.disposeComposer();
  }
}
