import { type Camera, Group, Matrix4, type Mesh, type Object3D, Vector3 } from 'three';
import { events, type ClipPose, type StructureId } from '../../core/events';
import { t, type I18nKey } from '../../ui/i18n';
import { buildClip, type ClipModel, type ClipShape } from '../clipModel';
import { buildClipApplier } from '../instruments';
import { isArtery, isSac } from '../rules';
import type { PointerHit, TargetClass, Tool, ToolContext } from '../types';

export interface PlacedClip {
  id: number;
  model: ClipModel;
  pose: ClipPose;
  closeT: number;
}

const MAX_PERMANENT = 3;
let nextId = 1;

/**
 * Clip pose for an aim point. The applier comes in from the surgeon's right hand, obliquely
 * down the corridor (like the other instruments), so the clip is seen from the side rather
 * than end-on. `roll` turns the closing direction around the insertion axis (degrees);
 * `depth` advances the blades along it (mm).
 */
export function clipPoseFromView(aim: Vector3, camera: Camera, roll: number, depth: number): ClipPose {
  const sight = aim.clone().sub(camera.position).normalize();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const bladeDir = sight.clone().addScaledVector(up, 0.42).addScaledVector(right, -0.3).normalize();
  const closing = right.clone().addScaledVector(bladeDir, -right.dot(bladeDir)).normalize();
  closing.applyAxisAngle(bladeDir, (roll * Math.PI) / 180);
  return { position: aim.clone().addScaledVector(bladeDir, depth), bladeDir, closingDir: closing };
}

/**
 * Clip applier (permanent aneurysm clip, or temporary clip for proximal control).
 *
 * The clip is inserted along the microscope's line of sight. Before applying:
 *  - aim at the neck (the blades' midpoint sits under the cursor),
 *  - rotate (Q / E) so the blades run parallel to the parent artery,
 *  - set blade depth ([ / ]) so the tips pass just beyond the far side of the neck,
 *  - choose straight/curved and blade length in the toolbar.
 * Click to apply; click an applied clip with the same tool to remove it.
 */
export class ClipTool implements Tool {
  readonly id: 'clip' | 'tempClip';
  readonly key: string;
  readonly labelKey: I18nKey;
  readonly hintKey: I18nKey;
  readonly hand = 'right' as const;
  readonly model = new Group();
  readonly ignores = new Set<StructureId>(['adhesion', 'csf']);

  shape: ClipShape = 'straight';
  length = 7;
  /** Rotation of the closing direction around the insertion axis (degrees). */
  roll = 0;
  /** Blade advance along the insertion axis (mm, + = deeper). */
  depth = 0;

  private ghost!: ClipModel;
  private readonly applier: Group;
  readonly placed: PlacedClip[] = [];
  private lastPose: ClipPose | null = null;

  constructor(
    private readonly ctx: ToolContext,
    readonly kind: 'permanent' | 'temporary',
  ) {
    this.id = kind === 'permanent' ? 'clip' : 'tempClip';
    this.key = kind === 'permanent' ? '6' : '0';
    this.labelKey = kind === 'permanent' ? 'tool.clip' : 'tool.tempClip';
    this.hintKey = kind === 'permanent' ? 'hint.clip' : 'hint.tempClip';
    if (kind === 'temporary') this.length = 5;
    this.applier = buildClipApplier(kind === 'temporary' ? 0.7 : 1);
    this.rebuildGhost();
  }

  /** Rebuild the preview when shape/length change. */
  rebuildGhost(): void {
    if (this.ghost) this.model.remove(this.ghost);
    this.ghost = buildClip({ shape: this.shape, length: this.length, kind: this.kind });
    this.ghost.setGhost(true);
    this.model.add(this.ghost);
    // The applier jaws grip the clip head.
    this.applier.position.set(0, this.length / 2 + (this.kind === 'temporary' ? 2.4 : 3.2), 0);
    this.ghost.add(this.applier);
  }

  setShape(shape: ClipShape): void {
    if (this.kind === 'temporary') return;
    this.shape = shape;
    this.rebuildGhost();
  }

  setLength(mm: number): void {
    this.length = mm;
    this.rebuildGhost();
  }

  classify(hit: PointerHit): TargetClass {
    const s = hit.structure;
    if (s === (this.kind === 'permanent' ? 'clip' : 'tempClip')) return 'target';
    if (this.kind === 'temporary') return s === 'ica' ? 'target' : isArtery(s) || isSac(s) ? 'caution' : null;
    if (isSac(s)) return 'target';
    if (isArtery(s) || s === 'oculomotorNerve' || s === 'opticNerve') return 'caution';
    return null;
  }

  /** Pose of the clip for the current cursor hit. */
  private poseFor(hit: PointerHit, camera: Camera): ClipPose {
    return clipPoseFromView(hit.point, camera, this.roll, this.depth);
  }

  private applyPose(model: Group, pose: ClipPose): void {
    const Y = pose.bladeDir.clone().negate(); // local +Y points back toward the head
    const X = pose.closingDir.clone();
    const Z = new Vector3().crossVectors(X, Y);
    model.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z));
    model.position.copy(pose.position);
  }

  placeModel(hit: PointerHit | null, camera: Camera): boolean {
    if (!hit) return false;
    this.lastPose = this.poseFor(hit, camera);
    this.applyPose(this.model, this.lastPose);
    return true;
  }

  keydown(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === 'q') this.roll = (this.roll - 10 + 360) % 360;
    else if (k === 'e') this.roll = (this.roll + 10) % 360;
    else if (e.key === '[') this.depth = Math.max(-4, this.depth - 0.5);
    else if (e.key === ']') this.depth = Math.min(4, this.depth + 0.5);
    else if (k === 'c' && this.kind === 'permanent') this.setShape(this.shape === 'straight' ? 'curved' : 'straight');
    else return false;
    return true;
  }

  down(hit: PointerHit | null): void {
    if (!hit) return;
    const own = this.kind === 'permanent' ? 'clip' : 'tempClip';
    if (hit.structure === own) {
      this.remove(hit.object);
      return;
    }
    const cls = this.classify(hit);
    if (this.kind === 'temporary') {
      if (hit.structure !== 'ica') {
        this.ctx.toasts.show('toast.tempClipWhere', 'caution');
        return;
      }
      if (this.placed.length) {
        this.ctx.toasts.show('toast.tempClipOne', 'info');
        return;
      }
    } else {
      if (!cls) {
        this.ctx.toasts.show('toast.clipWhere', 'caution');
        return;
      }
      if (this.placed.length >= MAX_PERMANENT) {
        this.ctx.toasts.show('toast.clipMax', 'info');
        return;
      }
    }
    this.apply(hit);
  }

  private apply(hit: PointerHit): void {
    const pose = this.lastPose ?? this.poseFor(hit, this.ctx.camera);
    const model = buildClip({ shape: this.shape, length: this.length, kind: this.kind });
    this.applyPose(model, pose);
    model.setOpen(1);
    const clip: PlacedClip = { id: nextId++, model, pose, closeT: 0 };
    model.traverse((o) => {
      o.userData.structure = this.kind === 'permanent' ? 'clip' : 'tempClip';
      o.userData.placedClip = clip;
      o.castShadow = true;
    });
    this.ctx.field.add(model);
    model.traverse((o) => {
      if ((o as Mesh).isMesh) this.ctx.addPickable(o);
    });
    this.placed.push(clip);
    this.ctx.audio.click();
    if (this.kind === 'permanent') {
      events.emit('clipApplied', { id: clip.id, pose, shape: this.shape, length: this.length });
      this.ctx.toasts.show('toast.clipApplied', 'success');
    } else {
      events.emit('tempClipApplied', { structure: hit.structure, pose });
      this.ctx.toasts.show('toast.tempClipApplied', 'caution', 3200);
    }
  }

  private remove(o: Object3D): void {
    const clip = o.userData.placedClip as PlacedClip | undefined;
    if (!clip) return;
    this.ctx.field.remove(clip.model);
    clip.model.traverse((c) => this.ctx.removePickable(c));
    this.placed.splice(this.placed.indexOf(clip), 1);
    this.ctx.audio.click();
    if (this.kind === 'permanent') {
      events.emit('clipRemoved', { id: clip.id });
      this.ctx.toasts.show('toast.clipRemoved', 'info');
    } else {
      events.emit('tempClipRemoved');
      this.ctx.toasts.show('toast.tempClipRemoved', 'info');
    }
  }

  update(dt: number): void {
    // Applied clips spring shut over a fraction of a second.
    for (const c of this.placed) {
      if (c.closeT >= 1) continue;
      c.closeT = Math.min(1, c.closeT + dt / 0.18);
      c.model.setOpen(1 - c.closeT);
    }
  }

  status(): string {
    const shape = this.kind === 'permanent' ? t(this.shape === 'straight' ? 'clip.straight' : 'clip.curved') + ' · ' : '';
    return `${shape}${this.length} mm · ${t('status.rotation')} ${this.roll}° · ${t('status.depth')} ${this.depth >= 0 ? '+' : ''}${this.depth.toFixed(1)} mm`;
  }
}
