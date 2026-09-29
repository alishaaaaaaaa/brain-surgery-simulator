import { sim } from '../../config/sim';
import { addRuptureRisk } from '../../core/state';
import { buildSuction } from '../instruments';
import { isSac } from '../rules';
import type { PointerHit, TargetClass, Tool, ToolContext } from '../types';

/**
 * Suction (usually in the left hand): clears CSF and blood to keep the field dry.
 * Rule: aspirate fluid, never hold suction on the aneurysm dome — the negative pressure
 * can tear a thin wall.
 */
export class SuctionTool implements Tool {
  readonly id = 'suction' as const;
  readonly key = '1';
  readonly labelKey = 'tool.suction' as const;
  readonly hintKey = 'hint.suction' as const;
  readonly hand = 'left' as const;
  readonly model = buildSuction();

  constructor(private readonly ctx: ToolContext) {}

  classify(hit: PointerHit): TargetClass {
    if (hit.structure === 'csf' || hit.structure === 'blood') return 'target';
    if (isSac(hit.structure) || hit.structure === 'opticNerve') return 'caution';
    return null;
  }

  update(dt: number, hit: PointerHit | null, pressed: boolean): void {
    let aspirating = false;
    if (pressed && hit) {
      const csf = this.ctx.fluids.aspirate(hit.point, dt);
      const blood = this.ctx.bleeding.aspirate(hit.point, dt) > 0;
      aspirating = csf || blood;
      if (isSac(hit.structure)) {
        const m = hit.structure === 'bleb' ? sim.ruptureRisk.blebMultiplier : 1;
        addRuptureRisk(sim.ruptureRisk.suctionDomePerSecond * m * dt);
        this.ctx.toasts.show('toast.suctionDome', 'caution');
      }
    }
    this.ctx.audio.setSuction(pressed, aspirating);
  }

  deactivate(): void {
    this.ctx.audio.setSuction(false, false);
  }
}
