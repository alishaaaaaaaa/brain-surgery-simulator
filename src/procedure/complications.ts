import { Vector3 } from 'three';
import type { Anatomy } from '../anatomy';
import { wallOffsetAtDepth } from '../anatomy/geometryMath';
import { anatomy as cfg } from '../config/anatomy';
import { sim } from '../config/sim';
import { events } from '../core/events';
import { state } from '../core/state';
import type { Bleeding } from '../physics/bleeding';
import { isArtery } from '../tools/rules';
import type { Toasts } from '../ui/toast';

/**
 * Turns what the surgeon does into complications:
 *  - rough handling of the dome → intraoperative rupture (hidden, randomised threshold)
 *  - a cut artery → arterial bleeding; a pial injury → ooze
 *  - cutting arachnoid sometimes tears a small bridging vein → ooze
 *  - temporary ICA clip → the occlusion timer
 */
export class Complications {
  private readonly offs: (() => void)[] = [];
  private aspiratedAtRupture = 0;

  constructor(
    private readonly anatomy: Anatomy,
    private readonly bleeding: Bleeding,
    private readonly toasts: Toasts,
    random: () => number = Math.random,
  ) {
    const [lo, hi] = sim.bleeding.ruptureThreshold;
    state.ruptureThreshold = lo + (hi - lo) * random();

    this.offs.push(events.on('ruptureRiskChanged', ({ value }) => {
      if (!state.ruptured && value >= state.ruptureThreshold) this.rupture();
    }));

    this.offs.push(events.on('injury', ({ structure, severity, point, normal, tool }) => {
      if (tool !== 'scissors') return; // bipolar injuries are thermal, not bleeding
      if (severity === 'major' && isArtery(structure)) {
        this.bleeding.start('arterial', point, normal);
        this.toasts.show('toast.arterialBleed', 'danger', 3200);
      } else if (severity === 'minor') {
        this.bleeding.start('ooze', point, normal);
        this.toasts.show('toast.ooze', 'caution');
      }
    }));

    this.offs.push(events.on('arachnoidCut', ({ point }) => {
      if (random() >= sim.bleeding.oozeOnArachnoidCut) return;
      // A small vein bridging the fissure tears where the membrane meets the wall.
      const b = cfg.brain;
      const side = point.y >= b.corridorCenterY ? 1 : -1;
      const wall = new Vector3(point.x, b.corridorCenterY + side * (wallOffsetAtDepth(b, point.z) - 0.5), point.z);
      this.bleeding.start('ooze', wall, new Vector3(0, -side, 0.35).normalize());
      this.toasts.show('toast.ooze', 'caution');
    }));

    // (The reduced inflow itself comes from the flow model.)
    this.offs.push(events.on('tempClipApplied', () => {
      state.tempOcclusion.active = true;
      state.tempOcclusion.current = 0;
    }));
    this.offs.push(events.on('tempClipRemoved', () => {
      state.tempOcclusion.active = false;
    }));
    this.offs.push(events.on('ruptureSecured', () => this.toasts.show('toast.ruptureSecured', 'success', 3500)));
    this.offs.push(events.on('bleedStopped', ({ by, kind }) => {
      if (by === 'bipolar') this.toasts.show(kind === 'ooze' ? 'toast.oozeStopped' : 'toast.bleedStopped', 'success', 1600);
    }));
  }

  /** Unsubscribe from events (tests, or restarting a case). */
  dispose(): void {
    this.offs.forEach((off) => off());
  }

  /** The aneurysm ruptures — usually at the bleb, the thinnest part of the wall. */
  rupture(): void {
    if (state.ruptured) return;
    state.ruptured = true;
    this.aspiratedAtRupture = this.bleeding.aspirated;
    const a = this.anatomy.aneurysm;
    const at = a.bleb.getWorldPosition(new Vector3());
    const normal = at.clone().sub(a.domeCenter).normalize();
    this.bleeding.start('rupture', at.addScaledVector(normal, cfg.aneurysm.bleb.radius * 0.8), normal);
    events.emit('ruptured', { point: at });
    this.toasts.show('toast.rupture', 'danger', 5000);
  }

  /** After a rupture: the field counts as cleared once suction has been used and little blood remains. */
  get fieldCleared(): boolean {
    return state.ruptured && this.bleeding.aspirated - this.aspiratedAtRupture > 5 && state.fieldBlood < 8;
  }

  update(dt: number): void {
    const o = state.tempOcclusion;
    if (o.active) {
      o.current += dt;
      o.total += dt;
      o.longest = Math.max(o.longest, o.current);
    }
  }
}
