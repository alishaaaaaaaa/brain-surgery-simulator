import { events } from './events';

/**
 * Arterial pressure waveform over one cardiac cycle, normalised to roughly 0..1.
 * Phase 0 = start of systole. Shape: fast systolic upstroke, exponential diastolic
 * run-off, and a small dicrotic notch/wave when the aortic valve closes.
 */
export function pulseWaveform(phase: number): number {
  const p = phase - Math.floor(phase);
  const upstroke = 0.12;
  let v: number;
  if (p < upstroke) {
    v = Math.sin(((p / upstroke) * Math.PI) / 2);
  } else {
    v = Math.exp(-(p - upstroke) * 3.2);
  }
  // Dicrotic notch (dip) followed by the dicrotic wave (bump).
  v -= 0.1 * Math.exp(-(((p - 0.33) / 0.025) ** 2));
  v += 0.08 * Math.exp(-(((p - 0.4) / 0.05) ** 2));
  // Diastole ends near exp(-3.1) ≈ 0.045; rescale so the trough sits at ~0.
  return Math.min(1, Math.max(0, (v - 0.04) / 0.96));
}

/** Heart clock: advances the cardiac phase from the current heart rate. */
export class Heart {
  rate: number;
  phase = 0;
  /** Current normalised pulse value (0..1) for driving pulsation. */
  pulse = 0;

  constructor(rate: number) {
    this.rate = rate;
  }

  update(dt: number): void {
    this.phase += (dt * this.rate) / 60;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      events.emit('heartbeat', { rate: this.rate });
    }
    this.pulse = pulseWaveform(this.phase);
  }
}
