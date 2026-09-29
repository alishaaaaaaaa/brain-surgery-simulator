import { describe, expect, it } from 'vitest';
import { sim } from '../config/sim';
import { events, type StructureId } from '../core/events';
import { Procedure } from './procedure';
import { STAGES, type Facts } from './stages';

/** Mutable fake facts: start with nothing done. */
function makeFacts() {
  const f = {
    opened: { superficial: 0, middle: 0, deep: 0 } as Record<'superficial' | 'middle' | 'deep', number>,
    dwells: new Map<StructureId, number>(),
    doppler: new Set<StructureId>(),
    freed: new Set<string>(),
    retraction: { frontal: 0.3, temporal: 0.3 },
    clips: 0,
    temp: false,
    bleeds: 0,
  };
  const facts: Facts = {
    arachnoidOpened: (s) => f.opened[s],
    dwell: (s) => f.dwells.get(s) ?? 0,
    dopplerTouched: (s) => f.doppler.has(s),
    adhesionFreed: (id) => f.freed.has(id),
    get retraction() {
      return f.retraction;
    },
    clipsAcrossNeck: () => f.clips,
    tempClipOn: () => f.temp,
    activeBleeds: () => f.bleeds,
  };
  return { f, facts };
}

/** Step the procedure long enough for any pending stage transition. */
function run(p: Procedure, facts: Facts, seconds = sim.procedure.advanceDelay + 0.2) {
  const dt = 0.05;
  for (let t = 0; t < seconds; t += dt) p.update(dt, facts, t);
}

const identified = (f: ReturnType<typeof makeFacts>['f'], ...s: StructureId[]) =>
  s.forEach((x) => f.dwells.set(x, sim.procedure.identifyDwell));

describe('Procedure', () => {
  it('starts on stage 1 with the rest locked', () => {
    const p = new Procedure();
    expect(p.stages.map((s) => s.status)).toEqual(['current', 'locked', 'locked', 'locked', 'locked', 'locked']);
    expect(p.overallProgress).toBe(0);
  });

  it('does not complete a stage until every subtask is done, and reports partial progress', () => {
    const { f, facts } = makeFacts();
    const p = new Procedure();
    f.opened.superficial = 1;
    f.opened.middle = 0.5;
    run(p, facts);
    expect(p.current).toBe(0);
    // superficial 1 + middle 0.5 + gentle retraction 1 + dry field 1 → 3.5 / 4
    expect(p.stageProgress(0)).toBeCloseTo(3.5 / 4);
  });

  it('counts a just-finished stage once while waiting to advance', () => {
    const { f, facts } = makeFacts();
    const p = new Procedure();
    f.opened.superficial = f.opened.middle = 1;
    p.update(0.05, facts, 0);
    expect(p.stages[0].status).toBe('done');
    expect(p.current).toBe(0);
    expect(p.overallProgress).toBeCloseTo(1 / 6);
  });

  it('excessive retraction blocks stage 1 (a live condition)', () => {
    const { f, facts } = makeFacts();
    const p = new Procedure();
    f.opened.superficial = f.opened.middle = 1;
    f.retraction.frontal = 0.9;
    run(p, facts);
    expect(p.current).toBe(0);
    f.retraction.frontal = 0.4;
    run(p, facts);
    expect(p.current).toBe(1);
  });

  it('runs through all six stages in order and emits stageCompleted', () => {
    const { f, facts } = makeFacts();
    const p = new Procedure();
    const completed: string[] = [];
    const off = events.on('stageCompleted', (e) => completed.push(e.id));

    f.opened.superficial = f.opened.middle = 1;
    run(p, facts);
    identified(f, 'm1');
    f.doppler.add('m1');
    run(p, facts);
    f.opened.deep = 1;
    identified(f, 'ica', 'opticNerve');
    run(p, facts);
    identified(f, 'pcom', 'acha');
    ['neckPcom', 'neckPcomOrigin', 'neckAcha', 'neckIcaDistal'].forEach((id) => f.freed.add(id));
    run(p, facts);
    f.clips = 1;
    run(p, facts);
    ['ica', 'pcom', 'acha'].forEach((s) => f.doppler.add(s as StructureId));
    run(p, facts);

    expect(completed).toEqual(STAGES.map((s) => s.id));
    expect(p.finished).toBe(true);
    expect(p.overallProgress).toBe(1);
    off();
  });

  it('a step does not finish while something is still bleeding', () => {
    const { f, facts } = makeFacts();
    const p = new Procedure();
    f.opened.superficial = f.opened.middle = 1;
    f.bleeds = 1;
    run(p, facts);
    expect(p.current).toBe(0);
    f.bleeds = 0;
    run(p, facts);
    expect(p.current).toBe(1);
  });

  it('the clip stage waits for the temporary clip to come off', () => {
    const { f, facts } = makeFacts();
    const p = new Procedure(STAGES.filter((s) => s.id === 'clip'));
    f.clips = 1;
    f.temp = true;
    run(p, facts);
    expect(p.finished).toBe(false);
    f.temp = false;
    run(p, facts);
    expect(p.finished).toBe(true);
  });

  it('sticky subtasks stay done; live ones can un-tick', () => {
    const { f, facts } = makeFacts();
    const p = new Procedure(STAGES.filter((s) => s.id === 'identifyM1'));
    identified(f, 'm1');
    run(p, facts, 0.1);
    f.dwells.clear(); // (dwell never decreases in reality; checks stickiness)
    run(p, facts, 0.1);
    expect(p.stages[0].progress[0]).toBe(1);
  });

  it('only the current stage can complete — later goals done early count when reached', () => {
    const { f, facts } = makeFacts();
    const p = new Procedure();
    identified(f, 'm1');
    f.doppler.add('m1');
    run(p, facts);
    expect(p.current).toBe(0);
    f.opened.superficial = f.opened.middle = 1;
    run(p, facts);
    run(p, facts);
    expect(p.current).toBe(2);
  });
});
