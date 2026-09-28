import { events, type ToolId } from '../core/events';
import type { ClipTool } from '../tools/impl/clip';
import type { ToolManager } from '../tools/toolManager';
import { h, tr } from './dom';
import { applyTranslations, t } from './i18n';

/** Minimal line icons (24×24, stroke = currentColor). */
const ICONS: Record<ToolId, string> = {
  suction: '<path d="M5 20 11 14c2-2 3-4 4-6l2-4"/><circle cx="17.5" cy="3.8" r="1.2"/>',
  scissors: '<path d="M6 21 13.5 9M18 21 10.5 9M13.5 9 15 3M10.5 9 9 3"/><circle cx="12" cy="11" r="1"/>',
  bipolar: '<path d="M9 21 11.2 4M15 21 12.8 4"/><path d="M10.2 12h3.6" opacity=".5"/>',
  dissector: '<path d="M5 21 15 8"/><circle cx="16.3" cy="6.4" r="1.8"/>',
  spatula: '<path d="M7 22 10 14"/><path d="M9 14h6l-1-11h-4z"/>',
  clip: '<circle cx="12" cy="4.5" r="2"/><path d="M11 6.5 9 21M13 6.5 15 21"/>',
  icg: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  doppler: '<path d="M4 21 11 14"/><circle cx="12" cy="13" r="1.3"/><path d="M15 10a4 4 0 0 1 0 6M17.5 7.5a7.5 7.5 0 0 1 0 11"/>',
  endoscope: '<path d="M4 20 15 9"/><circle cx="17" cy="7" r="2.6"/><circle cx="17" cy="7" r="1" />',
  tempClip: '<circle cx="12" cy="6" r="1.6"/><path d="M11.2 7.6 10 16M12.8 7.6 14 16"/><path d="M8 20h8" />',
};

function icon(id: ToolId): SVGSVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id]}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

/**
 * Bottom toolbar: one button per instrument (number keys 1–0), a hint line for the tool in
 * hand, live status (e.g. clip rotation/depth, retraction) and clip options.
 */
export function mountToolbar(root: HTMLElement, manager: ToolManager, clip: ClipTool): { refresh(): void } {
  const buttons = new Map<ToolId, HTMLButtonElement>();
  const row = h('div', { class: 'tool-row', role: 'toolbar', 'aria-label': 'Instruments' });
  for (const tool of manager.tools) {
    const b = h(
      'button',
      { type: 'button', class: 'tool-btn', 'aria-pressed': 'false' },
      h('span', { class: 'tool-key mono' }, tool.key),
      icon(tool.id),
      tr('span', tool.labelKey, { class: 'tool-label' }),
    );
    if (tool.comingIn) b.append(h('span', { class: 'tool-badge mono' }, tool.comingIn));
    b.addEventListener('click', () => manager.select(manager.active === tool ? null : tool.id));
    buttons.set(tool.id, b);
    row.append(b);
  }

  const hint = h('span', { class: 'tool-hint' });
  const status = h('span', { class: 'tool-status mono' });

  // Clip options: straight/curved and blade length.
  const shapeBtns = (['straight', 'curved'] as const).map((shape) => {
    const b = tr('button', shape === 'straight' ? 'clip.straight' : 'clip.curved', { type: 'button' });
    b.addEventListener('click', () => {
      clip.setShape(shape);
      refresh();
    });
    return [shape, b] as const;
  });
  const lengthBtns = [5, 7, 9].map((mm) => {
    const b = h('button', { type: 'button', class: 'mono' }, `${mm}`);
    b.addEventListener('click', () => {
      clip.setLength(mm);
      refresh();
    });
    return [mm, b] as const;
  });
  const options = h(
    'div',
    { class: 'tool-options' },
    h('div', { class: 'seg' }, ...shapeBtns.map(([, b]) => b)),
    tr('span', 'clip.length', { class: 'k' }),
    h('div', { class: 'seg' }, ...lengthBtns.map(([, b]) => b)),
  );

  const info = h('div', { class: 'tool-info' }, hint, status, options);
  const bar = h('div', { class: 'toolbar panel' }, info, row);
  root.append(bar);
  applyTranslations(bar);

  function refresh(): void {
    const active = manager.active;
    for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(active?.id === id));
    hint.textContent = active ? t(active.hintKey) : t('tool.none');
    status.textContent = active?.status?.() ?? '';
    options.hidden = active?.id !== 'clip';
    for (const [shape, b] of shapeBtns) b.setAttribute('aria-pressed', String(clip.shape === shape));
    for (const [mm, b] of lengthBtns) b.setAttribute('aria-pressed', String(clip.length === mm));
  }

  events.on('toolChanged', refresh);
  events.on('languageChanged', refresh);
  refresh();
  return { refresh };
}
