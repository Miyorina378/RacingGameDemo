/**
 * TireCompound — Defines the 5 tire compound types and their characteristics.
 *
 * Softer compounds grip harder but degrade faster.
 * Wear accumulates based on speed, cornering load, and braking intensity.
 * Grip penalty follows a "cliff" curve: tires are fine until ~30% wear,
 * then rapidly lose performance — matching real racing tire behavior.
 */

export type TireCompoundType = 'economy' | 'super_hard' | 'hard' | 'normal' | 'soft' | 'super_soft';

export interface TireCompoundConfig {
  id: TireCompoundType;
  name: string;
  gripMultiplier: number;   // Multiplied into tire force calculations (base = 1.0)
  wearRate: number;          // Multiplier on base wear speed (base = 1.0 for 'normal')
  colorHex: string;          // Visual indicator color
  colorLabel: string;        // UI display label
}

export interface TireState {
  compound: TireCompoundType;
  wear: number;              // 0.0 (fresh) → 1.0 (destroyed)
}

/**
 * All 5 compound configurations.
 * Ordered from hardest (least grip, most durable) to softest (most grip, least durable).
 */
export const TIRE_COMPOUNDS: Record<TireCompoundType, TireCompoundConfig> = {
  economy: {
    id: 'economy',
    name: 'Economy',
    gripMultiplier: 1.50,
    wearRate: 0.10,
    colorHex: '#6b7280',
    colorLabel: 'Gray'
  },
  super_hard: {
    id: 'super_hard',
    name: 'Super Hard',
    gripMultiplier: 1.64, // 2x boost for simcade feel
    wearRate: 0.15,
    colorHex: '#e5e7eb',
    colorLabel: 'White'
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    gripMultiplier: 1.80, // 2x boost
    wearRate: 0.35,
    colorHex: '#3b82f6',
    colorLabel: 'Blue'
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    gripMultiplier: 2.00, // 2x boost
    wearRate: 1.00,
    colorHex: '#eab308',
    colorLabel: 'Yellow'
  },
  soft: {
    id: 'soft',
    name: 'Soft',
    gripMultiplier: 2.24, // 2x boost
    wearRate: 2.00,
    colorHex: '#ef4444',
    colorLabel: 'Red'
  },
  super_soft: {
    id: 'super_soft',
    name: 'Super Soft',
    gripMultiplier: 2.44, // 2x boost
    wearRate: 3.50,
    colorHex: '#a855f7',
    colorLabel: 'Purple'
  }
};

/**
 * Smoothstep interpolation helper.
 * Returns 0 when x <= edge0, 1 when x >= edge1, smooth curve in between.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Get the grip penalty for a given wear level.
 *
 * Tires perform at full grip until ~30% wear, then progressively lose
 * up to 35% grip at full wear. This creates a realistic "cliff" where
 * tires feel fine until they suddenly start falling off.
 *
 * @param wear - Current wear level (0.0 = fresh, 1.0 = destroyed)
 * @returns Grip penalty as a multiplier reduction (0.0 = no penalty, 0.35 = max penalty)
 */
export function getWearGripPenalty(wear: number): number {
  return smoothstep(0.3, 1.0, wear) * 0.35;
}

/**
 * Compute the effective grip coefficient for a tire, combining compound and wear.
 *
 * @param compound - The tire compound type
 * @param wear     - Current wear level (0.0–1.0)
 * @param surfaceGrip - Surface grip modifier (1.0 = tarmac, 0.4 = grass, etc.)
 * @returns Effective grip coefficient to feed into TireModel force calculations
 */
export function getEffectiveGrip(
  compound: TireCompoundType,
  wear: number,
  surfaceGrip: number = 1.0
): number {
  const config = TIRE_COMPOUNDS[compound] || TIRE_COMPOUNDS['normal'];
  const wearPenalty = getWearGripPenalty(wear);
  return config.gripMultiplier * (1.0 - wearPenalty) * surfaceGrip;
}

/**
 * Accumulate tire wear for one frame.
 *
 * Wear increases based on:
 * - Speed factor: faster driving = more wear
 * - Cornering load: higher slip angles eat tires
 * - Braking intensity: heavy braking wears tires
 * - Compound softness: softer compounds degrade faster
 *
 * @param state       - Current tire state (mutated in-place)
 * @param compound    - Compound type
 * @param speedRatio  - abs(speed) / maxSpeed (0–1)
 * @param slipAngle   - Current average slip angle (radians, absolute)
 * @param brakeForce  - Braking intensity (0–1)
 * @param deltaTime   - Frame delta time (seconds)
 */
export function accumulateWear(
  state: TireState,
  speedRatio: number,
  slipAngle: number,
  brakeForce: number,
  deltaTime: number
): void {
  const config = TIRE_COMPOUNDS[state.compound] || TIRE_COMPOUNDS['normal'];

  // Base wear rate: ~0.001 per second at full speed, normal compound
  const baseWearPerSecond = 0.001;

  const speedFactor = Math.max(0.1, Math.min(1.0, speedRatio));
  const corneringLoad = 1.0 + Math.abs(slipAngle) * 2.0;
  const brakingLoad = 1.0 + brakeForce * 0.5;

  const wearDelta = baseWearPerSecond * config.wearRate * speedFactor * corneringLoad * brakingLoad * deltaTime;

  state.wear = Math.min(1.0, state.wear + wearDelta);
}

/**
 * Create a fresh tire state for a given compound.
 */
export function createFreshTireState(compound: TireCompoundType = 'normal'): TireState {
  return {
    compound,
    wear: 0
  };
}
