import { DEFAULT_TERRAIN_BRUSH_RADIUS } from '../modes/terrain';

export type GameModeName = 'garage' | 'free_roam' | 'license' | 'race' | 'tutorial' | 'editor';

export type GameStatus = 'idle' | 'countdown' | 'playing' | 'success' | 'failed';

export interface SuggestedGearAdvice {
  suggestedGear: number;
  targetSpeedKmh: number;
  distanceToCorner: number;
  severity: number;
  tooFast: boolean;
}

export interface EngineCallbacks {
  onSpeedChange: (speed: number) => void;
  onDriftScoreChange: (score: number, multiplier: number) => void;
  onCreditsChange: (credits: number) => void;
  onTimerChange: (secondsRemaining: number) => void;
  onCheckpointChange: (activeCheckpoint: number, totalCheckpoints: number) => void;
  onGameStatus: (status: GameStatus, message?: string, results?: unknown[]) => void;
  onDriftCompleted: (earnedCredits: number) => void;
  onPlacementChange?: (placement: number, totalParticipants: number) => void;
  onVehicleStatsChange?: (
    speed: number,
    rpm: number,
    gear: number,
    isShifting: boolean,
    throttle: number,
    brake: number,
    fuelLiters: number,
    fuelCapacityLiters: number,
    fuelConsumptionLitersPerHour: number,
    isEngineStalled: boolean,
    tireWear?: number,
    tireTemperature?: number,
    tireCompound?: string,
    tireWearEnabled?: boolean
  ) => void;
  onSuggestedGearChange?: (advice: SuggestedGearAdvice | null) => void;
  onRaceTimeUpdate?: (totalTime: number, bestLapTime: number, currentLapTime: number, isWrongWay?: boolean, isCheat?: boolean) => void;
  onCarLoading?: (loading: boolean, progress: number) => void;
}

export interface KeyBindings {
  accelerate: string;
  brake: string;
  steerLeft: string;
  steerRight: string;
  handbrake: string;
}

export interface EditorNode {
  x: number;
  z: number;
  y?: number;
  width?: number;
  banking?: number;
  /** Break the smooth spline here so the two adjacent runs meet as a hard corner. */
  sharp?: boolean;
  /** How far back from the vertex the corner fillet starts. Only used when sharp. */
  cornerRadius?: number;
  // Per-side overrides. Unset means inherit the track-wide default.
  leftCurb?: boolean;
  rightCurb?: boolean;
  leftFence?: boolean;
  rightFence?: boolean;
  leftGrassWidth?: number;
  rightGrassWidth?: number;
  /**
   * Which course variations use this node. Omit for "all of them", so a track only
   * needs tagging where a short and a long version actually diverge.
   */
  layouts?: string[];
}

/**
 * Nodes closer together than this produce erratic spline tangents, which the road
 * mesh can only compensate for by pinching its own width down (see the self-
 * intersection scaling in BaseMode.createRacetrackRoad). Keeping a floor on the
 * spacing is what stops that from happening in the first place.
 */
export const getMinNodeSpacing = (roadWidth: number) =>
  Math.max(6, roadWidth * 0.75);

/** Every placeable decoration. Declared once here; everything else imports it. */
export type SceneryType =
  | 'tree'
  | 'tree1'
  | 'tree2'
  | 'tree3'
  | 'rock'
  | 'mountain'
  | 'hill'
  | 'podium'
  | 'building'
  | 'house'
  | 'construction'
  /**
   * Free-standing patch of grass. Decoration only: it never touches the grip or
   * boundary bands, which is what lets grass be placed away from the road.
   */
  | 'grass_patch';

export type TimeOfDay = 'afternoon' | 'evening' | 'night';

/** Brushes that move the heightmap. */
export type TerrainHeightBrush = 'raise' | 'lower' | 'smooth' | 'flatten';

/**
 * Everything the ground brush can do. Grass painting shares the terrain layer's
 * ring cursor and hidden pointer, because it is the same gesture: drag over the
 * ground and something happens under the ring.
 */
export type EditorBrush = TerrainHeightBrush | 'grass' | 'grass_erase';

export const isTerrainHeightBrush = (brush: EditorBrush): brush is TerrainHeightBrush =>
  brush === 'raise' || brush === 'lower' || brush === 'smooth' || brush === 'flatten';

export interface EditorScenery {
  type: SceneryType;
  x: number;
  z: number;
  /** Elevation above the ground plane. Omit to sit on the ground. */
  y?: number;
  scale: number;
  heightScale?: number;
  /** Footprint depth relative to width. Buildings only; 1 is square. */
  depthScale?: number;
  rotation?: number;
  /** Silhouette index. Omit to pick one deterministically from the position. */
  variant?: number;
}

export const DEFAULT_ENGINE_KEY_BINDINGS: KeyBindings = {
  accelerate: 'w',
  brake: 's',
  steerLeft: 'a',
  steerRight: 'd',
  handbrake: ' ',
};

/**
 * A blocked-off branch drawn in the editor: an open run of points leaving the
 * circuit. Kept separate from the lap's nodes, because it must never reach the road
 * builder's centreline — see BaseMode.createSpurRoads.
 */
export interface EditorSpur {
  /**
   * Track node this branch leaves from. Set from the nearest node on the first
   * click, or chosen explicitly in the editor.
   */
  nodeIndex?: number;
  /**
   * Track node this branch connects to at the far end to close the loop.
   */
  endNodeIndex?: number;
  /** Spur index this branch leaves from. */
  startSpurIndex?: number;
  /** Spur index this branch connects to at the far end. */
  endSpurIndex?: number;
  /** Points along the branch. The junctions themselves are not repeated. */
  nodes: { x: number; z: number; y?: number }[];
  width?: number;
  /** Per-side curb overrides. Unset inherits the track-wide curb setting. */
  leftCurb?: boolean;
  rightCurb?: boolean;
  /** Per-side fence overrides. Unset inherits the track-wide fence setting. */
  leftFence?: boolean;
  rightFence?: boolean;
  /** Per-side grass width in metres. Unset inherits the track-wide grass width. */
  leftGrassWidth?: number;
  rightGrassWidth?: number;
  /**
   * `terrain` (and old saves with no value) follows live ground. `authored` uses
   * each spur point's y value, which is what Lift/Drape write.
   */
  elevationMode?: 'terrain' | 'authored';
  /** Barrier across the dead end. Defaults to blocked if end is open, false if loop closed. */
  blocked?: boolean;
  /** Explicit closure across the sampled start, including an attached junction. */
  blockedStart?: boolean;
  /** Explicit closure across the sampled end, including an attached junction. */
  blockedEnd?: boolean;
  /**
   * Courses that race down this branch rather than the stretch of lap it bypasses.
   * Needs both ends on the track, since a course still has to close. Empty or missing
   * leaves the branch as scenery you can drive onto but never race.
   */
  raceLayouts?: string[];
}

const remapRemovedIndex = (value: number | undefined, removedIndex: number) => {
  if (value === undefined || value === removedIndex) return undefined;
  return value > removedIndex ? value - 1 : value;
};

/** Removes one branch and keeps every branch-to-branch attachment on the same target. */
export const removeEditorSpurAt = (spurs: EditorSpur[], removedIndex: number): EditorSpur[] =>
  spurs
    .filter((_, index) => index !== removedIndex)
    .map((spur) => {
      const lostEnd = spur.endSpurIndex === removedIndex;
      return {
        ...spur,
        startSpurIndex: remapRemovedIndex(spur.startSpurIndex, removedIndex),
        endSpurIndex: remapRemovedIndex(spur.endSpurIndex, removedIndex),
        blocked: lostEnd ? true : spur.blocked
      };
    });

/** Removes a handle, removing/remapping the whole branch if that was its last one. */
export const removeEditorSpurPointAt = (
  spurs: EditorSpur[],
  spurIndex: number,
  pointIndex: number
): EditorSpur[] => {
  const next = spurs.map((spur, index) =>
    index === spurIndex
      ? { ...spur, nodes: spur.nodes.filter((_, point) => point !== pointIndex) }
      : spur
  );
  return next[spurIndex]?.nodes.length ? next : removeEditorSpurAt(next, spurIndex);
};

/** Keeps node-index attachments stable when a track node is inserted. */
export const remapEditorSpursForInsertedNode = (
  spurs: EditorSpur[],
  insertedIndex: number
): EditorSpur[] =>
  spurs.map((spur) => ({
    ...spur,
    nodeIndex:
      spur.nodeIndex !== undefined && spur.nodeIndex >= insertedIndex
        ? spur.nodeIndex + 1
        : spur.nodeIndex,
    endNodeIndex:
      spur.endNodeIndex !== undefined && spur.endNodeIndex >= insertedIndex
        ? spur.endNodeIndex + 1
        : spur.endNodeIndex
  }));

/** Clears an attachment to a deleted node and shifts all later node references down. */
export const remapEditorSpursForRemovedNode = (
  spurs: EditorSpur[],
  removedIndex: number
): EditorSpur[] =>
  spurs.map((spur) => {
    const lostStart = spur.nodeIndex === removedIndex;
    const lostEnd = spur.endNodeIndex === removedIndex;
    const lostRaceEndpoint = lostStart || lostEnd;
    return {
      ...spur,
      nodeIndex: remapRemovedIndex(spur.nodeIndex, removedIndex),
      endNodeIndex: remapRemovedIndex(spur.endNodeIndex, removedIndex),
      blocked: lostEnd ? true : spur.blocked,
      // A raced branch requires two track endpoints. Keeping its assignment after
      // either endpoint disappears advertises a course the resolver cannot build.
      raceLayouts: lostRaceEndpoint ? undefined : spur.raceLayouts
    };
  });

/** One layout has one alternate road; assigning it here removes it from the others. */
export const setEditorSpurRacedInLayout = (
  spurs: EditorSpur[],
  spurIndex: number,
  layoutId: string,
  raced: boolean
): EditorSpur[] =>
  spurs.map((spur, index) => {
    const current = spur.raceLayouts ?? [];
    const next =
      index === spurIndex && raced
        ? [...current.filter((id) => id !== layoutId), layoutId]
        : current.filter((id) => id !== layoutId);
    return {
      ...spur,
      raceLayouts: next.length > 0 ? next : undefined
    };
  });

export interface EditorState {
  nodes: EditorNode[];
  scenery: EditorScenery[];
  spurs: EditorSpur[];
  /** Spur that new points are appended to, and whose settings the panel edits. */
  activeSpurIndex: number | null;
  /** Which spur point is selected, as a spur index and a point index. */
  selectedSpurPoint: { spur: number; point: number } | null;
  tool: string;
  snapToGrid: number;
  /**
   * Half-extent of the placeable map in world units. Kept separate from
   * snapToGrid: the bound used to be derived from the snap size, so turning
   * snapping off collapsed the bound to zero and pinned everything to the origin.
   */
  gridLimit: number;
  /**
   * When true, decoration ignores the track grid snap so it can be positioned
   * anywhere. Track nodes always keep snapping.
   */
  sceneryFreeMove: boolean;
  /** Which editor surface is being edited: track nodes, decoration, or terrain. */
  editLayer: 'track' | 'decorate' | 'terrain';
  /**
   * Layout the editor viewport is previewing. null shows every node, which is what
   * you want while laying a course out; picking one shows that variation only.
   */
  previewLayoutId: string | null;
  terrainBrush: EditorBrush;
  terrainBrushRadius: number;
  terrainBrushStrength: number;
  /** Fires after a sculpt stroke so React can persist the new heightmap. */
  onTerrainChange: (() => void) | null;
  cornerHeight: number;
  selectedNodeIndex: number | null;
  selectedSceneryIndex: number | null;
  roadWidth: number;
  activeMode: string;
  onUpdateNodes: ((nodes: EditorNode[]) => void) | null;
  onUpdateScenery: ((scenery: EditorScenery[]) => void) | null;
  onUpdateSpurs: ((spurs: EditorSpur[]) => void) | null;
  onSelectSpurPoint: ((selection: { spur: number; point: number } | null) => void) | null;
  onSelectNode: ((idx: number | null) => void) | null;
  onSelectScenery: ((idx: number | null) => void) | null;
  onDragNodeStart: ((idx: number) => void) | null;
  onDragNodeEnd: (() => void) | null;
  onDragSceneryStart: ((idx: number) => void) | null;
  onDragSceneryEnd: (() => void) | null;
}

export function createDefaultEditorState(): EditorState {
  return {
    nodes: [],
    scenery: [],
    spurs: [],
    activeSpurIndex: null,
    selectedSpurPoint: null,
    tool: 'node',
    snapToGrid: 10,
    gridLimit: 250,
    sceneryFreeMove: true,
    editLayer: 'track',
    previewLayoutId: null,
    terrainBrush: 'raise',
    terrainBrushRadius: DEFAULT_TERRAIN_BRUSH_RADIUS,
    terrainBrushStrength: 0.1,
    onTerrainChange: null,
    cornerHeight: 2,
    selectedNodeIndex: null,
    selectedSceneryIndex: null,
    roadWidth: 18,
    activeMode: 'garage',
    onUpdateNodes: null,
    onUpdateScenery: null,
    onUpdateSpurs: null,
    onSelectSpurPoint: null,
    onSelectNode: null,
    onSelectScenery: null,
    onDragNodeStart: null,
    onDragNodeEnd: null,
    onDragSceneryStart: null,
    onDragSceneryEnd: null,
  };
}
