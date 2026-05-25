import * as THREE from 'three';
import { CARS_DATABASE } from '../config/CarDatabase';
import { updateGrassInstability, applyGrassLateralSlide } from './Grass';
import { enforceFenceBoundary } from './Fence';

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
  public speed = 0;
  public yVelocity = 0; // For jumps
  public isGrounded = true;
  public isDrifting = false;
  public driftAngle = 0;
  public steerAngle = 0; // Smoothly interpolated steering angle for physics and visuals
  public getGroundHeight?: (x: number, z: number) => number;
  public getTrackInfo?: (x: number, z: number) => { dist: number, closestPt: THREE.Vector3 };
  public onFenceCollision?: (contactPt: THREE.Vector3) => void;
  public haveFence = false;
  public trackBoundary = 0;
  public grassInstability = 0; // Progressive instability factor on grass (0.0 to 1.0)
  public isOnGrass?: (x: number, z: number) => boolean;

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
    bodyControlModuleLevel: 0 // Level 0-3: Electronic Traction Control (TCS) preventing low-speed wheel spin
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
    let desiredGear = 1;

    if (absSpeed < max * 0.15) {
      desiredGear = 1;
    } else if (absSpeed < max * 0.28) {
      desiredGear = 2;
    } else if (absSpeed < max * 0.42) {
      desiredGear = 3;
    } else if (absSpeed < max * 0.56) {
      desiredGear = 4;
    } else if (absSpeed < max * 0.72) {
      desiredGear = 5;
    } else {
      desiredGear = 6;
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
    this.maxSpeed = config.maxSpeed;
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

    // [UPGRADE IMPACT]: Custom Gearbox ratio setups increase potential Top Speed bound caps
    if (this.upgrades.driveTrain.gearboxLevel > 0) {
      this.maxSpeed += this.upgrades.driveTrain.gearboxLevel * (config.maxSpeed * 0.03); // 3% increase per level
    }

    // Load GT4-style car character from database
    if (config.character) {
      this.character = { ...config.character };
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
    const handbrake = !!keys[' '];

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
      this.rpm = 1000 + absSpeed * 100;
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

  private computeAerodynamicResistance(deltaTime: number): number {
    let dragForce = this.dragCoeff * this.speed * Math.abs(this.speed);
    let rollingResistance = 0.08 * Math.sign(this.speed);

    if (this.grassInstability > 0) {
      rollingResistance += 0.06 * this.grassInstability * Math.sign(this.speed);
      dragForce += 0.008 * this.grassInstability * this.speed * Math.abs(this.speed);
    }

    return (dragForce + rollingResistance) * 60 * deltaTime;
  }

  private applyTorqueAndAcceleration(deltaTime: number, throttleValue: number, reverseValue: number): void {
    if (throttleValue > 0.01) {
      const currentTorque = this.getTorque(this.rpm);
      let gearEfficiency = (this.isShifting || this.isRevLimiterCut) ? 0.0 : 0.85;

      if (!this.isShifting && !this.isRevLimiterCut) {
        gearEfficiency = 0.83 + (this.upgrades.driveTrain.clutchLevel * 0.04) + (this.upgrades.driveTrain.propellerShaftLevel * 0.02);
        if (gearEfficiency > 0.98) gearEfficiency = 0.98;
      }

      const forceFactor = (currentTorque * this.gearRatios[this.currentGear] * this.finalDrive * gearEfficiency) / this.wheelRadius;
      let actualAcceleration = this.accelerationRate * (forceFactor / 3000) * 60 * deltaTime * throttleValue;

      const weightFactor = 1200 / this.mass;
      actualAcceleration *= weightFactor;

      if (this.upgrades.bodyControlModuleLevel > 0 && this.speed < 12) {
        const tcsFactor = 1.0 - (0.12 * this.upgrades.bodyControlModuleLevel);
        actualAcceleration *= tcsFactor;
      }

      this.speed += actualAcceleration;

      if (this.currentGear === 6) {
        const softLimit = this.maxSpeed * 1.02;
        if (this.speed > softLimit) {
          this.speed = softLimit;
        }
        if (this.speed >= softLimit) {
          this.isRevLimiterCut = true;
        }
      } else {
        if (this.speed > this.maxSpeed) {
          this.speed = this.maxSpeed;
        }
      }
    } else if (reverseValue > 0.01) {
      this.speed -= this.accelerationRate * 0.8 * 60 * deltaTime * reverseValue;
      if (this.speed < -this.maxSpeed * 0.3) this.speed = -this.maxSpeed * 0.3;
    }

    if (this.isRevLimiterCut && this.speed <= this.maxSpeed) {
      this.isRevLimiterCut = false;
    }
  }

  private applyCoastingAndBraking(
    deltaTime: number,
    throttleValue: number,
    reverseValue: number,
    totalResistance: number
  ): void {
    if (throttleValue <= 0.01 && reverseValue <= 0.01 && Math.abs(this.speed) > 0.01) {
      const prevSign = Math.sign(this.speed);
      this.speed -= totalResistance;

      if (this.speed > 0.5) {
        const gearRatio = this.gearRatios[this.currentGear] || 1.0;
        const engineBrakingForce = gearRatio * 0.08 * this.finalDrive * 60 * deltaTime;
        this.speed -= engineBrakingForce;
      }

      if (Math.sign(this.speed) !== prevSign) {
        this.speed = 0;
      }
    } else if (throttleValue <= 0.01 && reverseValue <= 0.01) {
      this.speed = 0;
    }

    if (reverseValue > 0.01 && this.speed > 0) {
      this.speed -= this.brakingRate * 60 * deltaTime * reverseValue;
      if (this.speed < 0) this.speed = 0;
    }
    if (throttleValue > 0.01 && this.speed < 0) {
      this.speed += this.brakingRate * 60 * deltaTime * throttleValue;
      if (this.speed > 0) this.speed = 0;
    }
  }

  private handleGripCircleAndDrag(
    deltaTime: number,
    speedRatio: number,
    throttleValue: number,
    reverseValue: number
  ): void {
    if (this.speed > 3 && this.isGrounded) {
      const lateralForce = Math.abs(this.steerAngle) * speedRatio;
      const longitudinalForce = Math.abs(throttleValue - reverseValue) * 0.3;
      const totalForce = Math.sqrt(lateralForce * lateralForce + longitudinalForce * longitudinalForce);

      const gripLimit = 0.38 + (this.upgrades.suspensionLevel * 0.04);
      const activeGripLimit = gripLimit * (1.0 - 0.20 * this.grassInstability);

      if (totalForce > activeGripLimit) {
        const excess = (totalForce - activeGripLimit) / totalForce;
        const gripLoss = this.speed * excess * 0.35 * deltaTime;
        this.speed -= gripLoss;
        if (this.speed < 0) this.speed = 0;
      }
    }

    if (Math.abs(this.steerAngle) > 0.2 && this.speed > 8) {
      const steerFactor = Math.abs(this.steerAngle);
      const steerDragCoeff = 0.12;
      const speedLoss = this.speed * steerFactor * steerDragCoeff * deltaTime;
      this.speed -= speedLoss;
      if (this.speed < 0) this.speed = 0;
    }
  }

  private handleSpinAndDrift(
    deltaTime: number,
    throttleValue: number,
    turnInput: number,
    handbrake: boolean,
    speedRatio: number
  ): void {
    if (this.isSpinning) {
      this.spinTimer -= deltaTime;
      this.yaw += (Math.PI * 2.0 * 1.5 / 2.0) * deltaTime;
      this.speed *= Math.max(0, 1.0 - 2.5 * deltaTime);
      if (this.speed < 0.5) this.speed = 0;
      this.roll = Math.sin(this.spinTimer * 8) * 0.15;
      this.pitch = Math.sin(this.spinTimer * 5) * 0.08;

      if (this.spinTimer <= 0) {
        this.isSpinning = false;
        this.driftAngle = 0;
        this.rearSlipAngle = 0;
        this.yawRate = 0;
        this.speed = 0;
      }
    } else {
      let canDrift = false;
      if (this.isGrounded && Math.abs(this.speed) > 20) {
        canDrift = handbrake && Math.abs(turnInput) > 0;
      }

      if (canDrift) {
        this.isDrifting = true;
        const baseMaxDrift = this.driveType === 'FWD' ? 0.25 : (this.driveType === 'AWD' ? 0.35 : 0.52);
        const maxDriftAngle = baseMaxDrift / this.character.rearGripMultiplier;
        this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, -turnInput * maxDriftAngle, 0.1 * 60 * deltaTime);
      } else {
        this.isDrifting = false;
        const driftDecayRate = (this.driveType === 'FWD' && throttleValue > 0.01) ? 0.30 : 0.15;
        this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, 0, driftDecayRate * 60 * deltaTime);
      }

      if (this.driveType === 'RWD' && throttleValue > 0.75 && Math.abs(this.speed) > 15 && Math.abs(turnInput) > 0.2) {
        const powerOversteerForce = (1.0 - this.character.rearGripMultiplier) * throttleValue * speedRatio * 0.8;
        const powerDriftTarget = -turnInput * powerOversteerForce;
        this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, this.driftAngle + powerDriftTarget * deltaTime * 3.0, 0.5);
      }

      const throttleDrop = this.prevThrottleValue - throttleValue;
      if (throttleDrop > 0.4 && Math.abs(this.speed) > 30 && Math.abs(turnInput) > 0.15) {
        const liftOffSeverity = throttleDrop * (1.0 - this.character.oversteerResistance) * (1.0 - this.character.weightDistribution);
        this.driftAngle -= turnInput * liftOffSeverity * 0.15;
      }

      if (this.upgrades.brake.hasESC && Math.abs(this.driftAngle) > 0.05 && !handbrake) {
        this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, 0, 0.25 * 60 * deltaTime);
      }

      this.yawRate = THREE.MathUtils.lerp(this.yawRate, this.driftAngle * 2.5 / this.character.yawInertia, 4.0 * deltaTime);
      this.rearSlipAngle = Math.abs(this.driftAngle) + Math.abs(this.yawRate) * 0.3;

      let criticalSlip = 0.45 + this.character.oversteerResistance * 0.35 + (this.character.rearGripMultiplier - 0.8) * 0.4;
      if (this.upgrades.brake.hasESC) {
        criticalSlip += 0.25;
      }
      criticalSlip += this.upgrades.suspensionLevel * 0.05;
      criticalSlip *= (1.0 - 0.20 * this.grassInstability);

      if (this.rearSlipAngle > criticalSlip && Math.abs(this.speed) > 10) {
        const excess = this.rearSlipAngle - criticalSlip;
        const grassFeedbackGain = 1.0 + 0.4 * this.grassInstability;
        const feedbackForce = excess * (2.0 - this.character.rearGripMultiplier) * 1.5 * grassFeedbackGain;
        this.driftAngle += Math.sign(this.driftAngle) * feedbackForce * deltaTime;
      }

      let spinThreshold = 0.85 + (this.upgrades.brake.hasESC ? 0.3 : 0);
      if (this.grassInstability > 0) {
        spinThreshold -= 0.10 * this.grassInstability;
      }
      if (Math.abs(this.driftAngle) > spinThreshold && Math.abs(this.speed) > 8) {
        this.isSpinning = true;
        this.spinTimer = 1.8;
        this.isDrifting = false;
      }
    }

    this.prevThrottleValue = throttleValue;
  }

  private updateSteeringAndYaw(
    deltaTime: number,
    turnInput: number,
    reverseValue: number,
    speedRatio: number
  ): void {
    const targetSteerAngle = turnInput * 0.45;
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteerAngle, 10 * deltaTime);

    if (this.leftFrontWheel && this.rightFrontWheel) {
      this.leftFrontWheel.rotation.y = this.steerAngle;
      this.rightFrontWheel.rotation.y = this.steerAngle;
    }

    const wheelRotSpeed = (this.speed / 0.48) * deltaTime;
    this.wheels.forEach(wheel => {
      wheel.children[0].rotation.x += wheelRotSpeed;
    });

    if (Math.abs(this.speed) > 0.1 && !this.isSpinning) {
      const lowSpeedFactor = Math.min(Math.abs(this.speed) / 12.0, 1.0);
      const weightUndersteer = 0.005 + (this.character.weightDistribution - 0.5) * 0.006;
      const speedSensitivityFactor = 1.0 / (1.0 + (Math.abs(this.speed) * Math.max(0.003, weightUndersteer)));
      const directionFactor = this.speed > 0 ? 1 : -0.7;

      let brakingSteerModifier = 1.0;
      if (reverseValue > 0.01 && this.speed > 0) {
        brakingSteerModifier = this.upgrades.brake.hasABS ? 0.85 : 0.25;
      }

      const yawRate = this.steerAngle * this.handlingRate * lowSpeedFactor * speedSensitivityFactor * directionFactor * brakingSteerModifier;
      this.yaw += yawRate * 60 * deltaTime;
    }

    if (this.grassInstability > 0 && Math.abs(this.speed) > 8) {
      const time = performance.now() * 0.001;
      const freq = 4.0 + Math.abs(this.speed) * 0.06;
      const yawOscillation = Math.sin(time * freq) * 0.008 * this.grassInstability * speedRatio;
      this.yaw += yawOscillation * 60 * deltaTime;

      const steerNoise = (Math.random() - 0.5) * 0.025 * this.grassInstability * speedRatio;
      this.steerAngle += steerNoise;
    }
  }

  private updatePositionAndEnforceBoundaries(
    deltaTime: number,
    throttleValue: number
  ): void {
    let travelYaw = this.yaw + this.driftAngle;

    if (this.driveType === 'FWD' && throttleValue > 0.01 && Math.abs(this.steerAngle) > 0.05) {
      travelYaw += this.steerAngle * 0.30 * throttleValue;
    }

    const headingVector = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), travelYaw);
    const visualSpeedScale = 0.40;

    this.pos.x += headingVector.x * this.speed * visualSpeedScale * deltaTime;
    this.pos.z += headingVector.z * this.speed * visualSpeedScale * deltaTime;

    applyGrassLateralSlide(this, deltaTime);
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
    const speedRatio = Math.abs(this.speed) / this.maxSpeed;
    const { throttleValue, reverseValue, turnInput, handbrake } = this.parseInputs(keys);

    this.processEngineRpm(deltaTime, throttleValue);

    const totalResistance = this.computeAerodynamicResistance(deltaTime);

    this.applyTorqueAndAcceleration(deltaTime, throttleValue, reverseValue);

    this.applyCoastingAndBraking(deltaTime, throttleValue, reverseValue, totalResistance);

    this.handleGripCircleAndDrag(deltaTime, speedRatio, throttleValue, reverseValue);

    this.handleSpinAndDrift(deltaTime, throttleValue, turnInput, handbrake, speedRatio);

    this.updateSteeringAndYaw(deltaTime, turnInput, reverseValue, speedRatio);

    this.updatePositionAndEnforceBoundaries(deltaTime, throttleValue);

    this.updateGravitySuspensionAndRoll(deltaTime, speedBeforeFrame, speedRatio, turnInput);
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

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
  }
}