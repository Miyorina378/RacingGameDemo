export type SuspensionCorner = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

export interface SuspensionSetup {
  frontSpringRate: number;
  rearSpringRate: number;
  frontCompressionDamping: number;
  rearCompressionDamping: number;
  frontReboundDamping: number;
  rearReboundDamping: number;
  frontAntiRollRate: number;
  rearAntiRollRate: number;
  travel: number;
  bumpStopRate: number;
  rideHeight: number;
}

export interface SuspensionInput {
  deltaTime: number;
  mass: number;
  wheelbase: number;
  trackWidth: number;
  frontWeightDistribution: number;
  cornerLoadTargets: Record<SuspensionCorner, number>;
  staticFrontLoad: number;
  staticRearLoad: number;
  unsprungLoadPerCorner: number;
  pitchInertia: number;
  rollInertia: number;
  groundHeights: Record<SuspensionCorner, number>;
  grounded: boolean;
}

export interface SuspensionCornerState {
  compression: number;
  velocity: number;
  normalLoad: number;
  contact: boolean;
}

export interface SuspensionOutput {
  corners: Record<SuspensionCorner, SuspensionCornerState>;
  frontLoad: number;
  rearLoad: number;
  frontLateralTransfer: number;
  rearLateralTransfer: number;
  heave: number;
  pitch: number;
  roll: number;
}

const CORNERS: SuspensionCorner[] = [
  'frontLeft',
  'frontRight',
  'rearLeft',
  'rearRight'
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function createCornerState(): SuspensionCornerState {
  return {
    compression: 0,
    velocity: 0,
    normalLoad: 0,
    contact: true
  };
}

export function createSuspensionSetup(
  mass: number,
  frontWeightDistribution: number,
  upgradeLevel: number
): SuspensionSetup {
  const level = clamp(upgradeLevel, 0, 3);
  const wheelRateScale = 1.0 + level * 0.22;
  const dampingScale = 1.0 + level * 0.18;
  const antiRollScale = 1.0 + level * 0.28;
  const frontCornerMass = mass * frontWeightDistribution * 0.5;
  const rearCornerMass = mass * (1.0 - frontWeightDistribution) * 0.5;
  const targetRideFrequency = 1.45 + level * 0.18;
  const angularFrequency = targetRideFrequency * Math.PI * 2;

  const frontSpringRate =
    frontCornerMass * angularFrequency * angularFrequency * wheelRateScale;
  const rearSpringRate =
    rearCornerMass * angularFrequency * angularFrequency * wheelRateScale;
  const frontCriticalDamping = 2 * Math.sqrt(frontSpringRate * frontCornerMass);
  const rearCriticalDamping = 2 * Math.sqrt(rearSpringRate * rearCornerMass);

  return {
    frontSpringRate,
    rearSpringRate,
    frontCompressionDamping: frontCriticalDamping * 0.68 * dampingScale,
    rearCompressionDamping: rearCriticalDamping * 0.65 * dampingScale,
    frontReboundDamping: frontCriticalDamping * 0.82 * dampingScale,
    rearReboundDamping: rearCriticalDamping * 0.80 * dampingScale,
    frontAntiRollRate: mass * 8.5 * antiRollScale,
    rearAntiRollRate: mass * 6.8 * antiRollScale,
    travel: Math.max(0.09, 0.18 - level * 0.018),
    bumpStopRate: mass * (65 + level * 15),
    rideHeight: Math.max(0.09, 0.16 - level * 0.018)
  };
}

export class SuspensionModel {
  private setup: SuspensionSetup;
  private previousGroundHeights: Record<SuspensionCorner, number>;
  private corners: Record<SuspensionCorner, SuspensionCornerState>;
  private initialized = false;

  constructor(setup: SuspensionSetup) {
    this.setup = setup;
    this.previousGroundHeights = {
      frontLeft: 0,
      frontRight: 0,
      rearLeft: 0,
      rearRight: 0
    };
    this.corners = {
      frontLeft: createCornerState(),
      frontRight: createCornerState(),
      rearLeft: createCornerState(),
      rearRight: createCornerState()
    };
  }

  public setSetup(setup: SuspensionSetup): void {
    this.setup = setup;
  }

  public reset(groundHeight: number = 0): void {
    this.initialized = false;
    for (const corner of CORNERS) {
      this.corners[corner] = createCornerState();
      this.previousGroundHeights[corner] = groundHeight;
    }
  }

  public update(input: SuspensionInput): SuspensionOutput {
    const dt = clamp(input.deltaTime, 1 / 240, 1 / 20);
    const targetLoads: Record<SuspensionCorner, number> = {
      frontLeft: Math.max(
        0,
        input.cornerLoadTargets.frontLeft - input.unsprungLoadPerCorner
      ),
      frontRight: Math.max(
        0,
        input.cornerLoadTargets.frontRight - input.unsprungLoadPerCorner
      ),
      rearLeft: Math.max(
        0,
        input.cornerLoadTargets.rearLeft - input.unsprungLoadPerCorner
      ),
      rearRight: Math.max(
        0,
        input.cornerLoadTargets.rearRight - input.unsprungLoadPerCorner
      )
    };

    // Corner heights arrive as bump residuals about the surface the car sits on, so
    // this is normally zero; it is still taken from the input rather than assumed,
    // so the model stays correct for any caller that hands it absolute heights.
    const averageGroundHeight =
      CORNERS.reduce((sum, corner) => sum + input.groundHeights[corner], 0) /
      CORNERS.length;

    for (const corner of CORNERS) {
      const isFront = corner === 'frontLeft' || corner === 'frontRight';
      const springRate = isFront
        ? this.setup.frontSpringRate
        : this.setup.rearSpringRate;
      const cornerMass =
        input.mass *
        (isFront
          ? input.frontWeightDistribution
          : 1.0 - input.frontWeightDistribution) *
        0.5;
      const groundVelocity =
        (input.groundHeights[corner] - this.previousGroundHeights[corner]) / dt;
      const roadDisplacement =
        input.groundHeights[corner] - averageGroundHeight;
      const targetCompression =
        targetLoads[corner] / Math.max(springRate, 1) +
        roadDisplacement;
      const state = this.corners[corner];
      if (!this.initialized) {
        state.compression = clamp(targetCompression, 0, this.setup.travel);
        state.velocity = 0;
        this.previousGroundHeights[corner] = input.groundHeights[corner];
      }
      const damping =
        state.velocity >= groundVelocity
          ? isFront
            ? this.setup.frontCompressionDamping
            : this.setup.rearCompressionDamping
          : isFront
            ? this.setup.frontReboundDamping
            : this.setup.rearReboundDamping;
      const suspensionAcceleration =
        ((targetCompression - state.compression) * springRate -
          (state.velocity - groundVelocity) * damping) /
        Math.max(cornerMass, 1);

      state.velocity += suspensionAcceleration * dt;
      state.compression += state.velocity * dt;

      const bumpStart = this.setup.travel * 0.78;
      const bumpCompression = Math.max(0, state.compression - bumpStart);
      const bumpForce = bumpCompression * bumpCompression * this.setup.bumpStopRate;
      state.compression = clamp(
        state.compression,
        -this.setup.travel * 0.18,
        this.setup.travel
      );
      state.contact = input.grounded && state.compression > -this.setup.travel * 0.15;
      state.normalLoad = state.contact
        ? Math.max(
            0,
            springRate * Math.max(0, state.compression) +
              damping * Math.max(-2.5, state.velocity - groundVelocity) +
              bumpForce +
              input.unsprungLoadPerCorner
          )
        : 0;
      this.previousGroundHeights[corner] = input.groundHeights[corner];
    }
    this.initialized = true;

    this.applyAntiRoll('frontLeft', 'frontRight', this.setup.frontAntiRollRate);
    this.applyAntiRoll('rearLeft', 'rearRight', this.setup.rearAntiRollRate);

    const frontLoad =
      this.corners.frontLeft.normalLoad + this.corners.frontRight.normalLoad;
    const rearLoad =
      this.corners.rearLeft.normalLoad + this.corners.rearRight.normalLoad;
    const frontLateralLoadTransfer =
      this.corners.frontRight.normalLoad - this.corners.frontLeft.normalLoad;
    const rearLateralLoadTransfer =
      this.corners.rearRight.normalLoad - this.corners.rearLeft.normalLoad;
    const leftCompression =
      (this.corners.frontLeft.compression + this.corners.rearLeft.compression) *
      0.5;
    const rightCompression =
      (this.corners.frontRight.compression + this.corners.rearRight.compression) *
      0.5;
    const frontCompression =
      (this.corners.frontLeft.compression + this.corners.frontRight.compression) *
      0.5;
    const rearCompression =
      (this.corners.rearLeft.compression + this.corners.rearRight.compression) *
      0.5;
    const frontGroundHeight =
      (input.groundHeights.frontLeft + input.groundHeights.frontRight) * 0.5;
    const rearGroundHeight =
      (input.groundHeights.rearLeft + input.groundHeights.rearRight) * 0.5;
    const leftGroundHeight =
      (input.groundHeights.frontLeft + input.groundHeights.rearLeft) * 0.5;
    const rightGroundHeight =
      (input.groundHeights.frontRight + input.groundHeights.rearRight) * 0.5;
    const frontBodyCompression =
      frontCompression - (frontGroundHeight - averageGroundHeight);
    const rearBodyCompression =
      rearCompression - (rearGroundHeight - averageGroundHeight);
    const leftBodyCompression =
      leftCompression - (leftGroundHeight - averageGroundHeight);
    const rightBodyCompression =
      rightCompression - (rightGroundHeight - averageGroundHeight);
    const averageCompression =
      (frontCompression + rearCompression) * 0.5;
    const staticFrontCompression =
      Math.max(
        0,
        input.staticFrontLoad * 0.5 - input.unsprungLoadPerCorner
      ) / Math.max(this.setup.frontSpringRate, 1);
    const staticRearCompression =
      Math.max(
        0,
        input.staticRearLoad * 0.5 - input.unsprungLoadPerCorner
      ) / Math.max(this.setup.rearSpringRate, 1);
    const staticAverageCompression =
      (staticFrontCompression + staticRearCompression) * 0.5;
    const referencePitchInertia =
      input.mass * input.wheelbase * input.wheelbase / 12;
    const referenceRollInertia =
      input.mass * input.trackWidth * input.trackWidth / 12;
    const pitchResponse = clamp(
      referencePitchInertia / Math.max(input.pitchInertia, 1),
      0.55,
      1.45
    );
    const rollResponse = clamp(
      referenceRollInertia / Math.max(input.rollInertia, 1),
      0.55,
      1.45
    );

    return {
      corners: this.corners,
      frontLoad,
      rearLoad,
      frontLateralTransfer: frontLateralLoadTransfer,
      rearLateralTransfer: rearLateralLoadTransfer,
      heave:
        (this.setup.rideHeight - 0.16) -
        (averageCompression - staticAverageCompression),
      pitch:
        Math.atan2(frontBodyCompression - rearBodyCompression, input.wheelbase) *
          pitchResponse,
      roll:
        Math.atan2(leftBodyCompression - rightBodyCompression, input.trackWidth) *
          rollResponse
    };
  }

  private applyAntiRoll(
    leftCorner: SuspensionCorner,
    rightCorner: SuspensionCorner,
    antiRollRate: number
  ): void {
    const left = this.corners[leftCorner];
    const right = this.corners[rightCorner];
    const antiRollForce = (left.compression - right.compression) * antiRollRate;

    // A roll bar twists between the two corners and pushes the more compressed
    // (outside) wheel down while lifting the less compressed one, so it adds load
    // to the compressed side. Stiffening one axle therefore raises that axle's
    // lateral load transfer and pushes the balance toward the other end.
    left.normalLoad = Math.max(0, left.normalLoad + antiRollForce);
    right.normalLoad = Math.max(0, right.normalLoad - antiRollForce);
  }
}
