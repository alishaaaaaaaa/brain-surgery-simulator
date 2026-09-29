import type { Adhesion } from '../anatomy/adhesions';
import type { ArachnoidPatch } from '../anatomy/arachnoid';
import type { AneurysmHandle } from '../anatomy/aneurysm';
import { sim } from '../config/sim';
import { events, type StructureId } from '../core/events';
import { state } from '../core/state';
import type { PlacedClip } from '../tools/impl/clip';
import type { Facts } from './stages';

export interface TrackerSources {
  arachnoid: ArachnoidPatch[];
  adhesions: Adhesion[];
  aneurysm: AneurysmHandle;
  clips: () => readonly PlacedClip[];
  tempClips: () => readonly PlacedClip[];
  activeBleeds: () => number;
}

/**
 * Collects facts about what the surgeon has done: which structures have been looked at
 * (cursor dwell), which vessels the Doppler has touched, what has been cut and freed,
 * and where the clips are.
 */
export class Tracker implements Facts {
  private readonly dwellTime = new Map<StructureId, number>();
  private readonly identified = new Set<StructureId>();
  private readonly dopplerChecks = new Map<StructureId, { flow: number; version: number }>();
  /** Bumped whenever a clip is applied or removed: earlier checks become stale. */
  private clipVersion = 0;
  private icgVersion = -1;

  constructor(private readonly src: TrackerSources) {
    events.on('dopplerContact', ({ structure, flow }) => {
      // The bleb is part of the sac: a check there is a check of the dome.
      if (structure) this.dopplerChecks.set(structure === 'bleb' ? 'aneurysm' : structure, { flow, version: this.clipVersion });
    });
    const bump = () => this.clipVersion++;
    events.on('clipApplied', bump);
    events.on('clipRemoved', bump);
    events.on('tempClipApplied', bump);
    events.on('tempClipRemoved', bump);
    events.on('icgRun', () => (this.icgVersion = this.clipVersion));
  }

  /** Accumulate dwell on the structure under the cursor. */
  update(dt: number, hovered: StructureId | null): void {
    if (!hovered) return;
    const t = (this.dwellTime.get(hovered) ?? 0) + dt;
    this.dwellTime.set(hovered, t);
    if (t >= sim.procedure.identifyDwell && !this.identified.has(hovered)) {
      this.identified.add(hovered);
      events.emit('identified', { structure: hovered });
    }
  }

  get retraction() {
    return state.retraction;
  }

  arachnoidOpened(sheet: 'superficial' | 'middle' | 'deep'): number {
    const [x0, x1] = sim.procedure.window[sheet];
    const inWindow = this.src.arachnoid.filter((p) => p.sheet === sheet && p.centerX >= x0 && p.centerX <= x1);
    if (!inWindow.length) return 1;
    return inWindow.filter((p) => p.cut).length / inWindow.length;
  }

  dwell(s: StructureId): number {
    return this.dwellTime.get(s) ?? 0;
  }

  doppler(s: StructureId): { flow: number; current: boolean } | null {
    const d = this.dopplerChecks.get(s);
    return d ? { flow: d.flow, current: d.version === this.clipVersion } : null;
  }

  icgSinceClipChange(): boolean {
    return this.icgVersion === this.clipVersion;
  }

  adhesionFreed(id: string): boolean {
    return this.src.adhesions.some((a) => a.id === id && a.freed);
  }

  clipsAcrossNeck(): number {
    const a = this.src.aneurysm;
    const limit = a.neckRadius + sim.procedure.clipNeckTolerance;
    return this.src.clips().filter((c) => c.pose.position.distanceTo(a.neckCenter) <= limit).length;
  }

  tempClipOn(): boolean {
    return this.src.tempClips().length > 0;
  }

  activeBleeds(): number {
    return this.src.activeBleeds();
  }
}
