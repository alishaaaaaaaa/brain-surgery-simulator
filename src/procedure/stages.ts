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
  /**
   * The latest Doppler check on a structure: the flow heard, and whether it was made after
   * the most recent clip change (older checks no longer describe the current situation).
   */
  doppler(s: StructureId): { flow: number; current: boolean } | null;
  /** ICG has been run since the most recent clip change. */
  icgSinceClipChange(): boolean;
  adhesionFreed(id: string): boolean;
  retraction: { frontal: number; temporal: number };
  /** Number of permanent clips whose blades sit across the neck. */
  clipsAcrossNeck(): number;
  tempClipOn(): boolean;
  /** Bleeding points still bleeding. */
  activeBleeds(): number;
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

/** Doppler hears flow in a vessel (optionally: checked after the latest clip change). */
const dopplerFlow = (s: StructureId, labelKey: I18nKey, afterClip = false): Subtask => ({
  id: `doppler-${s}`,
  labelKey,
  live: afterClip,
  progress: (f) => {
    const d = f.doppler(s);
    return d && (!afterClip || d.current) && d.flow > sim.flow.flowingAbove ? 1 : 0;
  },
});

/** Hemostasis: a step is not finished while something is still bleeding. */
const dryField: Subtask = { id: 'dryField', labelKey: 'task.dryField', live: true, progress: (f) => (f.activeBleeds() === 0 ? 1 : 0) };

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
      dryField,
    ],
  },
  {
    // M1 is the guide: follow it medially to the ICA.
    id: 'identifyM1',
    titleKey: 'stage.identifyM1',
    mentorKey: 'mentor.identifyM1',
    subtasks: [identify('m1', 'task.identifyM1'), dopplerFlow('m1', 'task.dopplerM1')],
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
      dryField,
    ],
  },
  {
    // After clipping: the parent artery and both branches must still flow, and the sac must
    // be excluded. All checks must be made on the current clip placement.
    id: 'patency',
    titleKey: 'stage.patency',
    mentorKey: 'mentor.patency',
    subtasks: [
      dopplerFlow('ica', 'task.dopplerIca', true),
      dopplerFlow('pcom', 'task.dopplerPcom', true),
      dopplerFlow('acha', 'task.dopplerAcha', true),
      {
        id: 'domeSilent',
        labelKey: 'task.domeSilent',
        live: true,
        progress: (f) => {
          const d = f.doppler('aneurysm');
          return d && d.current && d.flow < sim.flow.silentBelow ? 1 : 0;
        },
      },
      { id: 'icg', labelKey: 'task.icg', live: true, progress: (f) => (f.icgSinceClipChange() ? 1 : 0) },
    ],
  },
];
