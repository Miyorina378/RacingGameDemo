import * as THREE from 'three';
import { Vehicle } from './objects/Vehicle';
import { ParticleSystem } from './objects/ParticleSystem';
import { GameMode } from './modes/BaseMode';
import { GarageMode } from './modes/GarageMode';
import { FreeRoamMode } from './modes/FreeRoamMode';
import { PreviewMode } from './modes/PreviewMode';
import { LicenseMode } from './modes/LicenseMode';
import { RaceMode } from './modes/RaceMode';
import { TutorialMode } from './modes/TutorialMode';
import { TRACKS_DATABASE } from './config/TrackDatabase';
import { Sky } from './objects/Sky';

import { CARS_DATABASE, CarConfig } from './config/CarDatabase';
export type { CarConfig };

export interface EngineCallbacks {
  onSpeedChange: (speed: number) => void;
  onDriftScoreChange: (score: number, multiplier: number) => void;
  onCreditsChange: (credits: number) => void;
  onTimerChange: (secondsRemaining: number) => void;
  onCheckpointChange: (activeCheckpoint: number, totalCheckpoints: number) => void;
  onGameStatus: (status: 'idle' | 'countdown' | 'playing' | 'success' | 'failed', message?: string, results?: any[]) => void;
  onDriftCompleted: (earnedCredits: number) => void;
  onPlacementChange?: (placement: number, totalParticipants: number) => void;
  onVehicleStatsChange?: (speed: number, rpm: number, gear: number, isShifting: boolean, throttle: number, brake: number) => void;
  onRaceTimeUpdate?: (totalTime: number, bestLapTime: number, currentLapTime: number) => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public rearCamera!: THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;
  public dirLight!: THREE.DirectionalLight;
  public ambientLight!: THREE.AmbientLight;

  // Shared across modes
  public environmentGroup!: THREE.Group;
  public vehicle!: Vehicle;
  public sky!: Sky;
  public particles!: ParticleSystem;
  public keys: { [key: string]: boolean } = {};

  // Gameplay State
  public activeMode: 'garage' | 'free_roam' | 'license' | 'race' | 'tutorial' = 'garage';
  public currentModeInstance: GameMode | null = null;
  public gameStatus: 'idle' | 'countdown' | 'playing' | 'success' | 'failed' = 'idle';
  public gameTimer = 0;
  public isPaused = false;
  public activeTrackId = 'sprint_circuit';
  public cameraViewMode: 'chase' | 'driver' = 'chase';

  // Player Stats
  public playerCredits = 500;
  public hasLicense = false;
  public currentCarId = 'starter';
  public carColor = '#f43f5e';

  // Drifting State
  public driftAccumulatedPoints = 0;
  public driftMultiplier = 1;

  // React callbacks
  public callbacks: EngineCallbacks;

  private modeTimerInterval: any = null;
  private animationFrameId: number | null = null;
  private timer = new THREE.Timer();

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    // Load cached player state
    if (typeof window !== 'undefined') {
      const savedCredits = localStorage.getItem('cyberdrive_credits');
      if (savedCredits) this.playerCredits = parseInt(savedCredits, 10);
      const savedLicense = localStorage.getItem('cyberdrive_license');
      if (savedLicense) this.hasLicense = savedLicense === 'true';
    }

    this.initThree();
    this.setupInputs();

    // Spawn vehicle and particle system
    this.vehicle = new Vehicle(this.currentCarId, this.carColor);
    this.scene.add(this.vehicle.mesh);

    this.particles = new ParticleSystem(this.scene);

    // Initial Mode
    this.buildGarage();
    this.animate();
  }

  private initThree() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 4000);
    this.rearCamera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Lights
    this.ambientLight = new THREE.AmbientLight(0x24244d, 1.0);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2); // White directional light for realistic road colors
    this.dirLight.position.set(0, 100, -100);
    this.dirLight.castShadow = true;
    
    // Set up high-res shadow maps and bounding box to follow car
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 400;
    
    const d = 120;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005; // Prevent shadow acne

    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Initialize Sky
    this.sky = new Sky(this.scene, this.renderer, this.ambientLight, this.dirLight);

    // Setup environments group
    this.environmentGroup = new THREE.Group();
    this.scene.add(this.environmentGroup);

    // Resize listener
    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    if (!this.canvas) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private setupInputs() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'r' && this.activeMode !== 'garage' && !this.isPaused) {
        this.resetCar();
      }
      if (e.key.toLowerCase() === 'z' && this.activeMode !== 'garage' && !this.isPaused) {
        this.cameraViewMode = this.cameraViewMode === 'chase' ? 'driver' : 'chase';
        if (this.cameraViewMode === 'chase') {
          this.camera.up.set(0, 1, 0);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  // --- STATE SWITCHING / FACTORY ---

  private changeMode(modeName: typeof this.activeMode, modeInstance: GameMode) {
    if (this.currentModeInstance) {
      this.currentModeInstance.cleanup();
    }

    this.resetGameplayTimer();
    this.activeMode = modeName;
    this.currentModeInstance = modeInstance;
    this.currentModeInstance.init();

    // Snap camera instantly to chase position for driving modes
    // (otherwise it slowly lerps from the garage orbit, looking 180° wrong)
    if (modeName !== 'garage') {
      this.snapCameraBehindCar();
    }

    // Apply shadow settings to all loaded objects in the scene
    this.applyShadowsToScene();
  }

  public applyShadowsToScene() {
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
        // Exclude particle system meshes which use Basic material and don't need lighting
        if (child.material && (child.material as any).type === 'MeshBasicMaterial') {
          // Check if it's the black grid floor background (MeshBasicMaterial but we want it to receive shadows)
          const isGroundGrid = child.geometry && child.geometry.type === 'PlaneGeometry' && (child.material as any).color && (child.material as any).color.getHex() === 0x0a0a14;
          if (!isGroundGrid) {
            child.castShadow = false;
            child.receiveShadow = false;
            return;
          }
        }

        // Road, grass ground, lines and curbs should only receive shadows
        const isFlatGround = child.name === 'ground' || 
          (child.geometry && (child.geometry.type === 'BufferGeometry' || child.geometry.type === 'PlaneGeometry') && 
           child.material && 
           ((child.material as any).color && 
            ((child.material as any).color.getHex() === 0x1f1f23 || // road
             (child.material as any).color.getHex() === 0x7bb369 || // grass
             (child.material as any).color.getHex() === 0x0a0a14 || // floor grid background
             (child.material as any).color.getHex() === 0xeeeeee || // lines
             (child.material as any).color.getHex() === 0xffcc00)));  // center dashed line
        
        if (isFlatGround) {
          child.receiveShadow = true;
          child.castShadow = false;
        } else if (child instanceof THREE.InstancedMesh && child.material && (child.material as any).customProgramCacheKey && (child.material as any).customProgramCacheKey() === 'grass_leaves') {
          // Grass blades only receive shadows for high performance (casting thousands of tiny shadows is extremely slow)
          child.receiveShadow = true;
          child.castShadow = false;
        } else {
          // Buildings, ramps, concrete walls, fences, fence posts, vehicles, crystals, checkpoints cast & receive shadows
          child.castShadow = true;
          child.receiveShadow = true;
        }
      }
    });
  }

  private snapCameraBehindCar() {
    if (this.cameraViewMode === 'driver') {
      this.vehicle.mesh.updateMatrixWorld(true);
      const config = CARS_DATABASE.find(c => c.id === this.currentCarId) || CARS_DATABASE[0];
      const offset = config.driverCameraOffset || { x: 0, y: 1.05, z: 0.8 };
      const scale = config.visualScale !== undefined ? config.visualScale : 1.0;
      const localCamPos = new THREE.Vector3(offset.x * scale, offset.y * scale, offset.z * scale);
      const worldCamPos = localCamPos.clone().applyMatrix4(this.vehicle.mesh.matrixWorld);
      this.camera.position.copy(worldCamPos);

      const localLookDir = new THREE.Vector3(offset.x * scale, offset.y * scale, (offset.z + 10.0) * scale);
      const worldLookTarget = localLookDir.clone().applyMatrix4(this.vehicle.mesh.matrixWorld);
      this.camera.lookAt(worldLookTarget);
      
      const localUp = new THREE.Vector3(0, 1, 0);
      const worldUp = localUp.clone().transformDirection(this.vehicle.mesh.matrixWorld);
      this.camera.up.copy(worldUp);
    } else {
      this.camera.up.set(0, 1, 0);
      const followDist = 8.5;
      const heightOffset = 3.6;

      const backOffset = new THREE.Vector3(0, 0, -1)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.vehicle.yaw)
        .multiplyScalar(followDist);

      const camPos = new THREE.Vector3()
        .copy(this.vehicle.pos)
        .add(backOffset);
      camPos.y += heightOffset;

      this.camera.position.copy(camPos);

      const lookTarget = new THREE.Vector3()
        .copy(this.vehicle.pos)
        .add(new THREE.Vector3(0, 0.5, 0));
      this.camera.lookAt(lookTarget);
    }
  }

  public buildGarage() {
    this.sky.updateTimeOfDay('night');
    this.changeMode('garage', new GarageMode(this, this.scene, this.vehicle, this.particles, this.environmentGroup, this.keys));
  }

  public buildOpenWorld() {
    this.sky.updateTimeOfDay('night');
    this.changeMode('free_roam', new FreeRoamMode(this, this.scene, this.vehicle, this.particles, this.environmentGroup, this.keys));
  }

  public buildLicenseTest() {
    this.sky.updateTimeOfDay('afternoon');
    this.changeMode('license', new LicenseMode(this, this.scene, this.vehicle, this.particles, this.environmentGroup, this.keys));
  }

  public buildRaceTrack(trackId: string = 'sprint_circuit') {
    this.activeTrackId = trackId;
    const trackConfig = TRACKS_DATABASE.find(t => t.id === trackId);
    if (trackConfig && trackConfig.time) {
      this.sky.updateTimeOfDay(trackConfig.time);
    } else {
      this.sky.updateTimeOfDay('night');
    }
    this.changeMode('race', new RaceMode(this, this.scene, this.vehicle, this.particles, this.environmentGroup, this.keys, trackId));
  }

  public buildTutorial() {
    this.sky.updateTimeOfDay('afternoon');
    this.changeMode('tutorial', new TutorialMode(this, this.scene, this.vehicle, this.particles, this.environmentGroup, this.keys));
  }

  public buildPreviewTrack(trackId: string = 'custom') {
    this.activeTrackId = trackId;
    const trackConfig = TRACKS_DATABASE.find(t => t.id === trackId);
    if (trackConfig && trackConfig.time) {
      this.sky.updateTimeOfDay(trackConfig.time);
    } else {
      this.sky.updateTimeOfDay('afternoon');
    }
    if (this.currentModeInstance instanceof PreviewMode) {
      PreviewMode.isRebuilding = true;
    }
    // We treat preview as 'garage' conceptually so it doesn't snap camera behind car, 
    // but the PreviewMode will take over camera control anyway.
    this.changeMode('garage', new PreviewMode(this, this.scene, this.vehicle, this.particles, this.environmentGroup, this.keys, trackId));
  }

  // --- FAÇADE HELPER UTILITIES ---

  public setActiveCar(carId: string, color: string, upgrades?: any) {
    this.currentCarId = carId;
    this.carColor = color;
    if (upgrades) {
      this.vehicle.upgrades = upgrades;
    }
    this.vehicle.rebuild(carId, color);

    if (this.activeMode === 'garage') {
      this.buildGarage();
    }
  }

  public resetCar() {
    if (this.currentModeInstance && typeof (this.currentModeInstance as any).resetVehicle === 'function') {
      (this.currentModeInstance as any).resetVehicle();
    } else if (this.activeMode === 'license' || this.activeMode === 'race') {
      this.vehicle.reset(new THREE.Vector3(0, 0.5, 15), 0);
    } else if (this.activeMode === 'tutorial') {
      this.vehicle.reset(new THREE.Vector3(0, 0.5, 30), 0);
    } else {
      this.vehicle.reset(new THREE.Vector3(0, 0.5, 0), Math.PI);
    }
  }

  public addCredits(amount: number) {
    this.playerCredits += amount;
    this.callbacks.onCreditsChange(this.playerCredits);
  }

  // Countdown & Play Timers orchestrations
  public startCountdown(timeLimit: number) {
    this.gameStatus = 'countdown';
    let countdownVal = 3;
    this.callbacks.onGameStatus('countdown', `GET READY... ${countdownVal}`);

    const interval = setInterval(() => {
      countdownVal--;
      if (countdownVal > 0) {
        this.callbacks.onGameStatus('countdown', `GET READY... ${countdownVal}`);
      } else {
        clearInterval(interval);
        this.gameStatus = 'playing';
        this.callbacks.onGameStatus('playing', 'GO! GO! GO!');
        if (this.activeMode === 'race') {
          this.startCountUpTimer();
        } else {
          this.startTimer(timeLimit);
        }
      }
    }, 1000);
  }

  private startCountUpTimer() {
    this.gameTimer = 0;
    this.callbacks.onTimerChange(this.gameTimer);

    if (this.modeTimerInterval) {
      clearInterval(this.modeTimerInterval);
      this.modeTimerInterval = null;
    }
  }

  private startTimer(timeLimit: number) {
    this.gameTimer = timeLimit;
    this.callbacks.onTimerChange(this.gameTimer);

    if (this.modeTimerInterval) {
      clearInterval(this.modeTimerInterval);
      this.modeTimerInterval = null;
    }
  }

  public handleSuccess(place: number = 1, results?: any[]) {
    this.gameStatus = 'success';
    this.vehicle.speed = 0;
    if (this.modeTimerInterval) clearInterval(this.modeTimerInterval);

    let creditsReward = 0;
    let message = '';

    if (this.activeMode === 'license') {
      this.hasLicense = true;
      creditsReward = 500;
      message = 'LICENSE A UNLOCKED! Unlocked high tier racing. +500 cr';
      if (typeof window !== 'undefined') localStorage.setItem('cyberdrive_license', 'true');
    } else if (this.activeMode === 'tutorial') {
      creditsReward = 200;
      message = 'TUTORIAL COMPLETED! You learned how to drive. +200 cr';
    } else if (this.activeMode === 'race') {
      const trackConfig = TRACKS_DATABASE.find(t => t.id === this.activeTrackId) || TRACKS_DATABASE[1];
      const baseReward = trackConfig.baseReward !== undefined ? trackConfig.baseReward : 300;

      const placeText = place === 1 ? '1st PLACE' : (place === 2 ? '2nd PLACE' : place === 3 ? '3rd PLACE' : `${place}th PLACE`);

      if (place === 1) {
        creditsReward = baseReward;
      } else if (place === 2) {
        creditsReward = Math.round(baseReward * 0.4);
      } else if (place === 3) {
        creditsReward = Math.round(baseReward * 0.3);
      } else if (place === 4) {
        creditsReward = Math.round(baseReward * 0.2);
      } else if (place === 5) {
        creditsReward = Math.round(baseReward * 0.1);
      } else {
        creditsReward = Math.round(baseReward * 0.05);
      }

      const minutes = Math.floor(this.gameTimer / 60);
      const seconds = Math.floor(this.gameTimer % 60);
      const milliseconds = Math.floor((this.gameTimer % 1) * 1000);
      const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
      message = `${placeText}! Completed circuit in ${formattedTime}. +${creditsReward} cr`;
    }

    this.playerCredits += creditsReward;
    this.callbacks.onCreditsChange(this.playerCredits);
    this.callbacks.onGameStatus('success', message, results);
  }

  public triggerCrash(message: string) {
    this.gameStatus = 'failed';
    if (this.modeTimerInterval) clearInterval(this.modeTimerInterval);
    this.callbacks.onGameStatus('failed', message);
  }

  private resetGameplayTimer() {
    this.gameStatus = 'idle';
    if (this.modeTimerInterval) {
      clearInterval(this.modeTimerInterval);
      this.modeTimerInterval = null;
    }
  }

  // --- DRIFT SCORING CONTROLS ---

  public accumulateDrift(points: number) {
    this.driftAccumulatedPoints += points;
    this.driftMultiplier = 1 + Math.floor(this.driftAccumulatedPoints / 300);
    this.callbacks.onDriftScoreChange(this.driftAccumulatedPoints, this.driftMultiplier);
  }

  public finishDrift(isCurrentlyDrifting: boolean) {
    if (this.activeMode === 'free_roam' && this.driftAccumulatedPoints > 100) {
      const finalPoints = this.driftAccumulatedPoints * this.driftMultiplier;
      const creditGain = Math.round(finalPoints * 0.1);

      this.playerCredits += creditGain;
      this.callbacks.onCreditsChange(this.playerCredits);
      this.callbacks.onDriftCompleted(creditGain);
    }

    setTimeout(() => {
      if (!isCurrentlyDrifting) {
        this.driftAccumulatedPoints = 0;
        this.driftMultiplier = 1;
        this.callbacks.onDriftScoreChange(0, 1);
      }
    }, 1500);
  }

  public getTutorialStatus() {
    if (this.activeMode === 'tutorial' && this.currentModeInstance instanceof TutorialMode) {
      return this.currentModeInstance.getTutorialStatus();
    }
    return {
      turnKeyPressed: false,
      isDrifting: false,
      isGrounded: true,
      carPosY: 0,
      crystalCollected: false
    };
  }

  // --- ANIMATION FRAME TICK ---

  private animate = (timestamp: number = performance.now()) => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    this.timer.update(timestamp);
    // target 60fps limit, cap to 0.05 to avoid huge jumps
    const deltaTime = Math.min(this.timer.getDelta(), 0.05);

    if (!this.isPaused) {
      // 1. Delegate tick to active mode instance
      if (this.currentModeInstance) {
        this.currentModeInstance.update(deltaTime);
      }

      // Update dirLight coordinates to follow the vehicle
      if (this.vehicle && this.dirLight) {
        this.dirLight.position.set(this.vehicle.pos.x, this.vehicle.pos.y + 100, this.vehicle.pos.z - 100);
        this.dirLight.target.position.copy(this.vehicle.pos);
      }

      // Smoothly update play timers
      if (this.gameStatus === 'playing') {
        if (this.activeMode === 'race') {
          if (this.currentModeInstance instanceof RaceMode) {
            this.gameTimer = (this.currentModeInstance as RaceMode).raceTime;
          } else {
            this.gameTimer += deltaTime;
          }
          this.callbacks.onTimerChange(this.gameTimer);
        } else if (this.activeMode === 'license') {
          this.gameTimer = Math.max(0, this.gameTimer - deltaTime);
          this.callbacks.onTimerChange(this.gameTimer);
          if (this.gameTimer <= 0) {
            this.gameStatus = 'failed';
            this.vehicle.speed = 0;
            this.callbacks.onGameStatus('failed', 'TIME OVER! TEST FAILED.');
          }
        }
      }
    }

    // Center starfield and sky objects on camera position
    if (this.sky) {
      this.sky.updateSkyPosition(this.camera.position);
    }

    // 2. Render Loop HUD speed calculations (convert m/s → km/h for display)
    const displaySpeed = Math.round(Math.abs(this.vehicle.speed) * 3.6);
    this.callbacks.onSpeedChange(displaySpeed);
    if (this.callbacks.onVehicleStatsChange) {
      this.callbacks.onVehicleStatsChange(
        displaySpeed,
        Math.round(this.vehicle.rpm),
        this.vehicle.currentGear,
        this.vehicle.isShifting,
        this.vehicle.throttleInput,
        this.vehicle.brakeInput
      );
    }

    if (this.activeMode === 'race' && this.currentModeInstance instanceof RaceMode) {
      const raceMode = this.currentModeInstance as RaceMode;
      if (this.callbacks.onRaceTimeUpdate) {
        this.callbacks.onRaceTimeUpdate(raceMode.raceTime, raceMode.bestLapTime, raceMode.getCurrentLapTime());
      }
    }

    // 3. Smooth Camera chase tracking
    if (!this.isPaused) {
      this.updateCameraChase(deltaTime);
    }

    // 4. Render
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.renderer.setViewport(0, 0, width, height);
    this.renderer.setScissor(0, 0, width, height);
    this.renderer.setScissorTest(false);
    this.renderer.render(this.scene, this.camera);

    if (this.activeMode !== 'garage' && this.rearCamera) {
      const mirrorElem = document.getElementById('rear-view-mirror-hud');
      if (mirrorElem) {
        const rect = mirrorElem.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();

        const x = rect.left - canvasRect.left;
        const y = canvasRect.bottom - rect.bottom;
        const w = rect.width;
        const h = rect.height;

        if (w > 0 && h > 0) {
          this.rearCamera.aspect = w / h;
          this.rearCamera.updateProjectionMatrix();
          this.rearCamera.projectionMatrix.elements[0] *= -1;

          this.renderer.setViewport(x, y, w, h);
          this.renderer.setScissor(x, y, w, h);
          this.renderer.setScissorTest(true);

          this.renderer.clearDepth();

          const gl = this.renderer.getContext();
          gl.frontFace(gl.CW);

          // Hide own vehicle mesh and temporarily boost ambient light
          const originalVehicleVisible = this.vehicle.mesh.visible;
          this.vehicle.mesh.visible = false;

          const originalAmbientColor = this.ambientLight.color.getHex();
          const originalAmbientIntensity = this.ambientLight.intensity;
          this.ambientLight.color.setHex(0xffffff);
          this.ambientLight.intensity = 2.0;

          this.renderer.render(this.scene, this.rearCamera);

          // Restore states
          this.vehicle.mesh.visible = originalVehicleVisible;
          this.ambientLight.color.setHex(originalAmbientColor);
          this.ambientLight.intensity = originalAmbientIntensity;

          gl.frontFace(gl.CCW);
          this.renderer.setScissorTest(false);
        }
      }
    }
  };

  private updateCameraChase(deltaTime: number) {
    if (this.currentModeInstance instanceof PreviewMode) {
      return;
    }
    if (this.activeMode === 'garage') {
      const orbitSpeed = 0.0003;
      const orbitRadius = 9;
      const time = Date.now() * orbitSpeed;

      this.camera.position.set(
        Math.sin(time) * orbitRadius,
        4.0,
        Math.cos(time) * orbitRadius
      );
      this.camera.lookAt(0, 0.9, 0);
    } else {
      if (this.cameraViewMode === 'driver') {
        this.vehicle.mesh.updateMatrixWorld(true);
        
        const config = CARS_DATABASE.find(c => c.id === this.currentCarId) || CARS_DATABASE[0];
        const offset = config.driverCameraOffset || { x: 0, y: 1.05, z: 0.8 };
        const scale = config.visualScale !== undefined ? config.visualScale : 1.0;
        const localCamPos = new THREE.Vector3(offset.x * scale, offset.y * scale, offset.z * scale);
        const worldCamPos = localCamPos.clone().applyMatrix4(this.vehicle.mesh.matrixWorld);
        this.camera.position.copy(worldCamPos);

        const localLookDir = new THREE.Vector3(offset.x * scale, offset.y * scale, (offset.z + 10.0) * scale);
        const worldLookTarget = localLookDir.clone().applyMatrix4(this.vehicle.mesh.matrixWorld);
        this.camera.lookAt(worldLookTarget);

        const localUp = new THREE.Vector3(0, 1, 0);
        const worldUp = localUp.clone().transformDirection(this.vehicle.mesh.matrixWorld);
        this.camera.up.copy(worldUp);
      } else {
        this.camera.up.set(0, 1, 0);
        
        const followDist = 8.5;
        const heightOffset = 3.6;

        const backOffset = new THREE.Vector3(0, 0, -1)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.vehicle.yaw)
          .multiplyScalar(followDist);

        const targetCamPos = new THREE.Vector3()
          .copy(this.vehicle.pos)
          .add(backOffset);

        targetCamPos.y += heightOffset;
        this.camera.position.lerp(targetCamPos, 0.15);

        const lookTarget = new THREE.Vector3()
          .copy(this.vehicle.pos)
          .add(new THREE.Vector3(0, 0.5, 0));

        this.camera.lookAt(lookTarget);
      }
    }

    // Update rear view camera
    if (this.activeMode !== 'garage' && this.rearCamera && this.vehicle) {
      this.vehicle.mesh.updateMatrixWorld(true);
      
      const localRearCamPos = new THREE.Vector3(0, 1.15, -0.2);
      const worldRearCamPos = localRearCamPos.clone().applyMatrix4(this.vehicle.mesh.matrixWorld);
      this.rearCamera.position.copy(worldRearCamPos);
      
      const localRearLookDir = new THREE.Vector3(0, 1.15, -20.0);
      const worldRearLookTarget = localRearLookDir.clone().applyMatrix4(this.vehicle.mesh.matrixWorld);
      this.rearCamera.lookAt(worldRearLookTarget);
      
      const localUp = new THREE.Vector3(0, 1, 0);
      const worldUp = localUp.clone().transformDirection(this.vehicle.mesh.matrixWorld);
      this.rearCamera.up.copy(worldUp);
    }
  }

  public destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.resetGameplayTimer();

    window.removeEventListener('resize', this.handleResize);

    if (this.currentModeInstance) {
      this.currentModeInstance.cleanup();
    }

    // Traversal geometry disposals
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat) => mat.dispose());
          } else {
            obj.material.dispose();
          }
        }
      }
    });

    this.renderer.dispose();
  }
}
