import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Dealer showroom contract. Each room is a closed round hall around the car (it
 * can be orbited from any side) with a turntable stage in the middle:
 *
 *   ShowroomLuxury.ts  black-and-bronze hall with a night city (race cars)
 *   ShowroomWhite.ts   bright white gallery with a daytime city (new and used)
 *   ShowroomKit.ts     shared placement, textures, trees and the mirror floor
 */

/** Top of the turntable stage in both rooms; the car's tyres sit on it. */
export const SHOWROOM_STAGE_TOP = 0.27;

export interface ShowroomRoom {
  group: THREE.Group;
  background: THREE.Color;
  ambientColor: number;
  ambientIntensity: number;
  /** Strength of the studio reflections on the car. */
  environmentIntensity: number;
  keyLight: THREE.SpotLight;
  keyIntensity: number;
  /** Bloom for this room: only the light strips and lamps should glow. */
  bloom: { threshold: number; strengthFactor: number };
  /** Recolours the accent light strips (theme or brand colour). */
  setAccent(color: number): void;
}

/** A neutral studio lighting probe for car paint, shared by both rooms. */
export const createStudioEnvironment = (renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget => {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
  pmrem.dispose();
  return target;
};
