import { h, tr } from './dom';
import { applyTranslations } from './i18n';
import { langToggle } from './langToggle';

/** Start screen with the educational-use disclaimer (shown in the selected language). */
export function showStartScreen(root: HTMLElement, onStart: () => void): void {
  const startBtn = tr('button', 'start.button', { class: 'start-btn', type: 'button' });
  const card = h(
    'section',
    { class: 'start-card panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'start-title' },
    h(
      'header',
      {},
      h(
        'div',
        {},
        h('div', { class: 'eyebrow' }, 'Neurosurgery · Microsurgery'),
        tr('h1', 'app.title', { id: 'start-title' }),
        tr('p', 'app.subtitle', { class: 'subtitle' }),
      ),
      langToggle(),
    ),
    h(
      'div',
      { class: 'disclaimer', role: 'note' },
      tr('strong', 'start.disclaimerTitle'),
      tr('p', 'start.disclaimer'),
      tr('p', 'start.anatomyNote'),
    ),
    startBtn,
  );
  const screen = h('div', { class: 'start-screen' }, card);
  root.append(screen);
  applyTranslations(screen);
  startBtn.focus();

  startBtn.addEventListener('click', () => {
    screen.classList.add('is-hidden');
    setTimeout(() => screen.remove(), 600);
    onStart();
  });
}
