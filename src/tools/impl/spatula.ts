import { rebuildSpatula, retractionPressure, type Spatula } from '../../anatomy/spatulas';
import { sim } from '../../config/sim';
import { events, type StructureId } from '../../core/events';
import { state } from '../../core/state';
import { t } from '../../ui/i18n';
import { buildSpatulaTool } from '../instruments';
import type { PointerHit, TargetClass, Tool, ToolContext } from '../types';

/**
 * Brain spatula: adjust the retractor blades. Drag a blade along the fissure to move it,
 * or away from the fissure to retract further. Keep retraction minimal — the fissure
 * should be opened by dissection; excessive retraction bruises the brain.
 */
export class SpatulaTool implements Tool {
  readonly id = 'spatula' as const;
  readonly key = '5';
  readonly labelKey = 'tool.spatula' as const;
  readonly hintKey = 'hint.spatula' as const;
  readonly hand = 'right' as const;
  readonly model = buildSpatulaTool();
  readonly ignores = new Set<StructureId>(['adhesion', 'csf', 'arachnoid']);
  private grabbed: Spatula | null = null;

  constructor(
    private readonly ctx: ToolContext,
    private readonly mmPerPixel: () => number,
  ) {
    for (const s of ctx.anatomy.spatulas) this.publish(s);
  }

  classify(hit: PointerHit): TargetClass {
    return hit.structure === 'spatula' ? 'target' : null;
  }

  down(hit: PointerHit | null): void {
    this.grabbed = hit?.structure === 'spatula' ? (hit.object.userData.spatula as Spatula) : null;
  }

  drag(_hit: PointerHit | null, _moved: number, dx: number, dy: number): void {
    const s = this.grabbed;
    if (!s) return;
    const k = this.mmPerPixel();
    s.spec.x = Math.max(-32, Math.min(32, s.spec.x + dx * k));
    // Dragging away from the fissure (up for the frontal blade, down for the temporal one)
    // pushes the blade deeper, retracting more.
    const away = s.spec.lobe === 'frontal' ? -dy : dy;
    s.spec.tipDepth = Math.max(-34, Math.min(-12, s.spec.tipDepth - away * k * 0.8));
    rebuildSpatula(s);
    this.publish(s);
  }

  up(): void {
    this.grabbed = null;
  }

  private publish(s: Spatula): void {
    const p = retractionPressure(s.spec);
    state.retraction[s.spec.lobe] = p;
    events.emit('retractionChanged', { lobe: s.spec.lobe, pressure: p });
    if (p > sim.retraction.warnAbove) this.ctx.toasts.show('toast.retraction', 'caution');
  }

  status(): string {
    const f = Math.round(state.retraction.frontal * 100);
    const tp = Math.round(state.retraction.temporal * 100);
    return `${t('status.retraction')}  F ${f}%  T ${tp}%`;
  }
}
