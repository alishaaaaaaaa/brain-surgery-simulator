import { h } from './dom';
import { t, type I18nKey } from './i18n';

export type ToastLevel = 'info' | 'success' | 'caution' | 'danger';

/**
 * Short feedback messages under the top readouts (e.g. "Arachnoid cut",
 * "Avoid coagulating the ICA"). Repeats of the same message within a few seconds are merged.
 */
export class Toasts {
  private readonly el: HTMLElement;
  private readonly recent = new Map<string, number>();
  onCaution?: () => void;

  constructor(root: HTMLElement) {
    this.el = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    root.append(this.el);
  }

  show(key: I18nKey, level: ToastLevel = 'info', holdMs = 2600): void {
    this.showText(t(key), level, holdMs, key);
  }

  /** Show already-translated text (e.g. with interpolated names). */
  showText(text: string, level: ToastLevel = 'info', holdMs = 2600, dedupeKey = text): void {
    const now = performance.now();
    if ((this.recent.get(dedupeKey) ?? -Infinity) > now - 2500) return;
    this.recent.set(dedupeKey, now);
    if (level === 'caution' || level === 'danger') this.onCaution?.();
    const item = h('div', { class: `toast toast-${level}` }, text);
    this.el.prepend(item);
    while (this.el.children.length > 3) this.el.lastElementChild?.remove();
    requestAnimationFrame(() => item.classList.add('is-in'));
    setTimeout(() => {
      item.classList.remove('is-in');
      setTimeout(() => item.remove(), 300);
    }, holdMs);
  }
}
