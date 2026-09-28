import { MathUtils, type PerspectiveCamera, Vector3 } from 'three';
import { microscope } from '../config/anatomy';

type DragMode = 'tilt' | 'pan' | null;

/**
 * Operating-microscope camera.
 *
 * A real microscope has a fixed working distance (the focal length of its objective).
 * The surgeon changes the view by:
 *  - tilting the scope around the focal point (to look "around the corner" of a structure),
 *  - moving (panning) the scope sideways,
 *  - zooming the optics (magnification), which narrows the field of view.
 * This controller reproduces those three motions, with limits so the corridor stays in view.
 */
export class MicroscopeControls {
  /** When true, a plain left-drag tilts (M1 only — from M2 left-drag belongs to the tools). */
  leftDragTilts = true;

  private readonly base = new Vector3(...microscope.target);
  private readonly axis = new Vector3(...microscope.viewAxis).normalize();
  private readonly right = new Vector3();
  private readonly up = new Vector3();

  // Desired and smoothed state.
  private goal = { yaw: 0, pitch: 0, panX: 0, panY: 0, fov: microscope.fov as number };
  private cur = { ...this.goal };

  private drag: DragMode = null;
  private lastX = 0;
  private lastY = 0;
  private readonly keys = new Set<string>();

  /** Point the microscope is centred on (world space). */
  readonly target = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly dom: HTMLElement,
  ) {
    // Screen-aligned frame: right = lateral (+x), up = anterior (+y), for a right-sided approach.
    const forward = this.axis.clone().negate();
    this.right.crossVectors(forward, new Vector3(0, 1, 0)).normalize();
    this.up.crossVectors(this.axis, this.right).normalize();

    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
    this.update(1);
  }

  /** Magnification shown on the HUD (4× at the widest field, rising as the FOV narrows). */
  get magnification(): number {
    return (4 * microscope.fovMax) / this.cur.fov;
  }

  get fov(): number {
    return this.cur.fov;
  }

  reset(): void {
    this.goal = { yaw: 0, pitch: 0, panX: 0, panY: 0, fov: microscope.fov };
  }

  zoomBy(factor: number): void {
    this.goal.fov = MathUtils.clamp(this.goal.fov * factor, microscope.fovMin, microscope.fovMax);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2 || e.button === 1 || (e.button === 0 && (e.altKey || e.shiftKey || this.leftDragTilts))) {
      this.drag = e.button === 1 || e.shiftKey ? 'pan' : 'tilt';
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.dom.setPointerCapture?.(e.pointerId);
      this.dom.classList.add(this.drag === 'pan' ? 'is-panning' : 'is-tilting');
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (this.drag === 'tilt') {
      // Drag moves the scene with the hand, like OrbitControls.
      this.goal.yaw -= dx * 0.0035;
      this.goal.pitch += dy * 0.0035;
      this.clampTilt();
    } else {
      // Pan in millimetres: one screen height covers the visible field height.
      const mmPerPx = (2 * microscope.workingDistance * Math.tan(MathUtils.degToRad(this.cur.fov / 2))) / this.dom.clientHeight;
      this.goal.panX -= dx * mmPerPx;
      this.goal.panY += dy * mmPerPx;
      this.clampPan();
    }
  };

  private onPointerUp = (): void => {
    this.drag = null;
    this.dom.classList.remove('is-panning', 'is-tilting');
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // Trackpad pinch arrives as ctrl+wheel with small deltas; treat both the same way.
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomBy(Math.exp(delta * (e.ctrlKey ? 0.01 : 0.0012)));
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
    if (e.key.startsWith('Arrow')) {
      this.keys.add(e.key);
      e.preventDefault();
    } else if (e.key === '+' || e.key === '=') {
      this.zoomBy(0.85);
    } else if (e.key === '-' || e.key === '_') {
      this.zoomBy(1 / 0.85);
    }
  };

  private clampTilt(): void {
    const max = MathUtils.degToRad(microscope.maxTilt);
    const len = Math.hypot(this.goal.yaw, this.goal.pitch);
    if (len > max) {
      this.goal.yaw *= max / len;
      this.goal.pitch *= max / len;
    }
  }

  private clampPan(): void {
    this.goal.panX = MathUtils.clamp(this.goal.panX, -microscope.panLimit.x, microscope.panLimit.x);
    this.goal.panY = MathUtils.clamp(this.goal.panY, -microscope.panLimit.y, microscope.panLimit.y);
  }

  update(dt: number): void {
    // Keyboard panning (held arrows), speed scales with the field of view.
    if (this.keys.size) {
      const speed = 0.9 * this.cur.fov * dt * 6;
      if (this.keys.has('ArrowLeft')) this.goal.panX -= speed;
      if (this.keys.has('ArrowRight')) this.goal.panX += speed;
      if (this.keys.has('ArrowUp')) this.goal.panY += speed;
      if (this.keys.has('ArrowDown')) this.goal.panY -= speed;
      this.clampPan();
    }

    // Critically-damped-ish smoothing: the scope has some mass.
    const k = 1 - Math.exp(-dt * 10);
    for (const key of Object.keys(this.goal) as (keyof typeof this.goal)[]) {
      this.cur[key] += (this.goal[key] - this.cur[key]) * k;
    }

    this.target.copy(this.base).addScaledVector(this.right, this.cur.panX).addScaledVector(this.up, this.cur.panY);
    const dir = this.axis
      .clone()
      .addScaledVector(this.right, Math.tan(this.cur.yaw))
      .addScaledVector(this.up, Math.tan(this.cur.pitch))
      .normalize();
    this.camera.position.copy(this.target).addScaledVector(dir, microscope.workingDistance);
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.target);
    if (Math.abs(this.camera.fov - this.cur.fov) > 1e-4) {
      this.camera.fov = this.cur.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
