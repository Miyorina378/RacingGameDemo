import { GameModeName, KeyBindings } from './types';

interface InputControllerOptions {
  keys: { [key: string]: boolean };
  getKeyBindings: () => KeyBindings;
  getActiveMode: () => GameModeName;
  isPaused: () => boolean;
  resetCar: () => void;
  toggleCameraView: () => void;
}

const DEFAULT_DRIVING_KEYS = ['w', 's', 'a', 'd', ' '];
const DEFAULT_DRIVING_KEY_MAP: Record<string, string[]> = {
  w: ['w'],
  s: ['s'],
  a: ['a'],
  d: ['d'],
  ' ': [' ', 'space', 'spacebar']
};

export class InputController {
  private options: InputControllerOptions;
  private connected = false;

  constructor(options: InputControllerOptions) {
    this.options = options;
  }

  public connect() {
    if (this.connected || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    this.connected = true;
  }

  public disconnect() {
    if (!this.connected || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.connected = false;
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    const keyLower = event.key.toLowerCase();
    this.mapDrivingKey(keyLower, true);

    if (keyLower === 'r' && this.options.getActiveMode() !== 'garage' && !this.options.isPaused()) {
      this.options.resetCar();
    }

    if (keyLower === 'z' && this.options.getActiveMode() !== 'garage' && !this.options.isPaused()) {
      this.options.toggleCameraView();
    }
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    this.mapDrivingKey(event.key.toLowerCase(), false);
  };

  private mapDrivingKey(keyLower: string, pressed: boolean) {
    const bindings = this.options.getKeyBindings();
    const keys = this.options.keys;
    let isReboundDrivingKey = false;

    if (keyLower === bindings.accelerate.toLowerCase()) {
      keys.w = pressed;
      isReboundDrivingKey = true;
    }
    if (keyLower === bindings.brake.toLowerCase()) {
      keys.s = pressed;
      isReboundDrivingKey = true;
    }
    if (keyLower === bindings.steerLeft.toLowerCase()) {
      keys.a = pressed;
      isReboundDrivingKey = true;
    }
    if (keyLower === bindings.steerRight.toLowerCase()) {
      keys.d = pressed;
      isReboundDrivingKey = true;
    }
    if (keyLower === bindings.handbrake.toLowerCase()) {
      keys[' '] = pressed;
      keys.space = pressed;
      keys.spacebar = pressed;
      isReboundDrivingKey = true;
    }

    if (DEFAULT_DRIVING_KEYS.includes(keyLower) && !isReboundDrivingKey) {
      for (const canonicalKey of DEFAULT_DRIVING_KEY_MAP[keyLower] ?? [keyLower]) {
        keys[canonicalKey] = pressed;
      }
    }

    keys[keyLower] = pressed;
  }
}
