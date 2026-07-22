type WebAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

interface ProceduralTrackGraph {
  ctx: AudioContext;
  master: GainNode;
  delay: DelayNode;
  feedback: GainNode;
  filter: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
}

const NOTES = {
  c2: 65.41,
  d2: 73.42,
  eb2: 77.78,
  f2: 87.31,
  g2: 98.0,
  ab2: 103.83,
  bb2: 116.54,
  c3: 130.81,
  d3: 146.83,
  eb3: 155.56,
  f3: 174.61,
  g3: 196.0,
  ab3: 207.65,
  bb3: 233.08,
  c4: 261.63,
  d4: 293.66,
  eb4: 311.13,
  f4: 349.23,
  g4: 392.0,
  ab4: 415.3,
  bb4: 466.16,
  c5: 523.25
};

const BASS_PATTERN = [
  NOTES.c2,
  NOTES.c2,
  NOTES.bb2,
  NOTES.g2,
  NOTES.ab2,
  NOTES.ab2,
  NOTES.bb2,
  NOTES.eb2
];

const LEAD_PATTERN = [
  NOTES.g4,
  0,
  NOTES.bb4,
  NOTES.c5,
  NOTES.eb4,
  0,
  NOTES.d4,
  NOTES.bb4,
  NOTES.c4,
  0,
  NOTES.eb4,
  NOTES.f4,
  NOTES.d4,
  0,
  NOTES.bb3,
  NOTES.g3
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;

  const audioWindow = window as WebAudioWindow;
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

export class ProceduralTrack {
  private graph: ProceduralTrackGraph | null = null;
  private stepTimer: number | null = null;
  private fadeTimer: number | null = null;
  private step = 0;
  private targetVolume = 0;
  private playing = false;
  private readonly stepMs = 150;

  public get isPlaying(): boolean {
    return this.playing;
  }

  public resume(): void {
    void this.graph?.ctx.resume();
  }

  public play(volume: number): void {
    const graph = this.ensureGraph();
    if (!graph) return;

    void graph.ctx.resume();
    this.playing = true;
    this.setVolume(volume, 900);

    if (this.stepTimer === null) {
      this.stepTimer = window.setInterval(() => this.tick(), this.stepMs);
      this.tick();
    }
  }

  public setVolume(volume: number, fadeMs: number = 0): void {
    const graph = this.ensureGraph();
    if (!graph) return;

    this.clearFade();
    this.targetVolume = clamp(volume, 0, 1);

    if (fadeMs <= 0) {
      graph.master.gain.value = this.targetVolume;
      return;
    }

    const startedAt = performance.now();
    const startVolume = graph.master.gain.value;
    this.fadeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / fadeMs);
      graph.master.gain.value =
        startVolume + (this.targetVolume - startVolume) * progress;
      if (progress >= 1) {
        this.clearFade();
      }
    }, 40);
  }

  public pause(): void {
    if (!this.graph) return;

    this.playing = false;
    this.clearStepTimer();
    this.setVolume(0, 250);
  }

  public dispose(): void {
    this.clearFade();
    this.clearStepTimer();
    if (!this.graph) return;

    void this.graph.ctx.close();
    this.graph = null;
    this.playing = false;
  }

  private ensureGraph(): ProceduralTrackGraph | null {
    if (this.graph) return this.graph;

    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) return null;

    const ctx = new AudioContextCtor();
    const master = ctx.createGain();
    const delay = ctx.createDelay(0.55);
    const feedback = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const compressor = ctx.createDynamicsCompressor();

    master.gain.value = 0;
    delay.delayTime.value = 0.28;
    feedback.gain.value = 0.22;
    filter.type = 'lowpass';
    filter.frequency.value = 6200;
    filter.Q.value = 0.7;
    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.22;

    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(filter);
    master.connect(filter);
    filter.connect(compressor);
    compressor.connect(ctx.destination);

    this.graph = {
      ctx,
      master,
      delay,
      feedback,
      filter,
      compressor
    };

    return this.graph;
  }

  private tick(): void {
    if (!this.graph || !this.playing) return;

    const step = this.step % 32;
    const now = this.graph.ctx.currentTime;

    if (step % 4 === 0) {
      this.playKick(now);
    }

    if (step % 8 === 4) {
      this.playNoiseHat(now, 0.035, 5600);
    }

    this.playBass(now, BASS_PATTERN[Math.floor(step / 4) % BASS_PATTERN.length]);

    const leadFreq = LEAD_PATTERN[step % LEAD_PATTERN.length];
    if (leadFreq > 0 && step % 2 === 0) {
      this.playLead(now, leadFreq);
    }

    this.step += 1;
  }

  private playBass(now: number, frequency: number): void {
    if (!this.graph) return;

    const osc = this.graph.ctx.createOscillator();
    const gain = this.graph.ctx.createGain();
    const filter = this.graph.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(190, now);
    filter.frequency.exponentialRampToValueAtTime(680, now + 0.03);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.18);
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.graph.master);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  private playLead(now: number, frequency: number): void {
    if (!this.graph) return;

    const osc = this.graph.ctx.createOscillator();
    const gain = this.graph.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.setTargetAtTime(frequency * 1.004, now + 0.02, 0.06);
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.graph.delay);
    gain.connect(this.graph.master);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  private playKick(now: number): void {
    if (!this.graph) return;

    const osc = this.graph.ctx.createOscillator();
    const gain = this.graph.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, now);
    osc.frequency.exponentialRampToValueAtTime(44, now + 0.11);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.graph.master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  private playNoiseHat(now: number, duration: number, cutoff: number): void {
    if (!this.graph) return;

    const sampleCount = Math.max(1, Math.floor(this.graph.ctx.sampleRate * duration));
    const buffer = this.graph.ctx.createBuffer(1, sampleCount, this.graph.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.graph.ctx.createBufferSource();
    const filter = this.graph.ctx.createBiquadFilter();
    const gain = this.graph.ctx.createGain();

    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.graph.master);
    source.start(now);
    source.stop(now + duration);
  }

  private clearStepTimer(): void {
    if (this.stepTimer !== null) {
      window.clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
  }

  private clearFade(): void {
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }
}
