export interface EngineThermalState {
  temperature: number;
}

export interface EngineThermalInput {
  rpm: number;
  maxRpm: number;
  throttle: number;
  speed: number;
  turboBoost: number;
  coolingEfficiency: number;
  powertrainType: 'combustion' | 'electric';
  deltaTime: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp(
    (value - edge0) / Math.max(edge1 - edge0, 0.001),
    0,
    1
  );
  return t * t * (3 - 2 * t);
}

/**
 * Mechanical, viscous, pumping, and cold-oil losses. Closed throttle creates
 * stronger pumping loss, so this same model can drive realistic engine braking.
 */
export function computeEngineFrictionTorque(
  rpm: number,
  throttle: number,
  displacementLiters: number,
  temperature: number
): number {
  const normalizedRpm = Math.max(0, rpm) / 1000;
  const displacement = Math.max(0.6, displacementLiters);
  const mechanicalLoss = 5.5 + displacement * 2.8;
  const viscousLoss =
    normalizedRpm * (1.5 + displacement * 0.55) +
    normalizedRpm * normalizedRpm * (0.18 + displacement * 0.035);
  const pumpingLoss =
    (1.0 - clamp(throttle, 0, 1)) *
    displacement *
    (2.8 + normalizedRpm * 1.05);
  const coldOilMultiplier =
    1.0 + (1.0 - smoothstep(25, 95, temperature)) * 0.48;
  const overheatFriction =
    1.0 + smoothstep(112, 145, temperature) * 0.18;

  return (
    (mechanicalLoss + viscousLoss + pumpingLoss) *
    coldOilMultiplier *
    overheatFriction
  );
}

export function getEngineTemperatureTorqueMultiplier(
  temperature: number
): number {
  const coldMultiplier =
    0.93 + smoothstep(25, 82, temperature) * 0.07;
  const overheatPenalty =
    smoothstep(108, 145, temperature) * 0.34;
  return coldMultiplier * (1.0 - overheatPenalty);
}

export function getVariableValveTimingMultiplier(
  rpm: number,
  engageRpm: number,
  torqueGain: number
): number {
  const engagement = smoothstep(
    engageRpm - 350,
    engageRpm + 250,
    rpm
  );
  return 1.0 + engagement * Math.max(0, torqueGain);
}

/**
 * Compact coolant/oil lumped-temperature model. It warms slowly from ambient,
 * stabilizes near normal temperature, and can overheat under sustained load.
 */
export function updateEngineTemperature(
  state: EngineThermalState,
  input: EngineThermalInput
): void {
  const deltaTime = clamp(input.deltaTime, 0, 0.1);
  const rpmRatio = clamp(
    input.rpm / Math.max(input.maxRpm, 1),
    0,
    1.2
  );
  const throttle = clamp(input.throttle, 0, 1);
  const ambientTemperature = 25;
  const normalTemperature =
    input.powertrainType === 'electric' ? 72 : 92;
  const baseWarmup =
    input.powertrainType === 'electric' ? 0.16 : 0.28;
  const loadHeat =
    rpmRatio *
    (0.18 + throttle * 0.72) *
    (input.powertrainType === 'electric' ? 0.46 : 0.82);
  const boostHeat =
    input.powertrainType === 'combustion'
      ? clamp(input.turboBoost, 0, 1) * throttle * 0.34
      : 0;
  const speedCooling =
    (0.010 + Math.abs(input.speed) * 0.0018) *
    Math.max(0.55, input.coolingEfficiency);
  const thermostatCooling =
    Math.max(0, state.temperature - normalTemperature) *
    (0.010 + speedCooling);
  const ambientCooling =
    Math.max(0, state.temperature - ambientTemperature) *
    speedCooling *
    0.08;

  state.temperature = clamp(
    state.temperature +
      (baseWarmup + loadHeat + boostHeat -
        thermostatCooling -
        ambientCooling) *
        deltaTime,
    ambientTemperature,
    155
  );
}
