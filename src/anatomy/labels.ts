import { Group, Vector3 } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { events } from '../core/events';
import { applyTranslations, type I18nKey } from '../ui/i18n';

export interface LabelAnchor {
  key: I18nKey;
  position: Vector3;
}

/**
 * Anatomy labels, drawn in HTML. All labels toggle with L; a single label can also be
 * flashed for a few seconds (e.g. when a structure is identified).
 */
export class Labels {
  readonly group = new Group();
  private all = false;
  private readonly flashing = new Map<string, number>();

  constructor(anchors: LabelAnchor[]) {
    this.group.name = 'labels';
    for (const a of anchors) {
      const el = document.createElement('div');
      el.className = 'anat-label';
      const text = document.createElement('span');
      text.dataset.i18n = a.key;
      el.append(document.createElement('i'), text);
      applyTranslations(el);
      const obj = new CSS2DObject(el);
      obj.position.copy(a.position);
      obj.center.set(0, 0.5);
      obj.userData.key = a.key;
      this.group.add(obj);
    }
    // Labels may not be attached to the document yet, so translate them directly.
    events.on('languageChanged', () => this.group.children.forEach((o) => applyTranslations((o as CSS2DObject).element)));
    this.apply();
  }

  get showingAll(): boolean {
    return this.all;
  }

  toggleAll(): void {
    this.all = !this.all;
    this.apply();
  }

  /** Show one label for `seconds` (if it exists). */
  flash(key: string, seconds = 3): void {
    if (!this.group.children.some((o) => o.userData.key === key)) return;
    this.flashing.set(key, seconds);
    this.apply();
  }

  update(dt: number): void {
    if (!this.flashing.size) return;
    for (const [k, t] of this.flashing) {
      if (t - dt <= 0) this.flashing.delete(k);
      else this.flashing.set(k, t - dt);
    }
    if (!this.flashing.size) this.apply();
  }

  private apply(): void {
    for (const o of this.group.children) {
      const on = this.all || this.flashing.has(o.userData.key as string);
      o.visible = on;
      (o as CSS2DObject).element.classList.toggle('is-flash', !this.all && on);
    }
    this.group.visible = this.all || this.flashing.size > 0;
  }
}
