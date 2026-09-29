import type { RiskSource } from '../core/state';
import type { I18nKey } from '../ui/i18n';

/** Everything the debrief reports, collected at the end of the case. */
export interface CaseSummary {
  /** Operation time (s). */
  time: number;
  ebl: number;
  tempOcclusionTotal: number;
  tempOcclusionLongest: number;
  ruptured: boolean;
  ruptureSecured: boolean;
  clip: {
    applied: boolean;
    neckClosure: number;
    residualNeck: number;
    icaStenosis: number;
    pcomOccluded: boolean;
    achaOccluded: boolean;
  };
  stagesDone: number;
  stagesTotal: number;
  injuries: number;
  peakRetraction: number;
  minMep: number;
  /** ICG was run after the final clip placement. */
  icgAfterClip: boolean;
  riskBySource: Partial<Record<RiskSource, number>>;
}

export type ClipVerdict = 'none' | 'complete' | 'incomplete' | 'compromised';

/**
 * Overall clip result:
 *  - compromised: the neck may be closed, but a branch is occluded or the ICA is narrowed
 *  - incomplete: the sac still fills, or a residual neck was left
 *  - complete: neck closed, branches and parent artery preserved
 */
export function clipVerdict(s: CaseSummary): ClipVerdict {
  const c = s.clip;
  if (!c.applied) return 'none';
  if (c.pcomOccluded || c.achaOccluded || c.icaStenosis > 0.5) return 'compromised';
  if (c.neckClosure < 0.9 || c.residualNeck > 1) return 'incomplete';
  return 'complete';
}

export interface Tip {
  key: I18nKey;
  vars?: Record<string, string | number>;
  /** Lower = more important. */
  priority: number;
}

const RUPTURE_TIPS: Record<RiskSource, I18nKey> = {
  dissector: 'tip.rupture.dissector',
  suction: 'tip.rupture.suction',
  bipolar: 'tip.rupture.bipolar',
  scissors: 'tip.rupture.scissors',
  domeAdhesion: 'tip.rupture.domeAdhesion',
};

/** A few specific, prioritised tips for improvement (at most `max`). */
export function tipsFor(s: CaseSummary, max = 4): Tip[] {
  const tips: Tip[] = [];
  const c = s.clip;
  const pct = (x: number) => Math.round(x * 100);

  if (s.ruptured) {
    const top = (Object.entries(s.riskBySource) as [RiskSource, number][]).sort((a, b) => b[1] - a[1])[0];
    tips.push({ key: top ? RUPTURE_TIPS[top[0]] : 'tip.rupture.dissector', priority: 0 });
  }
  if (c.achaOccluded) tips.push({ key: 'tip.acha', priority: 1 });
  if (c.pcomOccluded) tips.push({ key: 'tip.pcom', priority: 1 });
  if (!c.applied) tips.push({ key: 'tip.noClip', priority: 1 });
  if (c.applied && c.neckClosure < 0.9) tips.push({ key: 'tip.incomplete', vars: { pct: pct(c.neckClosure) }, priority: 1 });
  if (c.applied && c.residualNeck > 0.5) tips.push({ key: 'tip.residual', vars: { mm: c.residualNeck.toFixed(1) }, priority: 2 });
  if (c.applied && c.icaStenosis > 0.3) tips.push({ key: 'tip.stenosis', vars: { pct: pct(c.icaStenosis) }, priority: 2 });
  if (s.tempOcclusionLongest > 300) {
    tips.push({ key: 'tip.longOcclusion', vars: { min: (s.tempOcclusionLongest / 60).toFixed(1) }, priority: 2 });
  }
  if (s.minMep < 50 && !c.achaOccluded) tips.push({ key: 'tip.mep', vars: { pct: Math.round(s.minMep) }, priority: 3 });
  if (s.ebl > 250) tips.push({ key: 'tip.bloodLoss', vars: { ml: Math.round(s.ebl) }, priority: 3 });
  if (s.injuries > 0) tips.push({ key: 'tip.injuries', vars: { n: s.injuries }, priority: 3 });
  if (s.peakRetraction > 0.7) tips.push({ key: 'tip.retraction', vars: { pct: pct(s.peakRetraction) }, priority: 4 });
  if (c.applied && !s.icgAfterClip) tips.push({ key: 'tip.icg', priority: 4 });

  if (!tips.length) return [{ key: 'tip.excellent', priority: 9 }];
  return tips.sort((a, b) => a.priority - b.priority).slice(0, max);
}
