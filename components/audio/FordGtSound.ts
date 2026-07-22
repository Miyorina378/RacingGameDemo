export interface FordGtSoundTelemetry {
  active: boolean;
  rpm: number;
  speedKmh: number;
  throttle: number;
  brake: number;
  gear: number;
  isShifting: boolean;
}

interface FordGtAudioGraph {
  ctx: AudioContext;
  master: GainNode;
  engineGain: GainNode;
  brakeGain: GainNode;
  lowOsc: OscillatorNode;
  highOsc: OscillatorNode;
  pulseOsc: OscillatorNode;
  lowGain: GainNode;
  highGain: GainNode;
  pulseGain: GainNode;
  exhaustFilter: BiquadFilterNode;
  distortion: WaveShaperNode;
  brakeNoise: AudioBufferSourceNode;
  brakeFilter: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
}

type WebAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(
    new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT)
  );
  const drive = Math.max(1, amount);

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] =
      ((3 + drive) * x * 20 * (Math.PI / 180)) /
      (Math.PI + drive * Math.abs(x));
  }

  return curve;
}

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < sampleCount; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

export class FordGtSound {
  private graph: FordGtAudioGraph | null = null;
  private lastThrottle = 0;
  private lastGear = 1;
  private lastIsShifting = false;
  private lastRpm = 1000;
  private lastBrake = 0;
  private lastPopAt = 0;
  private lastBrakeChirpAt = 0;

  public resume(): void {
    void this.graph?.ctx.resume();
  }

  public update(telemetry: FordGtSoundTelemetry): void {
    const graph = this.ensureGraph();
    if (!graph) return;

    const ctx = graph.ctx;
    const now = ctx.currentTime;
    const rpm = clamp(telemetry.rpm, 750, 6800);
    const rev = rpm / 6500;
    const throttle = clamp(telemetry.throttle, 0, 1);
    const brake = clamp(telemetry.brake, 0, 1);
    const speedBlend = clamp(telemetry.speedKmh / 260, 0, 1);
    const activeLevel = telemetry.active ? 1 : 0;

    const firingPulse = (rpm / 60) * 4;
    const exhaustFundamental = clamp(firingPulse * 0.24, 34, 190);
    graph.lowOsc.frequency.setTargetAtTime(exhaustFundamental, now, 0.035);
    graph.highOsc.frequency.setTargetAtTime(exhaustFundamental * 2.02, now, 0.035);
    graph.pulseOsc.frequency.setTargetAtTime(exhaustFundamental * 0.51, now, 0.045);

    graph.lowGain.gain.setTargetAtTime(0.44 + throttle * 0.22, now, 0.055);
    graph.highGain.gain.setTargetAtTime(0.08 + rev * 0.18 + throttle * 0.24, now, 0.045);
    graph.pulseGain.gain.setTargetAtTime(0.20 + throttle * 0.28, now, 0.05);
    graph.exhaustFilter.frequency.setTargetAtTime(
      520 + rev * 2100 + throttle * 1300,
      now,
      0.06
    );
    graph.exhaustFilter.Q.setTargetAtTime(0.8 + throttle * 1.35, now, 0.08);

    const engineLevel =
      activeLevel *
      (0.018 + rev * 0.035 + throttle * 0.16 + speedBlend * 0.028);
    graph.engineGain.gain.setTargetAtTime(engineLevel, now, 0.07);
    graph.master.gain.setTargetAtTime(activeLevel * 0.45, now, 0.12);

    const brakingNoise =
      activeLevel *
      (brake > 0.08 && telemetry.speedKmh > 18
        ? (0.015 + brake * 0.075) * clamp(telemetry.speedKmh / 120, 0, 1)
        : 0);
    graph.brakeGain.gain.setTargetAtTime(brakingNoise, now, 0.035);
    graph.brakeFilter.frequency.setTargetAtTime(
      1700 + brake * 3200 + speedBlend * 1500,
      now,
      0.04
    );

    const throttleDrop = this.lastThrottle - throttle;
    if (
      telemetry.active &&
      throttleDrop > 0.34 &&
      this.lastRpm > 2600 &&
      now - this.lastPopAt > 0.16
    ) {
      this.playLiftOffBurble(Math.min(1, throttleDrop + rev * 0.45));
      this.lastPopAt = now;
    }

    const shiftStarted = telemetry.isShifting && !this.lastIsShifting;
    const gearChanged = telemetry.gear !== this.lastGear;
    if (telemetry.active && (shiftStarted || gearChanged)) {
      this.playShiftThunk(Math.min(1, 0.45 + rev * 0.55));
    }

    if (
      telemetry.active &&
      brake > 0.35 &&
      this.lastBrake <= 0.35 &&
      telemetry.speedKmh > 35 &&
      now - this.lastBrakeChirpAt > 0.35
    ) {
      this.playBrakeChirp(Math.min(1, brake + speedBlend * 0.35));
      this.lastBrakeChirpAt = now;
    }

    this.lastThrottle = throttle;
    this.lastGear = telemetry.gear;
    this.lastIsShifting = telemetry.isShifting;
    this.lastRpm = rpm;
    this.lastBrake = brake;
  }

  public dispose(): void {
    if (!this.graph) return;

    const { ctx, lowOsc, highOsc, pulseOsc, brakeNoise } = this.graph;
    lowOsc.stop();
    highOsc.stop();
    pulseOsc.stop();
    brakeNoise.stop();
    void ctx.close();
    this.graph = null;
  }

  private ensureGraph(): FordGtAudioGraph | null {
    if (this.graph) return this.graph;
    if (typeof window === 'undefined') return null;

    const audioWindow = window as WebAudioWindow;
    const AudioContextCtor =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextCtor) return null;

    const ctx = new AudioContextCtor();
    const master = ctx.createGain();
    const engineGain = ctx.createGain();
    const brakeGain = ctx.createGain();
    const lowOsc = ctx.createOscillator();
    const highOsc = ctx.createOscillator();
    const pulseOsc = ctx.createOscillator();
    const lowGain = ctx.createGain();
    const highGain = ctx.createGain();
    const pulseGain = ctx.createGain();
    const exhaustFilter = ctx.createBiquadFilter();
    const distortion = ctx.createWaveShaper();
    const brakeNoise = ctx.createBufferSource();
    const brakeFilter = ctx.createBiquadFilter();
    const compressor = ctx.createDynamicsCompressor();

    master.gain.value = 0;
    engineGain.gain.value = 0;
    brakeGain.gain.value = 0;
    lowGain.gain.value = 0.4;
    highGain.gain.value = 0.12;
    pulseGain.gain.value = 0.22;
    lowOsc.type = 'sawtooth';
    highOsc.type = 'square';
    pulseOsc.type = 'triangle';
    exhaustFilter.type = 'lowpass';
    exhaustFilter.frequency.value = 900;
    exhaustFilter.Q.value = 0.9;
    distortion.curve = makeDistortionCurve(18);
    distortion.oversample = '2x';
    brakeNoise.buffer = createNoiseBuffer(ctx, 1.0);
    brakeNoise.loop = true;
    brakeFilter.type = 'bandpass';
    brakeFilter.frequency.value = 2600;
    brakeFilter.Q.value = 8.5;
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.18;

    lowOsc.connect(lowGain);
    highOsc.connect(highGain);
    pulseOsc.connect(pulseGain);
    lowGain.connect(exhaustFilter);
    highGain.connect(exhaustFilter);
    pulseGain.connect(exhaustFilter);
    exhaustFilter.connect(distortion);
    distortion.connect(engineGain);
    engineGain.connect(master);
    brakeNoise.connect(brakeFilter);
    brakeFilter.connect(brakeGain);
    brakeGain.connect(master);
    master.connect(compressor);
    compressor.connect(ctx.destination);

    lowOsc.start();
    highOsc.start();
    pulseOsc.start();
    brakeNoise.start();

    this.graph = {
      ctx,
      master,
      engineGain,
      brakeGain,
      lowOsc,
      highOsc,
      pulseOsc,
      lowGain,
      highGain,
      pulseGain,
      exhaustFilter,
      distortion,
      brakeNoise,
      brakeFilter,
      compressor
    };
    return this.graph;
  }

  private playLiftOffBurble(intensity: number): void {
    const graph = this.graph;
    if (!graph) return;

    const count = intensity > 0.72 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      this.playPop(0.055 + i * 0.075, intensity * (1 - i * 0.16));
    }
  }

  private playPop(delay: number, intensity: number): void {
    const graph = this.graph;
    if (!graph) return;

    const { ctx, master } = graph;
    const now = ctx.currentTime + delay;
    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();
    const popFilter = ctx.createBiquadFilter();
    const popNoise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();

    popOsc.type = 'sawtooth';
    popOsc.frequency.setValueAtTime(86 + intensity * 65, now);
    popOsc.frequency.exponentialRampToValueAtTime(42 + intensity * 20, now + 0.075);
    popGain.gain.setValueAtTime(0.0001, now);
    popGain.gain.exponentialRampToValueAtTime(0.10 * intensity + 0.025, now + 0.012);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    popFilter.type = 'lowpass';
    popFilter.frequency.value = 850 + intensity * 850;
    popNoise.buffer = createNoiseBuffer(ctx, 0.16);
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.032 * intensity, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.105);

    popOsc.connect(popGain);
    popGain.connect(popFilter);
    popFilter.connect(master);
    popNoise.connect(noiseGain);
    noiseGain.connect(popFilter);
    popOsc.start(now);
    popNoise.start(now);
    popOsc.stop(now + 0.14);
    popNoise.stop(now + 0.14);
  }

  private playShiftThunk(intensity: number): void {
    const graph = this.graph;
    if (!graph) return;

    const { ctx, master, engineGain } = graph;
    const now = ctx.currentTime;
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    const chuff = ctx.createBufferSource();
    const chuffGain = ctx.createGain();
    const chuffFilter = ctx.createBiquadFilter();

    engineGain.gain.cancelScheduledValues(now);
    engineGain.gain.setTargetAtTime(0.01, now, 0.018);
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(145 + intensity * 85, now);
    thump.frequency.exponentialRampToValueAtTime(55, now + 0.09);
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.105 * intensity, now + 0.012);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    chuff.buffer = createNoiseBuffer(ctx, 0.13);
    chuffFilter.type = 'bandpass';
    chuffFilter.frequency.value = 650;
    chuffFilter.Q.value = 2.2;
    chuffGain.gain.setValueAtTime(0.0001, now);
    chuffGain.gain.exponentialRampToValueAtTime(0.052 * intensity, now + 0.01);
    chuffGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    thump.connect(thumpGain);
    thumpGain.connect(master);
    chuff.connect(chuffFilter);
    chuffFilter.connect(chuffGain);
    chuffGain.connect(master);
    thump.start(now);
    chuff.start(now);
    thump.stop(now + 0.14);
    chuff.stop(now + 0.13);
  }

  private playBrakeChirp(intensity: number): void {
    const graph = this.graph;
    if (!graph) return;

    const { ctx, master } = graph;
    const now = ctx.currentTime;
    const squeal = ctx.createOscillator();
    const squealGain = ctx.createGain();
    const squealFilter = ctx.createBiquadFilter();

    squeal.type = 'sine';
    squeal.frequency.setValueAtTime(2500 + intensity * 1550, now);
    squeal.frequency.linearRampToValueAtTime(2100 + intensity * 900, now + 0.17);
    squealFilter.type = 'bandpass';
    squealFilter.frequency.value = 3000;
    squealFilter.Q.value = 12;
    squealGain.gain.setValueAtTime(0.0001, now);
    squealGain.gain.exponentialRampToValueAtTime(0.035 * intensity, now + 0.018);
    squealGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    squeal.connect(squealFilter);
    squealFilter.connect(squealGain);
    squealGain.connect(master);
    squeal.start(now);
    squeal.stop(now + 0.22);
  }
}
