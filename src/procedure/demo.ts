import { type Camera, type Object3D, Vector3 } from 'three';
import type { Anatomy } from '../anatomy';
import type { ArachnoidPatch } from '../anatomy/arachnoid';
import { anatomy as cfg, type VesselId, type VesselSpec } from '../config/anatomy';
import { sim } from '../config/sim';
import type { StructureId, ToolId } from '../core/events';
import { state } from '../core/state';
import type { Bleeding } from '../physics/bleeding';
import type { FlowModel } from '../physics/flow';
import type { Autofocus } from '../scene/autofocus';
import type { MicroscopeControls } from '../scene/microscopeControls';
import type { ClipTool } from '../tools/impl/clip';
import type { ToolManager } from '../tools/toolManager';
import type { PointerHit } from '../tools/types';
import { planClip } from './clipPlanner';
import type { Procedure } from './procedure';

export interface DemoDeps {
  anatomy: Anatomy;
  tools: ToolManager;
  clipTool: ClipTool;
  procedure: Procedure;
  bleeding: Bleeding;
  flow: FlowModel;
  controls: MicroscopeControls;
  autofocus: Autofocus;
  camera: Camera;
  isIcgActive: () => boolean;
}

/** A script step yields how many seconds to wait before continuing. */
type Script = Generator<number, void, void>;

/**
 * Demo mode: performs the operation step by step with the same instruments and rules the
 * learner uses — scripted pointer, real tool code. Any click in the field or key press hands
 * control back to the learner, exactly where the demo left off.
 */
export class DemoDirector {
  running = false;
  private script: Script | null = null;
  private wait = 0;
  onStop?: (byUser: boolean) => void;

  constructor(private readonly d: DemoDeps) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.wait = 0.8;
    this.script = this.run();
  }

  /** Stop and hand control back. */
  stop(byUser = true): void {
    if (!this.running) return;
    this.running = false;
    this.script = null;
    this.d.tools.simUp();
    this.d.tools.setOverride(null);
    this.d.autofocus.override = null;
    this.onStop?.(byUser);
  }

  update(dt: number): void {
    if (!this.running || !this.script) return;
    this.wait -= dt;
    while (this.running && this.wait <= 0) {
      const r = this.script.next();
      if (r.done) {
        this.stop(false);
        return;
      }
      this.wait += r.value;
    }
  }

  // --- Helpers -------------------------------------------------------------------

  /** A hit on `object` at `point`, facing the microscope. */
  private hit(object: Object3D, structure: StructureId, point: Vector3): PointerHit {
    const cam = this.d.camera.position;
    return { point: point.clone(), normal: cam.clone().sub(point).normalize(), object, structure, distance: cam.distanceTo(point) };
  }

  /** The side of a vessel facing the microscope, at parameter t. */
  private onVessel(id: VesselId, t: number): PointerHit {
    const curve = this.d.anatomy.vesselCurves.get(id)!;
    const spec = cfg.vessels[id] as VesselSpec;
    const c = curve.getPointAt(t);
    const r = spec.radius[0] + (spec.radius[1] - spec.radius[0]) * t;
    const p = c.addScaledVector(this.d.camera.position.clone().sub(c).normalize(), r * 0.9);
    return this.hit(this.d.anatomy.vessels.get(id)!, id, p);
  }

  private aim(hit: PointerHit): void {
    this.d.tools.setOverride(hit);
    this.d.autofocus.override = hit.point;
  }

  private *select(id: ToolId | null): Script {
    this.d.tools.select(id);
    yield 0.5;
  }

  private *hover(hit: PointerHit, seconds: number): Script {
    this.aim(hit);
    yield seconds;
  }

  private *click(hit: PointerHit, hold = 0.15): Script {
    this.aim(hit);
    yield 0.45;
    this.d.tools.simDown(hit);
    yield hold;
    this.d.tools.simUp();
    yield 0.35;
  }

  /** Back-and-forth strokes between two points (dissection). */
  private *stroke(a: PointerHit, b: PointerHit, strokes: number): Script {
    this.aim(a);
    yield 0.4;
    this.d.tools.simDown(a);
    for (let i = 0; i < strokes; i++) {
      this.d.tools.simMove(b);
      yield 0.14;
      this.d.tools.simMove(a);
      yield 0.14;
    }
    this.d.tools.simUp();
    yield 0.3;
  }

  private *waitForStage(index: number, timeout = 12): Script {
    for (let t = 0; t < timeout && this.d.procedure.current <= index; t += 0.25) yield 0.25;
  }

  /** Keep the field dry: bipolar on any bleeding point, suction any pooled blood. */
  private *hemostasis(): Script {
    for (let i = 0; i < 6; i++) {
      const p = this.d.bleeding.points.find((b) => b.active && b.kind !== 'rupture');
      if (!p) break;
      yield* this.select('bipolar');
      yield* this.click(this.hit(this.d.anatomy.root, 'frontalLobe', p.position), 0.3);
    }
    if (state.fieldBlood > 1) {
      yield* this.select('suction');
      const layer = this.d.bleeding.layer;
      const at = new Vector3(0, cfg.brain.corridorCenterY - 6, this.d.bleeding.level);
      this.aim(this.hit(layer, 'blood', at));
      yield 0.4;
      this.d.tools.simDown(this.hit(layer, 'blood', at));
      for (let t = 0; t < 8 && state.fieldBlood > 0.2; t += 0.25) yield 0.25;
      this.d.tools.simUp();
    }
  }

  private *cutArachnoid(sheet: 'superficial' | 'middle' | 'deep'): Script {
    const [x0, x1] = sim.procedure.window[sheet];
    const patches = this.d.anatomy.arachnoid.filter((p) => p.sheet === sheet && !p.cut && p.centerX >= x0 && p.centerX <= x1);
    yield* this.select('scissors');
    for (const p of patches) {
      yield* this.click(this.hit(p.mesh, 'arachnoid', this.patchPoint(p)));
      yield 0.5;
      if (this.d.bleeding.activeCount) {
        yield* this.hemostasis();
        yield* this.select('scissors');
      }
    }
  }

  private patchPoint(p: ArachnoidPatch): Vector3 {
    const g = p.mesh.geometry;
    g.computeBoundingBox();
    const z = (g.boundingBox!.min.z + g.boundingBox!.max.z) / 2;
    return new Vector3(p.centerX, cfg.brain.corridorCenterY + 3, z);
  }

  // --- The operation ---------------------------------------------------------------

  private *run(): Script {
    const { anatomy, tools, controls, procedure } = this.d;
    controls.reset();
    yield 0.6;

    // 1. Open the sylvian fissure: superficial, then deeper arachnoid.
    if (procedure.current === 0) {
      yield* this.cutArachnoid('superficial');
      yield* this.cutArachnoid('middle');
      yield* this.hemostasis();
      yield* this.waitForStage(0);
    }

    // 2. Identify M1 and confirm its flow.
    if (procedure.current === 1) {
      yield* this.select(null);
      yield* this.hover(this.onVessel('m1', 0.5), 1.8);
      yield* this.select('doppler');
      yield* this.click(this.onVessel('m1', 0.5), 1.4);
      yield* this.waitForStage(1);
    }

    // 3. Open the carotid cistern; identify the ICA and the optic nerve.
    if (procedure.current === 2) {
      yield* this.cutArachnoid('deep');
      yield* this.hemostasis();
      yield* this.select(null);
      yield* this.hover(this.onVessel('ica', 0.85), 1.8);
      const optic = anatomy.nerveCurves.get('opticNerve')!.getPointAt(0.5);
      const opticHit = this.hit(anatomy.nerves.get('opticNerve')!, 'opticNerve',
        optic.addScaledVector(this.d.camera.position.clone().sub(optic).normalize(), cfg.nerves.opticNerve.radius * 0.6));
      yield* this.hover(opticHit, 1.8);
      yield* this.waitForStage(2);
    }

    // Closer for the fine work at the neck.
    controls.zoomBy(0.72);
    yield 0.8;

    // 4. Confirm the PCom and AChA, then free the neck on both sides.
    if (procedure.current === 3) {
      yield* this.hover(this.onVessel('pcom', 0.3), 1.8);
      yield* this.hover(this.onVessel('acha', 0.3), 1.8);
      yield* this.select('dissector');
      for (const ad of anatomy.adhesions.filter((a) => a.kind === 'neck' && !a.freed)) {
        const mid = ad.from.clone().lerp(ad.to, 0.5);
        const along = ad.to.clone().sub(ad.from).normalize();
        const perp = along.cross(this.d.camera.position.clone().sub(mid).normalize()).normalize();
        const a = this.hit(ad.proxy, 'adhesion', mid.clone().addScaledVector(perp, -0.3));
        const b = this.hit(ad.proxy, 'adhesion', mid.clone().addScaledVector(perp, 0.3));
        yield* this.stroke(a, b, Math.ceil(sim.dissection.strokePerAdhesion / 0.6 / 2) + 1);
      }
      yield* this.waitForStage(3);
    }

    // 5. Clip: plan the placement the tool allows, show it, then apply.
    if (procedure.current === 4) {
      yield* this.select('clip');
      const plan = planClip(this.d.flow, anatomy.aneurysm, this.d.camera, this.d.clipTool.length);
      if (plan) {
        const h = this.hit(anatomy.aneurysm.dome, 'aneurysm', plan.aim.point);
        this.d.clipTool.roll = plan.roll;
        this.d.clipTool.depth = plan.depth;
        yield* this.hover(h, 1.6);
        yield* this.click(h);
      }
      yield* this.waitForStage(4);
    }

    // 6. Confirm: Doppler on ICA, PCom, AChA (flow) and the dome (silent), then ICG.
    if (procedure.current === 5) {
      yield* this.select('doppler');
      yield* this.click(this.onVessel('ica', 0.9), 1.3);
      yield* this.click(this.onVessel('pcom', 0.35), 1.3);
      yield* this.click(this.onVessel('acha', 0.35), 1.3);
      const an = anatomy.aneurysm;
      const dome = an.domeCenter.clone().addScaledVector(this.d.camera.position.clone().sub(an.domeCenter).normalize(), an.domeRadius * 0.95);
      yield* this.click(this.hit(an.dome, 'aneurysm', dome), 1.3);
      yield* this.select('icg');
      yield* this.click(this.hit(anatomy.root, 'floor', controls.target.clone()));
      tools.setOverride(null);
      this.d.autofocus.override = null;
      for (let t = 0; t < 20 && this.d.isIcgActive(); t += 0.5) yield 0.5;
    }
    yield* this.select(null);
  }
}
