import * as THREE from 'three';
import { CARS_DATABASE } from '../config/CarDatabase';
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

export class Vehicle {
  public mesh: THREE.Group;
  public wheels: THREE.Object3D[] = [];
  public leftFrontWheel?: THREE.Object3D;
  public rightFrontWheel?: THREE.Object3D;

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
  public getTrackInfo?: (x: number, z: number) => { dist: number, closestPt: THREE.Vector3 };
  public onFenceCollision?: (contactPt: THREE.Vector3) => void;
  public haveFence = false;
  public trackBoundary = 0;
  public grassInstability = 0; // Progressive instability factor on grass (0.0 to 1.0)
  public isOnGrass?: (x: number, z: number) => boolean;

  // --- 2D VELOCITY-BASED PHYSICS ---
  public velocityX = 0;   // World-space X velocity (m/s)
  public velocityZ = 0;   // World-space Z velocity (m/s)
  public wheelBase = 3.2;  // Distance between front and rear axles (m)

  // --- TIRE COMPOUND SYSTEM ---
  public tireState: TireState = createFreshTireState('normal');
  public tireWearEnabled = false;  // Only true in endurance mode

  // --- REALISM ENHANCEMENT VARIABLES ---
  public turboSpoolLevel = 0;       // 0.0–1.0 spool-up fraction for turbo lag
  public suspensionOffset = 0;      // Vertical chassis displacement from suspension compression
  public prevSpeed = 0;             // Previous frame speed for computing longitudinal acceleration
  public longitudinalAccel = 0;     // Smoothed acceleration value (m/s²) for pitch effects
  public shiftPitchImpulse = 0;     // Transient pitch impulse during gear shifts

  // --- SPIN-OUT & CAR CHARACTER VARIABLES ---
  public rearSlipAngle = 0;         // Current rear tire slip angle (radians)
  public yawRate = 0;               // Angular velocity of the car's rotation (rad/s)
  public isSpinning = false;        // True when car has entered unrecoverable spin
  public spinTimer = 0;             // Time remaining in spin animation
  public prevThrottleValue = 0;     // Previous frame throttle for lift-off oversteer detection

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
    tireCompound: 'normal' as TireCompoundType  // Tire compound selection
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

  // ดึงค่าแรงบิดตามกราฟรอบเครื่องยนต์ (Torque Curve)
  private getTorque(currentRpm: number): number {
    const config = CARS_DATABASE.find(c => c.id === this.carId) || CARS_DATABASE[0];
    let baseTorque = 180;
    if (config.tier === 'Sport Tier') baseTorque = 240;
    else if (config.tier === 'Hyper Tier') baseTorque = 320;
    else if (config.tier === 'Legendary Tier') baseTorque = 400;

    // [UPGRADE IMPACT]: Engine tuning alters base rotational force
    baseTorque += this.upgrades.mufflers * 12;
    baseTorque += this.upgrades.engine.ecuLevel * 20;
    baseTorque += this.upgrades.engine.portGrindingLevel * 25;

    let torque = baseTorque;
    if (currentRpm < 1000) {
      torque = baseTorque * 0.9;
    } else if (currentRpm >= 1000 && currentRpm < 4500) {
      // RPM climbing stage
      torque = baseTorque + (currentRpm - 1000) * 0.04;
    } else if (currentRpm >= 4500 && currentRpm <= this.maxRpm) {
      // Falling stage near redline (port grinding flattens this drop out)
      const highRpmDrop = 0.06 - (this.upgrades.engine.portGrindingLevel * 0.01);
      torque = (baseTorque + 140) - (currentRpm - 4500) * Math.max(0.02, highRpmDrop);
    } else {
      torque = 10; // Rev limiter cut-off
    }

    // [UPGRADE IMPACT]: Turbo Aspiration with realistic spool-up lag
    // Turbo boost is now gated by turboSpoolLevel (0.0–1.0) which ramps up over time
    if (this.upgrades.aspiration === 'turbo' && currentRpm > 3200 && currentRpm < 5800) {
      const boostSwell = Math.sin((currentRpm - 3200) / 2600 * Math.PI) * 65;
      torque += boostSwell * this.turboSpoolLevel;
    }

    return Math.max(10, torque);
  }

  // ระบบเปลี่ยนเกียร์อัตโนมัติอิงตามความเร็วรถ (Auto Gearbox Logic - Speed-based dynamically scaled to maxSpeed)
  private handleAutoTransmission(deltaTime: number) {
    if (this.speed < 0) {
      this.currentGear = 1;
      return;
    }

    const absSpeed = Math.abs(this.speed);
    const max = this.maxSpeed;
    let desiredGear = this.currentGear;

    // Base shift thresholds
    const t1 = max * 0.15;
    const t2 = max * 0.28;
    const t3 = max * 0.42;
    const t4 = max * 0.56;
    const t5 = max * 0.72;

    // Hysteresis margin to prevent gear hunting (constantly shifting up and down)
    const margin = max * 0.02;

    // Upshifts
    if (desiredGear === 1 && absSpeed > t1 + margin) desiredGear = 2;
    else if (desiredGear === 2 && absSpeed > t2 + margin) desiredGear = 3;
    else if (desiredGear === 3 && absSpeed > t3 + margin) desiredGear = 4;
    else if (desiredGear === 4 && absSpeed > t4 + margin) desiredGear = 5;
    else if (desiredGear === 5 && absSpeed > t5 + margin) desiredGear = 6;

    // Downshifts
    if (desiredGear === 6 && absSpeed < t5 - margin) desiredGear = 5;
    else if (desiredGear === 5 && absSpeed < t4 - margin) desiredGear = 4;
    else if (desiredGear === 4 && absSpeed < t3 - margin) desiredGear = 3;
    else if (desiredGear === 3 && absSpeed < t2 - margin) desiredGear = 2;
    else if (desiredGear === 2 && absSpeed < t1 - margin) desiredGear = 1;

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

  public rebuild(carId: string, color: string) {
    this.carId = carId;
    this.color = color;

    // Clear old children
    while (this.mesh.children.length > 0) {
      this.mesh.remove(this.mesh.children[0]);
    }
    this.wheels = [];
    this.leftFrontWheel = undefined;
    this.rightFrontWheel = undefined;

    this.updateStats();
    this.buildMesh();
  }

  private buildMesh() {
    // Chassis Base
    const chassisGeom = new THREE.BoxGeometry(2.4, 0.5, 4.8);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.color),
      roughness: 0.2,
      metalness: 0.8,
    });
    const chassis = new THREE.Mesh(chassisGeom, chassisMat);
    chassis.position.y = 0.45;
    this.mesh.add(chassis);

    // Cabin/Windshield
    const cabinGeom = new THREE.BoxGeometry(1.8, 0.6, 2.2);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x050510,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.75,
    });
    const cabin = new THREE.Mesh(cabinGeom, cabinMat);
    cabin.position.set(0, 0.9, -0.2); // Sits slightly back
    this.mesh.add(cabin);

    // Windshield frame
    const windshieldGeom = new THREE.BoxGeometry(1.7, 0.5, 1.2);
    const windshieldMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      roughness: 0.05,
      metalness: 0.95,
      emissive: 0x003333,
    });
    const windshield = new THREE.Mesh(windshieldGeom, windshieldMat);
    windshield.position.set(0, 0.85, 0.8);
    windshield.rotation.x = -0.5; // Angled windshield
    this.mesh.add(windshield);

    // Neon Headlights (Cyan glowing cylinders)
    const headlightGeom = new THREE.BoxGeometry(0.6, 0.12, 0.2);
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 2.0
    });

    const leftHeadlight = new THREE.Mesh(headlightGeom, headlightMat);
    leftHeadlight.position.set(-0.8, 0.45, 2.4);
    this.mesh.add(leftHeadlight);

    const rightHeadlight = leftHeadlight.clone();
    rightHeadlight.position.x = 0.8;
    this.mesh.add(rightHeadlight);

    // Dynamic light beam emitting from front
    const frontSpot = new THREE.SpotLight(0x00ffff, 4, 30, Math.PI / 4, 0.5, 1);
    frontSpot.position.set(0, 0.5, 2.5);
    frontSpot.target.position.set(0, 0, 10);
    this.mesh.add(frontSpot);
    this.mesh.add(frontSpot.target);

    // Red Tail lights
    const taillightGeom = new THREE.BoxGeometry(0.8, 0.1, 0.1);
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xff0055,
      emissive: 0xff0055,
      emissiveIntensity: 1.5
    });
    const tailLight = new THREE.Mesh(taillightGeom, taillightMat);
    tailLight.position.set(0, 0.5, -2.4);
    this.mesh.add(tailLight);

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

    // Neon Underglow Light
    const underglow = new THREE.PointLight(new THREE.Color(this.color), 3, 6);
    underglow.position.set(0, -0.2, 0);
    this.mesh.add(underglow);

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
      const wingMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.color), roughness: 0.3 });
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
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x003333,
      metalness: 0.9,
    });

    const createWheelAssembly = (x: number, y: number, z: number, isFront: boolean) => {
      const wGroup = new THREE.Group();
      wGroup.position.set(x, y, z);

      const tire = new THREE.Mesh(wheelGeom, wheelMat);
      const rim = new THREE.Mesh(rimGeom, rimMat);
      wGroup.add(tire);
      wGroup.add(rim);

      this.mesh.add(wGroup);
      this.wheels.push(wGroup);

      if (isFront) {
        if (x < 0) this.leftFrontWheel = wGroup;
        else this.rightFrontWheel = wGroup;
      }
    };

    // Position wheels
    createWheelAssembly(-1.25, 0.48, 1.6, true);  // Front Left
    createWheelAssembly(1.25, 0.48, 1.6, true);   // Front Right
    createWheelAssembly(-1.25, 0.48, -1.6, false); // Rear Left
    createWheelAssembly(1.25, 0.48, -1.6, false);  // Rear Right
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
    if (config.finalDrive !== undefined) {
      this.finalDrive = config.finalDrive;
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
    this.baseMass = baseMass;

    // [UPGRADE IMPACT]: Weight Reduction stage directly drops target mass (lighter = quicker)
    this.mass = this.baseMass - (this.upgrades.weightReduction * 80);

    // [UPGRADE IMPACT]: Suspension improves cornering responsive thresholds
    this.handlingRate = config.handlingRate + (this.upgrades.suspensionLevel * 0.005);

    // [UPGRADE IMPACT]: Brake Level upgrades absolute stopping capability
    this.brakingRate = (config.brakingRate !== undefined ? config.brakingRate : 0.8) + (this.upgrades.brake.level * 0.25);

    // [UPGRADE IMPACT]: Engine blueprinting/balancing & ECU expansion raises structural safety limits for RPM
    this.maxRpm = 6500 + (this.upgrades.engine.ecuLevel * 250) + (this.upgrades.engine.engineBalancingLevel * 350);

    // [UPGRADE IMPACT]: Custom Gearbox ratio setups increase potential Top Speed bound caps (in m/s)
    if (this.upgrades.driveTrain.gearboxLevel > 0) {
      this.maxSpeed += this.upgrades.driveTrain.gearboxLevel * (config.maxSpeed / 3.6 * 0.03); // 3% increase per level
    }

    // Load GT4-style car character from database
    if (config.character) {
      this.character = { ...config.character };
    }

    // Sync tire compound from upgrades (fallback to normal if undefined)
    this.tireState.compound = this.upgrades.tireCompound || 'normal';
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

    const throttleValue = typeof keys['throttleAnalog'] === 'number' ? keys['throttleAnalog'] : (throttle ? 1.0 : 0.0);
    const reverseValue = typeof keys['reverseAnalog'] === 'number' ? keys['reverseAnalog'] : (reverse ? 1.0 : 0.0);
    const turnInput = typeof keys['steerAnalog'] === 'number' ? keys['steerAnalog'] : ((turnLeft ? 1 : 0) - (turnRight ? 1 : 0));

    return { throttleValue, reverseValue, turnInput, handbrake };
  }

  private processEngineRpm(deltaTime: number, throttleValue: number): void {
    this.handleAutoTransmission(deltaTime);

    const absSpeed = Math.abs(this.speed);
    if (this.speed >= 0) {
      const max = this.maxSpeed;

      const getGearRpm = (gearNum: number, speedVal: number) => {
        let lower = 0;
        let upper = max * 0.15;
        let entry = 1000;

        if (gearNum === 1) {
          lower = 0; upper = max * 0.15; entry = 1000;
        } else if (gearNum === 2) {
          lower = max * 0.15; upper = max * 0.28; entry = 3200;
        } else if (gearNum === 3) {
          lower = max * 0.28; upper = max * 0.42; entry = 3500;
        } else if (gearNum === 4) {
          lower = max * 0.42; upper = max * 0.56; entry = 3800;
        } else if (gearNum === 5) {
          lower = max * 0.56; upper = max * 0.72; entry = 4000;
        } else if (gearNum === 6) {
          lower = max * 0.72; upper = max * 1.0; entry = 4200;
        }

        let frac = 0;
        if (upper > lower) {
          frac = (speedVal - lower) / (upper - lower);
        }
        return entry + Math.max(0, frac) * (this.maxRpm - 500 - entry);
      };

      if (this.isRevLimiterCut) {
        this.rpm = (this.maxRpm - 150) + Math.sin(performance.now() * 0.05) * 100;
      } else if (this.isShifting) {
        const rpmPrev = getGearRpm(this.previousGear, absSpeed);
        const rpmTarget = getGearRpm(this.targetGear, absSpeed);
        const duration = (this.targetGear > this.previousGear) ? 0.35 : 0.20;
        const shiftTimeModifier = 1.0 - (this.upgrades.driveTrain.gearboxLevel * 0.12) - (this.upgrades.driveTrain.flywheelLevel * 0.05);
        const actualDuration = Math.max(0.08, duration * shiftTimeModifier);
        const progress = 1 - (this.shiftTimer / actualDuration);
        this.rpm = THREE.MathUtils.lerp(rpmPrev, rpmTarget, progress);
      } else {
        this.rpm = getGearRpm(this.currentGear, absSpeed);
      }

      this.rpm = Math.max(1000, Math.min(this.rpm, this.maxRpm));
    } else {
      // absSpeed is in m/s; multiply by 3.6 to restore km/h-scale RPM relationship
      this.rpm = 1000 + (absSpeed * 3.6) * 100;
      this.currentGear = 1;
    }

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
    const speedRatio = Math.min(1.0, absForward / Math.max(1, this.maxSpeed));
    const maxSteer = THREE.MathUtils.lerp(0.45, 0.12, speedRatio);

    // Dynamic Countersteer Assist (Stability Helper)
    let assistSteer = 0;
    if (absForward > 5 && Math.abs(this.driftAngle) > 0.05) {
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

    // Visual wheel rotation
    if (this.leftFrontWheel && this.rightFrontWheel) {
      this.leftFrontWheel.rotation.y = this.steerAngle;
      this.rightFrontWheel.rotation.y = this.steerAngle;
    }
    const wheelRotSpeed = (local.forward / this.wheelRadius) * deltaTime;
    this.wheels.forEach(wheel => {
      wheel.children[0].rotation.x += wheelRotSpeed;
    });

    // --- EFFECTIVE GRIP ---
    const baseGripCoeff = this.getEffectiveTireGrip();
    const gravity = 9.81;
    const totalWeight = this.mass * gravity;
    const frontWeight = totalWeight * this.character.weightDistribution;
    const rearWeight = totalWeight * (1.0 - this.character.weightDistribution);

    // --- FRONT AXLE: slip angle ---
    // Front tire velocity in local frame includes yaw rate contribution
    // Front axle is wheelBase * weightDistribution ahead of CG
    const frontAxleDist = this.wheelBase * (1.0 - this.character.weightDistribution);
    const frontLateralVel = local.lateral + this.yawRate * frontAxleDist;
    // Front tires are steered, so their slip angle is relative to the steer direction
    const frontSlipAngle = computeSlipAngle(
      frontLateralVel * Math.cos(this.steerAngle) - local.forward * Math.sin(this.steerAngle),
      local.forward * Math.cos(this.steerAngle) + frontLateralVel * Math.sin(this.steerAngle)
    );

    // --- REAR AXLE: slip angle ---
    const rearAxleDist = this.wheelBase * this.character.weightDistribution;
    const rearLateralVel = local.lateral - this.yawRate * rearAxleDist;
    const rearSlipAngle = computeSlipAngle(rearLateralVel, local.forward);

    // Store for external access
    this.rearSlipAngle = Math.abs(rearSlipAngle);

    // --- TIRE GRIP MODIFIERS ---
    let frontGrip = baseGripCoeff;
    let rearGrip = baseGripCoeff * this.character.rearGripMultiplier;

    // Handbrake: dramatically reduce rear grip to initiate drift
    if (handbrake && absForward > 5) {
      rearGrip *= 0.15;
    }

    // Lift-off oversteer: sudden throttle release shifts weight forward, unloading rear
    const throttleDrop = this.prevThrottleValue - throttleValue;
    if (throttleDrop > 0.4 && absForward > 20 && Math.abs(turnInput) > 0.15) {
      const liftOffSeverity = throttleDrop * (1.0 - this.character.oversteerResistance) * (1.0 - this.character.weightDistribution);
      rearGrip *= (1.0 - liftOffSeverity * 0.5);
    }

    // Power oversteer for RWD: excess throttle on rear tires reduces their lateral grip
    if (this.driveType === 'RWD' && throttleValue > 0.7 && absForward > 10) {
      const powerOversteerFactor = (1.0 - this.character.rearGripMultiplier) * throttleValue * 0.35;
      rearGrip *= (1.0 - powerOversteerFactor);
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

    // --- LATERAL FORCES (Pacejka-lite) ---
    // Cornering stiffness: lower = more progressive grip, less snap-oversteer
    const corneringStiffness = 5.5;
    // The force applied BY the tire ON the car opposes the slip angle, so we negate the result
    let frontLatForce = -computeLateralForce(frontSlipAngle, frontGrip, frontWeight, corneringStiffness);
    let rearLatForce = -computeLateralForce(rearSlipAngle, rearGrip, rearWeight, corneringStiffness);

    // Dampen lateral forces at very low speeds to prevent Pacejka jitter and instant snap oversteer at launch
    const lowSpeedDampener = Math.min(1.0, absForward / 4.0);
    frontLatForce *= lowSpeedDampener;
    rearLatForce *= lowSpeedDampener;

    // Apply braking steer reduction to front lateral force
    frontLatForce *= brakingSteerReduction;

    let driveForce = 0;
    if (throttleValue > 0.01) {
      const currentTorque = this.getTorque(this.rpm);
      let gearEfficiency = (this.isShifting || this.isRevLimiterCut) ? 0.0 : 0.85;

      if (!this.isShifting && !this.isRevLimiterCut) {
        gearEfficiency = 0.83 + (this.upgrades.driveTrain.clutchLevel * 0.04) + (this.upgrades.driveTrain.propellerShaftLevel * 0.02);
        if (gearEfficiency > 0.98) gearEfficiency = 0.98;
      }

      driveForce = (currentTorque * this.gearRatios[this.currentGear] * this.finalDrive * gearEfficiency) / this.wheelRadius;
      
      // Apply simcade acceleration boost based on the car's built-in accelerationRate.
      // This bridges the gap between realistic torque and the fast arcade feel of the old physics.
      // Mass is NOT included here so that weight reduction upgrades correctly improve acceleration (a=F/m).
      const arcadeMultiplier = this.accelerationRate * 28.0;
      driveForce *= arcadeMultiplier;

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
      // Forward braking (scaled up to match arcade-style 48m/s^2 deceleration)
      brakeForce = -this.brakingRate * 60.0 * this.mass * reverseValue;
    } else if (reverseValue > 0.01 && local.forward <= 0.5) {
      // Reversing (toned down to 15.0 instead of 60.0 for realistic reverse speeds)
      if (local.forward > -12.0) { // Limit reverse speed to ~43 km/h
        driveForce = -this.accelerationRate * 15.0 * this.mass * reverseValue;
      }
    }
    if (throttleValue > 0.01 && local.forward < -0.5) {
      // Brake from reverse
      brakeForce = this.brakingRate * 60.0 * this.mass * throttleValue;
    }

    // Drag + rolling resistance
    // In old physics, dragCoeff was tuned to balance speed limits in arbitrary units (e.g., 0.000012)
    // We scale it up significantly to act as physical drag in Newtons.
    const dragForce = -this.dragCoeff * 50000 * local.forward * Math.abs(local.forward);
    let rollingResistance = -0.08 * Math.sign(local.forward) * this.mass;
    if (this.grassInstability > 0) {
      rollingResistance -= 0.06 * this.grassInstability * Math.sign(local.forward) * this.mass;
    }

    // Engine braking when coasting (Arcade style)
    // When the player lets off the gas, we want the car to aggressively slow down.
    let engineBraking = 0;
    if (throttleValue <= 0.01 && reverseValue <= 0.01 && absForward > 0.5) {
      // 2.5 m/s² of coasting deceleration — realistic engine braking that doesn't
      // overwhelm rear tire grip and cause unwanted oversteer during throttle lift-off.
      engineBraking = -2.5 * this.mass * Math.sign(local.forward);
    }

    // Split driveForce and engineBraking per axle based on driveType
    let frontDrive = 0;
    let rearDrive = 0;
    let frontEngineBrake = 0;
    let rearEngineBrake = 0;

    if (this.driveType === 'FWD') {
      frontDrive = driveForce;
      frontEngineBrake = engineBraking;
    } else if (this.driveType === 'RWD') {
      rearDrive = driveForce;
      rearEngineBrake = engineBraking;
    } else { // AWD
      frontDrive = driveForce * 0.4;
      rearDrive = driveForce * 0.6;
      frontEngineBrake = engineBraking * 0.4;
      rearEngineBrake = engineBraking * 0.6;
    }

    // Split brakeForce using a 60/40 front/rear bias
    const frontBrake = brakeForce * 0.6;
    const rearBrake = brakeForce * 0.4;

    // Longitudinal contact patch forces for combined grip circle
    const frontLongForce = frontDrive + frontBrake + frontEngineBrake;
    const rearLongForce = rearDrive + rearBrake + rearEngineBrake;

    // Total forward force acting on the vehicle chassis
    const totalForwardForce = driveForce + brakeForce + dragForce + rollingResistance + engineBraking;

    // --- COMBINED GRIP CIRCLE for front and rear axles ---
    // Ensure drive/braking force + lateral force don't exceed tire friction circle
    const frontMaxGrip = frontGrip * frontWeight;
    const frontCombined = combinedGripCircle(frontLatForce, frontLongForce, frontMaxGrip);
    frontLatForce = frontCombined.lateral;

    const rearMaxGrip = rearGrip * rearWeight;
    const rearCombined = combinedGripCircle(rearLatForce, rearLongForce, rearMaxGrip);
    rearLatForce = rearCombined.lateral;

    // --- YAW RATE: bicycle model ---
    // Torque about CG from front and rear lateral forces
    const yawTorque = frontLatForce * frontAxleDist - rearLatForce * rearAxleDist;
    // Yaw moment of inertia determines how quickly the car can rotate.
    // Adjusted multiplier to 1.15 to make the car feel planted and prevent instant oversteer.
    const yawMomentOfInertia = this.mass * (this.wheelBase * 0.5) * (this.wheelBase * 0.5) * this.character.yawInertia * 1.15;

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
    const totalLatForce = frontLatForce + rearLatForce; 
    this.applyLocalForce(totalForwardForce, totalLatForce, deltaTime);

    // --- SPEED LIMITING ---
    const newLocal = this.getLocalVelocity();
    const currentSpeed = newLocal.forward;

    if (currentSpeed > 0 && this.currentGear === 6) {
      const softLimit = this.maxSpeed * 1.02;
      if (currentSpeed > softLimit) {
        // Scale velocity to clamp forward speed
        const scaleFactor = softLimit / currentSpeed;
        const sinYaw = Math.sin(this.yaw);
        const cosYaw = Math.cos(this.yaw);
        // Decompose, clamp forward, recompose
        const clampedForward = softLimit;
        this.velocityX = clampedForward * sinYaw + newLocal.lateral * cosYaw;
        this.velocityZ = clampedForward * cosYaw - newLocal.lateral * sinYaw;
        this.isRevLimiterCut = true;
      }
    } else if (currentSpeed > this.maxSpeed) {
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);
      const clampedForward = this.maxSpeed;
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

    this.processEngineRpm(deltaTime, throttleValue);

    // NEW: unified tire physics replaces the old separate methods
    this.updateTirePhysics(deltaTime, throttleValue, reverseValue, turnInput, handbrake);

    const speedRatio = Math.abs(this.speed) / this.maxSpeed;

    this.updatePositionAndEnforceBoundaries(deltaTime);

    this.updateGravitySuspensionAndRoll(deltaTime, speedBeforeFrame, speedRatio, turnInput);
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

    // Reset velocity-based physics
    this.velocityX = 0;
    this.velocityZ = 0;

    // Reset tire wear (but keep compound selection)
    this.tireState.wear = 0;

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
  }
}