import * as THREE from 'three';
import { Vehicle } from './objects/Vehicle';
import { ParticleSystem } from './objects/ParticleSystem';
import { GameMode } from './modes/BaseMode';
import { GarageMode } from './modes/GarageMode';
import { FreeRoamMode } from './modes/FreeRoamMode';
import { PreviewMode } from './modes/PreviewMode';
import { LicenseMode } from './modes/LicenseMode';
import { RaceMode } from './modes/RaceMode';
import type { RaceOptions } from './modes/RaceMode';
import { TutorialMode } from './modes/TutorialMode';
import { TRACKS_DATABASE } from './config/TrackDatabase';
import { Sky } from './objects/Sky';
import { PostProcessing } from './PostProcessing';
import { CARS_DATABASE, CarConfig } from './config/CarDatabase';
import { KeyBindings, DEFAULT_KEY_BINDINGS } from './option';
import {
  EditorState,
  GameModeName,
  GameStatus,
  createDefaultEditorState
} from './engine/types';
import { InputController } from './engine/InputController';
import { createThreeWorld } from './engine/threeWorld';
import { applyShadowsToScene, disposeSceneObjects } from './engine/sceneUtils';
import { SuggestedGearAdvisor, SuggestedGearAdvice } from './engine/SuggestedGearAdvisor';
import { ReplayCameraDirector } from './engine/ReplayCameraDirector';
import {
  DEFAULT_LICENSE_TEST_ID,
  LicenseProgress,
  completeLicenseTest,
  createDefaultLicenseProgress,
  getLicenseTestById,
  getLicenseTierCompletion,
  hasAnyLicense,
  isLicenseTestUnlocked,
  isTierComplete,
  loadLicenseProgress,
  saveLicenseProgress
} from './config/LicenseDatabase';

export type { CarConfig };

export interface ReplayTargetInfo {
  index: number;
  total: number;
  name: string;
  isPlayer: boolean;
}

export interface EngineCallbacks {
  onSpeedChange: (speed: number) => void;
  onDriftScoreChange: (score: number, multiplier: number) => void;
  onCreditsChange: (credits: number) => void;
  onTimerChange: (secondsRemaining: number) => void;
  onCheckpointChange: (activeCheckpoint: number, totalCheckpoints: number) => void;
  onGameStatus: (status: 'idle' | 'countdown' | 'playing' | 'success' | 'failed', message?: string, results?: any[]) => void;
  onDriftCompleted: (earnedCredits: number) => void;
  onLicenseProgressChange?: (progress: LicenseProgress, hasLicense: boolean) => void;
  onPlacementChange?: (placement: number, totalParticipants: number) => void;
  onVehicleStatsChange?: (
    speed: number,
    rpm: number,
    gear: number,
    isShifting: boolean,
    throttle: number,
    brake: number,
    fuelLiters: number,
    fuelCapacityLiters: number,
    fuelConsumptionLitersPerHour: number,
    isEngineStalled: boolean,
    tireWear?: number,
    tireTemperature?: number,
    tireCompound?: string,
    tireWearEnabled?: boolean
  ) => void;
  onSuggestedGearChange?: (advice: SuggestedGearAdvice | null) => void;
  onRaceTimeUpdate?: (totalTime: number, bestLapTime: number, currentLapTime: number, isWrongWay?: boolean, isCheat?: boolean) => void;
  onReplayComplete?: (reason: 'ended' | 'skipped') => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public rearCamera!: THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;
  public dirLight!: THREE.DirectionalLight;
  public ambientLight!: THREE.AmbientLight;
  public postProcessing!: PostProcessing;
  public checkpointFlash = 0.0;

  // Shared across modes
  public environmentGroup!: THREE.Group;
  public vehicle!: Vehicle;
  public sky!: Sky;
  public particles!: ParticleSystem;
  public keys: { [key: string]: boolean } = {};
  public keyBindings: KeyBindings = { ...DEFAULT_KEY_BINDINGS };
  public activeGarageTab: string | null = null;
  public dealerMarketMode: 'new' | 'used' | 'race' | 'museum' | null = null;
  public dealerShowroomColor = 0x06b6d4;
  public tuningState: 'closed' | 'entering' | 'open' | 'exiting' = 'closed';
  public tuningCameraProgress = 0;
  private inputController!: InputController;
  public tuningTheta = 0;
  public tuningPhi = 0.15;
  public tuningRadius = 5.5;
  private isPointerDown = false;
  private prevPointerX = 0;
  private prevPointerY = 0;
  private tuningRadiusInitialized = false;
  private prevCarLength = 0;

  // Gameplay State
  public activeMode: GameModeName = 'garage';

  // Editor State. types.ts already declares this shape and its defaults; this used
  // to be a hand-rolled copy of both, so every editor default existed in two places
  // and only one of them was ever the one you found.
  public editorState: EditorState = createDefaultEditorState();
  public currentModeInstance: GameMode | null = null;
  public gameStatus: GameStatus = 'idle';
  public gameTimer = 0;
  public isPaused = false;
  public activeTrackId = 'sprint_circuit';
  public cameraViewMode: 'chase' | 'driver' | 'tv' = 'chase';
  private tvCameraTime = 0;
  private replayTargetIndex = 0;
  private replayDirector = new ReplayCameraDirector();
  /** Camera FOV before the replay director started borrowing the lens. */
  private replayBaseFov = 65;
  public isQuickPlayRace = false;
  private suggestedGearAdvisor = new SuggestedGearAdvisor();

  // Player Stats
  public playerCredits = 500;
  public hasLicense = false;
  public licenseProgress: LicenseProgress = createDefaultLicenseProgress(false);
  public activeLicenseTestId = DEFAULT_LICENSE_TEST_ID;
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
      this.licenseProgress = loadLicenseProgress();
      this.hasLicense = hasAnyLicense(this.licenseProgress);
    }

    this.initThree();
    this.setupInputs();

    // Register window pointer listeners for interactive tuning camera
    window.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('wheel', this.handleWheel, { passive: false });

    // Spawn vehicle and particle system
    this.vehicle = new Vehicle(this.currentCarId, this.carColor);
    this.scene.add(this.vehicle.mesh);

    this.particles = new ParticleSystem(this.scene);

    // Initial Mode
    this.buildGarage();
    this.animate();
  }

  private initThree() {
    const world = createThreeWorld(this.canvas);
    this.scene = world.scene;
    this.camera = world.camera;
    this.rearCamera = world.rearCamera;
    this.renderer = world.renderer;
    this.ambientLight = world.ambientLight;
    this.dirLight = world.dirLight;
    this.sky = world.sky;
    this.postProcessing = world.postProcessing;
    this.environmentGroup = world.environmentGroup;

    window.addEventListener('resize', this.handleResize);
  }

  public handleResize = () => {
    if (!this.canvas) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.postProcessing) {
      this.postProcessing.setSize(width, height);
    }
  };

  private setupInputs() {
    this.inputController = new InputController({
      keys: this.keys,
      getKeyBindings: () => this.keyBindings,
      getActiveMode: () => this.activeMode,
      isPaused: () => this.isPaused,
      resetCar: () => this.resetCar(),
      toggleCameraView: () => {
        if (this.cameraViewMode === 'tv') {
          if (this.currentModeInstance instanceof RaceMode) {
            this.currentModeInstance.skipReplay();
          } else {
            this.stopTvReplay();
          }
          return;
        }

        this.cameraViewMode = this.cameraViewMode === 'chase' ? 'driver' : 'chase';
        if (this.cameraViewMode === 'chase') {
          this.camera.up.set(0, 1, 0);
        }
      }
    });
    this.inputController.connect();
  }

  // --- STATE SWITCHING / FACTORY ---

  private changeMode(modeName: typeof this.activeMode, modeInstance: GameMode) {
    this.stopTvReplay();
    if (this.currentModeInstance) {
      this.currentModeInstance.cleanup();
    }

    this.resetGameplayTimer();
    this.activeMode = modeName;
    this.currentModeInstance = modeInstance;
    this.vehicle.refuel(1);
    this.vehicle.tireWearEnabled = modeName === 'race';
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
    applyShadowsToScene(this.scene);
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
    this.suggestedGearAdvisor.clear();
    this.callbacks.onSuggestedGearChange?.(null);
    this.changeMode('garage', new GarageMode(this, this.scene, this.vehicle, this.particles, this.environmentGroup, this.keys));
  }

  public buildOpenWorld() {
    this.sky.updateTimeOfDay('night');
    this.suggestedGearAdvisor.clear();
    this.callbacks.onSuggestedGearChange?.(null);
    this.changeMode('free_roam', new FreeRoamMode(this, this.scene, this.vehicle, this.particles, this.environmentGroup, this.keys));
  }

  public buildLicenseTest(testId: string = this.activeLicenseTestId) {
    const testConfig = getLicenseTestById(testId) || getLicenseTestById(DEFAULT_LICENSE_TEST_ID);
    if (!testConfig) return;
    if (!isLicenseTestUnlocked(testConfig, this.licenseProgress)) return;

    this.activeLicenseTestId = testConfig.id;
    this.sky.updateTimeOfDay(testConfig.time ?? 'afternoon', testConfig.fogDistance);
    this.suggestedGearAdvisor.setTrack(testConfig, true);
    this.changeMode('license', new LicenseMode(this, this.scene, this.vehicle, this.particles, this.environmentGroup, this.keys, testConfig.id));
  }

  public startTvReplay(): void {
    this.tvCameraTime = 0;
    this.replayTargetIndex = 0;
    this.cameraViewMode = 'tv';
    this.camera.up.set(0, 1, 0);
    // The director drives the lens, so remember the gameplay FOV to hand back.
    this.replayBaseFov = this.camera.fov;
    this.replayDirector.configure(
      this.currentModeInstance instanceof RaceMode
        ? this.currentModeInstance.getReplayCameraTrack()
        : null
    );
  }

  public stopTvReplay(): void {
    this.tvCameraTime = 0;
    this.replayTargetIndex = 0;
    this.replayDirector.reset();
    if (this.cameraViewMode === 'tv') {
      this.cameraViewMode = 'chase';
      this.camera.up.set(0, 1, 0);
    }
    if (Math.abs(this.camera.fov - this.replayBaseFov) > 0.01) {
      this.camera.fov = this.replayBaseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Start playback only after the results presentation has finished. */
  public startRaceReplay(): boolean {
    if (this.activeMode !== 'race' || !(this.currentModeInstance instanceof RaceMode)) {
      return false;
    }

    this.isPaused = false;
    return this.currentModeInstance.startReplay();
  }

  /** Return the car currently followed by the replay camera. */
  public getReplayTargetInfo(): ReplayTargetInfo | null {
    if (!(this.currentModeInstance instanceof RaceMode)) return null;

    const targets = this.currentModeInstance.getReplayTargets();
    if (targets.length === 0) return null;

    this.replayTargetIndex = Math.max(
      0,
      Math.min(this.replayTargetIndex, targets.length - 1)
    );
    const target = targets[this.replayTargetIndex];
    return {
      index: this.replayTargetIndex,
      total: targets.length,
      name: target.name,
      isPlayer: target.isPlayer
    };
  }

  /** Move the replay camera focus to the previous or next car. */
  public cycleReplayTarget(direction: -1 | 1): ReplayTargetInfo | null {
    if (this.cameraViewMode !== 'tv' || !(this.currentModeInstance instanceof RaceMode)) {
      return null;
    }

    const targets = this.currentModeInstance.getReplayTargets();
    if (targets.length === 0) return null;

    this.replayTargetIndex =
      (this.replayTargetIndex + direction + targets.length) % targets.length;
    return this.getReplayTargetInfo();
  }

  /** Download the current completed race as a portable whole-race replay file. */
  public downloadCurrentRaceReplay(): boolean {
    if (typeof window === 'undefined' || this.activeMode !== 'race' || !(this.currentModeInstance instanceof RaceMode)) {
      return false;
    }

    const replay = this.currentModeInstance.getReplayExport();
    if (!replay) return false;

    try {
      const blob = new Blob([JSON.stringify(replay)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTrackId = replay.trackId.replace(/[^a-z0-9_-]+/gi, '-');
      const timestamp = new Date().toISOString().replace(/[.:]/g, '-');

      link.href = url;
      link.download = `cyberdrive-${safeTrackId}-replay-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return true;
    } catch {
      return false;
    }
  }

  public buildRaceTrack(trackId: string = 'sprint_circuit', options: RaceOptions = {}) {
    this.activeTrackId = trackId;
    const trackConfig = TRACKS_DATABASE.find(t => t.id === trackId);
    this.sky.updateTimeOfDay(trackConfig?.time ?? 'night', trackConfig?.fogDistance);
    this.suggestedGearAdvisor.setTrack(trackConfig || null, true);
    // Set player vehicle driving mode
    this.vehicle.drivingMode = options.drivingMode ?? 'simulation';
    this.changeMode('race', new RaceMode(this, this.scene, this.vehicle, this.particles, this.environmentGroup, this.keys, trackId, options));
  }

  public buildTutorial() {
    this.sky.updateTimeOfDay('afternoon');
    this.suggestedGearAdvisor.clear();
    this.callbacks.onSuggestedGearChange?.(null);
    this.changeMode('tutorial', new TutorialMode(this, this.scene, this.vehicle, this.particles, this.environmentGroup, this.keys));
  }

  public buildPreviewTrack(trackId: string = 'custom') {
    this.activeTrackId = trackId;
    const trackConfig = TRACKS_DATABASE.find(t => t.id === trackId);
    this.sky.updateTimeOfDay(trackConfig?.time ?? 'afternoon', trackConfig?.fogDistance);
    if (this.currentModeInstance instanceof PreviewMode) {
      PreviewMode.isRebuilding = true;
    }
    this.suggestedGearAdvisor.clear();
    this.callbacks.onSuggestedGearChange?.(null);
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
    // Vehicle keeps a stable root mesh, so swapping its contents does not require
    // rebuilding the active mode or reallocating the full showroom environment.
    this.vehicle.rebuild(carId, color);
  }

  public triggerPurchaseCelebration() {
    if (this.currentModeInstance instanceof GarageMode) {
      this.currentModeInstance.triggerPurchaseCelebration();
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
      const testConfig = getLicenseTestById(this.activeLicenseTestId);
      if (!testConfig) return;

      const wasAlreadyComplete = this.licenseProgress[testConfig.tier][testConfig.testNumber - 1];
      this.licenseProgress = completeLicenseTest(this.licenseProgress, testConfig);
      this.hasLicense = hasAnyLicense(this.licenseProgress);
      saveLicenseProgress(this.licenseProgress);

      creditsReward = wasAlreadyComplete ? Math.round(testConfig.baseReward * 0.25) : testConfig.baseReward;
      const tierProgress = getLicenseTierCompletion(this.licenseProgress, testConfig.tier);
      const tierName = testConfig.tier.toUpperCase();
      message = isTierComplete(this.licenseProgress, testConfig.tier)
        ? `${tierName} LICENSE COMPLETE! All 10 tests passed. +${creditsReward} cr`
        : `${testConfig.name.toUpperCase()} PASSED! ${tierProgress}/10 ${tierName} tests complete. +${creditsReward} cr`;
      this.callbacks.onLicenseProgressChange?.(this.licenseProgress, this.hasLicense);
    } else if (this.activeMode === 'tutorial') {
      creditsReward = 200;
      message = 'TUTORIAL COMPLETED! You learned how to drive. +200 cr';
    } else if (this.activeMode === 'race') {
      const trackConfig = TRACKS_DATABASE.find(t => t.id === this.activeTrackId) || TRACKS_DATABASE[1];
      const baseReward = trackConfig.baseReward !== undefined ? trackConfig.baseReward : 300;

      const placeText = place === 1 ? '1st PLACE' : (place === 2 ? '2nd PLACE' : place === 3 ? '3rd PLACE' : `${place}th PLACE`);

      if (this.isQuickPlayRace) {
        creditsReward = 0;
      } else if (place === 1) {
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
      message = this.isQuickPlayRace
        ? `${placeText}! Completed circuit in ${formattedTime}. (Quick Play - No Prize)`
        : `${placeText}! Completed circuit in ${formattedTime}. +${creditsReward} cr`;
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

  public triggerCheckpointFlash() {
    this.checkpointFlash = 1.0;
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
      emergencyBrakePressed: false,
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

    // Decay checkpoint flash intensity
    this.checkpointFlash = Math.max(0.0, this.checkpointFlash - deltaTime * 2.2);

    // Smoothly transition camera progress based on tuningState
    if (this.tuningState === 'entering' || this.tuningState === 'open') {
      this.tuningCameraProgress = Math.min(1.0, this.tuningCameraProgress + deltaTime * 2.0);
    } else {
      this.tuningCameraProgress = Math.max(0.0, this.tuningCameraProgress - deltaTime * 2.0);
    }

    if (!this.isPaused) {
      // 1. Delegate tick to active mode instance
      if (this.currentModeInstance) {
        this.currentModeInstance.update(deltaTime);
        if (this.vehicle.fuelTowRequired) {
          this.currentModeInstance.handleFuelTow();
          this.vehicle.fuelTowRequired = false;
        }
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
    const displaySpeed = Math.round(
      Math.hypot(this.vehicle.velocityX, this.vehicle.velocityZ) * 3.6
    );
    this.callbacks.onSpeedChange(displaySpeed);
    if (this.activeMode === 'race' || this.activeMode === 'license') {
      const advice = this.gameStatus === 'playing'
        ? this.suggestedGearAdvisor.getAdvice(this.vehicle, displaySpeed)
        : null;
      this.callbacks.onSuggestedGearChange?.(advice);
    } else {
      this.callbacks.onSuggestedGearChange?.(null);
    }
    if (this.callbacks.onVehicleStatsChange) {
      this.callbacks.onVehicleStatsChange(
        displaySpeed,
        Math.round(this.vehicle.rpm),
        this.vehicle.currentGear,
        this.vehicle.isShifting,
        this.vehicle.throttleInput,
        this.vehicle.brakeInput,
        this.vehicle.fuelLiters,
        this.vehicle.fuelCapacityLiters,
        this.vehicle.fuelConsumptionLitersPerHour,
        this.vehicle.isEngineStalled,
        this.vehicle.tireState.wear,
        this.vehicle.tireState.temperature,
        this.vehicle.tireState.compound,
        this.vehicle.tireWearEnabled
      );
    }

    if (this.activeMode === 'race' && this.currentModeInstance instanceof RaceMode) {
      const raceMode = this.currentModeInstance as RaceMode;
      if (this.callbacks.onRaceTimeUpdate) {
        this.callbacks.onRaceTimeUpdate(
          raceMode.raceTime,
          raceMode.bestLapTime,
          raceMode.getCurrentLapTime(),
          raceMode.isWrongWay,
          raceMode.isCheat
        );
      }
    }

    // 3. Smooth Camera chase tracking
    if (!this.isPaused) {
      this.updateCameraChase(deltaTime);
    }

    // Update Post-processing uniforms
    if (this.postProcessing) {
      const isDrifting = this.vehicle ? this.vehicle.isDrifting : false;
      const driftPoints = this.driftAccumulatedPoints;
      // Boost flame visual is active if accelerating (throttle > 0.5) and speed is above 35 km/h
      const isBoosting = this.vehicle ? (this.keys['w'] || this.keys['arrowup']) && displaySpeed > 35 : false;
      this.postProcessing.update(deltaTime, displaySpeed, isDrifting, driftPoints, isBoosting, this.checkpointFlash);
    }

    // 4. Render
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.renderer.setViewport(0, 0, width, height);
    this.renderer.setScissor(0, 0, width, height);
    this.renderer.setScissorTest(false);

    if (this.postProcessing) {
      this.postProcessing.render(deltaTime);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

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
      this.camera.up.set(0, 1, 0);

      // Calculate dynamic dimensions of the vehicle to position camera correctly
      const box = new THREE.Box3().setFromObject(this.vehicle.mesh);
      const size = box.getSize(new THREE.Vector3());
      const carLength = size.z > 0.5 ? size.z : 4.8;
      const carHeight = size.y > 0.5 ? size.y : 1.2;

      const aspect = this.camera.aspect;
      let zoomFactor = 1.0;
      if (aspect < 1) {
        zoomFactor = Math.min(1.8, 1.0 / aspect);
      }

      // Initialize base tuning camera position / radius
      if (!this.tuningRadiusInitialized || this.prevCarLength !== carLength) {
        this.tuningRadius = (carLength * 1.4);
        this.tuningTheta = 0; // Front view by default
        this.tuningPhi = 0.2; // Slightly elevated front view
        this.tuningRadiusInitialized = true;
        this.prevCarLength = carLength;
      }

      const activeRadius = this.tuningRadius * zoomFactor;

      if ((this as any).isQuickPlayCarSelect && !(this as any).isQuickPlayCarInteractable) {
        this.tuningTheta = -Math.PI / 4;
        this.tuningPhi = 1.25;
      } else if (!this.isPointerDown && this.tuningState === 'closed') {
        // Auto turntable spin when not dragging in main garage
        this.tuningTheta += 0.25 * deltaTime;
      }

      // Calculate position in spherical coordinates centered around (0, carHeight * 0.4, 0)
      const targetX = Math.sin(this.tuningTheta) * Math.cos(this.tuningPhi) * activeRadius;
      const targetY = (carHeight * 0.4) + Math.sin(this.tuningPhi) * activeRadius;
      const targetZ = Math.cos(this.tuningTheta) * Math.cos(this.tuningPhi) * activeRadius;

      this.camera.position.set(targetX, targetY, targetZ);
      this.camera.lookAt(0, carHeight * 0.4, 0);
    } else {
      if (this.cameraViewMode === 'tv') {
        this.updateTvCamera(deltaTime);
      } else if (this.cameraViewMode === 'driver') {
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

  private updateTvCamera(deltaTime: number): void {
    this.tvCameraTime += deltaTime;
    this.camera.up.set(0, 1, 0);

    const raceMode = this.currentModeInstance instanceof RaceMode
      ? this.currentModeInstance
      : null;
    const replayTargets = raceMode?.getReplayTargets() ?? [];
    if (replayTargets.length > 0) {
      this.replayTargetIndex = Math.max(
        0,
        Math.min(this.replayTargetIndex, replayTargets.length - 1)
      );
    }
    const selectedTarget = replayTargets[this.replayTargetIndex];
    const subject = selectedTarget?.vehicle ?? this.vehicle;
    const rivals = replayTargets
      .filter((_, index) => index !== this.replayTargetIndex)
      .map(target => target.vehicle);

    if (this.replayDirector.update(deltaTime, subject, rivals, this.camera)) {
      return;
    }

    // No usable course data (a replay outside a race). Fall back to a slow orbit
    // rather than leaving the camera wherever it was parked.
    const orbit = this.tvCameraTime * 0.35;
    const desiredPosition = subject.pos
      .clone()
      .add(new THREE.Vector3(Math.sin(orbit) * 11, 4.2, Math.cos(orbit) * 11));
    const target = subject.pos.clone();
    target.y += 0.7;
    this.camera.position.lerp(desiredPosition, 1 - Math.exp(-4 * Math.max(deltaTime, 0)));
    this.camera.lookAt(target);
    if (Math.abs(this.camera.fov - this.replayBaseFov) > 0.01) {
      this.camera.fov = this.replayBaseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (this.activeMode !== 'garage') return;

    // Only capture if the click target is the canvas itself, not UI elements on top
    if (e.target !== this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      this.isPointerDown = true;
      this.prevPointerX = e.clientX;
      this.prevPointerY = e.clientY;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch (err) { }
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.isPointerDown || this.activeMode !== 'garage') return;

    const deltaX = e.clientX - this.prevPointerX;
    const deltaY = e.clientY - this.prevPointerY;

    this.prevPointerX = e.clientX;
    this.prevPointerY = e.clientY;

    this.tuningTheta -= deltaX * 0.005;
    this.tuningPhi = Math.max(0.02, Math.min(Math.PI / 2.2, this.tuningPhi + deltaY * 0.005));
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (this.isPointerDown) {
      this.isPointerDown = false;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch (err) { }
    }
  };

  private handleWheel = (e: WheelEvent) => {
    if (this.activeMode !== 'garage') return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      e.preventDefault();

      const zoomAmount = e.deltaY * 0.005;

      const box = new THREE.Box3().setFromObject(this.vehicle.mesh);
      const size = box.getSize(new THREE.Vector3());
      const carLength = size.z > 0.5 ? size.z : 4.8;

      const minRadius = carLength * 0.4;
      const maxRadius = carLength * 2.5;

      this.tuningRadius = Math.max(minRadius, Math.min(maxRadius, this.tuningRadius + zoomAmount * carLength * 0.1));
    }
  };

  public destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.resetGameplayTimer();

    if (this.inputController) {
      this.inputController.disconnect();
    }

    window.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('wheel', this.handleWheel);

    window.removeEventListener('resize', this.handleResize);

    if (this.currentModeInstance) {
      this.currentModeInstance.cleanup();
    }

    disposeSceneObjects(this.scene);
    this.renderer.dispose();
  }
}
