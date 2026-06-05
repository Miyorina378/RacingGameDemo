import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

  // ดึงค่าแรงบิดตามกราฟรอบเครื่องยนต์ (Torque Curve)
  private getTorque(currentRpm: number): number {
    const config = CARS_DATABASE.find(c => c.id === this.carId) || CARS_DATABASE[0];
    let baseTorque = 150;
    if (config.tier === 'Sport Tier') baseTorque = 200;
    else if (config.tier === 'Hyper Tier') baseTorque = 380;
    else if (config.tier === 'Legendary Tier') baseTorque = 500;

    // [UPGRADE IMPACT]: Engine tuning alters base rotational force
    baseTorque += this.upgrades.mufflers * 10;
    baseTorque += this.upgrades.engine.ecuLevel * 15;
    baseTorque += this.upgrades.engine.portGrindingLevel * 20;

    let torque = baseTorque;
    if (currentRpm < 1000) {
      torque = baseTorque * 0.8;
    } else if (currentRpm >= 1000 && currentRpm < 6000) {
      // Gentle climb to peak torque
      torque = baseTorque * (0.8 + 0.2 * (currentRpm - 1000) / 5000);
    } else if (currentRpm >= 6000 && currentRpm <= 8000) {
      // Peak torque plateau
      torque = baseTorque;
    } else if (currentRpm > 8000 && currentRpm <= this.maxRpm) {
      // Gentle drop-off near redline
      const highRpmDrop = 0.15 - (this.upgrades.engine.portGrindingLevel * 0.03);
      const rpmRange = Math.max(200, this.maxRpm - 8000);
      const dropFraction = (currentRpm - 8000) / rpmRange;
      torque = baseTorque * (1.0 - Math.max(0.05, highRpmDrop) * Math.min(1.0, dropFraction));
    } else {
      torque = 10; // Rev limiter cut-off
    }

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
      // Upshift when RPM >= maxRpm - 400 (94% of redline)
      if (this.rpm >= this.maxRpm - 400 && desiredGear < 6) {
        desiredGear = this.currentGear + 1;
      }
      // Downshift when RPM <= 1800 (with hysteresis prevention)
      else if (this.rpm <= 1800 && desiredGear > 1) {
        desiredGear = this.currentGear - 1;
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
    this.updateStats();

    // Instant color update if it is the same car and meshes are already loaded
    if (this.carId === carId && this.paintMaterials.length > 0 && this.mesh.children.length > 0) {
      this.color = color;
      const paintColor = new THREE.Color(color);
      this.paintMaterials.forEach((mat) => {
        mat.color.copy(paintColor);
      });
      if (onLoadComplete) onLoadComplete();
      return;
    }

    // Otherwise, we are switching cars or loading for the first time
    this.carId = carId;
    this.color = color;

    this.paintMaterials = [];
    this.windshieldMaterials = [];
    this.rimMaterials = [];
    this.underglowMaterial = undefined;
    this.taillightMaterials = [];

    // Note: Do NOT clear old children immediately for GLTF models to avoid showing skeleton.
    // Procedural cars build instantly, so we can clear them now.
    if (carId !== 'honda_s2000') {
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
              if (mat && (mat as any).name) {
                const matName = (mat as any).name.toLowerCase();
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
                  nodeName.includes('body') ||
                  nodeName.includes('paint') ||
                  nodeName.includes('chassis') ||
                  nodeName.includes('exterior') ||
                  matName.includes('body') ||
                  matName.includes('paint') ||
                  matName.includes('exterior') ||
                  matName.includes('car_paint')
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
      (err: any) => {
        console.error('Failed to load Honda S2000 model:', err);
        onLoadComplete?.();
      }
    );
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

    const throttleValue = typeof keys['throttleAnalog'] === 'number' ? keys['throttleAnalog'] : (throttle ? 1.0 : 0.0);
    const reverseValue = typeof keys['reverseAnalog'] === 'number' ? keys['reverseAnalog'] : (reverse ? 1.0 : 0.0);
    const turnInput = typeof keys['steerAnalog'] === 'number' ? keys['steerAnalog'] : ((turnLeft ? 1 : 0) - (turnRight ? 1 : 0));

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
    const maxSteerLimit = isDriftingOrHandbraking ? 0.35 : 0.22;
    const speedRatio = Math.min(1.0, absForward / Math.max(1, this.maxSpeed));
    const maxSteer = THREE.MathUtils.lerp(0.45, maxSteerLimit, speedRatio);

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
      this.leftFrontWheel.rotation.y = this.steerAngle;
      this.rightFrontWheel.rotation.y = this.steerAngle;
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
    const gravity = 9.81;

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
    const effectiveGravity = Math.max(1.0, gravity * Math.cos(bankAngleRad) + centAccelNormal);

    const totalWeight = this.mass * effectiveGravity;

    // Dynamic longitudinal weight transfer based on acceleration
    // h = 0.6m (center of gravity height), L = 3.2m (wheelBase)
    const weightTransfer = (this.longitudinalAccel * 0.6 / this.wheelBase) * this.mass;

    const staticFrontWeight = totalWeight * this.character.weightDistribution;
    const staticRearWeight = totalWeight * (1.0 - this.character.weightDistribution);

    // Clamp transfer to prevent negative weight (maximum 80% transfer of static load)
    const maxTransfer = Math.min(staticFrontWeight * 0.8, staticRearWeight * 0.8);
    const clampedTransfer = THREE.MathUtils.clamp(weightTransfer, -maxTransfer, maxTransfer);

    this.dynamicFrontWeight = staticFrontWeight - clampedTransfer;
    this.dynamicRearWeight = staticRearWeight + clampedTransfer;

    const frontWeight = this.dynamicFrontWeight;
    const rearWeight = this.dynamicRearWeight;

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
    if (handbrake) {
      rearGrip *= 0.15;
    }

    // Lift-off oversteer: sudden throttle release shifts weight forward, unloading rear
    const throttleDrop = this.prevThrottleValue - throttleValue;
    if (throttleDrop > 0.4 && absForward > 20 && Math.abs(turnInput) > 0.15) {
      const liftOffSeverity = throttleDrop * (1.0 - this.character.oversteerResistance) * (1.0 - this.character.weightDistribution);
      rearGrip *= (1.0 - liftOffSeverity * 0.5);
    }

    // Power oversteer for RWD: excess throttle on rear tires reduces their lateral grip
    // Works at all speeds (including standstill) to allow burnouts, donuts, and low-speed power slides.
    if (this.driveType === 'RWD' && throttleValue > 0.7) {
      // Scale power oversteer factor: higher at low speed for wheelspin/donuts, tapering off at high speeds
      const speedOversteerScale = absForward < 10 ? 1.5 - (absForward / 10) * 0.5 : 1.0;
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
      // Forward braking (scaled to match realistic ~16m/s^2 deceleration)
      brakeForce = -this.brakingRate * 20.0 * this.mass * reverseValue;
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
      brakeForce = this.brakingRate * 20.0 * this.mass * throttleValue;
    }

    // Handbrake braking force: locks the rear wheels, applying heavy braking force
    let handbrakeBrakeForce = 0;
    if (handbrake) {
      const speedSign = Math.sign(local.forward) || 1;
      const lowSpeedScale = Math.min(1.0, absForward / 0.5);
      handbrakeBrakeForce = -this.brakingRate * 20.0 * this.mass * speedSign * lowSpeedScale;
    }

    // Drag + rolling resistance
    const dragForce = -this.dragCoeff * 50000 * local.forward * Math.abs(local.forward);
    let rollingResistance = -0.08 * Math.sign(local.forward) * this.mass;
    if (this.grassInstability > 0) {
      rollingResistance -= 0.06 * this.grassInstability * Math.sign(local.forward) * this.mass;
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

    // Handbrake disables rear drive force
    if (handbrake) {
      rearDrive *= 0.05;
    }

    const frontMaxGrip = frontGrip * frontWeight;
    const rearMaxGrip = rearGrip * rearWeight;

    // --- TORQUE-INDUCED TRACTION LOSS (WHEELSPIN) ---
    let isWheelspinning = false;
    let excessForce = 0;

    if (this.driveType === 'FWD') {
      const absFrontDrive = Math.abs(frontDrive);
      if (absFrontDrive > frontMaxGrip) {
        isWheelspinning = true;
        excessForce = absFrontDrive - frontMaxGrip;
      }
    } else if (this.driveType === 'RWD') {
      const absRearDrive = Math.abs(rearDrive);
      if (absRearDrive > rearMaxGrip) {
        isWheelspinning = true;
        excessForce = absRearDrive - rearMaxGrip;
      }
    } else { // AWD
      const absTotalDrive = Math.abs(frontDrive + rearDrive);
      const totalGrip = frontMaxGrip + rearMaxGrip;
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
        frontDrive = forceSign * frontMaxGrip * 0.85;
      } else if (this.driveType === 'RWD') {
        rearDrive = forceSign * rearMaxGrip * 0.85;
      } else { // AWD
        frontDrive = forceSign * frontMaxGrip * 0.85 * 0.4;
        rearDrive = forceSign * rearMaxGrip * 0.85 * 0.6;
      }

      // Decrease lateral grip coefficient (0.25 for 2WD, 0.45 for AWD)
      if (this.driveType === 'AWD') {
        frontGrip *= 0.45;
        rearGrip *= 0.45;
      } else if (this.driveType === 'FWD') {
        frontGrip *= 0.25;
      } else if (this.driveType === 'RWD') {
        rearGrip *= 0.25;
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
    const corneringStiffness = 5.5;
    let frontLatForce = -computeLateralForce(frontSlipAngle, frontGrip, frontWeight, corneringStiffness);
    let rearLatForce = -computeLateralForce(rearSlipAngle, rearGrip, rearWeight, corneringStiffness);

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

    // Total forward force acting on the vehicle chassis
    const totalForwardForce = frontLongForce + rearLongForce + dragForce + rollingResistance;

    // --- COMBINED GRIP CIRCLE using updated grip values ---
    const updatedFrontMaxGrip = frontGrip * frontWeight;
    const updatedRearMaxGrip = rearGrip * rearWeight;

    const frontCombined = combinedGripCircle(frontLatForce, frontLongForce, updatedFrontMaxGrip);
    frontLatForce = frontCombined.lateral;

    const rearCombined = combinedGripCircle(rearLatForce, rearLongForce, updatedRearMaxGrip);
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
    const lateralGravityForce = -this.mass * gravity * Math.sin(bankAngleRad);
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