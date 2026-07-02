// All audio is synthesized live with WebAudio: an upbeat 16-step jungle
// groove for music, plus one-shot effects. No audio files.

const MUTE_KEY = 'banana-run-muted';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private schedulerId: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private musicPlaying = false;
  muted: boolean;

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
  }

  /** Call from a user gesture (browsers block audio before one). */
  ensureContext(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.4;
    this.musicBus.connect(this.master);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    if (this.master && this.ctx) {
      this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.55, this.ctx.currentTime + 0.1);
    }
  }

  // ---------------------------------------------------------------- music

  startMusic(): void {
    this.ensureContext();
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.schedulerId = window.setInterval(() => this.schedule(), 30);
  }

  stopMusic(): void {
    this.musicPlaying = false;
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private schedule(): void {
    if (!this.ctx || !this.musicPlaying) return;
    const stepDur = 60 / 138 / 2; // 138bpm, 8th notes
    // If the tab slept for a long time, jump ahead instead of replaying
    // every missed step.
    if (this.ctx.currentTime - this.nextStepTime > 1) {
      this.nextStepTime = this.ctx.currentTime + 0.06;
    }
    let guard = 0;
    while (this.nextStepTime < this.ctx.currentTime + 0.14 && guard++ < 32) {
      this.playStep(this.step % 32, this.nextStepTime);
      this.nextStepTime += stepDur;
      this.step++;
    }
  }

  private playStep(s: number, t: number): void {
    // C major pentatonic bounce over a I-vi-IV-V feel.
    const bassLine = [48, 48, 55, 48, 45, 45, 52, 45, 41, 41, 48, 41, 43, 43, 50, 47];
    const melodyA = [72, -1, 76, -1, 79, 76, 81, 79, 76, -1, 72, 74, 76, -1, 74, 72];
    const melodyB = [79, -1, 76, 79, 84, -1, 81, 79, 81, 79, 76, -1, 74, 76, 72, -1];
    const bar = s >> 4;
    const i = s & 15;

    if (i % 4 === 0) this.kick(t);
    if (i % 4 === 2) this.hat(t, 0.5);
    else if (i % 2 === 1) this.hat(t, 0.22);
    if (i % 8 === 4) this.snare(t);

    this.note(this.midi(bassLine[i] ?? 48), t, 0.18, 'triangle', 0.3, 500);
    const melody = bar === 0 ? melodyA : melodyB;
    const m = melody[i] ?? -1;
    if (m > 0) this.note(this.midi(m), t, 0.16, 'square', 0.1, 2600);
    if (i === 0) {
      // Chord stab on the downbeat.
      const roots = [60, 57, 53, 55];
      const root = roots[bar % 2 === 0 ? 0 : 3] ?? 60;
      for (const iv of [0, 4, 7]) this.note(this.midi(root + iv), t, 0.32, 'sawtooth', 0.035, 1200);
    }
  }

  private midi(n: number): number {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  // ------------------------------------------------------------ synthesis

  private note(
    freq: number,
    t: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    filterFreq: number,
    bus: GainNode | null = this.musicBus
  ): void {
    if (!this.ctx || !bus) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter).connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private kick(t: number): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g).connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  private noiseBurst(t: number, dur: number, gain: number, filterFreq: number, bus: GainNode): void {
    if (!this.ctx) return;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(bus);
    src.start(t);
  }

  private hat(t: number, gain: number): void {
    if (this.musicBus) this.noiseBurst(t, 0.04, gain * 0.14, 7000, this.musicBus);
  }

  private snare(t: number): void {
    if (this.musicBus) this.noiseBurst(t, 0.12, 0.16, 1800, this.musicBus);
  }

  // ------------------------------------------------------------------ sfx

  /** Rising pitch with the combo counter — collecting streaks sounds great. */
  collect(combo: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const semis = Math.min(combo, 12);
    const freq = 660 * Math.pow(2, semis / 12);
    this.note(freq, t, 0.12, 'square', 0.14, 6000, this.master);
    this.note(freq * 2, t + 0.03, 0.1, 'sine', 0.1, 8000, this.master);
  }

  jump(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(750, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.25);
    this.noiseBurst(t, 0.15, 0.05, 2500, this.master);
  }

  countdownBeep(final: boolean): void {
    this.ensureContext();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.note(final ? 880 : 440, t, final ? 0.5 : 0.16, 'square', 0.14, 4000, this.master);
    if (final) this.note(1320, t + 0.08, 0.4, 'square', 0.08, 5000, this.master);
  }

  timeWarning(): void {
    if (!this.ctx || !this.master) return;
    this.note(990, this.ctx.currentTime, 0.09, 'square', 0.09, 5000, this.master);
  }

  uiClick(): void {
    this.ensureContext();
    if (!this.ctx || !this.master) return;
    this.note(520, this.ctx.currentTime, 0.07, 'triangle', 0.14, 3000, this.master);
  }

  fanfare(): void {
    this.ensureContext();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const seq = [60, 64, 67, 72, 76, 79, 84];
    seq.forEach((n, i) => {
      this.note(this.midi(n), t + i * 0.09, 0.3, 'square', 0.1, 4500, this.master);
    });
    for (const iv of [0, 4, 7, 12]) {
      this.note(this.midi(72 + iv), t + seq.length * 0.09, 1.1, 'sawtooth', 0.06, 3000, this.master);
    }
    this.noiseBurst(t + seq.length * 0.09, 0.5, 0.08, 3000, this.master);
  }
}
