/**
 * TireModel — Simplified Pacejka "Magic Formula" tire force calculator.
 *
 * Produces smooth, saturating force curves instead of binary grip-on/grip-off.
 * Lateral force: F = peakGrip × sin(atan(B × slipAngle))
 * Longitudinal force: F = peakGrip × sin(atan(B × slipRatio))
 *
 * The "B" (stiffness factor) controls how quickly force builds with slip.
 * Higher B = snappier response. Lower B = more progressive (forgiving).
 *
 * Combined grip circle ensures total tire force never exceeds friction limit.
 */

/**
 * Compute lateral (cornering) force from a tire.
 *
 * @param slipAngle - Angle between tire heading and velocity (radians). Positive = cornering.
 * @param gripCoeff - Effective grip coefficient (compound × surface × wear).
 *                     1.0 = normal dry tarmac. 0.3 = ice. 1.2 = super soft tire.
 * @param load      - Normal force on tire (N). Higher load = more force, but diminishing returns.
 * @param stiffness - Cornering stiffness factor "B" (default 8.0 for simcade feel).
 *                     Real Pacejka uses 10-15. Simcade uses 6-10 for forgiveness.
 * @returns Lateral force (N). Positive = force opposing the slip direction.
 */
export function computeLateralForce(
  slipAngle: number,
  gripCoeff: number,
  load: number,
  stiffness: number = 8.0
): number {
  // Peak grip force = μ × N (Coulomb friction)
  const peakForce = gripCoeff * load;

  // Simplified Magic Formula: F = Fpeak × sin(atan(B × α))
  // This naturally saturates: small slip → linear, large slip → peaks then holds
  const absSlip = Math.abs(slipAngle);
  let force = peakForce * Math.sin(Math.atan(stiffness * slipAngle));

  // Post-peak grip drop-off: real tires lose up to 20% grip when sliding
  // past the optimal slip angle (~0.14 rad / ~8°). This creates realistic
  // "sliding past peak" behavior instead of force plateauing forever.
  const peakSlip = 0.14;
  if (absSlip > peakSlip) {
    const dropOff = Math.min(1.0, (absSlip - peakSlip) / 0.4);
    force *= (1.0 - dropOff * 0.20);
  }

  return force;
}

/**
 * Compute longitudinal (traction/braking) force from a tire.
 *
 * @param slipRatio - Ratio of wheel speed vs ground speed.
 *                     > 0 = wheelspin (accelerating), < 0 = wheel lock (braking).
 *                     Typical range: -0.3 to 0.3 for normal driving.
 * @param gripCoeff - Effective grip coefficient.
 * @param load      - Normal force on tire (N).
 * @param stiffness - Longitudinal stiffness factor (default 10.0).
 * @returns Longitudinal force (N). Positive = forward traction, negative = braking.
 */
export function computeLongitudinalForce(
  slipRatio: number,
  gripCoeff: number,
  load: number,
  stiffness: number = 10.0
): number {
  const peakForce = gripCoeff * load;
  const absSlip = Math.abs(slipRatio);
  let force = peakForce * Math.sin(Math.atan(stiffness * slipRatio));

  // Post-peak drop-off: grip reduces by up to 15% past optimal slip ratio (~0.12).
  const peakSlip = 0.12;
  if (absSlip > peakSlip) {
    const dropOff = Math.min(1.0, (absSlip - peakSlip) / 0.35);
    force *= (1.0 - dropOff * 0.15);
  }

  return force;
}

/**
 * Apply combined grip circle (friction ellipse) scaling.
 *
 * When a tire is producing both lateral and longitudinal forces simultaneously,
 * the total force vector is clamped to the friction circle. This means hard braking
 * reduces available cornering force, and vice versa.
 *
 * @param lateralForce      - Computed lateral force (N).
 * @param longitudinalForce - Computed longitudinal force (N).
 * @param maxGrip           - Maximum total force the tire can produce (gripCoeff × load).
 * @returns Scaled { lateral, longitudinal } forces that respect the friction circle.
 */
export function combinedGripCircle(
  lateralForce: number,
  longitudinalForce: number,
  maxGrip: number
): { lateral: number; longitudinal: number } {
  const totalForceSq = lateralForce * lateralForce + longitudinalForce * longitudinalForce;
  const maxGripSq = maxGrip * maxGrip;

  if (totalForceSq <= maxGripSq || totalForceSq < 0.001) {
    // Within friction circle — no scaling needed
    return { lateral: lateralForce, longitudinal: longitudinalForce };
  }

  // Scale both forces proportionally to fit within the circle
  const scale = maxGrip / Math.sqrt(totalForceSq);
  return {
    lateral: lateralForce * scale,
    longitudinal: longitudinalForce * scale
  };
}

/**
 * Compute tire slip angle given the velocity components in the tire's local frame.
 *
 * @param lateralVel  - Velocity perpendicular to tire heading (m/s). Positive = sliding right.
 * @param forwardVel  - Velocity along tire heading (m/s). Positive = moving forward.
 * @returns Slip angle in radians. Positive when sliding.
 */
export function computeSlipAngle(lateralVel: number, forwardVel: number): number {
  // Avoid division by zero at very low speeds
  if (Math.abs(forwardVel) < 0.5) {
    // At near-zero speed, slip angle is proportional to lateral velocity
    // This prevents the atan from going wild when stationary
    return Math.atan2(lateralVel, Math.max(Math.abs(forwardVel), 0.5));
  }
  return Math.atan2(lateralVel, Math.abs(forwardVel));
}

/**
 * Compute longitudinal slip ratio.
 *
 * @param wheelSpeed  - Rotational speed of wheel converted to linear (m/s).
 * @param groundSpeed - Actual ground speed of the contact patch (m/s).
 * @returns Slip ratio. Positive = wheelspin, negative = wheel lock.
 */
export function computeSlipRatio(wheelSpeed: number, groundSpeed: number): number {
  const maxSpeed = Math.max(Math.abs(wheelSpeed), Math.abs(groundSpeed), 0.5);
  return (wheelSpeed - groundSpeed) / maxSpeed;
}
