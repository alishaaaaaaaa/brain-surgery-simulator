import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { buildAneurysm } from '../anatomy/aneurysm';
import { buildVesselCurves } from '../anatomy/vessels';
import { sim } from '../config/sim';
import { events } from '../core/events';
import { addRuptureRisk, state } from '../core/state';
import { Bleeding } from '../physics/bleeding';
import { Complications } from './complications';

const aneurysm = buildAneurysm(buildVesselCurves().get('ica')!);

function resetState() {
  Object.assign(state, {
    ruptureRisk: 0,
    ruptured: false,
    ruptureSecured: false,
    ebl: 0,
    fieldBlood: 0,
    tempOcclusion: { active: false, current: 0, total: 0 },
  });
}

/** Fresh bleeding + complications with a fixed random sequence. */
function setup(randomValues: number[] = [0.5]) {
  let i = 0;
  const random = () => randomValues[Math.min(i++, randomValues.length - 1)];
  const bleeding = new Bleeding();
  const shown: string[] = [];
  const toasts = { show: (k: string) => shown.push(k) } as never;
  const complications = new Complications({ aneurysm } as never, bleeding, toasts, random);
  offs.push(() => complications.dispose());
  return { bleeding, complications, shown };
}

const run = (b: Bleeding, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) b.update(0.05, 0.5);
};

// Each setup() subscribes to the global event bus, so give every test a clean slate.
let offs: (() => void)[] = [];
beforeEach(() => {
  resetState();
  offs.forEach((o) => o());
  offs = [];
});

describe('rupture', () => {
  it('the hidden threshold is drawn within the configured range', () => {
    setup([0]);
    expect(state.ruptureThreshold).toBeCloseTo(sim.bleeding.ruptureThreshold[0]);
    resetState();
    setup([0.999]);
    expect(state.ruptureThreshold).toBeCloseTo(sim.bleeding.ruptureThreshold[1], 2);
  });

  it('happens when rupture risk crosses the threshold, at the bleb', () => {
    const { bleeding, shown } = setup([0.5]);
    const ruptures: Vector3[] = [];
    offs.push(events.on('ruptured', (e) => ruptures.push(e.point)));
    addRuptureRisk(state.ruptureThreshold - 0.01);
    expect(state.ruptured).toBe(false);
    addRuptureRisk(0.02);
    expect(state.ruptured).toBe(true);
    expect(ruptures).toHaveLength(1);
    // On the bleb's surface (radius ~0.95 mm), pointing away from the dome.
    expect(ruptures[0].distanceTo(aneurysm.bleb.getWorldPosition(new Vector3()))).toBeLessThan(1.1);
    expect(bleeding.points[0].kind).toBe('rupture');
    expect(shown).toContain('toast.rupture');
  });

  it('bleeds fast, fills the field, and raises EBL', () => {
    const { bleeding, complications } = setup();
    complications.rupture();
    const floor = bleeding.level;
    run(bleeding, 10);
    expect(state.ebl).toBeCloseTo(sim.bleeding.ruptureRate * 10, 0);
    expect(state.fieldBlood).toBeCloseTo(state.ebl, 5);
    expect(bleeding.level).toBeGreaterThan(floor + 5);
    expect(bleeding.layer.visible).toBe(true);
  });

  it('a temporary clip on the ICA slows it; a clip across the neck stops it', () => {
    const { bleeding, complications } = setup();
    complications.rupture();
    events.emit('tempClipApplied', { structure: 'ica', pose: {} as never });
    expect(bleeding.currentRate).toBeCloseTo(sim.bleeding.ruptureRate * sim.bleeding.ruptureWithTempClip);
    let clipped = false;
    bleeding.neckClipped = () => clipped;
    run(bleeding, 1);
    expect(bleeding.activeCount).toBe(1);
    clipped = true;
    run(bleeding, 0.1);
    expect(bleeding.activeCount).toBe(0);
    expect(state.ruptureSecured).toBe(true);
    events.emit('tempClipRemoved');
  });

  it('the field only counts as cleared after suction is actually used', () => {
    const { bleeding, complications } = setup();
    complications.rupture();
    expect(complications.fieldCleared).toBe(false);
    run(bleeding, 3);
    for (let i = 0; i < 40 && state.fieldBlood > 0; i++) bleeding.aspirate(new Vector3(0, 0, bleeding.level), 0.5);
    expect(complications.fieldCleared).toBe(true);
  });

  it('bipolar cannot stop a rupture', () => {
    const { bleeding, complications } = setup();
    complications.rupture();
    expect(bleeding.coagulateNear(bleeding.points[0].position)).toBe('rupture');
    expect(bleeding.activeCount).toBe(1);
  });
});

describe('hemostasis', () => {
  it('bipolar stops ooze within reach, not from afar', () => {
    const { bleeding } = setup();
    const p = bleeding.start('ooze', new Vector3(10, 10, -20), new Vector3(0, 0, 1));
    expect(bleeding.coagulateNear(new Vector3(20, 10, -20))).toBe('none');
    expect(bleeding.coagulateNear(p.position.clone().add(new Vector3(1, 0, 0)))).toBe('stopped');
    expect(p.active).toBe(false);
  });

  it('suction removes blood only when the tip is in it', () => {
    const { bleeding } = setup();
    state.fieldBlood = 20;
    expect(bleeding.aspirate(new Vector3(0, 0, bleeding.level + 10), 1)).toBe(0);
    const removed = bleeding.aspirate(new Vector3(0, 0, bleeding.level), 1);
    expect(removed).toBeCloseTo(sim.bleeding.suctionRate);
    expect(state.fieldBlood).toBeCloseTo(20 - sim.bleeding.suctionRate);
  });

  it('cutting an artery with scissors starts arterial bleeding; a pial cut oozes', () => {
    const { bleeding } = setup();
    const at = new Vector3(5, 5, -30);
    events.emit('injury', { structure: 'm1', severity: 'major', point: at, normal: new Vector3(0, 0, 1), tool: 'scissors' });
    events.emit('injury', { structure: 'frontalLobe', severity: 'minor', point: at, normal: new Vector3(0, 0, 1), tool: 'scissors' });
    events.emit('injury', { structure: 'ica', severity: 'major', point: at, normal: new Vector3(0, 0, 1), tool: 'bipolar' });
    expect(bleeding.points.map((p) => p.kind)).toEqual(['arterial', 'ooze']);
  });

  it('an arachnoid cut sometimes tears a bridging vein', () => {
    const lucky = setup([0.5, 0.99]); // threshold draw, then "no tear"
    events.emit('arachnoidCut', { sheet: 'superficial', index: 1, remaining: 10, point: new Vector3(0, 5, -8) });
    expect(lucky.bleeding.points).toHaveLength(0);
  });

  it('the temporary occlusion timer runs only while the clip is on', () => {
    const { complications } = setup();
    events.emit('tempClipApplied', { structure: 'ica', pose: {} as never });
    for (let i = 0; i < 100; i++) complications.update(0.1);
    events.emit('tempClipRemoved');
    for (let i = 0; i < 50; i++) complications.update(0.1);
    expect(state.tempOcclusion.current).toBeCloseTo(10);
    expect(state.tempOcclusion.total).toBeCloseTo(10);
    expect(state.tempOcclusion.active).toBe(false);
  });
});
