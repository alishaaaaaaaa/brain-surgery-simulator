import { buildEndoscope, buildReticle } from '../instruments';
import type { PointerHit, TargetClass, Tool, ToolContext } from '../types';

/**
 * ICG videoangiography: indocyanine green is injected IV and the microscope's
 * near-infrared camera shows it filling the vessels. Full fluorescence view arrives in M5.
 */
export class IcgTool implements Tool {
  readonly id = 'icg' as const;
  readonly key = '7';
  readonly labelKey = 'tool.icg' as const;
  readonly hintKey = 'hint.icg' as const;
  readonly hand = 'right' as const;
  readonly model = buildReticle();
  readonly comingIn = 'M5' as const;
  constructor(private readonly ctx: ToolContext) {}
  classify(_hit: PointerHit): TargetClass {
    return null;
  }
  down(): void {
    this.ctx.toasts.show('toast.comingM5', 'info');
  }
}

/**
 * Endoscope: an angled rigid scope shows what the microscope cannot — behind the
 * aneurysm, where the PCom and perforators hide. Picture-in-picture view arrives in M5.
 */
export class EndoscopeTool implements Tool {
  readonly id = 'endoscope' as const;
  readonly key = '9';
  readonly labelKey = 'tool.endoscope' as const;
  readonly hintKey = 'hint.endoscope' as const;
  readonly hand = 'right' as const;
  readonly model = buildEndoscope();
  readonly comingIn = 'M5' as const;
  constructor(private readonly ctx: ToolContext) {}
  classify(_hit: PointerHit): TargetClass {
    return null;
  }
  down(): void {
    this.ctx.toasts.show('toast.comingM5', 'info');
  }
}
