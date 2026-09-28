import { Group, Vector3 } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { events } from '../core/events';
import { applyTranslations, type I18nKey } from '../ui/i18n';

export interface LabelAnchor {
  key: I18nKey;
  position: Vector3;
}

/** Anatomy labels (toggle with L). Each is a small tag with a leader dot, drawn in HTML. */
export function buildLabels(anchors: LabelAnchor[]): Group {
  const group = new Group();
  group.name = 'labels';
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
    group.add(obj);
  }
  group.visible = false;
  // Labels may not be attached to the document yet, so translate them directly.
  events.on('languageChanged', () => group.children.forEach((o) => applyTranslations((o as CSS2DObject).element)));
  return group;
}
