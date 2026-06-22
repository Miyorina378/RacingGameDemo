/**
 * Compact Pacejka-style tire force helpers.
 *
 * This remains a simcade model, but it retains the important B/C/D/E shape
 * controls, supports longitudinal slip, and uses an elliptical combined-grip
 * envelope instead of directly clamping requested engine and brake force.
 */

function pacejkaForce(
  slip: number,
  peakForce: number,
  stiffness: number,
  shape: number,
  curvature: number
): number {
  const bx = stiffness * slip;
  const shapedSlip = bx - curvature * (bx - Math.atan(bx));
  return peakForce * Math.sin(shape * Math.atan(shapedSlip));
}

export function computeLateralForce(
  slipAngle: number,
  gripCoeff: number,
  load: number,
  stiffness: number = 8.0
): number {
  let force = pacejkaForce(slipAngle, gripCoeff * load, stiffness, 1.3, 0.92);
  const postPeakSlide = Math.min(1.0, Math.max(0, Math.abs(slipAngle) - 0.16) / 0.65);
  force *= 1.0 - postPeakSlide * 0.22;
  return force;
}

export function computeLongitudinalForce(
  slipRatio: number,
  gripCoeff: number,
  load: number,
  stiffness: number = 10.0
): number {
  let force = pacejkaForce(slipRatio, gripCoeff * load, stiffness, 1.55, 0.94);
  const postPeakSlide = Math.min(1.0, Math.max(0, Math.abs(slipRatio) - 0.18) / 0.82);
  force *= 1.0 - postPeakSlide * 0.18;
  return force;
}

/**
 * Scale combined tire forces to an ellipse. Tires can usually create slightly
 * more force longitudinally than laterally.
 */
export function combinedGripCircle(
  lateralForce: number,
  longitudinalForce: number,
  maxGrip: number,
  longitudinalScale: number = 1.05,
  lateralScale: number = 0.95
): { lateral: number; longitudinal: number } {
  const maxLongitudinal = Math.max(0.001, maxGrip * longitudinalScale);
  const maxLateral = Math.max(0.001, maxGrip * lateralScale);
  const normalizedForceSq =
    (lateralForce * lateralForce) / (maxLateral * maxLateral) +
    (longitudinalForce * longitudinalForce) / (maxLongitudinal * maxLongitudinal);

  if (normalizedForceSq <= 1.0 || normalizedForceSq < 0.001) {
    return { lateral: lateralForce, longitudinal: longitudinalForce };
  }

  const scale = 1.0 / Math.sqrt(normalizedForceSq);
  return {
    lateral: lateralForce * scale,
    longitudinal: longitudinalForce * scale
  };
}

export function computeSlipAngle(lateralVel: number, forwardVel: number): number {
  if (Math.abs(forwardVel) < 0.5) {
    return Math.atan2(lateralVel, Math.max(Math.abs(forwardVel), 0.5));
  }
  return Math.atan2(lateralVel, Math.abs(forwardVel));
}

export function computeSlipRatio(wheelSpeed: number, groundSpeed: number): number {
  const maxSpeed = Math.max(Math.abs(wheelSpeed), Math.abs(groundSpeed), 0.5);
  return (wheelSpeed - groundSpeed) / maxSpeed;
}

/**
 * Relax a tire state over distance travelled by the contact patch.
 */
export function relaxTireValue(
  currentValue: number,
  targetValue: number,
  speed: number,
  deltaTime: number,
  relaxationLength: number = 0.12
): number {
  const travelledDistance = Math.max(Math.abs(speed), 0.5) * Math.max(deltaTime, 0);
  const response = 1.0 - Math.exp(-travelledDistance / Math.max(relaxationLength, 0.01));
  return currentValue + (targetValue - currentValue) * response;
}
