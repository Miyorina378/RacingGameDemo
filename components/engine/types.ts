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
  | 'construction';

export type TimeOfDay = 'afternoon' | 'evening' | 'night';

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

export interface EditorState {
  nodes: EditorNode[];
  scenery: EditorScenery[];
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
  terrainBrush: 'raise' | 'lower' | 'smooth' | 'flatten';
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
    tool: 'node',
    snapToGrid: 10,
    gridLimit: 250,
    sceneryFreeMove: true,
    editLayer: 'track',
    terrainBrush: 'raise',
    terrainBrushRadius: DEFAULT_TERRAIN_BRUSH_RADIUS,
    terrainBrushStrength: 1.5,
    onTerrainChange: null,
    cornerHeight: 2,
    selectedNodeIndex: null,
    selectedSceneryIndex: null,
    roadWidth: 18,
    activeMode: 'garage',
    onUpdateNodes: null,
    onUpdateScenery: null,
    onSelectNode: null,
    onSelectScenery: null,
    onDragNodeStart: null,
    onDragNodeEnd: null,
    onDragSceneryStart: null,
    onDragSceneryEnd: null,
  };
}
