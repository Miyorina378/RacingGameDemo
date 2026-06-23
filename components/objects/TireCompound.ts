export type TireCompoundType =
  | 'economy'
  | 'sport_hard'
  | 'sport_medium'
  | 'sport_soft'
  | 'super_hard'
  | 'hard'
  | 'normal'
  | 'soft'
  | 'super_soft';

export interface TireCompoundConfig {
  id: TireCompoundType;
  name: string;
  gripMultiplier: number;
  wearRate: number;
  optimalTemperature: number;
  temperatureWindow: number;
  coldGripFloor: number;
  heatRate: number;
  lateralEnvelopeScale: number;
  lateralPeakSlipAngle: number;
  postPeakGripLoss: number;
  postPeakFalloff: number;
  recommendedColdPressurePsi: number;
  pressureTolerancePsi: number;
  colorHex: string;
  colorLabel: string;
}

export interface TireState {
  compound: TireCompoundType;
  wear: number;
  temperature: number;
  coldPressurePsi: number;
}

export interface TirePressureEffects {
  pressurePsi: number;
  optimalPressurePsi: number;
  gripMultiplier: number;
  stiffnessMultiplier: number;
  heatMultiplier: number;
  wearMultiplier: number;
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
    lateralEnvelopeScale: 0.96,
    lateralPeakSlipAngle: 0.21,
    postPeakGripLoss: 0.10,
    postPeakFalloff: 0.90,
    recommendedColdPressurePsi: 34,
    pressureTolerancePsi: 11,
    colorHex: '#6b7280',
    colorLabel: 'Gray'
  },
  sport_hard: {
    id: 'sport_hard',
    name: 'Sport Hard',
    gripMultiplier: 0.89,
    wearRate: 0.18,
    optimalTemperature: 72,
    temperatureWindow: 28,
    coldGripFloor: 0.90,
    heatRate: 0.80,
    lateralEnvelopeScale: 0.98,
    lateralPeakSlipAngle: 0.205,
    postPeakGripLoss: 0.10,
    postPeakFalloff: 0.92,
    recommendedColdPressurePsi: 33,
    pressureTolerancePsi: 11,
    colorHex: '#94a3b8',
    colorLabel: 'Slate'
  },
  sport_medium: {
    id: 'sport_medium',
    name: 'Sport Medium',
    gripMultiplier: 0.94,
    wearRate: 0.28,
    optimalTemperature: 78,
    temperatureWindow: 25,
    coldGripFloor: 0.88,
    heatRate: 0.88,
    lateralEnvelopeScale: 0.99,
    lateralPeakSlipAngle: 0.195,
    postPeakGripLoss: 0.11,
    postPeakFalloff: 0.90,
    recommendedColdPressurePsi: 32,
    pressureTolerancePsi: 10.5,
    colorHex: '#22c55e',
    colorLabel: 'Green'
  },
  sport_soft: {
    id: 'sport_soft',
    name: 'Sport Soft',
    gripMultiplier: 0.99,
    wearRate: 0.42,
    optimalTemperature: 83,
    temperatureWindow: 22,
    coldGripFloor: 0.86,
    heatRate: 0.96,
    lateralEnvelopeScale: 1.00,
    lateralPeakSlipAngle: 0.19,
    postPeakGripLoss: 0.12,
    postPeakFalloff: 0.88,
    recommendedColdPressurePsi: 31,
    pressureTolerancePsi: 10,
    colorHex: '#06b6d4',
    colorLabel: 'Cyan'
  },
  super_hard: {
    id: 'super_hard',
    name: 'Racing Hard',
    gripMultiplier: 1.12,
    wearRate: 0.65,
    optimalTemperature: 86,
    temperatureWindow: 24,
    coldGripFloor: 0.92,
    heatRate: 1.04,
    lateralEnvelopeScale: 1.03,
    lateralPeakSlipAngle: 0.185,
    postPeakGripLoss: 0.13,
    postPeakFalloff: 0.86,
    recommendedColdPressurePsi: 32,
    pressureTolerancePsi: 10,
    colorHex: '#e5e7eb',
    colorLabel: 'White'
  },
  hard: {
    id: 'hard',
    name: 'Racing Medium',
    gripMultiplier: 1.18,
    wearRate: 1.00,
    optimalTemperature: 90,
    temperatureWindow: 22,
    coldGripFloor: 0.91,
    heatRate: 1.10,
    lateralEnvelopeScale: 1.04,
    lateralPeakSlipAngle: 0.18,
    postPeakGripLoss: 0.14,
    postPeakFalloff: 0.84,
    recommendedColdPressurePsi: 31,
    pressureTolerancePsi: 9.5,
    colorHex: '#3b82f6',
    colorLabel: 'Blue'
  },
  normal: {
    id: 'normal',
    name: 'Racing Soft',
    gripMultiplier: 1.24,
    wearRate: 1.55,
    optimalTemperature: 94,
    temperatureWindow: 20,
    coldGripFloor: 0.89,
    heatRate: 1.18,
    lateralEnvelopeScale: 1.05,
    lateralPeakSlipAngle: 0.18,
    postPeakGripLoss: 0.15,
    postPeakFalloff: 0.82,
    recommendedColdPressurePsi: 30,
    pressureTolerancePsi: 9,
    colorHex: '#eab308',
    colorLabel: 'Yellow'
  },
  soft: {
    id: 'soft',
    name: 'Racing Super Soft',
    gripMultiplier: 1.29,
    wearRate: 2.30,
    optimalTemperature: 98,
    temperatureWindow: 18,
    coldGripFloor: 0.87,
    heatRate: 1.27,
    lateralEnvelopeScale: 1.06,
    lateralPeakSlipAngle: 0.175,
    postPeakGripLoss: 0.16,
    postPeakFalloff: 0.80,
    recommendedColdPressurePsi: 28,
    pressureTolerancePsi: 8.5,
    colorHex: '#ef4444',
    colorLabel: 'Red'
  },
  super_soft: {
    id: 'super_soft',     
    name: 'Qualifying',
    gripMultiplier: 2.5,
    wearRate: 3.50,
    optimalTemperature: 102,
    temperatureWindow: 16,
    coldGripFloor: 0.84,
    heatRate: 1.34,
    lateralEnvelopeScale: 1.07,
    lateralPeakSlipAngle: 0.17,
    postPeakGripLoss: 0.18,
    postPeakFalloff: 0.78,
    recommendedColdPressurePsi: 27,
    pressureTolerancePsi: 8,
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

/**
 * Estimate hot gauge pressure with the ideal-gas relationship. Pressure is
 * stored as the cold setup value so future tuning UI can adjust it directly.
 */
export function getTirePressureEffects(
  compound: TireCompoundType,
  temperature: number,
  coldPressurePsi?: number
): TirePressureEffects {
  const config = TIRE_COMPOUNDS[compound] || TIRE_COMPOUNDS.normal;
  const ambientTemperatureC = 25;
  const atmosphericPressurePsi = 14.7;
  const coldGaugePressure = Math.max(
    10,
    coldPressurePsi ?? config.recommendedColdPressurePsi
  );
  const temperatureKelvin = Math.max(200, temperature + 273.15);
  const ambientKelvin = ambientTemperatureC + 273.15;
  const pressurePsi =
    (coldGaugePressure + atmosphericPressurePsi) *
    (temperatureKelvin / ambientKelvin) -
    atmosphericPressurePsi;
  const optimalTemperatureKelvin = config.optimalTemperature + 273.15;
  const optimalPressurePsi =
    (config.recommendedColdPressurePsi + atmosphericPressurePsi) *
    (optimalTemperatureKelvin / ambientKelvin) -
    atmosphericPressurePsi;
  const pressureError = pressurePsi - optimalPressurePsi;
  const normalizedError = pressureError / config.pressureTolerancePsi;
  const underInflation = Math.max(0, -normalizedError);
  const overInflation = Math.max(0, normalizedError);
  const gripPenalty = Math.min(
    0.14,
    underInflation * underInflation * 0.035 +
    overInflation * overInflation * 0.045
  );

  return {
    pressurePsi,
    optimalPressurePsi,
    gripMultiplier: 1.0 - gripPenalty,
    stiffnessMultiplier: Math.max(
      0.82,
      Math.min(1.12, pressurePsi / Math.max(optimalPressurePsi, 1))
    ),
    heatMultiplier: Math.max(
      0.78,
      Math.min(1.35, 1.0 + underInflation * 0.18 - overInflation * 0.08)
    ),
    wearMultiplier: Math.min(
      1.55,
      1.0 + underInflation * 0.26 + overInflation * 0.18
    )
  };
}

export function getEffectiveGrip(
  compound: TireCompoundType,
  wear: number,
  surfaceGrip: number = 1.0,
  temperature: number = 25,
  coldPressurePsi?: number
): number {
  const config = TIRE_COMPOUNDS[compound] || TIRE_COMPOUNDS.normal;
  const wearPenalty = getWearGripPenalty(wear);
  const temperatureMultiplier = getTemperatureGripMultiplier(compound, temperature);
  const pressureEffects = getTirePressureEffects(
    compound,
    temperature,
    coldPressurePsi
  );
  return (
    config.gripMultiplier *
    temperatureMultiplier *
    pressureEffects.gripMultiplier *
    (1.0 - wearPenalty) *
    surfaceGrip
  );
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
  const pressureEffects = getTirePressureEffects(
    state.compound,
    state.temperature,
    state.coldPressurePsi
  );
  const speedHeat = Math.max(0, speedRatio) * 0.65;
  const lateralSlipHeat = Math.min(6.0, Math.abs(slipAngle) * 14.0);
  const longitudinalSlipHeat = Math.min(7.0, Math.abs(slipRatio) * 11.0);
  const brakeHeat = Math.max(0, brakeIntensity) * 1.2;
  const heatPerSecond =
    (speedHeat + lateralSlipHeat + longitudinalSlipHeat + brakeHeat) *
    config.heatRate *
    pressureEffects.heatMultiplier;

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
  deltaTime: number,
  normalLoadRatio: number = 1
): void {
  const config = TIRE_COMPOUNDS[state.compound] || TIRE_COMPOUNDS.normal;
  const pressureEffects = getTirePressureEffects(
    state.compound,
    state.temperature,
    state.coldPressurePsi
  );
  const baseWearPerSecond = 0.001;
  const speedFactor = Math.max(0.1, Math.min(1.0, speedRatio));
  const corneringLoad = 1.0 + Math.abs(slipAngle) * 2.0;
  const brakingLoad = 1.0 + brakeForce * 0.5;
  const overheatLoad = 1.0 + Math.max(0, state.temperature - config.optimalTemperature) * 0.012;
  const loadWear = Math.max(
    0.65,
    Math.min(1.9, Math.pow(Math.max(normalLoadRatio, 0.1), 1.28))
  );

  const wearDelta =
    baseWearPerSecond *
    config.wearRate *
    speedFactor *
    corneringLoad *
    brakingLoad *
    overheatLoad *
    loadWear *
    pressureEffects.wearMultiplier *
    deltaTime;

  state.wear = Math.min(1.0, state.wear + wearDelta);
}

export function createFreshTireState(compound: TireCompoundType = 'normal'): TireState {
  const config = TIRE_COMPOUNDS[compound] || TIRE_COMPOUNDS.normal;
  return {
    compound,
    wear: 0,
    temperature: 25,
    coldPressurePsi: config.recommendedColdPressurePsi
  };
}
