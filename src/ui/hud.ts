import type { AudioEngine } from '../audio/engine';
import { events } from '../core/events';
import { h, tr } from './dom';
import { applyTranslations, t } from './i18n';
import { langToggle } from './langToggle';

export interface Hud {
  setReadouts(magnification: number, focusDepthMm: number): void;
}

/**
 * Heads-up display: title + language + help button, microscope readouts, and the
 * (collapsible) controls help. Other panels: checklist (left), vitals (top right, M4),
 * toolbar (bottom), mentor (bottom right).
 */
export function mountHud(root: HTMLElement, audio: AudioEngine): Hud {
  const zoom = h('span', { class: 'v' }, '—');
  const focus = h('span', { class: 'v' }, '—');

  const helpBtn = h('button', { type: 'button', class: 'help-btn', 'aria-expanded': 'false' }, '?');
  const muteBtn = h('button', { type: 'button', class: 'help-btn mute-btn', 'aria-pressed': 'false' }, '♪');
  muteBtn.addEventListener('click', () => audio.setMuted(!audio.muted));
  const brand = h('div', { class: 'hud-brand panel' }, tr('span', 'app.title', { class: 'title' }), langToggle(), muteBtn, helpBtn);
  const top = h(
    'div',
    { class: 'hud-top panel', 'aria-live': 'off' },
    h('div', { class: 'readout' }, tr('span', 'hud.zoom', { class: 'k' }), zoom),
    h('div', { class: 'readout' }, tr('span', 'hud.focus', { class: 'k' }), focus),
  );
  const help = h(
    'div',
    { class: 'hud-help panel', hidden: '' },
    tr('h2', 'hud.controls.title'),
    h(
      'ul',
      {},
      tr('li', 'hud.controls.tools'),
      tr('li', 'hud.controls.tool'),
      tr('li', 'hud.controls.noTool'),
      tr('li', 'hud.controls.tilt'),
      tr('li', 'hud.controls.pan'),
      tr('li', 'hud.controls.zoom'),
      tr('li', 'hud.controls.labels'),
      tr('li', 'hud.controls.reset'),
      tr('li', 'hud.controls.focus'),
      tr('li', 'hud.controls.mute'),
      tr('li', 'hud.controls.help'),
    ),
    tr('div', 'hud.milestone', { class: 'milestone' }),
  );
  root.append(brand, top, help);
  applyTranslations(root);

  // Controls help: hidden by default (the checklist lives here); H or ? toggles it.
  const setHelp = (open: boolean) => {
    help.hidden = !open;
    helpBtn.setAttribute('aria-expanded', String(open));
    helpBtn.title = t('hud.help');
    muteBtn.title = t('hud.mute');
  };
  helpBtn.addEventListener('click', () => setHelp(help.hidden));
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.toLowerCase() === 'h') setHelp(help.hidden);
  });
  events.on('languageChanged', () => setHelp(!help.hidden));
  setHelp(false);

  return {
    setReadouts(mag, depth) {
      muteBtn.setAttribute('aria-pressed', String(audio.muted));
      muteBtn.classList.toggle('is-muted', audio.muted);
      zoom.textContent = `${mag.toFixed(1)}×`;
      focus.textContent = `${depth.toFixed(1)} mm`;
    },
  };
}
