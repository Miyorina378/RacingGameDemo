import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CARS_DATABASE, type CarConfig, type DifferentialConfig, type TorquePoint } from '../config/CarDatabase';
import { updateGrassInstability, applyGrassLateralSlide, applyGrassSpeedReduction } from './Grass';
import { enforceFenceBoundary } from './Fence';
import {
  computeLateralForce,
  computeSlipAngle,
  combinedGripCircle
} from './TireModel';
import {
  TireCompoundType,
  TireState,
  createFreshTireState,
  getEffectiveGrip,
  accumulateWear
} from './TireCompound';

const AIR_DENSITY = 1.225;
const GRAVITY = 9.81;

export class Vehicle {
  public mesh: THREE.Group;
  public wheels: THREE.Object3D[] = [];
  public leftFrontWheel?: THREE.Object3D;
  public rightFrontWheel?: THREE.Object3D;

  // Shader materials tracking
  private paintMaterials: THREE.MeshPhysicalMaterial[] = [];
  private windshieldMaterials: THREE.MeshPhysicalMaterial[] = [];
  private rimMaterials: THREE.MeshPhysicalMaterial[] = [];
  private underglowMaterial?: THREE.ShaderMaterial;
  private taillightMaterials: THREE.MeshStandardMaterial[] = [];

  // Physics parameters
  public pos = new THREE.Vector3(0, 0, 0);
  public yaw = 0; // Heading direction in radians
  public pitch = 0;
  public roll = 0;
  public speed = 0; // Derived: forward projection of velocity (for HUD/external consumers)
  public yVelocity = 0; // For jumps
  public isGrounded = true;
  public isDrifting = false;
  public driftAngle = 0; // Derived: angle between heading and velocity vector
  public steerAngle = 0; // Smoothly interpolated steering angle for physics and visuals
  public getGroundHeight?: (x: number, z: number) => number;
  public getTrackInfo?: (x: number, z: number) => {
    dist: number;
    closestPt: THREE.Vector3;
    closestIdx?: number;
    width?: number;
    leftScale?: number;
    rightScale?: number;
    sideSign?: number;
    trackBoundary?: number;
    banking?: number;
  };
  public onFenceCollision?: (contactPt: THREE.Vector3) => void;
  public haveFence = false;
  public trackBoundary = 0;
  public grassInstability = 0; // Progressive instability factor on grass (0.0 to 1.0)
  public isOnGrass?: (x: number, z: number) => boolean;

  // --- 2D VELOCITY-BASED PHYSICS ---
  public velocityX = 0;   // World-space X velocity (m/s)
  public velocityZ = 0;   // World-space Z velocity (m/s)
  public wheelBase = 3.2;  // Distance between front and rear axles (m)
  public trackWidth = 1.62; // Distance between left and right wheels (m)
  public cgHeight = 0.52;   // Center of gravity height above ground (m)
  public yawInertia = 2600; // Yaw moment of inertia (kg*m^2)

  // --- TIRE COMPOUND SYSTEM ---
  public tireState: TireState = createFreshTireState('economy');
  public tireWearEnabled = false;  // Only true in endurance mode

  // --- REALISM ENHANCEMENT VARIABLES ---
  public turboSpoolLevel = 0;       // 0.0–1.0 spool-up fraction for turbo lag
  public suspensionOffset = 0;      // Vertical chassis displacement from suspension compression
  public prevSpeed = 0;             // Previous frame speed for computing longitudinal acceleration
  public longitudinalAccel = 0;     // Smoothed acceleration value (m/s²) for pitch effects
  public shiftPitchImpulse = 0;     // Transient pitch impulse during gear shifts
  private wheelSpinAngle = 0;       // Accumulated wheel rolling angle (radians) for visual spin

  // --- SPIN-OUT & CAR CHARACTER VARIABLES ---
  public rearSlipAngle = 0;         // Current rear tire slip angle (radians)
  public yawRate = 0;               // Angular velocity of the car's rotation (rad/s)
  public isSpinning = false;        // True when car has entered unrecoverable spin
  public spinTimer = 0;             // Time remaining in spin animation
  public prevThrottleValue = 0;     // Previous frame throttle for lift-off oversteer detection
  public throttleInput = 0;
  public brakeInput = 0;

  // --- ADVANCED PHYSICS PROPERTIES ---
  public wheelSpeed = 0;            // Rotation speed of driving wheels (m/s)
  public dynamicFrontWeight = 0;    // Dynamic weight on front axle (N)
  public dynamicRearWeight = 0;     // Dynamic weight on rear axle (N)
  public lateralAccel = 0;          // Smoothed lateral acceleration estimate (m/s^2)

  // GT4-style per-car physics character (loaded from CarDatabase)
  public character = {
    weightDistribution: 0.52,       // 0.0–1.0, >0.5 = front-heavy (understeer)
    rearGripMultiplier: 1.0,        // 0.7–1.2, lower = tail-happy
    yawInertia: 1.0,                // 0.6–1.4, lower = snappy rotation
    oversteerResistance: 0.6        // 0.0–1.0, higher = harder to spin
  };

  // Car stats
  public maxSpeed = 45;
  public accelerationRate = 0.35;
  public handlingRate = 0.045;
  public brakingRate = 0.8;
  public dragCoeff = 0.015;
  public frontWeightDistribution = 0.52;
  public dragCoefficient = 0.32;
  public liftCoefficient = 0.05;
  public frontalArea = 2.1;
  public tireGripFront = 1.0;
  public tireGripRear = 1.0;
  public corneringStiffnessFront = 6.5;
  public corneringStiffnessRear = 6.5;
  public brakeForce = 12000;
  public maxSteeringAngle = 0.55;
  public rollingResistanceCoefficient = 0.014;
  public shiftUpMph: number[] = [];
  public differential: DifferentialConfig = {
    accelLock: 0.25,
    decelLock: 0.12,
    preload: 0.04,
    awdFrontBias: 0.4
  };
  public driveType: 'FWD' | 'RWD' | 'AWD' = 'RWD';

  // New Powertrain Params (เพิ่มระบบเกียร์และแรงบิด)
  public currentGear = 1;
  public rpm = 1000;
  public gearRatios = [0, 3.60, 2.10, 1.50, 1.10, 0.90, 0.80]; // เกียร์ 1-6 (index 0 ว่างไว้)
  public finalDrive = 3.42;
  public wheelRadius = 0.48; // อิงตามรัศมี Cylinder ที่สร้างในโปรแกรม (0.48)

  // Shifting and transmission state variables
  public isShifting = false;
  public shiftTimer = 0;
  public targetGear = 1;
  public previousGear = 1;
  public isRevLimiterCut = false;

  // Visual/Config options
  public hasSpoiler = false;
  public boosterColor = 0xff4500;

  // --- NEW SIMULATOR VARIABLES ---
  public baseMass = 1200;   // Unloaded factory car weight (kg)
  public mass = 1200;       // Active mass after modifications
  public maxRpm = 6500;     // Engine redline limits
  private torqueCurve: TorquePoint[] = [];

  // Comprehensive Upgrade Configuration
  public upgrades = {
    mufflers: 0,            // Level 0-3: Decreases backpressure, scaling up base engine torque
    brake: {
      level: 0,             // Level 0-3: Increases absolute braking force clamping power
      hasABS: false,        // Anti-lock Braking System: Prevents wheel lock, allows steering under heavy braking
      hasESC: false         // Electronic Stability Control: Restores stability if sliding out unintentionally
    },
    aspiration: 'natural' as 'natural' | 'turbo',  // 'natural' or 'turbo': Adds a force-fed torque spike at mid-high RPM
    weightReduction: 0,     // Level 0-3: Directly drops vehicle mass (improving acceleration, braking, and cornering)
    driveTrain: {
      gearboxLevel: 0,      // Level 0-3: Lowers gear shift times / optimizes top-end gear ratios
      clutchLevel: 0,       // Level 0-3: Minimizes drivetrain slipping, boosting transmission efficiency
      flywheelLevel: 0,     // Level 0-3: Lightens engine rotational inertia, making RPM climb/drop faster
      propellerShaftLevel: 0 // Level 0-2: Carbon/lightweight shaft reduces power loss to the wheels
    },
    engine: {
      ecuLevel: 0,              // Level 0-3: Digitally remapped fuel tables for flat torque gains
      engineBalancingLevel: 0,  // Level 0-3: Harmonizes internal components, raising safe Max RPM limit
      portGrindingLevel: 0      // Level 0-3: Smooths cylinder head airflow, major torque gains at high RPM
    },
    suspensionLevel: 0,     // Level 0-3: Lowers center of gravity, sharpens handling, reduces visual body roll
    bodyControlModuleLevel: 0, // Level 0-3: Electronic Traction Control (TCS) preventing low-speed wheel spin
    tireLevel: 0,
    tireCompound: 'economy' as TireCompoundType  // Tire compound selection
  };

  public carId: string;
  public color: string;

  constructor(carId: string = 'starter', color: string = '#f43f5e') {
    this.carId = carId;
    this.color = color;
    this.mesh = new THREE.Group();
    this.updateStats();
    this.buildMesh();
  }

  private getDefaultPeakTorque(config: CarConfig): number {
    if (config.tier === 'Sport Tier') return 230;
    if (config.tier === 'Hyper Tier') return 520;
    if (config.tier === 'Legendary Tier') return 680;
    return 170;
  }

  private buildDefaultTorqueCurve(config: CarConfig, maxRpm: number): TorquePoint[] {
    const peakTorque = this.getDefaultPeakTorque(config);
    return [
      { rpm: 1000, torque: peakTorque * 0.62 },
      { rpm: 2500, torque: peakTorque * 0.82 },
      { rpm: Math.max(3500, maxRpm * 0.55), torque: peakTorque },
      { rpm: Math.max(4500, maxRpm * 0.78), torque: peakTorque * 0.97 },
      { rpm: maxRpm, torque: peakTorque * (config.tier === 'Entry Tier' ? 0.84 : 0.90) }
    ];
  }

  private sampleTorqueCurve(currentRpm: number): number {
    if (this.torqueCurve.length === 0) return 120;

    const rpm = THREE.MathUtils.clamp(
      currentRpm,
      this.torqueCurve[0].rpm,
      this.torqueCurve[this.torqueCurve.length - 1].rpm
    );

    for (let i = 0; i < this.torqueCurve.length - 1; i++) {
      const current = this.torqueCurve[i];
      const next = this.torqueCurve[i + 1];
      if (rpm >= current.rpm && rpm <= next.rpm) {
        const t = (rpm - current.rpm) / Math.max(1, next.rpm - current.rpm);
        return THREE.MathUtils.lerp(current.torque, next.torque, t);
      }
    }

    return this.torqueCurve[this.torqueCurve.length - 1].torque;
  }

  private getAckermannWheelAngles(centerSteerAngle: number): { left: number; right: number } {
    const absSteer = Math.abs(centerSteerAngle);
    if (absSteer < 0.001) return { left: 0, right: 0 };

    const turnRadius = Math.max(this.wheelBase / Math.tan(absSteer), this.trackWidth * 0.6);
    const halfTrack = this.trackWidth * 0.5;
    const innerAngle = Math.atan(this.wheelBase / Math.max(0.1, turnRadius - halfTrack));
    const outerAngle = Math.atan(this.wheelBase / (turnRadius + halfTrack));

    return centerSteerAngle > 0
      ? { left: innerAngle, right: outerAngle }
      : { left: -outerAngle, right: -innerAngle };
  }

  private getDifferentialLock(throttleValue: number, brakeValue: number): number {
    if (throttleValue > 0.1) return THREE.MathUtils.clamp(this.differential.accelLock, 0, 1);
    if (brakeValue > 0.1) return THREE.MathUtils.clamp(this.differential.decelLock, 0, 1);
    return THREE.MathUtils.clamp(this.differential.preload ?? 0.04, 0, 1);
  }

  // ดึงค่าแรงบิดตามกราฟรอบเครื่องยนต์ (Torque Curve)
  private getTorque(currentRpm: number): number {
    let torque = this.sampleTorqueCurve(currentRpm);

    torque += this.upgrades.mufflers * 8;
    torque *= 1.0 + this.upgrades.engine.ecuLevel * 0.035;

    const highRpmBlend = THREE.MathUtils.smoothstep(currentRpm, this.maxRpm * 0.62, this.maxRpm);
    torque *= 1.0 + highRpmBlend * this.upgrades.engine.portGrindingLevel * 0.04;

    // [UPGRADE IMPACT]: Turbo Aspiration with realistic spool-up lag
    if (this.upgrades.aspiration === 'turbo' && currentRpm > 3200 && currentRpm < 5800) {
      const boostSwell = Math.sin((currentRpm - 3200) / 2600 * Math.PI) * 50;
      torque += boostSwell * this.turboSpoolLevel;
    }

    return Math.max(10, torque);
  }

  // ระบบเปลี่ยนเกียร์อัตโนมัติอิงตามรอบเครื่องยนต์ (Auto Gearbox Logic - RPM-based)
  private handleAutoTransmission(deltaTime: number) {
    if (this.speed < 0) {
      this.currentGear = 1;
      return;
    }

    let desiredGear = this.currentGear;

    if (!this.isShifting) {
      const speedMph = Math.abs(this.speed) * 2.236936;
      const scheduledShiftMph = this.shiftUpMph[this.currentGear - 1];
      const scheduledDownshiftMph = this.currentGear > 1 ? this.shiftUpMph[this.currentGear - 2] * 0.72 : undefined;

      if (scheduledShiftMph !== undefined) {
        if (speedMph >= scheduledShiftMph && desiredGear < this.gearRatios.length - 1) {
          desiredGear = this.currentGear + 1;
        } else if (scheduledDownshiftMph !== undefined && speedMph <= scheduledDownshiftMph && desiredGear > 1) {
          desiredGear = this.currentGear - 1;
        }
      } else {
        // Upshift when RPM >= maxRpm - 400 (94% of redline)
        if (this.rpm >= this.maxRpm - 400 && desiredGear < this.gearRatios.length - 1) {
          desiredGear = this.currentGear + 1;
        }
        // Downshift when RPM <= 1800 (with hysteresis prevention)
        else if (this.rpm <= 1800 && desiredGear > 1) {
          desiredGear = this.currentGear - 1;
        }
      }
    }

    // Start a shift if desiredGear is different from currentGear and we aren't already shifting
    if (desiredGear !== this.currentGear && !this.isShifting) {
      this.isShifting = true;
      this.previousGear = this.currentGear;
      this.targetGear = desiredGear;

      // [UPGRADE IMPACT]: Gearbox and Flywheel levels lower shifting time
      const shiftTimeModifier = 1.0 - (this.upgrades.driveTrain.gearboxLevel * 0.12) - (this.upgrades.driveTrain.flywheelLevel * 0.05);
      const baseShiftTime = desiredGear > this.currentGear ? 0.35 : 0.20;
      this.shiftTimer = Math.max(0.08, baseShiftTime * shiftTimeModifier);
    }

    // Process active shift transition timer
    if (this.isShifting) {
      this.shiftTimer -= deltaTime;
      if (this.shiftTimer <= 0) {
        this.isShifting = false;
        this.currentGear = this.targetGear;
      }
    }
  }

  public rebuild(carId: string, color: string, onLoadProgress?: (progress: number) => void, onLoadComplete?: () => void) {
    const isSameCar = this.carId === carId;
    this.carId = carId;
    this.color = color;
    this.updateStats();

    // Instant color update if it is the same car and meshes are already loaded
    if (isSameCar && this.paintMaterials.length > 0 && this.mesh.children.length > 0) {
      const paintColor = new THREE.Color(color);
      this.paintMaterials.forEach((mat) => {
        mat.color.copy(paintColor);
      });
      if (onLoadComplete) onLoadComplete();
      return;
    }

    // Otherwise, we are switching cars or loading for the first time
    this.paintMaterials = [];
    this.windshieldMaterials = [];
    this.rimMaterials = [];
    this.underglowMaterial = undefined;
    this.taillightMaterials = [];

    // Note: Do NOT clear old children immediately for GLTF models to avoid showing skeleton.
    // Procedural cars build instantly, so we can clear them now.
    if (carId !== 'honda_s2000' && carId !== 'ford_gt_2006') {
      while (this.mesh.children.length > 0) {
        this.mesh.remove(this.mesh.children[0]);
      }
      this.wheels = [];
      this.leftFrontWheel = undefined;
      this.rightFrontWheel = undefined;
      this.buildProceduralMesh();
      if (onLoadComplete) onLoadComplete();
    } else {
      this.buildMesh(onLoadProgress, onLoadComplete);
    }
  }
 
  private buildMesh(onLoadProgress?: (progress: number) => void, onLoadComplete?: () => void) {
    if (this.carId === 'honda_s2000') {
      this.buildGltfMesh('/models/honda_s2000.glb', onLoadProgress, onLoadComplete);
    } else if (this.carId === 'ford_gt_2006') {
      this.buildGltfMesh('/models/ford_gt_2006.glb', onLoadProgress, onLoadComplete);
    } else {
      this.buildProceduralMesh();
      if (onLoadComplete) onLoadComplete();
    }
  }

  private createPaintMaterial(color: THREE.Color | string | number): THREE.MeshPhysicalMaterial {
    const paintColor = new THREE.Color(color);
    const mat = new THREE.MeshPhysicalMaterial({
      color: paintColor,
      roughness: 0.18,
      metalness: 0.82,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04
    });
    this.paintMaterials.push(mat);
    return mat;
  }

  private createWindshieldMaterial(): THREE.MeshPhysicalMaterial {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x334455,
      roughness: 0.08,
      metalness: 0.05,
      transmission: 0.9,
      ior: 1.5,
      thickness: 0.5,
      transparent: true,
      opacity: 0.45
    });
    this.windshieldMaterials.push(mat);
    return mat;
  }

  private createRimMaterial(): THREE.MeshPhysicalMaterial {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xcccccc,
      roughness: 0.25,
      metalness: 0.95,
      clearcoat: 0.4,
      clearcoatRoughness: 0.1
    });
    this.rimMaterials.push(mat);
    return mat;
  }

  private buildProceduralMesh() {
    // Chassis Base
    const chassisGeom = new THREE.BoxGeometry(2.4, 0.5, 4.8);
    const chassisMat = this.createPaintMaterial(this.color);
    const chassis = new THREE.Mesh(chassisGeom, chassisMat);
    chassis.position.y = 0.45;
    this.mesh.add(chassis);

    // Cabin/Windshield
    const cabinGeom = new THREE.BoxGeometry(1.8, 0.6, 2.2);
    const cabinMat = new THREE.MeshPhysicalMaterial({
      color: 0x050510,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.9,
      ior: 1.5,
      thickness: 0.8,
      transparent: true,
      opacity: 0.5
    });
    const cabin = new THREE.Mesh(cabinGeom, cabinMat);
    cabin.position.set(0, 0.9, -0.2); // Sits slightly back
    this.mesh.add(cabin);

    // Windshield frame
    const windshieldGeom = new THREE.BoxGeometry(1.7, 0.5, 1.2);
    const windshieldMat = this.createWindshieldMaterial();
    const windshield = new THREE.Mesh(windshieldGeom, windshieldMat);
    windshield.position.set(0, 0.85, 0.8);
    windshield.rotation.x = -0.5; // Angled windshield
    this.mesh.add(windshield);

    // Realistic Headlights (Xenon white cylinders)
    const headlightGeom = new THREE.BoxGeometry(0.6, 0.12, 0.2);
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xe0e8ff,
      emissive: 0xe0e8ff,
      emissiveIntensity: 2.0
    });

    const leftHeadlight = new THREE.Mesh(headlightGeom, headlightMat);
    leftHeadlight.position.set(-0.8, 0.45, 2.4);
    this.mesh.add(leftHeadlight);

    const rightHeadlight = leftHeadlight.clone();
    rightHeadlight.position.x = 0.8;
    this.mesh.add(rightHeadlight);

    // Dynamic light beam emitting from front
    const frontSpot = new THREE.SpotLight(0xe0e8ff, 4, 30, Math.PI / 4, 0.5, 1);
    frontSpot.position.set(0, 0.5, 2.5);
    frontSpot.target.position.set(0, 0, 10);
    this.mesh.add(frontSpot);
    this.mesh.add(frontSpot.target);

    // Red Tail lights
    const taillightGeom = new THREE.BoxGeometry(0.8, 0.1, 0.1);
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0x550000,
      roughness: 0.2,
      metalness: 0.1,
      emissive: 0x220000,
      emissiveIntensity: 0.5
    });
    const tailLight = new THREE.Mesh(taillightGeom, taillightMat);
    tailLight.position.set(0, 0.5, -2.4);
    this.mesh.add(tailLight);
    this.taillightMaterials.push(taillightMat);

    // Exhaust Boost Engine
    const exhaustGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8);
    exhaustGeom.rotateX(Math.PI / 2);
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0x222233,
      metalness: 0.9,
    });
    const exhaust = new THREE.Mesh(exhaustGeom, exhaustMat);
    exhaust.position.set(0, 0.35, -2.4);
    this.mesh.add(exhaust);

    // Add spoiler if config specifies it
    if (this.hasSpoiler) {
      const spoilerPillarsGeom = new THREE.BoxGeometry(0.1, 0.6, 0.2);
      const spoilerPillarsMat = new THREE.MeshStandardMaterial({ color: 0x111122 });

      const leftPillar = new THREE.Mesh(spoilerPillarsGeom, spoilerPillarsMat);
      leftPillar.position.set(-0.8, 0.9, -2.1);
      this.mesh.add(leftPillar);

      const rightPillar = leftPillar.clone();
      rightPillar.position.x = 0.8;
      this.mesh.add(rightPillar);

      const wingGeom = new THREE.BoxGeometry(2.6, 0.08, 0.6);
      const wingMat = this.createPaintMaterial(this.color);
      const wing = new THREE.Mesh(wingGeom, wingMat);
      wing.position.set(0, 1.2, -2.1);
      wing.rotation.x = 0.05;
      this.mesh.add(wing);
    }

    // Wheels (4 Cylinders)
    const wheelGeom = new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.44, 16);
    wheelGeom.rotateZ(Math.PI / 2); // Rotate to stand vertically
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111115,
      roughness: 0.8,
    });
    const rimGeom = new THREE.CylinderGeometry(this.wheelRadius * (0.28 / 0.48), this.wheelRadius * (0.28 / 0.48), 0.46, 8);
    rimGeom.rotateZ(Math.PI / 2);
    const rimMat = this.createRimMaterial();

    const createWheelAssembly = (x: number, y: number, z: number, isFront: boolean) => {
      // Outer group: handles position + steering (Y rotation only)
      const steerPivot = new THREE.Group();
      steerPivot.position.set(x, y, z);

      // Inner group: handles rolling spin (X rotation only)
      const spinNode = new THREE.Group();
      steerPivot.add(spinNode);
      steerPivot.userData.spinNode = spinNode;

      const tire = new THREE.Mesh(wheelGeom, wheelMat);
      const rim = new THREE.Mesh(rimGeom, rimMat);
      spinNode.add(tire);
      spinNode.add(rim);

      this.mesh.add(steerPivot);
      this.wheels.push(steerPivot);

      if (isFront) {
        if (x < 0) this.leftFrontWheel = steerPivot;
        else this.rightFrontWheel = steerPivot;
      }
    };

    // Position wheels
    createWheelAssembly(-1.25, 0.48, 1.6, true);  // Front Left
    createWheelAssembly(1.25, 0.48, 1.6, true);   // Front Right
    createWheelAssembly(-1.25, 0.48, -1.6, false); // Rear Left
    createWheelAssembly(1.25, 0.48, -1.6, false);  // Rear Right

    // Enable shadows for the entire vehicle assembly
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  private buildGltfMesh(modelPath: string, onLoadProgress?: (progress: number) => void, onLoadComplete?: () => void) {
    // 1. If there is no previous car visible, build a basic procedural box placeholder and fallback wheels synchronously
    // so visual bounds are present and physics loop doesn't crash during network load.
    if (this.mesh.children.length === 0) {
      const placeholderGeom = new THREE.BoxGeometry(2.4, 0.5, 4.8);
      const placeholderMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(this.color),
        roughness: 0.5,
        metalness: 0.5,
        transparent: true,
        opacity: 0.6
      });
      const placeholder = new THREE.Mesh(placeholderGeom, placeholderMat);
      placeholder.position.y = 0.45;
      this.mesh.add(placeholder);

      this.buildFallbackWheels();
    }

    onLoadProgress?.(0);

    // 2. Load the actual model asynchronously
    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf: GLTF) => {
        // Clear all old model/placeholder meshes from this.mesh only when loaded
        while (this.mesh.children.length > 0) {
          this.mesh.remove(this.mesh.children[0]);
        }
        this.wheels = [];
        this.leftFrontWheel = undefined;
        this.rightFrontWheel = undefined;

        const model = gltf.scene;

        // Auto-scale and align the model
        // We compute the bounding box of ONLY the THREE.Mesh children in the model,
        // rather than using setFromObject(model) which includes helper/camera/light nodes at infinity.
        const meshBox = new THREE.Box3();
        let hasMeshes = false;
        model.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            meshBox.expandByObject(child);
            hasMeshes = true;
          }
        });

        const box = hasMeshes ? meshBox : new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());

        // Target length is 4.8m to match collision bounds
        const targetLength = 4.8;
        const carLength = Math.max(size.x, size.y, size.z);
        const scaleFactor = targetLength / Math.max(0.1, carLength);

        // Apply config visualScale override if defined
        const config = CARS_DATABASE.find(c => c.id === this.carId) || CARS_DATABASE[0];
        const dbScale = config.visualScale !== undefined ? config.visualScale : 1.0;
        const finalScale = scaleFactor * dbScale;
        model.scale.set(finalScale, finalScale, finalScale);

        const center = box.getCenter(new THREE.Vector3());
        // Align bottom of wheels/chassis to y = 0
        model.position.set(-center.x * finalScale, -box.min.y * finalScale, -center.z * finalScale);

        this.mesh.add(model);

        // Update matrices so world positions are accurate
        this.mesh.updateMatrixWorld(true);
        model.updateMatrixWorld(true);

        let originalWheels: THREE.Object3D[] = [];
        model.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            // Dynamically paint the car body parts and upgrade other surfaces (handles array materials safely)
            const paintColor = new THREE.Color(this.color);
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((mat, idx) => {
              if (mat?.name) {
                const matName = mat.name.toLowerCase();
                const nodeName = child.name.toLowerCase();
                
                // Track and set up taillights/brake lights (checking both "brake" and "break" spellings)
                if (
                  nodeName.includes('taillight') ||
                  nodeName.includes('tail_light') ||
                  nodeName.includes('brake') ||
                  nodeName.includes('break') ||
                  matName.includes('taillight') ||
                  matName.includes('tail_light') ||
                  matName.includes('brake') ||
                  matName.includes('break')
                ) {
                  const upgradedBrakeMat = new THREE.MeshStandardMaterial({
                    color: 0x550000,
                    roughness: 0.2,
                    metalness: 0.1,
                    emissive: 0x220000,
                    emissiveIntensity: 0.5
                  });
                  if (Array.isArray(child.material)) {
                    child.material[idx] = upgradedBrakeMat;
                  } else {
                    child.material = upgradedBrakeMat;
                  }
                  this.taillightMaterials.push(upgradedBrakeMat);
                } else if (
                  (nodeName.includes('body') ||
                   nodeName.includes('paint') ||
                   nodeName.includes('chassis') ||
                   nodeName.includes('exterior') ||
                   matName.includes('body') ||
                   matName.includes('paint') ||
                   matName.includes('exterior') ||
                   matName.includes('car_paint')) &&
                  !matName.includes('white')
                ) {
                  const upgradedPaintMat = this.createPaintMaterial(paintColor);
                  if (Array.isArray(child.material)) {
                    child.material[idx] = upgradedPaintMat;
                  } else {
                    child.material = upgradedPaintMat;
                  }
                } else if (
                  nodeName.includes('glass') ||
                  nodeName.includes('windshield') ||
                  matName.includes('glass') ||
                  matName.includes('windshield')
                ) {
                  const upgradedGlassMat = this.createWindshieldMaterial();
                  if (Array.isArray(child.material)) {
                    child.material[idx] = upgradedGlassMat;
                  } else {
                    child.material = upgradedGlassMat;
                  }
                } else if (
                  nodeName.includes('rim') ||
                  matName.includes('rim')
                ) {
                  const upgradedRimMat = this.createRimMaterial();
                  if (Array.isArray(child.material)) {
                    child.material[idx] = upgradedRimMat;
                  } else {
                    child.material = upgradedRimMat;
                  }
                }
              }
            });
          }
        });

        if (this.carId === 'ford_gt_2006') {
          this.buildFordGtWheels(model, finalScale);
        } else {
          // Search for wheel groups/nodes by name
          const candidates: THREE.Object3D[] = [];
          const posRegex = /\b(front|rear|back|left|right|fl|fr|rl|rr|lf|rf|lr|rr)\b|[_ -](l|r|f|b)(?:\b|[_ -]|\d)/i;

          model.traverse((child: THREE.Object3D) => {
            const name = child.name.toLowerCase();
            const isWheelTireRim = name.includes('wheel') || name.includes('tire') || name.includes('rim');
            if (isWheelTireRim && posRegex.test(child.name)) {
              candidates.push(child);
            }
          });

          // Filter to keep only the highest candidate (no ancestor in candidates)
          originalWheels = candidates.filter(child => {
            let curr = child.parent;
            while (curr && curr !== model) {
              if (candidates.includes(curr)) {
                return false;
              }
              curr = curr.parent;
            }
            return true;
          });

          // Process collected wheels with a 2-level pivot hierarchy:
          //   steerPivot (position + steering Y) → spinNode (rolling X) → wheel mesh
          // This separates steering from spin, preventing axis interference.
          const wheelNodes: THREE.Object3D[] = [];
          originalWheels.forEach((child) => {
            child.updateMatrixWorld(true);

            // Use the bounding-box center as the pivot position, NOT the mesh origin.
            // GLTF models often have mesh origins at the car center, not the wheel center.
            // Using the visual center ensures the spin axis passes through the wheel hub.
            const bbox = new THREE.Box3().setFromObject(child);
            const visualCenter = bbox.getCenter(new THREE.Vector3());

            // Outer group: handles position + steering (Y rotation only)
            const steerPivot = new THREE.Group();
            steerPivot.name = child.name + '_steer';
            this.mesh.add(steerPivot);
            steerPivot.position.copy(this.mesh.worldToLocal(visualCenter.clone()));

            // Apply model visual scale directly to steerPivot since it's now under this.mesh
            steerPivot.scale.set(finalScale, finalScale, finalScale);

            // Inner group: handles rolling spin (X rotation only)
            const spinNode = new THREE.Group();
            steerPivot.add(spinNode);
            steerPivot.userData.spinNode = spinNode;

            // Update matrices so attach() can calculate local transforms correctly using updated world matrices
            steerPivot.updateMatrixWorld(true);

            // Reparent the wheel mesh into spinNode, preserving its world transform.
            spinNode.attach(child);

            // --- Eliminate orbital offset ---
            // Update matrices after attachment to ensure world positions are accurate.
            child.updateMatrixWorld(true);

            // Compute local bounding box of child (including its own geometry and all descendants) in child's local space.
            const localBox = new THREE.Box3();
            child.traverse((node) => {
              if (node instanceof THREE.Mesh && node.geometry) {
                if (!node.geometry.boundingBox) {
                  node.geometry.computeBoundingBox();
                }
                const nodeBox = node.geometry.boundingBox.clone();
                node.updateMatrixWorld(true);
                // Compute transform matrix from node to child
                const m = new THREE.Matrix4().multiplyMatrices(child.matrixWorld.clone().invert(), node.matrixWorld);
                nodeBox.applyMatrix4(m);
                localBox.union(nodeBox);
              }
            });

            const localCenter = localBox.getCenter(new THREE.Vector3());

            // Shift child's own geometry if it is a Mesh
            if (child instanceof THREE.Mesh && child.geometry) {
              child.geometry = child.geometry.clone();
              child.geometry.translate(-localCenter.x, -localCenter.y, -localCenter.z);
            }

            // Shift all immediate children's positions
            child.children.forEach((c) => {
              c.position.sub(localCenter);
            });

            // Reset child's local position to exactly (0, 0, 0) relative to spinNode
            child.position.set(0, 0, 0);

            console.log(`[Wheel] ${child.name} type=${child.type} pos=[${child.position.toArray().map(v => v.toFixed(4))}] quat=[${child.quaternion.toArray().map(v => v.toFixed(4))}] children=${child.children.length}`);

            wheelNodes.push(steerPivot);
          });

          this.wheels = wheelNodes;

          // Search for caliper nodes by name and attach them to the corresponding steerPivot
          model.traverse((child: THREE.Object3D) => {
            const name = child.name.toLowerCase();
            if (name.includes('caliper') || name.includes('calliper')) {
              // Avoid adding submeshes of calipers we already processed
              let hasParentInList = false;
              let p = child.parent;
              while (p && p !== model) {
                const pName = p.name.toLowerCase();
                if (pName.includes('caliper') || pName.includes('calliper')) {
                  hasParentInList = true;
                  break;
                }
                p = p.parent;
              }
              if (hasParentInList) return;

              // Identify its position
              const isFront = name.includes('front') || name.includes('fl') || name.includes('fr') || name.includes('_f');
              const isLeft = /left|\b(l)\b|[_ -]l(?:\b|[_ -]|\d)/i.test(name);
              
              // Find the matching steerPivot
              const matchingWheel = wheelNodes.find(w => {
                const wName = w.name.toLowerCase();
                const wFront = wName.includes('front') || wName.includes('fl') || wName.includes('fr') || wName.includes('_f');
                const wLeft = /left|\b(l)\b|[_ -]l(?:\b|[_ -]|\d)/i.test(wName);
                return wFront === isFront && wLeft === isLeft;
              });
              
              if (matchingWheel) {
                child.updateMatrixWorld(true);
                matchingWheel.updateMatrixWorld(true);
                // Reparent the caliper to steerPivot (not spinNode, so it steers but doesn't spin)
                matchingWheel.attach(child);
                console.log(`[Caliper] Reparented ${child.name} to steerPivot ${matchingWheel.name}`);
              }
            }
          });

          console.log(`[GLTF Load Success] S2000 loaded. Size:`, size, `Scale factor:`, scaleFactor, `Final scale:`, finalScale, `Wheel nodes detected:`, wheelNodes.map(w => w.name));

          // Map front steering wheels
          this.wheels.forEach((wheel) => {
            const name = wheel.name.toLowerCase();
            const isFront = /front|fore|\b(f)\b|[_ -]f(?:\b|[_ -]|\d)/i.test(name);
            const isLeft = /left|\b(l)\b|[_ -]l(?:\b|[_ -]|\d)/i.test(name);

            if (isFront) {
              if (isLeft) {
                this.leftFrontWheel = wheel;
              } else {
                this.rightFrontWheel = wheel;
              }
            }
          });

          // Fallback: If no wheel nodes found in the model, build procedural ones
          if (this.wheels.length === 0) {
            this.buildFallbackWheels();
          } else {
            // If we couldn't properly classify left/right front, assign fallback references
            if (!this.leftFrontWheel || !this.rightFrontWheel) {
              this.leftFrontWheel = this.wheels[0];
              this.rightFrontWheel = this.wheels[1] || this.wheels[0];
            }
          }
        }

        // Add underglow, lights, and exhaust particle systems (only light sources/particles, no duplicate box meshes)
        this.addGltfVisualHelpers();

        onLoadProgress?.(100);
        onLoadComplete?.();
      },
      (xhr: ProgressEvent) => {
        if (xhr.lengthComputable) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          onLoadProgress?.(pct);
        }
      },
      (err: unknown) => {
        console.error('Failed to load Honda S2000 model:', err);
        onLoadComplete?.();
      }
    );
  }

  private splitFordGtMesh(
    mesh: THREE.Mesh,
    model: THREE.Group,
    splitX: boolean,
    splitZ: boolean,
    zThreshold: number = 0
  ): { fl?: THREE.Mesh; fr?: THREE.Mesh; rl?: THREE.Mesh; rr?: THREE.Mesh } {
    const geometry = mesh.geometry;
    if (!geometry) return {};

    // 1. Compute localToModel transform matrix
    mesh.updateMatrixWorld(true);
    model.updateMatrixWorld(true);
    const localToModel = new THREE.Matrix4().multiplyMatrices(model.matrixWorld.clone().invert(), mesh.matrixWorld);

    // 2. Clone and transform geometry so it's in model coordinates
    const modelGeom = geometry.clone();
    modelGeom.applyMatrix4(localToModel);

    // 3. Convert to non-indexed to make splitting simple
    const nonIndexed = modelGeom.index ? modelGeom.toNonIndexed() : modelGeom;
    const posAttr = nonIndexed.getAttribute('position');
    if (!posAttr) return {};

    const normalAttr = nonIndexed.getAttribute('normal');
    const uvAttr = nonIndexed.getAttribute('uv');

    // Quadrant indices arrays
    const flIndices: number[] = [];
    const frIndices: number[] = [];
    const rlIndices: number[] = [];
    const rrIndices: number[] = [];

    const count = posAttr.count;
    for (let i = 0; i < count; i += 3) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);

      const isLeft = x < 0;
      const isFront = z > zThreshold;

      if (isLeft && isFront) {
        flIndices.push(i, i + 1, i + 2);
      } else if (!isLeft && isFront) {
        frIndices.push(i, i + 1, i + 2);
      } else if (isLeft && !isFront) {
        rlIndices.push(i, i + 1, i + 2);
      } else {
        rrIndices.push(i, i + 1, i + 2);
      }
    }

    const result: { fl?: THREE.Mesh; fr?: THREE.Mesh; rl?: THREE.Mesh; rr?: THREE.Mesh } = {};

    const buildSubMesh = (indices: number[], key: 'fl' | 'fr' | 'rl' | 'rr') => {
      if (indices.length === 0) return;
      const subGeom = new THREE.BufferGeometry();
      const subCount = indices.length;

      // Position
      const subPos = new Float32Array(subCount * 3);
      const posData = posAttr.array as Float32Array;
      for (let dst = 0; dst < subCount; dst++) {
        const src = indices[dst];
        subPos[dst * 3] = posData[src * 3];
        subPos[dst * 3 + 1] = posData[src * 3 + 1];
        subPos[dst * 3 + 2] = posData[src * 3 + 2];
      }
      subGeom.setAttribute('position', new THREE.BufferAttribute(subPos, 3));

      // Normal
      if (normalAttr) {
        const subNorm = new Float32Array(subCount * 3);
        const normData = normalAttr.array as Float32Array;
        for (let dst = 0; dst < subCount; dst++) {
          const src = indices[dst];
          subNorm[dst * 3] = normData[src * 3];
          subNorm[dst * 3 + 1] = normData[src * 3 + 1];
          subNorm[dst * 3 + 2] = normData[src * 3 + 2];
        }
        subGeom.setAttribute('normal', new THREE.BufferAttribute(subNorm, 3));
      }

      // UV
      if (uvAttr) {
        const subUv = new Float32Array(subCount * 2);
        const uvData = uvAttr.array as Float32Array;
        for (let dst = 0; dst < subCount; dst++) {
          const src = indices[dst];
          subUv[dst * 2] = uvData[src * 2];
          subUv[dst * 2 + 1] = uvData[src * 2 + 1];
        }
        subGeom.setAttribute('uv', new THREE.BufferAttribute(subUv, 2));
      }

      // Tangent/Color if exists
      ['tangent', 'color'].forEach(attrName => {
        const attr = nonIndexed.getAttribute(attrName);
        if (attr) {
          const itemSize = attr.itemSize;
          const subData = new Float32Array(subCount * itemSize);
          const data = attr.array as Float32Array;
          for (let dst = 0; dst < subCount; dst++) {
            const src = indices[dst];
            for (let k = 0; k < itemSize; k++) {
              subData[dst * itemSize + k] = data[src * itemSize + k];
            }
          }
          subGeom.setAttribute(attrName, new THREE.BufferAttribute(subData, itemSize));
        }
      });

      const subMesh = new THREE.Mesh(subGeom, mesh.material);
      subMesh.name = `${mesh.name}_${key}`;
      subMesh.castShadow = true;
      subMesh.receiveShadow = true;

      result[key] = subMesh;
    };

    if (splitX && splitZ) {
      buildSubMesh(flIndices, 'fl');
      buildSubMesh(frIndices, 'fr');
      buildSubMesh(rlIndices, 'rl');
      buildSubMesh(rrIndices, 'rr');
    } else if (splitX) {
      let avgZ = 0;
      if (count > 0) {
        let sumZ = 0;
        for (let i = 0; i < Math.min(count, 30); i++) {
          sumZ += posAttr.getZ(i);
        }
        avgZ = sumZ / Math.min(count, 30);
      }
      const isFront = avgZ > zThreshold;
      if (isFront) {
        buildSubMesh(flIndices.concat(rlIndices), 'fl');
        buildSubMesh(frIndices.concat(rrIndices), 'fr');
      } else {
        buildSubMesh(flIndices.concat(rlIndices), 'rl');
        buildSubMesh(frIndices.concat(rrIndices), 'rr');
      }
    }

    return result;
  }

  private buildFordGtWheels(model: THREE.Group, finalScale: number) {
    const nodes: {
      ftL?: THREE.Object3D;
      rrL?: THREE.Object3D;
      rims?: THREE.Mesh;
      disks?: THREE.Mesh;
      brakes?: THREE.Mesh;
    } = {};

    model.traverse((child: THREE.Object3D) => {
      const name = child.name.toLowerCase();
      if (name.includes('ford.wheel.ft.l_17')) {
        nodes.ftL = child;
      } else if (name.includes('ford.wheel.ft.l.001_18')) {
        nodes.rrL = child;
      } else if (child instanceof THREE.Mesh) {
        if (name.includes('object_63')) {
          nodes.rims = child;
        } else if (name.includes('object_64')) {
          nodes.disks = child;
        } else if (name.includes('object_57')) {
          nodes.brakes = child;
        }
      }
    });

    const flParts: THREE.Mesh[] = [];
    const frParts: THREE.Mesh[] = [];
    const rlParts: THREE.Mesh[] = [];
    const rrParts: THREE.Mesh[] = [];

    const flBrakes: THREE.Mesh[] = [];
    const frBrakes: THREE.Mesh[] = [];
    const rlBrakes: THREE.Mesh[] = [];
    const rrBrakes: THREE.Mesh[] = [];

    const addParts = (res: { fl?: THREE.Mesh; fr?: THREE.Mesh; rl?: THREE.Mesh; rr?: THREE.Mesh }, isBrake: boolean = false) => {
      if (isBrake) {
        if (res.fl) flBrakes.push(res.fl);
        if (res.fr) frBrakes.push(res.fr);
        if (res.rl) rlBrakes.push(res.rl);
        if (res.rr) rrBrakes.push(res.rr);
      } else {
        if (res.fl) flParts.push(res.fl);
        if (res.fr) frParts.push(res.fr);
        if (res.rl) rlParts.push(res.rl);
        if (res.rr) rrParts.push(res.rr);
      }
    };

    // Split tires
    if (nodes.ftL) {
      nodes.ftL.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          const splitRes = this.splitFordGtMesh(child, model, true, false);
          addParts(splitRes);
        }
      });
    }

    if (nodes.rrL) {
      nodes.rrL.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          const splitRes = this.splitFordGtMesh(child, model, true, false);
          addParts(splitRes);
        }
      });
    }

    // Split rims and disks
    if (nodes.rims) {
      const splitRes = this.splitFordGtMesh(nodes.rims, model, true, true);
      addParts(splitRes);
    }
    if (nodes.disks) {
      const splitRes = this.splitFordGtMesh(nodes.disks, model, true, true);
      addParts(splitRes);
    }

    // Split brake disks/calipers
    if (nodes.brakes) {
      const splitRes = this.splitFordGtMesh(nodes.brakes, model, true, true);
      addParts(splitRes, true);
    }

    // Build 4 wheels
    const positions: ('fl' | 'fr' | 'rl' | 'rr')[] = ['fl', 'fr', 'rl', 'rr'];
    const wheelNodes: THREE.Object3D[] = [];

    positions.forEach((key) => {
      const parts = key === 'fl' ? flParts : key === 'fr' ? frParts : key === 'rl' ? rlParts : rrParts;
      const brakes = key === 'fl' ? flBrakes : key === 'fr' ? frBrakes : key === 'rl' ? rlBrakes : rrBrakes;

      if (parts.length === 0) return;

      // Compute bounding box and center of the parts in model local space
      const bbox = new THREE.Box3();
      parts.forEach((part) => {
        part.geometry.computeBoundingBox();
        if (part.geometry.boundingBox) {
          bbox.union(part.geometry.boundingBox);
        }
      });
      const visualCenter = bbox.getCenter(new THREE.Vector3());

      // Create steerPivot under this.mesh (matching S2000 setup)
      const steerPivot = new THREE.Group();
      steerPivot.name = `ford_wheel_${key}_steer`;
      this.mesh.add(steerPivot);

      const pivotPos = visualCenter.clone().applyMatrix4(model.matrix);
      steerPivot.position.copy(pivotPos);
      steerPivot.scale.set(finalScale, finalScale, finalScale);

      // Create spinNode under steerPivot
      const spinNode = new THREE.Group();
      steerPivot.add(spinNode);
      steerPivot.userData.spinNode = spinNode;

      // Position each part relative to pivot center
      parts.forEach((part) => {
        part.geometry.translate(-visualCenter.x, -visualCenter.y, -visualCenter.z);
        part.position.set(0, 0, 0);
        part.rotation.set(0, 0, 0);
        part.scale.set(1, 1, 1);
        spinNode.add(part);
      });

      // Add brakes to steerPivot (not spinNode) so they steer but don't spin
      brakes.forEach((brake) => {
        brake.geometry.translate(-visualCenter.x, -visualCenter.y, -visualCenter.z);
        brake.position.set(0, 0, 0);
        brake.rotation.set(0, 0, 0);
        brake.scale.set(1, 1, 1);
        steerPivot.add(brake);
      });

      wheelNodes.push(steerPivot);

      // Assign to leftFrontWheel / rightFrontWheel
      if (key === 'fl') {
        this.leftFrontWheel = steerPivot;
      } else if (key === 'fr') {
        this.rightFrontWheel = steerPivot;
      }
    });

    this.wheels = wheelNodes;

    // Remove original merged nodes to avoid double rendering
    if (nodes.ftL) nodes.ftL.parent?.remove(nodes.ftL);
    if (nodes.rrL) nodes.rrL.parent?.remove(nodes.rrL);
    if (nodes.rims) nodes.rims.parent?.remove(nodes.rims);
    if (nodes.disks) nodes.disks.parent?.remove(nodes.disks);
    if (nodes.brakes) nodes.brakes.parent?.remove(nodes.brakes);

    console.log(`[Ford GT Wheel Splitting Success] Split into ${wheelNodes.length} wheels:`, wheelNodes.map(w => w.name));
  }

  private buildFallbackWheels() {
    const wheelGeom = new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.44, 16);
    wheelGeom.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111115,
      roughness: 0.8,
    });
    const rimGeom = new THREE.CylinderGeometry(this.wheelRadius * (0.28 / 0.48), this.wheelRadius * (0.28 / 0.48), 0.46, 8);
    rimGeom.rotateZ(Math.PI / 2);
    const rimMat = this.createRimMaterial();

    const createWheelAssembly = (x: number, y: number, z: number, isFront: boolean) => {
      const steerPivot = new THREE.Group();
      steerPivot.position.set(x, y, z);

      const spinNode = new THREE.Group();
      steerPivot.add(spinNode);
      steerPivot.userData.spinNode = spinNode;

      const tire = new THREE.Mesh(wheelGeom, wheelMat);
      const rim = new THREE.Mesh(rimGeom, rimMat);
      spinNode.add(tire);
      spinNode.add(rim);

      this.mesh.add(steerPivot);
      this.wheels.push(steerPivot);

      if (isFront) {
        if (x < 0) this.leftFrontWheel = steerPivot;
        else this.rightFrontWheel = steerPivot;
      }
    };

    createWheelAssembly(-1.25, 0.48, 1.6, true);
    createWheelAssembly(1.25, 0.48, 1.6, true);
    createWheelAssembly(-1.25, 0.48, -1.6, false);
    createWheelAssembly(1.25, 0.48, -1.6, false);
  }

  private addGltfVisualHelpers() {
    // 1. Front spot light beam (Realistic Xenon white headlight projection)
    const frontSpot = new THREE.SpotLight(0xe0e8ff, 4, 30, Math.PI / 4, 0.5, 1);
    frontSpot.position.set(0, 0.5, 2.5);
    frontSpot.target.position.set(0, 0, 10);
    this.mesh.add(frontSpot);
    this.mesh.add(frontSpot.target);
  }

  public updateStats() {
    const config = CARS_DATABASE.find(c => c.id === this.carId) || CARS_DATABASE[0];
    // Convert maxSpeed from km/h (database) to m/s (physics).
    // This is critical: all tire force calculations (Pacejka, friction circle) use v²,
    // so using km/h directly inflated cornering forces by ~13× causing instant grip loss.
    this.maxSpeed = config.maxSpeed / 3.6;
    this.accelerationRate = config.accelerationRate;
    this.handlingRate = config.handlingRate;
    this.brakingRate = config.brakingRate !== undefined ? config.brakingRate : 0.8;
    this.dragCoeff = config.dragCoeff;
    this.driveType = config.driveType;
    if (config.gearRatios) {
      this.gearRatios = config.gearRatios;
    }
    if (config.wheelRadius !== undefined) {
      this.wheelRadius = config.wheelRadius;
    }
    this.hasSpoiler = config.hasSpoiler;
    this.boosterColor = config.boosterColor;

    // --- APPLY DYNAMIC PERFORMANCE CALCULATIONS FROM UPGRADES ---

    // Calculate base mass from tier
    let baseMass = 1200;
    if (config.tier === 'Sport Tier') baseMass = 1100;
    else if (config.tier === 'Hyper Tier') baseMass = 1000;
    else if (config.tier === 'Legendary Tier') baseMass = 950;
    
    if (config.baseMass !== undefined) {
      baseMass = config.baseMass;
    }
    this.baseMass = baseMass;

    // [UPGRADE IMPACT]: Weight Reduction stage directly drops target mass (lighter = quicker)
    this.mass = this.baseMass - (this.upgrades.weightReduction * 80);

    // [UPGRADE IMPACT]: Suspension improves cornering responsive thresholds
    this.handlingRate = config.handlingRate + (this.upgrades.suspensionLevel * 0.005);

    // [UPGRADE IMPACT]: Brake Level upgrades absolute stopping capability
    this.brakingRate = (config.brakingRate !== undefined ? config.brakingRate : 0.8) + (this.upgrades.brake.level * 0.25);

    // [UPGRADE IMPACT]: Engine blueprinting/balancing & ECU expansion raises structural safety limits for RPM
    const configMaxRpm = config.maxRpm !== undefined ? config.maxRpm : 6500;
    this.maxRpm = configMaxRpm + (this.upgrades.engine.ecuLevel * 250) + (this.upgrades.engine.engineBalancingLevel * 350);

    // [UPGRADE IMPACT]: Custom Gearbox ratio setups increase potential Top Speed bound caps (in m/s)
    if (this.upgrades.driveTrain.gearboxLevel > 0) {
      this.maxSpeed += this.upgrades.driveTrain.gearboxLevel * (config.maxSpeed / 3.6 * 0.03); // 3% increase per level
    }

    // Load GT4-style car character from database
    if (config.character) {
      this.character = { ...config.character };
    }

    const isTruck = config.id === 'cybertruck';
    const isEntry = config.tier === 'Entry Tier';
    const isSport = config.tier === 'Sport Tier';
    const isHyper = config.tier === 'Hyper Tier';
    const isLegendary = config.tier === 'Legendary Tier';
    const defaultWheelbase = isTruck ? 3.25 : isEntry ? 2.58 : isSport ? 2.65 : isHyper ? 2.72 : 2.78;
    const defaultTrackWidth = isTruck ? 1.92 : isEntry ? 1.56 : isSport ? 1.62 : isHyper ? 1.72 : 1.78;
    const defaultCgHeight = isTruck ? 0.72 : isEntry ? 0.56 : isSport ? 0.49 : isHyper ? 0.43 : 0.40;
    const defaultFrontalArea = isTruck ? 2.85 : isEntry ? 2.18 : isSport ? 2.05 : isHyper ? 1.92 : 1.86;
    const defaultCd = isTruck ? 0.38 : isEntry ? 0.32 : isSport ? 0.31 : isHyper ? 0.30 : 0.29;
    const defaultCl = config.hasSpoiler ? (isLegendary ? 0.48 : isHyper ? 0.40 : 0.24) : (isHyper || isLegendary ? 0.18 : 0.06);

    this.frontWeightDistribution = config.frontWeightDistribution ?? this.character.weightDistribution;
    this.wheelBase = config.wheelbase ?? defaultWheelbase;
    this.trackWidth = config.trackWidth ?? defaultTrackWidth;
    this.cgHeight = Math.max(0.25, config.cgHeight ?? (defaultCgHeight - this.upgrades.suspensionLevel * 0.012));
    this.frontalArea = config.frontalArea ?? defaultFrontalArea;
    this.dragCoefficient = config.dragCoefficient ?? defaultCd;
    this.liftCoefficient = config.liftCoefficient ?? defaultCl;
    this.tireGripFront = config.tireGripFront ?? 1.0;
    this.tireGripRear = config.tireGripRear ?? this.character.rearGripMultiplier;
    this.corneringStiffnessFront = config.corneringStiffnessFront ?? THREE.MathUtils.clamp(4.8 + config.handling * 0.22, 5.4, 8.2);
    this.corneringStiffnessRear = config.corneringStiffnessRear ?? THREE.MathUtils.clamp(4.8 + config.handling * 0.22, 5.4, 8.2);
    this.maxSteeringAngle = config.maxSteeringAngle ?? (config.id === 'driftmaster' ? 0.68 : isTruck ? 0.48 : isHyper || isLegendary ? 0.50 : 0.56);
    this.rollingResistanceCoefficient = config.rollingResistanceCoefficient ?? (isTruck ? 0.018 : 0.014);
    this.shiftUpMph = config.shiftUpMph ?? [];
    this.brakeForce = config.brakeForce ?? this.mass * (8.4 + this.brakingRate * 2.0 + this.upgrades.brake.level * 0.9);
    this.yawInertia = config.yawInertia ?? (
      this.mass * (this.wheelBase * this.wheelBase + this.trackWidth * this.trackWidth) / 12 * this.character.yawInertia
    );
    this.differential = {
      accelLock: config.differential?.accelLock ?? (this.driveType === 'RWD' ? 0.42 : this.driveType === 'AWD' ? 0.35 : 0.22),
      decelLock: config.differential?.decelLock ?? (this.driveType === 'RWD' ? 0.22 : 0.14),
      preload: config.differential?.preload ?? 0.05,
      awdFrontBias: config.differential?.awdFrontBias ?? 0.4
    };
    this.torqueCurve = [...(config.torqueCurve ?? this.buildDefaultTorqueCurve(config, this.maxRpm))]
      .sort((a, b) => a.rpm - b.rpm);

    // Sync tire compound from upgrades (fallback to economy if undefined)
    this.tireState.compound = this.upgrades.tireCompound || 'economy';

    // Tune the final drive dynamically so that top gear (Gear 6) reaches maxSpeed at (maxRpm - 500)
    if (config.finalDrive !== undefined) {
      this.finalDrive = config.finalDrive;
    } else {
      const topGearRatio = this.gearRatios[6] || 0.80;
      const targetRpm = this.maxRpm - 500;
      const radPerSecToRpm = 60 / (2 * Math.PI);
      this.finalDrive = (targetRpm * this.wheelRadius) / (this.maxSpeed * topGearRatio * radPerSecToRpm);
    }
  }

  private handleCountdown(isCountdown: boolean): boolean {
    if (isCountdown) {
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.set(0, this.yaw, 0);
      return true;
    }
    return false;
  }

  private parseInputs(keys: { [key: string]: boolean | number | undefined }) {
    const throttle = keys['w'] || keys['arrowup'];
    const reverse = keys['s'] || keys['arrowdown'];
    const turnLeft = keys['a'] || keys['arrowleft'];
    const turnRight = keys['d'] || keys['arrowright'];
    const handbrake = !!keys[' '] || !!keys['space'] || !!keys['spacebar'];
    const isShiftPressed = !!keys['shift'];

    let throttleValue = typeof keys['throttleAnalog'] === 'number' ? keys['throttleAnalog'] : (throttle ? 1.0 : 0.0);
    let reverseValue = typeof keys['reverseAnalog'] === 'number' ? keys['reverseAnalog'] : (reverse ? 1.0 : 0.0);
    const turnInput = typeof keys['steerAnalog'] === 'number' ? keys['steerAnalog'] : ((turnLeft ? 1 : 0) - (turnRight ? 1 : 0));

    // Capping keyboard throttle and brake inputs to 50% if the Shift key is held
    if (isShiftPressed) {
      if (typeof keys['throttleAnalog'] !== 'number' && throttle) {
        throttleValue = 0.5;
      }
      if (typeof keys['reverseAnalog'] !== 'number' && reverse) {
        reverseValue = 0.5;
      }
    }

    return { throttleValue, reverseValue, turnInput, handbrake };
  }

  private processEngineRpm(deltaTime: number, throttleValue: number): void {
    this.handleAutoTransmission(deltaTime);

    const gearRatio = this.gearRatios[this.currentGear];
    const wheelRpm = (this.wheelSpeed / this.wheelRadius) * gearRatio * this.finalDrive * (60 / (2 * Math.PI));

    const engineInertia = 0.05 + (0.15 - this.upgrades.driveTrain.flywheelLevel * 0.04) + 0.03;
    const baseTorque = this.getTorque(this.rpm);
    const combustionTorque = baseTorque * throttleValue;
    const frictionTorque = 15 + 0.012 * this.rpm;

    // Rev limiter cut logic
    if (this.rpm >= this.maxRpm - 20) {
      this.isRevLimiterCut = true;
    }
    if (this.isRevLimiterCut && this.rpm < this.maxRpm - 300) {
      this.isRevLimiterCut = false;
    }

    if (this.isRevLimiterCut) {
      this.rpm = (this.maxRpm - 150) + Math.sin(performance.now() * 0.05) * 100;
    } else if (this.isShifting) {
      // Clutch disengaged: engine revs freely
      const netTorque = combustionTorque - frictionTorque;
      const rpmChange = (netTorque / engineInertia) * (60 / (2 * Math.PI)) * deltaTime;
      this.rpm = Math.max(1000, Math.min(this.maxRpm, this.rpm + rpmChange));
    } else {
      // Clutch engaged
      if (this.speed < 0) {
        this.rpm = 1000 + Math.abs(this.speed) * 3.6 * 100;
      } else if (wheelRpm < 1000) {
        // Clutch slips at launch (drivetrain speed below idle)
        const slipFactor = Math.max(0, (this.rpm - 1000) / 1000);
        const clutchCapacity = 300 * (1.0 + this.upgrades.driveTrain.clutchLevel * 0.2);
        const clutchLoad = clutchCapacity * slipFactor * Math.max(0.1, throttleValue);

        const netTorque = combustionTorque - frictionTorque - clutchLoad;
        const rpmChange = (netTorque / engineInertia) * (60 / (2 * Math.PI)) * deltaTime;
        this.rpm = Math.max(1000, Math.min(this.maxRpm, this.rpm + rpmChange));
      } else {
        // Clutch locked to wheels
        this.rpm = wheelRpm;
      }
    }

    this.rpm = Math.max(1000, Math.min(this.rpm, this.maxRpm));

    if (this.upgrades.aspiration === 'turbo') {
      const inBoostRange = this.rpm > 3200 && this.rpm < 5800 && throttleValue > 0.1;
      if (inBoostRange) {
        this.turboSpoolLevel = Math.min(1.0, this.turboSpoolLevel + deltaTime * 2.0);
      } else {
        this.turboSpoolLevel = Math.max(0.0, this.turboSpoolLevel - deltaTime * 1.25);
      }
    }
  }

  /**
   * Compute forward and lateral velocity in the car's local frame.
   * Forward = along the car's heading. Lateral = perpendicular (positive = rightward).
   */
  private getLocalVelocity(): { forward: number; lateral: number } {
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);
    // Heading vector is (sinYaw, 0, cosYaw) in world space
    const forward = this.velocityX * sinYaw + this.velocityZ * cosYaw;
    const lateral = this.velocityX * cosYaw - this.velocityZ * sinYaw;
    return { forward, lateral };
  }

  /**
   * Apply a force in the car's local frame to world-space velocity.
   * @param forwardForce - Force along the car's heading (N). Positive = forward.
   * @param lateralForce - Force perpendicular to heading (N). Positive = rightward.
   * @param deltaTime - Frame time (s).
   */
  private applyLocalForce(forwardForce: number, lateralForce: number, deltaTime: number): void {
    const accelForward = forwardForce / this.mass;
    const accelLateral = lateralForce / this.mass;

    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);

    // Convert local acceleration to world space and integrate
    this.velocityX += (accelForward * sinYaw + accelLateral * cosYaw) * deltaTime;
    this.velocityZ += (accelForward * cosYaw - accelLateral * sinYaw) * deltaTime;
  }

  /**
   * Get the effective tire grip coefficient, accounting for compound, wear, surface, and upgrades.
   */
  private getEffectiveTireGrip(): number {
    const surfaceGrip = this.grassInstability > 0 ? (1.0 - 0.45 * this.grassInstability) : 1.0;
    
    // Only apply wear penalty if tire wear is enabled (Endurance Mode)
    const activeWear = this.tireWearEnabled ? this.tireState.wear : 0.0;
    const baseGrip = getEffectiveGrip(this.tireState.compound, activeWear, surfaceGrip);
    
    // Suspension upgrade improves grip slightly
    return baseGrip + this.upgrades.suspensionLevel * 0.03;
  }

  /**
   * NEW: Velocity-based tire physics — replaces the old handleSpinAndDrift + handleGripCircleAndDrag + updateSteeringAndYaw.
   *
   * This method:
   * 1. Computes front/rear slip angles from the velocity vector
   * 2. Uses TireModel to produce lateral forces (Pacejka-lite)
   * 3. Applies drive forces (engine torque) through the correct axle
   * 4. Updates yaw via bicycle model
   * 5. Derives speed, driftAngle, isDrifting from the velocity vector
   */
  private updateTirePhysics(
    deltaTime: number,
    throttleValue: number,
    reverseValue: number,
    turnInput: number,
    handbrake: boolean
  ): void {
    const local = this.getLocalVelocity();
    const absForward = Math.abs(local.forward);

    // --- STEERING INPUT: smoothly interpolate steer angle with speed sensitivity and assists ---
    // At high speeds, full steering angle causes instant tire saturation (extreme understeer).
    // We scale down the max steering angle based on speed to keep tires near peak grip.
    // However, if the player is drifting or handbraking, we allow a wider steering angle to control the slide or spin.
    const isDriftingOrHandbraking = this.isDrifting || handbrake;
    const steeringSpeedRatio = THREE.MathUtils.clamp(absForward / 45, 0, 1);
    const steeringFalloff = THREE.MathUtils.smoothstep(steeringSpeedRatio, 0.12, 0.92);
    const highSpeedSteerLimit = this.maxSteeringAngle * (isDriftingOrHandbraking ? 0.38 : 0.16);
    const maxSteer = THREE.MathUtils.lerp(this.maxSteeringAngle, highSpeedSteerLimit, steeringFalloff);

    // Dynamic Countersteer Assist (Stability Helper)
    // Disabled if handbrake is pulled or if the slide exceeds the point of no return (driftAngle >= 0.75 rad)
    let assistSteer = 0;
    if (absForward > 5 && Math.abs(this.driftAngle) > 0.05 && !handbrake && Math.abs(this.driftAngle) < 0.75) {
      const isCounterSteer = turnInput * this.driftAngle < 0;
      const isNeutral = Math.abs(turnInput) < 0.05;
      
      let assistFactor = 0.0;
      if (isNeutral) {
        assistFactor = 0.45; // Auto-align wheels to help stabilize
      } else if (isCounterSteer) {
        assistFactor = 0.70; // Help player catch the slide
      } else {
        assistFactor = 0.10; // Player steering into slide, reduce assist
      }

      // Fade out assist as the slide gets extreme (approaching spin-out)
      if (Math.abs(this.driftAngle) > 0.5) {
        const fade = (0.75 - Math.abs(this.driftAngle)) / 0.25;
        assistFactor *= Math.max(0, fade);
      }

      // Scale assist with speed
      assistFactor *= Math.min(1.0, absForward / 8.0);
      
      assistSteer = -this.driftAngle * assistFactor;
    }

    const targetSteerAngle = turnInput * maxSteer + assistSteer;

    // Dynamic Steering Rate: fast countersteer, smoother turn-in
    let lerpSpeed = 10; // hands-off return rate
    if (Math.abs(turnInput) > 0.05) {
      const isCounterSteer = turnInput * this.driftAngle < 0;
      lerpSpeed = isCounterSteer ? 22 : 5; // Fast catch, smooth turn-in
    }
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteerAngle, lerpSpeed * deltaTime);

    // Visual wheel steering: applied to the steerPivot (Y rotation only)
    if (this.leftFrontWheel && this.rightFrontWheel) {
      const ackermann = this.getAckermannWheelAngles(this.steerAngle);
      this.leftFrontWheel.rotation.y = ackermann.left;
      this.rightFrontWheel.rotation.y = ackermann.right;
    }

    // Visual wheel spin: applied to the spinNode child (X rotation only)
    // Using a shared angle prevents per-wheel floating-point drift.
    // Rotate wheels visually using this.wheelSpeed instead of local.forward.
    const directionSign = local.forward >= 0 ? 1 : -1;
    const wheelRotSpeed = (this.wheelSpeed * directionSign / this.wheelRadius) * deltaTime;
    this.wheelSpinAngle += wheelRotSpeed;
    // Normalize to prevent precision loss from unbounded accumulation
    if (this.wheelSpinAngle > Math.PI * 2) this.wheelSpinAngle -= Math.PI * 2;
    if (this.wheelSpinAngle < -Math.PI * 2) this.wheelSpinAngle += Math.PI * 2;
    this.wheels.forEach(wheel => {
      const spinNode = wheel.userData.spinNode as THREE.Group | undefined;
      if (spinNode) {
        // Enforce X rotation is spin, and Y/Z are strictly zero to prevent any axis drift
        spinNode.rotation.x = this.wheelSpinAngle;
        spinNode.rotation.y = 0;
        spinNode.rotation.z = 0;

        // Lock child position relative to spinNode to exactly (0, 0, 0)
        // to prevent any drift/orbiting in Z or Y axes during rotation.
        spinNode.children.forEach(child => {
          child.position.set(0, 0, 0);
        });
      }

      // Enforce X and Z rotations are strictly zero on the steerPivot
      wheel.rotation.x = 0;
      wheel.rotation.z = 0;

      // If this is NOT a front steering wheel, make sure its Y rotation is also strictly 0
      const isFront = wheel === this.leftFrontWheel || wheel === this.rightFrontWheel;
      if (!isFront) {
        wheel.rotation.y = 0;
      }
    });

    // --- EFFECTIVE GRIP ---
    const baseGripCoeff = this.getEffectiveTireGrip();

    let bankAngleRad = 0;
    if (this.getTrackInfo) {
      const info = this.getTrackInfo(this.pos.x, this.pos.z);
      if (info && info.banking !== undefined) {
        bankAngleRad = info.banking * (Math.PI / 180);
      }
    }

    // Centrifugal acceleration component normal to track: speed * yawRate * sin(bankAngle)
    const centAccelNormal = (this.speed * this.yawRate) * Math.sin(bankAngleRad);
    // Effective gravity: gravity * cos(bankAngle) + centAccelNormal
    const effectiveGravity = Math.max(1.0, GRAVITY * Math.cos(bankAngleRad) + centAccelNormal);
    const aeroDownforce = 0.5 * AIR_DENSITY * this.liftCoefficient * this.frontalArea * absForward * absForward;
    const totalWeight = this.mass * effectiveGravity + aeroDownforce;

    const lateralAccelEstimate = local.forward * this.yawRate;
    this.lateralAccel = THREE.MathUtils.lerp(this.lateralAccel, lateralAccelEstimate, 8.0 * deltaTime);

    const longitudinalTransfer = (this.mass * this.longitudinalAccel * this.cgHeight) / this.wheelBase;
    const lateralTransfer = Math.abs((this.mass * this.lateralAccel * this.cgHeight) / this.trackWidth);

    const staticFrontWeight = totalWeight * this.frontWeightDistribution;
    const staticRearWeight = totalWeight * (1.0 - this.frontWeightDistribution);

    // Clamp transfer to prevent negative weight (maximum 80% transfer of static load)
    const maxTransfer = Math.min(staticFrontWeight * 0.8, staticRearWeight * 0.8);
    const clampedTransfer = THREE.MathUtils.clamp(longitudinalTransfer, -maxTransfer, maxTransfer);

    this.dynamicFrontWeight = staticFrontWeight - clampedTransfer;
    this.dynamicRearWeight = staticRearWeight + clampedTransfer;

    const frontWeight = this.dynamicFrontWeight;
    const rearWeight = this.dynamicRearWeight;

    // --- FRONT AXLE: slip angle ---
    // Front tire velocity in local frame includes yaw rate contribution
    // Front axle is wheelBase * weightDistribution ahead of CG
    const frontAxleDist = this.wheelBase * (1.0 - this.frontWeightDistribution);
    const frontLateralVel = local.lateral + this.yawRate * frontAxleDist;
    // Front tires are steered, so their slip angle is relative to the steer direction
    const frontSlipAngle = computeSlipAngle(
      frontLateralVel * Math.cos(this.steerAngle) - local.forward * Math.sin(this.steerAngle),
      local.forward * Math.cos(this.steerAngle) + frontLateralVel * Math.sin(this.steerAngle)
    );

    // --- REAR AXLE: slip angle ---
    const rearAxleDist = this.wheelBase * this.frontWeightDistribution;
    const rearLateralVel = local.lateral - this.yawRate * rearAxleDist;
    const rearSlipAngle = computeSlipAngle(rearLateralVel, local.forward);

    // Store for external access
    this.rearSlipAngle = Math.abs(rearSlipAngle);

    // --- TIRE GRIP MODIFIERS ---
    const lateralTransferRatio = THREE.MathUtils.clamp(lateralTransfer / Math.max(totalWeight, 1), 0, 0.45);
    const loadSensitivity = 1.0 - lateralTransferRatio * 0.18;
    let frontGrip = baseGripCoeff * this.tireGripFront * loadSensitivity;
    let rearGrip = baseGripCoeff * this.tireGripRear * loadSensitivity;

    // Handbrake: dramatically reduce rear grip to initiate drift
    if (handbrake) {
      rearGrip *= 0.15;
    }

    // Lift-off oversteer: sudden throttle release shifts weight forward, unloading rear
    const throttleDrop = this.prevThrottleValue - throttleValue;
    if (throttleDrop > 0.4 && absForward > 20 && Math.abs(turnInput) > 0.15) {
      const liftOffSeverity = throttleDrop * (1.0 - this.character.oversteerResistance) * (1.0 - this.frontWeightDistribution);
      rearGrip *= (1.0 - liftOffSeverity * 0.5);
    }

    // Power oversteer for RWD: excess throttle on rear tires reduces their lateral grip
    // Works at all speeds (including standstill) to allow burnouts, donuts, and low-speed power slides.
    if (this.driveType === 'RWD' && throttleValue > 0.7) {
      // Scale power oversteer factor: strong at low speed, progressively safer at highway speed.
      const speedOversteerScale = absForward < 10
        ? 1.5 - (absForward / 10) * 0.5
        : THREE.MathUtils.clamp(1.0 - ((absForward - 10) / 45) * 0.72, 0.28, 1.0);
      const powerOversteerFactor = (1.0 - this.character.rearGripMultiplier * 0.7) * throttleValue * 0.45 * speedOversteerScale;
      rearGrip *= Math.max(0.1, 1.0 - powerOversteerFactor);
    }

    // ESC: boost rear grip when sliding
    if (this.upgrades.brake.hasESC && Math.abs(rearSlipAngle) > 0.05 && !handbrake) {
      rearGrip *= 1.35;
    }

    // ABS: when braking, prevent front grip from collapsing
    let brakingSteerReduction = 1.0;
    if (reverseValue > 0.01 && local.forward > 0) {
      if (this.upgrades.brake.hasABS) {
        brakingSteerReduction = 0.90; // Slight reduction but steering maintained
      } else {
        brakingSteerReduction = 0.35; // Severe understeer under braking without ABS
        frontGrip *= 0.7;
      }
    }

    // --- DRIVE & BRAKE FORCES (Torque-based, no arcade multiplier) ---
    let driveForce = 0;
    if (throttleValue > 0.01) {
      const currentTorque = this.getTorque(this.rpm);
      let gearEfficiency = (this.isShifting || this.isRevLimiterCut) ? 0.0 : 0.85;

      if (!this.isShifting && !this.isRevLimiterCut) {
        gearEfficiency = 0.83 + (this.upgrades.driveTrain.clutchLevel * 0.04) + (this.upgrades.driveTrain.propellerShaftLevel * 0.02);
        if (gearEfficiency > 0.98) gearEfficiency = 0.98;
      }

      driveForce = (currentTorque * this.gearRatios[this.currentGear] * this.finalDrive * gearEfficiency) / this.wheelRadius;
      driveForce *= throttleValue;

      // TCS: reduce drive force at low speed to prevent wheelspin
      if (this.upgrades.bodyControlModuleLevel > 0 && absForward < 12) {
        const tcsFactor = 1.0 - (0.12 * this.upgrades.bodyControlModuleLevel);
        driveForce *= tcsFactor;
      }
    }

    // Braking force
    let brakeForce = 0;
    if (reverseValue > 0.01 && local.forward > 0.5) {
      brakeForce = -this.brakeForce * reverseValue;
    } else if (reverseValue > 0.01 && local.forward <= 0.5) {
      // Reversing (uses engine torque in 1st/reverse gear instead of accelerationRate)
      if (local.forward > -12.0) { // Limit reverse speed to ~43 km/h
        const currentTorque = this.getTorque(this.rpm);
        let gearEfficiency = (this.isShifting || this.isRevLimiterCut) ? 0.0 : 0.85;
        if (!this.isShifting && !this.isRevLimiterCut) {
          gearEfficiency = 0.83 + (this.upgrades.driveTrain.clutchLevel * 0.04) + (this.upgrades.driveTrain.propellerShaftLevel * 0.02);
          if (gearEfficiency > 0.98) gearEfficiency = 0.98;
        }
        const reverseGearRatio = this.gearRatios[1];
        driveForce = -(currentTorque * reverseGearRatio * this.finalDrive * gearEfficiency * reverseValue) / this.wheelRadius;
      }
    }
    if (throttleValue > 0.01 && local.forward < -0.5) {
      // Brake from reverse
      brakeForce = this.brakeForce * throttleValue;
    }

    // Handbrake braking force: locks the rear wheels, applying heavy braking force
    let handbrakeBrakeForce = 0;
    if (handbrake) {
      const speedSign = Math.sign(local.forward) || 1;
      const lowSpeedScale = Math.min(1.0, absForward / 0.5);
      handbrakeBrakeForce = -this.brakeForce * 0.75 * speedSign * lowSpeedScale;
    }

    // DragForce = 0.5 * air density * Cd * frontal area * velocity^2
    const dragForce = -0.5 * AIR_DENSITY * this.dragCoefficient * this.frontalArea * local.forward * Math.abs(local.forward);
    let rollingResistance = -this.rollingResistanceCoefficient * totalWeight * Math.sign(local.forward);
    if (this.grassInstability > 0) {
      rollingResistance -= this.rollingResistanceCoefficient * 4.0 * this.grassInstability * totalWeight * Math.sign(local.forward);
    }

    // Engine braking when coasting
    let engineBraking = 0;
    if (throttleValue <= 0.01 && reverseValue <= 0.01 && absForward > 0.5) {
      engineBraking = -2.5 * this.mass * Math.sign(local.forward);
    }

    // Split driveForce and engineBraking per axle based on driveType
    let frontDrive = 0;
    let rearDrive = 0;
    let frontEngineBrake = 0;
    let rearEngineBrake = 0;

    const diffLock = this.getDifferentialLock(throttleValue, reverseValue);
    const awdFrontBias = THREE.MathUtils.clamp(this.differential.awdFrontBias ?? 0.4, 0.2, 0.8);

    if (this.driveType === 'FWD') {
      frontDrive = driveForce;
      frontEngineBrake = engineBraking;
    } else if (this.driveType === 'RWD') {
      rearDrive = driveForce;
      rearEngineBrake = engineBraking;
    } else { // AWD
      frontDrive = driveForce * awdFrontBias;
      rearDrive = driveForce * (1.0 - awdFrontBias);
      frontEngineBrake = engineBraking * awdFrontBias;
      rearEngineBrake = engineBraking * (1.0 - awdFrontBias);
    }

    // Handbrake disables rear drive force
    if (handbrake) {
      rearDrive *= 0.05;
    }

    const frontMaxGrip = frontGrip * frontWeight;
    const rearMaxGrip = rearGrip * rearWeight;
    const frontDriveGripLimit = frontMaxGrip * (0.86 + diffLock * 0.12);
    const rearDriveGripLimit = rearMaxGrip * (0.86 + diffLock * 0.12);

    // --- TORQUE-INDUCED TRACTION LOSS (WHEELSPIN) ---
    let isWheelspinning = false;
    let excessForce = 0;

    if (this.driveType === 'FWD') {
      const absFrontDrive = Math.abs(frontDrive);
      if (absFrontDrive > frontDriveGripLimit) {
        isWheelspinning = true;
        excessForce = absFrontDrive - frontDriveGripLimit;
      }
    } else if (this.driveType === 'RWD') {
      const absRearDrive = Math.abs(rearDrive);
      if (absRearDrive > rearDriveGripLimit) {
        isWheelspinning = true;
        excessForce = absRearDrive - rearDriveGripLimit;
      }
    } else { // AWD
      const absTotalDrive = Math.abs(frontDrive + rearDrive);
      const totalGrip = frontDriveGripLimit + rearDriveGripLimit;
      if (absTotalDrive > totalGrip) {
        isWheelspinning = true;
        excessForce = absTotalDrive - totalGrip;
      }
    }

    if (isWheelspinning) {
      // Accelerate wheelSpeed using excess force over effective wheel mass (100 kg)
      const wheelAccel = excessForce / 100;
      this.wheelSpeed += wheelAccel * deltaTime;
      
      // Clamp wheelSpeed based on maxRpm in current gear
      const gearRatio = this.gearRatios[this.currentGear] || 1.0;
      const maxWheelSpeedForRpm = (this.maxRpm * 2 * Math.PI / 60) * this.wheelRadius / (gearRatio * this.finalDrive);
      this.wheelSpeed = Math.min(this.wheelSpeed, maxWheelSpeedForRpm);

      // Clamp actual propulsive force to sliding grip (0.85 * grip limit)
      const forceSign = Math.sign(driveForce) || 1;
      if (this.driveType === 'FWD') {
        frontDrive = forceSign * frontDriveGripLimit;
      } else if (this.driveType === 'RWD') {
        rearDrive = forceSign * rearDriveGripLimit;
      } else { // AWD
        frontDrive = forceSign * frontDriveGripLimit * awdFrontBias;
        rearDrive = forceSign * rearDriveGripLimit * (1.0 - awdFrontBias);
      }

      // Decrease lateral grip coefficient (0.25 for 2WD, 0.45 for AWD)
      if (this.driveType === 'AWD') {
        frontGrip *= THREE.MathUtils.lerp(0.45, 0.68, diffLock);
        rearGrip *= THREE.MathUtils.lerp(0.45, 0.68, diffLock);
      } else if (this.driveType === 'FWD') {
        frontGrip *= THREE.MathUtils.lerp(0.25, 0.50, diffLock);
      } else if (this.driveType === 'RWD') {
        rearGrip *= THREE.MathUtils.lerp(0.25, 0.50, diffLock);
      }
    } else {
      // If handbrake is pulled and we are RWD, wheels lock up completely
      if (handbrake && this.driveType === 'RWD') {
        this.wheelSpeed = 0;
      } else {
        // Lock wheelSpeed to absForward, with gradual spin-down decay if it was spinning
        if (this.wheelSpeed > absForward + 0.1) {
          this.wheelSpeed = THREE.MathUtils.lerp(this.wheelSpeed, absForward, 10.0 * deltaTime);
        } else {
          this.wheelSpeed = absForward;
        }
      }
    }

    // --- LATERAL FORCES (Pacejka-lite) ---
    let frontLatForce = -computeLateralForce(frontSlipAngle, frontGrip, frontWeight, this.corneringStiffnessFront);
    let rearLatForce = -computeLateralForce(rearSlipAngle, rearGrip, rearWeight, this.corneringStiffnessRear);

    // Dampen lateral forces at very low speeds
    const lowSpeedDampener = Math.min(1.0, absForward / 4.0);
    frontLatForce *= lowSpeedDampener;
    rearLatForce *= lowSpeedDampener;

    // Apply braking steer reduction to front lateral force
    frontLatForce *= brakingSteerReduction;

    // Split brakeForce using a 60/40 front/rear bias
    const frontBrake = brakeForce * 0.6;
    const rearBrake = brakeForce * 0.4 + handbrakeBrakeForce;

    // Longitudinal contact patch forces for combined grip circle
    let frontLongForce = frontDrive + frontBrake + frontEngineBrake;
    let rearLongForce = rearDrive + rearBrake + rearEngineBrake;

    // ABS and non-ABS lock-up emulation to allow steering while braking
    if (reverseValue > 0.01 && local.forward > 0.5) {
      if (this.upgrades.brake.hasABS) {
        frontLongForce = Math.sign(frontLongForce) * Math.min(Math.abs(frontLongForce), frontMaxGrip * 0.90);
        rearLongForce = Math.sign(rearLongForce) * Math.min(Math.abs(rearLongForce), rearMaxGrip * 0.90);
      } else {
        frontLongForce = Math.sign(frontLongForce) * Math.min(Math.abs(frontLongForce), frontMaxGrip * 0.95);
        rearLongForce = Math.sign(rearLongForce) * Math.min(Math.abs(rearLongForce), rearMaxGrip * 0.95);
      }
    }

    // --- COMBINED GRIP CIRCLE using updated grip values ---
    const updatedFrontMaxGrip = frontGrip * frontWeight;
    const updatedRearMaxGrip = rearGrip * rearWeight;

    const frontCombined = combinedGripCircle(frontLatForce, frontLongForce, updatedFrontMaxGrip);
    frontLatForce = frontCombined.lateral;
    frontLongForce = frontCombined.longitudinal;

    const rearCombined = combinedGripCircle(rearLatForce, rearLongForce, updatedRearMaxGrip);
    rearLatForce = rearCombined.lateral;
    rearLongForce = rearCombined.longitudinal;

    const totalForwardForce = frontLongForce + rearLongForce + dragForce + rollingResistance;

    // --- YAW RATE: bicycle model ---
    // Torque about CG from front and rear lateral forces
    const yawTorque = frontLatForce * frontAxleDist - rearLatForce * rearAxleDist;
    // Yaw moment of inertia determines how quickly the car can rotate.
    // Adjusted multiplier to 1.15 to make the car feel planted and prevent instant oversteer.
    const yawMomentOfInertia = this.yawInertia;

    const yawAccel = yawTorque / Math.max(yawMomentOfInertia, 100);

    // Yaw rate damping to prevent infinite oscillation, dynamically increased during high slides
    let dynamicYawDamping = 0.92;
    if (Math.abs(this.driftAngle) > 0.1) {
      // Scale damping up (damping coefficient down to 0.82)
      const driftSeverity = Math.min(1.0, (Math.abs(this.driftAngle) - 0.1) / 0.5);
      dynamicYawDamping = THREE.MathUtils.lerp(0.92, 0.82, driftSeverity);
    }
    this.yawRate = (this.yawRate + yawAccel * deltaTime) * Math.pow(dynamicYawDamping, deltaTime * 60);

    // Integrate yaw
    if (absForward > 0.3 || Math.abs(this.yawRate) > 0.01) {
      this.yaw += this.yawRate * deltaTime;
    }

    // Grass yaw oscillation (preserved from old system)
    if (this.grassInstability > 0 && absForward > 8) {
      const time = performance.now() * 0.001;
      const speedRatio = absForward / this.maxSpeed;
      const freq = 4.0 + absForward * 0.06;
      const yawOscillation = Math.sin(time * freq) * 0.008 * this.grassInstability * speedRatio;
      this.yaw += yawOscillation * 60 * deltaTime;

      const steerNoise = (Math.random() - 0.5) * 0.025 * this.grassInstability * speedRatio;
      this.steerAngle += steerNoise;
    }

    // --- APPLY FORCES TO VELOCITY ---
    const lateralGravityForce = -this.mass * GRAVITY * Math.sin(bankAngleRad);
    const totalLatForce = frontLatForce + rearLatForce + lateralGravityForce; 
    this.applyLocalForce(totalForwardForce, totalLatForce, deltaTime);

    // Damp lateral velocity at low speeds to prevent endless sideways sliding/creeping
    const postLocal = this.getLocalVelocity();
    if (Math.abs(postLocal.forward) < 4.0 && Math.abs(postLocal.lateral) > 0.01) {
      const dampRatio = Math.max(0, 1.0 - Math.abs(postLocal.forward) / 4.0); // 1.0 at 0 speed, 0.0 at 4 m/s
      // Apply lateral velocity damping to simulate static tire friction
      const dampedLateral = postLocal.lateral * Math.pow(0.82, dampRatio * deltaTime * 60);
      
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);
      this.velocityX = postLocal.forward * sinYaw + dampedLateral * cosYaw;
      this.velocityZ = postLocal.forward * cosYaw - dampedLateral * sinYaw;
    }

    // --- SPEED LIMITING ---
    const newLocal = this.getLocalVelocity();
    const currentSpeed = newLocal.forward;

    if (currentSpeed > this.maxSpeed * 1.25) {
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);
      const clampedForward = this.maxSpeed * 1.25;
      this.velocityX = clampedForward * sinYaw + newLocal.lateral * cosYaw;
      this.velocityZ = clampedForward * cosYaw - newLocal.lateral * sinYaw;
    }

    if (this.isRevLimiterCut && currentSpeed <= this.maxSpeed) {
      this.isRevLimiterCut = false;
    }

    // Clamp reverse speed
    if (currentSpeed < -this.maxSpeed * 0.3) {
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);
      const clampedForward = -this.maxSpeed * 0.3;
      this.velocityX = clampedForward * sinYaw + newLocal.lateral * cosYaw;
      this.velocityZ = clampedForward * cosYaw - newLocal.lateral * sinYaw;
    }

    // Stop at very low speed when no input
    if (throttleValue <= 0.01 && reverseValue <= 0.01) {
      const totalVelSq = this.velocityX * this.velocityX + this.velocityZ * this.velocityZ;
      if (totalVelSq < 0.25) {
        this.velocityX = 0;
        this.velocityZ = 0;
      }
    }

    // --- DERIVE PUBLIC PROPERTIES from velocity ---
    const finalLocal = this.getLocalVelocity();
    this.speed = finalLocal.forward;

    // driftAngle: angle between heading and velocity direction
    if (Math.abs(finalLocal.forward) > 1.0) {
      this.driftAngle = -Math.atan2(finalLocal.lateral, Math.abs(finalLocal.forward));
    } else {
      this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, 0, 5.0 * deltaTime);
    }

    // isDrifting: when rear slip angle is significant
    this.isDrifting = Math.abs(this.driftAngle) > 0.08 && absForward > 8 && this.isGrounded;

    // --- TIRE WEAR ---
    if (this.tireWearEnabled) {
      const avgSlip = (Math.abs(frontSlipAngle) + Math.abs(rearSlipAngle)) * 0.5;
      const brakeIntensity = reverseValue > 0.01 && local.forward > 0 ? reverseValue : 0;
      accumulateWear(this.tireState, absForward / this.maxSpeed, avgSlip, brakeIntensity, deltaTime);
    }

    this.prevThrottleValue = throttleValue;
  }

  private updatePositionAndEnforceBoundaries(deltaTime: number): void {
    applyGrassSpeedReduction(this, deltaTime);
    applyGrassLateralSlide(this, deltaTime);

    // Integrate position from velocity
    // With velocity in m/s, position integrates at physically correct rate (no dampening needed)
    const visualSpeedScale = 1.0;
    this.pos.x += this.velocityX * visualSpeedScale * deltaTime;
    this.pos.z += this.velocityZ * visualSpeedScale * deltaTime;

    enforceFenceBoundary(this, deltaTime);
  }

  private updateGravitySuspensionAndRoll(
    deltaTime: number,
    speedBeforeFrame: number,
    speedRatio: number,
    turnInput: number
  ): void {
    const rawAccel = (this.speed - speedBeforeFrame) / Math.max(deltaTime, 0.001);
    this.longitudinalAccel = THREE.MathUtils.lerp(this.longitudinalAccel, rawAccel, 6.0 * deltaTime);

    let targetGroundHeight = 0;
    let curbRoll = 0;
    if (this.getGroundHeight) {
      const rightDir = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      const leftPos = this.pos.clone().addScaledVector(rightDir, -1.25);
      const rightPos = this.pos.clone().addScaledVector(rightDir, 1.25);

      const hLeft = this.getGroundHeight(leftPos.x, leftPos.z);
      const hRight = this.getGroundHeight(rightPos.x, rightPos.z);

      targetGroundHeight = (hLeft + hRight) / 2;
      curbRoll = (hRight - hLeft) / 2.5;
    }

    if (!this.isGrounded) {
      this.yVelocity -= 18 * deltaTime;
      this.pos.y += this.yVelocity * deltaTime;

      this.pitch = THREE.MathUtils.lerp(this.pitch, this.yVelocity > 0 ? 0.15 : -0.2, 0.08 * 60 * deltaTime);

      if (this.pos.y <= targetGroundHeight) {
        this.pos.y = targetGroundHeight;
        this.yVelocity = 0;
        this.isGrounded = true;
        this.pitch = 0;
        this.suspensionOffset = -0.06;
      }
    } else {
      const accelPitchInfluence = THREE.MathUtils.clamp(this.longitudinalAccel * 0.0012, -0.06, 0.04);

      if (this.isShifting && this.shiftPitchImpulse === 0) {
        this.shiftPitchImpulse = -0.025;
      }
      if (!this.isShifting && this.shiftPitchImpulse !== 0) {
        this.shiftPitchImpulse = 0.015;
      }
      this.shiftPitchImpulse = THREE.MathUtils.lerp(this.shiftPitchImpulse, 0, 5.0 * deltaTime);

      const targetPitch = -accelPitchInfluence + this.shiftPitchImpulse;
      this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, 8.0 * deltaTime);

      const heightDelta = targetGroundHeight - this.pos.y;
      if (heightDelta > 0.05) {
        this.suspensionOffset = THREE.MathUtils.clamp(this.suspensionOffset - heightDelta * 0.4, -0.15, 0.05);
      }

      this.pos.y = THREE.MathUtils.lerp(this.pos.y, targetGroundHeight, 15 * deltaTime);
    }

    if (this.isGrounded) {
      const corneringLoad = Math.abs(this.steerAngle) * speedRatio * 0.03;
      const brakingLoad = (this.longitudinalAccel < -2) ? Math.abs(this.longitudinalAccel) * 0.004 : 0;
      const accelLift = (this.longitudinalAccel > 2) ? this.longitudinalAccel * 0.001 : 0;

      const stiffness = 1.0 - (this.upgrades.suspensionLevel * 0.15);
      const targetSuspension = -(corneringLoad + brakingLoad - accelLift) * Math.max(0.4, stiffness);

      this.suspensionOffset = THREE.MathUtils.lerp(this.suspensionOffset, targetSuspension, 6.0 * deltaTime);

      if (this.grassInstability > 0 && Math.abs(this.speed) > 5) {
        const vibFreq = 12.0 + Math.abs(this.speed) * 0.3;
        const stiffnessFactor = 1.0 + (this.upgrades.suspensionLevel * 0.2);
        const vibAmp = 0.010 * speedRatio * this.grassInstability * stiffnessFactor;
        const bumpVibration = Math.sin(performance.now() * 0.001 * vibFreq) * vibAmp;
        this.suspensionOffset += bumpVibration;

        const rollVib = (Math.random() - 0.5) * 0.012 * this.grassInstability * speedRatio * stiffnessFactor;
        const pitchVib = (Math.random() - 0.5) * 0.008 * this.grassInstability * speedRatio * stiffnessFactor;
        this.roll += rollVib;
        this.pitch += pitchVib;
      }
    } else {
      this.suspensionOffset = THREE.MathUtils.lerp(this.suspensionOffset, 0.02, 3.0 * deltaTime);
    }

    let rollDampening = 0.12 - (this.upgrades.suspensionLevel * 0.02);
    if (rollDampening < 0.04) rollDampening = 0.04;
    const targetRoll = -turnInput * rollDampening * speedRatio + curbRoll;
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, 0.15 * 60 * deltaTime);

    this.mesh.position.set(this.pos.x, this.pos.y + this.suspensionOffset, this.pos.z);
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll);
  }

  public update(deltaTime: number, keys: { [key: string]: boolean | number | undefined }, isCountdown: boolean = false) {
    if (this.handleCountdown(isCountdown)) {
      return;
    }

    updateGrassInstability(this, deltaTime);

    const speedBeforeFrame = this.speed;
    const { throttleValue, reverseValue, turnInput, handbrake } = this.parseInputs(keys);

    // Track active inputs for telemetry HUD
    this.throttleInput = throttleValue;
    const localVel = this.getLocalVelocity();
    let activeBrake = 0;
    if (reverseValue > 0.01 && localVel.forward > 0.5) {
      activeBrake = reverseValue;
    } else if (throttleValue > 0.01 && localVel.forward < -0.5) {
      activeBrake = throttleValue;
    }
    if (handbrake) {
      activeBrake = Math.max(activeBrake, 1.0);
    }
    this.brakeInput = activeBrake;

    this.processEngineRpm(deltaTime, throttleValue);

    // NEW: unified tire physics replaces the old separate methods
    this.updateTirePhysics(deltaTime, throttleValue, reverseValue, turnInput, handbrake);

    const speedRatio = Math.abs(this.speed) / this.maxSpeed;

    this.updatePositionAndEnforceBoundaries(deltaTime);

    this.updateGravitySuspensionAndRoll(deltaTime, speedBeforeFrame, speedRatio, turnInput);

    // Update taillight materials based on brakeInput (glows bright red when braking, dims otherwise)
    const isBraking = this.brakeInput > 0.05;
    this.taillightMaterials.forEach(mat => {
      if (isBraking) {
        mat.color.setHex(0xff0000);
        mat.emissive.setHex(0xff0000);
        mat.emissiveIntensity = 4.0;
      } else {
        mat.color.setHex(0x550000);
        mat.emissive.setHex(0x220000);
        mat.emissiveIntensity = 0.5;
      }
    });
  }

  /**
   * Scale the velocity vector by a factor. Use this instead of `speed *= factor`
   * when external code needs to reduce/increase vehicle speed.
   */
  public scaleVelocity(factor: number): void {
    this.velocityX *= factor;
    this.velocityZ *= factor;
    this.speed = this.getLocalVelocity().forward;
  }

  /**
   * Set the forward speed directly, preserving the current heading direction.
   * Use this instead of `speed = value` when external code needs to set speed.
   */
  public setForwardSpeed(newSpeed: number): void {
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    this.velocityX = newSpeed * sinYaw;
    this.velocityZ = newSpeed * cosYaw;
    this.speed = newSpeed;
  }

  public reset(pos: THREE.Vector3, yaw: number) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.yVelocity = 0;
    this.isGrounded = true;
    this.isDrifting = false;
    this.driftAngle = 0;
    this.steerAngle = 0;
    this.turboSpoolLevel = 0;
    this.suspensionOffset = 0;
    this.prevSpeed = 0;
    this.longitudinalAccel = 0;
    this.lateralAccel = 0;
    this.shiftPitchImpulse = 0;
    this.rearSlipAngle = 0;
    this.yawRate = 0;
    this.isSpinning = false;
    this.spinTimer = 0;
    this.prevThrottleValue = 0;
    this.currentGear = 1;
    this.rpm = 1000;
    this.isShifting = false;
    this.shiftTimer = 0;
    this.targetGear = 1;
    this.previousGear = 1;
    this.isRevLimiterCut = false;
    this.grassInstability = 0;
    this.wheelSpinAngle = 0;

    // Reset velocity-based physics
    this.velocityX = 0;
    this.velocityZ = 0;

    // Reset tire wear (but keep compound selection)
    this.tireState.wear = 0;

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
  }
}
