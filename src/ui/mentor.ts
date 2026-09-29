import { events } from '../core/events';
import type { Procedure } from '../procedure/procedure';
import { h, tr } from './dom';
import { applyTranslations, t } from './i18n';

const STORAGE_KEY = 'sim.mentorCollapsed';

/**
 * Bottom-right mentor: a short, calm instruction for the current step, its sub-tasks as
 * checkboxes, and a progress percentage. Collapsible (remembered per browser).
 */
export function mountMentor(root: HTMLElement, procedure: Procedure): { refresh(): void } {
  const step = h('span', { class: 'step mono' });
  const pct = h('span', { class: 'pct mono' });
  const toggle = h('button', { type: 'button', class: 'collapse', 'aria-expanded': 'true' });
  const title = h('h3');
  const text = h('p');
  const tasks = h('ul', { class: 'tasks' });
  const fill = h('i');
  const body = h('div', { class: 'body' }, title, text, tasks, h('div', { class: 'progress' }, fill));
  const panel = h(
    'section',
    { class: 'mentor panel', 'aria-label': 'Mentor' },
    h('header', {}, tr('h2', 'mentor.title'), step, pct, toggle),
    body,
  );
  root.append(panel);
  applyTranslations(panel);

  let collapsed = false;
  try {
    collapsed = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    /* storage unavailable */
  }
  const setCollapsed = (c: boolean) => {
    collapsed = c;
    panel.classList.toggle('is-collapsed', c);
    toggle.setAttribute('aria-expanded', String(!c));
    toggle.setAttribute('aria-label', t(c ? 'mentor.expand' : 'mentor.collapse'));
    toggle.textContent = c ? '+' : '−';
    try {
      localStorage.setItem(STORAGE_KEY, c ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  toggle.addEventListener('click', () => setCollapsed(!collapsed));
  setCollapsed(collapsed);

  // Rebuild the task list only when the step (or language) changes; tick states update live.
  let shownStage = -1;
  const rows: { li: HTMLElement; box: HTMLElement; frac: HTMLElement }[] = [];

  function rebuild(): void {
    shownStage = procedure.current;
    tasks.replaceChildren();
    rows.length = 0;
    const stage = procedure.currentStage;
    if (!stage) {
      title.textContent = t('mentor.complete');
      text.textContent = t('mentor.done');
      return;
    }
    title.textContent = t(stage.def.titleKey);
    text.textContent = t(stage.def.mentorKey);
    for (const task of stage.def.subtasks) {
      const box = h('span', { class: 'box', 'aria-hidden': 'true' });
      const frac = h('span', { class: 'frac mono' });
      const li = h('li', {}, box, h('span', { class: 'label' }, t(task.labelKey)), frac);
      tasks.append(li);
      rows.push({ li, box, frac });
    }
  }

  function refresh(): void {
    if (procedure.current !== shownStage) rebuild();
    const total = procedure.stages.length;
    const stage = procedure.currentStage;
    step.textContent = stage ? t('mentor.step', { n: procedure.current + 1, total }) : t('mentor.complete');
    const p = stage ? procedure.stageProgress(procedure.current) : 1;
    pct.textContent = `${Math.round(p * 100)}%`;
    fill.style.width = `${Math.round(p * 100)}%`;
    stage?.progress.forEach((v, i) => {
      const r = rows[i];
      if (!r) return;
      const done = v >= 1;
      r.li.classList.toggle('is-done', done);
      r.box.textContent = done ? '✓' : '';
      r.frac.textContent = !done && v > 0 ? `${Math.round(v * 100)}%` : '';
    });
  }

  events.on('languageChanged', () => {
    shownStage = -1;
    setCollapsed(collapsed);
    refresh();
  });
  refresh();
  return { refresh };
}
