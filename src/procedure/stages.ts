import { sim } from '../config/sim';
import type { StructureId } from '../core/events';
import type { I18nKey } from '../ui/i18n';

/**
 * Facts about the operation that stage goals are judged on. Implemented by the tracker
 * (live simulation) and by fakes in tests.
 */
export interface Facts {
  /** Fraction (0..1) of a sheet's segments inside the working window that are cut. */
  arachnoidOpened(sheet: 'superficial' | 'middle' | 'deep'): number;
  /** Seconds the cursor has rested on a structure (cumulative). */
  dwell(s: StructureId): number;
  /** Whether the Doppler probe has been pressed on a structure. */
  dopplerTouched(s: StructureId): boolean;
  adhesionFreed(id: string): boolean;
  retraction: { frontal: number; temporal: number };
  /** Number of permanent clips whose blades sit across the neck. */
  clipsAcrossNeck(): number;
  tempClipOn(): boolean;
}

export interface Subtask {
  id: string;
  labelKey: I18nKey;
  /** 0..1 */
  progress(f: Facts): number;
  /**
   * Live conditions (e.g. "retraction is gentle") are re-checked every frame and can
   * un-tick. Others are sticky: once achieved they stay done.
   */
  live?: boolean;
}

export type StageId = 'openFissure' | 'identifyM1' | 'identifyIcaOptic' | 'pcomNeck' | 'clip' | 'patency';

export interface StageDef {
  id: StageId;
  titleKey: I18nKey;
  mentorKey: I18nKey;
  subtasks: Subtask[];
}

const identify = (s: StructureId, labelKey: I18nKey): Subtask => ({
  id: `identify-${s}`,
  labelKey,
  progress: (f) => Math.min(1, f.dwell(s) / sim.procedure.identifyDwell),
});

const doppler = (s: StructureId, labelKey: I18nKey): Subtask => ({
  id: `doppler-${s}`,
  labelKey,
  progress: (f) => (f.dopplerTouched(s) ? 1 : 0),
});

const freed = (ids: string[]) => (f: Facts) => ids.filter((id) => f.adhesionFreed(id)).length / ids.length;

/**
 * The six steps of a transsylvian IC-PC clipping, in order. Each unlocks when the
 * previous one's goals are met.
 */
export const STAGES: StageDef[] = [
  {
    // Superficial to deep: sharp arachnoid dissection, gentle retraction.
    id: 'openFissure',
    titleKey: 'stage.openFissure',
    mentorKey: 'mentor.openFissure',
    subtasks: [
      { id: 'cutSuperficial', labelKey: 'task.cutSuperficial', progress: (f) => f.arachnoidOpened('superficial') },
      { id: 'cutMiddle', labelKey: 'task.cutMiddle', progress: (f) => f.arachnoidOpened('middle') },
      {
        id: 'gentleRetraction',
        labelKey: 'task.gentleRetraction',
        live: true,
        progress: (f) => (Math.max(f.retraction.frontal, f.retraction.temporal) <= sim.retraction.warnAbove ? 1 : 0),
      },
    ],
  },
  {
    // M1 is the guide: follow it medially to the ICA.
    id: 'identifyM1',
    titleKey: 'stage.identifyM1',
    mentorKey: 'mentor.identifyM1',
    subtasks: [identify('m1', 'task.identifyM1'), doppler('m1', 'task.dopplerM1')],
  },
  {
    id: 'identifyIcaOptic',
    titleKey: 'stage.identifyIcaOptic',
    mentorKey: 'mentor.identifyIcaOptic',
    subtasks: [
      { id: 'cutDeep', labelKey: 'task.cutDeep', progress: (f) => f.arachnoidOpened('deep') },
      identify('ica', 'task.identifyIca'),
      identify('opticNerve', 'task.identifyOptic'),
    ],
  },
  {
    // See the branches before touching the aneurysm; then free the neck on both sides.
    id: 'pcomNeck',
    titleKey: 'stage.pcomNeck',
    mentorKey: 'mentor.pcomNeck',
    subtasks: [
      identify('pcom', 'task.identifyPcom'),
      identify('acha', 'task.identifyAcha'),
      { id: 'freeProximal', labelKey: 'task.freeProximal', progress: freed(['neckPcom', 'neckPcomOrigin']) },
      { id: 'freeDistal', labelKey: 'task.freeDistal', progress: freed(['neckAcha', 'neckIcaDistal']) },
    ],
  },
  {
    id: 'clip',
    titleKey: 'stage.clip',
    mentorKey: 'mentor.clip',
    subtasks: [
      { id: 'clipNeck', labelKey: 'task.clipNeck', live: true, progress: (f) => (f.clipsAcrossNeck() > 0 ? 1 : 0) },
      { id: 'noTempClip', labelKey: 'task.noTempClip', live: true, progress: (f) => (f.tempClipOn() ? 0 : 1) },
    ],
  },
  {
    // After clipping: the parent artery and both branches must still flow.
    id: 'patency',
    titleKey: 'stage.patency',
    mentorKey: 'mentor.patency',
    subtasks: [
      doppler('ica', 'task.dopplerIca'),
      doppler('pcom', 'task.dopplerPcom'),
      doppler('acha', 'task.dopplerAcha'),
    ],
  },
];
