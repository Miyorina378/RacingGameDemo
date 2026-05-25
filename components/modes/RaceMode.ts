import * as THREE from 'three';
import { BaseMode } from './BaseMode';
import { Checkpoint } from '../objects/Checkpoint';
import { Obstacle } from '../objects/Obstacle';
import { TRACKS_DATABASE } from '../config/TrackDatabase';
import { Vehicle } from '../objects/Vehicle';
import { RacingAI } from '../objects/RacingAI';
import { CARS_DATABASE } from '../config/CarDatabase';
import { GameEngine } from '../gameEngine';
import { ParticleSystem } from '../objects/ParticleSystem';

export class RaceMode extends BaseMode {
  public checkpoints: Checkpoint[] = [];
  public activeCheckpointIndex = 0;
  private obstacles: Obstacle[] = [];
  private trackId: string;
  private startPos = new THREE.Vector3();
  private startYaw = 0;
  private visitedIndices: Set<number> = new Set();
  private currentLap = 1;
  private totalLaps = 3;
  private playerPathIndex = 1;
  private playerCheckpointsPassed = 0;
  public raceTime = 0;
  public lapStartTimes: number[] = [0, 0];
  public bestLapTime = Infinity;
  private densePath: THREE.Vector3[] = [];
  private aiCars: {
    vehicle: Vehicle;
    ai: RacingAI;
    currentPathIndex: number;
    speed: number;
    checkpointsPassed: number;
    config: { carId: string; color: string; speedFactor: number; name: string };
    finishTime?: number;
    lateralOffset: number;
  }[] = [];

  constructor(
    engine: GameEngine,
    scene: THREE.Scene,
    vehicle: Vehicle,
    particles: ParticleSystem,
    environmentGroup: THREE.Group,
    keys: { [key: string]: boolean },
    trackId: string = 'sprint_circuit'
  ) {
    super(engine, scene, vehicle, particles, environmentGroup, keys);
    this.trackId = trackId;
  }

  public resetVehicle() {
    this.vehicle.reset(this.startPos, this.startYaw);
  }

  public init() {
    this.clearEnvironment();
    this.particles.clear();
    this.raceTime = 0;
    this.lapStartTimes = [0, 0];
    this.bestLapTime = Infinity;

    // Clean up any existing AI cars from the scene to prevent duplicates
    this.aiCars.forEach(ai => {
      this.scene.remove(ai.vehicle.mesh);
    });
    this.aiCars = [];
    
    // Find track configuration in database
    const trackConfig = TRACKS_DATABASE.find(t => t.id === this.trackId) || TRACKS_DATABASE[1];
    const path = trackConfig.path;

    // Position car at the first marker facing the second marker
    const startPt = path[0];
    const nextPt = path[1] || path[0];
    
    const diff = new THREE.Vector3().subVectors(nextPt, startPt);
    this.startYaw = Math.atan2(diff.x, diff.z);

    const forwardVec = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.startYaw).normalize();
    const rightVec = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.startYaw - Math.PI / 2).normalize();

    // Generate smooth dense path for AI tracking
    const roadPoints = path.map(p => new THREE.Vector3(p.x, 0.5, p.z));
    const aiCurve = new THREE.CatmullRomCurve3(roadPoints, true);
    this.densePath = aiCurve.getSpacedPoints(250);

    // Spawn AI Opponents (Carbon Genesis, Sentinel Cruiser, Volt Interceptor, Neon Cruiser, Rogue Runner)
    const aiConfigs = [
      { carId: 'genesis', color: '#1e293b', speedFactor: 0.95, name: 'Chevrolet Carbon Genesis', lateralOffset: -3.5 },
      { carId: 'sentinel', color: '#8b5cf6', speedFactor: 0.90, name: 'Tesla Sentinel Cruiser', lateralOffset: 3.5 },
      { carId: 'sport', color: '#06b6d4', speedFactor: 0.86, name: 'Nissan Volt Interceptor', lateralOffset: -1.2 },
      { carId: 'neon_cruiser', color: '#eab308', speedFactor: 0.80, name: 'Nissan Neon Cruiser', lateralOffset: 1.2 },
      { carId: 'rogue_runner', color: '#22c55e', speedFactor: 0.74, name: 'Ford Rogue Runner', lateralOffset: 0.0 }
    ];

    this.aiCars = aiConfigs.map(cfg => {
      const vehicle = new Vehicle(cfg.carId, cfg.color);
      const ai = new RacingAI(vehicle, this.densePath, cfg.speedFactor, cfg.lateralOffset);
      return {
        vehicle,
        ai,
        currentPathIndex: 1,
        speed: 0,
        checkpointsPassed: 0,
        config: { carId: cfg.carId, color: cfg.color, speedFactor: cfg.speedFactor, name: cfg.name },
        lateralOffset: cfg.lateralOffset
      };
    });

    // Assign ground height callbacks for AI vehicles
    this.aiCars.forEach(ai => {
      ai.vehicle.getGroundHeight = (x: number, z: number) => this.getGroundHeight(x, z);
    });

    // Position AI opponents on grid spots 0, 1, 2, 3, 4 (staggered pole position)
    for (let i = 0; i < this.aiCars.length; i++) {
      const gridIdx = i; // 0 to 4
      const sideOffset = (gridIdx % 2 === 0) ? -2.2 : 2.2;
      const forwardOffset = gridIdx * -8;
      
      const aiPos = new THREE.Vector3().copy(startPt)
        .addScaledVector(rightVec, sideOffset)
        .addScaledVector(forwardVec, forwardOffset);
      aiPos.y = 0.5;
      
      this.aiCars[i].vehicle.reset(aiPos, this.startYaw);
      this.scene.add(this.aiCars[i].vehicle.mesh);
    }

    // Position player at Grid Spot 5 (6th place: 40m behind startPt, offset right)
    const playerSideOffset = (5 % 2 === 0) ? -2.2 : 2.2;
    const playerForwardOffset = 5 * -8;

    this.startPos.copy(startPt)
      .addScaledVector(rightVec, playerSideOffset)
      .addScaledVector(forwardVec, playerForwardOffset);
    this.startPos.y = 0.5; // car height on ground

    this.vehicle.reset(this.startPos, this.startYaw);

    this.createGridFloor();

    // Build checkpoint rings (only the start/finish checkpoint is created)
    this.checkpoints = [];

    // Start/finish checkpoint at path[0] at the end of the race
    const finishCheckpoint = new Checkpoint(
      path[0],
      0, // index 0 in checkpoints list
      path[1],
      false, // starts inactive
      true,  // is a race track
      trackConfig.roadWidth / 2 // Make it as big as the road
    );
    // Keep the start/finish checkpoint visible from the beginning as a physical race gate
    this.environmentGroup.add(finishCheckpoint.mesh);
    this.checkpoints.push(finishCheckpoint);

    // Create visual road mesh with curbs and fences
    this.createRacetrackRoad(path, trackConfig.roadWidth, trackConfig.HaveCrub, trackConfig.HaveFence, trackConfig.FenceType || 'guardrail', trackConfig.HaveGrass, trackConfig.GrassWidth);

    // Sync guardrail, track info, and grass callbacks for all AI vehicles and their AI controllers
    const grassCallback = (x: number, z: number) => {
      if (!trackConfig.HaveGrass) return false;
      const info = this.getTrackInfo(x, z);
      const grassStart = trackConfig.roadWidth / 2 + (trackConfig.HaveCrub ? this.curbWidth : 0);
      return info.dist >= grassStart && info.dist < this.trackBoundary;
    };
    const trackInfoCallback = (x: number, z: number) => this.getTrackInfo(x, z);

    this.aiCars.forEach(aiCar => {
      aiCar.vehicle.haveFence = trackConfig.HaveFence;
      aiCar.vehicle.trackBoundary = this.trackBoundary;
      aiCar.vehicle.getTrackInfo = trackInfoCallback;
      aiCar.vehicle.isOnGrass = grassCallback;
      aiCar.vehicle.onFenceCollision = (contactPt: THREE.Vector3) => {
        this.particles.emitSparks(1, contactPt, 0xffaa00);
      };

      // Wire up RacingAI awareness callbacks
      aiCar.ai.getTrackInfo = trackInfoCallback;
      aiCar.ai.isOnGrass = grassCallback;
      aiCar.ai.trackBoundary = this.trackBoundary;
      aiCar.ai.obstacles = this.obstacles;
    });

    // Spawn obstacles (Cylinder warning cones) on high-tier race track
    this.obstacles = [];
    if (trackConfig.hasObstacles) {
      for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i+1];
        
        // Spawn mid-way between checkpoints, offset slightly randomly
        const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const spawnPos = new THREE.Vector3(
          midPoint.x + (Math.random() - 0.5) * 8,
          0,
          midPoint.z + (Math.random() - 0.5) * 8
        );

        const obstacle = new Obstacle(spawnPos, false);
        this.environmentGroup.add(obstacle.mesh);
        this.obstacles.push(obstacle);
      }
    }

    this.activeCheckpointIndex = 0;
    this.currentLap = 1;
    this.playerPathIndex = 1;
    this.playerCheckpointsPassed = 0;
    this.engine.callbacks.onCheckpointChange(this.currentLap, this.totalLaps);

    // Start countdown
    this.engine.startCountdown(trackConfig.timeLimit);
  }

  public update(deltaTime: number) {
    this.updateScrollingFloor();
    this.updateGrass(deltaTime);

    const isCountdown = this.engine.gameStatus === 'countdown';
    const isPlaying = this.engine.gameStatus === 'playing';

    if (isPlaying) {
      this.raceTime += deltaTime;
    }

    this.vehicle.update(deltaTime, this.keys, isCountdown);

    // Update AI Opponent Cars
    this.aiCars.forEach(ai => {
      // Sync speed property with vehicle speed
      ai.speed = ai.vehicle.speed;

      if (isCountdown) {
        // Just call vehicle update in countdown mode (which copies pos/yaw and does nothing else)
        ai.vehicle.update(deltaTime, {}, true);
        this.particles.emitBoosters(ai.vehicle.mesh.matrixWorld, ai.vehicle.yaw, 0, ai.vehicle.boosterColor);
        return;
      }

      // If playing or finished:
      const trackConfig = TRACKS_DATABASE.find(t => t.id === this.trackId) || TRACKS_DATABASE[1];
      const path = trackConfig.path;

      // Has this AI finished?
      const hasFinished = ai.checkpointsPassed >= path.length * this.totalLaps;

      if (hasFinished) {
        if (ai.finishTime === undefined) {
          ai.finishTime = this.raceTime;
        }
        // Braking to stop after finishing
        ai.vehicle.update(deltaTime, { reverseAnalog: 0.5 });
        ai.speed = ai.vehicle.speed;
      } else {
        // GT-style AI: compute simulated inputs via RacingAI controller
        const aiKeys = ai.ai.computeInputs(deltaTime);

        // Apply physics update with AI-generated inputs
        ai.vehicle.update(deltaTime, aiKeys);
        ai.speed = ai.vehicle.speed;

        // Check if we passed the sparse checkpoint (distance to checkpoint < checkpoint radius)
        const currentSparseCheckpoint = path[ai.currentPathIndex];
        const distToSparseCheckpoint = ai.vehicle.pos.distanceTo(currentSparseCheckpoint);
        if (distToSparseCheckpoint < 20) {
          ai.currentPathIndex = (ai.currentPathIndex + 1) % path.length;
          ai.checkpointsPassed++;
        }
      }

      // Emit boosters if going fast
      if (ai.vehicle.speed > 20) {
        this.particles.emitBoosters(ai.vehicle.mesh.matrixWorld, ai.vehicle.yaw, ai.vehicle.speed, ai.vehicle.boosterColor);
      }

      // Collision detection with player
      const distToPlayer = ai.vehicle.pos.distanceTo(this.vehicle.pos);
      if (isPlaying && distToPlayer < 2.6) {
        // Collision response: push apart
        const collisionVec = new THREE.Vector3().subVectors(this.vehicle.pos, ai.vehicle.pos);
        collisionVec.y = 0; // lock to 2D
        if (collisionVec.lengthSq() < 0.01) {
          collisionVec.set(1, 0, 0); // avoid division by zero
        }
        collisionVec.normalize();

        // Push intensity
        const pushForce = 4.0;
        
        // Repel player and AI
        this.vehicle.pos.addScaledVector(collisionVec, pushForce * deltaTime);
        ai.vehicle.pos.addScaledVector(collisionVec, -pushForce * deltaTime);

        // Reduce speed slightly
        this.vehicle.speed *= 0.85;
        ai.vehicle.speed *= 0.85;
        ai.speed = ai.vehicle.speed;

        // Visual Spark particles on the contact point
        const contactPoint = new THREE.Vector3().addVectors(this.vehicle.pos, ai.vehicle.pos).multiplyScalar(0.5);
        this.particles.emitSparks(8, contactPoint, 0xffaa00);
      }

      // Collision detection between AI cars
      this.aiCars.forEach(otherAi => {
        if (ai !== otherAi) {
          const distToOther = ai.vehicle.pos.distanceTo(otherAi.vehicle.pos);
          if (distToOther < 2.6) {
            const collisionVec = new THREE.Vector3().subVectors(ai.vehicle.pos, otherAi.vehicle.pos);
            collisionVec.y = 0;
            if (collisionVec.lengthSq() < 0.01) {
              collisionVec.set(1, 0, 0);
            }
            collisionVec.normalize();

            const pushForce = 3.0;
            ai.vehicle.pos.addScaledVector(collisionVec, pushForce * deltaTime);
            otherAi.vehicle.pos.addScaledVector(collisionVec, -pushForce * deltaTime);

            ai.vehicle.speed *= 0.9;
            otherAi.vehicle.speed *= 0.9;
            ai.speed = ai.vehicle.speed;
            otherAi.speed = otherAi.vehicle.speed;

            const contactPoint = new THREE.Vector3().addVectors(ai.vehicle.pos, otherAi.vehicle.pos).multiplyScalar(0.5);
            this.particles.emitSparks(4, contactPoint, 0xffaa00);
          }
        }
      });
    });

    if (isCountdown) {
      this.particles.emitBoosters(this.vehicle.mesh.matrixWorld, this.vehicle.yaw, this.vehicle.speed, this.vehicle.boosterColor);
      this.particles.update(deltaTime);
      return;
    }

    // Drifting tire smoke
    if (this.vehicle.isDrifting) {
      this.particles.emitSmoke(this.vehicle.mesh.matrixWorld);
    }
    
    // Boosters fire at speed
    if (Math.abs(this.vehicle.speed) > 20 && (this.keys['w'] || this.keys['arrowup'])) {
      this.particles.emitBoosters(this.vehicle.mesh.matrixWorld, this.vehicle.yaw, this.vehicle.speed, this.vehicle.boosterColor);
    }
    this.particles.update(deltaTime);

    // Track player progress along track nodes and collide checkpoints
    if (isPlaying) {
      const trackConfig = TRACKS_DATABASE.find(t => t.id === this.trackId) || TRACKS_DATABASE[1];
      const path = trackConfig.path;

      // Collide with finish checkpoint when player is targeting it (path[0])
      const finishCheckpoint = this.checkpoints[0];
      if (finishCheckpoint && this.playerPathIndex === 0) {
        const finishRadius = Math.max(22, trackConfig.roadWidth * 1.25);
        const distToFinish = this.vehicle.pos.distanceTo(finishCheckpoint.pos);
        if (distToFinish < finishRadius) {
          finishCheckpoint.markPassed();
          this.particles.emitSparks(25, finishCheckpoint.pos, 0x00ff00);
          
          // Calculate and track lap times
          const currentLapTime = this.raceTime - this.lapStartTimes[this.currentLap];
          if (currentLapTime < this.bestLapTime) {
            this.bestLapTime = currentLapTime;
          }
          this.lapStartTimes[this.currentLap + 1] = this.raceTime;

          this.currentLap++;
          this.playerCheckpointsPassed++;
          
          if (this.currentLap > this.totalLaps) {
            const finishedAICount = this.aiCars.filter(ai => ai.checkpointsPassed >= path.length * this.totalLaps).length;
            const placement = finishedAICount + 1;
            
            // Build standings results
            const playerCarName = CARS_DATABASE.find(c => c.id === this.vehicle.carId)?.name || 'Hatchback-X';
            const playerResult = {
              pos: placement,
              name: 'You',
              car: playerCarName,
              time: this.raceTime,
              isPlayer: true
            };

            const playerTotalCheckpoints = path.length * this.totalLaps;
            const aiResults = this.aiCars.map(ai => {
              let finalTime = ai.finishTime;
              if (finalTime === undefined) {
                // Calculate projected time for unfinished AI
                const aiNextPt = path[ai.currentPathIndex];
                const aiDistToNext = ai.vehicle.pos.distanceTo(aiNextPt);
                const aiProgress = ai.checkpointsPassed - (aiDistToNext / 10000);
                
                const playerTimePerCp = this.raceTime / playerTotalCheckpoints;
                const remainingCp = Math.max(0, playerTotalCheckpoints - aiProgress);
                finalTime = this.raceTime + remainingCp * (playerTimePerCp / ai.config.speedFactor);
              }
              
              return {
                pos: 0,
                name: ai.config.name,
                car: ai.config.name,
                time: finalTime,
                isPlayer: false
              };
            });

            // Sort all by time
            const allResults = [playerResult, ...aiResults];
            allResults.sort((a, b) => a.time - b.time);
            
            // Assign positions
            allResults.forEach((res, idx) => {
              res.pos = idx + 1;
            });

            this.engine.handleSuccess(placement, allResults);
          } else {
            this.playerPathIndex = 1;
            finishCheckpoint.deactivate();
            this.engine.callbacks.onCheckpointChange(this.currentLap, this.totalLaps);
          }
        }
      }

      const nextTargetPt = path[this.playerPathIndex];
      const distToNext = this.vehicle.pos.distanceTo(nextTargetPt);
      
      // If player is close to their next target node, advance the target index (only if they aren't targeting the finish line)
      const detectionRadius = Math.max(22, trackConfig.roadWidth * 1.25);
      if (this.playerPathIndex !== 0) {
        if (distToNext < detectionRadius) {
          this.playerPathIndex = (this.playerPathIndex + 1) % path.length;
          this.playerCheckpointsPassed++;
          
          // If the player is now targeting path[0] (which is the finish line),
          // we activate the start/finish checkpoint to show it is active (neon green).
          if (this.playerPathIndex === 0) {
            const finishCheckpoint = this.checkpoints[0];
            if (finishCheckpoint) {
              finishCheckpoint.activate();
            }
          }
        }
      }

      // Calculate real-time placement (Player + AI opponents)
      const playerNextPt = path[this.playerPathIndex];
      const playerDistToNext = this.vehicle.pos.distanceTo(playerNextPt);
      const playerProgress = this.playerCheckpointsPassed - (playerDistToNext / 10000);

      const aiProgresses = this.aiCars.map(ai => {
        const aiNextPt = path[ai.currentPathIndex];
        const aiDistToNext = ai.vehicle.pos.distanceTo(aiNextPt);
        const aiProgress = ai.checkpointsPassed - (aiDistToNext / 10000);
        return { progress: aiProgress };
      });

      const allParticipants = [
        { isPlayer: true, progress: playerProgress },
        ...aiProgresses.map(ai => ({ isPlayer: false, progress: ai.progress }))
      ];
      allParticipants.sort((a, b) => b.progress - a.progress);

      const playerPlacement = allParticipants.findIndex(p => p.isPlayer) + 1;

      // Update position HUD in React
      if (this.engine.callbacks.onPlacementChange) {
        this.engine.callbacks.onPlacementChange(playerPlacement, this.aiCars.length + 1);
      }
    }

    // Obstacle crash collision detection
    if (isPlaying) {
      for (const obstacle of this.obstacles) {
        if (obstacle.checkCollision(this.vehicle.pos)) {
          this.triggerCrash();
          break;
        }
      }
    }
  }

  private triggerCrash() {
    this.vehicle.speed = -5; // Bounce velocity
    this.particles.emitSparks(35, this.vehicle.pos, 0xff0000); // Big orange-red explosion
    
    // Shake coordinates slightly
    this.vehicle.pos.x += (Math.random() - 0.5) * 2;
    this.vehicle.pos.z += (Math.random() - 0.5) * 2;
    this.vehicle.mesh.position.copy(this.vehicle.pos);
 
    this.engine.triggerCrash('CRASHED! VEHICLE DESTROYED.');
  }

  public getCurrentLapTime(): number {
    if (this.currentLap > this.totalLaps) return 0; // finished
    return this.raceTime - (this.lapStartTimes[this.currentLap] || 0);
  }

  public cleanup() {
    this.clearEnvironment();
    this.checkpoints.forEach(cp => this.scene.remove(cp.mesh));
    this.obstacles.forEach(ob => this.scene.remove(ob.mesh));
    this.checkpoints = [];
    this.obstacles = [];

    // Clean up AI vehicles
    this.aiCars.forEach(ai => {
      this.scene.remove(ai.vehicle.mesh);
    });
    this.aiCars = [];
  }

  public reset() {
    this.init();
  }
}
