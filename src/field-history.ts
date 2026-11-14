/**
 * Field input history for plain DOM: a button beside a text field that lists the field's past
 * values and puts one back.
 *
 * - {@link createFieldHistoryState}`(history, scope)`: a history scope's entries, kept current
 *   (re-read after every write and on the store's optional `subscribe`), and its operations.
 * - {@link historyIcon}: lucide's `rotate-ccw-clock`, drawn inline (ISC notice below).
 * - {@link attachFieldHistory}: the button and the list, wired to an input or textarea. The
 *   button is hidden while the history is empty, named "<label> history", with press feedback
 *   from {@link wirePress}. The list is a native `popover="auto"` (light dismiss and Escape for
 *   free) holding a grid of entries (first line, "+N lines", a relative time, pin and remove), a
 *   filter above {@link HISTORY_FILTER_THRESHOLD} entries, a full-value preview, and "Clear
 *   history" with Undo. Picking an entry records the current value (reason `'pick'`), replaces
 *   the value, closes the list and returns focus to the field; Alt+ArrowDown on the field opens
 *   the list. The package's text and textarea renderers attach it when `context.history` and
 *   `config.history` are both set; an app attaches it to its own fields.
 *
 * The vanilla port of zodal-ui-shadcn's `field-history.ts`. `historyLine`, `relativeTime` and the
 * constants are local copies of `@zodal/ui`'s (the `@zodal/ui` on npm this package builds against
 * predates them). Design: i2mint/zodal `docs/research/field-input-history.md` §4 and §6.4.
 */

import { el } from './dom.js';
import { wirePress } from './press.js';
import type { FieldHistoryStore, HistoryEntry, HistoryReason } from './history-types.js';

/** Above this many entries the list shows a filter (APG recommends type-ahead above 7). */
export const HISTORY_FILTER_THRESHOLD = 7;
/** How long "History cleared. Undo" stays offered, in ms. */
export const HISTORY_UNDO_MS = 10_000;
/** The default smallest touch target under a coarse pointer, in CSS px (WCAG 2.5.5 enhanced). */
export const HISTORY_TOUCH_TARGET_PX = 44;
/** The query that marks a coarse (touch) pointer. */
const COARSE_POINTER = '(pointer: coarse)';
/** Below this width the list is a bottom sheet instead of a popover under the button. */
const NARROW_QUERY = '(max-width: 640px)';
/** A click on the button this soon after a light dismiss is the same gesture: it does not reopen. */
const REOPEN_GUARD_MS = 400;
/** A value longer than this (or with several lines) gets a full-value preview. */
const PREVIEW_CHARS = 60;

// ============================================================================
// Display helpers
// ============================================================================

/** How a value reads in one row: its first non-empty line, and how many more lines it has. */
export function historyLine(value: string): { first: string; extraLines: number } {
  const lines = value.split(/\r\n|\r|\n/);
  const first = lines.find((l) => l.trim() !== '') ?? '';
  return { first: first.trim(), extraLines: lines.length - 1 };
}

/** A compact relative time: "just now", "5 min ago", "2 h ago", "3 d ago", else the date. */
export function relativeTime(at: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(at).toLocaleDateString();
}

function mediaQuery(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

/**
 * The look of the history button and list, at zero specificity (`:where`), so any rule of yours
 * wins. Added once, on first use, unless a `<style data-zodal-history>` is already there (put an
 * empty one in to opt out).
 */
export const HISTORY_CSS = `
:where(.zodal-history-row) { display: flex; align-items: center; gap: 0.25rem; }
:where(.zodal-history-row > .zodal-input) { flex: 1; min-width: 0; }
:where(.zodal-field-head) { display: flex; align-items: flex-end; justify-content: space-between; gap: 0.25rem; }
:where(.zodal-history) { display: inline-flex; }
:where(.zodal-history-button) { display: inline-flex; align-items: center; justify-content: center; padding: 0.375rem; border: 0; border-radius: 0.375rem; background: transparent; color: inherit; opacity: 0.7; cursor: pointer; }
:where(.zodal-history-button[hidden]) { display: none; }
:where(.zodal-history-list) { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.25rem; border: 1px solid #d4d4d8; border-radius: 0.375rem; background: Canvas; color: CanvasText; font-size: 0.875rem; box-shadow: 0 4px 12px rgb(0 0 0 / 0.15); overflow: hidden; }
:where(.zodal-history-grid) { max-height: 18rem; overflow-y: auto; outline: none; }
:where(.zodal-history-entry) { display: flex; align-items: center; gap: 0.25rem; border-radius: 0.25rem; padding: 0 0.25rem; }
:where(.zodal-history-entry[data-active]) { background: color-mix(in srgb, CanvasText 10%, transparent); }
:where(.zodal-history-pick) { display: flex; width: 100%; min-width: 0; align-items: baseline; gap: 0.5rem; padding: 0.375rem 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
:where(.zodal-history-first) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:where(.zodal-history-meta) { flex-shrink: 0; font-size: 0.75rem; opacity: 0.7; }
:where(.zodal-history-time) { margin-left: auto; }
:where(.zodal-history-action) { padding: 0.25rem; border: 0; background: none; color: inherit; font-size: 0.75rem; opacity: 0.7; cursor: pointer; }
:where(.zodal-history-heading) { padding: 0.25rem 0.25rem 0; font-size: 0.75rem; font-weight: 500; opacity: 0.7; }
:where(.zodal-history-preview) { max-height: 10rem; overflow: auto; white-space: pre-wrap; margin: 0; padding: 0.5rem; border-radius: 0.25rem; background: color-mix(in srgb, CanvasText 6%, transparent); font: inherit; font-size: 0.75rem; }
:where(.zodal-history-footer) { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; border-top: 1px solid #e4e4e7; padding-top: 0.25rem; }
:where(.zodal-history-error) { color: #dc2626; font-size: 0.75rem; margin: 0; padding: 0.25rem 0.5rem; }
`;

/** Add {@link HISTORY_CSS} to `doc` once, unless a `<style data-zodal-history>` is already there. */
export function installHistoryStyles(doc: Document = document): void {
  if (doc.querySelector('style[data-zodal-history]')) return;
  const style = doc.createElement('style');
  style.setAttribute('data-zodal-history', '');
  style.textContent = HISTORY_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}

// ============================================================================
// createFieldHistoryState
// ============================================================================

/** What {@link createFieldHistoryState} returns: one scope's entries, kept current, and its operations. */
export interface FieldHistoryState {
  /** Pinned first, then most recent first. Empty while there is no store or scope. */
  readonly entries: HistoryEntry[];
  /** True until the first list has arrived. */
  readonly loading: boolean;
  /** The last list or write failure, cleared by the next success. */
  readonly error: unknown;
  /** Read the scope again (writes made here, or announced by the store's `subscribe`, refresh on their own). */
  refresh(): Promise<void>;
  /** Remember a value in this scope (with the field's cap). Default reason: `'pick'`. */
  record(value: string, reason?: HistoryReason): Promise<void>;
  remove(entry: HistoryEntry): Promise<void>;
  pin(entry: HistoryEntry, pinned?: boolean): Promise<void>;
  /** Forget this scope; resolves with what was removed, for {@link FieldHistoryState.restore}. */
  clear(): Promise<HistoryEntry[]>;
  restore(entries: readonly HistoryEntry[]): Promise<void>;
  /** Be told whenever `entries`, `loading` or `error` change. Returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /** Stop following the store. */
  destroy(): void;
}

/**
 * One history scope for a field: its entries, kept current, and its operations.
 *
 * `history` is the app's store (`createFieldHistory()` from `@zodal/store`), `scope` the field's
 * `config.history.scope`. Either may be undefined: the entries are then empty and the operations
 * do nothing. The list is read at once, after every write made here, and whenever the store's
 * optional `subscribe` announces a change to this scope. Only the latest list lands.
 *
 * @example
 * ```ts
 * const lyrics = createFieldHistoryState(store, 'lyrics', { max: 50 });
 * lyrics.onChange(() => console.log(lyrics.entries.length));
 * ```
 */
export function createFieldHistoryState(
  history: FieldHistoryStore | undefined,
  scope: string | undefined,
  options: { max?: number } = {},
): FieldHistoryState {
  const { max } = options;
  let entries: HistoryEntry[] = [];
  let loading = Boolean(history && scope);
  let error: unknown = undefined;
  let request = 0;
  let destroyed = false;
  const listeners = new Set<() => void>();
  const emit = () => { if (!destroyed) listeners.forEach((l) => l()); };

  const refresh = async () => {
    const id = ++request;
    if (!history || !scope) {
      entries = [];
      loading = false;
      emit();
      return;
    }
    try {
      const list = await history.list(scope);
      if (id === request) { entries = list; error = undefined; }
    } catch (err) {
      if (id === request) error = err;
    } finally {
      if (id === request) { loading = false; emit(); }
    }
  };

  /** Run a write, then read the scope again; a failure is kept in `error` and rethrown. */
  const write = async <R>(job: (store: FieldHistoryStore, scope: string) => Promise<R>, fallback: R): Promise<R> => {
    if (!history || !scope) return fallback;
    try {
      const result = await job(history, scope);
      await refresh();
      return result;
    } catch (err) {
      error = err;
      emit();
      throw err;
    }
  };

  const unsubscribe = history?.subscribe?.((changed) => {
    if (changed === undefined || changed === scope) void refresh();
  });
  void refresh();

  return {
    get entries() { return entries; },
    get loading() { return loading; },
    get error() { return error; },
    refresh,
    record: (value, reason = 'pick') => write((s, sc) => s.record(sc, value, { reason, ...(max !== undefined ? { max } : {}) }), undefined),
    remove: (entry) => write((s) => s.remove(entry.id), undefined),
    pin: (entry, pinned = true) => write((s) => s.pin(entry.id, pinned), undefined),
    clear: () => write((s, sc) => s.clear(sc), [] as HistoryEntry[]),
    restore: (removed) => write((s) => s.restore(removed), undefined),
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    destroy() {
      destroyed = true;
      listeners.clear();
      unsubscribe?.();
    },
  };
}

// ============================================================================
// The icon (lucide rotate-ccw-clock)
// ============================================================================

/*! The path data of historyIcon is lucide's `rotate-ccw-clock` (lucide-react 1.34.0, https://lucide.dev).
 * ISC License. Copyright (c) 2026 Lucide Icons and Contributors.
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose with or without
 * fee is hereby granted, provided that the above copyright notice and this permission notice
 * appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
 * SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
 * AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
 * NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** lucide's `rotate-ccw-clock` (the history glyph), drawn inline as an SVG element (licence above). */
export function historyIcon(size = 16): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs: Record<string, string> = {
    width: String(size), height: String(size), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': 'true', focusable: 'false', 'data-icon': 'rotate-ccw-clock',
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const d of ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2']) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

// ============================================================================
// attachFieldHistory
// ============================================================================

/** What {@link attachFieldHistory} takes. */
export interface FieldHistoryOptions {
  /** The app's history store (`context.history`). Absent: nothing is attached. */
  history: FieldHistoryStore | undefined;
  /** The field's resolved history settings (`config.history`). Absent: nothing is attached. */
  config: { scope: string; max?: number } | undefined;
  /** The field's label ("<label> history"). */
  label: string;
  /** The field: its value is recorded before a pick replaces it; Alt+ArrowDown on it opens the list. */
  field: HTMLInputElement | HTMLTextAreaElement;
  /** Told the picked value, after it is written into `field`. */
  onChange?: (value: string) => void;
  /** The smallest target under a coarse pointer, in px. Default: {@link HISTORY_TOUCH_TARGET_PX}. */
  minTarget?: number;
  /** The clock for relative times. Default: `Date.now`. */
  now?: () => number;
}

/** What {@link attachFieldHistory} returns. */
export interface FieldHistoryHandle {
  /** The button (and, while open, the list): put it beside the field. */
  element: HTMLElement;
  /** The scope's entries and operations. */
  state: FieldHistoryState;
  /** Is the list open? */
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  /** Remove the listeners and stop following the store (also done on its own once `element` leaves the document). */
  destroy(): void;
}

/** A failure as one line for the list. */
function failureText(error: unknown, doing: string): string {
  const reason = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return `Could not ${doing}${reason ? `: ${reason}` : ''}.`;
}

/** Position a popover under `anchor`, right-aligned to it, kept on screen; a bottom sheet when narrow. */
function place(popover: HTMLElement, anchor: HTMLElement | null | undefined): void {
  const narrow = mediaQuery(NARROW_QUERY)?.matches ?? false;
  const s = popover.style;
  s.margin = '0';
  s.position = 'fixed';
  s.zIndex = '50';
  if (narrow || !anchor || anchor.hidden) {
    Object.assign(s, { left: '0', right: '0', bottom: '0', top: 'auto', width: '100%', maxHeight: '70vh' });
    popover.dataset.sheet = '';
    return;
  }
  delete popover.dataset.sheet;
  const r = anchor.getBoundingClientRect();
  const width = Math.min(window.innerWidth - 16, Math.max(280, popover.offsetWidth || 320));
  const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
  Object.assign(s, { top: `${r.bottom + 4}px`, left: `${left}px`, right: 'auto', bottom: 'auto', width: `${width}px`, maxHeight: '60vh' });
}

let listSeq = 0;

/**
 * Attach the history button and list to a text field. Returns `null` when there is no store or
 * no history config. Picking an entry records the field's current value (reason `'pick'`, so a
 * pick never loses typing), writes the picked value into the field, calls `onChange`, closes the
 * list and returns focus to the field with the caret at the end; if the store refuses, the field
 * keeps its value and the list says why. Alt+ArrowDown on the field opens the list. "Clear
 * history" clears at once and offers Undo for {@link HISTORY_UNDO_MS}, even if the list is closed
 * and reopened. The list is a grid (APG's "combobox with grid popup"): ArrowUp/ArrowDown move,
 * Home/End jump, Enter picks, Shift+Delete removes, Escape closes; pin and remove are reachable
 * with Tab.
 *
 * @example
 * ```ts
 * const textarea = el('textarea', { id: 'lyrics' }) as HTMLTextAreaElement;
 * const h = attachFieldHistory({ history: store, config: { scope: 'lyrics' }, label: 'Lyrics',
 *   field: textarea, onChange: (v) => form.lyrics = v });
 * if (h) textarea.after(h.element);
 * ```
 */
export function attachFieldHistory(options: FieldHistoryOptions): FieldHistoryHandle | null {
  const { history, config, label, field, onChange, minTarget = HISTORY_TOUCH_TARGET_PX, now = Date.now } = options;
  if (!history || !config) return null;
  const doc = field.ownerDocument;
  installHistoryStyles(doc);

  const state = createFieldHistoryState(history, config.scope, { max: config.max });
  const listId = `zodal-history-${++listSeq}`;
  const coarseQuery = mediaQuery(COARSE_POINTER);
  let coarse = coarseQuery?.matches ?? false;
  let isOpen = false;
  let error: string | undefined;
  let cleared: readonly HistoryEntry[] | null = null;
  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  let dismissedAt = -Infinity;
  let wasConnected = false;
  let destroyed = false;
  // The open list's parts and view state.
  let list: HTMLElement | null = null;
  let grid: HTMLElement | null = null;
  let filter: HTMLInputElement | null = null;
  let query = '';
  let active = 0;
  let shown: HistoryEntry[] = [];

  const offered = () => state.entries.length + (cleared ? 1 : 0);
  const target = (e: HTMLElement) => {
    e.style.minWidth = coarse ? `${minTarget}px` : '';
    e.style.minHeight = coarse ? `${minTarget}px` : '';
    return e;
  };

  // ---- the button ----
  const button = el('button', {
    type: 'button',
    class: 'zodal-history-button',
    'aria-label': `${label} history`,
    title: `${label} history (Alt+ArrowDown)`,
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
    'aria-controls': listId,
    'data-role': 'history-button',
  }, historyIcon()) as HTMLButtonElement;
  wirePress(button, () => {
    if (isOpen) close('dismiss');
    else if (performance.now() - dismissedAt >= REOPEN_GUARD_MS) open();
  });
  const element = el('span', { class: 'zodal-history', 'data-role': 'field-history' }, button);

  const syncButton = () => {
    button.hidden = offered() <= 0;
    button.setAttribute('aria-expanded', String(isOpen));
    target(button);
  };

  const onCoarse = () => { coarse = coarseQuery?.matches ?? false; syncButton(); if (isOpen) render(); };
  coarseQuery?.addEventListener?.('change', onCoarse);

  const focusField = () => {
    field.focus();
    const end = field.value.length;
    try { field.setSelectionRange(end, end); } catch { /* not a text control */ }
  };

  /** Run a store action; a failure is shown in the list (kept open) instead of lost. */
  const attempt = async (doing: string, action: () => Promise<unknown>): Promise<boolean> => {
    try {
      await action();
      error = undefined;
      if (isOpen) render();
      return true;
    } catch (err) {
      error = failureText(err, doing);
      if (isOpen) render();
      return false;
    }
  };

  const setCleared = (removed: readonly HistoryEntry[] | null) => {
    cleared = removed;
    clearTimeout(undoTimer);
    if (removed) undoTimer = setTimeout(() => setCleared(null), HISTORY_UNDO_MS);
    syncButton();
    if (isOpen) render();
  };

  const pick = async (entry: HistoryEntry) => {
    const ok = await attempt('remember the current value', async () => {
      const typed = field.value.trim();
      if (typed && typed !== entry.value) await state.record(typed, 'pick');
      await state.record(entry.value, 'pick'); // the picked value moves to the top
    });
    if (!ok) return; // the field keeps its value: nothing typed is lost
    field.value = entry.value;
    onChange?.(entry.value);
    close('pick');
    focusField();
  };
  const remove = (entry: HistoryEntry) => void attempt('remove it', () => state.remove(entry));
  const pin = (entry: HistoryEntry, pinned: boolean) => void attempt(pinned ? 'pin it' : 'unpin it', () => state.pin(entry, pinned));
  const clearAll = () => void attempt('clear the history', async () => {
    const removed = await state.clear();
    if (removed.length) setCleared(removed);
  });
  const undo = () => void attempt('restore the history', async () => {
    if (!cleared) return;
    await state.restore(cleared);
    setCleared(null); // only once it is back
  });

  // ---- the list ----
  const rowId = (entry: HistoryEntry) => `${listId}-row-${entry.id}`;
  const cellId = (entry: HistoryEntry) => `${listId}-value-${entry.id}`;

  const rowButton = (attrs: Record<string, unknown>, action: () => unknown, ...children: (Node | string | null)[]) => {
    const b = target(el('button', { type: 'button', ...attrs }, ...children));
    wirePress(b, action);
    return b;
  };

  /** Show `index` as the active row: selection, active descendant and preview, without a rebuild. */
  const setActive = (index: number, scroll = true) => {
    active = Math.max(0, Math.min(index, shown.length - 1));
    const entry = shown[active];
    list?.querySelectorAll<HTMLElement>('[data-role="history-row"]').forEach((row, i) => {
      row.setAttribute('aria-selected', String(i === active));
      row.toggleAttribute('data-active', i === active);
    });
    const descendant = entry ? cellId(entry) : null;
    const owner = filter ?? grid;
    if (descendant) owner?.setAttribute('aria-activedescendant', descendant);
    else owner?.removeAttribute('aria-activedescendant');
    const preview = list?.querySelector<HTMLElement>('[data-role="history-preview"]');
    const previewing = entry && (historyLine(entry.value).extraLines > 0 || entry.value.length > PREVIEW_CHARS);
    if (previewing) {
      if (preview) preview.textContent = entry.value;
      else list?.querySelector('[data-role="history-footer"]')?.before(
        el('pre', { class: 'zodal-history-preview', 'data-role': 'history-preview', 'aria-label': 'Full value' }, entry.value));
    } else preview?.remove();
    if (scroll && entry) doc.getElementById(rowId(entry))?.scrollIntoView?.({ block: 'nearest' });
  };

  const row = (entry: HistoryEntry) => {
    const { first, extraLines } = historyLine(entry.value);
    const r = el('div', {
      id: rowId(entry),
      role: 'row',
      class: 'zodal-history-entry',
      'data-role': 'history-row',
      'data-entry': entry.id,
      'data-pinned': entry.pinned ? '' : undefined,
    },
      el('div', { role: 'gridcell', id: cellId(entry), class: 'zodal-history-cell', style: { flex: '1', minWidth: '0' } },
        rowButton({ class: 'zodal-history-pick', 'data-role': 'history-pick', tabindex: -1 }, () => pick(entry), // the grid's Enter picks; Tab goes to the row's actions
          el('span', { class: 'zodal-history-first' }, first),
          extraLines > 0 ? el('span', { class: 'zodal-history-meta' }, `+${extraLines} ${extraLines === 1 ? 'line' : 'lines'}`) : null,
          el('span', { class: 'zodal-history-meta zodal-history-time' }, relativeTime(entry.at, now())),
        ),
      ),
      el('div', { role: 'gridcell', class: 'zodal-history-actions', style: { display: 'flex', flexShrink: '0' } },
        rowButton({
          class: 'zodal-history-action',
          'aria-label': entry.pinned ? `Unpin "${first}"` : `Pin "${first}"`,
          'aria-pressed': String(Boolean(entry.pinned)),
          'data-role': 'history-pin',
        }, () => pin(entry, !entry.pinned), entry.pinned ? 'Unpin' : 'Pin'),
        rowButton({
          class: 'zodal-history-action',
          'aria-label': `Remove "${first}" from history`,
          'data-role': 'history-remove',
        }, () => remove(entry), '×'),
      ),
    );
    r.addEventListener('mouseenter', () => setActive(shown.indexOf(entry), false));
    return r;
  };

  /** Rebuild the list's content from the current state (the filter and the grid element are kept, so focus stays). */
  const render = () => {
    if (!list || !grid) return;
    // Focus on a rebuilt button goes back to its equivalent (by role and entry), else to the grid.
    const focused = doc.activeElement as HTMLElement | null;
    const lost = focused && list.contains(focused) && focused !== grid && focused !== filter
      ? { role: focused.getAttribute('data-role'), entry: focused.closest('[data-entry]')?.getAttribute('data-entry') }
      : null;

    const entries = state.entries;
    const showFilter = entries.length > HISTORY_FILTER_THRESHOLD;
    if (showFilter && !filter) {
      filter = el('input', {
        type: 'search',
        role: 'combobox',
        class: 'zodal-input zodal-history-filter',
        'aria-autocomplete': 'list',
        'aria-expanded': 'true',
        'aria-controls': `${listId}-grid`,
        'aria-label': `Filter ${label} history`,
        placeholder: 'Filter',
        'data-role': 'history-filter',
        onInput: () => { query = filter!.value; active = 0; render(); },
      }) as HTMLInputElement;
      list.prepend(filter);
      grid.tabIndex = -1;
      grid.removeAttribute('aria-activedescendant');
    } else if (!showFilter && filter) {
      filter.remove();
      filter = null;
      query = '';
      grid.tabIndex = 0;
    }
    if (filter) {
      filter.style.minHeight = coarse ? `${minTarget}px` : '';
      filter.style.fontSize = coarse ? '16px' : '';
    }

    const needle = query.trim().toLowerCase();
    shown = needle ? entries.filter((e) => e.value.toLowerCase().includes(needle)) : entries;
    // Grouped as drawn: pinned first, then recent, so row index i is shown[i].
    const pinned = shown.filter((e) => e.pinned);
    const recent = shown.filter((e) => !e.pinned);
    shown = [...pinned, ...recent];
    const group = (name: string, items: HistoryEntry[]) =>
      items.length === 0 ? null : el('div', { role: 'rowgroup', 'aria-label': name },
        pinned.length > 0 ? el('div', { role: 'row' }, el('span', { role: 'columnheader', class: 'zodal-history-heading' }, name)) : null,
        ...items.map(row),
      );
    grid.replaceChildren(...[group('Pinned', pinned), group('Recent', recent)].filter((g): g is HTMLElement => g !== null));

    // Everything after the grid is rebuilt.
    while (grid.nextSibling) grid.nextSibling.remove();
    if (shown.length === 0 && !cleared) {
      list.append(el('p', { class: 'zodal-history-empty', 'data-role': 'history-empty' }, needle ? 'No match' : 'No history'));
    }
    if (error) list.append(el('p', { role: 'alert', class: 'zodal-history-error', 'data-role': 'history-error' }, error));
    const footer = el('div', { class: 'zodal-history-footer', 'data-role': 'history-footer' });
    if (cleared) {
      footer.append(
        el('span', { role: 'status', class: 'zodal-history-meta' }, 'History cleared.'),
        rowButton({ class: 'zodal-history-action', 'data-role': 'history-undo' }, undo, 'Undo'),
      );
    } else if (entries.length > 0) {
      footer.append(rowButton({ class: 'zodal-history-action', 'data-role': 'history-clear', style: { marginLeft: 'auto' } }, clearAll, 'Clear history'));
    }
    list.append(footer);
    setActive(active, false);

    if (lost) {
      const sel = `[data-role="${lost.role}"]`;
      const again = lost.entry ? list.querySelector<HTMLElement>(`[data-entry="${lost.entry}"] ${sel}`) : list.querySelector<HTMLElement>(sel);
      (again ?? filter ?? grid).focus();
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close('escape');
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Every other key belongs to the grid or the filter: on a button, Enter presses that button.
    const onList = e.target === grid || (filter && e.target === filter);
    if (!onList) return;
    const inFilter = filter && e.target === filter;
    const last = shown.length - 1;
    const entry = shown[active];
    switch (e.key) {
      case 'ArrowDown': setActive(Math.min(last, active + 1)); break;
      case 'ArrowUp': setActive(Math.max(0, active - 1)); break;
      case 'Home': if (inFilter) return; setActive(0); break;
      case 'End': if (inFilter) return; setActive(Math.max(0, last)); break;
      case 'Enter': if (!entry) return; void pick(entry); break;
      case 'Delete': if (!e.shiftKey || !entry) return; remove(entry); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  // A light dismiss (a click elsewhere, or the browser's own Escape) closes the list.
  const onToggle = (e: Event) => {
    if ((e as Event & { newState?: string }).newState === 'closed' && isOpen) close('dismiss');
  };

  function open() {
    if (isOpen || destroyed) return;
    isOpen = true;
    query = '';
    active = 0;
    grid = el('div', {
      id: `${listId}-grid`,
      role: 'grid',
      class: 'zodal-history-grid',
      'aria-label': `${label} history`,
      tabindex: 0,
    });
    list = el('div', {
      id: listId,
      popover: 'auto',
      role: 'dialog',
      class: 'zodal-history-list',
      'aria-label': `${label} history`,
      'data-role': 'history-list',
    }, grid);
    list.addEventListener('keydown', onListKey);
    list.addEventListener('toggle', onToggle);
    element.append(list);
    if (typeof list.showPopover === 'function') {
      try { list.showPopover(); } catch { /* already open, or not supported */ }
    }
    render();
    place(list, button);
    (filter ?? grid).focus();
    syncButton();
  }

  /** Close the list: Escape and a pick return focus to the field; a click elsewhere leaves it where it went. */
  function close(reason: 'escape' | 'dismiss' | 'pick' = 'dismiss') {
    if (!isOpen || !list) return;
    isOpen = false;
    const closing = list;
    list = grid = filter = null;
    closing.removeEventListener('toggle', onToggle);
    if (typeof closing.hidePopover === 'function') {
      try { closing.hidePopover(); } catch { /* already closed */ }
    }
    closing.remove();
    error = undefined;
    syncButton();
    if (reason === 'escape') focusField();
    else if (reason === 'dismiss') dismissedAt = performance.now();
  }

  // Alt+ArrowDown on the field opens the list (the APG combobox convention).
  const onFieldKey = (e: KeyboardEvent) => {
    if (e.altKey && e.key === 'ArrowDown' && offered() > 0) {
      e.preventDefault();
      open();
    }
  };
  (field as HTMLElement).addEventListener('keydown', onFieldKey);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    close('dismiss');
    clearTimeout(undoTimer);
    (field as HTMLElement).removeEventListener('keydown', onFieldKey);
    coarseQuery?.removeEventListener?.('change', onCoarse);
    state.destroy();
  };

  state.onChange(() => {
    // A vanilla host replaces its DOM on re-render: once this has left the document, stop.
    if (element.isConnected) wasConnected = true;
    else if (wasConnected) return destroy();
    syncButton();
    if (isOpen) render();
  });
  syncButton();

  return {
    element,
    state,
    get isOpen() { return isOpen; },
    open,
    close: () => close('escape'),
    destroy,
  };
}
