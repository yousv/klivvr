/**
 * DOM utility functions and element creation helpers
 */

/**
 * Shorthand for document.getElementById
 */
export const $ = (id: string): HTMLElement | null => document.getElementById(id);

/**
 * Create an element with optional class name
 */
export const mk = (tag: string, cls: string = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

/**
 * Add 'open' class to element
 */
export const open_ = (id: string): void => {
  const el = $(id);
  if (el) el.classList.add('open');
};

/**
 * Remove 'open' class from element
 */
export const close_ = (id: string): void => {
  const el = $(id);
  if (el) el.classList.remove('open');
};

/**
 * Show loader with message
 */
export const showLoader = (msg: string): void => {
  const loaderMsg = $('loader-msg');
  if (loaderMsg) loaderMsg.textContent = msg;
  const loader = $('loader');
  if (loader) loader.style.display = 'flex';
};

/**
 * Hide loader
 */
export const hideLoader = (): void => {
  const loader = $('loader');
  if (loader) loader.style.display = 'none';
};

/**
 * HTML escape utility
 */
export const xe = (s: unknown): string => {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

/**
 * Create a button element with event handler
 */
export function mkBtn(
  cls: string,
  text: string,
  title: string,
  onClick: (this: HTMLButtonElement, ev: MouseEvent) => void
): HTMLButtonElement {
  const b = mk('button', `btn ${cls}`) as HTMLButtonElement;
  b.textContent = text;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Display a toast notification
 */
export function toast(msg: string, type: 'info' | 'ok' | 'err' | 'copy' = 'info'): void {
  const toasts = $('toasts');
  if (!toasts) return;

  const t = mk('div', `toast ${type}`);
  t.innerHTML = `<span class="t-dot"></span><span>${xe(msg)}</span>`;
  toasts.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

/**
 * Get element or throw error
 */
export function getElement(id: string): HTMLElement {
  const el = $(id);
  if (!el) throw new Error(`Element with id "${id}" not found`);
  return el;
}
