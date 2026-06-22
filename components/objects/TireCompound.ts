export type TireCompoundType = 'economy' | 'super_hard' | 'hard' | 'normal' | 'soft' | 'super_soft';

export interface TireCompoundConfig {
  id: TireCompoundType;
  name: string;
  gripMultiplier: number;
  wearRate: number;
  optimalTemperature: number;
  temperatureWindow: number;
  coldGripFloor: number;
  heatRate: number;
  colorHex: string;
  colorLabel: string;
}

export interface TireState {
  compound: TireCompoundType;
  wear: number;
  temperature: number;
}

export const TIRE_COMPOUNDS: Record<TireCompoundType, TireCompoundConfig> = {
  economy: {
    id: 'economy',
    name: 'Economy',
    gripMultiplier: 0.82,
    wearRate: 0.10,
    optimalTemperature: 65,
    temperatureWindow: 28,
    coldGripFloor: 0.88,
    heatRate: 0.72,
    colorHex: '#6b7280',
    colorLabel: 'Gray'
  },
  super_hard: {
    id: 'super_hard',
    name: 'Super Hard',
    gripMultiplier: 0.90,
    wearRate: 0.15,
    optimalTemperature: 78,
    temperatureWindow: 24,
    coldGripFloor: 0.88,
    heatRate: 0.82,
    colorHex: '#e5e7eb',
    colorLabel: 'White'
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    gripMultiplier: 0.96,
    wearRate: 0.35,
    optimalTemperature: 84,
    temperatureWindow: 22,
    coldGripFloor: 0.86,
    heatRate: 0.92,
    colorHex: '#3b82f6',
    colorLabel: 'Blue'
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    gripMultiplier: 1.02,
    wearRate: 1.00,
    optimalTemperature: 90,
    temperatureWindow: 20,
    coldGripFloor: 0.84,
    heatRate: 1.00,
    colorHex: '#eab308',
    colorLabel: 'Yellow'
  },
  soft: {
    id: 'soft',
    name: 'Soft',
    gripMultiplier: 1.08,
    wearRate: 2.00,
    optimalTemperature: 96,
    temperatureWindow: 17,
    coldGripFloor: 0.80,
    heatRate: 1.12,
    colorHex: '#ef4444',
    colorLabel: 'Red'
  },
  super_soft: {
    id: 'super_soft',
    name: 'Super Soft',
    gripMultiplier: 1.13,
    wearRate: 3.50,
    optimalTemperature: 102,
    temperatureWindow: 14,
    coldGripFloor: 0.76,
    heatRate: 1.25,
    colorHex: '#a855f7',
    colorLabel: 'Purple'
  }
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(edge1 - edge0, 0.001)));
  return t * t * (3 - 2 * t);
}

export function getWearGripPenalty(wear: number): number {
  return smoothstep(0.3, 1.0, wear) * 0.35;
}

export function getTemperatureGripMultiplier(
  compound: TireCompoundType,
  temperature: number
): number {
  const config = TIRE_COMPOUNDS[compound] || TIRE_COMPOUNDS.normal;
  const lowerEdge = config.optimalTemperature - config.temperatureWindow;
  const upperEdge = config.optimalTemperature + config.temperatureWindow;

  if (temperature < lowerEdge) {
    const warmup = smoothstep(20, lowerEdge, temperature);
    return config.coldGripFloor + (1.0 - config.coldGripFloor) * warmup;
  }

  if (temperature > upperEdge) {
    const overheat = smoothstep(upperEdge, upperEdge + 75, temperature);
    return 1.0 - overheat * 0.24;
  }

  return 1.0;
}

export function getEffectiveGrip(
  compound: TireCompoundType,
  wear: number,
  surfaceGrip: number = 1.0,
  temperature: number = 25
): number {
  const config = TIRE_COMPOUNDS[compound] || TIRE_COMPOUNDS.normal;
  const wearPenalty = getWearGripPenalty(wear);
  const temperatureMultiplier = getTemperatureGripMultiplier(compound, temperature);
  return config.gripMultiplier * temperatureMultiplier * (1.0 - wearPenalty) * surfaceGrip;
}

export function updateTireTemperature(
  state: TireState,
  speedRatio: number,
  slipAngle: number,
  slipRatio: number,
  brakeIntensity: number,
  deltaTime: number
): void {
  const config = TIRE_COMPOUNDS[state.compound] || TIRE_COMPOUNDS.normal;
  const speedHeat = Math.max(0, speedRatio) * 0.65;
  const lateralSlipHeat = Math.min(6.0, Math.abs(slipAngle) * 14.0);
  const longitudinalSlipHeat = Math.min(7.0, Math.abs(slipRatio) * 11.0);
  const brakeHeat = Math.max(0, brakeIntensity) * 1.2;
  const heatPerSecond =
    (speedHeat + lateralSlipHeat + longitudinalSlipHeat + brakeHeat) * config.heatRate;

  const ambientTemperature = 25;
  const airflowCooling = 0.012 + Math.max(0, speedRatio) * 0.045;
  const coolingPerSecond =
    Math.max(0, state.temperature - ambientTemperature) * airflowCooling;

  state.temperature = Math.max(
    ambientTemperature,
    Math.min(190, state.temperature + (heatPerSecond - coolingPerSecond) * deltaTime)
  );
}

export function accumulateWear(
  state: TireState,
  speedRatio: number,
  slipAngle: number,
  brakeForce: number,
  deltaTime: number
): void {
  const config = TIRE_COMPOUNDS[state.compound] || TIRE_COMPOUNDS.normal;
  const baseWearPerSecond = 0.001;
  const speedFactor = Math.max(0.1, Math.min(1.0, speedRatio));
  const corneringLoad = 1.0 + Math.abs(slipAngle) * 2.0;
  const brakingLoad = 1.0 + brakeForce * 0.5;
  const overheatLoad = 1.0 + Math.max(0, state.temperature - config.optimalTemperature) * 0.012;

  const wearDelta =
    baseWearPerSecond *
    config.wearRate *
    speedFactor *
    corneringLoad *
    brakingLoad *
    overheatLoad *
    deltaTime;

  state.wear = Math.min(1.0, state.wear + wearDelta);
}

export function createFreshTireState(compound: TireCompoundType = 'normal'): TireState {
  return {
    compound,
    wear: 0,
    temperature: 25
  };
}
