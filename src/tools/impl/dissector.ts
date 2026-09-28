import type { Adhesion } from '../../anatomy/adhesions';
import { sim } from '../../config/sim';
import { events } from '../../core/events';
import { addRuptureRisk } from '../../core/state';
import { buildDissector } from '../instruments';
import { isSac } from '../rules';
import type { PointerHit, TargetClass, Tool, ToolContext } from '../types';

/** Free an adhesion (shared by the dissector and the scissors). */
export function freeAdhesion(ad: Adhesion, ctx: ToolContext): void {
  if (ad.freed) return;
  ad.freed = true;
  ad.progress = 1;
  ad.proxy.visible = false;
  events.emit('adhesionFreed', { id: ad.id, kind: ad.kind });
  if (ad.kind === 'dome') {
    // Peeling the dome off its neighbours pulls on the thinnest part of the wall.
    addRuptureRisk(sim.ruptureRisk.domeAdhesion);
    ctx.toasts.show('toast.domeAdhesion', 'caution', 3200);
  } else {
    const left = ctx.anatomy.adhesions.filter((a) => a.kind === 'neck' && !a.freed).length;
    ctx.toasts.show(left === 0 ? 'toast.neckFree' : 'toast.adhesionFreed', 'success', left === 0 ? 3000 : 1600);
  }
}

/**
 * Micro dissector: blunt dissection. Short, gentle strokes along the neck separate it from
 * the PCom (proximal side) and the anterior choroidal artery (distal side).
 * Rule: work at the neck; do not rub the dome.
 */
export class DissectorTool implements Tool {
  readonly id = 'dissector' as const;
  readonly key = '4';
  readonly labelKey = 'tool.dissector' as const;
  readonly hintKey = 'hint.dissector' as const;
  readonly hand = 'right' as const;
  readonly model = buildDissector();

  constructor(private readonly ctx: ToolContext) {}

  classify(hit: PointerHit): TargetClass {
    if (hit.structure === 'adhesion') return (hit.object.userData.adhesion as Adhesion).kind === 'neck' ? 'target' : 'caution';
    if (isSac(hit.structure)) return 'caution';
    return null;
  }

  drag(hit: PointerHit | null, moved: number): void {
    if (!hit || moved <= 0) return;
    if (hit.structure === 'adhesion') {
      const ad = hit.object.userData.adhesion as Adhesion;
      ad.progress = Math.min(1, ad.progress + moved / sim.dissection.strokePerAdhesion);
      if (ad.progress >= 1) freeAdhesion(ad, this.ctx);
    } else if (isSac(hit.structure)) {
      const m = hit.structure === 'bleb' ? sim.ruptureRisk.blebMultiplier : 1;
      addRuptureRisk(sim.ruptureRisk.dissectorDomePerMm * moved * m);
      this.ctx.toasts.show(hit.structure === 'bleb' ? 'toast.blebTouch' : 'toast.domeTouch', 'caution');
    }
  }
}
