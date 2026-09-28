/** Tiny DOM helper: h('div', { class: 'x' }, child, 'text'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  el.append(...children);
  return el;
}

/** Element whose text is translated (and re-translated on language change). */
export function tr<K extends keyof HTMLElementTagNameMap>(tag: K, key: string, attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  return h(tag, { ...attrs, 'data-i18n': key });
}
