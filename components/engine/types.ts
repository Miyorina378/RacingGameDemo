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
  onRaceTimeUpdate?: (totalTime: number, bestLapTime: number, currentLapTime: number) => void;
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
}

export interface EditorScenery {
  type: 'tree' | 'tree1' | 'tree2' | 'tree3' | 'rock' | 'mountain' | 'hill' | 'podium';
  x: number;
  z: number;
  scale: number;
  heightScale?: number;
  rotation?: number;
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
