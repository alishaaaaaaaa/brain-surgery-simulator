/**
 * All sounds are synthesized with the Web Audio API (no audio files).
 * The AudioContext can only start after a user gesture, so `unlock()` is called from the
 * start button.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private doppler?: { filter: BiquadFilterNode; gain: GainNode };
  private suction?: { filter: BiquadFilterNode; gain: GainNode };
  muted = false;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return; // audio unavailable — the simulator still works silently
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    // Two seconds of white noise, looped by the continuous voices.
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start();
    return src;
  }

  /**
   * Micro-Doppler: the probe hears blood velocity as a pitched "whoosh" rising and falling
   * with every heartbeat. `level` 0..1 is contact × flow; `pulse` is the arterial waveform.
   * No flow (clipped or occluded vessel) → silence.
   */
  setDoppler(level: number, pulse: number, turbulent = false): void {
    if (!this.ctx) return;
    if (!this.doppler) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 3;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.loopNoise().connect(filter).connect(gain).connect(this.master);
      this.doppler = { filter, gain };
    }
    const t = this.ctx.currentTime;
    // Systolic velocity → higher Doppler shift frequency.
    const freq = 280 + 1300 * pulse + (turbulent ? 250 * Math.random() : 0);
    this.doppler.filter.frequency.setTargetAtTime(freq, t, 0.012);
    this.doppler.filter.Q.setTargetAtTime(turbulent ? 1.2 : 3, t, 0.05);
    this.doppler.gain.gain.setTargetAtTime(level * (0.12 + 0.9 * pulse) * 0.9, t, 0.015);
  }

  /** Suction hiss; louder and lower ("slurp") while aspirating fluid. */
  setSuction(active: boolean, aspirating: boolean): void {
    if (!this.ctx) return;
    if (!this.suction) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.7;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.loopNoise().connect(filter).connect(gain).connect(this.master);
      this.suction = { filter, gain };
    }
    const t = this.ctx.currentTime;
    const target = !active ? 0 : aspirating ? 0.22 : 0.07;
    this.suction.gain.gain.setTargetAtTime(target, t, 0.04);
    const f = aspirating ? 700 + Math.random() * 500 : 3500;
    this.suction.filter.frequency.setTargetAtTime(f, t, 0.03);
  }

  private burst(duration: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.02);
  }

  private tone(freq: number, duration: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.02);
  }

  snip(): void {
    this.burst(0.05, 5200, 2.5, 0.5);
  }

  /** Bipolar coagulation: the generator's buzz plus a faint sizzle. */
  buzz(): void {
    this.tone(160, 0.35, 0.08, 'sawtooth');
    this.tone(320, 0.35, 0.04, 'square');
    this.burst(0.35, 2500, 0.8, 0.12);
  }

  click(): void {
    this.burst(0.03, 3000, 4, 0.5);
    this.burst(0.04, 1800, 4, 0.35);
  }

  /** Soft two-tone cue for a caution message. */
  caution(): void {
    this.tone(660, 0.12, 0.07);
    this.tone(520, 0.16, 0.07, 'sine', 0.13);
  }
}
