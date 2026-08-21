/**
 * Sculptable terrain.
 *
 * The world used to be a flat plane with `getGroundHeight` returning 0 anywhere
 * off the road, so a track could climb to 35m with nothing underneath it. This
 * module is the height data behind the ground instead.
 *
 * Storage is sparse on purpose: a map is mostly untouched, and a dense grid over
 * a 2km course would be tens of thousands of floats to persist. Only cells that
 * were actually sculpted are kept, so a fresh track costs nothing.
 */

/** World units per heightmap cell. */
export const TERRAIN_CELL_SIZE = 10;

/**
 * Smallest brush worth offering. Heights exist only at cell centres, so a brush
 * narrower than one cell reaches a single cell at best — and a cursor sitting
 * between four of them can be up to half a cell diagonal (~7m) from the nearest,
 * which means a narrower brush would silently do nothing at all. Finer detail than
 * this needs a finer grid, not a smaller brush.
 */
export const MIN_TERRAIN_BRUSH_RADIUS = TERRAIN_CELL_SIZE;

/** Brush the editor opens with. Small enough to shape a hillside beside a road. */
export const DEFAULT_TERRAIN_BRUSH_RADIUS = 30;

/** Packing offset, so negative cell coordinates still make a positive key. */
const KEY_OFFSET = 4096;
const KEY_STRIDE = 8192;

/** Flat triples of col, row, height. Compact enough to sit in localStorage. */
export type TerrainData = number[];

export type TerrainBrush = 'raise' | 'lower' | 'smooth' | 'flatten';

/** Inclusive rectangle of cells, used to refresh only the part of the mesh that moved. */
export interface CellRect {
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
}

export const worldToCell = (v: number) => Math.round(v / TERRAIN_CELL_SIZE);
export const cellToWorld = (c: number) => c * TERRAIN_CELL_SIZE;

const packKey = (col: number, row: number) =>
  (col + KEY_OFFSET) * KEY_STRIDE + (row + KEY_OFFSET);

/** Smooth 1 at the centre falling to 0 at the rim, so dabs blend instead of stamping. */
const falloff = (distance: number, radius: number) => {
  if (radius <= 0) return 0;
  const t = 1 - Math.min(1, distance / radius);
  return t * t * (3 - 2 * t);
};

export class Heightmap {
  private cells = new Map<number, number>();

  get size() {
    return this.cells.size;
  }

  get isEmpty() {
    return this.cells.size === 0;
  }

  get(col: number, row: number): number {
    return this.cells.get(packKey(col, row)) ?? 0;
  }

  set(col: number, row: number, height: number) {
    // Cells back at zero are dropped rather than stored, so flattening terrain
    // gives the memory and the save file back.
    if (Math.abs(height) < 1e-4) this.cells.delete(packKey(col, row));
    else this.cells.set(packKey(col, row), height);
  }

  /** Bilinear height at a world position. This is what the car drives on. */
  sampleAt(x: number, z: number): number {
    if (this.cells.size === 0) return 0;
    const fx = x / TERRAIN_CELL_SIZE;
    const fz = z / TERRAIN_CELL_SIZE;
    const col = Math.floor(fx);
    const row = Math.floor(fz);
    const tx = fx - col;
    const tz = fz - row;

    const h00 = this.get(col, row);
    const h10 = this.get(col + 1, row);
    const h01 = this.get(col, row + 1);
    const h11 = this.get(col + 1, row + 1);

    const top = h00 + (h10 - h00) * tx;
    const bottom = h01 + (h11 - h01) * tx;
    return top + (bottom - top) * tz;
  }

  serialize(): TerrainData {
    const out: TerrainData = [];
    this.cells.forEach((height, key) => {
      const col = Math.floor(key / KEY_STRIDE) - KEY_OFFSET;
      const row = (key % KEY_STRIDE) - KEY_OFFSET;
      // Centimetre precision keeps the save small without anyone noticing.
      out.push(col, row, Math.round(height * 100) / 100);
    });
    return out;
  }

  static deserialize(data: TerrainData | undefined | null): Heightmap {
    const map = new Heightmap();
    if (!data) return map;
    for (let i = 0; i + 2 < data.length; i += 3) {
      map.set(data[i], data[i + 1], data[i + 2]);
    }
    return map;
  }

  clear() {
    this.cells.clear();
  }
}

export interface BrushOptions {
  brush: TerrainBrush;
  /** Brush centre in world space. */
  x: number;
  z: number;
  /** Radius in world units. */
  radius: number;
  /** Metres per dab for raise/lower, blend amount for smooth/flatten. */
  strength: number;
  /** Height that `flatten` pulls toward. Defaults to the height under the centre. */
  targetHeight?: number;
}

/** Cell rectangle a brush of this radius covers, clamped to nothing fancy. */
const rectFor = (x: number, z: number, radius: number): CellRect => ({
  minCol: worldToCell(x - radius) - 1,
  minRow: worldToCell(z - radius) - 1,
  maxCol: worldToCell(x + radius) + 1,
  maxRow: worldToCell(z + radius) + 1
});

/**
 * Applies one brush dab and returns the cells it touched, so the caller can
 * refresh just that patch of mesh rather than rebuilding the whole terrain.
 */
export const applyBrush = (map: Heightmap, options: BrushOptions): CellRect => {
  const { brush, x, z, radius, strength } = options;
  const rect = rectFor(x, z, radius);
  const target = options.targetHeight ?? map.sampleAt(x, z);

  // Smoothing has to read from a snapshot, or cells already visited this pass
  // would feed back into their neighbours and the result would depend on order.
  const before = brush === 'smooth' ? new Map<number, number>() : null;
  if (before) {
    for (let col = rect.minCol - 1; col <= rect.maxCol + 1; col++) {
      for (let row = rect.minRow - 1; row <= rect.maxRow + 1; row++) {
        before.set(packKey(col, row), map.get(col, row));
      }
    }
  }
  const readBefore = (col: number, row: number) =>
    before!.get(packKey(col, row)) ?? map.get(col, row);

  for (let col = rect.minCol; col <= rect.maxCol; col++) {
    for (let row = rect.minRow; row <= rect.maxRow; row++) {
      const dx = cellToWorld(col) - x;
      const dz = cellToWorld(row) - z;
      const weight = falloff(Math.hypot(dx, dz), radius);
      if (weight <= 0) continue;

      const current = map.get(col, row);
      if (brush === 'raise') {
        map.set(col, row, current + strength * weight);
      } else if (brush === 'lower') {
        map.set(col, row, current - strength * weight);
      } else if (brush === 'flatten') {
        map.set(col, row, current + (target - current) * Math.min(1, strength * weight));
      } else {
        const average =
          (readBefore(col - 1, row) +
            readBefore(col + 1, row) +
            readBefore(col, row - 1) +
            readBefore(col, row + 1)) /
          4;
        map.set(col, row, current + (average - current) * Math.min(1, strength * weight));
      }
    }
  }

  return rect;
};

/** What the road looks like at a world position, as far as terrain cares. */
export interface RoadProbe {
  /** Lateral distance from the road centreline. */
  distance: number;
  /** Road surface height there. */
  height: number;
}

export interface ConformOptions {
  /** Half-width of the flat shelf carved to road height. */
  corridor: number;
  /** Distance beyond the corridor over which terrain blends back to natural. */
  embankment: number;
  /** Cell rectangle to process. */
  bounds: CellRect;
}

/**
 * Cut-and-fill: carves a graded shelf at road height and ramps the sides back out
 * to whatever the terrain was already doing. This is what makes a road that
 * climbs to 30m actually sit in a hill rather than on a floating ribbon.
 */
export const conformToRoad = (
  map: Heightmap,
  probe: (x: number, z: number) => RoadProbe | null,
  options: ConformOptions
): CellRect => {
  const { corridor, embankment, bounds } = options;
  const reach = corridor + embankment;

  for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
    for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
      const x = cellToWorld(col);
      const z = cellToWorld(row);
      const hit = probe(x, z);
      if (!hit || hit.distance > reach) continue;

      if (hit.distance <= corridor) {
        map.set(col, row, hit.height);
        continue;
      }
      // Ease from road height at the corridor edge out to natural ground.
      const t = (hit.distance - corridor) / Math.max(embankment, 1e-6);
      const eased = t * t * (3 - 2 * t);
      const natural = map.get(col, row);
      map.set(col, row, hit.height + (natural - hit.height) * eased);
    }
  }

  return bounds;
};
