import * as THREE from 'three';
import { TrackConfig, TrackNode } from '../config/TrackDatabase';

/**
 * Resolves a track's raw path into fully defaulted per-node values.
 *
 * Everything that rebuilds the centreline — the road mesh, the AI racing line,
 * the gear advisor and the minimap — must resolve nodes through here, otherwise
 * they disagree about where the road actually goes on sharp corners.
 */

export const CURB_WIDTH = 1.5;
export const DEFAULT_GRASS_WIDTH = 5.0;

export interface ResolvedTrackNode {
  pos: THREE.Vector3;
  width: number;
  banking: number;
  leftCurb: boolean;
  rightCurb: boolean;
  leftGrassWidth: number;
  rightGrassWidth: number;
  leftFence: boolean;
  rightFence: boolean;
  sharp: boolean;
  cornerRadius?: number;
  /**
   * Half-extent of everything bolted to the road at this node: half the road,
   * plus curb, plus grass. The fence sits exactly here, so this is the distance
   * a corner has to stay clear of to avoid the sides colliding with themselves.
   */
  reach: number;
}

const isTrackVector = (point: THREE.Vector3 | TrackNode): point is THREE.Vector3 =>
  point instanceof THREE.Vector3 || 'isVector3' in point;

export const resolveTrackNodes = (config: TrackConfig): ResolvedTrackNode[] => {
  const trackCurb = config.HaveCrub ?? false;
  const trackFence = config.HaveFence;
  const trackGrass = (config.HaveGrass ?? false) ? config.GrassWidth ?? DEFAULT_GRASS_WIDTH : 0;

  return config.path.map((point) => {
    const tn = isTrackVector(point) ? null : (point as TrackNode);

    const bothCurb = tn?.curb ?? trackCurb;
    const bothGrass = tn?.grassWidth ?? trackGrass;
    const bothFence = tn?.fence ?? trackFence;

    const width = tn?.width ?? config.roadWidth;
    const leftCurb = tn?.leftCurb ?? bothCurb;
    const rightCurb = tn?.rightCurb ?? bothCurb;
    const leftGrassWidth = Math.max(0, tn?.leftGrassWidth ?? bothGrass);
    const rightGrassWidth = Math.max(0, tn?.rightGrassWidth ?? bothGrass);

    return {
      pos: tn ? tn.pos : (point as THREE.Vector3),
      width,
      banking: tn?.banking ?? 0,
      leftCurb,
      rightCurb,
      leftGrassWidth,
      rightGrassWidth,
      leftFence: tn?.leftFence ?? bothFence,
      rightFence: tn?.rightFence ?? bothFence,
      sharp: tn?.sharp ?? false,
      cornerRadius: tn?.cornerRadius,
      reach: Math.max(
        width / 2 + (leftCurb ? CURB_WIDTH : 0) + leftGrassWidth,
        width / 2 + (rightCurb ? CURB_WIDTH : 0) + rightGrassWidth
      )
    };
  });
};
