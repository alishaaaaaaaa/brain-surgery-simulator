import { h, tr } from './dom';
import { applyTranslations } from './i18n';
import { langToggle } from './langToggle';

export interface Hud {
  setReadouts(magnification: number, focusDepthMm: number): void;
}

/**
 * Minimal M1 heads-up display: title + language, microscope readouts, control help.
 * Space is kept free for the later panels: checklist (left), vitals (top right),
 * toolbar (bottom), mentor (bottom right).
 */
export function mountHud(root: HTMLElement): Hud {
  const zoom = h('span', { class: 'v' }, '—');
  const focus = h('span', { class: 'v' }, '—');

  const brand = h('div', { class: 'hud-brand panel' }, tr('span', 'app.title', { class: 'title' }), langToggle());
  const top = h(
    'div',
    { class: 'hud-top panel', 'aria-live': 'off' },
    h('div', { class: 'readout' }, tr('span', 'hud.zoom', { class: 'k' }), zoom),
    h('div', { class: 'readout' }, tr('span', 'hud.focus', { class: 'k' }), focus),
  );
  const help = h(
    'div',
    { class: 'hud-help panel' },
    tr('h2', 'hud.controls.title'),
    h(
      'ul',
      {},
      tr('li', 'hud.controls.tilt'),
      tr('li', 'hud.controls.pan'),
      tr('li', 'hud.controls.zoom'),
      tr('li', 'hud.controls.labels'),
      tr('li', 'hud.controls.reset'),
      tr('li', 'hud.controls.focus'),
    ),
    tr('div', 'hud.milestone', { class: 'milestone' }),
  );
  root.append(brand, top, help);
  applyTranslations(root);

  return {
    setReadouts(mag, depth) {
      zoom.textContent = `${mag.toFixed(1)}×`;
      focus.textContent = `${depth.toFixed(1)} mm`;
    },
  };
}
