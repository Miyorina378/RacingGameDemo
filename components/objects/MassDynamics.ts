export type MassCorner = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';
export type EngineLayout = 'front' | 'front_mid' | 'mid' | 'rear';

export interface CenterOfGravity {
  x: number;
  y: number;
  z: number;
}

export interface InertiaTensor {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface MassProperties {
  totalMass: number;
  sprungMass: number;
  unsprungMassPerWheel: number;
  centerOfGravity: CenterOfGravity;
  inertia: InertiaTensor;
  frontWeightDistribution: number;
  engineLayout: EngineLayout;
}

export interface MassDynamicsConfig {
  totalMass: number;
  wheelbase: number;
  trackWidth: number;
  cgHeight: number;
  frontWeightDistribution: number;
  engineLayout?: EngineLayout;
  massConcentration?: number;
  yawInertiaOverride?: number;
  unsprungMassPerWheel?: number;
}

export interface LoadTransferInput {
  gravity: number;
  longitudinalAcceleration: number;
  lateralAcceleration: number;
}

export interface LoadTransferOutput {
  cornerLoads: Record<MassCorner, number>;
  frontLoad: number;
  rearLoad: number;
  frontLateralTransfer: number;
  rearLateralTransfer: number;
  longitudinalTransfer: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function inferEngineLayout(frontWeightDistribution: number): EngineLayout {
  if (frontWeightDistribution >= 0.56) return 'front';
  if (frontWeightDistribution >= 0.50) return 'front_mid';
  if (frontWeightDistribution >= 0.43) return 'mid';
  return 'rear';
}

function getLayoutConcentration(layout: EngineLayout): number {
  if (layout === 'mid') return 0.84;
  if (layout === 'front_mid') return 0.94;
  if (layout === 'rear') return 0.91;
  return 1.05;
}

export class MassDynamics {
  private properties: MassProperties;

  constructor(config: MassDynamicsConfig) {
    this.properties = this.calculateProperties(config);
  }

  public configure(config: MassDynamicsConfig): MassProperties {
    this.properties = this.calculateProperties(config);
    return this.properties;
  }

  public getProperties(): MassProperties {
    return this.properties;
  }

  public calculateLoadTransfer(input: LoadTransferInput): LoadTransferOutput {
    const properties = this.properties;
    const totalWeight = properties.totalMass * input.gravity;
    const staticFront = totalWeight * properties.frontWeightDistribution;
    const staticRear = totalWeight - staticFront;
    const wheelbase = Math.max(0.1, this.wheelbase);
    const trackWidth = Math.max(0.1, this.trackWidth);
    const longitudinalTransfer =
      (properties.sprungMass *
        input.longitudinalAcceleration *
        properties.centerOfGravity.y) /
      wheelbase;
    // Lateral load transfer opposes the lateral acceleration. Cornering toward the
    // +right side unloads the right-hand (inside) tires and loads the left-hand
    // (outside) tires, so the transfer carries the opposite sign to a_y.
    const lateralTransfer =
      -(properties.sprungMass *
        input.lateralAcceleration *
        properties.centerOfGravity.y) /
      trackWidth;

    const frontLoad = clamp(
      staticFront - longitudinalTransfer,
      staticFront * 0.08,
      totalWeight - staticRear * 0.08
    );
    const rearLoad = totalWeight - frontLoad;
    const frontShare = frontLoad / Math.max(totalWeight, 1);
    const rearShare = rearLoad / Math.max(totalWeight, 1);
    const frontLateralTransfer = lateralTransfer * frontShare;
    const rearLateralTransfer = lateralTransfer * rearShare;

    const cornerLoads: Record<MassCorner, number> = {
      frontLeft: Math.max(0, frontLoad * 0.5 - frontLateralTransfer * 0.5),
      frontRight: Math.max(0, frontLoad * 0.5 + frontLateralTransfer * 0.5),
      rearLeft: Math.max(0, rearLoad * 0.5 - rearLateralTransfer * 0.5),
      rearRight: Math.max(0, rearLoad * 0.5 + rearLateralTransfer * 0.5)
    };

    return {
      cornerLoads,
      frontLoad,
      rearLoad,
      frontLateralTransfer,
      rearLateralTransfer,
      longitudinalTransfer
    };
  }

  private wheelbase = 2.6;
  private trackWidth = 1.6;

  private calculateProperties(config: MassDynamicsConfig): MassProperties {
    this.wheelbase = Math.max(0.5, config.wheelbase);
    this.trackWidth = Math.max(0.5, config.trackWidth);

    const totalMass = Math.max(100, config.totalMass);
    const unsprungMassPerWheel =
      config.unsprungMassPerWheel ??
      clamp(totalMass * 0.032, 24, 48);
    const sprungMass = Math.max(
      totalMass * 0.65,
      totalMass - unsprungMassPerWheel * 4
    );
    const frontWeightDistribution = clamp(
      config.frontWeightDistribution,
      0.32,
      0.68
    );
    const engineLayout =
      config.engineLayout ?? inferEngineLayout(frontWeightDistribution);
    const layoutConcentration =
      config.massConcentration ?? getLayoutConcentration(engineLayout);
    const bodyLength = this.wheelbase * 1.12;
    const bodyWidth = this.trackWidth * 0.92;
    const bodyHeight = Math.max(0.55, config.cgHeight * 1.65);
    const weightBiasSpread =
      1.0 + Math.abs(frontWeightDistribution - 0.5) * 1.2;

    const calculatedYaw =
      (sprungMass * (bodyLength * bodyLength + bodyWidth * bodyWidth)) /
      12 *
      layoutConcentration *
      weightBiasSpread;
    const calculatedPitch =
      (sprungMass * (bodyLength * bodyLength + bodyHeight * bodyHeight)) /
      12 *
      layoutConcentration;
    const calculatedRoll =
      (sprungMass * (bodyWidth * bodyWidth + bodyHeight * bodyHeight)) /
      12 *
      (0.92 + layoutConcentration * 0.08);
    const unsprungYaw =
      unsprungMassPerWheel *
      (this.wheelbase * this.wheelbase + this.trackWidth * this.trackWidth);

    return {
      totalMass,
      sprungMass,
      unsprungMassPerWheel,
      centerOfGravity: {
        x: 0,
        y: Math.max(0.18, config.cgHeight),
        z: (frontWeightDistribution - 0.5) * this.wheelbase
      },
      inertia: {
        yaw: config.yawInertiaOverride ?? calculatedYaw + unsprungYaw,
        pitch: calculatedPitch + unsprungYaw * 0.55,
        roll:
          calculatedRoll +
          unsprungMassPerWheel * this.trackWidth * this.trackWidth
      },
      frontWeightDistribution,
      engineLayout
    };
  }
}
