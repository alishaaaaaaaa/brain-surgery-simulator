import { events } from '../core/events';
import { h } from './dom';
import { getLang, setLang, type Lang } from './i18n';

/** EN | FR segmented toggle. Several can exist (start screen + HUD); they stay in sync. */
export function langToggle(): HTMLElement {
  const langs: Lang[] = ['en', 'fr'];
  const buttons = langs.map((l) => {
    const b = h('button', { type: 'button', lang: l, 'aria-pressed': String(getLang() === l) }, l.toUpperCase());
    b.addEventListener('click', () => setLang(l));
    return b;
  });
  events.on('languageChanged', ({ lang }) => {
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(langs[i] === lang)));
  });
  return h('div', { class: 'lang-toggle', role: 'group', 'aria-label': 'Language / Langue' }, ...buttons);
}
