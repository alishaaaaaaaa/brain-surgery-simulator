import { formatTime } from '../core/clock';
import type { Procedure } from '../procedure/procedure';
import { h, tr } from './dom';
import { applyTranslations, t } from './i18n';

/**
 * Left panel: the six procedure steps. Done steps show the operation time they were
 * completed at; the current step shows its progress; later steps are locked.
 */
export function mountChecklist(root: HTMLElement, procedure: Procedure): { refresh(): void } {
  const overall = h('span', { class: 'mono pct' }, '0%');
  const items = procedure.stages.map((s, i) => {
    const meta = h('span', { class: 'meta mono' });
    const bar = h('span', { class: 'bar' }, h('i'));
    const li = h(
      'li',
      {},
      h('span', { class: 'idx mono' }, String(i + 1)),
      h('span', { class: 'name' }, tr('span', s.def.titleKey), bar),
      meta,
    );
    return { li, meta, fill: bar.firstElementChild as HTMLElement };
  });
  const panel = h(
    'aside',
    { class: 'checklist panel', 'aria-label': 'Procedure checklist' },
    h('header', {}, tr('h2', 'checklist.title'), overall),
    h('ol', {}, ...items.map((x) => x.li)),
  );
  root.append(panel);
  applyTranslations(panel);

  function refresh(): void {
    procedure.stages.forEach((s, i) => {
      const it = items[i];
      it.li.className = `is-${s.status}`;
      it.li.setAttribute('aria-current', s.status === 'current' ? 'step' : 'false');
      if (s.status === 'done') it.meta.textContent = formatTime(s.completedAt ?? 0);
      else if (s.status === 'current') it.meta.textContent = `${Math.round(procedure.stageProgress(i) * 100)}%`;
      else it.meta.textContent = '';
      it.meta.title = s.status === 'locked' ? t('checklist.locked') : '';
      it.fill.style.width = `${Math.round(procedure.stageProgress(i) * 100)}%`;
    });
    overall.textContent = `${Math.round(procedure.overallProgress * 100)}%`;
  }
  refresh();
  return { refresh };
}
