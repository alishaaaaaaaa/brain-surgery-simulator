import { type Object3D, type PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';

/**
 * Autofocus: modern microscopes can focus on what is under the surgeon's attention.
 * Here the focal plane follows the surface under the cursor (or the view centre when the
 * cursor is off the field), easing toward it so refocusing feels optical, not instant.
 */
export class Autofocus {
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2(0, 0);
  private readonly goal = new Vector3();
  private hasPointer = false;
  private frame = 0;
  /** Depth of focus below the cortical surface (mm), for the HUD. */
  depth = 0;
  /** Demo mode: focus on this point instead of what is under the mouse. */
  override: Vector3 | null = null;

  constructor(
    private readonly camera: PerspectiveCamera,
    dom: HTMLElement,
    private readonly pickables: Object3D[],
    private readonly focusPoint: Vector3,
    private readonly fallback: Vector3,
  ) {
    dom.addEventListener('pointermove', (e) => {
      const r = dom.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.hasPointer = true;
    });
    dom.addEventListener('pointerleave', () => (this.hasPointer = false));
    this.goal.copy(fallback);
    focusPoint.copy(fallback);
  }

  update(dt: number): void {
    // Raycasting the dense brain meshes every frame is wasteful; every 3rd frame is plenty.
    if (this.override) {
      this.goal.copy(this.override);
    } else if (this.frame++ % 3 === 0) {
      this.raycaster.setFromCamera(this.hasPointer ? this.ndc : new Vector2(0, 0), this.camera);
      const hit = this.raycaster.intersectObjects(this.pickables.filter((o) => o.visible), false)[0];
      this.goal.copy(hit ? hit.point : this.fallback);
    }
    this.focusPoint.lerp(this.goal, 1 - Math.exp(-dt * 6));
    this.depth = -this.focusPoint.z;
  }
}
