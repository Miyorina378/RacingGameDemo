export interface FuelConsumptionInput {
  powertrainType: 'combustion' | 'electric';
  rpm: number;
  maxRpm: number;
  engineTorqueNm: number;
  throttle: number;
  displacementLiters: number;
  brakeSpecificFuelConsumption: number;
  turboBoost: number;
  fuelDensityKgPerLiter: number;
  overrunFuelCut: boolean;
  deltaTime: number;
}

export interface FuelConsumptionOutput {
  consumedLiters: number;
  litersPerHour: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Estimate gasoline use from brake power and BSFC. Low-load operation is less
 * efficient, while high-RPM/full-load and boosted operation run richer.
 */
export function computeFuelConsumption(
  input: FuelConsumptionInput
): FuelConsumptionOutput {
  if (
    input.powertrainType === 'electric' ||
    input.deltaTime <= 0 ||
    input.overrunFuelCut
  ) {
    return { consumedLiters: 0, litersPerHour: 0 };
  }

  const throttle = clamp(input.throttle, 0, 1);
  const angularSpeed = Math.max(0, input.rpm) * Math.PI * 2 / 60;
  const brakePowerKw =
    Math.max(0, input.engineTorqueNm) * angularSpeed / 1000;
  const rpmRatio = clamp(
    input.rpm / Math.max(input.maxRpm, 1),
    0,
    1.2
  );
  const lowLoadPenalty = 1.0 + (1.0 - throttle) * 0.38;
  const highLoadEnrichment =
    1.0 +
    Math.max(0, throttle - 0.82) * 0.42 +
    Math.max(0, rpmRatio - 0.78) * 0.32;
  const boostEnrichment =
    1.0 + clamp(input.turboBoost, 0, 1) * throttle * 0.20;
  const effectiveBsfc =
    Math.max(180, input.brakeSpecificFuelConsumption) *
    lowLoadPenalty *
    highLoadEnrichment *
    boostEnrichment;

  const loadFuelKgPerHour = brakePowerKw * effectiveBsfc / 1000;
  const idleLitersPerHour =
    0.38 + Math.max(0.6, input.displacementLiters) * 0.16;
  const idleFuelKgPerHour =
    idleLitersPerHour * input.fuelDensityKgPerLiter;
  const fuelKgPerHour = Math.max(
    idleFuelKgPerHour,
    loadFuelKgPerHour
  );
  const litersPerHour =
    fuelKgPerHour / Math.max(input.fuelDensityKgPerLiter, 0.1);

  return {
    consumedLiters:
      litersPerHour * Math.min(input.deltaTime, 0.1) / 3600,
    litersPerHour
  };
}

/**
 * At the final fuel reserve, lateral/longitudinal acceleration can uncover the
 * pickup and briefly starve the engine before the tank is mathematically empty.
 */
export function computeFuelDeliveryFactor(
  fuelLiters: number,
  capacityLiters: number,
  lateralAcceleration: number,
  longitudinalAcceleration: number
): number {
  if (capacityLiters <= 0) return 1;
  if (fuelLiters <= 0) return 0;

  const reserveLiters = Math.max(0.45, capacityLiters * 0.012);
  if (fuelLiters >= reserveLiters) return 1;

  const reserveRatio = clamp(fuelLiters / reserveLiters, 0, 1);
  const accelerationG =
    Math.hypot(lateralAcceleration, longitudinalAcceleration) / 9.81;
  const surgePenalty =
    clamp((accelerationG - 0.45) / 0.75, 0, 1) *
    (1.0 - reserveRatio);

  return clamp(
    reserveRatio * 1.15 - surgePenalty * 0.72,
    0.08,
    1
  );
}
