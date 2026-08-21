import { EditorNode, EditorScenery, TimeOfDay } from '../engine/types';

/**
 * Storage for many custom tracks.
 *
 * The editor used to write to a single localStorage slot, so there was exactly
 * one custom track and starting a second one overwrote the first. This keeps a
 * list instead, with one entry marked active for the editor to work on.
 */

const LIBRARY_KEY = 'cyberdrive_track_library';
/** The old single-track slot. Read once to migrate, then left alone as a backup. */
const LEGACY_KEY = 'cyberdrive_custom_track';

export interface SavedTrack {
  id: string;
  name: string;
  /** Epoch millis of the last write, for sorting and for showing "saved 2m ago". */
  updatedAt: number;
  nodes: EditorNode[];
  scenery: EditorScenery[];
  terrain: number[];
  roadWidth: number;
  timeLimit: number;
  hasObstacles: boolean;
  gridLimit: number;
  HaveGrass: boolean;
  GrassWidth: number;
  HaveCurb: boolean;
  HaveFence: boolean;
  time: TimeOfDay;
  fogDistance: number | null;
}

export interface TrackLibrary {
  version: number;
  activeId: string;
  tracks: SavedTrack[];
}

export const newTrackId = () =>
  `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const createEmptyTrack = (name: string): SavedTrack => ({
  id: newTrackId(),
  name,
  updatedAt: Date.now(),
  nodes: [],
  scenery: [],
  terrain: [],
  roadWidth: 18,
  timeLimit: 45,
  hasObstacles: false,
  gridLimit: 250,
  HaveGrass: true,
  GrassWidth: 6,
  HaveCurb: true,
  HaveFence: true,
  time: 'afternoon',
  fogDistance: null
});

/** Fills in anything an older save predates, so loading never lands on undefined. */
const normalize = (raw: Partial<SavedTrack>, fallbackName: string): SavedTrack => {
  const base = createEmptyTrack(raw.name || fallbackName);
  return {
    ...base,
    ...raw,
    id: raw.id || base.id,
    name: raw.name || fallbackName,
    updatedAt: raw.updatedAt ?? Date.now(),
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    scenery: Array.isArray(raw.scenery) ? raw.scenery : [],
    terrain: Array.isArray(raw.terrain) ? raw.terrain : [],
    fogDistance: raw.fogDistance ?? null
  };
};

export const loadLibrary = (): TrackLibrary => {
  if (typeof window === 'undefined') {
    const first = createEmptyTrack('Custom Gridway');
    return { version: 1, activeId: first.id, tracks: [first] };
  }

  try {
    const stored = localStorage.getItem(LIBRARY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as TrackLibrary;
      const tracks = (parsed.tracks || []).map((t) => normalize(t, 'Untitled Track'));
      if (tracks.length > 0) {
        const activeId = tracks.some((t) => t.id === parsed.activeId) ? parsed.activeId : tracks[0].id;
        return { version: 1, activeId, tracks };
      }
    }

    // First run after the upgrade: adopt whatever the single-slot editor had, so
    // an existing track carries over instead of quietly disappearing.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const adopted = normalize(JSON.parse(legacy), 'Custom Gridway');
      return { version: 1, activeId: adopted.id, tracks: [adopted] };
    }
  } catch {
    // Corrupt storage should not stop the editor opening.
  }

  const first = createEmptyTrack('Custom Gridway');
  return { version: 1, activeId: first.id, tracks: [first] };
};

export const saveLibrary = (library: TrackLibrary) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    // Quota exceeded, most likely from a heavily sculpted terrain.
  }
};

export const getActiveTrack = (library: TrackLibrary): SavedTrack =>
  library.tracks.find((t) => t.id === library.activeId) ?? library.tracks[0];

/** Replaces the active entry with `patch`, stamping the save time. */
export const writeActiveTrack = (
  library: TrackLibrary,
  patch: Omit<SavedTrack, 'id' | 'updatedAt'>
): TrackLibrary => ({
  ...library,
  tracks: library.tracks.map((t) =>
    t.id === library.activeId ? { ...patch, id: t.id, updatedAt: Date.now() } : t
  )
});

export const addTrack = (library: TrackLibrary, track: SavedTrack): TrackLibrary => ({
  ...library,
  activeId: track.id,
  tracks: [...library.tracks, track]
});

export const duplicateTrack = (library: TrackLibrary, id: string): TrackLibrary => {
  const source = library.tracks.find((t) => t.id === id);
  if (!source) return library;
  const copy: SavedTrack = {
    ...structuredClone(source),
    id: newTrackId(),
    name: `${source.name} copy`,
    updatedAt: Date.now()
  };
  return addTrack(library, copy);
};

export const removeTrack = (library: TrackLibrary, id: string): TrackLibrary => {
  const remaining = library.tracks.filter((t) => t.id !== id);
  // Never leave the editor with nothing to edit.
  if (remaining.length === 0) {
    const fresh = createEmptyTrack('Custom Gridway');
    return { ...library, activeId: fresh.id, tracks: [fresh] };
  }
  return {
    ...library,
    activeId: library.activeId === id ? remaining[0].id : library.activeId,
    tracks: remaining
  };
};
