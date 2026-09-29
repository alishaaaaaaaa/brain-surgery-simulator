import { Group, Vector3 } from 'three';
import type { EndoscopeView } from '../../scene/endoscope';
import { t } from '../../ui/i18n';
import { buildEndoscope } from '../instruments';
import type { PointerHit, TargetClass, Tool, ToolContext } from '../types';

/**
 * Endoscope: move it near the aneurysm to see behind it in the picture-in-picture frame
 * (the view always looks toward the neck). Click to hold it in place — it stays while you
 * use other instruments — and click again with the endoscope to take it out.
 */
export class EndoscopeTool implements Tool {
  readonly id = 'endoscope' as const;
  readonly key = '9';
  readonly labelKey = 'tool.endoscope' as const;
  readonly hintKey = 'hint.endoscope' as const;
  readonly hand = 'left' as const;
  readonly model = buildEndoscope();
  private parked: Group | null = null;
  private parkedTip = new Vector3();

  constructor(
    private readonly ctx: ToolContext,
    private readonly view: EndoscopeView,
    private readonly target: () => Vector3,
  ) {}

  classify(_hit: PointerHit): TargetClass {
    return null;
  }

  private tipFor(hit: PointerHit): Vector3 {
    return hit.point.clone().addScaledVector(hit.normal, 1.5);
  }

  update(_dt: number, hit: PointerHit | null): void {
    if (this.parked) return;
    if (hit) this.view.show(this.tipFor(hit), this.target());
    else this.view.hide();
  }

  down(hit: PointerHit | null): void {
    if (this.parked) {
      this.ctx.field.remove(this.parked);
      this.parked = null;
      if (!hit) this.view.hide();
      return;
    }
    if (!hit) return;
    // Leave a copy of the scope where it is.
    const copy = buildEndoscope();
    this.model.updateMatrixWorld();
    copy.applyMatrix4(this.model.matrixWorld);
    this.ctx.field.add(copy);
    this.parked = copy;
    this.parkedTip.copy(this.tipFor(hit));
    this.view.show(this.parkedTip, this.target());
  }

  deactivate(): void {
    if (!this.parked) this.view.hide();
  }

  status(): string {
    return t(this.parked ? 'status.endoHeld' : 'status.endoFree');
  }
}
