import * as THREE from 'three';
import { TimeOfDay } from '../engine/types';
import { DEFAULT_FOG_DISTANCE, SKY_COLOR } from '../modes/sceneryDecor';

const SkyShader = {
  uniforms: {
    uTime: { value: 0.0 },
    uTimeOfDayVal: { value: 1.0 }, // 0.0 = afternoon, 0.5 = evening, 1.0 = night
    uSunDir: { value: new THREE.Vector3(0, 1, -1).normalize() },
  },
  vertexShader: `
    varying vec3 vPosition;
    void main() {
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uTimeOfDayVal;
    uniform vec3 uSunDir;
    varying vec3 vPosition;

    // Fast 3D hash for procedural stars
    float hash(vec3 p) {
      p = fract(p * vec3(443.8975, 397.2973, 491.1871));
      p += dot(p.xyz, p.yzx + 19.19);
      return fract(p.x * p.y * p.z);
    }

    // 2D Noise for clouds
    float hash2D(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise2D(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash2D(i + vec2(0.0,0.0)), hash2D(i + vec2(1.0,0.0)), u.x),
                 mix(hash2D(i + vec2(0.0,1.0)), hash2D(i + vec2(1.0,1.0)), u.x), u.y);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      vec2 shift = vec2(100.0);
      mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
      for (int i = 0; i < 4; ++i) {
        v += a * noise2D(p);
        p = rot * p * 2.0 + shift;
        a *= 0.5;
      }
      return v;
    }

    float getStars(vec3 dir, float time, out vec3 starColor) {
      // Create a grid of cells on the unit sphere
      vec3 cell = floor(dir * 180.0);
      float h = hash(cell);
      float starVal = 0.0;
      
      if (h > 0.988) { // Only a small percentage of cells contain stars
        // Jitter star position inside cell
        vec3 offset = vec3(hash(cell + 1.0), hash(cell + 2.0), hash(cell + 3.0)) - 0.5;
        vec3 starPos = cell + 0.5 + offset * 0.7;
        
        float d = length(dir * 180.0 - starPos);
        float twinkle = sin(time * 3.5 + h * 12.0) * 0.45 + 0.55;
        
        starVal = smoothstep(0.4, 0.0, d) * twinkle;
        
        // Pick star color (white, cyber cyan, cyber magenta)
        float colorHash = hash(cell + 10.0);
        if (colorHash < 0.2) {
          starColor = vec3(0.0, 0.9, 1.0); // Neon Cyan
        } else if (colorHash < 0.45) {
          starColor = vec3(1.0, 0.05, 0.75); // Neon Magenta
        } else {
          starColor = vec3(1.0, 1.0, 1.0); // White
        }
      }
      return starVal;
    }

    void main() {
      vec3 dir = normalize(vPosition);
      float height = dir.y;

      // Zenith & Horizon gradients for the three times of day
      
      // 1. Afternoon (uTimeOfDayVal = 0.0)
      vec3 afterHorizon = vec3(0.65, 0.88, 1.0);
      vec3 afterZenith = vec3(0.12, 0.42, 0.8);
      
      // 2. Evening (uTimeOfDayVal = 0.5)
      vec3 eveHorizon = vec3(1.0, 0.42, 0.12); // Sunset orange
      vec3 eveMid = vec3(0.72, 0.15, 0.52);     // Cyan/Magenta cyber-sunset transition
      vec3 eveZenith = vec3(0.12, 0.08, 0.32);  // Deep purple zenith
      
      // 3. Night (uTimeOfDayVal = 1.0)
      vec3 nightHorizon = vec3(0.02, 0.015, 0.07); // Dark indigo horizon
      vec3 nightZenith = vec3(0.004, 0.002, 0.012); // Pitch black deep space

      // Interpolate the base sky gradients
      vec3 skyColor = vec3(0.0);
      float hClamped = max(0.0, height);

      if (uTimeOfDayVal < 0.5) {
        // Afternoon to Evening
        float t = uTimeOfDayVal * 2.0;
        vec3 gradAfter = mix(afterHorizon, afterZenith, hClamped);
        vec3 gradEve = mix(mix(eveHorizon, eveMid, hClamped), eveZenith, hClamped * hClamped);
        skyColor = mix(gradAfter, gradEve, t);
      } else {
        // Evening to Night
        float t = (uTimeOfDayVal - 0.5) * 2.0;
        vec3 gradEve = mix(mix(eveHorizon, eveMid, hClamped), eveZenith, hClamped * hClamped);
        vec3 gradNight = mix(nightHorizon, nightZenith, hClamped);
        skyColor = mix(gradEve, gradNight, t);
      }

      // 4. Sun & Moon rendering
      // Sun active mostly during day and evening
      float sunWeight = smoothstep(0.85, 0.0, uTimeOfDayVal);
      if (sunWeight > 0.0) {
        float sunCos = dot(dir, uSunDir);
        float sunSize = 0.012;
        float sunDisk = smoothstep(1.0 - sunSize, 1.0, sunCos);
        float sunHalo = pow(max(0.0, sunCos), 32.0) * 0.38;
        vec3 sunColor = vec3(1.0, 0.98, 0.85) * sunDisk * 4.0 + vec3(1.0, 0.65, 0.3) * sunHalo;
        skyColor += sunColor * sunWeight;
      }

      // Moon active at night
      float moonWeight = smoothstep(0.4, 1.0, uTimeOfDayVal);
      if (moonWeight > 0.0) {
        vec3 moonDir = -uSunDir; // Moon is opposite to the sun
        float moonCos = dot(dir, moonDir);
        float moonSize = 0.008;
        float moonDisk = smoothstep(1.0 - moonSize, 1.0, moonCos);
        float moonHalo = pow(max(0.0, moonCos), 45.0) * 0.35;
        vec3 moonColor = vec3(0.9, 0.95, 1.0) * moonDisk * 2.0 + vec3(0.3, 0.5, 0.85) * moonHalo;
        skyColor += moonColor * moonWeight;
      }

      // 5. Stars at night
      if (height > 0.0 && uTimeOfDayVal > 0.35) {
        vec3 starColor = vec3(0.0);
        float starsIntensity = getStars(dir, uTime, starColor);
        // Stars only visible at night, fade near horizon
        float starFade = smoothstep(0.0, 0.25, height) * smoothstep(0.35, 0.9, uTimeOfDayVal);
        skyColor += starColor * starsIntensity * starFade * 1.6;
      }

      // 6. Procedural clouds (Active in Afternoon & Evening)
      float cloudWeight = smoothstep(0.95, 0.3, uTimeOfDayVal);
      if (height > 0.0 && cloudWeight > 0.01) {
        vec2 uvCloud = (dir.xz / (dir.y + 0.005)) * 0.32 + vec2(uTime * 0.008, uTime * 0.004);
        float cloudNoise = fbm(uvCloud);
        // Soft clouds shape
        float cloudShape = smoothstep(0.42, 0.65, cloudNoise) * smoothstep(0.0, 0.12, height);
        
        // Cloud colors sunset reflection
        vec3 cColor = mix(vec3(1.0, 1.0, 1.0), vec3(1.0, 0.58, 0.42), clamp(uTimeOfDayVal * 2.0, 0.0, 1.0));
        
        // Blending clouds with sky background
        skyColor = mix(skyColor, cColor, cloudShape * cloudWeight * 0.8);
      }

      // 7. Aurora Borealis effect (at night only, animated color bands near zenith)
      float auroraWeight = smoothstep(0.65, 1.0, uTimeOfDayVal);
      if (height > 0.22 && auroraWeight > 0.0) {
        // Compute wave pattern
        float wave = sin(dir.x * 2.5 + dir.z * 1.8 + uTime * 0.6) * 0.05;
        float auroraLine = smoothstep(0.07, 0.0, abs(dir.y - 0.55 + wave));
        vec3 auroraColor = mix(vec3(0.0, 1.0, 0.45), vec3(0.65, 0.0, 1.0), sin(uTime * 0.4) * 0.5 + 0.5);
        skyColor += auroraColor * auroraLine * auroraWeight * 0.12 * smoothstep(0.22, 0.5, height);
      }

      // Fade sky to solid ground color below horizon
      if (height < 0.0) {
        vec3 groundColor = mix(afterHorizon, nightHorizon, uTimeOfDayVal);
        skyColor = mix(skyColor, groundColor * 0.25, smoothstep(0.0, -0.15, height));
      }

      gl_FragColor = vec4(skyColor, 1.0);
    }
  `
};

export class Sky {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;
  
  private skyMesh!: THREE.Mesh;
  private skyMaterial!: THREE.ShaderMaterial;
  private clock = new THREE.Clock();
  
  private uTimeOfDayTarget = 1.0;
  private uTimeOfDayVal = 1.0;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, ambientLight: THREE.AmbientLight, dirLight: THREE.DirectionalLight) {
    this.scene = scene;
    this.renderer = renderer;
    this.ambientLight = ambientLight;
    this.dirLight = dirLight;

    this.createSkyDome();
    this.updateTimeOfDay('night'); // Default to night initially
  }

  private createSkyDome() {
    // Create sky dome sphere (radius 900 fits inside rear camera clip plane 1000)
    const geometry = new THREE.SphereGeometry(900, 32, 24);
    
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SkyShader.uniforms),
      vertexShader: SkyShader.vertexShader,
      fragmentShader: SkyShader.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false, // Make sure it renders in background without blocking other meshes
      fog: false
    });

    this.skyMesh = new THREE.Mesh(geometry, this.skyMaterial);
    this.scene.add(this.skyMesh);
  }

  /**
   * @param fogDistance Horizon distance in world units. Omit for the per-time
   *   default, or pass 0 to switch fog off.
   */
  public updateTimeOfDay(time: TimeOfDay, fogDistance?: number) {
    const far = fogDistance ?? DEFAULT_FOG_DISTANCE[time] ?? DEFAULT_FOG_DISTANCE.afternoon;
    if (far > 0) {
      // Matching the sky colour is what makes the horizon dissolve instead of
      // ending at a visible edge. The sky dome itself sets fog:false so it stays
      // exempt and keeps its gradient.
      const color = SKY_COLOR[time] ?? SKY_COLOR.afternoon;
      this.scene.fog = new THREE.Fog(color, far * 0.25, far);
    } else {
      this.scene.fog = null;
    }

    switch (time) {
      case 'afternoon':
        this.uTimeOfDayTarget = 0.0;
        this.renderer.setClearColor(0x87CEEB, 1);
        this.ambientLight.color.setHex(0xffffff);
        this.ambientLight.intensity = 0.8;
        this.dirLight.color.setHex(0xffffff);
        this.dirLight.intensity = 1.2;
        break;

      case 'evening':
        this.uTimeOfDayTarget = 0.5;
        this.renderer.setClearColor(0xFF7F50, 1); // Coral/Orange
        this.ambientLight.color.setHex(0xffd1b3); // Warmer ambient
        this.ambientLight.intensity = 0.6;
        this.dirLight.color.setHex(0xffaa55); // Orange directional
        this.dirLight.intensity = 1.0;
        break;

      case 'night':
      default:
        this.uTimeOfDayTarget = 1.0;
        this.renderer.setClearColor(0x0a0a14, 1);
        this.ambientLight.color.setHex(0x24244d);
        this.ambientLight.intensity = 1.0;
        this.dirLight.color.setHex(0xffffff);
        this.dirLight.intensity = 1.2;
        break;
    }
  }

  public getTimeOfDayVal(): number {
    return this.uTimeOfDayVal;
  }

  public setVisible(visible: boolean) {
    if (this.skyMesh) {
      this.skyMesh.visible = visible;
    }
  }

  public updateSkyPosition(cameraPosition: THREE.Vector3) {
    // Recenter sky dome around camera position so it acts as an infinite background
    if (this.skyMesh) {
      this.skyMesh.position.copy(cameraPosition);
    }

    // Get time elapsed
    const elapsed = this.clock.getElapsedTime();
    if (this.skyMaterial) {
      this.skyMaterial.uniforms.uTime.value = elapsed;

      // Lerp time-of-day value smoothly
      this.uTimeOfDayVal += (this.uTimeOfDayTarget - this.uTimeOfDayVal) * 0.05;
      this.skyMaterial.uniforms.uTimeOfDayVal.value = this.uTimeOfDayVal;

      // Update light direction vector
      if (this.dirLight) {
        // Point uSunDir based on directional light position
        this.skyMaterial.uniforms.uSunDir.value.copy(this.dirLight.position).normalize();
      }
    }
  }
}
