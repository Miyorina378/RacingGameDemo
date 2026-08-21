import * as THREE from 'three';
import { BaseMode } from './BaseMode';
import { Checkpoint } from '../objects/Checkpoint';
import { DEFAULT_LICENSE_TEST_ID, getLicenseTestById } from '../config/LicenseDatabase';
import { GameEngine } from '../gameEngine';
import { Vehicle } from '../objects/Vehicle';
import { ParticleSystem } from '../objects/ParticleSystem';

export class LicenseMode extends BaseMode {
  public checkpoints: Checkpoint[] = [];
  public activeCheckpointIndex = 0;

  private pathVectors: THREE.Vector3[] = [];
  private startPos = new THREE.Vector3();
  private startYaw = 0;
  private licenseTestId: string;

  constructor(
    engine: GameEngine,
    scene: THREE.Scene,
    vehicle: Vehicle,
    particles: ParticleSystem,
    environmentGroup: THREE.Group,
    keys: { [key: string]: boolean },
    licenseTestId: string = DEFAULT_LICENSE_TEST_ID
  ) {
    super(engine, scene, vehicle, particles, environmentGroup, keys);
    this.licenseTestId = licenseTestId;
  }

  public resetVehicle() {
    this.vehicle.reset(this.startPos, this.startYaw);
  }

  public init() {
    this.clearEnvironment();
    this.particles.clear();
    
    const trackConfig = getLicenseTestById(this.licenseTestId);
    if (!trackConfig) {
      throw new Error("License test config not found in LicenseDatabase.");
    }
    this.pathVectors = trackConfig.path.map(p => p instanceof THREE.Vector3 ? p : p.pos);

    // Position car at the first marker facing the second marker
    const startPt = this.pathVectors[0];
    const nextPt = this.pathVectors[1] || this.pathVectors[0];
    this.startPos.copy(startPt);
    const diff = new THREE.Vector3().subVectors(nextPt, startPt);
    this.startYaw = Math.atan2(diff.x, diff.z);

    this.createGridFloor();

    // The road has to exist before the car is placed on it: the start height comes
    // from the surface, not from a hardcoded 0.5 that only matched a track sitting
    // at that exact elevation.
    this.createTerrain(trackConfig, trackConfig.time);
    this.createRacetrackRoad(trackConfig);
    this.createScenery(trackConfig.scenery, trackConfig.time);

    this.startPos.y = this.getGroundHeight(this.startPos.x, this.startPos.z, startPt.y);
    this.vehicle.reset(this.startPos, this.startYaw);

    // Create sequentially linked checkpoint entities
    this.checkpoints = [];
    
    // Checkpoints at indices 1 to N-1
    for (let i = 1; i < this.pathVectors.length; i++) {
      const pt = this.pathVectors[i];
      const nextPt = this.pathVectors[i + 1] || this.pathVectors[0];
      const checkpoint = new Checkpoint(
        pt, 
        i - 1, 
        nextPt, 
        i === 1, // path[1] starts active
        false    // is not a race track (uses standard license colors)
      );
      this.environmentGroup.add(checkpoint.mesh);
      this.checkpoints.push(checkpoint);
    }

    // Start/finish checkpoint at path[0] at the end of the race
    const finishCheckpoint = new Checkpoint(
      this.pathVectors[0],
      this.pathVectors.length - 1,
      this.pathVectors[1],
      false, // starts inactive
      false  // is not a race track
    );
    finishCheckpoint.mesh.visible = false; // Hide initially
    this.environmentGroup.add(finishCheckpoint.mesh);
    this.checkpoints.push(finishCheckpoint);

    this.activeCheckpointIndex = 0;
    this.engine.callbacks.onCheckpointChange(0, this.checkpoints.length);
    
    // Delegate countdown and timer limit tracking to engine facade using database value
    this.engine.startCountdown(trackConfig.timeLimit);
  }

  public update(deltaTime: number) {
    this.updateScrollingFloor();
    this.updateGrass(deltaTime);
    
    // Update checkpoint rings (hologram scrolls and float animations)
    this.checkpoints.forEach(cp => cp.update(deltaTime));

    // Movement: Freeze movement during countdown phase
    const isCountdown = this.engine.gameStatus === 'countdown';
    this.vehicle.update(deltaTime, this.keys, isCountdown);

    if (isCountdown) {
      // Just emit idle exhaust boosters
      this.particles.emitBoosters(this.vehicle.mesh.matrixWorld, this.vehicle.yaw, this.vehicle.speed, this.vehicle.boosterColor);
      this.particles.update(deltaTime);
      return;
    }

    // Drifting tire smoke
    if (this.vehicle.isDrifting) {
      this.particles.emitSmoke(this.vehicle.mesh.matrixWorld);
    }
    
    // Speed exhaust booster flames
    if (Math.abs(this.vehicle.speed) > 5.6 && (this.keys['w'] || this.keys['arrowup'])) {
      this.particles.emitBoosters(this.vehicle.mesh.matrixWorld, this.vehicle.yaw, this.vehicle.speed, this.vehicle.boosterColor);
    }
    this.particles.update(deltaTime);

    // Collide checkpoints
    if (this.engine.gameStatus === 'playing') {
      const currentCheckpoint = this.checkpoints[this.activeCheckpointIndex];
      if (currentCheckpoint && currentCheckpoint.checkCollection(this.vehicle.pos)) {
        // Explode checkpoint activation sparks
        this.particles.emitSparks(12, currentCheckpoint.pos, 0x00ffff);
        this.engine.triggerCheckpointFlash();
        
        this.activeCheckpointIndex++;
        
        if (this.activeCheckpointIndex >= this.checkpoints.length) {
          // Passed all gates!
          this.engine.handleSuccess();
        } else {
          // Highlight next checkpoint ring
          this.checkpoints[this.activeCheckpointIndex].activate();
          this.engine.callbacks.onCheckpointChange(this.activeCheckpointIndex, this.checkpoints.length);
        }
      }
    }
  }

  public cleanup() {
    this.clearEnvironment();
    this.checkpoints.forEach(cp => this.scene.remove(cp.mesh));
    this.checkpoints = [];
  }

  public reset() {
    this.init();
  }
}
