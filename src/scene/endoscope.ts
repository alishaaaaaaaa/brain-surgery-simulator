import { ACESFilmicToneMapping, PerspectiveCamera, PointLight, type Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { h, tr } from '../ui/dom';
import { applyTranslations } from '../ui/i18n';

/**
 * Endoscope picture-in-picture. A rigid endoscope slipped past the aneurysm shows what the
 * microscope cannot: the back of the neck, where the PCom, anterior choroidal artery and
 * perforators can hide behind the dome — or be caught by the clip blades.
 *
 * It has its own small canvas (above the eyepiece mask) and renderer, and is lit only by
 * the scope's own light — which also glows in the microscope view.
 */
export class EndoscopeView {
  readonly camera = new PerspectiveCamera(78, 4 / 3, 0.3, 300);
  private readonly light = new PointLight('#fff6ea', 0, 45, 2);
  private readonly frame: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer | null = null;
  active = false;

  constructor(scene: Scene, uiRoot: HTMLElement) {
    this.camera.add(this.light);
    scene.add(this.camera);
    this.canvas = h('canvas', { class: 'endo-screen' });
    this.frame = h(
      'div',
      { class: 'endo-frame', hidden: '' },
      h('div', { class: 'endo-head mono' }, tr('span', 'endo.label'), h('span', {}, '30°')),
      this.canvas,
      h('div', { class: 'endo-vignette' }),
    );
    uiRoot.append(this.frame);
    applyTranslations(this.frame);
  }

  /** Show the view from `tip`, looking at `target`. */
  show(tip: Vector3, target: Vector3): void {
    const dir = target.clone().sub(tip);
    // Keep a little working distance so the lens isn't pressed against the target.
    if (dir.length() < 4) tip = target.clone().addScaledVector(dir.clone().normalize(), -4);
    this.camera.position.copy(tip);
    this.camera.up.set(0, 0, 1);
    if (Math.abs(dir.normalize().z) > 0.95) this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    this.light.intensity = 90;
    if (!this.active) {
      this.active = true;
      this.frame.hidden = false;
    }
  }

  hide(): void {
    if (!this.active) return;
    this.active = false;
    this.frame.hidden = true;
    this.light.intensity = 0;
  }

  render(scene: Scene): void {
    if (!this.active) return;
    if (!this.renderer) {
      // Created lazily: most sessions never use the endoscope.
      this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.toneMapping = ACESFilmicToneMapping;
      this.renderer.shadowMap.enabled = false;
    }
    const w = this.canvas.clientWidth, hgt = this.canvas.clientHeight;
    if (w < 2 || hgt < 2) return;
    const size = this.renderer.getSize(new Vector2());
    if (size.x !== w || size.y !== hgt) {
      this.renderer.setSize(w, hgt, false);
      this.camera.aspect = w / hgt;
      this.camera.updateProjectionMatrix();
    }
    // The environment map belongs to the main renderer's GL context; don't share it.
    const env = scene.environment;
    scene.environment = null;
    this.renderer.render(scene, this.camera);
    scene.environment = env;
  }
}
