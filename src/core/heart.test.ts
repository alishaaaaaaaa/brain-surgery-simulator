import { describe, expect, it } from 'vitest';
import { pulseWaveform } from './heart';

describe('pulseWaveform', () => {
  it('stays within 0..1 and peaks early in the cycle (systole)', () => {
    let max = -1, argmax = 0, min = 2;
    for (let i = 0; i < 1000; i++) {
      const v = pulseWaveform(i / 1000);
      max = Math.max(max, v);
      if (v === max) argmax = i / 1000;
      min = Math.min(min, v);
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
    expect(max).toBeGreaterThan(0.9);
    expect(argmax).toBeLessThan(0.2);
  });
  it('is periodic', () => {
    expect(pulseWaveform(0.3)).toBeCloseTo(pulseWaveform(1.3), 10);
  });
});
