import { describe, expect, it } from 'vitest';
import { sim } from '../config/sim';
import { events } from '../core/events';
import { Physiology, type PhysiologyInputs } from './physiology';

const calm: PhysiologyInputs = { ebl: 0, bleedRate: 0, occlusionSeconds: 0, perforatorIschemia: 0 };

function simulate(p: Physiology, seconds: number, inp: (t: number) => PhysiologyInputs) {
  for (let t = 0; t < seconds; t += 0.1) p.update(0.1, inp(t));
}

describe('Physiology', () => {
  it('holds the baseline when nothing happens', () => {
    const p = new Physiology();
    p.noisy = false;
    simulate(p, 60, () => calm);
    const b = sim.physiology.baseline;
    expect(p.hr).toBeCloseTo(b.hr, 0);
    expect(p.sbp).toBeCloseTo(b.sbp, 0);
    expect(p.mep).toBeCloseTo(100, 0);
  });

  it('bleeding drops blood pressure and raises heart rate', () => {
    const p = new Physiology();
    p.noisy = false;
    // A rupture: 4 mL/s for 90 s ≈ 360 mL, plus the acute effect while it bleeds.
    simulate(p, 90, (t) => ({ ...calm, ebl: 4 * t, bleedRate: 4 }));
    expect(p.map).toBeLessThan(75);
    expect(p.hr).toBeGreaterThan(sim.physiology.baseline.hr + 15);
  });

  it('a large loss triggers the low-MAP alarm', () => {
    const p = new Physiology();
    p.noisy = false;
    const alarms: string[] = [];
    const off = events.on('alarm', (e) => e.active && alarms.push(e.id));
    simulate(p, 60, () => ({ ...calm, ebl: 1400, bleedRate: 4 }));
    expect(alarms).toContain('mapLow');
    off();
  });

  it('MEPs tolerate a short temporary occlusion, then fall below 50 % and recover after release', () => {
    const p = new Physiology();
    p.noisy = false;
    simulate(p, 100, (t) => ({ ...calm, occlusionSeconds: t }));
    expect(p.mep).toBeGreaterThan(95);
    simulate(p, 280, (t) => ({ ...calm, occlusionSeconds: 100 + t }));
    expect(p.mep).toBeLessThan(sim.physiology.alarms.mepLow);
    expect(p.isAlarm('mepLow')).toBe(true);
    simulate(p, 150, () => calm);
    expect(p.mep).toBeGreaterThan(90);
  });

  it('occluding a perforator (e.g. the AChA) drops MEPs even without temporary clipping', () => {
    const p = new Physiology();
    p.noisy = false;
    simulate(p, 60, () => ({ ...calm, perforatorIschemia: 1 }));
    expect(p.mep).toBeLessThan(35);
  });
});
