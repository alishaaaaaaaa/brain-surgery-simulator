import { cutPatch, type ArachnoidPatch } from '../../anatomy/arachnoid';
import type { Adhesion } from '../../anatomy/adhesions';
import { sim } from '../../config/sim';
import { events } from '../../core/events';
import { addRuptureRisk, state } from '../../core/state';
import { buildScissors } from '../instruments';
import { isArtery, isBrain, isNerve, isSac } from '../rules';
import type { PointerHit, TargetClass, Tool, ToolContext } from '../types';
import { freeAdhesion } from './dissector';

/**
 * Micro scissors: sharp dissection. Opening the sylvian fissure means cutting the
 * arachnoid, never tearing it. Cut only what you can see — never a vessel or nerve.
 */
export class ScissorsTool implements Tool {
  readonly id = 'scissors' as const;
  readonly key = '2';
  readonly labelKey = 'tool.scissors' as const;
  readonly hintKey = 'hint.scissors' as const;
  readonly hand = 'right' as const;
  readonly model = buildScissors();
  private closeT = 1;

  constructor(private readonly ctx: ToolContext) {}

  classify(hit: PointerHit): TargetClass {
    if (hit.structure === 'arachnoid') return 'target';
    if (hit.structure === 'adhesion') return (hit.object.userData.adhesion as Adhesion).kind === 'neck' ? 'target' : 'caution';
    if (isArtery(hit.structure) || isNerve(hit.structure) || isSac(hit.structure) || isBrain(hit.structure)) return 'caution';
    return null;
  }

  down(hit: PointerHit | null): void {
    this.closeT = 0;
    this.ctx.audio.snip();
    if (!hit) return;
    const s = hit.structure;
    if (s === 'arachnoid') {
      const patch = hit.object.userData.patch as ArachnoidPatch;
      cutPatch(patch, hit.point.y);
      const remaining = this.ctx.anatomy.arachnoid.filter((p) => !p.cut).length;
      events.emit('arachnoidCut', { sheet: patch.sheet, index: patch.index, remaining, point: hit.point });
      this.ctx.toasts.show('toast.arachnoidCut', 'success', 1400);
    } else if (s === 'adhesion') {
      freeAdhesion(hit.object.userData.adhesion as Adhesion, this.ctx);
    } else if (isSac(s)) {
      addRuptureRisk(sim.ruptureRisk.scissorsDome * (s === 'bleb' ? 2 : 1), 'scissors');
      this.ctx.toasts.show('toast.scissorsDome', 'danger');
    } else if (isArtery(s) || isNerve(s)) {
      state.injuries++;
      events.emit('injury', { structure: s, severity: 'major', point: hit.point, normal: hit.normal, tool: this.id });
      this.ctx.toasts.show(isNerve(s) ? 'toast.scissorsNerve' : 'toast.scissorsVessel', 'danger');
    } else if (isBrain(s)) {
      state.injuries++;
      events.emit('injury', { structure: s, severity: 'minor', point: hit.point, normal: hit.normal, tool: this.id });
      this.ctx.toasts.show('toast.pialInjury', 'caution');
    }
  }

  update(dt: number): void {
    // Snip: blades close quickly then reopen.
    this.closeT = Math.min(1, this.closeT + dt * 5);
    const open = this.closeT < 0.4 ? 0.6 * (1 - this.closeT / 0.4) : 0.6 * ((this.closeT - 0.4) / 0.6);
    this.model.setOpen(open);
  }
}
