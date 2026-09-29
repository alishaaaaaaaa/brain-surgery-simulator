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
  private readonly doppler = new Set<StructureId>();

  constructor(private readonly src: TrackerSources) {
    events.on('dopplerContact', ({ structure }) => {
      if (structure) this.doppler.add(structure);
    });
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

  dopplerTouched(s: StructureId): boolean {
    return this.doppler.has(s);
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
