import * as THREE from 'three';
import { BaseMode } from './BaseMode';
import { Checkpoint } from '../objects/Checkpoint';
import { Obstacle } from '../objects/Obstacle';
import { TRACKS_DATABASE, TrackNode } from '../config/TrackDatabase';
import { Vehicle } from '../objects/Vehicle';
import { RacingAI } from '../objects/RacingAI';
import { CARS_DATABASE } from '../config/CarDatabase';
import { GameEngine } from '../gameEngine';
import { ParticleSystem } from '../objects/ParticleSystem';
import { buildCenterline } from './centerline';
import { resolveTrackNodes } from './trackNodes';
import type { ReplayCameraTrack } from '../engine/ReplayCameraDirector';
import type { DrivingMode } from '../option';

const isTrackVector = (point: THREE.Vector3 | TrackNode): point is THREE.Vector3 =>
  point instanceof THREE.Vector3 || 'isVector3' in point;

export type RaceDifficulty = 'easy' | 'normal' | 'hard' | 'veryHard';

export interface RaceOptions {
  totalLaps?: number;
  difficulty?: RaceDifficulty;
  drivingMode?: DrivingMode;
  opponentCount?: number;
}

export interface ReplayTarget {
  vehicle: Vehicle;
  name: string;
  isPlayer: boolean;
}

const DIFFICULTY_SPEED_MULTIPLIER: Record<RaceDifficulty, number> = {
  easy: 0.84,
  normal: 1,
  hard: 1.12,
  veryHard: 1.24
};

interface ReplayTransform {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  isGrounded: boolean;
}

/** Compact transform stored for every vehicle at a replay sample. */
export type RaceReplayTransform = [
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
  speed: number,
  grounded: number
];

export interface RaceReplayFrame {
  player: RaceReplayTransform;
  opponents: RaceReplayTransform[];
}

export interface RaceReplayExport {
  format: 'cyberdrive-race-replay';
  version: 1;
  trackId: string;
  carId: string;
  totalLaps: number;
  sampleInterval: number;
  duration: number;
  frameCount: number;
  opponents: Array<{
    carId: string;
    color: string;
    name: string;
  }>;
  frames: RaceReplayFrame[];
}

export class RaceMode extends BaseMode {
  public checkpoints: Checkpoint[] = [];
  public activeCheckpointIndex = 0;
  private obstacles: Obstacle[] = [];
  private trackId: string;
  private difficulty: RaceDifficulty;
  private drivingMode: DrivingMode;
  private opponentCount = 5;
  private startPos = new THREE.Vector3();
  private startYaw = 0;
  private visitedIndices: Set<number> = new Set();
  private currentLap = 1;
  private totalLaps = 3;
  private hasQualifiedForLap = false;
  public isWrongWay = false;
  public isCheat = false;
  private wrongWayTimer = 0;
  public raceTime = 0;
  public lapStartTimes: number[] = [0, 0];
  public bestLapTime = Infinity;
  private densePath: THREE.Vector3[] = [];
  private replayFrames: RaceReplayFrame[] = [];
  private replayCaptureAccumulator = 0;
  private replayElapsed = 0;
  private replayActive = false;
  private finishAutopilot?: RacingAI;
  private finishAutopilotActive = false;
  /** Stable opponent vehicle list handed to the replay camera director. */
  private replayOpponents: Vehicle[] = [];
  private readonly replayFrameInterval = 1 / 20;
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
    trackId: string = 'sprint_circuit',
    options: RaceOptions = {}
  ) {
    super(engine, scene, vehicle, particles, environmentGroup, keys);
    this.trackId = trackId;
    this.totalLaps = THREE.MathUtils.clamp(Math.round(options.totalLaps ?? 3), 1, 99);
    this.difficulty = options.difficulty ?? 'normal';
    this.drivingMode = options.drivingMode ?? 'simulation';
    this.opponentCount = THREE.MathUtils.clamp(Math.round(options.opponentCount ?? 5), 0, 12);
  }

  public resetVehicle() {
    this.vehicle.reset(this.startPos, this.startYaw);
  }

  public handleFuelTow(): void {
    let nearestIndex = 0;
    let nearestDistanceSq = Infinity;
    for (let i = 0; i < this.densePath.length; i++) {
      const distanceSq =
        this.vehicle.pos.distanceToSquared(this.densePath[i]);
      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearestIndex = i;
      }
    }

    let clockwiseDistance = 0;
    for (let i = nearestIndex; i > 0; i--) {
      clockwiseDistance += this.densePath[i].distanceTo(
        this.densePath[i - 1]
      );
    }
    let counterClockwiseDistance = 0;
    for (let i = nearestIndex; i < this.densePath.length - 1; i++) {
      counterClockwiseDistance += this.densePath[i].distanceTo(
        this.densePath[i + 1]
      );
    }
    const recoveryDistance = Math.min(
      clockwiseDistance,
      counterClockwiseDistance
    );
    const towPenalty = THREE.MathUtils.clamp(
      20 + recoveryDistance / 14,
      20,
      120
    );

    this.raceTime += towPenalty;
    this.vehicle.refuel(1);
    this.vehicle.reset(this.startPos, this.startYaw);
    this.engine.callbacks.onGameStatus(
      'playing',
      `OUT OF FUEL — TOW PENALTY +${towPenalty.toFixed(1)}s`
    );
  }

  public init() {
    this.clearEnvironment();
    this.particles.clear();
    this.raceTime = 0;
    this.lapStartTimes = [0, 0];
    this.bestLapTime = Infinity;
    this.replayFrames = [];
    this.replayCaptureAccumulator = 0;
    this.replayElapsed = 0;
    this.replayActive = false;
    this.finishAutopilot = undefined;
    this.finishAutopilotActive = false;

    // Clean up any existing AI cars from the scene to prevent duplicates
    this.aiCars.forEach(ai => {
      this.scene.remove(ai.vehicle.mesh);
    });
    this.aiCars = [];
    this.replayOpponents = [];

    // Find track configuration in database
    const trackConfig = TRACKS_DATABASE.find(t => t.id === this.trackId) || TRACKS_DATABASE[1];
    const path = trackConfig.path;

    const pathVectors = path.map(p => (isTrackVector(p) ? p : p.pos));

    // Position car at the first marker facing the second marker
    const startPt = pathVectors[0];
    const nextPt = pathVectors[1] || pathVectors[0];
    
    const diff = new THREE.Vector3().subVectors(nextPt, startPt);
    this.startYaw = Math.atan2(diff.x, diff.z);

    const forwardVec = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.startYaw).normalize();
    const rightVec = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.startYaw - Math.PI / 2).normalize();

    // Terrain and road are built before anything is placed, because the grid slots
    // below ask the road how high it is. They used to be built afterwards and every
    // car was dropped at a hardcoded y = 0.5, which on any track whose surface is
    // not at that exact height spawned the whole field inside or above the tarmac.
    this.createGridFloor();
    this.createTerrain(trackConfig, trackConfig.time);
    this.createRacetrackRoad(trackConfig);
    this.createScenery(trackConfig.scenery, trackConfig.time);

    // Generate dense path for AI tracking. This has to use the same centreline
    // builder as the road mesh, or the AI drives off the outside of any sharp
    // corner the road actually takes.
    const resolvedNodes = resolveTrackNodes(trackConfig);
    const aiCurve = buildCenterline(
      // Real node height, not a flat 0.5. centripetal and chordal knots are spaced
      // by 3D distance, so a flattened copy is a slightly different curve than the
      // one the road was built from, and the AI aims a little off the tarmac.
      resolvedNodes.map(n => new THREE.Vector3(n.pos.x, n.pos.y, n.pos.z)),
      resolvedNodes,
      { curveType: trackConfig.curveType, tension: trackConfig.tension, roadWidth: trackConfig.roadWidth }
    ).curve;
    // The road ribbon keeps a duplicate first point for its closing quad. The AI
    // needs a unique loop, and its sample density must stay physical on both small
    // circuits and multi-kilometre courses.
    const aiSampleCount = Math.max(180, Math.ceil(aiCurve.getLength() / 4));
    const aiSamples = aiCurve.getSpacedPoints(aiSampleCount);
    if (
      aiSamples.length > 2 &&
      aiSamples[0].distanceToSquared(aiSamples[aiSamples.length - 1]) < 1e-4
    ) {
      aiSamples.pop();
    }
    this.densePath = aiSamples;

    const difficultyMultiplier = DIFFICULTY_SPEED_MULTIPLIER[this.difficulty] ?? DIFFICULTY_SPEED_MULTIPLIER.normal;

    // Dynamically generate AI configs based on opponentCount
    const aiConfigs = Array.from({ length: this.opponentCount }).map((_, i) => {
      // Loop over CARS_DATABASE to pick vehicles.
      const carDb = CARS_DATABASE[i % CARS_DATABASE.length];
      
      // Calculate speed factor. Staggered based on index:
      const speedFactor = Math.max(0.68, 0.95 - i * 0.045) * difficultyMultiplier;
      
      // Stagger lateralOffset from -3.5 to 3.5.
      let lateralOffset = 0;
      if (i > 0) {
        const side = (i % 2 === 0) ? -1 : 1;
        const layer = Math.ceil(i / 2);
        lateralOffset = side * (3.5 / layer);
      }
      
      return {
        carId: carDb.id,
        color: carDb.color,
        speedFactor,
        name: `${carDb.brand} ${carDb.name}`,
        lateralOffset
      };
    });

    this.aiCars = aiConfigs.map(cfg => {
      const vehicle = new Vehicle(cfg.carId, cfg.color);
      vehicle.drivingMode = this.drivingMode;
      const ai = new RacingAI(vehicle, this.densePath, cfg.speedFactor, cfg.lateralOffset);
      ai.drivingMode = this.drivingMode;
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

    // Assign ground and slope callbacks for AI vehicles. Slope matters as much as
    // height: without it an AI car takes a climb at full speed and never rolls back
    // on a descent, so it drives through hills the player has to work up.
    this.aiCars.forEach(ai => {
      ai.vehicle.getGroundHeight = (x: number, z: number, yHint?: number) =>
        this.getGroundHeight(x, z, yHint);
      ai.vehicle.getSlopeHeight = (x: number, z: number) => this.getSlopeHeight(x, z);
    });

    // Position AI opponents on grid spots 0, 1, 2, 3, 4 (staggered pole position)
    for (let i = 0; i < this.aiCars.length; i++) {
      const gridIdx = i; // 0 to 4
      const sideOffset = (gridIdx % 2 === 0) ? -2.2 : 2.2;
      const forwardOffset = gridIdx * -8;

      const aiPos = new THREE.Vector3().copy(startPt)
        .addScaledVector(rightVec, sideOffset)
        .addScaledVector(forwardVec, forwardOffset);
      aiPos.y = this.getGroundHeight(aiPos.x, aiPos.z, startPt.y);

      this.aiCars[i].vehicle.reset(aiPos, this.startYaw);
      this.scene.add(this.aiCars[i].vehicle.mesh);
    }

    // Position player at Grid Spot 5 (6th place: 40m behind startPt, offset right)
    const playerSideOffset = (5 % 2 === 0) ? -2.2 : 2.2;
    const playerForwardOffset = 5 * -8;

    this.startPos.copy(startPt)
      .addScaledVector(rightVec, playerSideOffset)
      .addScaledVector(forwardVec, playerForwardOffset);
    // Sit on the road surface. The start line can be at any elevation, and the
    // start node's own y is the hint that keeps an overpass from claiming the slot.
    this.startPos.y = this.getGroundHeight(this.startPos.x, this.startPos.z, startPt.y);

    this.vehicle.reset(this.startPos, this.startYaw);

    // Build checkpoint rings (only the start/finish checkpoint is created)
    this.checkpoints = [];

    // Start/finish checkpoint at pathVectors[0] at the end of the race
    const finishCheckpoint = new Checkpoint(
      pathVectors[0],
      0, // index 0 in checkpoints list
      pathVectors[1],
      false, // starts inactive
      true,  // is a race track
      trackConfig.roadWidth / 2 // Make it as big as the road
    );
    // Keep the start/finish checkpoint visible from the beginning as a physical race gate
    this.environmentGroup.add(finishCheckpoint.mesh);
    this.checkpoints.push(finishCheckpoint);

    // Sync guardrail, track info, and grass callbacks for all AI vehicles and their AI controllers
    const grassCallback = (x: number, z: number) => {
      const info = this.getTrackInfo(x, z);
      const grassWidth = info.grassWidth ?? 0;
      if (grassWidth <= 0) return false;
      const grassStart = info.width / 2 + (info.curb ? this.curbWidth : 0);
      return info.dist >= grassStart && info.dist < grassStart + grassWidth;
    };
    const trackInfoCallback = (x: number, z: number, yHint?: number) =>
      this.getTrackInfo(x, z, yHint);

    // Keep one live array object so controllers receive the obstacles spawned below.
    this.obstacles = [];
    this.aiCars.forEach(aiCar => {
      aiCar.vehicle.haveFence = this.haveFence;
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
    });

    // Spawn obstacles (Cylinder warning cones) on high-tier race track
    if (trackConfig.hasObstacles) {
      for (let i = 0; i < pathVectors.length; i++) {
        const p1 = pathVectors[i];
        const p2 = pathVectors[(i + 1) % pathVectors.length];
        
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

    this.aiCars.forEach(aiCar => {
      aiCar.ai.obstacles = this.obstacles;
    });
    this.replayOpponents = this.aiCars.map(aiCar => aiCar.vehicle);

    // Use the same track-aware AI controller for the player's short post-finish
    // cruise. It remains separate from aiCars so standings and replay data stay unchanged.
    this.finishAutopilot = new RacingAI(this.vehicle, this.densePath, 0.65, 0);
    this.finishAutopilot.drivingMode = this.drivingMode;
    this.finishAutopilot.getTrackInfo = trackInfoCallback;
    this.finishAutopilot.isOnGrass = grassCallback;
    this.finishAutopilot.trackBoundary = this.trackBoundary;
    this.finishAutopilot.obstacles = this.obstacles;

    this.activeCheckpointIndex = 0;
    this.currentLap = 1;
    this.hasQualifiedForLap = false;
    this.isWrongWay = false;
    this.isCheat = false;
    this.wrongWayTimer = 0;
    this.engine.callbacks.onCheckpointChange(this.currentLap, this.totalLaps);

    // Start countdown
    this.engine.startCountdown(trackConfig.timeLimit);
  }

  public update(deltaTime: number) {
    if (this.replayActive) {
      this.updateReplay(deltaTime);
      return;
    }
    if (this.engine.gameStatus === 'success') {
      if (this.finishAutopilotActive && this.finishAutopilot) {
        this.updateScrollingFloor();
        this.updateGrass(deltaTime);
        const autopilotInputs = this.finishAutopilot.computeInputs(deltaTime);
        this.vehicle.update(deltaTime, autopilotInputs);
        if (this.vehicle.speed > 5.6) {
          this.particles.emitBoosters(
            this.vehicle.mesh.matrixWorld,
            this.vehicle.yaw,
            this.vehicle.speed,
            this.vehicle.boosterColor
          );
        }
        this.particles.update(deltaTime);
      }
      return;
    }

    this.updateScrollingFloor();
    this.updateGrass(deltaTime);

    // Update checkpoint rings (hologram scrolls and float animations)
    this.checkpoints.forEach(cp => cp.update(deltaTime));

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
      const path = trackConfig.path.map(p => ('isVector3' in p ? p : p.pos) as THREE.Vector3);

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
      if (ai.vehicle.speed > 5.6) {
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
        this.vehicle.scaleVelocity(0.85);
        ai.vehicle.scaleVelocity(0.85);
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

            ai.vehicle.scaleVelocity(0.9);
            otherAi.vehicle.scaleVelocity(0.9);
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
    if (Math.abs(this.vehicle.speed) > 5.6 && (this.keys['w'] || this.keys['arrowup'])) {
      this.particles.emitBoosters(this.vehicle.mesh.matrixWorld, this.vehicle.yaw, this.vehicle.speed, this.vehicle.boosterColor);
    }
    this.particles.update(deltaTime);

    // Track player progress along track and check lap completion
    if (isPlaying) {
      const trackConfig = TRACKS_DATABASE.find(t => t.id === this.trackId) || TRACKS_DATABASE[1];
      const path = trackConfig.path.map(p => ('isVector3' in p ? p : p.pos) as THREE.Vector3);

      // Find player's closest node index on sparse path (for lap qualification & placement)
      let playerClosestNodeIndex = 0;
      let minNodeDistSq = Infinity;
      for (let i = 0; i < path.length; i++) {
        const dSq = this.vehicle.pos.distanceToSquared(path[i]);
        if (dSq < minNodeDistSq) {
          minNodeDistSq = dSq;
          playerClosestNodeIndex = i;
        }
      }

      // Find player's closest point on densePath for exact curve tangent direction
      let closestDenseIdx = 0;
      let minDenseDistSq = Infinity;
      if (this.densePath.length > 0) {
        for (let i = 0; i < this.densePath.length; i++) {
          const dSq = this.vehicle.pos.distanceToSquared(this.densePath[i]);
          if (dSq < minDenseDistSq) {
            minDenseDistSq = dSq;
            closestDenseIdx = i;
          }
        }
      }

      // Calculate smooth curve forward direction vector at closest dense point
      const trackForward = new THREE.Vector3(0, 0, 1);
      if (this.densePath.length > 1) {
        const nextDenseIdx = (closestDenseIdx + 1) % this.densePath.length;
        trackForward.subVectors(this.densePath[nextDenseIdx], this.densePath[closestDenseIdx]).normalize();
      }

      // Calculate car direction vector
      const carHeading = new THREE.Vector3(Math.sin(this.vehicle.yaw), 0, Math.cos(this.vehicle.yaw)).normalize();

      // Check if car is going the Wrong Way (driving backward against smooth curve flow)
      const directionDot = carHeading.dot(trackForward);
      if (directionDot < -0.5 && Math.abs(this.vehicle.speed) > 2.0) {
        this.wrongWayTimer += deltaTime;
        if (this.wrongWayTimer > 0.6) {
          this.isWrongWay = true;
          this.isCheat = true; // Set cheat = 1 flag!
        }
      } else {
        this.wrongWayTimer = Math.max(0, this.wrongWayTimer - deltaTime * 2);
        if (this.wrongWayTimer === 0) {
          this.isWrongWay = false;
        }
      }

      // Check if player has reached the opposite side of the loop
      const oppositeIndex = Math.floor(path.length / 2);
      const oppositePt = path[oppositeIndex];
      const distToOpposite = this.vehicle.pos.distanceTo(oppositePt);
      const detectionRadius = Math.max(25, trackConfig.roadWidth * 1.5);

      if (!this.isWrongWay && (Math.abs(playerClosestNodeIndex - oppositeIndex) <= 1 || distToOpposite < detectionRadius)) {
        if (!this.hasQualifiedForLap) {
          this.hasQualifiedForLap = true;
          const finishCheckpoint = this.checkpoints[0];
          if (finishCheckpoint) {
            finishCheckpoint.activate();
          }
        }
      }

      // Collide with finish checkpoint when qualified
      const finishCheckpoint = this.checkpoints[0];
      if (finishCheckpoint && this.hasQualifiedForLap) {
        const finishRadius = Math.max(22, trackConfig.roadWidth * 1.25);
        const distToFinish = this.vehicle.pos.distanceTo(finishCheckpoint.pos);
        if (distToFinish < finishRadius) {
          finishCheckpoint.markPassed();
          this.particles.emitSparks(25, finishCheckpoint.pos, 0x00ff00);
          this.engine.triggerCheckpointFlash();
          
          // Calculate and track lap times
          const currentLapTime = this.raceTime - this.lapStartTimes[this.currentLap];
          if (currentLapTime < this.bestLapTime) {
            this.bestLapTime = currentLapTime;
          }

          this.lapStartTimes[this.currentLap + 1] = this.raceTime;
          this.currentLap++;
          this.hasQualifiedForLap = false;
          
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
              status: 'finished' as const,
              lapsBehind: 0,
              isPlayer: true
            };

            const playerTotalCheckpoints = path.length * this.totalLaps;
            const aiResults = this.aiCars.map(ai => {
              const aiNextPt = path[ai.currentPathIndex];
              const aiDistToNext = ai.vehicle.pos.distanceTo(aiNextPt);
              const aiProgress = ai.checkpointsPassed - (aiDistToNext / 10000);
              const hasFinished = ai.finishTime !== undefined || ai.checkpointsPassed >= playerTotalCheckpoints;
              const lapsBehind = hasFinished
                ? 0
                : Math.max(0, Math.floor((playerTotalCheckpoints - aiProgress) / path.length));
              let finalTime = ai.finishTime;

              if (finalTime === undefined) {
                // Calculate projected time only for unfinished AI so standings remain ordered.
                const playerTimePerCp = this.raceTime / playerTotalCheckpoints;
                const remainingCp = Math.max(0, playerTotalCheckpoints - aiProgress);
                finalTime = this.raceTime + remainingCp * (playerTimePerCp / ai.config.speedFactor);
              }

              return {
                pos: 0,
                name: ai.config.name,
                car: ai.config.name,
                time: finalTime,
                status: hasFinished ? 'finished' as const : lapsBehind > 0 ? 'lapped' as const : 'in_progress' as const,
                lapsBehind,
                isPlayer: false
              };
            });

            // Sort all by actual or projected time, then assign final positions.
            const allResults = [playerResult, ...aiResults];
            allResults.sort((a, b) => a.time - b.time);
            allResults.forEach((res, idx) => {
              res.pos = idx + 1;
            });

            const finalPlacement = allResults.find(res => res.isPlayer)?.pos ?? placement;
            this.captureReplayFrame();
            this.finishAutopilotActive = true;
            this.engine.handleSuccess(finalPlacement, allResults);

          } else {
            finishCheckpoint.deactivate();
            this.engine.callbacks.onCheckpointChange(this.currentLap, this.totalLaps);
          }
        }
      }

      // Calculate real-time placement (Player + AI opponents)
      const distToClosestNode = Math.sqrt(minNodeDistSq);
      const playerProgress = (this.currentLap - 1) * path.length + playerClosestNodeIndex + (1 - distToClosestNode / 10000);

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

    if (isPlaying && this.engine.gameStatus === 'playing') {
      this.captureReplayFrame(deltaTime);
    }
  }

  private captureReplayFrame(deltaTime = 0): void {
    if (deltaTime > 0) {
      this.replayCaptureAccumulator += deltaTime;
      if (this.replayFrames.length > 0 && this.replayCaptureAccumulator < this.replayFrameInterval) {
        return;
      }
      this.replayCaptureAccumulator %= this.replayFrameInterval;
    }

    const snapshot = (vehicle: Vehicle): RaceReplayTransform => [
      vehicle.pos.x,
      vehicle.pos.y,
      vehicle.pos.z,
      vehicle.yaw,
      vehicle.pitch,
      vehicle.roll,
      vehicle.speed,
      vehicle.isGrounded ? 1 : 0
    ];

    this.replayFrames.push({
      player: snapshot(this.vehicle),
      opponents: this.aiCars.map(ai => snapshot(ai.vehicle))
    });
  }

  /** Course data the replay camera director stands its cameras on. Read-only. */
  public getReplayCameraTrack(): ReplayCameraTrack {
    return {
      path: this.densePath,
      boundary: this.trackBoundary,
      getGroundHeight: (x: number, z: number, yHint?: number) =>
        this.getGroundHeight(x, z, yHint)
    };
  }

  /** Opponent cars the director can frame alongside the player. */
  public getReplayOpponents(): Vehicle[] {
    return this.replayOpponents;
  }

  /** Stable replay subjects used by the TV camera and spectator controls. */
  public getReplayTargets(): ReplayTarget[] {
    const playerCar = CARS_DATABASE.find(car => car.id === this.vehicle.carId);
    return [
      {
        vehicle: this.vehicle,
        name: playerCar ? `${playerCar.brand} ${playerCar.name}` : 'Hatchback-X',
        isPlayer: true
      },
      ...this.aiCars.map(ai => ({
        vehicle: ai.vehicle,
        name: ai.config.name,
        isPlayer: false
      }))
    ];
  }

  /** Return a detached, plain-data replay that can safely be downloaded. */
  public getReplayExport(): RaceReplayExport | null {
    if (this.replayFrames.length < 2) return null;

    return {
      format: 'cyberdrive-race-replay',
      version: 1,
      trackId: this.trackId,
      carId: this.vehicle.carId,
      totalLaps: this.totalLaps,
      sampleInterval: this.replayFrameInterval,
      duration: this.raceTime,
      frameCount: this.replayFrames.length,
      opponents: this.aiCars.map(ai => ({
        carId: ai.config.carId,
        color: ai.config.color,
        name: ai.config.name
      })),
      frames: this.replayFrames.map(frame => ({
        player: [...frame.player] as RaceReplayTransform,
        opponents: frame.opponents.map(opponent => [...opponent] as RaceReplayTransform)
      }))
    };
  }

  public startReplay(): boolean {
    if (this.replayFrames.length < 2 || this.replayActive) return false;

    this.finishAutopilotActive = false;
    this.replayActive = true;
    this.replayElapsed = 0;
    this.engine.startTvReplay();
    this.applyReplayFrame(0, 0);
    return true;
  }

  public skipReplay(): void {
    if (!this.replayActive) return;

    this.finishAutopilotActive = false;
    this.replayActive = false;
    this.engine.stopTvReplay();
    const finalFrame = this.replayFrames[this.replayFrames.length - 1];
    if (finalFrame) this.applyReplayFrame(this.replayFrames.length - 1, 0);
    this.engine.callbacks.onReplayComplete?.('skipped');
  }

  private updateReplay(deltaTime: number): void {
    if (this.replayFrames.length < 2) {
      this.skipReplay();
      return;
    }

    this.replayElapsed += deltaTime;
    const framePosition = this.replayElapsed / this.replayFrameInterval;
    const lastFrameIndex = this.replayFrames.length - 1;

    if (framePosition >= lastFrameIndex) {
      this.applyReplayFrame(lastFrameIndex, 0);
      this.finishAutopilotActive = false;
      this.replayActive = false;
      this.engine.stopTvReplay();
      this.engine.callbacks.onReplayComplete?.('ended');
      return;
    }

    const frameIndex = Math.floor(framePosition);
    this.applyReplayFrame(frameIndex, framePosition - frameIndex);
  }

  private applyReplayFrame(frameIndex: number, blend: number): void {
    const frame = this.replayFrames[frameIndex];
    const nextFrame = this.replayFrames[Math.min(frameIndex + 1, this.replayFrames.length - 1)] || frame;
    const interpolateAngle = (from: number, to: number): number => {
      const delta = THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
      return from + delta * blend;
    };
    const interpolate = (from: RaceReplayTransform, to: RaceReplayTransform): ReplayTransform => ({
      position: new THREE.Vector3(
        THREE.MathUtils.lerp(from[0], to[0], blend),
        THREE.MathUtils.lerp(from[1], to[1], blend),
        THREE.MathUtils.lerp(from[2], to[2], blend)
      ),
      yaw: interpolateAngle(from[3], to[3]),
      pitch: THREE.MathUtils.lerp(from[4], to[4], blend),
      roll: THREE.MathUtils.lerp(from[5], to[5], blend),
      speed: THREE.MathUtils.lerp(from[6], to[6], blend),
      isGrounded: blend < 0.5 ? from[7] > 0.5 : to[7] > 0.5
    });

    this.vehicle.applyReplayTransform(interpolate(frame.player, nextFrame.player));
    this.aiCars.forEach((ai, index) => {
      const opponent = frame.opponents[index];
      const nextOpponent = nextFrame.opponents[index] || opponent;
      if (opponent && nextOpponent) {
        ai.vehicle.applyReplayTransform(interpolate(opponent, nextOpponent));
      }
    });
  }

  private triggerCrash() {
    this.vehicle.setForwardSpeed(-1.4); // Bounce velocity (~5 km/h)
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
    this.finishAutopilotActive = false;
    this.finishAutopilot = undefined;
    this.replayOpponents = [];
    this.replayActive = false;
    this.replayFrames = [];
    this.replayCaptureAccumulator = 0;
    this.replayElapsed = 0;
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
