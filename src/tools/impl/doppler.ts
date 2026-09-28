import { events, type StructureId } from '../../core/events';
import type { Heart } from '../../core/heart';
import { buildDopplerProbe } from '../instruments';
import { isArtery, isSac } from '../rules';
import type { PointerHit, TargetClass, Tool, ToolContext } from '../types';

/**
 * Micro-Doppler probe: press the tip on a vessel to hear its flow — a pulsatile whoosh
 * when blood is moving, silence when flow is blocked. Used after clipping to confirm the
 * parent artery, PCom and AChA still flow and the sac does not.
 */
export class DopplerTool implements Tool {
  readonly id = 'doppler' as const;
  readonly key = '8';
  readonly labelKey = 'tool.doppler' as const;
  readonly hintKey = 'hint.doppler' as const;
  readonly hand = 'right' as const;
  readonly model = buildDopplerProbe();
  readonly ignores = new Set<StructureId>(['adhesion', 'csf']);
  private contact: StructureId | null = null;

  /**
   * Flow (0..1) in a structure. Everything flows for now; M5 plugs in the flow model so
   * clipped or occluded vessels fall silent.
   */
  flowOf: (s: StructureId) => number = () => 1;

  constructor(
    private readonly ctx: ToolContext,
    private readonly heart: Heart,
  ) {}

  classify(hit: PointerHit): TargetClass {
    return isArtery(hit.structure) || isSac(hit.structure) ? 'target' : null;
  }

  update(_dt: number, hit: PointerHit | null, pressed: boolean): void {
    const s = pressed && hit && (isArtery(hit.structure) || isSac(hit.structure)) ? hit.structure : null;
    if (s !== this.contact) {
      this.contact = s;
      events.emit('dopplerContact', { structure: s });
    }
    const level = s ? this.flowOf(s) : 0;
    // Flow inside an aneurysm sac is swirling and turbulent.
    this.ctx.audio.setDoppler(level, this.heart.pulse, s !== null && isSac(s));
  }

  deactivate(): void {
    this.contact = null;
    this.ctx.audio.setDoppler(0, 0);
  }
}
