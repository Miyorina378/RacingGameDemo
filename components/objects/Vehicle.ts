import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  CARS_DATABASE,
  type CarConfig,
  type DifferentialConfig,
  type TorquePoint,
  type TransmissionType
} from '../config/CarDatabase';
import { updateGrassInstability, applyGrassLateralSlide, applyGrassSpeedReduction } from './Grass';
import { enforceFenceBoundary } from './Fence';
import {
  computeLateralForce,
  computeLongitudinalForce,
  computeSlipAngle,
  computeSlipRatio,
  computeCamberEffects,
  relaxTireValue,
  combinedGripCircle
} from './TireModel';
import {
  TireCompoundType,
  TireState,
  createFreshTireState,
  getEffectiveGrip,
  getTirePressureEffects,
  TIRE_COMPOUNDS,
  updateTireTemperature,
  accumulateWear
} from './TireCompound';
import {
  SuspensionModel,
  SuspensionOutput,
  SuspensionCorner,
  createSuspensionSetup
} from './SuspensionModel';
import {
  MassDynamics,
  MassProperties
} from './MassDynamics';
import {
  PowerSteeringType,
  updateSteeringSystem
} from './SteeringModel';
import {
  computeEngineFrictionTorque,
  getEngineTemperatureTorqueMultiplier,
  getVariableValveTimingMultiplier,
  updateEngineTemperature
} from './EngineModel';
import {
  computeFuelConsumption,
  computeFuelDeliveryFactor
} from './FuelModel';

const AIR_DENSITY = 1.225;
const GRAVITY = 9.81;

export class Vehicle {
  public mesh: THREE.Group;
  public wheels: THREE.Object3D[] = [];
  public leftFrontWheel?: THREE.Object3D;
  public rightFrontWheel?: THREE.Object3D;
  public leftRearWheel?: THREE.Object3D;
  public rightRearWheel?: THREE.Object3D;

  // Shader materials tracking
  private paintMaterials: THREE.MeshPhysicalMaterial[] = [];
  private windshieldMaterials: THREE.MeshPhysicalMaterial[] = [];
  private rimMaterials: THREE.MeshPhysicalMaterial[] = [];
  private underglowMaterial?: THREE.ShaderMaterial;
  private taillightMaterials: THREE.MeshStandardMaterial[] = [];
  private visualGeneration = 0;
  private committedVisualCarId: string | null = null;
  private visualOrphanedGeometries = new Set<THREE.BufferGeometry>();
  private visualOrphanedMaterials = new Set<THREE.Material>();

  // Physics parameters
  public pos = new THREE.Vector3(0, 0, 0);
  public yaw = 0; // Heading direction in radians
  public pitch = 0;
  public roll = 0;
  public speed = 0; // Signed forward projection used by drivetrain and direction logic
  public groundSpeed = 0; // Magnitude of planar velocity, independent of car heading
  public yVelocity = 0; // For jumps
  public isGrounded = true;
  public isDrifting = false;
  public driftAngle = 0; // Derived: angle between heading and velocity vector
  public steerAngle = 0; // Smoothly interpolated steering angle for physics and visuals
  public steeringWheelAngle = 0;
  public steeringTorqueNm = 0;
  public steeringAssistFraction = 0;
  public getGroundHeight?: (x: number, z: number, yHint?: number) => number;
  /** Smooth support surface without curb or verge steps, used only for slope. */
  public getSlopeHeight?: (x: number, z: number, yHint?: number) => number;
  public getTrackInfo?: (x: number, z: number, yHint?: number) => {
    dist: number;
    closestPt: THREE.Vector3;
    closestIdx?: number;
    width?: number;
    leftScale?: number;
    rightScale?: number;
    sideSign?: number;
    trackBoundary?: number;
    banking?: number;
    curb?: boolean;
    grassWidth?: number;
    fence?: boolean;
  };
  public onFenceCollision?: (contactPt: THREE.Vector3) => void;
  public haveFence = false;
  public trackBoundary = 0;
  public grassInstability = 0; // Progressive instability factor on grass (0.0 to 1.0)
  public isOnGrass?: (x: number, z: number, yHint?: number) => boolean;
  public getSpurInfo?: (x: number, z: number, yHint?: number) => {
    dist: number;
    sideSign: 1 | -1;
    closestPt: THREE.Vector3;
    normal: THREE.Vector3;
    tangent: THREE.Vector3;
    halfWidth: number;
    haveCurb: boolean;
    curbWidth: number;
    haveGrass: boolean;
    grassWidth: number;
    fence: boolean;
    trackBoundary: number;
    onAsphalt: boolean;
    onCurb: boolean;
    onGrass: boolean;
    baseHeight: number;
    spurIndex: number;
  } | null;
  public getSpurBarriers?: () => {
    center: THREE.Vector3;
    normal: THREE.Vector3;
    tangent: THREE.Vector3;
    halfWidth: number;
    halfDepth: number;
    height: number;
  }[];

  // --- 2D VELOCITY-BASED PHYSICS ---
  public velocityX = 0;   // World-space X velocity (m/s)
  public velocityZ = 0;   // World-space Z velocity (m/s)
  public wheelBase = 3.2;  // Distance between front and rear axles (m)
  public trackWidth = 1.62; // Distance between left and right wheels (m)
  public cgHeight = 0.52;   // Center of gravity height above ground (m)
  public yawInertia = 2600; // Yaw moment of inertia (kg*m^2)
  public pitchInertia = 2800;
  public rollInertia = 850;

  // --- TIRE COMPOUND SYSTEM ---
  public tireState: TireState = createFreshTireState('economy');
  public tireWearEnabled = false;  // Only true in endurance mode

  // --- REALISM ENHANCEMENT VARIABLES ---
  public turboSpoolLevel = 0;       // 0.0–1.0 spool-up fraction for turbo lag
  public engineTemperature = 25;
  public engineThrottlePosition = 0;
  public fuelCapacityLiters = 50;
  public fuelLiters = 50;
  public fuelConsumptionLitersPerHour = 0;
  public fuelDeliveryFactor = 1;
  public isEngineStalled = false;
  public fuelTowRequired = false;
  public suspensionOffset = 0;      // Vertical chassis displacement from suspension compression
  public prevSpeed = 0;             // Previous frame speed for computing longitudinal acceleration
  public longitudinalAccel = 0;     // Smoothed acceleration value (m/s²) for pitch effects
  /** Ground slope under the car, in its own axes: +pitch climbing, +roll right-side-high. */
  public terrainPitchRad = 0;
  public terrainRollRad = 0;
  /** World height of the surface under the contact patches — what the body rides at. */
  public supportHeight = 0;
  public shiftPitchImpulse = 0;     // Transient pitch impulse during gear shifts
  private wheelSpinAngle = 0;       // Accumulated wheel rolling angle (radians) for visual spin

  // --- SPIN-OUT & CAR CHARACTER VARIABLES ---
  public rearSlipAngle = 0;         // Current rear tire slip angle (radians)
  public yawRate = 0;               // Angular velocity of the car's rotation (rad/s)
  public isSpinning = false;        // True when car has entered unrecoverable spin
  public spinTimer = 0;             // Time remaining in spin animation
  public prevThrottleValue = 0;     // Previous frame throttle for lift-off oversteer detection
  private previousTurnInput = 0;
  private steeringReversalTimer = 0;
  public throttleInput = 0;
  public brakeInput = 0;
  private serviceBrakePressure = 0;

  // --- ADVANCED PHYSICS PROPERTIES ---
  public wheelSpeed = 0;            // Rotation speed of driving wheels (m/s)
  public frontWheelSpeed = 0;       // Front tire tread speed at the contact patch (m/s)
  public rearWheelSpeed = 0;        // Rear tire tread speed at the contact patch (m/s)
  public dynamicFrontWeight = 0;    // Dynamic weight on front axle (N)
  public dynamicRearWeight = 0;     // Dynamic weight on rear axle (N)
  public lateralAccel = 0;          // Smoothed lateral acceleration estimate (m/s^2)
  public brakeTemperatureFront = 25;
  public brakeTemperatureRear = 25;
  private suspensionModel = new SuspensionModel(
    createSuspensionSetup(1200, 0.52, 0)
  );
  private suspensionOutput?: SuspensionOutput;
  private massDynamics = new MassDynamics({
    totalMass: 1200,
    wheelbase: 3.2,
    trackWidth: 1.62,
    cgHeight: 0.52,
    frontWeightDistribution: 0.52
  });
  private massProperties: MassProperties = this.massDynamics.getProperties();
  private relaxedFrontSlipAngle = 0;
  private relaxedRearSlipAngle = 0;
  // How much the friction ellipse had to scale each axle's forces on the previous
  // substep, 1 meaning it was inside the ellipse. Carried forward one 1/120 s step so
  // the wheel ODE knows how much longitudinal force the contact patch can really
  // transmit: when cornering has used the grip, torque beyond that spins the wheel.
  private frontEllipseScale = 1;
  private rearEllipseScale = 1;
  private revMatchTargetRpm = 1000;
  private clutchEngagement = 1;
  private torqueConverterMultiplier = 1;
  // Engine speed used to arm and release the rev limiter, kept separate from the
  // displayed rpm so the limiter's own bounce oscillation cannot latch it on.
  private limiterReferenceRpm = 1000;
  private dryMass = 1200;
  private dryFrontWeightDistribution = 0.52;
  private dryCgHeight = 0.52;
  private fuelTankLongitudinalPosition = -0.2;
  private fuelTankHeight = 0.30;
  private fuelDensityKgPerLiter = 0.745;
  private brakeSpecificFuelConsumption = 285;
  private massEngineLayout: 'front' | 'front_mid' | 'mid' | 'rear' = 'front_mid';
  private massConcentration = 1;
  private yawInertiaOverride?: number;
  private unsprungMassPerWheel = 38;
  private lastConfiguredFuelMass = -1;
  private readonly wheelInertiaPerWheel = 1.35; // kg*m^2
  public rearSteerAngle = 0;

  // Physics runs on a fixed step so a 144 Hz machine and a 30 Hz machine produce the
  // same car. The tire and wheel equations are stiff enough that stepping them at the
  // render rate changed how the car handled with framerate.
  private static readonly PHYSICS_TIMESTEP = 1 / 120;
  private static readonly MAX_PHYSICS_SUBSTEPS = 8;
  private physicsTimeAccumulator = 0;
  // Simulated seconds since reset. Anything periodic inside the physics step must be
  // driven from this rather than from performance.now(), or wall-clock phase leaks
  // back in and the fixed timestep stops guaranteeing anything: the rev-limiter
  // oscillation feeds the upshift decision, so a wall-clock phase difference alone
  // could leave the car in a different gear.
  public physicsTime = 0;

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
  // Fraction of total downforce carried by the front axle. Below 0.5 for anything
  // with a rear wing, which is what makes a spoilered car gain rear grip with speed.
  public aeroBalanceFront = 0.44;
  public frontalArea = 2.1;
  public tireGripFront = 1.0;
  public tireGripRear = 1.0;
  public corneringStiffnessFront = 6.5;
  public corneringStiffnessRear = 6.5;
  public frontCamberDegrees = -1.0;
  public rearCamberDegrees = -1.0;
  public brakeForce = 12000;
  public maxSteeringAngle = 0.55;
  public rearSteeringRatio = 0;
  public rearSteeringMaxAngle = 0;
  public steeringResponse = 1;
  public steeringRackRatio = 15;
  public powerSteeringType: PowerSteeringType = 'electric';
  public pneumaticTrail = 0.065;
  public casterTrail = 0.038;
  public rollingResistanceCoefficient = 0.014;
  public shiftUpMph: number[] = [];
  public differential: DifferentialConfig = {
    accelLock: 0.25,
    decelLock: 0.12,
    preload: 0.04,
    awdFrontBias: 0.4
  };
  public driveType: 'FWD' | 'RWD' | 'AWD' = 'RWD';
  public powertrainType: 'combustion' | 'electric' = 'combustion';
  public engineDisplacementLiters = 2.0;
  public throttleResponse = 8;
  public variableValveTiming = false;
  public variableValveEngageRpm = 6000;
  public variableValveTorqueGain = 0.1;
  public engineCoolingEfficiency = 1;
  public transmissionType: TransmissionType = 'automatic';
  public torqueConverterStallRpm = 2400;
  public torqueConverterStallRatio = 1.85;
  public speedLimiterMultiplier = 1.25;

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
  public drivingMode: any = 'arcade';

  constructor(carId: string = 'starter', color: string = '#f43f5e', bodyKit?: string, onLoadProgress?: (progress: number) => void, onLoadComplete?: () => void) {
    this.carId = carId;
    this.color = color;
    this.mesh = new THREE.Group();
    this.updateStats();
    const generation = ++this.visualGeneration;
    this.buildMesh(onLoadProgress, onLoadComplete, generation, carId, color);
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

  private getDefaultFuelCapacity(
    config: CarConfig,
    emptyMass: number
  ): number {
    if (config.powertrainType === 'electric') return 0;
    const driveTypeReserve =
      config.driveType === 'AWD' ? 4 : config.driveType === 'RWD' ? 2 : 0;
    const estimatedCapacity =
      31 +
      this.engineDisplacementLiters * 4.2 +
      emptyMass * 0.008 +
      config.maxSpeed * 0.028 +
      driveTypeReserve;
    return Math.round(THREE.MathUtils.clamp(estimatedCapacity, 38, 88) * 2) / 2;
  }

  private refreshMassProperties(force: boolean = false): void {
    const fuelMass =
      this.fuelLiters * this.fuelDensityKgPerLiter;
    if (
      !force &&
      Math.abs(fuelMass - this.lastConfiguredFuelMass) < 0.05
    ) {
      return;
    }

    this.lastConfiguredFuelMass = fuelMass;
    this.mass = this.dryMass + fuelMass;
    const fuelFrontShare = THREE.MathUtils.clamp(
      this.fuelTankLongitudinalPosition + 0.5,
      0,
      1
    );
    this.frontWeightDistribution = THREE.MathUtils.clamp(
      (
        this.dryMass * this.dryFrontWeightDistribution +
        fuelMass * fuelFrontShare
      ) / Math.max(this.mass, 1),
      0.32,
      0.68
    );
    this.cgHeight = Math.max(
      0.18,
      (
        this.dryMass * this.dryCgHeight +
        fuelMass * this.fuelTankHeight
      ) / Math.max(this.mass, 1)
    );

    this.massProperties = this.massDynamics.configure({
      totalMass: this.mass,
      wheelbase: this.wheelBase,
      trackWidth: this.trackWidth,
      cgHeight: this.cgHeight,
      frontWeightDistribution: this.frontWeightDistribution,
      engineLayout: this.massEngineLayout,
      massConcentration: this.massConcentration,
      yawInertiaOverride:
        this.yawInertiaOverride !== undefined
          ? this.yawInertiaOverride *
            (this.mass / Math.max(this.dryMass, 1))
          : undefined,
      unsprungMassPerWheel: this.unsprungMassPerWheel
    });
    this.yawInertia = this.massProperties.inertia.yaw;
    this.pitchInertia = this.massProperties.inertia.pitch;
    this.rollInertia = this.massProperties.inertia.roll;
    this.suspensionModel.setSetup(
      createSuspensionSetup(
        this.massProperties.sprungMass,
        this.frontWeightDistribution,
        this.upgrades.suspensionLevel
      )
    );
  }

  public refuel(fillFraction: number = 1): void {
    this.fuelLiters =
      this.fuelCapacityLiters *
      THREE.MathUtils.clamp(fillFraction, 0, 1);
    this.fuelDeliveryFactor = 1;
    this.fuelConsumptionLitersPerHour = 0;
    this.isEngineStalled = false;
    this.fuelTowRequired = false;
    this.refreshMassProperties(true);
  }

  public getFuelRatio(): number {
    if (this.fuelCapacityLiters <= 0) return 1;
    return THREE.MathUtils.clamp(
      this.fuelLiters / this.fuelCapacityLiters,
      0,
      1
    );
  }

  private updateFuelSystem(deltaTime: number): void {
    if (
      this.powertrainType === 'electric' ||
      this.fuelCapacityLiters <= 0
    ) {
      this.fuelDeliveryFactor = 1;
      this.fuelConsumptionLitersPerHour = 0;
      this.isEngineStalled = false;
      return;
    }

    this.fuelDeliveryFactor = computeFuelDeliveryFactor(
      this.fuelLiters,
      this.fuelCapacityLiters,
      this.lateralAccel,
      this.longitudinalAccel
    );
    const estimatedEngineTorque =
      this.getTorque(this.rpm) *
      this.engineThrottlePosition;
    const fuelUse = computeFuelConsumption({
      powertrainType: this.powertrainType,
      rpm: this.rpm,
      maxRpm: this.maxRpm,
      engineTorqueNm: estimatedEngineTorque,
      throttle: this.engineThrottlePosition,
      displacementLiters: this.engineDisplacementLiters,
      brakeSpecificFuelConsumption:
        this.brakeSpecificFuelConsumption,
      turboBoost: this.turboSpoolLevel,
      fuelDensityKgPerLiter: this.fuelDensityKgPerLiter,
      overrunFuelCut:
        this.engineThrottlePosition < 0.015 &&
        this.rpm > 1500 &&
        this.groundSpeed > 2,
      deltaTime
    });
    this.fuelConsumptionLitersPerHour =
      fuelUse.litersPerHour;
    this.fuelLiters = Math.max(
      0,
      this.fuelLiters - fuelUse.consumedLiters
    );
    this.refreshMassProperties();

    if (this.fuelLiters <= 0.0001) {
      this.fuelLiters = 0;
      this.fuelDeliveryFactor = 0;
      this.isEngineStalled = true;
      this.fuelTowRequired = true;
    }
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

  private getDrivenWheelSpeed(): number {
    if (this.driveType === 'FWD') return this.frontWheelSpeed;
    if (this.driveType === 'RWD') return this.rearWheelSpeed;

    const frontBias = THREE.MathUtils.clamp(this.differential.awdFrontBias ?? 0.4, 0.2, 0.8);
    return this.frontWheelSpeed * frontBias + this.rearWheelSpeed * (1.0 - frontBias);
  }

  private getAxleEquivalentMass(): number {
    return (
      (2.0 * this.wheelInertiaPerWheel) /
      Math.max(this.wheelRadius * this.wheelRadius, 0.01)
    );
  }

  /**
   * Integrate one axle's wheel speed from the real rotational equation of motion:
   *
   *   I_axle * dω/dt = T_applied - Fx * r
   *
   * Expressed at the contact patch (v = ω * r) this becomes
   * m_eq * dv/dt = F_applied - Fx, with m_eq = 2 * I_wheel / r².
   *
   * The tire force is very stiff with respect to wheel speed (dFx/dv grows as
   * ground speed falls), so a plain explicit step would need well over 300 Hz to
   * stay stable at low speed. Linearizing Fx about the current wheel speed and
   * taking the step semi-implicitly makes it unconditionally stable, which is what
   * lets wheelspin and lockup emerge from the tire curve instead of from clamps.
   *
   * `maxLongitudinalForce` is the slice of the friction ellipse cornering has not
   * already used. Capping the tire force here rather than deleting the excess is
   * what makes power oversteer and brake lockup fall out naturally: torque the
   * tire cannot transmit accelerates the wheel instead of the car.
   */
  private integrateAxleWheelSpeed(
    currentWheelSpeed: number,
    appliedForce: number,
    gripCoefficient: number,
    normalLoad: number,
    maxLongitudinalForce: number,
    groundSpeed: number,
    deltaTime: number
  ): { wheelSpeed: number; longitudinalForce: number; slipRatio: number } {
    const forceAtWheelSpeed = (wheelSpeed: number): number => {
      const slip = computeSlipRatio(wheelSpeed, groundSpeed);
      return THREE.MathUtils.clamp(
        computeLongitudinalForce(slip, gripCoefficient, normalLoad, 10.0),
        -maxLongitudinalForce,
        maxLongitudinalForce
      );
    };

    const slipRatio = computeSlipRatio(currentWheelSpeed, groundSpeed);
    const tireForce = forceAtWheelSpeed(currentWheelSpeed);
    const probe = 0.05;
    const localStiffness = Math.max(
      0,
      (forceAtWheelSpeed(currentWheelSpeed + probe) - tireForce) / probe
    );

    const axleEquivalentMass = this.getAxleEquivalentMass();
    let nextWheelSpeed =
      currentWheelSpeed +
      (deltaTime * (appliedForce - tireForce)) /
        (axleEquivalentMass + deltaTime * localStiffness);

    // A locked wheel stops rotating; braking torque cannot drive it backwards.
    if (
      Math.abs(groundSpeed) > 0.5 &&
      appliedForce * groundSpeed < 0 &&
      nextWheelSpeed * groundSpeed < 0
    ) {
      nextWheelSpeed = 0;
    }

    return {
      wheelSpeed: nextWheelSpeed,
      longitudinalForce: forceAtWheelSpeed(nextWheelSpeed),
      slipRatio
    };
  }

  // ดึงค่าแรงบิดตามกราฟรอบเครื่องยนต์ (Torque Curve)
  private getTorque(currentRpm: number): number {
    let torque = this.sampleTorqueCurve(currentRpm);

    if (this.powertrainType === 'electric') {
      return Math.max(0, torque);
    }

    torque += this.upgrades.mufflers * 8;
    torque *= 1.0 + this.upgrades.engine.ecuLevel * 0.035;

    const highRpmBlend = THREE.MathUtils.smoothstep(currentRpm, this.maxRpm * 0.62, this.maxRpm);
    torque *= 1.0 + highRpmBlend * this.upgrades.engine.portGrindingLevel * 0.04;

    if (this.variableValveTiming) {
      torque *= getVariableValveTimingMultiplier(
        currentRpm,
        this.variableValveEngageRpm,
        this.variableValveTorqueGain
      );
    }

    // [UPGRADE IMPACT]: Turbo Aspiration with realistic spool-up lag
    if (this.upgrades.aspiration === 'turbo' && currentRpm > 3200 && currentRpm < 5800) {
      const boostSwell = Math.sin((currentRpm - 3200) / 2600 * Math.PI) * 50;
      torque += boostSwell * this.turboSpoolLevel;
    }

    torque *= getEngineTemperatureTorqueMultiplier(
      this.engineTemperature
    );
    torque *= this.fuelDeliveryFactor;

    return Math.max(0, torque);
  }

  // ระบบเปลี่ยนเกียร์อัตโนมัติอิงตามรอบเครื่องยนต์ (Auto Gearbox Logic - RPM-based)
  private handleAutoTransmission(deltaTime: number) {
    if (this.powertrainType === 'electric') {
      this.currentGear = 1;
      this.targetGear = 1;
      this.previousGear = 1;
      this.isShifting = false;
      this.shiftTimer = 0;
      return;
    }

    if (this.speed < 0) {
      this.currentGear = 1;
      return;
    }

    let desiredGear = this.currentGear;

    if (!this.isShifting) {
      const speedMph = Math.abs(this.speed) * 2.236936;
      const scheduledShiftMph = this.shiftUpMph[this.currentGear - 1];
      const scheduledDownshiftMph = this.currentGear > 1 ? this.shiftUpMph[this.currentGear - 2] * 0.72 : undefined;
      // Shift decisions use the engine speed implied by ROAD speed, not this.rpm.
      // A real gearbox reads its output shaft, so spinning the driven wheels cannot
      // make it upshift. Reading this.rpm instead means one wheelspin off the line
      // pins the engine on the limiter and the box climbs through every gear at
      // walking pace, leaving the car lugging in top with nowhere to go.
      const roadRpm =
        (Math.abs(this.speed) / Math.max(this.wheelRadius, 0.01)) *
        (this.gearRatios[this.currentGear] || 1) *
        this.finalDrive *
        (60 / (2 * Math.PI));

      if (scheduledShiftMph !== undefined) {
        if (speedMph >= scheduledShiftMph && desiredGear < this.gearRatios.length - 1) {
          desiredGear = this.currentGear + 1;
        } else if (scheduledDownshiftMph !== undefined && speedMph <= scheduledDownshiftMph && desiredGear > 1) {
          desiredGear = this.currentGear - 1;
        }
      } else {
        // Upshift when road speed puts the engine at 94% of redline.
        if (roadRpm >= this.maxRpm - 400 && desiredGear < this.gearRatios.length - 1) {
          desiredGear = this.currentGear + 1;
        }
        // Downshift when road speed has dropped the engine below 1800 rpm.
        else if (roadRpm <= 1800 && desiredGear > 1) {
          desiredGear = this.currentGear - 1;
        }
      }
    }

    // Start a shift if desiredGear is different from currentGear and we aren't already shifting
    if (desiredGear !== this.currentGear && !this.isShifting) {
      this.isShifting = true;
      this.previousGear = this.currentGear;
      this.targetGear = desiredGear;

      if (desiredGear < this.currentGear) {
        const targetRatio = this.gearRatios[desiredGear] || 1.0;
        this.revMatchTargetRpm = THREE.MathUtils.clamp(
          (Math.abs(this.getDrivenWheelSpeed()) / this.wheelRadius) *
            targetRatio *
            this.finalDrive *
            (60 / (2 * Math.PI)),
          1000,
          this.maxRpm - 100
        );
      }

      // Transmission hardware changes interruption length and downshift speed.
      const shiftTimeModifier =
        1.0 -
        this.upgrades.driveTrain.gearboxLevel * 0.12 -
        this.upgrades.driveTrain.flywheelLevel * 0.05;
      const isUpshift = desiredGear > this.currentGear;
      const baseShiftTime =
        this.transmissionType === 'dual_clutch'
          ? isUpshift ? 0.10 : 0.13
          : this.transmissionType === 'automatic'
            ? isUpshift ? 0.28 : 0.22
            : isUpshift ? 0.38 : 0.24;
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

  private getShiftTorqueTransfer(): number {
    if (!this.isShifting) return 1;
    if (this.transmissionType === 'dual_clutch') {
      return Math.min(
        0.82,
        0.48 + this.upgrades.driveTrain.gearboxLevel * 0.10
      );
    }
    if (this.transmissionType === 'automatic') {
      return Math.min(
        0.38,
        0.16 + this.upgrades.driveTrain.gearboxLevel * 0.06
      );
    }
    return 0;
  }

  private getDrivetrainTorqueTransfer(): number {
    if (this.transmissionType === 'single_speed') return 1;
    return (
      this.getShiftTorqueTransfer() *
      this.clutchEngagement *
      this.torqueConverterMultiplier
    );
  }

  private resetVisualReferences() {
    this.paintMaterials = [];
    this.windshieldMaterials = [];
    this.rimMaterials = [];
    this.underglowMaterial = undefined;
    this.taillightMaterials = [];
    this.wheels = [];
    this.leftFrontWheel = undefined;
    this.rightFrontWheel = undefined;
    this.leftRearWheel = undefined;
    this.rightRearWheel = undefined;
  }

  private disposeVisualResources(
    roots: THREE.Object3D[],
    extraGeometries: Iterable<THREE.BufferGeometry> = [],
    extraMaterials: Iterable<THREE.Material> = []
  ) {
    const geometries = new Set<THREE.BufferGeometry>(extraGeometries);
    const materials = new Set<THREE.Material>(extraMaterials);
    const textures = new Set<THREE.Texture>();
    const skeletons = new Set<THREE.Skeleton>();

    roots.forEach((root) => {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) geometries.add(object.geometry);
          const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
          objectMaterials.forEach((material) => {
            if (material) materials.add(material);
          });
        }
        if (object instanceof THREE.SkinnedMesh && object.skeleton) {
          skeletons.add(object.skeleton);
        }
        if (
          object instanceof THREE.DirectionalLight ||
          object instanceof THREE.PointLight ||
          object instanceof THREE.SpotLight
        ) {
          object.shadow.map?.dispose();
        }
      });
    });

    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
      if (material instanceof THREE.ShaderMaterial) {
        Object.values(material.uniforms).forEach((uniform) => {
          if (uniform?.value instanceof THREE.Texture) textures.add(uniform.value);
        });
      }
    });

    skeletons.forEach((skeleton) => {
      if (skeleton.boneTexture) textures.add(skeleton.boneTexture);
      skeleton.dispose();
    });
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  }

  private clearCurrentVisual() {
    const roots = [...this.mesh.children];
    roots.forEach((root) => this.mesh.remove(root));
    this.disposeVisualResources(
      roots,
      this.visualOrphanedGeometries,
      this.visualOrphanedMaterials
    );
    this.visualOrphanedGeometries.clear();
    this.visualOrphanedMaterials.clear();
    this.committedVisualCarId = null;
    this.resetVisualReferences();
  }

  public rebuild(carId: string, color: string, onLoadProgress?: (progress: number) => void, onLoadComplete?: () => void) {
    const generation = ++this.visualGeneration;
    const isSameCommittedCar = this.committedVisualCarId === carId;
    this.carId = carId;
    this.color = color;
    this.updateStats();

    // A new generation invalidates every older async callback, including recolors.
    if (isSameCommittedCar && this.paintMaterials.length > 0 && this.mesh.children.length > 0) {
      const paintColor = new THREE.Color(color);
      this.paintMaterials.forEach((mat) => {
        mat.color.copy(paintColor);
      });
      onLoadComplete?.();
      return;
    }

    // Procedural cars commit synchronously. GLTF cars keep the previous visual until
    // their owned generation finishes, preventing an empty frame while loading.
    if (
      carId !== 'honda_s2000' &&
      carId !== 'ford_gt_2006' &&
      carId !== 'cybertruck'
    ) {
      this.clearCurrentVisual();
      this.buildProceduralMesh();
      this.committedVisualCarId = carId;
      onLoadComplete?.();
    } else {
      this.buildMesh(onLoadProgress, onLoadComplete, generation, carId, color);
    }
  }
 
  private buildMesh(
    onLoadProgress: ((progress: number) => void) | undefined,
    onLoadComplete: (() => void) | undefined,
    generation: number,
    carId: string,
    color: string
  ) {
    if (carId === 'honda_s2000') {
      this.buildGltfMesh('/models/honda_s2000.glb', generation, carId, color, onLoadProgress, onLoadComplete);
    } else if (carId === 'ford_gt_2006') {
      this.buildGltfMesh('/models/ford_gt_2006.glb', generation, carId, color, onLoadProgress, onLoadComplete);
    } else if (carId === 'cybertruck') {
      this.buildGltfMesh('/models/tesla_cybertruck_awd.glb', generation, carId, color, onLoadProgress, onLoadComplete);
    } else if (generation === this.visualGeneration) {
      this.clearCurrentVisual();
      this.buildProceduralMesh();
      this.committedVisualCarId = carId;
      onLoadComplete?.();
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
      } else {
        if (x < 0) this.leftRearWheel = steerPivot;
        else this.rightRearWheel = steerPivot;
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

  private buildGltfMesh(
    modelPath: string,
    generation: number,
    requestedCarId: string,
    requestedColor: string,
    onLoadProgress?: (progress: number) => void,
    onLoadComplete?: () => void
  ) {
    // If there is no previous car visible, build a temporary placeholder. It is
    // owned by the current visual and is disposed when an active request commits.
    if (this.mesh.children.length === 0) {
      const placeholderGeom = new THREE.BoxGeometry(2.4, 0.5, 4.8);
      const placeholderMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(requestedColor),
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

    if (generation === this.visualGeneration) onLoadProgress?.(0);

    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf: GLTF) => {
        // Parsing may finish after another carousel click or dealer exit. A stale
        // generation owns its parsed scene, so release it without touching live UI.
        if (generation !== this.visualGeneration) {
          this.disposeVisualResources([gltf.scene]);
          return;
        }

        this.clearCurrentVisual();

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
        const config = CARS_DATABASE.find(c => c.id === requestedCarId) || CARS_DATABASE[0];
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
            const paintColor = new THREE.Color(requestedColor);
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
                  this.visualOrphanedMaterials.add(mat);
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
                  this.visualOrphanedMaterials.add(mat);
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
                  this.visualOrphanedMaterials.add(mat);
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
                  this.visualOrphanedMaterials.add(mat);
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

        if (requestedCarId === 'ford_gt_2006') {
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
              const sourceGeometry = child.geometry;
              child.geometry = sourceGeometry.clone();
              this.visualOrphanedGeometries.add(sourceGeometry);
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
            } else if (isLeft) {
              this.leftRearWheel = wheel;
            } else {
              this.rightRearWheel = wheel;
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
        this.committedVisualCarId = requestedCarId;

        if (generation === this.visualGeneration) {
          onLoadProgress?.(100);
          onLoadComplete?.();
        }
      },
      (xhr: ProgressEvent) => {
        if (generation !== this.visualGeneration) return;
        if (xhr.lengthComputable) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          onLoadProgress?.(pct);
        }
      },
      (err: unknown) => {
        if (generation !== this.visualGeneration) return;
        console.error(`Failed to load ${requestedCarId} model:`, err);
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
    if (!posAttr) {
      if (nonIndexed !== modelGeom) nonIndexed.dispose();
      modelGeom.dispose();
      return {};
    }

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

    if (nonIndexed !== modelGeom) nonIndexed.dispose();
    modelGeom.dispose();
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
      } else if (key === 'rl') {
        this.leftRearWheel = steerPivot;
      } else if (key === 'rr') {
        this.rightRearWheel = steerPivot;
      }
    });

    this.wheels = wheelNodes;

    // Original merged wheel geometries leave the committed scene after splitting.
    // Keep ownership with this visual so the next swap can release them safely.
    [nodes.ftL, nodes.rrL, nodes.rims, nodes.disks, nodes.brakes].forEach((node) => {
      node?.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry) {
          this.visualOrphanedGeometries.add(child.geometry);
        }
      });
    });

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
      } else {
        if (x < 0) this.leftRearWheel = steerPivot;
        else this.rightRearWheel = steerPivot;
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
    this.powertrainType = config.powertrainType ?? 'combustion';
    this.engineDisplacementLiters =
      config.engineDisplacementLiters ??
      (config.tier === 'Entry Tier'
        ? 1.8
        : config.tier === 'Sport Tier'
          ? 2.5
          : config.tier === 'Hyper Tier'
            ? 4.0
            : 5.0);
    this.throttleResponse =
      config.throttleResponse ??
      (this.powertrainType === 'electric' ? 14 : 8);
    this.variableValveTiming =
      config.variableValveTiming ?? false;
    this.variableValveEngageRpm =
      config.variableValveEngageRpm ??
      (config.maxRpm ?? 6500) * 0.68;
    this.variableValveTorqueGain =
      config.variableValveTorqueGain ?? 0.1;
    this.engineCoolingEfficiency =
      config.engineCoolingEfficiency ?? 1;
    this.transmissionType =
      config.transmissionType ??
      (this.powertrainType === 'electric'
        ? 'single_speed'
        : config.tier === 'Hyper Tier' || config.tier === 'Legendary Tier'
          ? 'dual_clutch'
          : 'automatic');
    this.torqueConverterStallRpm = config.torqueConverterStallRpm ?? 2400;
    this.torqueConverterStallRatio =
      config.torqueConverterStallRatio ?? 1.85;
    this.speedLimiterMultiplier = config.speedLimiterMultiplier ?? 1.25;
    // Reset these on every car change so EV gearing cannot leak into another car.
    this.gearRatios = config.gearRatios
      ? [...config.gearRatios]
      : [0, 3.60, 2.10, 1.50, 1.10, 0.90, 0.80];
    this.wheelRadius = config.wheelRadius ?? 0.48;
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

    // Database mass is curb/full-tank mass. Derive empty mass so real vehicle
    // specs remain correct at full fuel and the car becomes lighter as it burns.
    const upgradedCurbMass =
      this.baseMass - this.upgrades.weightReduction * 80;
    this.fuelDensityKgPerLiter =
      config.fuelDensityKgPerLiter ?? 0.745;
    this.fuelCapacityLiters =
      config.fuelCapacityLiters ??
      this.getDefaultFuelCapacity(config, upgradedCurbMass);
    this.dryMass = Math.max(
      100,
      upgradedCurbMass -
        this.fuelCapacityLiters * this.fuelDensityKgPerLiter
    );
    this.brakeSpecificFuelConsumption =
      config.brakeSpecificFuelConsumption ??
      (this.upgrades.aspiration === 'turbo' ? 310 : 285);
    this.fuelTankHeight =
      config.fuelTankHeight ??
      (config.id === 'cybertruck' ? 0.42 : 0.30);
    const defaultTankPosition =
      config.engineLayout === 'rear'
        ? 0.24
        : config.engineLayout === 'mid'
          ? 0.02
          : config.engineLayout === 'front_mid'
            ? -0.18
            : -0.28;
    this.fuelTankLongitudinalPosition =
      config.fuelTankLongitudinalPosition ??
      defaultTankPosition;
    this.fuelLiters = this.fuelCapacityLiters;
    this.mass =
      this.dryMass +
      this.fuelLiters * this.fuelDensityKgPerLiter;

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
    const baseCd = isTruck ? 0.38 : isEntry ? 0.32 : isSport ? 0.31 : isHyper ? 0.30 : 0.29;
    // Downforce is never free: a wing that pushes the car down also pushes it back.
    const defaultCd = baseCd + (config.hasSpoiler ? 0.032 : 0);
    // Road cars without aero devices still make a little downforce, but the old
    // 0.06 figure was small enough that high-speed grip never changed at all.
    const defaultCl = config.hasSpoiler
      ? (isLegendary ? 0.62 : isHyper ? 0.52 : 0.34)
      : (isHyper || isLegendary ? 0.26 : 0.14);
    // A rear wing shifts the aero balance rearward; a bare body stays near neutral.
    const defaultAeroBalanceFront = config.hasSpoiler ? 0.38 : 0.46;

    this.dryFrontWeightDistribution =
      config.frontWeightDistribution ??
      this.character.weightDistribution;
    this.frontWeightDistribution =
      this.dryFrontWeightDistribution;
    this.wheelBase = config.wheelbase ?? defaultWheelbase;
    this.trackWidth = config.trackWidth ?? defaultTrackWidth;
    this.dryCgHeight = Math.max(
      0.25,
      config.cgHeight ??
        (defaultCgHeight -
          this.upgrades.suspensionLevel * 0.012)
    );
    this.cgHeight = this.dryCgHeight;
    this.frontalArea = config.frontalArea ?? defaultFrontalArea;
    this.dragCoefficient = config.dragCoefficient ?? defaultCd;
    this.liftCoefficient = config.liftCoefficient ?? defaultCl;
    this.aeroBalanceFront = THREE.MathUtils.clamp(
      config.aeroBalanceFront ?? defaultAeroBalanceFront,
      0.25,
      0.65
    );
    this.tireGripFront = config.tireGripFront ?? 1.0;
    // character.rearGripMultiplier was authored as the whole source of a car's
    // oversteer, back when six stacked damping layers suppressed yaw and rear-biased
    // weight had almost no effect. Load transfer and yaw inertia now genuinely produce
    // that behaviour, so taking the multiplier at face value double counts it: a car
    // like the Volt Interceptor (48% front, 0.88 rear grip, low yaw inertia) becomes a
    // spin machine from a quarter-lock input. Compressing it toward 1.0 keeps every
    // car's authored ordering -- looser cars stay looser -- while letting the physics
    // supply the oversteer. Real tires do not lose a tenth of their friction just
    // because they are at the back.
    const rearGripCharacter =
      1.0 + (this.character.rearGripMultiplier - 1.0) * 0.45;
    this.tireGripRear = config.tireGripRear ?? rearGripCharacter;
    this.corneringStiffnessFront = config.corneringStiffnessFront ?? THREE.MathUtils.clamp(4.8 + config.handling * 0.22, 5.4, 8.2);
    this.corneringStiffnessRear = config.corneringStiffnessRear ?? THREE.MathUtils.clamp(4.8 + config.handling * 0.22, 5.4, 8.2);
    const defaultCamberDegrees = isEntry ? -0.8 : isSport ? -1.2 : isHyper ? -1.7 : -2.0;
    const suspensionCamberDegrees = this.upgrades.suspensionLevel * -0.18;
    this.frontCamberDegrees = config.frontCamberDegrees ?? (defaultCamberDegrees + suspensionCamberDegrees);
    this.rearCamberDegrees = config.rearCamberDegrees ?? (defaultCamberDegrees + suspensionCamberDegrees * 0.85);
    this.maxSteeringAngle = config.maxSteeringAngle ?? (config.id === 'driftmaster' ? 0.68 : isTruck ? 0.48 : isHyper || isLegendary ? 0.50 : 0.56);
    this.rearSteeringRatio = config.rearSteeringRatio ?? 0;
    this.rearSteeringMaxAngle = config.rearSteeringMaxAngle ?? 0;
    this.steeringResponse = config.steeringResponse ?? 1;
    this.steeringRackRatio =
      config.steeringRackRatio ??
      (isTruck ? 17.0 : isEntry ? 16.5 : isSport ? 15.2 : 14.2);
    this.powerSteeringType =
      config.powerSteeringType ??
      (isEntry ? 'hydraulic' : 'electric');
    this.pneumaticTrail =
      config.pneumaticTrail ??
      (isTruck ? 0.075 : isHyper || isLegendary ? 0.058 : 0.065);
    this.casterTrail =
      config.casterTrail ??
      (isTruck ? 0.045 : isHyper || isLegendary ? 0.034 : 0.038);
    this.rollingResistanceCoefficient = config.rollingResistanceCoefficient ?? (isTruck ? 0.018 : 0.014);
    this.shiftUpMph = config.shiftUpMph ?? [];
    this.brakeForce = config.brakeForce ?? this.mass * (10.2 + this.brakingRate * 1.4 + this.upgrades.brake.level * 1.1);
    this.massEngineLayout =
      config.engineLayout ??
      (this.dryFrontWeightDistribution >= 0.56
        ? 'front'
        : this.dryFrontWeightDistribution >= 0.50
          ? 'front_mid'
          : this.dryFrontWeightDistribution >= 0.43
            ? 'mid'
            : 'rear');
    this.massConcentration =
      config.massConcentration ?? this.character.yawInertia;
    this.yawInertiaOverride = config.yawInertia;
    this.unsprungMassPerWheel = THREE.MathUtils.clamp(
      this.dryMass * 0.032,
      24,
      48
    );
    this.lastConfiguredFuelMass = -1;
    this.refreshMassProperties(true);
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
    this.tireState.coldPressurePsi =
      config.tireColdPressurePsi ??
      TIRE_COMPOUNDS[this.tireState.compound].recommendedColdPressurePsi;

    // Tune final drive so the actual top gear reaches max speed near redline.
    if (config.finalDrive !== undefined) {
      this.finalDrive = config.finalDrive;
    } else {
      const topGearRatio =
        this.gearRatios[this.gearRatios.length - 1] || 0.80;
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
    const throttleRate =
      throttleValue > this.engineThrottlePosition
        ? this.throttleResponse
        : this.throttleResponse * 1.45;
    const throttleResponse =
      1.0 - Math.exp(-deltaTime * throttleRate);
    this.engineThrottlePosition = THREE.MathUtils.lerp(
      this.engineThrottlePosition,
      throttleValue,
      throttleResponse
    );

    if (
      this.powertrainType === 'combustion' &&
      this.fuelCapacityLiters > 0 &&
      this.fuelLiters <= 0
    ) {
      this.engineThrottlePosition = 0;
      this.isEngineStalled = true;
      this.isRevLimiterCut = false;
      this.turboSpoolLevel = Math.max(
        0,
        this.turboSpoolLevel - deltaTime * 2.5
      );
      this.rpm = Math.max(0, this.rpm - deltaTime * 2400);
      return;
    }
    this.isEngineStalled = false;

    const gearRatio = this.gearRatios[this.currentGear];
    const wheelRpm =
      (Math.abs(this.getDrivenWheelSpeed()) / this.wheelRadius) *
      gearRatio *
      this.finalDrive *
      (60 / (2 * Math.PI));

    if (this.transmissionType === 'single_speed') {
      this.clutchEngagement = 1;
      this.torqueConverterMultiplier = 1;
      this.rpm = THREE.MathUtils.clamp(wheelRpm, 0, this.maxRpm);
      this.isRevLimiterCut = wheelRpm >= this.maxRpm;
      this.turboSpoolLevel = 0;
      const motorThermalState = {
        temperature: this.engineTemperature
      };
      updateEngineTemperature(motorThermalState, {
        rpm: this.rpm,
        maxRpm: this.maxRpm,
        throttle: this.engineThrottlePosition,
        speed: this.groundSpeed,
        turboBoost: 0,
        coolingEfficiency: this.engineCoolingEfficiency,
        powertrainType: this.powertrainType,
        deltaTime
      });
      this.engineTemperature = motorThermalState.temperature;
      return;
    }

    const engineInertia = 0.05 + (0.15 - this.upgrades.driveTrain.flywheelLevel * 0.04) + 0.03;
    const baseTorque = this.getTorque(this.rpm);
    const combustionTorque =
      baseTorque * this.engineThrottlePosition;
    const frictionTorque = computeEngineFrictionTorque(
      this.rpm,
      this.engineThrottlePosition,
      this.engineDisplacementLiters,
      this.engineTemperature
    );
    const clutchUpgrade = this.upgrades.driveTrain.clutchLevel;

    if (this.transmissionType === 'automatic') {
      const converterCoupling = THREE.MathUtils.smoothstep(
        wheelRpm,
        450,
        this.torqueConverterStallRpm
      );
      this.clutchEngagement = THREE.MathUtils.lerp(
        0.46,
        1.0,
        converterCoupling
      );
      this.torqueConverterMultiplier = THREE.MathUtils.lerp(
        this.torqueConverterStallRatio,
        1.0,
        converterCoupling
      );
    } else {
      const launchCoupling = Math.max(
        THREE.MathUtils.smoothstep(wheelRpm, 350, 1450),
        // A driver launching does not wait for the speedometer before letting the
        // clutch out; they raise clamp force against a disc that is still slipping.
        // Keying the target to wheel speed alone made that impossible and deadlocked
        // the car: engagement stayed at its 0.24 floor until the wheels turned, and
        // the wheels could not turn on 24% of the drivetrain. On anything past about
        // 6 degrees of grade a manual car sat at walking pace with the engine on the
        // limiter, disengaging its own clutch further the harder the driver pushed.
        // The rate limiter below still spends about a second getting there, which is
        // the slip a real launch has.
        this.engineThrottlePosition
      );
      const minimumEngagement =
        this.transmissionType === 'dual_clutch' ? 0.38 : 0.24;
      const targetEngagement = THREE.MathUtils.lerp(
        minimumEngagement,
        1.0,
        launchCoupling
      );
      const engagementRate =
        (this.transmissionType === 'dual_clutch' ? 10 : 6) +
        clutchUpgrade * 2.0;
      const engagementResponse =
        1.0 - Math.exp(-deltaTime * engagementRate);
      this.clutchEngagement = THREE.MathUtils.lerp(
        this.clutchEngagement,
        targetEngagement,
        engagementResponse
      );
      this.torqueConverterMultiplier = 1;
    }

    // Rev limiter cut logic. The decision is made against limiterReferenceRpm -- the
    // engine speed the driveline is actually asking for -- rather than against
    // this.rpm, because while the limiter is cutting, this.rpm is overwritten with a
    // bounce oscillation that never falls below the release threshold. Judging the
    // release from that value leaves the limiter latched on forever with power cut.
    if (this.limiterReferenceRpm >= this.maxRpm - 20) {
      this.isRevLimiterCut = true;
    } else if (this.limiterReferenceRpm < this.maxRpm - 300) {
      this.isRevLimiterCut = false;
    }

    if (this.isRevLimiterCut) {
      this.rpm =
        this.maxRpm - 150 + Math.sin(this.physicsTime * 50.0) * 100;
    } else if (this.isShifting) {
      if (this.targetGear < this.previousGear) {
        // Automatic throttle blip to synchronize the lower gear before clutch engagement.
        const revMatchResponse = 1.0 - Math.exp(-deltaTime * 18.0);
        this.rpm = THREE.MathUtils.lerp(this.rpm, this.revMatchTargetRpm, revMatchResponse);
      } else {
        // Clutch disengaged: engine revs freely during an upshift.
        const netTorque = combustionTorque - frictionTorque;
        const rpmChange = (netTorque / engineInertia) * (60 / (2 * Math.PI)) * deltaTime;
        this.rpm = Math.max(1000, Math.min(this.maxRpm, this.rpm + rpmChange));
      }
    } else {
      // Rolling backwards. Holding the engine just off idle is right when the car
      // is being driven backwards, but this used to fire on any negative speed at
      // all — including a car sliding back down a hill with the driver flooring it.
      // Pinned near idle the torque curve gives almost nothing, so driveForce could
      // never beat gravity, the car kept sliding, and the pin never lifted: past
      // about 8 degrees of grade that was a permanent deadlock at walking pace with
      // the throttle wide open. Forward throttle now hands back to the launch clutch
      // below, which is what lets the engine rev and pull the car out.
      if (this.speed < 0 && throttleValue <= 0.01) {
        this.rpm = 1000 + Math.abs(this.speed) * 3.6 * 100;
      } else if (
        this.transmissionType === 'automatic' &&
        wheelRpm < this.torqueConverterStallRpm
      ) {
        const converterTargetRpm = Math.max(
          wheelRpm,
          1000 +
            this.engineThrottlePosition *
              (this.torqueConverterStallRpm - 1000)
        );
        const converterResponse = 1.0 - Math.exp(-deltaTime * 8.0);
        this.rpm = THREE.MathUtils.lerp(
          this.rpm,
          converterTargetRpm,
          converterResponse
        );
      } else if (this.clutchEngagement < 0.985 || wheelRpm < 1000) {
        // Friction clutch progressively couples engine and gearbox at launch.
        const clutchCapacity =
          320 *
          (1.0 + clutchUpgrade * 0.22) *
          this.clutchEngagement;
        const clutchSlipRpm = Math.max(0, this.rpm - wheelRpm);
        const clutchLoad =
          clutchCapacity *
          THREE.MathUtils.clamp(clutchSlipRpm / 1800, 0, 1);
        const netTorque = combustionTorque - frictionTorque - clutchLoad;
        const rpmChange =
          (netTorque / engineInertia) *
          (60 / (2 * Math.PI)) *
          deltaTime;
        const freeRpm = THREE.MathUtils.clamp(
          this.rpm + rpmChange,
          1000,
          this.maxRpm
        );
        this.rpm = THREE.MathUtils.lerp(
          freeRpm,
          Math.max(1000, wheelRpm),
          THREE.MathUtils.clamp(
            this.clutchEngagement *
              deltaTime *
              (5 + clutchUpgrade),
            0,
            1
          )
        );
      } else {
        // Clutch locked to wheels
        this.rpm = wheelRpm;
      }
    }

    this.rpm = Math.max(1000, Math.min(this.rpm, this.maxRpm));
    // While the limiter is cutting there is no combustion torque, so the wheels are
    // driving the engine and the driven-axle speed is the honest engine speed. That is
    // what lets the limiter release once wheelspin decays.
    this.limiterReferenceRpm = this.isRevLimiterCut
      ? Math.max(1000, Math.min(wheelRpm, this.maxRpm + 2000))
      : this.rpm;

    if (this.upgrades.aspiration === 'turbo') {
      const inBoostRange =
        this.rpm > 3200 &&
        this.rpm < 5800 &&
        this.engineThrottlePosition > 0.1;
      if (inBoostRange) {
        this.turboSpoolLevel = Math.min(1.0, this.turboSpoolLevel + deltaTime * 2.0);
      } else {
        this.turboSpoolLevel = Math.max(0.0, this.turboSpoolLevel - deltaTime * 1.25);
      }
    }

    const engineThermalState = {
      temperature: this.engineTemperature
    };
    updateEngineTemperature(engineThermalState, {
      rpm: this.rpm,
      maxRpm: this.maxRpm,
      throttle: this.engineThrottlePosition,
      speed: this.groundSpeed,
      turboBoost: this.turboSpoolLevel,
      coolingEfficiency: this.engineCoolingEfficiency,
      powertrainType: this.powertrainType,
      deltaTime
    });
    this.engineTemperature = engineThermalState.temperature;
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
    const baseGrip = getEffectiveGrip(
      this.tireState.compound,
      activeWear,
      surfaceGrip,
      this.tireState.temperature,
      this.tireState.coldPressurePsi
    );
    
    return baseGrip;
  }

  /**
   * Estimate axle grip from the two tire contact patches instead of treating the
   * whole axle as one tire. This keeps the model performant while making lateral
   * weight transfer reduce total grip like a real car: the loaded outside tire
   * gains less grip than the unloaded inside tire loses.
   */
  private computeAxleGripLimit(
    gripCoeff: number,
    axleLoad: number,
    lateralTransfer: number
  ): number {
    const halfLoad = axleLoad * 0.5;
    const transfer = THREE.MathUtils.clamp(Math.abs(lateralTransfer) * 0.5, 0, halfLoad * 0.92);
    const insideLoad = Math.max(1, halfLoad - transfer);
    const outsideLoad = Math.max(1, halfLoad + transfer);
    const referenceLoad = Math.max(1, this.mass * GRAVITY * 0.25);

    const tireLimit = (load: number) => {
      const loadRatio = load / referenceLoad;
      const loadSensitivity = THREE.MathUtils.clamp(1.08 - 0.16 * (loadRatio - 1.0), 0.72, 1.18);
      return gripCoeff * load * loadSensitivity;
    };

    return tireLimit(insideLoad) + tireLimit(outsideLoad);
  }

  private updateSuspensionModel(deltaTime: number): void {
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const frontDistance = this.wheelBase * (1.0 - this.frontWeightDistribution);
    const rearDistance = this.wheelBase * this.frontWeightDistribution;
    const halfTrack = this.trackWidth * 0.5;

    const sampleGround = (forwardOffset: number, rightOffset: number): number => {
      if (!this.getGroundHeight) return 0;
      const x =
        this.pos.x + sinYaw * forwardOffset + cosYaw * rightOffset;
      const z =
        this.pos.z + cosYaw * forwardOffset - sinYaw * rightOffset;
      return this.getGroundHeight(x, z, this.pos.y);
    };

    const frontLeftGround = sampleGround(frontDistance, -halfTrack);
    const frontRightGround = sampleGround(frontDistance, halfTrack);
    const rearLeftGround = sampleGround(-rearDistance, -halfTrack);
    const rearRightGround = sampleGround(-rearDistance, halfTrack);

    // Which way is downhill. Deliberately sampled from getSlopeHeight rather than
    // the four contact patches: those include curb lips and the verge step, so a
    // single wheel touching a kerb read as a violent tilt and the gravity kick
    // that followed showed up as the car shaking on a perfectly flat road.
    const slopeSample = (forwardOffset: number, rightOffset: number): number => {
      const x = this.pos.x + sinYaw * forwardOffset + cosYaw * rightOffset;
      const z = this.pos.z + cosYaw * forwardOffset - sinYaw * rightOffset;
      if (this.getSlopeHeight) return this.getSlopeHeight(x, z, this.pos.y);
      return this.getGroundHeight ? this.getGroundHeight(x, z, this.pos.y) : 0;
    };

    // A baseline at least as long as the car, so surface detail averages out.
    const pitchBase = Math.max(this.wheelBase, 2.0);
    const rollBase = Math.max(this.trackWidth, 1.4);
    // terrainPitchRad is positive climbing, terrainRollRad positive with the right
    // wheels higher. Both match the axes applyLocalForce uses, since the +right
    // offset here is the same world direction as a positive lateral force.
    const rawPitch = Math.atan2(
      slopeSample(pitchBase * 0.5, 0) - slopeSample(-pitchBase * 0.5, 0),
      pitchBase
    );
    const rawRoll = Math.atan2(
      slopeSample(0, rollBase * 0.5) - slopeSample(0, -rollBase * 0.5),
      rollBase
    );
    // Anything under about half a degree is sampling noise, not a hill. Letting it
    // through would apply a permanent small sideways nudge on flat ground.
    const deadzone = (angle: number) => (Math.abs(angle) < 0.009 ? 0 : angle);
    // A car dropped onto a slope is already on it, so the first frame adopts the
    // gradient outright. Easing up from zero instead meant the support plane below
    // was briefly flat while the ground was not, and a car spawned on a hillside
    // took a load spike through one axle before the estimate caught up.
    const slopeBlend = this.suspensionOutput ? Math.min(1, 12 * deltaTime) : 1;
    this.terrainPitchRad += (deadzone(rawPitch) - this.terrainPitchRad) * slopeBlend;
    this.terrainRollRad += (deadzone(rawRoll) - this.terrainRollRad) * slopeBlend;

    // A car standing on a tilted surface sits parallel to it, and every spring still
    // carries its normal static load. The suspension model measures each corner
    // against the average of the four, which treats any tilt as though the body had
    // stayed level while the ground moved: on a climb the front wheels look a whole
    // wheelbase of rise too high and their springs get driven into the ground. That
    // put a 1580kg car's entire weight on the front axle at 5 degrees and left the
    // rear — the driven axle on a rear-drive car — with nothing to push against.
    //
    // So fit the plane the four contact points define and hand the model only what
    // is left over. Fitting it from the contact heights themselves, rather than from
    // terrainPitchRad, means a banked corner and a cambered verge come out for free
    // and nothing is counted twice. What survives is the warp mode — one wheel over
    // a kerb, a diagonal dip — which is exactly what a suspension should feel.
    //
    // The residuals are also centred on zero rather than on the car's altitude,
    // because the model differentiates these heights to get the speed the road is
    // moving at. Left absolute, driving down a 10-degree slope at 90km/h fed it
    // 4.3 m/s of descent as though the whole road were dropping away underneath;
    // the dampers answered that by unloading every wheel to nothing, and a car with
    // no tire load has no grip and will not turn. Height for the body to ride at is
    // kept separately below, where it is not being differentiated.
    const meanGround =
      (frontLeftGround + frontRightGround + rearLeftGround + rearRightGround) * 0.25;
    const pitchSlope =
      ((frontLeftGround + frontRightGround) - (rearLeftGround + rearRightGround)) /
      (2 * Math.max(frontDistance + rearDistance, 0.1));
    const rollSlope =
      ((frontRightGround + rearRightGround) - (frontLeftGround + rearLeftGround)) /
      (4 * Math.max(halfTrack, 0.1));
    // The contact patches' centroid, which is what the plane pivots about.
    const centroidForward = (frontDistance - rearDistance) * 0.5;
    const bumpOnly = (
      groundHeight: number,
      forwardOffset: number,
      rightOffset: number
    ) =>
      groundHeight -
      meanGround -
      (forwardOffset - centroidForward) * pitchSlope -
      rightOffset * rollSlope;

    // What the body rides at. Kept here rather than read back off the suspension
    // model, which no longer sees an absolute height at all.
    this.supportHeight = meanGround;

    const loadTransfer = this.massDynamics.calculateLoadTransfer({
      gravity: GRAVITY,
      longitudinalAcceleration: this.longitudinalAccel,
      lateralAcceleration: this.lateralAccel
    });
    const staticWeight = this.massProperties.totalMass * GRAVITY;

    this.suspensionOutput = this.suspensionModel.update({
      deltaTime,
      mass: this.massProperties.sprungMass,
      wheelbase: this.wheelBase,
      trackWidth: this.trackWidth,
      frontWeightDistribution: this.frontWeightDistribution,
      cornerLoadTargets: loadTransfer.cornerLoads,
      staticFrontLoad:
        staticWeight * this.massProperties.frontWeightDistribution,
      staticRearLoad:
        staticWeight * (1.0 - this.massProperties.frontWeightDistribution),
      unsprungLoadPerCorner:
        this.massProperties.unsprungMassPerWheel * GRAVITY,
      pitchInertia: this.pitchInertia,
      rollInertia: this.rollInertia,
      groundHeights: {
        frontLeft: bumpOnly(frontLeftGround, frontDistance, -halfTrack),
        frontRight: bumpOnly(frontRightGround, frontDistance, halfTrack),
        rearLeft: bumpOnly(rearLeftGround, -rearDistance, -halfTrack),
        rearRight: bumpOnly(rearRightGround, -rearDistance, halfTrack)
      },
      grounded: this.isGrounded
    });
  }

  private updateSuspensionWheelVisuals(): void {
    if (!this.suspensionOutput || this.wheels.length === 0) return;

    const corners = this.suspensionOutput.corners;
    const averageCompression =
      (corners.frontLeft.compression +
        corners.frontRight.compression +
        corners.rearLeft.compression +
        corners.rearRight.compression) *
      0.25;

    this.wheels.forEach((wheel) => {
      if (wheel.userData.suspensionBaseY === undefined) {
        wheel.userData.suspensionBaseY = wheel.position.y;
      }

      // Which corner a wheel belongs to never changes, so classify it once and cache
      // the answer. This used to run four regexes plus several substring searches per
      // wheel, every frame.
      if (wheel.userData.suspensionCorner === undefined) {
        const name = wheel.name.toLowerCase();
        const isFront =
          wheel === this.leftFrontWheel ||
          wheel === this.rightFrontWheel ||
          /front|fore|\b(f)\b|[_ -]f(?:\b|[_ -]|\d)/i.test(name) ||
          name.includes('_fl') ||
          name.includes('_fr');
        const isLeft =
          wheel === this.leftFrontWheel ||
          /left|\b(l)\b|[_ -]l(?:\b|[_ -]|\d)/i.test(name) ||
          name.includes('_fl') ||
          name.includes('_rl') ||
          wheel.position.x < 0;
        wheel.userData.suspensionCorner = isFront
          ? isLeft
            ? 'frontLeft'
            : 'frontRight'
          : isLeft
            ? 'rearLeft'
            : 'rearRight';
      }
      const cornerState =
        corners[wheel.userData.suspensionCorner as SuspensionCorner];
      const wheelTravel = THREE.MathUtils.clamp(
        cornerState.compression - averageCompression,
        -0.12,
        0.12
      );

      wheel.position.y = wheel.userData.suspensionBaseY + wheelTravel;
    });
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
    // Airspeed and contact-patch travel speed both use the full planar velocity, not
    // just the forward component, so a sideways car still sees drag and downforce.
    const speedMagnitude = Math.hypot(local.forward, local.lateral);
    const changedSteeringDirection =
      turnInput * this.previousTurnInput < -0.08 &&
      Math.abs(turnInput) > 0.18 &&
      Math.abs(this.previousTurnInput) > 0.18;
    if (changedSteeringDirection && absForward > 8) {
      this.steeringReversalTimer = 0.42;
    } else {
      this.steeringReversalTimer = Math.max(
        0,
        this.steeringReversalTimer - deltaTime
      );
    }
    const directionChangeBlend = THREE.MathUtils.clamp(
      this.steeringReversalTimer / 0.42,
      0,
      1
    );
    const compoundConfig =
      TIRE_COMPOUNDS[this.tireState.compound] || TIRE_COMPOUNDS.normal;
    const baseGripCoeff = this.getEffectiveTireGrip();
    const economyColdGrip =
      TIRE_COMPOUNDS.economy.gripMultiplier *
      TIRE_COMPOUNDS.economy.coldGripFloor;
    const racingSoftColdGrip =
      TIRE_COMPOUNDS.normal.gripMultiplier *
      TIRE_COMPOUNDS.normal.coldGripFloor;
    const tireSteeringAuthority = THREE.MathUtils.clamp(
      (baseGripCoeff - economyColdGrip) /
        Math.max(racingSoftColdGrip - economyColdGrip, 0.01),
      0,
      1
    );

    // --- STEERING INPUT: smoothly interpolate steer angle with speed sensitivity and assists ---
    // At high speeds, full steering angle causes instant tire saturation (extreme understeer).
    // We scale down the max steering angle based on speed to keep tires near peak grip,
    // but better compounds now earn more usable rack angle instead of feeling capped.
    // Keep the high-speed steering limit focused on genuine vehicle slip, not braking.
    const isDrifting = this.isDrifting;
    const steeringSpeedRatio = THREE.MathUtils.clamp(absForward / 45, 0, 1);
    const steeringFalloff = THREE.MathUtils.smoothstep(steeringSpeedRatio, 0.12, 0.92);
    const highSpeedGripSteerRatio = THREE.MathUtils.clamp(
      0.16 +
        tireSteeringAuthority * 0.13 +
        (this.driveType === 'AWD' ? 0.025 : 0),
      0.16,
      0.32
    );
    const highSpeedSteerLimit =
      this.maxSteeringAngle *
      (isDrifting ? 0.38 : highSpeedGripSteerRatio);
    const maxSteer = THREE.MathUtils.lerp(this.maxSteeringAngle, highSpeedSteerLimit, steeringFalloff);

    // Dynamic Countersteer Assist (Stability Helper)
    // Assist remains active during emergency braking so the car can recover from slip.
    let assistSteer = 0;
    if (absForward > 5 && Math.abs(this.driftAngle) > 0.05 && Math.abs(this.driftAngle) < 0.75) {
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

    const targetSteerAngle = THREE.MathUtils.clamp(
      turnInput * maxSteer + assistSteer,
      -maxSteer,
      maxSteer
    );
    const steeringOutput = updateSteeringSystem({
      currentSteeringWheelAngle: this.steeringWheelAngle,
      targetRoadWheelAngle: targetSteerAngle,
      inputMagnitude: Math.abs(turnInput),
      speed: absForward,
      slipAngle: this.relaxedFrontSlipAngle,
      frontAxleLoad:
        this.dynamicFrontWeight ||
        this.mass * GRAVITY * this.frontWeightDistribution,
      gripCoefficient: this.getEffectiveTireGrip() * this.tireGripFront,
      rackRatio: this.steeringRackRatio,
      powerSteeringType: this.powerSteeringType,
      pneumaticTrail: this.pneumaticTrail,
      casterTrail: this.casterTrail,
      response: this.steeringResponse,
      counterSteering:
        turnInput * this.driftAngle < 0 &&
        Math.abs(this.driftAngle) > 0.12,
      directionChangeBlend,
      deltaTime
    });
    // Clamp once, in road-wheel space, then carry the rack back to the wheel angle.
    // Previously the integrated wheel angle was stored and then immediately
    // overwritten, which silently discarded the self-aligning-torque integration
    // whenever the speed-based steering limit was active.
    this.steerAngle = THREE.MathUtils.clamp(
      steeringOutput.roadWheelAngle,
      -maxSteer,
      maxSteer
    );
    this.steeringWheelAngle = this.steerAngle * this.steeringRackRatio;
    this.steeringTorqueNm = steeringOutput.steeringTorqueNm;
    this.steeringAssistFraction = steeringOutput.assistFraction;

    // Rear-steer road wheel angle. Stored on the instance so the once-per-frame
    // visual pass can read it without re-deriving it.
    const rearSteerSpeedBlend = THREE.MathUtils.smoothstep(absForward, 8, 32);
    const rearSteerAngle = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(
        -this.steerAngle * this.rearSteeringRatio,
        this.steerAngle * this.rearSteeringRatio * 0.16,
        rearSteerSpeedBlend
      ),
      -this.rearSteeringMaxAngle,
      this.rearSteeringMaxAngle
    );
    this.rearSteerAngle = rearSteerAngle;

    // --- EFFECTIVE GRIP ---
    let bankAngleRad = 0;
    if (this.getTrackInfo) {
      const info = this.getTrackInfo(this.pos.x, this.pos.z, this.pos.y);
      if (info && info.banking !== undefined) {
        bankAngleRad = info.banking * (Math.PI / 180);
      }
    }

    // Centrifugal acceleration component normal to track: speed * yawRate * sin(bankAngle)
    const centAccelNormal = (this.speed * this.yawRate) * Math.sin(bankAngleRad);
    // Effective gravity: gravity * cos(bankAngle) + centAccelNormal
    const effectiveGravity = Math.max(1.0, GRAVITY * Math.cos(bankAngleRad) + centAccelNormal);
    const aeroDownforce =
      0.5 *
      AIR_DENSITY *
      this.liftCoefficient *
      this.frontalArea *
      speedMagnitude *
      speedMagnitude;
    const totalWeight = this.mass * effectiveGravity + aeroDownforce;

    const gravityScale = effectiveGravity / GRAVITY;
    const suspensionFrontLoad =
      (this.suspensionOutput?.frontLoad ??
        this.mass * GRAVITY * this.frontWeightDistribution) *
      gravityScale;
    const suspensionRearLoad =
      (this.suspensionOutput?.rearLoad ??
        this.mass * GRAVITY * (1.0 - this.frontWeightDistribution)) *
      gravityScale;
    // Aerodynamic balance is a property of the bodywork, not of where the engine
    // sits. A rear wing loads the rear axle, so downforce must be split by its own
    // balance figure; tying it to weight distribution meant a spoiler changed
    // nothing about how the car behaved at speed.
    const frontWeight =
      suspensionFrontLoad + aeroDownforce * this.aeroBalanceFront;
    const rearWeight =
      suspensionRearLoad + aeroDownforce * (1.0 - this.aeroBalanceFront);

    this.dynamicFrontWeight = frontWeight;
    this.dynamicRearWeight = rearWeight;

    // --- FRONT AXLE: slip angle ---
    // Front tire velocity in local frame includes yaw rate contribution
    // Front axle is wheelBase * weightDistribution ahead of CG
    const frontAxleDist = this.wheelBase * (1.0 - this.frontWeightDistribution);
    const frontLateralVel = local.lateral + this.yawRate * frontAxleDist;
    // Front tires are steered, so resolve the axle's velocity into each tire's own
    // frame first. The lateral component in that frame is the part the contact patch
    // is genuinely scrubbing sideways; a steered wheel tracking its correct arc has
    // almost none of it, even though the axle is moving sideways relative to the body.
    const frontTireLateralVel =
      frontLateralVel * Math.cos(this.steerAngle) -
      local.forward * Math.sin(this.steerAngle);
    const frontSlipAngle = computeSlipAngle(
      frontTireLateralVel,
      local.forward * Math.cos(this.steerAngle) + frontLateralVel * Math.sin(this.steerAngle)
    );

    // --- REAR AXLE: slip angle ---
    const rearAxleDist = this.wheelBase * this.frontWeightDistribution;
    const rearLateralVel = local.lateral - this.yawRate * rearAxleDist;
    const rearTireLateralVel =
      rearLateralVel * Math.cos(rearSteerAngle) -
      local.forward * Math.sin(rearSteerAngle);
    const rearSlipAngle = computeSlipAngle(
      rearTireLateralVel,
      local.forward * Math.cos(rearSteerAngle) +
        rearLateralVel * Math.sin(rearSteerAngle)
    );
    this.relaxedFrontSlipAngle = relaxTireValue(
      this.relaxedFrontSlipAngle,
      frontSlipAngle,
      absForward,
      deltaTime,
      0.10
    );
    this.relaxedRearSlipAngle = relaxTireValue(
      this.relaxedRearSlipAngle,
      rearSlipAngle,
      absForward,
      deltaTime,
      0.07
    );

    // Store for external access
    this.rearSlipAngle = Math.abs(rearSlipAngle);

    const frontLateralTransfer = Math.abs(
      this.suspensionOutput?.frontLateralTransfer ??
        (this.mass * this.lateralAccel * this.cgHeight) /
          this.trackWidth *
          this.frontWeightDistribution
    );
    const rearLateralTransfer = Math.abs(
      this.suspensionOutput?.rearLateralTransfer ??
        (this.mass * this.lateralAccel * this.cgHeight) /
          this.trackWidth *
          (1.0 - this.frontWeightDistribution)
    );

    // --- TIRE GRIP MODIFIERS ---
    // No transition fudge here any more. Softening the front and planting the rear
    // during a left-right flick existed to cover the ~200 ms of lag in the old load
    // transfer estimate; now that lateral acceleration is taken from the actual tire
    // forces in the same substep, real weight transfer does that job.
    const frontGrip = baseGripCoeff * this.tireGripFront;
    let rearGrip = baseGripCoeff * this.tireGripRear;
    const pressureEffects = getTirePressureEffects(
      this.tireState.compound,
      this.tireState.temperature,
      this.tireState.coldPressurePsi
    );
    const frontCamberEffects = computeCamberEffects(
      THREE.MathUtils.degToRad(this.frontCamberDegrees),
      this.relaxedFrontSlipAngle
    );
    const rearCamberEffects = computeCamberEffects(
      THREE.MathUtils.degToRad(this.rearCamberDegrees),
      this.relaxedRearSlipAngle
    );

    const serviceBrakeInput = Math.max(reverseValue, handbrake ? 1 : 0);

    // Emergency braking uses the same tire grip and stability limits as normal braking.
    // Lift-off oversteer. Most of this is now genuine physics: closing the throttle
    // applies engine braking, which transfers load forward and unloads the rear axle
    // through the suspension. What stays here is the per-car character trim, halved
    // from its old value because it is no longer doing the whole job by itself.
    const throttleDrop = this.prevThrottleValue - throttleValue;
    if (
      throttleDrop > 0.4 &&
      absForward > 20 &&
      Math.abs(turnInput) > 0.15
    ) {
      const liftOffSeverity =
        throttleDrop *
        (1.0 - this.character.oversteerResistance) *
        (1.0 - this.frontWeightDistribution);
      rearGrip *= 1.0 - liftOffSeverity * 0.09;
    }

    // Power oversteer for RWD. The friction ellipse now handles the real mechanism:
    // a rear tire spending its grip on longitudinal force has less left for
    // cornering, and the wheel ODE lets it spin up when torque exceeds what the
    // contact patch can take. This trim only carries each car's personality, so it
    // too is scaled well back from the old arcade value.
    if (this.driveType === 'RWD' && throttleValue > 0.7) {
      const speedOversteerScale = absForward < 10
        ? 1.5 - (absForward / 10) * 0.5
        : THREE.MathUtils.clamp(1.0 - ((absForward - 10) / 45) * 0.72, 0.28, 1.0);
      const powerOversteerFactor =
        (1.0 - this.character.rearGripMultiplier * 0.7) *
        throttleValue *
        0.12 *
        speedOversteerScale;
      rearGrip *= Math.max(0.4, 1.0 - powerOversteerFactor);
    }

    // ESC: boost rear grip when sliding
    if (this.upgrades.brake.hasESC && Math.abs(rearSlipAngle) > 0.05) {
      rearGrip *= 1.35;
    }

    // Let the friction ellipse decide how braking and cornering share grip.
    // A small non-ABS penalty represents steering loss as the front tires
    // approach lock, without the old arcade-style 65% force deletion.
    let brakingSteerReduction = 1.0;
    if (serviceBrakeInput > 0.01 && absForward > 0.5) {
      if (this.upgrades.brake.hasABS) {
        brakingSteerReduction = 1.0;
      } else {
        brakingSteerReduction = THREE.MathUtils.lerp(
          1.0,
          0.78,
          THREE.MathUtils.clamp(serviceBrakeInput, 0, 1)
        );
      }
    }

    // --- DRIVE & BRAKE FORCES (Torque-based, no arcade multiplier) ---
    let driveForce = 0;
    if (throttleValue > 0.01) {
      const currentTorque = this.getTorque(this.rpm);
      let gearEfficiency =
        0.83 +
        this.upgrades.driveTrain.clutchLevel * 0.04 +
        this.upgrades.driveTrain.propellerShaftLevel * 0.02;
      gearEfficiency = Math.min(0.98, gearEfficiency);
      gearEfficiency *= this.isRevLimiterCut
        ? 0
        : this.getDrivetrainTorqueTransfer();

      driveForce = (currentTorque * this.gearRatios[this.currentGear] * this.finalDrive * gearEfficiency) / this.wheelRadius;
      driveForce *= this.engineThrottlePosition;

      // TCS: reduce drive force at low speed to prevent wheelspin
      if (this.upgrades.bodyControlModuleLevel > 0 && absForward < 12) {
        const tcsFactor = 1.0 - (0.12 * this.upgrades.bodyControlModuleLevel);
        driveForce *= tcsFactor;
      }

      if (this.driveType === 'AWD') {
        const steeringDemand = THREE.MathUtils.clamp(
          Math.abs(this.steerAngle) / Math.max(maxSteer, 0.01),
          0,
          1
        );
        const cornerTorqueBlend =
          steeringDemand *
          THREE.MathUtils.smoothstep(absForward, 8, 34);
        const torqueVectoringFloor =
          this.powertrainType === 'electric' ? 0.68 : 0.78;
        const torqueVectoringFactor = THREE.MathUtils.lerp(
          1.0,
          torqueVectoringFloor,
          cornerTorqueBlend * (0.72 + tireSteeringAuthority * 0.28)
        );
        driveForce *= torqueVectoringFactor;
      }
    }

    // Braking force
    let brakeForce = 0;
    const averageBrakeTemperature =
      (this.brakeTemperatureFront + this.brakeTemperatureRear) * 0.5;
    const fadeStartTemperature = 520 + this.upgrades.brake.level * 35;
    const fadeEndTemperature = 780 + this.upgrades.brake.level * 45;
    const brakeFade =
      1.0 -
      THREE.MathUtils.smoothstep(
        averageBrakeTemperature,
        fadeStartTemperature,
        fadeEndTemperature
      ) *
        0.42;

    const emergencyBrakeIsMoving = handbrake && absForward > 0.5;
    const targetBrakePressure =
      ((reverseValue > 0.01 && local.forward > 0.5) || emergencyBrakeIsMoving)
        ? 1.0 -
          Math.pow(
            1.0 - THREE.MathUtils.clamp(serviceBrakeInput, 0, 1),
            1.65
          )
        : 0;
    const brakePressureRate =
      targetBrakePressure > this.serviceBrakePressure ? 10.0 : 16.0;
    const brakePressureResponse =
      1.0 - Math.exp(-deltaTime * brakePressureRate);
    this.serviceBrakePressure = THREE.MathUtils.lerp(
      this.serviceBrakePressure,
      targetBrakePressure,
      brakePressureResponse
    );

    if (this.serviceBrakePressure > 0.001 && absForward > 0.5) {
      brakeForce =
        -this.brakeForce *
        this.serviceBrakePressure *
        Math.sign(local.forward) *
        brakeFade;
    } else if (reverseValue > 0.01 && local.forward <= 0.5) {
      // Reversing (uses engine torque in 1st/reverse gear instead of accelerationRate)
      if (local.forward > -12.0) { // Limit reverse speed to ~43 km/h
        const currentTorque = this.getTorque(this.rpm);
        let gearEfficiency =
          0.83 +
          this.upgrades.driveTrain.clutchLevel * 0.04 +
          this.upgrades.driveTrain.propellerShaftLevel * 0.02;
        gearEfficiency = Math.min(0.98, gearEfficiency);
        gearEfficiency *= this.isRevLimiterCut
          ? 0
          : this.getDrivetrainTorqueTransfer();
        const reverseGearRatio = this.gearRatios[1];
        driveForce = -(currentTorque * reverseGearRatio * this.finalDrive * gearEfficiency * reverseValue) / this.wheelRadius;
      }
    }
    // Pressing the accelerator while still travelling backwards brakes the car out
    // of reverse, which is the right feel on the flat. On a climb the car is rolling
    // back because of gravity, not because the driver chose reverse, and answering
    // full throttle with full brakes pinned it against the hill: brake and drive
    // balanced each other exactly, so the car sat at walking pace with the throttle
    // wide open, unable to move and therefore unable to steer. Facing uphill, the
    // accelerator has to mean accelerate.
    const slidingBackDownAClimb = this.terrainPitchRad > 0.02;
    if (throttleValue > 0.01 && local.forward < -0.5 && !slidingBackDownAClimb) {
      // Brake from reverse
      brakeForce = this.brakeForce * throttleValue * brakeFade;
    }

    // Drag and rolling resistance both oppose the direction the car is actually
    // travelling, not the direction it happens to be pointing. Resolving them along
    // the velocity vector is what makes a slide scrub off speed on its own instead
    // of needing a fudge factor bolted onto the longitudinal term.
    const sidewaysExposure = Math.abs(Math.sin(this.driftAngle));
    const yawDragMultiplier = 1.0 + Math.min(2.0, sidewaysExposure * 6.0);
    const dragMagnitude =
      0.5 *
      AIR_DENSITY *
      this.dragCoefficient *
      yawDragMultiplier *
      this.frontalArea *
      speedMagnitude *
      speedMagnitude;
    const rollingCoefficient =
      this.rollingResistanceCoefficient *
      (1.0 + 4.0 * this.grassInstability);
    // Taper rolling resistance to zero at a standstill. A constant-magnitude force
    // that only knows the sign of the velocity will push a stopped car backwards
    // and forwards forever.
    const rollingTaper = Math.min(1.0, speedMagnitude / 0.6);
    const rollingMagnitude = rollingCoefficient * totalWeight * rollingTaper;
    const velocityUnitForward =
      speedMagnitude > 0.01 ? local.forward / speedMagnitude : 0;
    const velocityUnitLateral =
      speedMagnitude > 0.01 ? local.lateral / speedMagnitude : 0;
    const resistanceMagnitude = dragMagnitude + rollingMagnitude;
    const dragForward = -resistanceMagnitude * velocityUnitForward;
    const dragLateral = -resistanceMagnitude * velocityUnitLateral;

    // Engine braking when coasting
    let engineBraking = 0;
    if (throttleValue <= 0.01 && serviceBrakeInput <= 0.01 && absForward > 0.5) {
      if (this.powertrainType === 'electric') {
        engineBraking =
          -1.15 * this.mass * Math.sign(local.forward);
      } else {
        const frictionTorque = computeEngineFrictionTorque(
          this.rpm,
          0,
          this.engineDisplacementLiters,
          this.engineTemperature
        );
        const gearRatio =
          this.gearRatios[this.currentGear] || 1;
        const frictionForce =
          (frictionTorque *
            gearRatio *
            this.finalDrive *
            0.82) /
          Math.max(this.wheelRadius, 0.1);
        engineBraking =
          -THREE.MathUtils.clamp(
            frictionForce,
            this.mass * 0.45,
            this.mass * 3.2
          ) *
          Math.sign(local.forward);
      }
    }

    // Split driveForce and engineBraking per axle based on driveType
    let frontDrive = 0;
    let rearDrive = 0;
    let frontEngineBrake = 0;
    let rearEngineBrake = 0;

    const diffLock = this.getDifferentialLock(throttleValue, serviceBrakeInput);
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

    // Emergency braking keeps normal drive distribution; it does not cut rear drive.
    const frontMaxGrip = this.computeAxleGripLimit(frontGrip, frontWeight, frontLateralTransfer);
    const rearMaxGrip = this.computeAxleGripLimit(rearGrip, rearWeight, rearLateralTransfer);
    const frontDriveGripLimit =
      frontMaxGrip *
      frontCamberEffects.longitudinalGripMultiplier *
      (0.86 + diffLock * 0.12);
    const rearDriveGripLimit =
      rearMaxGrip *
      rearCamberEffects.longitudinalGripMultiplier *
      (0.86 + diffLock * 0.12);

    // Electronic brake-force distribution follows the grip available at each
    // axle. Under deceleration the front carries more load, so a fixed 60/40
    // split can lock the rear while leaving useful front-tire grip unused.
    const totalAxleGrip = Math.max(frontMaxGrip + rearMaxGrip, 1);
    const serviceSteeringDemand = THREE.MathUtils.clamp(
      Math.abs(this.steerAngle) / Math.max(maxSteer, 0.01),
      0,
      1
    );
    const normalizedBrakeDemand = THREE.MathUtils.clamp(
      Math.abs(brakeForce) / Math.max(this.brakeForce, 1),
      0,
      1
    );
    const loadBasedFrontBias = frontMaxGrip / totalAxleGrip;
    const highSpeedBrakeBlend = THREE.MathUtils.smoothstep(
      absForward,
      24,
      58
    );
    const stabilityFrontBias =
      0.60 +
      normalizedBrakeDemand * 0.10 +
      serviceSteeringDemand * 0.06 +
      highSpeedBrakeBlend * normalizedBrakeDemand * 0.07;
    const frontBrakeBias = THREE.MathUtils.clamp(
      Math.max(loadBasedFrontBias, stabilityFrontBias),
      0.58,
      0.84
    );
    // Most road-car brakes can exceed tire traction and lock the wheels. Make
    // full pedal tire-limited rather than hardware-limited, so installing a
    // grippier compound genuinely shortens the stopping distance.
    const serviceBrakeCapacity = Math.max(
      this.brakeForce,
      totalAxleGrip * (1.04 + this.upgrades.brake.level * 0.025)
    );
    const tireAwareBrakeForce =
      Math.sign(brakeForce) * serviceBrakeCapacity * normalizedBrakeDemand;
    const desiredRearBrakeMagnitude =
      Math.abs(tireAwareBrakeForce) * (1.0 - frontBrakeBias);
    // Normal service braking uses EBD to keep the rear axle below lock while
    // steering. Excess pressure moves to the front, producing understeer at
    // the limit instead of sudden chicane-entry snap oversteer.
    const straightLineRearUtilization = THREE.MathUtils.lerp(
      0.92,
      0.76,
      highSpeedBrakeBlend * normalizedBrakeDemand
    );
    const rearServiceGripReserve =
      straightLineRearUtilization *
      THREE.MathUtils.lerp(
        1.0,
        0.74,
        serviceSteeringDemand
      );
    const rearServiceBrakeMagnitude = Math.min(
      desiredRearBrakeMagnitude,
      rearMaxGrip * rearServiceGripReserve
    );
    const frontServiceBrakeMagnitude =
      Math.abs(tireAwareBrakeForce) - rearServiceBrakeMagnitude;
    const brakeDirection = Math.sign(tireAwareBrakeForce);
    const frontBrake = brakeDirection * frontServiceBrakeMagnitude;
    const rearBrake =
      brakeDirection * rearServiceBrakeMagnitude;
    let frontRequestedForce = frontDrive + frontBrake + frontEngineBrake;
    let rearRequestedForce = rearDrive + rearBrake + rearEngineBrake;

    // ABS cycles brake pressure near peak slip rather than hard-clamping final tire force.
    if (serviceBrakeInput > 0.01 && absForward > 0.5 && this.upgrades.brake.hasABS) {
      // Stability-oriented ABS releases more pressure while steering, similar
      // to the forgiving default ABS behavior used by Gran Turismo.
      const targetUtilization = THREE.MathUtils.lerp(
        0.90,
        0.72,
        serviceSteeringDemand
      );
      const absPulse =
        targetUtilization +
        Math.sin(this.physicsTime * Math.PI * 24) * 0.025;
      frontRequestedForce =
        Math.sign(frontRequestedForce) *
        Math.min(Math.abs(frontRequestedForce), frontDriveGripLimit * absPulse);
      rearRequestedForce =
        Math.sign(rearRequestedForce) *
        Math.min(Math.abs(rearRequestedForce), rearDriveGripLimit * absPulse);
    }

    const frontEffectiveGrip = frontMaxGrip / Math.max(frontWeight, 1);
    const rearEffectiveGrip = rearMaxGrip / Math.max(rearWeight, 1);

    // --- LATERAL TIRE FORCES ---
    // Raw cornering force from the slip angle. The friction ellipse is applied once,
    // at the end, scaling lateral and longitudinal together in proportion. Resolving
    // one before the other instead -- giving cornering first claim on the grip and
    // handing the remainder to the brakes -- looks reasonable but is unstable: less
    // lateral force frees up longitudinal capacity, which takes more grip, which
    // leaves even less for lateral. That loop drives cornering force to its floor
    // whenever the brakes are hard on, and the car simply stops steering.
    const frontMaxLongitudinal = Math.max(
      1,
      frontMaxGrip * 1.05 * frontCamberEffects.longitudinalGripMultiplier
    );
    const rearMaxLongitudinal = Math.max(
      1,
      rearMaxGrip * 1.05 * rearCamberEffects.longitudinalGripMultiplier
    );

    let frontLatForce = -computeLateralForce(
      this.relaxedFrontSlipAngle,
      frontEffectiveGrip * frontCamberEffects.lateralGripMultiplier,
      frontWeight,
      this.corneringStiffnessFront *
        frontCamberEffects.corneringStiffnessMultiplier *
        pressureEffects.stiffnessMultiplier,
      compoundConfig.lateralPeakSlipAngle,
      compoundConfig.postPeakGripLoss,
      compoundConfig.postPeakFalloff
    );
    let rearLatForce = -computeLateralForce(
      this.relaxedRearSlipAngle,
      rearEffectiveGrip * rearCamberEffects.lateralGripMultiplier,
      rearWeight,
      this.corneringStiffnessRear *
        rearCamberEffects.corneringStiffnessMultiplier *
        pressureEffects.stiffnessMultiplier,
      compoundConfig.lateralPeakSlipAngle,
      compoundConfig.postPeakGripLoss,
      compoundConfig.postPeakFalloff
    );

    // Below walking pace a tire stops working off a slip angle: the contact patch
    // grips statically and simply resists being scrubbed sideways. Blending into a
    // damped restoring force keeps full cornering grip in slow hairpins and holds a
    // parked car still, where the old rule scaled lateral grip to zero under 4 m/s
    // and had it exactly backwards.
    //
    // This must use the tire-frame lateral velocity, not the axle's velocity in body
    // coordinates. A car following a tight arc has plenty of body-frame sideways
    // velocity at each axle purely from yawing, and treating that as sliding makes
    // the static term saturate and drag the car to a halt in slow corners.
    const staticFrictionBlend = 1.0 - Math.min(1.0, absForward / 3.0);
    if (staticFrictionBlend > 0) {
      const staticSettleTime = 0.18;
      const frontStaticLatForce = THREE.MathUtils.clamp(
        (-(frontWeight / GRAVITY) * frontTireLateralVel) / staticSettleTime,
        -frontMaxGrip,
        frontMaxGrip
      );
      const rearStaticLatForce = THREE.MathUtils.clamp(
        (-(rearWeight / GRAVITY) * rearTireLateralVel) / staticSettleTime,
        -rearMaxGrip,
        rearMaxGrip
      );
      frontLatForce = THREE.MathUtils.lerp(
        frontLatForce,
        frontStaticLatForce,
        staticFrictionBlend
      );
      rearLatForce = THREE.MathUtils.lerp(
        rearLatForce,
        rearStaticLatForce,
        staticFrictionBlend
      );
    }
    frontLatForce *= brakingSteerReduction;

    // --- LONGITUDINAL TIRE FORCES ---
    // Cap on the force the contact patch can transmit. The pure longitudinal extent of
    // the ellipse, narrowed by however much the ellipse had to scale this axle last
    // substep -- so when cornering is already using the grip, torque past what is left
    // spins or locks the wheel instead of quietly disappearing. Using last substep's
    // scale rather than this substep's lateral force keeps the coupling a negative
    // feedback: a smaller cap means less longitudinal force, which relaxes the scale
    // again. The differential term reflects how much of the axle's grip an open diff
    // can actually use.
    const frontLongCapacity =
      frontMaxLongitudinal *
      this.frontEllipseScale *
      (0.86 + diffLock * 0.12);
    const rearLongCapacity =
      rearMaxLongitudinal *
      this.rearEllipseScale *
      (0.86 + diffLock * 0.12);

    const frontAxleState = this.integrateAxleWheelSpeed(
      this.frontWheelSpeed,
      frontRequestedForce,
      frontEffectiveGrip * frontCamberEffects.longitudinalGripMultiplier,
      frontWeight,
      frontLongCapacity,
      local.forward,
      deltaTime
    );
    const rearAxleState = this.integrateAxleWheelSpeed(
      this.rearWheelSpeed,
      rearRequestedForce,
      rearEffectiveGrip * rearCamberEffects.longitudinalGripMultiplier,
      rearWeight,
      rearLongCapacity,
      local.forward,
      deltaTime
    );
    // Emergency braking keeps rear cornering stiffness intact so it cannot initiate a drift.
    this.frontWheelSpeed = frontAxleState.wheelSpeed;
    this.rearWheelSpeed = rearAxleState.wheelSpeed;
    const frontSlipRatio = frontAxleState.slipRatio;
    const rearSlipRatio = rearAxleState.slipRatio;
    let frontLongForce = frontAxleState.longitudinalForce;
    let rearLongForce = rearAxleState.longitudinalForce;

    // One friction ellipse, applied once, scaling lateral and longitudinal together.
    // This is the coupling behind power oversteer -- a rear tire spending its grip on
    // acceleration keeps proportionally less for cornering -- and behind losing the
    // front end under heavy braking, without either effect starving the other.
    const frontLatScale =
      compoundConfig.lateralEnvelopeScale *
      frontCamberEffects.lateralGripMultiplier;
    const rearLatScale =
      compoundConfig.lateralEnvelopeScale *
      rearCamberEffects.lateralGripMultiplier;
    const frontLongScale = 1.05 * frontCamberEffects.longitudinalGripMultiplier;
    const rearLongScale = 1.05 * rearCamberEffects.longitudinalGripMultiplier;

    const frontCombined = combinedGripCircle(
      frontLatForce,
      frontLongForce,
      frontMaxGrip,
      frontLongScale,
      frontLatScale
    );
    const rearCombined = combinedGripCircle(
      rearLatForce,
      rearLongForce,
      rearMaxGrip,
      rearLongScale,
      rearLatScale
    );

    // Record how hard the ellipse bit, for next substep's longitudinal cap.
    this.frontEllipseScale = THREE.MathUtils.clamp(
      Math.abs(frontLongForce) > 1
        ? frontCombined.longitudinal / frontLongForce
        : 1,
      0.2,
      1
    );
    this.rearEllipseScale = THREE.MathUtils.clamp(
      Math.abs(rearLongForce) > 1
        ? rearCombined.longitudinal / rearLongForce
        : 1,
      0.2,
      1
    );

    frontLatForce = frontCombined.lateral;
    frontLongForce = frontCombined.longitudinal;
    rearLatForce = rearCombined.lateral;
    rearLongForce = rearCombined.longitudinal;

    this.wheelSpeed = Math.abs(this.getDrivenWheelSpeed());

    // --- TIRE FRAME -> BODY FRAME ---
    // Slip angles were measured in each tire's own frame, so the forces come back in
    // that frame as well. Rotating them onto the chassis axes is what finally
    // produces cornering drag: part of a steered tire's lateral force points
    // straight backwards along the car, which is why turning the wheel costs speed.
    const cosFrontSteer = Math.cos(this.steerAngle);
    const sinFrontSteer = Math.sin(this.steerAngle);
    const cosRearSteer = Math.cos(rearSteerAngle);
    const sinRearSteer = Math.sin(rearSteerAngle);
    const frontBodyLongForce =
      frontLongForce * cosFrontSteer - frontLatForce * sinFrontSteer;
    const frontBodyLatForce =
      frontLatForce * cosFrontSteer + frontLongForce * sinFrontSteer;
    const rearBodyLongForce =
      rearLongForce * cosRearSteer - rearLatForce * sinRearSteer;
    const rearBodyLatForce =
      rearLatForce * cosRearSteer + rearLongForce * sinRearSteer;

    const totalForwardForce =
      frontBodyLongForce + rearBodyLongForce + dragForward;

    // --- YAW RATE: bicycle model ---
    // Yaw moment about the CG from the two axles' body-frame lateral forces.
    const yawTorque =
      frontBodyLatForce * frontAxleDist - rearBodyLatForce * rearAxleDist;
    const yawMomentOfInertia = Math.max(this.yawInertia, 100);
    const yawAccel = yawTorque / yawMomentOfInertia;

    // The textbook claim that (Cf*a^2 + Cr*b^2)/(Iz*V) is already fully produced by
    // the yawRate terms inside the slip angles only holds for an idealized bicycle
    // model: instantaneous slip response and a constant (linear) cornering stiffness.
    // This simulation has neither. Slip angles are relaxed through a first-order lag
    // (relaxTireValue), so the restoring force trails the true kinematic slip by a
    // beat, which bleeds damping out of that coupling exactly when it's needed most.
    // And stiffness is not constant -- it is the local slope of a Pacejka-like curve
    // that falls off past peak slip and shrinks further under combined slip, which is
    // the real mechanism behind trail-braking oversteer: braking loads the front and
    // unloads the rear, so the rear both has less peak force and less stiffness left
    // to resist rotating. Testing this against a plain "corner, release the wheel,
    // brake" maneuver -- a brief, moderate steering correction, nowhere near the
    // tire's limit -- showed the coupling alone is not enough: the car would settle
    // fine on its own but rotate 90+ degrees the instant the brake was applied,
    // which real GT4-style cars do not do outside a genuine loss of control. The
    // damping coefficient and floor below are tuned against that reproduction: mild
    // corrections before braking now stay composed, while sustained near-lock
    // steering at speed still overwhelms the car and breaks it loose, as it should.
    const frontStiffnessRetention = Math.sqrt(
      Math.max(
        0.15,
        1.0 - Math.pow(frontLongForce / Math.max(frontMaxGrip * 1.05, 1), 2)
      )
    );
    const rearStiffnessRetention = Math.sqrt(
      Math.max(
        0.15,
        1.0 - Math.pow(rearLongForce / Math.max(rearMaxGrip * 1.05, 1), 2)
      )
    );
    const frontCorneringStiffness =
      frontEffectiveGrip *
      frontWeight *
      this.corneringStiffnessFront *
      frontCamberEffects.corneringStiffnessMultiplier *
      pressureEffects.stiffnessMultiplier *
      1.3 *
      frontStiffnessRetention;
    const rearCorneringStiffness =
      rearEffectiveGrip *
      rearWeight *
      this.corneringStiffnessRear *
      rearCamberEffects.corneringStiffnessMultiplier *
      pressureEffects.stiffnessMultiplier *
      1.3 *
      rearStiffnessRetention;
    const axleYawStiffness =
      frontCorneringStiffness * frontAxleDist * frontAxleDist +
      rearCorneringStiffness * rearAxleDist * rearAxleDist;
    const residualYawDamping = THREE.MathUtils.clamp(
      (axleYawStiffness * 0.9) /
        (yawMomentOfInertia * Math.max(speedMagnitude, 3.0)),
      0.9,
      12.0
    );

    this.yawRate =
      (this.yawRate + yawAccel * deltaTime) *
      Math.exp(-residualYawDamping * deltaTime);
    // Safety net only, not a handling parameter. No road car sustains this much yaw
    // rate, and it keeps one bad frame from becoming an unrecoverable spin.
    this.yawRate = THREE.MathUtils.clamp(this.yawRate, -4.0, 4.0);

    const spinThreshold = 1.9;
    if (
      absForward > 18 &&
      (Math.abs(this.yawRate) > spinThreshold || Math.abs(this.driftAngle) > 0.72)
    ) {
      this.isSpinning = true;
      this.spinTimer = Math.max(this.spinTimer, 0.6);
    } else if (this.spinTimer > 0) {
      this.spinTimer = Math.max(0, this.spinTimer - deltaTime);
    } else if (Math.abs(this.yawRate) < 0.45 && Math.abs(this.driftAngle) < 0.35) {
      this.isSpinning = false;
    }

    // Integrate yaw
    if (absForward > 0.3 || Math.abs(this.yawRate) > 0.01) {
      this.yaw += this.yawRate * deltaTime;
    }

    // Grass yaw oscillation (preserved from old system)
    if (this.grassInstability > 0 && absForward > 8) {
      const time = this.physicsTime;
      const speedRatio = absForward / this.maxSpeed;
      const freq = 4.0 + absForward * 0.06;
      const yawOscillation = Math.sin(time * freq) * 0.008 * this.grassInstability * speedRatio;
      this.yaw += yawOscillation * 60 * deltaTime;

      const steerNoise = (Math.random() - 0.5) * 0.025 * this.grassInstability * speedRatio;
      this.steerAngle += steerNoise;
      this.steeringWheelAngle =
        this.steerAngle * this.steeringRackRatio;
    }

    // --- APPLY FORCES TO VELOCITY ---
    // Gravity resolved along the ground plane. Without this a hill is only scenery:
    // the car climbs a 20% grade at full throttle speed, coasting downhill never
    // gains pace, and parking on a slope holds instead of rolling back.
    const slopeForwardForce = -this.mass * GRAVITY * Math.sin(this.terrainPitchRad);
    const slopeLateralForce = -this.mass * GRAVITY * Math.sin(this.terrainRollRad);

    const lateralGravityForce = -this.mass * GRAVITY * Math.sin(bankAngleRad);
    const totalLatForce =
      frontBodyLatForce + rearBodyLatForce + dragLateral + lateralGravityForce + slopeLateralForce;
    const totalForwardWithSlope = totalForwardForce + slopeForwardForce;
    this.applyLocalForce(totalForwardWithSlope, totalLatForce, deltaTime);

    // Load transfer is driven by what the tires push against the road, not by the
    // chassis acceleration. Taking moments about a contact patch, the inertial term
    // m*a and the gravity term m*g*sin(slope) sum back to exactly the tire force, so
    // the slope has to be left out here even though it is very much in the velocity
    // integration above. Adding it in cancelled the transfer instead of causing it:
    // a front-drive car launched *better* uphill than on the flat, because climbing
    // reported less acceleration and so kept weight on the driven axle.

    // Chassis accelerations come straight from the forces that were just applied, in
    // the same substep. The old estimates arrived through a pair of ~150 ms filters
    // fed by last frame's speed, and the lateral one was `forward * yawRate`, which
    // ignores the sideslip term entirely and so reads wrong during any slide. That
    // lag is what load transfer depends on, and it is why the transition hacks were
    // needed at all.
    this.longitudinalAccel = totalForwardForce / Math.max(this.mass, 1);
    // Banking's gravity term is left in, as it always has been, rather than changed
    // here on the way past; only the new slope term is excluded.
    this.lateralAccel =
      (totalLatForce - slopeLateralForce) / Math.max(this.mass, 1);

    // --- SPEED LIMITING ---
    // Top speed is set by gearing and the rev limiter, which is physical: finalDrive
    // is solved so top gear reaches maxSpeed near redline. These clamps sit far
    // outside that and exist only as a safety net, so they scale the whole velocity
    // vector rather than rewriting the forward component and leaving sideways
    // momentum untouched.
    const newLocal = this.getLocalVelocity();
    const currentSpeed = newLocal.forward;
    const forwardCeiling = this.maxSpeed * this.speedLimiterMultiplier;
    const reverseCeiling = this.maxSpeed * 0.3;

    if (currentSpeed > forwardCeiling && currentSpeed > 0.01) {
      this.scaleVelocity(forwardCeiling / currentSpeed);
    } else if (currentSpeed < -reverseCeiling && currentSpeed < -0.01) {
      this.scaleVelocity(reverseCeiling / -currentSpeed);
    }


    // Settle only after both linear and angular motion are nearly gone.
    if (throttleValue <= 0.01 && reverseValue <= 0.01) {
      const totalVelSq = this.velocityX * this.velocityX + this.velocityZ * this.velocityZ;
      if (
        totalVelSq < 0.0225 &&
        Math.abs(this.yawRate) < 0.08 &&
        !this.isSpinning
      ) {
        this.velocityX = 0;
        this.velocityZ = 0;
      }
    }

    // --- DERIVE PUBLIC PROPERTIES from velocity ---
    const finalLocal = this.getLocalVelocity();
    this.speed = finalLocal.forward;
    this.groundSpeed = Math.hypot(this.velocityX, this.velocityZ);

    // driftAngle: angle between heading and velocity direction
    if (Math.abs(finalLocal.forward) > 1.0) {
      this.driftAngle = -Math.atan2(finalLocal.lateral, Math.abs(finalLocal.forward));
    } else {
      this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, 0, 5.0 * deltaTime);
    }

    // isDrifting: when rear slip angle is significant
    this.isDrifting = Math.abs(this.driftAngle) > 0.08 && absForward > 8 && this.isGrounded;

    // Thermal capacity of one axle's rotors and calipers, in J/K. Two cast-iron
    // rotors are roughly 8 kg at ~500 J/(kg*K), so the old 105,000 figure was over
    // an order of magnitude too large -- and paired with a cooling coefficient ten
    // times too aggressive it pinned the brakes near 50 C. Fade starts at 520 C, so
    // it could never trigger and the temperature readout never moved off ambient.
    const brakeHeatCapacity = 12000 + this.upgrades.brake.level * 2400;
    // Convective cooling to ambient, per second. Grows with airflow over the disc.
    const brakeCooling =
      (0.0025 + absForward * 0.0006) *
      (1.0 + this.upgrades.brake.level * 0.08);
    this.brakeTemperatureFront = Math.max(
      25,
      this.brakeTemperatureFront +
        (Math.abs(frontBrake * local.forward) / brakeHeatCapacity -
          (this.brakeTemperatureFront - 25) * brakeCooling) *
          deltaTime
    );
    this.brakeTemperatureRear = Math.max(
      25,
      this.brakeTemperatureRear +
        (Math.abs(rearBrake * local.forward) / brakeHeatCapacity -
          (this.brakeTemperatureRear - 25) * brakeCooling) *
          deltaTime
    );

    const averageSlipAngle =
      (Math.abs(this.relaxedFrontSlipAngle) + Math.abs(this.relaxedRearSlipAngle)) * 0.5;
    const averageSlipRatio = (Math.abs(frontSlipRatio) + Math.abs(rearSlipRatio)) * 0.5;
    const brakeIntensity = serviceBrakeInput > 0.01 && absForward > 0.5 ? serviceBrakeInput : 0;
    updateTireTemperature(
      this.tireState,
      absForward / Math.max(this.maxSpeed, 1),
      averageSlipAngle,
      averageSlipRatio,
      brakeIntensity,
      deltaTime
    );

    // --- TIRE WEAR ---
    if (this.tireWearEnabled) {
      const fullFuelMass =
        this.fuelCapacityLiters * this.fuelDensityKgPerLiter;
      const referenceTireLoad =
        (this.dryMass + fullFuelMass) * GRAVITY * 0.25;
      const peakFrontTireLoad =
        (frontWeight + frontLateralTransfer) * 0.5;
      const peakRearTireLoad =
        (rearWeight + rearLateralTransfer) * 0.5;
      const peakNormalLoadRatio =
        Math.max(peakFrontTireLoad, peakRearTireLoad) /
        Math.max(referenceTireLoad, 1);
      accumulateWear(
        this.tireState,
        absForward / Math.max(this.maxSpeed, 1),
        averageSlipAngle,
        brakeIntensity,
        deltaTime,
        peakNormalLoadRatio
      );
    }

    this.prevThrottleValue = throttleValue;
    this.previousTurnInput = turnInput;
  }

  private updatePositionAndEnforceBoundaries(deltaTime: number): void {
    applyGrassSpeedReduction(this, deltaTime);
    applyGrassLateralSlide(this, deltaTime);

    // Integrate position from velocity
    // With velocity in m/s, position integrates at physically correct rate (no dampening needed)
    const visualSpeedScale = 1.0;
    this.pos.x += this.velocityX * visualSpeedScale * deltaTime;
    this.pos.z += this.velocityZ * visualSpeedScale * deltaTime;

    enforceFenceBoundary(this);
  }

  private updateGravitySuspensionAndRoll(deltaTime: number): void {
    // longitudinalAccel is no longer derived here from a speed delta. updateTirePhysics
    // sets it from the forces it actually applied, in the same substep, so the load
    // transfer the suspension sees is not a filtered guess about last frame.
    const targetGroundHeight = this.supportHeight;

    if (!this.isGrounded) {
      this.yVelocity -= GRAVITY * deltaTime;
      this.pos.y += this.yVelocity * deltaTime;

      this.pitch = THREE.MathUtils.lerp(this.pitch, this.yVelocity > 0 ? 0.15 : -0.2, 0.08 * 60 * deltaTime);

      if (this.pos.y <= targetGroundHeight) {
        this.pos.y = targetGroundHeight;
        this.yVelocity = 0;
        this.isGrounded = true;
        // Pitch is left to settle through the grounded lerp rather than snapped to
        // zero: the snap fought whatever attitude the slope wanted and showed up
        // as a jolt every time the car touched down.
        this.suspensionOffset = -0.06;
      }
    } else {
      if (this.isShifting && this.shiftPitchImpulse === 0) {
        this.shiftPitchImpulse = -0.025;
      }
      if (!this.isShifting && this.shiftPitchImpulse !== 0) {
        this.shiftPitchImpulse = 0.015;
      }
      this.shiftPitchImpulse = THREE.MathUtils.lerp(this.shiftPitchImpulse, 0, 5.0 * deltaTime);

      const suspensionPitch = this.suspensionOutput?.pitch ?? 0;
      const suspensionRoll = this.suspensionOutput?.roll ?? 0;
      const suspensionHeave = this.suspensionOutput?.heave ?? 0;
      // Rotation is composed YXZ, so pitch turns about the car's own right axis:
      // a positive rotation there puts the nose down, hence the sign flip when
      // laying the body onto rising ground.
      this.pitch = THREE.MathUtils.lerp(
        this.pitch,
        suspensionPitch + this.shiftPitchImpulse - this.terrainPitchRad,
        10.0 * deltaTime
      );
      this.roll = THREE.MathUtils.lerp(
        this.roll,
        suspensionRoll + this.terrainRollRad,
        10.0 * deltaTime
      );
      this.suspensionOffset = THREE.MathUtils.lerp(
        this.suspensionOffset,
        suspensionHeave,
        12.0 * deltaTime
      );

      // Cresting a rise: if the ground has dropped further than the wheels could
      // reasonably follow, let the car leave it instead of magnetising downhill.
      // The body follows the surface stiffly so that on an ordinary descent the
      // gap stays small; without that, the lag alone crossed the threshold and
      // the car flickered between airborne and grounded all the way down a hill.
      this.pos.y = THREE.MathUtils.lerp(this.pos.y, targetGroundHeight, 25 * deltaTime);
      if (this.pos.y - targetGroundHeight > 0.6 && Math.abs(this.speed) > 12) {
        this.isGrounded = false;
        this.yVelocity = 0;
      }
    }

    if (!this.isGrounded) {
      this.suspensionOffset = THREE.MathUtils.lerp(this.suspensionOffset, 0.02, 3.0 * deltaTime);
    }
  }

  /**
   * One fixed-size physics step. Everything in here integrates state and must only
   * ever be called with the fixed timestep, never with a render delta.
   */
  private stepPhysics(
    deltaTime: number,
    throttleValue: number,
    reverseValue: number,
    turnInput: number,
    handbrake: boolean
  ): void {
    this.physicsTime += deltaTime;
    this.processEngineRpm(deltaTime, throttleValue);
    this.updateFuelSystem(deltaTime);
    this.updateSuspensionModel(deltaTime);
    this.updateTirePhysics(deltaTime, throttleValue, reverseValue, turnInput, handbrake);
    this.updatePositionAndEnforceBoundaries(deltaTime);
    this.updateGravitySuspensionAndRoll(deltaTime);
  }

  /**
   * Per-rendered-frame presentation. Reads physics state, never integrates it, so it
   * is safe to run once per frame regardless of how many physics substeps just ran.
   */
  private updateVisualState(deltaTime: number): void {
    // Steered road wheels.
    if (this.leftFrontWheel && this.rightFrontWheel) {
      const ackermann = this.getAckermannWheelAngles(this.steerAngle);
      this.leftFrontWheel.rotation.y = ackermann.left;
      this.rightFrontWheel.rotation.y = ackermann.right;
    }
    if (this.leftRearWheel) this.leftRearWheel.rotation.y = this.rearSteerAngle;
    if (this.rightRearWheel) this.rightRearWheel.rotation.y = this.rearSteerAngle;

    // Wheel spin. A single shared angle avoids per-wheel floating-point drift.
    const directionSign = this.speed >= 0 ? 1 : -1;
    this.wheelSpinAngle +=
      ((this.wheelSpeed * directionSign) / this.wheelRadius) * deltaTime;
    if (this.wheelSpinAngle > Math.PI * 2) this.wheelSpinAngle -= Math.PI * 2;
    if (this.wheelSpinAngle < -Math.PI * 2) this.wheelSpinAngle += Math.PI * 2;

    this.wheels.forEach((wheel) => {
      const spinNode = wheel.userData.spinNode as THREE.Group | undefined;
      if (spinNode) {
        spinNode.rotation.set(this.wheelSpinAngle, 0, 0);
      }
      wheel.rotation.x = 0;
      wheel.rotation.z = 0;
      const steersWithAxle =
        wheel === this.leftFrontWheel ||
        wheel === this.rightFrontWheel ||
        wheel === this.leftRearWheel ||
        wheel === this.rightRearWheel;
      if (!steersWithAxle) {
        wheel.rotation.y = 0;
      }
    });

    this.updateSuspensionWheelVisuals();
    this.mesh.position.set(this.pos.x, this.pos.y + this.suspensionOffset, this.pos.z);
    // YXZ so yaw is applied first and pitch/roll then act about the car's own
    // axes. With the default XYZ order pitch rotated about the world X axis, so a
    // car driving along X would tip sideways when it should have tipped nose-up.
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');

    const isBraking = this.brakeInput > 0.05;
    this.taillightMaterials.forEach((mat) => {
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

  public update(deltaTime: number, keys: { [key: string]: boolean | number | undefined }, isCountdown: boolean = false) {
    if (this.handleCountdown(isCountdown)) {
      return;
    }

    updateGrassInstability(this, deltaTime);

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

    // Consume the frame's elapsed time in fixed-size physics steps. Excess time
    // beyond the substep budget is dropped rather than simulated, so a long stall
    // slows the car's clock instead of triggering a runaway catch-up loop.
    const step = Vehicle.PHYSICS_TIMESTEP;
    this.physicsTimeAccumulator = Math.min(
      this.physicsTimeAccumulator + Math.max(0, deltaTime),
      step * Vehicle.MAX_PHYSICS_SUBSTEPS
    );
    while (this.physicsTimeAccumulator >= step) {
      this.physicsTimeAccumulator -= step;
      this.stepPhysics(step, throttleValue, reverseValue, turnInput, handbrake);
    }

    this.updateVisualState(deltaTime);
  }

  /**
   * Apply a recorded transform during a post-race replay without advancing physics.
   */
  public applyReplayTransform(transform: {
    position: THREE.Vector3;
    yaw: number;
    pitch: number;
    roll: number;
    speed: number;
    isGrounded: boolean;
  }, deltaTime: number = 1 / 60): void {
    this.pos.copy(transform.position);
    this.yaw = transform.yaw;
    this.pitch = transform.pitch;
    this.roll = transform.roll;
    this.speed = transform.speed;
    this.groundSpeed = Math.abs(transform.speed);
    this.velocityX = Math.sin(transform.yaw) * transform.speed;
    this.velocityZ = Math.cos(transform.yaw) * transform.speed;
    this.wheelSpeed = Math.abs(transform.speed);
    this.isGrounded = transform.isGrounded;
    this.updateVisualState(deltaTime);
  }

  /**
   * Scale the velocity vector by a factor. Use this instead of `speed *= factor`
   * when external code needs to reduce/increase vehicle speed.
   */
  public scaleVelocity(factor: number): void {
    this.velocityX *= factor;
    this.velocityZ *= factor;
    this.speed = this.getLocalVelocity().forward;
    this.groundSpeed = Math.hypot(this.velocityX, this.velocityZ);
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
    this.groundSpeed = Math.abs(newSpeed);
  }

  public reset(pos: THREE.Vector3, yaw: number) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.groundSpeed = 0;
    this.yVelocity = 0;
    this.isGrounded = true;
    this.isDrifting = false;
    this.driftAngle = 0;
    this.steerAngle = 0;
    this.steeringWheelAngle = 0;
    this.steeringTorqueNm = 0;
    this.steeringAssistFraction = 0;
    this.turboSpoolLevel = 0;
    this.engineTemperature = 25;
    this.engineThrottlePosition = 0;
    this.fuelConsumptionLitersPerHour = 0;
    this.fuelDeliveryFactor =
      this.fuelLiters > 0 || this.fuelCapacityLiters <= 0 ? 1 : 0;
    this.isEngineStalled =
      this.powertrainType === 'combustion' &&
      this.fuelCapacityLiters > 0 &&
      this.fuelLiters <= 0;
    this.fuelTowRequired = false;
    this.suspensionOffset = 0;
    this.prevSpeed = 0;
    this.longitudinalAccel = 0;
    this.terrainPitchRad = 0;
    this.terrainRollRad = 0;
    this.lateralAccel = 0;
    this.shiftPitchImpulse = 0;
    this.rearSlipAngle = 0;
    this.yawRate = 0;
    this.isSpinning = false;
    this.spinTimer = 0;
    this.prevThrottleValue = 0;
    this.serviceBrakePressure = 0;
    this.previousTurnInput = 0;
    this.steeringReversalTimer = 0;
    this.currentGear = 1;
    this.rpm = this.powertrainType === 'electric' ? 0 : 1000;
    this.isShifting = false;
    this.shiftTimer = 0;
    this.targetGear = 1;
    this.previousGear = 1;
    this.isRevLimiterCut = false;
    this.grassInstability = 0;
    this.wheelSpinAngle = 0;
    this.frontWheelSpeed = 0;
    this.rearWheelSpeed = 0;
    this.wheelSpeed = 0;
    this.relaxedFrontSlipAngle = 0;
    this.relaxedRearSlipAngle = 0;
    this.frontEllipseScale = 1;
    this.rearEllipseScale = 1;
    this.physicsTimeAccumulator = 0;
    this.physicsTime = 0;
    this.rearSteerAngle = 0;
    this.revMatchTargetRpm = 1000;
    this.clutchEngagement = 1;
    this.torqueConverterMultiplier = 1;
    this.limiterReferenceRpm = 1000;
    this.brakeTemperatureFront = 25;
    this.brakeTemperatureRear = 25;
    // Corner heights reaching the suspension are bump residuals centred on zero, so
    // that is what its previous-height memory starts from, not the car's altitude.
    this.supportHeight = pos.y;
    this.suspensionModel.reset(0);
    this.suspensionOutput = undefined;
    this.wheels.forEach((wheel) => {
      if (wheel.userData.suspensionBaseY !== undefined) {
        wheel.position.y = wheel.userData.suspensionBaseY;
      }
    });

    // Reset velocity-based physics
    this.velocityX = 0;
    this.velocityZ = 0;

    // Reset tire wear (but keep compound selection)
    this.tireState.wear = 0;
    this.tireState.temperature = 25;

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
  }
}
