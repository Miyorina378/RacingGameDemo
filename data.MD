import * as THREE from 'three';

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

  // Car stats
  public maxSpeed = 45;
  public accelerationRate = 0.35;
  public handlingRate = 0.045;
  public brakingRate = 0.8;
  public dragCoeff = 0.015;

  // Powertrain Params
  public currentGear = 1;
  public rpm = 1000;
  public gearRatios = [0, 3.60, 2.10, 1.45, 1.10, 0.90, 0.73]; 
  public finalDrive = 3.42;
  public wheelRadius = 0.48; 

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
    aspiration: 'natural',  // 'natural' or 'turbo': Adds a force-fed torque spike at mid-high RPM
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
    this.buildMesh();
    this.updateStats();
  }

  // Engine Torque Curve modified by Exhaust (mufflers) and Engine Internals
  private getTorque(currentRpm: number): number {
    let baseTorque = 180;
    if (this.carId === 'sport') baseTorque = 240;
    if (this.carId === 'super') baseTorque = 320;

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
      let highRpmDrop = 0.06 - (this.upgrades.engine.portGrindingLevel * 0.01);
      torque = (baseTorque + 140) - (currentRpm - 4500) * Math.max(0.02, highRpmDrop);
    } else {
      torque = 10; // Rev limiter cut-off
    }

    // [UPGRADE IMPACT]: Turbo Aspiration adds progressive forced boost between 3,200 and 5,800 RPM
    if (this.upgrades.aspiration === 'turbo' && currentRpm > 3200 && currentRpm < 5800) {
      let boostSwell = Math.sin((currentRpm - 3200) / 2600 * Math.PI) * 65;
      torque += boostSwell;
    }

    return Math.max(10, torque);
  }

  private handleAutoTransmission() {
    // [UPGRADE IMPACT]: Flywheel level makes the transmission react faster to RPM shifts
    let shiftRPM = 5800 + (this.upgrades.driveTrain.flywheelLevel * 150);
    if (shiftRPM > this.maxRpm - 200) shiftRPM = this.maxRpm - 200;

    if (this.speed > 0) {
      if (this.rpm > shiftRPM && this.currentGear < 6) {
        this.currentGear++;
      } else if (this.rpm < 2400 && this.currentGear > 1) {
        this.currentGear--;
      }
    } else {
      this.currentGear = 1;
    }
  }

  public rebuild(carId: string, color: string) {
    this.carId = carId;
    this.color = color;
    
    while (this.mesh.children.length > 0) {
      this.mesh.remove(this.mesh.children[0]);
    }
    this.wheels = [];
    this.leftFrontWheel = undefined;
    this.rightFrontWheel = undefined;
    
    this.buildMesh();
    this.updateStats();
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
    cabin.position.set(0, 0.9, -0.2); 
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
    windshield.rotation.x = -0.5; 
    this.mesh.add(windshield);

    // Headlights
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

    const frontSpot = new THREE.SpotLight(0x00ffff, 4, 30, Math.PI / 4, 0.5, 1);
    frontSpot.position.set(0, 0.5, 2.5);
    frontSpot.target.position.set(0, 0, 10);
    this.mesh.add(frontSpot);
    this.mesh.add(frontSpot.target);

    // Tail lights
    const taillightGeom = new THREE.BoxGeometry(0.8, 0.1, 0.1);
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xff0055,
      emissive: 0xff0055,
      emissiveIntensity: 1.5
    });
    const tailLight = new THREE.Mesh(taillightGeom, taillightMat);
    tailLight.position.set(0, 0.5, -2.4);
    this.mesh.add(tailLight);

    // Exhaust
    const exhaustGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8);
    exhaustGeom.rotateX(Math.PI / 2);
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0x222233,
      metalness: 0.9,
    });
    const exhaust = new THREE.Mesh(exhaustGeom, exhaustMat);
    exhaust.position.set(0, 0.35, -2.4);
    this.mesh.add(exhaust);

    // Underglow
    const underglow = new THREE.PointLight(new THREE.Color(this.color), 3, 6);
    underglow.position.set(0, -0.2, 0);
    this.mesh.add(underglow);

    if (this.carId === 'sport' || this.carId === 'super') {
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

    // Wheels
    const wheelGeom = new THREE.CylinderGeometry(0.48, 0.48, 0.44, 16);
    wheelGeom.rotateZ(Math.PI / 2); 
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111115, roughness: 0.8 });
    const rimGeom = new THREE.CylinderGeometry(0.28, 0.28, 0.46, 8);
    rimGeom.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x003333, metalness: 0.9 });

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

    createWheelAssembly(-1.25, 0.48, 1.6, true);  
    createWheelAssembly(1.25, 0.48, 1.6, true);   
    createWheelAssembly(-1.25, 0.48, -1.6, false); 
    createWheelAssembly(1.25, 0.48, -1.6, false);  
  }

  public updateStats() {
    // Establish base profiles
    if (this.carId === 'starter') {
      this.baseMass = 1200;
      this.maxSpeed = 45;
      this.accelerationRate = 0.35;
      this.handlingRate = 0.045;
      this.dragCoeff = 0.012;
    } else if (this.carId === 'sport') {
      this.baseMass = 1100;
      this.maxSpeed = 65;
      this.accelerationRate = 0.5;
      this.handlingRate = 0.05;
      this.dragCoeff = 0.010;
    } else if (this.carId === 'super') {
      this.baseMass = 1000;
      this.maxSpeed = 85;
      this.accelerationRate = 0.7;
      this.handlingRate = 0.055;
      this.dragCoeff = 0.008;
    }

    // --- APPLY DYNAMIC PERFORMANCE CALCULATIONS FROM UPGRADES ---

    // [UPGRADE IMPACT]: Weight Reduction stage directly drops target mass (lighter = quicker)
    this.mass = this.baseMass - (this.upgrades.weightReduction * 85); 

    // [UPGRADE IMPACT]: Suspension improves cornering responsive thresholds
    this.handlingRate = (this.carId === 'starter' ? 0.045 : this.carId === 'sport' ? 0.05 : 0.055) + (this.upgrades.suspensionLevel * 0.006);

    // [UPGRADE IMPACT]: Brake Level upgrades absolute stopping capability
    this.brakingRate = 0.8 + (this.upgrades.brake.level * 0.3);

    // [UPGRADE IMPACT]: Engine blueprinting/balancing & ECU expansion raises structural safety limits for RPM
    this.maxRpm = 6500 + (this.upgrades.engine.ecuLevel * 250) + (this.upgrades.engine.engineBalancingLevel * 350);

    // [UPGRADE IMPACT]: Custom Gearbox ratio setups increase potential Top Speed bound caps
    if (this.upgrades.driveTrain.gearboxLevel > 0) {
      this.maxSpeed += this.upgrades.driveTrain.gearboxLevel * 6;
    }
  }

  public update(deltaTime: number, keys: { [key: string]: boolean }, isCountdown: boolean = false) {
    if (isCountdown) {
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.set(0, this.yaw, 0);
      return;
    }

    // Keyboard inputs
    const throttle = keys['w'] || keys['arrowup'];
    const reverse = keys['s'] || keys['arrowdown'];
    const turnLeft = keys['a'] || keys['arrowleft'];
    const turnRight = keys['d'] || keys['arrowright'];
    const handbrake = keys[' ']; 

    const speedRatio = Math.abs(this.speed) / this.maxSpeed;

    // 1. Drivetrain Calculation
    if (this.speed >= 0) {
      let wheelRPM = (this.speed / (2 * Math.PI * this.wheelRadius)) * 60;
      let targetRPM = wheelRPM * this.gearRatios[this.currentGear] * this.finalDrive;
      this.rpm = Math.max(1000, Math.min(targetRPM, this.maxRpm));
      this.handleAutoTransmission();
    } else {
      this.rpm = 1000 + Math.abs(this.speed) * 110;
      this.currentGear = 1;
    }

    // 2. Acceleration Logic
    if (throttle) {
      let currentTorque = this.getTorque(this.rpm);
      
      // [UPGRADE IMPACT]: Clutch and Propeller shaft level upgrades optimize efficiency (less mechanical friction loss)
      let gearEfficiency = 0.83 + (this.upgrades.driveTrain.clutchLevel * 0.04) + (this.upgrades.driveTrain.propellerShaftLevel * 0.02);
      if (gearEfficiency > 0.98) gearEfficiency = 0.98;

      let forceFactor = (currentTorque * this.gearRatios[this.currentGear] * this.finalDrive * gearEfficiency) / this.wheelRadius;
      
      // Acceleration (Force / Mass) equation scaled with base rates
      let massScalingAcceleration = (forceFactor / this.mass) * (this.accelerationRate * 2.5);

      // [UPGRADE IMPACT]: Body Control Module (TCS) checks low speed slip. Caps chaotic tire spin out at low speeds
      if (this.upgrades.bodyControlModuleLevel > 0 && this.speed < 12) {
        let tcsFactor = 1.0 - (0.15 * this.upgrades.bodyControlModuleLevel);
        massScalingAcceleration *= tcsFactor; 
      }

      this.speed += massScalingAcceleration;
      if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    } else if (reverse) {
      this.speed -= this.accelerationRate * 0.8;
      if (this.speed < -this.maxSpeed * 0.3) this.speed = -this.maxSpeed * 0.3;
    } else {
      // Aerodynamic Drag + Friction
      let airDrag = this.dragCoeff * this.speed * Math.abs(this.speed);
      let rollingResistance = 0.1 * Math.sign(this.speed);

      if (this.speed > 0) {
        this.speed -= (airDrag + rollingResistance);
        if (this.speed < 0) this.speed = 0;
      } else if (this.speed < 0) {
        this.speed += (Math.abs(airDrag) + Math.abs(rollingResistance));
        if (this.speed > 0) this.speed = 0;
      }
    }

    // 3. Braking Logic
    if (reverse && this.speed > 0) {
      this.speed -= this.brakingRate;
      if (this.speed < 0) this.speed = 0;
    }
    if (throttle && this.speed < 0) {
      this.speed += this.brakingRate;
      if (this.speed > 0) this.speed = 0;
    }

    // 4. Drifting & Stability Systems
    const turnInput = (turnLeft ? 1 : 0) - (turnRight ? 1 : 0);
    
    if (this.isGrounded && Math.abs(this.speed) > 10 && (handbrake || (Math.abs(turnInput) > 0 && speedRatio > 0.4))) {
      this.isDrifting = true;
      this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, -turnInput * 0.42, 0.1);
    } else {
      this.isDrifting = false;
      this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, 0, 0.15);
    }

    // [UPGRADE IMPACT]: Electronic Stability Control (ESC) dampens runaway oversteer if drift wasn't triggered by handbrake
    if (this.upgrades.brake.hasESC && this.isDrifting && !handbrake) {
      this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, 0, 0.25 * deltaTime);
    }

    // Handle Steering wheel mesh rotation
    if (this.leftFrontWheel && this.rightFrontWheel) {
      const steeringAngle = turnInput * 0.5; 
      this.leftFrontWheel.rotation.y = steeringAngle;
      this.rightFrontWheel.rotation.y = steeringAngle;
    }

    // Wheel rotation speed
    const wheelRotSpeed = (this.speed / 0.48) * deltaTime;
    this.wheels.forEach(wheel => {
      wheel.children[0].rotation.x += wheelRotSpeed;
    });

    // Turning vehicle heading yaw
    if (Math.abs(this.speed) > 1) {
      // Speed Sensitivity Understeer calculation
      let speedSensitivityFactor = 1.0 / (1.0 + (Math.abs(this.speed) * 0.035));
      
      // [UPGRADE IMPACT]: ABS Check under braking. Locks front wheels if false, ruining steering alignment
      let brakingSteerModifier = 1.0;
      if (reverse && this.speed > 0) {
        brakingSteerModifier = this.upgrades.brake.hasABS ? 0.85 : 0.25; 
      }

      const steeringFactor = turnInput * this.handlingRate * (this.speed > 0 ? 1 : -0.7) * speedSensitivityFactor * brakingSteerModifier;
      this.yaw += steeringFactor;
    }

    // Compute velocity vectors incorporating drift sliding
    const headingVector = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw + this.driftAngle);
    
    // Update X and Z position
    this.pos.x += headingVector.x * this.speed * deltaTime;
    this.pos.z += headingVector.z * this.speed * deltaTime;

    // Gravity effect if flying
    if (!this.isGrounded) {
      this.yVelocity -= 18 * deltaTime; 
      this.pos.y += this.yVelocity * deltaTime;
      this.pitch = THREE.MathUtils.lerp(this.pitch, this.yVelocity > 0 ? 0.15 : -0.2, 0.08);

      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.yVelocity = 0;
        this.isGrounded = true;
        this.pitch = 0;
      }
    } else {
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0, 0.2);
    }

    // [UPGRADE IMPACT]: High level stiffer suspensions reduce aesthetic body lean roll angles
    let rollDampening = 0.12 - (this.upgrades.suspensionLevel * 0.02);
    const targetRoll = -turnInput * Math.max(0.04, rollDampening) * speedRatio;
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, 0.15);

    // Apply rotation transforms to vehicle container
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll);
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
    this.currentGear = 1;
    this.rpm = 1000;
    
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
  }
}