/**
 * The copy control: zodal's `copyable` affordance, drawn (zodal-ui-vanilla#21).
 *
 * One button for every value worth copying. It copies inside the user's tap (iOS Safari refuses
 * a clipboard write that waited on anything), and it answers on itself (zodal ADR 0001): pressed
 * at once (`wirePress`), then a check and "Copied" for {@link COPIED_MS}, announced to screen
 * readers, and a short buzz where the device has one (never the only signal). When every copy
 * path fails, the value's own field is selected so the device's Copy finishes the job, and the
 * button says "Selected".
 *
 * Icon-only beside a value that is on screen (its accessible name says what is copied); with a
 * visible label where the value is not shown. Starter: thorwhalen/annals `copyButton`/`copyField`.
 */

import { el } from './dom.js';
import { FEEDBACK_MS } from './action-feedback.js';
import { wirePress } from './press.js';

/** How long "Copied" stays (a beat longer than the flow threshold); "Selected" stays twice that. */
export const COPIED_MS = FEEDBACK_MS.flow + 600;
const HAPTIC_MS = 12;

/** How a copy ended. */
export type CopyOutcome = 'copied' | 'selected' | 'failed';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Two plain geometric icons (no icon set needed): two offset sheets, and a check mark. */
const ICON_PATHS: Record<'copy' | 'check', string> = {
  copy: 'M9 9h10v12H9zM5 15V3h10',
  check: 'M4 12l5 5L20 6',
};

function icon(name: 'copy' | 'check', doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
    svg.setAttribute(k, v);
  }
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.appendChild(path);
  return svg;
}

/** The legacy copy path: a hidden, editable 16px textarea (iOS selects nothing in a read-only one). */
function copyByCommand(text: string, doc: Document): boolean {
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('aria-hidden', 'true');
  Object.assign(area.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0', fontSize: '16px' });
  doc.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return typeof doc.execCommand === 'function' && doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

function selectAll(target: HTMLElement | null | undefined): boolean {
  if (!target) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    target.focus();
    target.select();
    return true;
  }
  const sel = target.ownerDocument.defaultView?.getSelection();
  if (!sel) return false;
  const range = target.ownerDocument.createRange();
  range.selectNodeContents(target);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

/**
 * Copy `text`, starting inside the current user gesture: the async clipboard API where it exists
 * (secure contexts), else `execCommand('copy')`; when both fail, select `selectTarget` so the
 * device's own Copy finishes it.
 */
export function copyText(
  text: string,
  selectTarget?: HTMLElement | (() => HTMLElement | null | undefined) | null,
  doc: Document = document,
): Promise<CopyOutcome> {
  const byHand = (): CopyOutcome => {
    if (copyByCommand(text, doc)) return 'copied';
    const target = typeof selectTarget === 'function' ? selectTarget() : selectTarget;
    return selectAll(target) ? 'selected' : 'failed';
  };
  const nav = doc.defaultView?.navigator;
  if (nav?.clipboard?.writeText && doc.defaultView?.isSecureContext !== false) {
    // Called synchronously, so the write starts inside the tap.
    return nav.clipboard.writeText(text).then(() => 'copied' as const, byHand);
  }
  return Promise.resolve(byHand());
}

const statusRegions = new WeakMap<Document, HTMLElement>();
function announce(doc: Document, message: string): void {
  let region = statusRegions.get(doc);
  if (!region || !region.isConnected) {
    region = el('div', { role: 'status', 'aria-live': 'polite', class: 'zodal-sr-only' });
    Object.assign(region.style, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' });
    doc.body.appendChild(region);
    statusRegions.set(doc, region);
  }
  const r = region;
  r.textContent = '';
  setTimeout(() => {
    r.textContent = message;
  }, 30);
}

export interface CopyButtonOptions {
  /** The accessible name: what is copied ("Copy link"). Default: `'Copy'`. */
  name?: string;
  /** A visible label, for a value that is not on screen. */
  label?: string;
  /** The field holding the value, selected when copying fails. */
  field?: HTMLElement | (() => HTMLElement | null | undefined);
  /** What is announced on success. Default: `'Copied'`. */
  copied?: string;
  /** Called with each outcome (show "Nothing to copy" or a failure your own way). */
  onOutcome?: (outcome: CopyOutcome | 'empty') => void;
  /** Extra class names. */
  className?: string;
}

/**
 * A copy button for `text` (or a function giving it at press time). Returns the button; it
 * carries `data-state="idle|copied|selected|failed"` for styling.
 */
export function copyButton(text: string | (() => string | null | undefined), options: CopyButtonOptions = {}): HTMLButtonElement {
  const { name = 'Copy', label, field, copied = 'Copied', onOutcome, className } = options;
  const doc = document;
  const glyph = el('span', { class: 'zodal-copy-icon' });
  glyph.appendChild(icon('copy', doc));
  const lbl = label ? el('span', { class: 'zodal-copy-label' }, label) : null;
  const button = el('button', {
    type: 'button',
    class: `zodal-copy-btn ${lbl ? 'with-label' : 'icon-only'}${className ? ` ${className}` : ''}`,
    'aria-label': lbl ? undefined : name,
    title: name,
    'data-state': 'idle',
  }, glyph, lbl) as HTMLButtonElement;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (state: CopyOutcome | 'idle') => {
    clearTimeout(timer);
    button.setAttribute('data-state', state);
    glyph.replaceChildren(icon(state === 'copied' ? 'check' : 'copy', doc));
    const said = state === 'copied' ? 'Copied' : state === 'selected' ? 'Selected' : null;
    if (lbl) lbl.textContent = said ?? label!;
    else button.setAttribute('aria-label', said ?? name);
    if (state !== 'idle') timer = setTimeout(() => set('idle'), state === 'copied' ? COPIED_MS : 2 * COPIED_MS);
  };

  wirePress(button, () => {
    const value = typeof text === 'function' ? text() : text;
    if (value === null || value === undefined || value === '') {
      onOutcome?.('empty');
      return undefined;
    }
    return copyText(String(value), field, doc).then((how) => {
      set(how);
      if (how === 'copied') {
        announce(doc, copied);
        try {
          doc.defaultView?.navigator?.vibrate?.(HAPTIC_MS);
        } catch {
          /* no buzz: the button already said it */
        }
      }
      onOutcome?.(how);
      return how;
    });
  });
  return button;
}

export interface CopyFieldOptions {
  /** What the field holds (its accessible name). Default: `'Value'`. */
  name?: string;
  /** The button's accessible name. Default: `'Copy'`. */
  copyName?: string;
  copied?: string;
  onOutcome?: CopyButtonOptions['onOutcome'];
  className?: string;
}

/** A value shown in full in a read-only field (selectable by hand), with its copy button beside it. */
export function copyField(value: string, options: CopyFieldOptions = {}): HTMLElement {
  const input = el('input', {
    type: 'text',
    readonly: true,
    value,
    class: 'zodal-copy-value',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': options.name ?? 'Value',
    onFocus: (e: Event) => (e.target as HTMLInputElement).select(),
  }) as HTMLInputElement;
  input.value = value;
  return el('div', { class: `zodal-copy-field${options.className ? ` ${options.className}` : ''}` },
    input,
    copyButton(value, {
      name: options.copyName ?? 'Copy',
      field: input,
      ...(options.copied ? { copied: options.copied } : {}),
      ...(options.onOutcome ? { onOutcome: options.onOutcome } : {}),
    }),
  );
}

/** Touch-sized copy controls; inject once (the renderers do). */
export const COPY_CSS = `
.zodal-copy-btn { display: inline-flex; align-items: center; gap: 4px; min-width: 32px; min-height: 32px; justify-content: center; }
.zodal-copy-btn[data-state="copied"] { color: var(--zodal-success, #15803d); }
.zodal-copy-field { display: flex; align-items: center; gap: 4px; }
.zodal-copy-value { flex: 1; min-width: 0; font-size: 16px; }
@media (pointer: coarse) { .zodal-copy-btn { min-width: 44px; min-height: 44px; } }
`;

const styled = new WeakSet<Document>();
export function installCopyStyles(doc: Document = document): void {
  if (styled.has(doc)) return;
  styled.add(doc);
  doc.head.appendChild(el('style', { 'data-zodal': 'copy' }, COPY_CSS));
}
