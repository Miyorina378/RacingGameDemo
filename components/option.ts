export interface HUDConfig {
  showLap: boolean;
  showLength: boolean;
  showMap: boolean;
  showMirror: boolean;
  showLapTimer: boolean;
  showPosition: boolean;
  showStats: boolean;
  showSpeedometer: boolean;
  speedUnit?: 'kmh' | 'mph';
}

export const DEFAULT_HUD_CONFIG: HUDConfig = {
  showLap: true,
  showLength: true,
  showMap: true,
  showMirror: true,
  showLapTimer: true,
  showPosition: true,
  showStats: true,
  showSpeedometer: true,
  speedUnit: 'kmh',
};

export type DrivingMode = 'arcade' | 'simulation';

const STORAGE_KEYS = {
  HUD_CONFIG: 'cyberdrive_hud_config',
  MIRROR_TPS: 'cyberdrive_mirror_tps',
  SOUND_ENABLED: 'cyberdrive_sound_enabled',
  KEY_BINDINGS: 'cyberdrive_key_bindings',
  DRIVING_MODE: 'cyberdrive_driving_mode',
};

const isClient = typeof window !== 'undefined';

export function loadHUDConfig(): HUDConfig {
  if (!isClient) return DEFAULT_HUD_CONFIG;
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.HUD_CONFIG);
    return saved ? JSON.parse(saved) : DEFAULT_HUD_CONFIG;
  } catch (e) {
    return DEFAULT_HUD_CONFIG;
  }
}

export function saveHUDConfig(config: HUDConfig): void {
  if (!isClient) return;
  try {
    localStorage.setItem(STORAGE_KEYS.HUD_CONFIG, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save HUD config:', e);
  }
}

export function loadMirrorInTPS(): boolean {
  if (!isClient) return false;
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.MIRROR_TPS);
    return saved === 'true';
  } catch (e) {
    return false;
  }
}

export function saveMirrorInTPS(value: boolean): void {
  if (!isClient) return;
  try {
    localStorage.setItem(STORAGE_KEYS.MIRROR_TPS, String(value));
  } catch (e) {
    console.error('Failed to save TPS mirror option:', e);
  }
}

export function loadSoundEnabled(): boolean {
  if (!isClient) return true;
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED);
    return saved !== 'false';
  } catch (e) {
    return true;
  }
}

export function saveSoundEnabled(value: boolean): void {
  if (!isClient) return;
  try {
    localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, String(value));
  } catch (e) {
    console.error('Failed to save sound setting:', e);
  }
}

export interface KeyBindings {
  accelerate: string;
  brake: string;
  steerLeft: string;
  steerRight: string;
  handbrake: string;
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  accelerate: 'w',
  brake: 's',
  steerLeft: 'a',
  steerRight: 'd',
  handbrake: ' ',
};

export function loadKeyBindings(): KeyBindings {
  if (!isClient) return DEFAULT_KEY_BINDINGS;
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.KEY_BINDINGS);
    return saved ? JSON.parse(saved) : DEFAULT_KEY_BINDINGS;
  } catch (e) {
    return DEFAULT_KEY_BINDINGS;
  }
}

export function saveKeyBindings(bindings: KeyBindings): void {
  if (!isClient) return;
  try {
    localStorage.setItem(STORAGE_KEYS.KEY_BINDINGS, JSON.stringify(bindings));
  } catch (e) {
    console.error('Failed to save key bindings:', e);
  }
}

export function loadDrivingMode(): DrivingMode {
  if (!isClient) return 'simulation';
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.DRIVING_MODE);
    if (saved === 'arcade' || saved === 'simulation') return saved;
    return 'simulation';
  } catch (e) {
    return 'simulation';
  }
}

export function saveDrivingMode(mode: DrivingMode): void {
  if (!isClient) return;
  try {
    localStorage.setItem(STORAGE_KEYS.DRIVING_MODE, mode);
  } catch (e) {
    console.error('Failed to save driving mode:', e);
  }
}
