import { events } from '../core/events';
import type { Procedure } from '../procedure/procedure';
import { h, tr } from './dom';
import { applyTranslations, t, type I18nKey } from './i18n';

/** An emergency checklist that temporarily takes over the mentor (e.g. rupture). */
export interface Emergency {
  titleKey: I18nKey;
  textKey: I18nKey;
  steps: { labelKey: I18nKey; done: boolean }[];
}

const STORAGE_KEY = 'sim.mentorCollapsed';

/**
 * Bottom-right mentor: a short, calm instruction for the current step, its sub-tasks as
 * checkboxes, and a progress percentage. Collapsible (remembered per browser).
 */
export function mountMentor(
  root: HTMLElement,
  procedure: Procedure,
  emergency: () => Emergency | null = () => null,
  onEndCase?: () => void,
): { refresh(): void } {
  const step = h('span', { class: 'step mono' });
  const pct = h('span', { class: 'pct mono' });
  const toggle = h('button', { type: 'button', class: 'collapse', 'aria-expanded': 'true' });
  const title = h('h3');
  const text = h('p');
  const tasks = h('ul', { class: 'tasks' });
  const fill = h('i');
  const alertTitle = h('h3');
  const alertText = h('p');
  const alertSteps = h('ul', { class: 'tasks' });
  const alert = h('div', { class: 'alert', role: 'alert', hidden: '' }, alertTitle, alertText, alertSteps);
  const endCase = tr('button', 'debrief.endCase', { type: 'button', class: 'end-case' });
  endCase.addEventListener('click', () => onEndCase?.());
  const body = h('div', { class: 'body' }, alert, title, text, tasks, h('div', { class: 'progress' }, fill), h('div', { class: 'foot' }, endCase));
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

  function refreshEmergency(): void {
    const e = emergency();
    alert.hidden = !e;
    panel.classList.toggle('is-emergency', !!e);
    if (!e) return;
    // An emergency always opens the panel.
    if (collapsed) setCollapsed(false);
    alertTitle.textContent = t(e.titleKey);
    alertText.textContent = t(e.textKey);
    alertSteps.replaceChildren(
      ...e.steps.map((s) =>
        h('li', { class: s.done ? 'is-done' : '' }, h('span', { class: 'box', 'aria-hidden': 'true' }, s.done ? '✓' : ''), h('span', { class: 'label' }, t(s.labelKey)), h('span')),
      ),
    );
  }

  function refresh(): void {
    refreshEmergency();
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
