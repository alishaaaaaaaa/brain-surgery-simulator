import { describe, expect, it } from 'vitest';
import { clipVerdict, tipsFor, type CaseSummary } from './debrief';

const good: CaseSummary = {
  time: 1500,
  ebl: 60,
  tempOcclusionTotal: 0,
  tempOcclusionLongest: 0,
  ruptured: false,
  ruptureSecured: false,
  clip: { applied: true, neckClosure: 0.98, residualNeck: 0, icaStenosis: 0.1, pcomOccluded: false, achaOccluded: false },
  stagesDone: 6,
  stagesTotal: 6,
  injuries: 0,
  peakRetraction: 0.5,
  minMep: 96,
  icgAfterClip: true,
  riskBySource: {},
};
const w = (patch: Partial<CaseSummary>, clip: Partial<CaseSummary['clip']> = {}): CaseSummary => ({
  ...good,
  ...patch,
  clip: { ...good.clip, ...clip },
});

describe('clip verdict', () => {
  it('grades complete, incomplete, compromised and no clip', () => {
    expect(clipVerdict(good)).toBe('complete');
    expect(clipVerdict(w({}, { neckClosure: 0.7 }))).toBe('incomplete');
    expect(clipVerdict(w({}, { residualNeck: 1.6 }))).toBe('incomplete');
    expect(clipVerdict(w({}, { achaOccluded: true }))).toBe('compromised');
    expect(clipVerdict(w({}, { icaStenosis: 0.7 }))).toBe('compromised');
    expect(clipVerdict(w({}, { applied: false }))).toBe('none');
  });
});

describe('tips', () => {
  it('praises a clean case', () => {
    expect(tipsFor(good).map((t) => t.key)).toEqual(['tip.excellent']);
  });

  it('puts the rupture first and names its main cause', () => {
    const tips = tipsFor(w({ ruptured: true, ruptureSecured: true, ebl: 600, riskBySource: { dissector: 0.1, suction: 0.5 } }));
    expect(tips[0].key).toBe('tip.rupture.suction');
    expect(tips.map((t) => t.key)).toContain('tip.bloodLoss');
  });

  it('flags occluded branches before cosmetic issues, and caps the list', () => {
    const tips = tipsFor(
      w({ injuries: 2, peakRetraction: 0.9, icgAfterClip: false, tempOcclusionLongest: 420 }, { achaOccluded: true, residualNeck: 1.2 }),
    );
    expect(tips).toHaveLength(4);
    expect(tips[0].key).toBe('tip.acha');
    expect(tips.map((t) => t.key)).not.toContain('tip.icg'); // lowest priority falls off
  });

  it('includes the numbers in its advice', () => {
    const t = tipsFor(w({}, { neckClosure: 0.62 })).find((x) => x.key === 'tip.incomplete')!;
    expect(t.vars).toEqual({ pct: 62 });
  });
});
