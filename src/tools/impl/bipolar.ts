import { CircleGeometry, Color, Mesh, MeshStandardMaterial, PointLight, Quaternion, Vector3 } from 'three';
import { sim } from '../../config/sim';
import { events, type StructureId } from '../../core/events';
import { addRuptureRisk, state } from '../../core/state';
import { buildBipolar } from '../instruments';
import { isArtery, isBrain, isNerve, isSac } from '../rules';
import type { PointerHit, TargetClass, Tool, ToolContext } from '../types';

const MAX_MARKS = 80;

/**
 * Bipolar forceps: coagulates tissue held between the tips. Use it on small bleeding
 * points and small pial vessels. Never on the ICA, M1, A1, PCom, AChA or nerves — heat
 * spreads and can occlude or damage them.
 */
export class BipolarTool implements Tool {
  readonly id = 'bipolar' as const;
  readonly key = '3';
  readonly labelKey = 'tool.bipolar' as const;
  readonly hintKey = 'hint.bipolar' as const;
  readonly hand = 'right' as const;
  readonly model = buildBipolar();
  readonly ignores = new Set<StructureId>(['adhesion', 'csf']);
  private readonly marks: Mesh[] = [];
  private readonly markMaterial = new MeshStandardMaterial({ color: new Color('#d9c6a0'), roughness: 0.8, transparent: true, opacity: 0.85 });
  private readonly spark = new PointLight(new Color('#bfe4ff'), 0, 12, 2);
  private sparkT = 1;
  private closed = 0;
  private pressed = false;

  constructor(private readonly ctx: ToolContext) {
    this.model.add(this.spark);
  }

  classify(hit: PointerHit): TargetClass {
    if (isBrain(hit.structure) || hit.structure === 'blood') return 'target';
    if (isArtery(hit.structure) || isNerve(hit.structure) || isSac(hit.structure)) return 'caution';
    return null;
  }

  down(hit: PointerHit | null): void {
    this.pressed = true;
    if (!hit) return;
    this.ctx.audio.buzz();
    this.sparkT = 0;
    const s = hit.structure;
    // Hemostasis first: is there a bleeding point between the tips?
    const bleed = this.ctx.bleeding.coagulateNear(hit.point);
    if (bleed === 'stopped') {
      state.coagulations++;
      events.emit('coagulated', { structure: s, point: hit.point });
      if (s !== 'blood') this.addMark(hit);
      return;
    }
    if (bleed === 'rupture') {
      this.ctx.toasts.show('toast.bipolarRupture', 'danger', 4000);
      return;
    }
    if (s === 'blood') {
      this.ctx.toasts.show('toast.noBleedHere', 'info');
      return;
    }
    if (isSac(s)) {
      addRuptureRisk(sim.ruptureRisk.bipolarDome * (s === 'bleb' ? sim.ruptureRisk.blebMultiplier : 1));
      this.ctx.toasts.show('toast.bipolarDome', 'danger');
    } else if (isArtery(s)) {
      state.injuries++;
      events.emit('injury', { structure: s, severity: 'major', point: hit.point, normal: hit.normal, tool: this.id });
      this.ctx.toasts.show('toast.bipolarArtery', 'danger');
    } else if (isNerve(s)) {
      state.injuries++;
      events.emit('injury', { structure: s, severity: 'major', point: hit.point, normal: hit.normal, tool: this.id });
      this.ctx.toasts.show('toast.bipolarNerve', 'danger');
    } else if (isBrain(s)) {
      state.coagulations++;
      events.emit('coagulated', { structure: s, point: hit.point });
      this.ctx.toasts.show('toast.coagulated', 'info', 1200);
    }
    this.addMark(hit);
  }

  up(): void {
    this.pressed = false;
  }

  /** Blanched, coagulated tissue left where the tips touched. */
  private addMark(hit: PointerHit): void {
    const mark = new Mesh(new CircleGeometry(0.55 + Math.random() * 0.25, 20), this.markMaterial);
    mark.position.copy(hit.point).addScaledVector(hit.normal, 0.06);
    mark.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), hit.normal));
    this.ctx.field.add(mark);
    this.marks.push(mark);
    if (this.marks.length > MAX_MARKS) this.ctx.field.remove(this.marks.shift()!);
  }

  update(dt: number): void {
    this.closed += ((this.pressed ? 1 : 0) - this.closed) * Math.min(1, dt * 18);
    this.model.setOpen(0.7 * (1 - this.closed));
    this.sparkT += dt;
    this.spark.intensity = this.sparkT < 0.25 ? 30 * (1 - this.sparkT / 0.25) : 0;
  }
}
