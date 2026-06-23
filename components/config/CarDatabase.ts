export interface TorquePoint {
  rpm: number;
  torque: number;
}

export type TransmissionType =
  | 'manual'
  | 'automatic'
  | 'dual_clutch'
  | 'single_speed';

export type PowerSteeringType = 'none' | 'hydraulic' | 'electric';

export interface DifferentialConfig {
  accelLock: number;      // 0.0 = open diff, 1.0 = fully locked under throttle
  decelLock: number;      // locking under braking / lift
  preload?: number;       // baseline locking with no strong input
  awdFrontBias?: number;  // AWD torque split, 0.40 = 40% front / 60% rear
}

export interface CarConfig {
  id: string;
  name: string;
  brand: string;
  // UI Display stats (out of 10)
  speed: number;
  acceleration: number;
  handling: number;
  price: number;
  color: string;
  tier: 'Entry Tier' | 'Sport Tier' | 'Hyper Tier' | 'Legendary Tier';
  requiresLicense: boolean;

  // Physics stats
  maxSpeed: number;
  accelerationRate: number;
  handlingRate: number;
  dragCoeff: number;
  driveType: 'FWD' | 'RWD' | 'AWD';
  powertrainType?: 'combustion' | 'electric';
  engineDisplacementLiters?: number;
  throttleResponse?: number;
  variableValveTiming?: boolean;
  variableValveEngageRpm?: number;
  variableValveTorqueGain?: number;
  engineCoolingEfficiency?: number;
  fuelCapacityLiters?: number;
  fuelTankLongitudinalPosition?: number;
  fuelTankHeight?: number;
  fuelDensityKgPerLiter?: number;
  brakeSpecificFuelConsumption?: number;
  speedLimiterMultiplier?: number;
  brakingRate?: number;
  wheelbase?: number;
  trackWidth?: number;
  cgHeight?: number;
  yawInertia?: number;
  engineLayout?: 'front' | 'front_mid' | 'mid' | 'rear';
  massConcentration?: number;
  frontWeightDistribution?: number;
  dragCoefficient?: number;
  liftCoefficient?: number;
  frontalArea?: number;
  tireGripFront?: number;
  tireGripRear?: number;
  corneringStiffnessFront?: number;
  corneringStiffnessRear?: number;
  frontCamberDegrees?: number;
  rearCamberDegrees?: number;
  tireColdPressurePsi?: number;
  torqueCurve?: TorquePoint[];
  brakeForce?: number;
  maxSteeringAngle?: number;
  rearSteeringRatio?: number;
  rearSteeringMaxAngle?: number;
  steeringResponse?: number;
  steeringRackRatio?: number;
  powerSteeringType?: PowerSteeringType;
  pneumaticTrail?: number;
  casterTrail?: number;
  rollingResistanceCoefficient?: number;
  differential?: DifferentialConfig;
  shiftUpMph?: number[];   // index 0 = gear 1 -> 2, index 1 = 2 -> 3, etc.

  // Optional transmission overrides
  transmissionType?: TransmissionType;
  gearRatios?: number[];
  finalDrive?: number;
  torqueConverterStallRpm?: number;
  torqueConverterStallRatio?: number;
  wheelRadius?: number;
  maxRpm?: number;
  baseMass?: number;
  visualScale?: number;
  driverCameraOffset?: { x: number; y: number; z: number };

  // Visuals
  hasSpoiler: boolean;
  boosterColor: number; // Hex code for exhaust flames (e.g. 0xffaa00)

  // GT4-style per-car physics character
  character?: {
    weightDistribution: number;   // 0.0–1.0, 0.5 = balanced, >0.5 = front-heavy (understeer), <0.5 = rear-heavy (oversteer)
    rearGripMultiplier: number;   // 0.7–1.2, lower = tail-happy, higher = planted rear
    yawInertia: number;           // 0.6–1.4, lower = snappy rotation, higher = sluggish heavy car
    oversteerResistance: number;  // 0.0–1.0, higher = harder to spin out, lower = easy to spin
  };
}

export const CARS_DATABASE: CarConfig[] = [
  {
    id: 'starter',
    name: 'Hatchback-X',
    brand: 'Toyota',
    speed: 4,
    acceleration: 1,
    handling: 6,
    price: 0,
    color: '#e11d48',
    tier: 'Entry Tier',
    requiresLicense: false,
    maxSpeed: 100,
    accelerationRate: 0.12,
    handlingRate: 0.045,
    dragCoeff: 0.000012,
    driveType: 'FWD',
    hasSpoiler: false,
    boosterColor: 0xff4500,
    character: { weightDistribution: 0.62, rearGripMultiplier: 1.10, yawInertia: 1.15, oversteerResistance: 0.85 }
  },
  {
    id: 'fusion',
    name: 'Fusion X-200',
    brand: 'Ford',
    speed: 4.5,
    acceleration: 4.5,
    handling: 6.2,
    price: 600,
    color: '#06b6d4',
    tier: 'Entry Tier',
    requiresLicense: false,
    maxSpeed: 115,
    accelerationRate: 0.14,
    handlingRate: 0.046,
    dragCoeff: 0.00001,
    driveType: 'FWD',
    hasSpoiler: false,
    boosterColor: 0xffaa00,
    character: { weightDistribution: 0.60, rearGripMultiplier: 1.08, yawInertia: 1.10, oversteerResistance: 0.82 }
  },
  {
    id: 'sentra',
    name: 'Sentra Cyber-G',
    brand: 'Toyota',
    speed: 4.8,
    acceleration: 4.8,
    handling: 6.5,
    price: 800,
    color: '#f43f5e',
    tier: 'Entry Tier',
    requiresLicense: false,
    maxSpeed: 125,
    accelerationRate: 0.15,
    handlingRate: 0.047,
    dragCoeff: 0.0000095,
    driveType: 'FWD',
    hasSpoiler: false,
    boosterColor: 0xffaa00,
    character: { weightDistribution: 0.58, rearGripMultiplier: 1.06, yawInertia: 1.08, oversteerResistance: 0.80 }
  },
  {
    id: 'rogue_runner',
    name: 'Rogue Runner',
    brand: 'Ford',
    speed: 5.2,
    acceleration: 5.0,
    handling: 6.4,
    price: 950,
    color: '#22c55e',
    tier: 'Entry Tier',
    requiresLicense: false,
    maxSpeed: 135,
    accelerationRate: 0.16,
    handlingRate: 0.047,
    dragCoeff: 0.000009,
    driveType: 'FWD',
    hasSpoiler: false,
    boosterColor: 0xffaa00,
    character: { weightDistribution: 0.60, rearGripMultiplier: 1.05, yawInertia: 1.12, oversteerResistance: 0.78 }
  },
  {
    id: 'neon_cruiser',
    name: 'Neon Cruiser',
    brand: 'Nissan',
    speed: 6.0,
    acceleration: 5.8,
    handling: 6.8,
    price: 1100,
    color: '#eab308',
    tier: 'Sport Tier',
    requiresLicense: false,
    maxSpeed: 150,
    accelerationRate: 0.18,
    handlingRate: 0.048,
    dragCoeff: 0.000008,
    driveType: 'RWD',
    hasSpoiler: false,
    boosterColor: 0xff8c00,
    character: { weightDistribution: 0.50, rearGripMultiplier: 0.92, yawInertia: 0.95, oversteerResistance: 0.55 }
  },
  {
    id: 'vector',
    name: 'Vector S1',
    brand: 'Nissan',
    speed: 6.2,
    acceleration: 6.0,
    handling: 7.2,
    price: 1300,
    color: '#22c55e',
    tier: 'Sport Tier',
    requiresLicense: false,
    maxSpeed: 160,
    accelerationRate: 0.19,
    handlingRate: 0.052,
    dragCoeff: 0.0000078,
    driveType: 'FWD',
    hasSpoiler: false,
    boosterColor: 0xffaa00,
    character: { weightDistribution: 0.58, rearGripMultiplier: 1.02, yawInertia: 1.05, oversteerResistance: 0.72 }
  },
  {
    id: 'sport',
    name: 'Volt Interceptor',
    brand: 'Nissan',
    speed: 7.0,
    acceleration: 7.0,
    handling: 7.0,
    price: 1500,
    color: '#06b6d4',
    tier: 'Sport Tier',
    requiresLicense: false,
    maxSpeed: 180,
    accelerationRate: 0.22,
    handlingRate: 0.05,
    dragCoeff: 0.0000068,
    driveType: 'RWD',
    hasSpoiler: true,
    boosterColor: 0xff8c00,
    character: { weightDistribution: 0.48, rearGripMultiplier: 0.88, yawInertia: 0.90, oversteerResistance: 0.45 }
  },
  {
    id: 'driftmaster',
    name: 'Tokyo Driftmaster',
    brand: 'Toyota',
    speed: 6.8,
    acceleration: 6.5,
    handling: 8.5,
    price: 1800,
    color: '#f97316',
    tier: 'Sport Tier',
    requiresLicense: false,
    maxSpeed: 170,
    accelerationRate: 0.20,
    handlingRate: 0.065,
    dragCoeff: 0.000007,
    driveType: 'RWD',
    hasSpoiler: true,
    boosterColor: 0xff4500,
    character: { weightDistribution: 0.46, rearGripMultiplier: 0.82, yawInertia: 0.80, oversteerResistance: 0.30 }
  },
  {
    id: 'horizon',
    name: 'Horizon Roadster',
    brand: 'Ford',
    speed: 7.2,
    acceleration: 7.2,
    handling: 7.4,
    price: 2000,
    color: '#eab308',
    tier: 'Sport Tier',
    requiresLicense: false,
    maxSpeed: 185,
    accelerationRate: 0.23,
    handlingRate: 0.052,
    dragCoeff: 0.0000066,
    driveType: 'RWD',
    hasSpoiler: false,
    boosterColor: 0xff8c00,
    character: { weightDistribution: 0.50, rearGripMultiplier: 0.90, yawInertia: 0.92, oversteerResistance: 0.50 }
  },
  {
    id: 'monarch',
    name: 'Monarch Cruiser',
    brand: 'Toyota',
    speed: 7.4,
    acceleration: 7.4,
    handling: 7.1,
    price: 2200,
    color: '#f43f5e',
    tier: 'Sport Tier',
    requiresLicense: false,
    maxSpeed: 190,
    accelerationRate: 0.24,
    handlingRate: 0.049,
    dragCoeff: 0.0000065,
    driveType: 'RWD',
    hasSpoiler: false,
    boosterColor: 0xffaa00,
    character: { weightDistribution: 0.52, rearGripMultiplier: 0.92, yawInertia: 1.05, oversteerResistance: 0.50 }
  },
  {
    id: 'zenith',
    name: 'Zenith GT',
    brand: 'Porsche',
    speed: 7.8,
    acceleration: 7.6,
    handling: 7.6,
    price: 2500,
    color: '#eab308',
    tier: 'Sport Tier',
    requiresLicense: false,
    maxSpeed: 200,
    accelerationRate: 0.25,
    handlingRate: 0.052,
    dragCoeff: 0.0000062,
    driveType: 'RWD',
    hasSpoiler: true,
    boosterColor: 0xff4500,
    character: { weightDistribution: 0.44, rearGripMultiplier: 0.85, yawInertia: 0.82, oversteerResistance: 0.38 }
  },
  {
    id: 'sentinel',
    name: 'Sentinel Cruiser',
    brand: 'Tesla',
    speed: 7.6,
    acceleration: 7.8,
    handling: 7.8,
    price: 2800,
    color: '#8b5cf6',
    tier: 'Sport Tier',
    requiresLicense: false,
    maxSpeed: 195,
    accelerationRate: 0.26,
    handlingRate: 0.054,
    dragCoeff: 0.0000064,
    driveType: 'AWD',
    hasSpoiler: false,
    boosterColor: 0x00aaff,
    character: { weightDistribution: 0.52, rearGripMultiplier: 1.00, yawInertia: 1.00, oversteerResistance: 0.75 }
  },
  {
    id: 'cybertruck',
    name: 'Cybertruck AWD',
    brand: 'Tesla',
    speed: 6.0,
    acceleration: 8.2,
    handling: 5.4,
    price: 3000,
    color: '#a9adb0',
    tier: 'Sport Tier',
    requiresLicense: false,
    maxSpeed: 180.25,
    accelerationRate: 0.25,
    handlingRate: 0.041,
    dragCoeff: 0.00001,
    driveType: 'AWD',
    powertrainType: 'electric',
    fuelCapacityLiters: 0,
    throttleResponse: 14,
    engineCoolingEfficiency: 1.15,
    transmissionType: 'single_speed',
    speedLimiterMultiplier: 1.01,
    maxRpm: 10500,
    baseMass: 3009,
    wheelbase: 3.635,
    trackWidth: 1.772,
    cgHeight: 0.72,
    frontWeightDistribution: 1491 / 3009,
    dragCoefficient: 0.34,
    frontalArea: 3.10,
    liftCoefficient: 0.08,
    tireGripFront: 0.98,
    tireGripRear: 1.00,
    corneringStiffnessFront: 5.7,
    corneringStiffnessRear: 5.9,
    brakeForce: 33000,
    maxSteeringAngle: 0.50,
    rearSteeringRatio: 0.35,
    rearSteeringMaxAngle: 0.12,
    steeringResponse: 0.72,
    steeringRackRatio: 14.0,
    powerSteeringType: 'electric',
    pneumaticTrail: 0.075,
    casterTrail: 0.045,
    rollingResistanceCoefficient: 0.0155,
    differential: {
      accelLock: 0.36,
      decelLock: 0.12,
      preload: 0.02,
      awdFrontBias: 0.50
    },
    gearRatios: [0, 9.0],
    finalDrive: 1.0,
    wheelRadius: 0.43925,
    torqueCurve: [
      { rpm: 0, torque: 1180 },
      { rpm: 3000, torque: 1180 },
      { rpm: 5000, torque: 950 },
      { rpm: 7000, torque: 600 },
      { rpm: 9000, torque: 280 },
      { rpm: 10500, torque: 110 }
    ],
    visualScale: 5.6829 / 4.8,
    driverCameraOffset: { x: 0, y: 1.42, z: 0.55 },
    engineLayout: 'mid',
    massConcentration: 1.08,
    hasSpoiler: false,
    boosterColor: 0x66ccff,
    character: {
      weightDistribution: 1491 / 3009,
      rearGripMultiplier: 1.00,
      yawInertia: 1.08,
      oversteerResistance: 0.82
    }
  },
  {
    id: 'tempest',
    name: 'Tempest V12',
    brand: 'Nissan',
    speed: 8.5,
    acceleration: 8.2,
    handling: 7.5,
    price: 3500,
    color: '#f97316',
    tier: 'Sport Tier',
    requiresLicense: false,
    maxSpeed: 220,
    accelerationRate: 0.30,
    handlingRate: 0.053,
    dragCoeff: 0.0000058,
    driveType: 'RWD',
    hasSpoiler: true,
    boosterColor: 0xff4500,
    character: { weightDistribution: 0.47, rearGripMultiplier: 0.84, yawInertia: 0.85, oversteerResistance: 0.35 }
  },
  {
    id: 'super',
    name: 'Apex Hypercar',
    brand: 'Ferrari',
    speed: 10.0,
    acceleration: 9.0,
    handling: 9.0,
    price: 4000,
    color: '#d946ef',
    tier: 'Hyper Tier',
    requiresLicense: true,
    maxSpeed: 260,
    accelerationRate: 0.35,
    handlingRate: 0.055,
    dragCoeff: 0.0000045,
    driveType: 'AWD',
    hasSpoiler: true,
    boosterColor: 0x00ffff,
    character: { weightDistribution: 0.52, rearGripMultiplier: 1.00, yawInertia: 0.88, oversteerResistance: 0.72 }
  },
  {
    id: 'solaris',
    name: 'Solaris eV',
    brand: 'Tesla',
    speed: 9.2,
    acceleration: 9.2,
    handling: 9.2,
    price: 4800,
    color: '#06b6d4',
    tier: 'Hyper Tier',
    requiresLicense: true,
    maxSpeed: 240,
    accelerationRate: 0.36,
    handlingRate: 0.056,
    dragCoeff: 0.000005,
    driveType: 'AWD',
    hasSpoiler: true,
    boosterColor: 0x00ff88,
    character: { weightDistribution: 0.50, rearGripMultiplier: 1.02, yawInertia: 0.90, oversteerResistance: 0.78 }
  },
  {
    id: 'phantom',
    name: 'Ghost Phantom',
    brand: 'Porsche',
    speed: 10.8,
    acceleration: 9.4,
    handling: 9.4,
    price: 5500,
    color: '#f43f5e',
    tier: 'Hyper Tier',
    requiresLicense: true,
    maxSpeed: 280,
    accelerationRate: 0.38,
    handlingRate: 0.058,
    dragCoeff: 0.000004,
    driveType: 'AWD',
    hasSpoiler: true,
    boosterColor: 0x00ffff,
    character: { weightDistribution: 0.50, rearGripMultiplier: 1.00, yawInertia: 0.85, oversteerResistance: 0.76 }
  },
  {
    id: 'stealth',
    name: 'Stealth Recon',
    brand: 'Porsche',
    speed: 10.4,
    acceleration: 9.6,
    handling: 9.5,
    price: 6000,
    color: '#0f172a',
    tier: 'Hyper Tier',
    requiresLicense: true,
    maxSpeed: 270,
    accelerationRate: 0.40,
    handlingRate: 0.059,
    dragCoeff: 0.0000042,
    driveType: 'AWD',
    hasSpoiler: true,
    boosterColor: 0x444444,
    character: { weightDistribution: 0.52, rearGripMultiplier: 0.98, yawInertia: 0.88, oversteerResistance: 0.74 }
  },
  {
    id: 'vortex',
    name: 'Vortex R',
    brand: 'Ferrari',
    speed: 10.6,
    acceleration: 9.8,
    handling: 9.3,
    price: 6500,
    color: '#e11d48',
    tier: 'Hyper Tier',
    requiresLicense: true,
    maxSpeed: 275,
    accelerationRate: 0.42,
    handlingRate: 0.058,
    dragCoeff: 0.0000041,
    driveType: 'RWD',
    hasSpoiler: true,
    boosterColor: 0xff0055,
    character: { weightDistribution: 0.46, rearGripMultiplier: 0.86, yawInertia: 0.78, oversteerResistance: 0.38 }
  },
  {
    id: 'quantum',
    name: 'Quantum Flux',
    brand: 'Audi',
    speed: 11.5,
    acceleration: 10.2,
    handling: 9.6,
    price: 8000,
    color: '#d946ef',
    tier: 'Legendary Tier',
    requiresLicense: true,
    maxSpeed: 300,
    accelerationRate: 0.45,
    handlingRate: 0.06,
    dragCoeff: 0.0000035,
    driveType: 'AWD',
    hasSpoiler: true,
    boosterColor: 0xaa00ff,
    character: { weightDistribution: 0.52, rearGripMultiplier: 0.98, yawInertia: 0.92, oversteerResistance: 0.70 }
  },
  {
    id: 'aurora',
    name: 'Aurora Concept',
    brand: 'Audi',
    speed: 12.0,
    acceleration: 10.6,
    handling: 9.8,
    price: 9500,
    color: '#d946ef',
    tier: 'Legendary Tier',
    requiresLicense: true,
    maxSpeed: 320,
    accelerationRate: 0.48,
    handlingRate: 0.062,
    dragCoeff: 0.000003,
    driveType: 'AWD',
    hasSpoiler: true,
    boosterColor: 0xff00ff,
    character: { weightDistribution: 0.50, rearGripMultiplier: 0.96, yawInertia: 0.86, oversteerResistance: 0.68 }
  },
  {
    id: 'blade',
    name: 'Blade Runner',
    brand: 'Chevrolet',
    speed: 11.8,
    acceleration: 10.4,
    handling: 10.2,
    price: 11000,
    color: '#22c55e',
    tier: 'Legendary Tier',
    requiresLicense: true,
    maxSpeed: 310,
    accelerationRate: 0.46,
    handlingRate: 0.065,
    dragCoeff: 0.0000032,
    driveType: 'RWD',
    hasSpoiler: true,
    boosterColor: 0x00ffaa,
    character: { weightDistribution: 0.48, rearGripMultiplier: 0.88, yawInertia: 0.75, oversteerResistance: 0.40 }
  },
  {
    id: 'genesis',
    name: 'Carbon Genesis',
    brand: 'Chevrolet',
    speed: 13.0,
    acceleration: 11.2,
    handling: 10.5,
    price: 12000,
    color: '#1e293b',
    tier: 'Legendary Tier',
    requiresLicense: true,
    maxSpeed: 350,
    accelerationRate: 0.52,
    handlingRate: 0.065,
    dragCoeff: 0.0000025,
    driveType: 'RWD',
    hasSpoiler: true,
    boosterColor: 0xffffff,
    character: { weightDistribution: 0.47, rearGripMultiplier: 0.85, yawInertia: 0.72, oversteerResistance: 0.35 }
  },
  {
    id: 'honda_s2000',
    name: 'S2000 Roadster',
    brand: 'Honda',
    speed: 7.0,
    acceleration: 6.6,
    handling: 8.2,
    price: 2500,
    color: '#e2e8f0',
    tier: 'Sport Tier',
    requiresLicense: false,
    maxSpeed: 241,
    accelerationRate: 0.22,
    handlingRate: 0.055,
    dragCoeff: 0.000007,
    driveType: 'RWD',
    transmissionType: 'manual',
    engineDisplacementLiters: 2.0,
    throttleResponse: 11.5,
    variableValveTiming: true,
    variableValveEngageRpm: 6000,
    variableValveTorqueGain: 0.12,
    engineCoolingEfficiency: 1.0,
    fuelCapacityLiters: 50,
    fuelTankLongitudinalPosition: -0.22,
    fuelTankHeight: 0.31,
    brakeSpecificFuelConsumption: 272,
    steeringRackRatio: 13.8,
    powerSteeringType: 'hydraulic',
    pneumaticTrail: 0.062,
    casterTrail: 0.038,
    hasSpoiler: false,
    boosterColor: 0xffaa00,
    maxRpm: 9000,
    baseMass: 1250,
    engineLayout: 'front_mid',
    massConcentration: 0.91,
    visualScale: 3,
    driverCameraOffset: { x: 0, y: 0.5, z: 0.3 },
    character: { weightDistribution: 0.50, rearGripMultiplier: 0.92, yawInertia: 0.85, oversteerResistance: 0.48 }
  },
  {
    id: 'ford_gt_2006',
    name: 'Ford GT 2006',
    brand: 'Ford',
    speed: 10.5,
    acceleration: 9.8,
    handling: 8.8,
    price: 0,
    color: '#0033cc',
    tier: 'Hyper Tier',
    requiresLicense: false,
    maxSpeed: 330,
    accelerationRate: 0.42,
    handlingRate: 0.057,
    dragCoeff: 0.0000055,
    driveType: 'RWD',
    transmissionType: 'manual',
    engineDisplacementLiters: 5.4,
    throttleResponse: 7.5,
    engineCoolingEfficiency: 1.12,
    fuelCapacityLiters: 66,
    fuelTankLongitudinalPosition: 0.03,
    fuelTankHeight: 0.29,
    brakeSpecificFuelConsumption: 305,
    hasSpoiler: false,
    boosterColor: 0xffaa00,
    maxRpm: 6500,
    baseMass: 1580,
    wheelbase: 2.71,
    trackWidth: 1.62,
    cgHeight: 0.44,
    yawInertia: 3200,
    engineLayout: 'mid',
    massConcentration: 0.86,
    frontWeightDistribution: 0.43,
    dragCoefficient: 0.39,
    frontalArea: 1.88,
    liftCoefficient: 0.16,
    tireGripFront: 1.08,
    tireGripRear: 1.20,
    corneringStiffnessFront: 7.0,
    corneringStiffnessRear: 7.25,
    brakeForce: 18000,
    maxSteeringAngle: 0.52,
    steeringRackRatio: 15.7,
    powerSteeringType: 'hydraulic',
    pneumaticTrail: 0.068,
    casterTrail: 0.041,
    rollingResistanceCoefficient: 0.013,
    differential: {
      accelLock: 0.42,
      decelLock: 0.18,
      preload: 0.08
    },
    gearRatios: [0, 2.61, 1.71, 1.23, 0.94, 0.77, 0.63],
    finalDrive: 3.36,
    wheelRadius: 0.335,
    shiftUpMph: [53, 84, 121, 158, 196],
    torqueCurve: [
      { rpm: 1000, torque: 430 },
      { rpm: 2500, torque: 610 },
      { rpm: 3750, torque: 678 },
      { rpm: 5200, torque: 650 },
      { rpm: 6500, torque: 590 }
    ],
    visualScale: 1.5,
    driverCameraOffset: { x: 0, y: 1, z: 1 },
    character: { weightDistribution: 0.43, rearGripMultiplier: 1.12, yawInertia: 1.05, oversteerResistance: 0.62 }
  }
];
