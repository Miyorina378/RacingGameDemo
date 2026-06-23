export type PowerSteeringType = 'none' | 'hydraulic' | 'electric';

export interface SteeringSystemInput {
  currentSteeringWheelAngle: number;
  targetRoadWheelAngle: number;
  inputMagnitude: number;
  speed: number;
  slipAngle: number;
  frontAxleLoad: number;
  gripCoefficient: number;
  rackRatio: number;
  powerSteeringType: PowerSteeringType;
  pneumaticTrail: number;
  casterTrail: number;
  response: number;
  counterSteering: boolean;
  directionChangeBlend: number;
  deltaTime: number;
}

export interface SteeringSystemOutput {
  steeringWheelAngle: number;
  roadWheelAngle: number;
  steeringTorqueNm: number;
  assistFraction: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getPowerSteeringAssist(
  type: PowerSteeringType,
  speed: number
): number {
  const speedBlend = clamp(Math.abs(speed) / 38, 0, 1);
  if (type === 'electric') {
    return 0.82 + (0.28 - 0.82) * speedBlend;
  }
  if (type === 'hydraulic') {
    return 0.68 + (0.20 - 0.68) * speedBlend;
  }
  return 0;
}

/**
 * Estimate the steering-wheel torque from pneumatic and mechanical trail.
 * Torque fades after the tire passes peak slip, matching real SAT behavior.
 */
export function computeSelfAligningTorque(
  slipAngle: number,
  roadWheelAngle: number,
  frontAxleLoad: number,
  gripCoefficient: number,
  rackRatio: number,
  pneumaticTrail: number,
  casterTrail: number
): number {
  const absoluteSlip = Math.abs(slipAngle);
  const lateralForce =
    -Math.tanh(slipAngle * 8.0) *
    Math.max(0, frontAxleLoad) *
    Math.max(0, gripCoefficient);
  const postPeakFade = 1.0 - clamp((absoluteSlip - 0.10) / 0.34, 0, 0.82);
  const tireMoment = lateralForce * pneumaticTrail * postPeakFade;
  const casterMoment =
    -Math.sin(roadWheelAngle) *
    Math.max(0, frontAxleLoad) *
    casterTrail *
    0.14;

  return clamp(
    (tireMoment + casterMoment) / Math.max(rackRatio, 1),
    -18,
    18
  );
}

export function updateSteeringSystem(
  input: SteeringSystemInput
): SteeringSystemOutput {
  const rackRatio = Math.max(8, input.rackRatio);
  const assistFraction = getPowerSteeringAssist(
    input.powerSteeringType,
    input.speed
  );
  const currentRoadWheelAngle =
    input.currentSteeringWheelAngle / rackRatio;
  const rawSteeringTorque = computeSelfAligningTorque(
    input.slipAngle,
    currentRoadWheelAngle,
    input.frontAxleLoad,
    input.gripCoefficient,
    rackRatio,
    input.pneumaticTrail,
    input.casterTrail
  );
  const steeringTorqueNm =
    rawSteeringTorque * (1.0 - assistFraction * 0.78);
  const targetSteeringWheelAngle =
    input.targetRoadWheelAngle * rackRatio;

  const baseWheelRate =
    input.powerSteeringType === 'electric'
      ? 10.5
      : input.powerSteeringType === 'hydraulic'
        ? 9.0
        : 6.8;
  const highSpeedRateScale =
    1.0 - clamp(Math.abs(input.speed) / 55, 0, 1) * 0.36;
  const counterSteerScale = input.counterSteering ? 1.48 : 1.0;
  const directionChangeRateScale =
    1.0 - clamp(input.directionChangeBlend, 0, 1) * 0.52;
  const maxWheelRate =
    baseWheelRate *
    (0.82 + assistFraction * 0.32) *
    highSpeedRateScale *
    counterSteerScale *
    directionChangeRateScale *
    Math.max(0.55, input.response);
  const angleError =
    targetSteeringWheelAngle - input.currentSteeringWheelAngle;
  const commandedRate = clamp(
    angleError * (5.5 + input.response * 2.5),
    -maxWheelRate,
    maxWheelRate
  );
  const handsOffBlend = 1.0 - clamp(input.inputMagnitude, 0, 1) * 0.82;
  const aligningRate =
    steeringTorqueNm *
    0.055 *
    handsOffBlend;
  const nextSteeringWheelAngle =
    input.currentSteeringWheelAngle +
    (commandedRate + aligningRate) *
      Math.max(0, input.deltaTime);

  return {
    steeringWheelAngle: nextSteeringWheelAngle,
    roadWheelAngle: nextSteeringWheelAngle / rackRatio,
    steeringTorqueNm,
    assistFraction
  };
}
