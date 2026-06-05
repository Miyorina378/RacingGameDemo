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

  private quality: 'low' | 'medium' | 'high' = 'high';
  private bloomIntensity: number = 1.1;
  private width: number;
  private height: number;

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
    }

    this.applyQualitySettingsToRenderer();
    this.initComposer();
  }

  private initComposer() {
    if (this.quality === 'low') {
      // In low quality, we render directly to the screen (no composer)
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

    // 2. Bloom Pass
    if (this.quality === 'medium') {
      // Moderate bloom settings for medium tier
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(this.width, this.height),
        this.bloomIntensity * 0.8,  // Strength
        0.4,  // Radius
        0.25  // Threshold
      );
      this.composer.addPass(this.bloomPass);
    } else if (this.quality === 'high') {
      // Rich bloom settings for high tier
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(this.width, this.height),
        this.bloomIntensity,  // Strength
        0.5,  // Radius
        0.18  // Threshold
      );
      this.composer.addPass(this.bloomPass);

      // 3. Custom Effects Pass (vignette, chromatic aberration, flash)
      this.effectsPass = new ShaderPass(CustomEffectsShader);
      this.effectsPass.uniforms.uResolution.value.set(this.width, this.height);
      this.composer.addPass(this.effectsPass);

      // 4. FXAA Pass (Anti-aliasing)
      this.fxaaPass = new FXAAPass();
      this.fxaaPass.setSize(this.width, this.height);
      this.composer.addPass(this.fxaaPass);
    }

    // 5. Output Pass (Tone mapping & Color space conversion)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  private applyQualitySettingsToRenderer() {
    if (this.quality === 'low') {
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((child) => {
        if (child instanceof THREE.DirectionalLight || child instanceof THREE.SpotLight) {
          child.castShadow = false;
        }
      });
    } else {
      this.renderer.shadowMap.enabled = true;
      this.scene.traverse((child) => {
        if (child instanceof THREE.DirectionalLight || child instanceof THREE.SpotLight) {
          child.castShadow = true;
        }
      });
    }
  }

  public setQuality(quality: 'low' | 'medium' | 'high') {
    if (this.quality === quality) return;
    this.quality = quality;
    if (typeof window !== 'undefined') {
      localStorage.setItem('cyberdrive_graphics_quality', quality);
    }

    this.applyQualitySettingsToRenderer();

    // Reconstruct composer with the new quality settings
    this.disposeComposer();
    this.initComposer();
  }

  public getQuality(): 'low' | 'medium' | 'high' {
    return this.quality;
  }

  public setBloomIntensity(intensity: number) {
    this.bloomIntensity = intensity;
    if (typeof window !== 'undefined') {
      localStorage.setItem('cyberdrive_bloom_intensity', intensity.toString());
    }
    if (this.bloomPass) {
      if (this.quality === 'medium') {
        this.bloomPass.strength = intensity * 0.8;
      } else {
        this.bloomPass.strength = intensity;
      }
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
    if (this.quality === 'low') return;

    // Dynamically adjust bloom parameters based on time of day (daylight vs night)
    if (this.bloomPass) {
      const isHigh = this.quality === 'high';
      const baseThreshold = isHigh ? 0.18 : 0.25;
      
      // Interpolate threshold: higher in afternoon (0.85) to prevent sky/ground glow, lower at night (0.18/0.25)
      this.bloomPass.threshold = THREE.MathUtils.lerp(0.85, baseThreshold, timeOfDayVal);
      
      // Interpolate strength: softer in afternoon (50% strength) to prevent blinding, full at night
      const strengthFactor = THREE.MathUtils.lerp(0.5, 1.0, timeOfDayVal);
      const baseStrength = isHigh ? this.bloomIntensity : this.bloomIntensity * 0.8;
      this.bloomPass.strength = baseStrength * strengthFactor;
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
    if (this.quality === 'low') {
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
