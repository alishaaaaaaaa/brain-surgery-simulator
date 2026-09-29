import { buildReticle } from '../instruments';
import type { PointerHit, TargetClass, Tool, ToolContext } from '../types';

/**
 * ICG videoangiography: click to inject indocyanine green. The microscope switches to its
 * near-infrared view for a few seconds while the dye passes through the arteries.
 * After clipping: the ICA, PCom and anterior choroidal artery should fill; the aneurysm
 * should stay dark.
 */
export class IcgTool implements Tool {
  readonly id = 'icg' as const;
  readonly key = '7';
  readonly labelKey = 'tool.icg' as const;
  readonly hintKey = 'hint.icg' as const;
  readonly hand = 'right' as const;
  readonly model = buildReticle();

  constructor(
    private readonly ctx: ToolContext,
    private readonly inject: () => void,
  ) {}

  classify(_hit: PointerHit): TargetClass {
    return null;
  }

  down(): void {
    this.inject();
    this.ctx.toasts.show('toast.icgInjected', 'info', 2000);
  }
}
