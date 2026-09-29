import { formatTime } from '../core/clock';
import { clipVerdict, tipsFor, type CaseSummary } from '../procedure/debrief';
import { h } from './dom';
import { t, type I18nKey } from './i18n';

/**
 * End-of-case debrief: the numbers that matter (time, blood loss, occlusion, rupture, clip
 * result) and a few specific tips. Opens automatically when the last step is complete, or
 * any time via "End case".
 */
export class DebriefScreen {
  private readonly el: HTMLElement;
  private readonly card: HTMLElement;
  private lastSummary: CaseSummary | null = null;

  constructor(
    root: HTMLElement,
    private readonly onRestart: () => void,
  ) {
    this.card = h('section', { class: 'debrief-card panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'debrief-title' });
    this.el = h('div', { class: 'debrief', hidden: '' }, this.card);
    root.append(this.el);
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
      e.stopPropagation(); // keep tool shortcuts from firing behind the dialog
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  show(summary: CaseSummary): void {
    this.lastSummary = summary;
    this.render(summary);
    this.el.hidden = false;
    this.card.querySelector<HTMLButtonElement>('.primary')?.focus();
  }

  hide(): void {
    this.el.hidden = true;
  }

  /** Re-render in the new language if open. */
  refresh(): void {
    if (this.open && this.lastSummary) this.render(this.lastSummary);
  }

  private render(s: CaseSummary): void {
    const verdict = clipVerdict(s);
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const stat = (label: I18nKey, value: string, cls = '') =>
      h('div', { class: `stat ${cls}` }, h('span', { class: 'k' }, t(label)), h('span', { class: 'v mono' }, value));
    const rupture = !s.ruptured ? t('debrief.ruptureNo') : s.ruptureSecured ? t('debrief.ruptureSecured') : t('debrief.ruptureOpen');
    const occl = s.tempOcclusionTotal > 0
      ? t('debrief.occlusionDetail', { total: formatTime(s.tempOcclusionTotal), longest: formatTime(s.tempOcclusionLongest) })
      : '—';
    const c = s.clip;
    const vessel = (occluded: boolean) => (occluded ? t('debrief.occluded') : t('debrief.open'));

    const primary = h('button', { type: 'button', class: 'primary' }, t('debrief.continue'));
    primary.addEventListener('click', () => this.hide());
    const restart = h('button', { type: 'button' }, t('debrief.restart'));
    restart.addEventListener('click', () => this.onRestart());

    this.card.replaceChildren(
      h('header', {}, h('h1', { id: 'debrief-title' }, t('debrief.title')), h('p', { class: 'subtitle' }, t('debrief.subtitle'))),
      h('div', { class: `verdict verdict-${verdict}` }, t(`verdict.${verdict}`)),
      h(
        'div',
        { class: 'stats' },
        stat('debrief.time', formatTime(s.time)),
        stat('debrief.ebl', `${Math.round(s.ebl)} mL`, s.ebl > 250 ? 'is-bad' : ''),
        stat('debrief.occlusion', occl, s.tempOcclusionLongest > 300 ? 'is-bad' : ''),
        stat('debrief.rupture', rupture, s.ruptured ? 'is-bad' : ''),
        stat('debrief.minMep', `${Math.round(s.minMep)}%`, s.minMep < 50 ? 'is-bad' : ''),
        stat('debrief.stages', `${s.stagesDone} / ${s.stagesTotal}`),
      ),
      c.applied
        ? h(
            'div',
            { class: 'stats clip' },
            h('h2', {}, t('debrief.clip')),
            stat('debrief.neckClosure', pct(c.neckClosure), c.neckClosure < 0.9 ? 'is-bad' : ''),
            stat('debrief.residual', `${c.residualNeck.toFixed(1)} mm`, c.residualNeck > 1 ? 'is-bad' : ''),
            stat('debrief.stenosis', pct(c.icaStenosis), c.icaStenosis > 0.3 ? 'is-bad' : ''),
            stat('debrief.pcom', vessel(c.pcomOccluded), c.pcomOccluded ? 'is-bad' : ''),
            stat('debrief.acha', vessel(c.achaOccluded), c.achaOccluded ? 'is-bad' : ''),
          )
        : h('span'),
      h('h2', {}, t('debrief.tips')),
      h('ol', { class: 'tips' }, ...tipsFor(s).map((tip) => h('li', {}, t(tip.key, tip.vars)))),
      h('footer', {}, restart, primary),
    );
  }
}
