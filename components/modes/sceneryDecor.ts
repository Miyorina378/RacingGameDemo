import * as THREE from 'three';
import { TimeOfDay } from '../engine/types';

/**
 * Shared look-and-feel helpers for track decoration.
 *
 * Two jobs: stop identical props from reading as wallpaper, and keep them in
 * step with the sky. Everything here is a pure function of position, so a tree
 * looks the same every time the track is rebuilt (including while dragging nodes
 * in the editor) rather than shuffling on each frame.
 */

/** Deterministic 0..1 value from a position. `salt` picks an independent channel. */
export const positionNoise = (x: number, z: number, salt: number) => {
  const n = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return n - Math.floor(n);
};

/** Deterministic value in [-1, 1]. */
const signedNoise = (x: number, z: number, salt: number) => positionNoise(x, z, salt) * 2 - 1;

export interface InstanceVariation {
  /** Radians of yaw, so props never all face the same way. */
  rotation: number;
  /** Slight lean, as if grown rather than placed. */
  tiltX: number;
  tiltZ: number;
  /** Per-axis scale multipliers around 1. */
  scaleXZ: number;
  scaleY: number;
  /** Hue/lightness offsets applied to the base colour. */
  hueShift: number;
  lightnessShift: number;
}

/**
 * Per-instance jitter for a prop at a given spot. `strength` scales the whole
 * effect, so buildings can stay near-uniform while foliage varies a lot.
 */
export const variationAt = (x: number, z: number, strength = 1): InstanceVariation => ({
  rotation: positionNoise(x, z, 1) * Math.PI * 2,
  tiltX: signedNoise(x, z, 2) * 0.07 * strength,
  tiltZ: signedNoise(x, z, 3) * 0.07 * strength,
  scaleXZ: 1 + signedNoise(x, z, 4) * 0.18 * strength,
  scaleY: 1 + signedNoise(x, z, 5) * 0.28 * strength,
  hueShift: signedNoise(x, z, 6) * 0.035 * strength,
  lightnessShift: signedNoise(x, z, 7) * 0.09 * strength
});

/** How each time of day pushes scenery colour, and how hard. */
const TIME_GRADE: Record<TimeOfDay, { tint: number; mix: number; lightness: number }> = {
  afternoon: { tint: 0xfff4e0, mix: 0.08, lightness: 1.0 },
  evening: { tint: 0xff9a5c, mix: 0.34, lightness: 0.82 },
  night: { tint: 0x2b3a6e, mix: 0.5, lightness: 0.42 }
};

/**
 * Pulls a base colour toward the ambient light of the given time of day, so a
 * night track stops rendering bright daylight-green trees.
 */
export const gradeColor = (base: THREE.ColorRepresentation, time: TimeOfDay, variation?: InstanceVariation) => {
  const grade = TIME_GRADE[time] ?? TIME_GRADE.afternoon;
  const color = new THREE.Color(base).lerp(new THREE.Color(grade.tint), grade.mix);

  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const hue = (hsl.h + (variation?.hueShift ?? 0) + 1) % 1;
  const lightness = THREE.MathUtils.clamp(
    hsl.l * grade.lightness + (variation?.lightnessShift ?? 0),
    0.02,
    0.98
  );
  return color.setHSL(hue, hsl.s, lightness);
};

/** How strongly emissive details (windows, signage) should read at this hour. */
export const emissiveStrengthFor = (time: TimeOfDay) =>
  time === 'night' ? 1.5 : time === 'evening' ? 0.7 : 0.12;

/** World units per window cell, so windows stay one real size on every building. */
const WINDOW_MODULE = 4;

let windowTexture: THREE.Texture | null = null;

/**
 * Facade texture for city blocks: a grid of windows with some lit. Built once
 * and shared, and used as both colour map and emissive map so the lit ones glow
 * at night without any extra geometry.
 */
export const getWindowTexture = (): THREE.Texture => {
  if (windowTexture) return windowTexture;

  const cols = 8;
  const rows = 16;
  const cell = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#12151f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Deterministic so the facade is identical on every rebuild.
        const lit = positionNoise(col, row, 11) > 0.45;
        const warm = positionNoise(col, row, 12);
        ctx.fillStyle = lit
          ? `rgb(255, ${Math.round(190 + warm * 50)}, ${Math.round(120 + warm * 90)})`
          : '#1a1e2c';
        ctx.fillRect(col * cell + 3, row * cell + 4, cell - 6, cell - 8);
      }
    }
  }

  windowTexture = new THREE.CanvasTexture(canvas);
  windowTexture.wrapS = THREE.RepeatWrapping;
  windowTexture.wrapT = THREE.RepeatWrapping;
  windowTexture.colorSpace = THREE.SRGBColorSpace;
  return windowTexture;
};

/**
 * Box geometry whose UVs tile by real-world size rather than 0..1 per face, so a
 * tall tower gets more window rows instead of stretched ones. `uvOffset` shifts
 * the pattern so neighbouring blocks do not share an identical lit-window layout.
 *
 * BoxGeometry face order is +X, -X, +Y, -Y, +Z, -Z with 4 vertices each.
 */
export const makeBuildingGeometry = (
  width: number,
  height: number,
  depth: number,
  uvOffset = 0
) => {
  const geom = new THREE.BoxGeometry(width, height, depth);
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  const spans: Array<[number, number]> = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height]
  ];

  for (let face = 0; face < 6; face++) {
    const repeatU = Math.max(1, Math.round(spans[face][0] / WINDOW_MODULE));
    const repeatV = Math.max(1, Math.round(spans[face][1] / WINDOW_MODULE));
    for (let corner = 0; corner < 4; corner++) {
      const i = face * 4 + corner;
      uv.setXY(i, uv.getX(i) * repeatU + uvOffset, uv.getY(i) * repeatV + uvOffset);
    }
  }
  uv.needsUpdate = true;
  return geom;
};

/** Default horizon distance per time of day, used when a track sets none. */
export const DEFAULT_FOG_DISTANCE: Record<TimeOfDay, number> = {
  afternoon: 720,
  evening: 620,
  night: 460
};

/** Sky clear colour per time of day; fog matches it so the horizon dissolves cleanly. */
export const SKY_COLOR: Record<TimeOfDay, number> = {
  afternoon: 0x87ceeb,
  evening: 0xff7f50,
  night: 0x0a0a14
};
