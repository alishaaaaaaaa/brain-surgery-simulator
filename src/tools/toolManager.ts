import {
  Color,
  Group,
  Matrix4,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import { events, type StructureId, type ToolId } from '../core/events';
import type { MicroscopeControls } from '../scene/microscopeControls';
import type { PointerHit, TargetClass, Tool } from './types';

const HIGHLIGHT: Record<Exclude<TargetClass, null>, Color> = {
  target: new Color('#5fe0c6'),
  caution: new Color('#ffb547'),
};

/** Find the structure id of an object (own userData or nearest ancestor's). */
export function structureOf(o: Object3D | null): StructureId | null {
  for (let cur = o; cur; cur = cur.parent) {
    if (cur.userData.structure) return cur.userData.structure as StructureId;
  }
  return null;
}

/**
 * Routes pointer input to the active tool, raycasts the field under the cursor, places the
 * instrument model at the hit point and highlights what the tool would act on
 * (teal = intended target, amber = caution).
 */
export class ToolManager {
  readonly tools: Tool[];
  active: Tool | null = null;
  hit: PointerHit | null = null;

  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private hasPointer = false;
  private pressed = false;
  private lastTip = new Vector3();
  private lastPx = new Vector2();
  private lastObject: Object3D | null = null;
  private lastDistance = 250;
  private readonly cursorRoot = new Group();
  /**
   * Scripted pointer (demo mode): when set, it replaces the mouse — the tool acts on this
   * hit exactly as it would on a real one.
   */
  private override: PointerHit | null = null;
  private highlighted: { material: MeshStandardMaterial; emissive: Color; intensity: number } | null = null;

  constructor(
    tools: Tool[],
    private readonly camera: PerspectiveCamera,
    private readonly dom: HTMLElement,
    private readonly pickables: Object3D[],
    private readonly controls: MicroscopeControls,
    scene: Group | { add(o: Object3D): unknown },
  ) {
    this.tools = tools;
    this.cursorRoot.name = 'toolCursor';
    for (const t of tools) {
      t.model.visible = false;
      // Instruments never cast shadows onto themselves oddly or block picking.
      t.model.traverse((o) => {
        o.castShadow = true;
        o.raycast = () => {};
      });
      this.cursorRoot.add(t.model);
    }
    scene.add(this.cursorRoot);

    dom.addEventListener('pointermove', this.onMove);
    dom.addEventListener('pointerleave', () => {
      this.hasPointer = false;
    });
    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKey);
  }

  select(id: ToolId | null): void {
    const next = id ? (this.tools.find((t) => t.id === id) ?? null) : null;
    if (next === this.active) return;
    if (this.pressed) this.release();
    this.active?.deactivate?.();
    if (this.active) this.active.model.visible = false;
    this.active = next;
    this.active?.activate?.();
    // With no instrument in hand, a plain left-drag moves the microscope.
    this.controls.leftDragTilts = next === null;
    this.clearHighlight();
    events.emit('toolChanged', { tool: next?.id ?? null });
  }

  /** Millimetres per screen pixel at the focal distance (for drag-based tools). */
  mmPerPixel(): number {
    return (2 * this.lastDistance * Math.tan(((this.camera.fov / 2) * Math.PI) / 180)) / this.dom.clientHeight;
  }

  private onMove = (e: PointerEvent): void => {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.hasPointer = true;
    if (this.pressed && this.active) {
      this.pick();
      const tip = this.hit?.point ?? this.lastTip;
      const dx = e.clientX - this.lastPx.x;
      const dy = e.clientY - this.lastPx.y;
      // Tip travel along the surface. When the ray jumps to a different object (e.g. from
      // the dome to a vessel behind it) the depth jump is not real movement, so it is
      // ignored; travel is also capped by how far the pointer moved on screen.
      let moved = 0;
      if (this.hit && this.hit.object === this.lastObject) {
        moved = Math.min(tip.distanceTo(this.lastTip), Math.hypot(dx, dy) * this.mmPerPixel() * 1.5);
      }
      this.active.drag?.(this.hit, moved, dx, dy);
      this.lastTip.copy(tip);
      this.lastObject = this.hit?.object ?? null;
      this.lastPx.set(e.clientX, e.clientY);
    }
  };

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || e.altKey || e.shiftKey || !this.active) return;
    this.pressed = true;
    this.dom.setPointerCapture?.(e.pointerId);
    this.pick();
    if (this.hit) this.lastTip.copy(this.hit.point);
    this.lastObject = this.hit?.object ?? null;
    this.lastPx.set(e.clientX, e.clientY);
    this.active.down?.(this.hit);
  };

  private onUp = (): void => {
    if (this.pressed) this.release();
  };

  private release(): void {
    this.pressed = false;
    this.active?.up?.(this.hit);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
    if (this.active?.keydown?.(e)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      this.select(null);
      return;
    }
    const tool = this.tools.find((t) => t.key === e.key);
    if (tool) this.select(this.active === tool ? null : tool.id);
  };

  /** Demo mode: aim the instrument at a hit (null returns control to the mouse). */
  setOverride(hit: PointerHit | null): void {
    this.override = hit;
    if (!hit && this.pressed) this.release();
  }

  /** Demo mode: press, drag and release the instrument on scripted hits. */
  simDown(hit: PointerHit): void {
    if (!this.active) return;
    this.override = hit;
    this.hit = hit;
    this.pressed = true;
    this.lastTip.copy(hit.point);
    this.lastObject = hit.object;
    this.active.down?.(hit);
  }

  simMove(hit: PointerHit): void {
    const moved = hit.object === this.lastObject ? hit.point.distanceTo(this.lastTip) : 0;
    this.override = hit;
    this.hit = hit;
    if (this.pressed) this.active?.drag?.(hit, moved, 0, 0);
    this.lastTip.copy(hit.point);
    this.lastObject = hit.object;
  }

  simUp(): void {
    if (this.pressed) this.release();
  }

  private pick(): void {
    if (this.override) {
      this.hit = this.override;
      return;
    }
    if (!this.hasPointer) {
      this.hit = null;
      return;
    }
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.pickables.filter((o) => o.visible && o.parent?.visible !== false),
      false,
    );
    const ignores = this.active?.ignores;
    const h = ignores ? hits.find((x) => !ignores.has(structureOf(x.object)!)) : hits[0];
    if (!h) {
      this.hit = null;
      return;
    }
    const structure = structureOf(h.object);
    const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new Vector3(0, 0, 1);
    if (normal.dot(this.raycaster.ray.direction) > 0) normal.negate();
    this.lastDistance = h.distance;
    this.hit = structure ? { point: h.point.clone(), normal, object: h.object, structure, distance: h.distance } : null;
  }

  update(dt: number): void {
    const tool = this.active;
    this.pick();
    tool?.update?.(dt, this.hit, this.pressed);

    // Cursor model.
    if (tool) {
      let visible: boolean;
      if (tool.placeModel) {
        visible = tool.placeModel(this.hit, this.camera);
      } else {
        visible = this.hasPointer || this.override !== null;
        this.placeInstrument(tool);
      }
      tool.model.visible = visible;
    }
    this.dom.style.cursor = tool && this.hasPointer && !this.override ? 'none' : '';

    // Hover highlight.
    const cls = tool && this.hit ? tool.classify(this.hit) : null;
    this.setHighlight(cls && this.hit ? this.highlightTarget(this.hit.object) : null, cls);
  }

  /** Instruments rest on the surface and enter the field from the surgeon's hand side. */
  private placeInstrument(tool: Tool): void {
    const m = tool.model;
    const tip = new Vector3();
    if (this.hit) {
      tip.copy(this.hit.point).addScaledVector(this.hit.normal, 0.15);
    } else {
      this.raycaster.setFromCamera(this.ndc, this.camera);
      this.raycaster.ray.at(this.lastDistance, tip);
    }
    const back = new Vector3().subVectors(this.camera.position, tip).normalize();
    const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    // Hands work from below the field: shafts come in from the bottom corners.
    const Y = back
      .clone()
      .addScaledVector(up, -0.42)
      .addScaledVector(right, tool.hand === 'right' ? 0.3 : -0.3)
      .normalize();
    const X = new Vector3().crossVectors(Y, back).normalize();
    if (X.lengthSq() < 1e-6) X.copy(right);
    const Z = new Vector3().crossVectors(X, Y);
    m.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z));
    m.position.copy(tip);
  }

  private highlightTarget(o: Object3D): Mesh {
    const ad = o.userData.adhesion as { mesh: Mesh } | undefined;
    return (ad?.mesh ?? o) as Mesh;
  }

  private setHighlight(mesh: Mesh | null, cls: TargetClass): void {
    const material = mesh ? (mesh.material as MeshStandardMaterial) : null;
    if (!material || !('emissive' in material) || !cls) {
      this.clearHighlight();
      return;
    }
    if (this.highlighted?.material !== material) {
      this.clearHighlight();
      this.highlighted = { material, emissive: material.emissive.clone(), intensity: material.emissiveIntensity };
    }
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    material.emissive.copy(HIGHLIGHT[cls]);
    material.emissiveIntensity = 0.12 + 0.1 * pulse;
  }

  private clearHighlight(): void {
    if (!this.highlighted) return;
    this.highlighted.material.emissive.copy(this.highlighted.emissive);
    this.highlighted.material.emissiveIntensity = this.highlighted.intensity;
    this.highlighted = null;
  }

  /** Whether the left button is held on the field with a tool. */
  get isPressed(): boolean {
    return this.pressed;
  }
}
