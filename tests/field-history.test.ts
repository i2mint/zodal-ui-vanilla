/**
 * Field input history (i2mint/zodal docs/research/field-input-history.md §6.4), the vanilla port of
 * zodal-ui-shadcn's tests/field-history.test.ts: createFieldHistoryState, the button, the list, and
 * the pick flow through the package's own text and textarea renderers.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ResolvedFieldAffordance } from '@zodal/core';
import {
  createVanillaRegistry,
  createFieldHistoryState,
  attachFieldHistory,
  destroyFieldHistory,
  historyLine,
  relativeTime,
  HISTORY_FILTER_THRESHOLD,
  HISTORY_TOUCH_TARGET_PX,
} from '../src/index.js';
import { isSecretField } from '../src/renderers/form-renderers.js';
import type { FieldHistoryStore, HistoryEntry, HistoryReason, VanillaRenderer } from '../src/index.js';

let container: HTMLElement | undefined;
afterEach(() => {
  container?.remove();
  container = undefined;
  vi.restoreAllMocks();
});
function mount(node: HTMLElement): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  container.appendChild(node);
  return container;
}
/** Let pending promises (store calls, refreshes) settle. */
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

/** A small store of the FieldHistoryStore shape (the real one is @zodal/store's createFieldHistory). */
function fakeStore(seed: Array<[string, string]> = []) {
  let t = 1000;
  let n = 0;
  let entries: HistoryEntry[] = [];
  const listeners = new Set<(scope: string | undefined) => void>();
  const calls: Array<[string, string, HistoryReason | undefined]> = [];
  const notify = (scope?: string) => listeners.forEach((l) => l(scope));
  const store: FieldHistoryStore = {
    async record(scope, value, options) {
      const v = value.trim();
      if (!v) return;
      calls.push([scope, v, options?.reason]);
      const e = entries.find((x) => x.scope === scope && x.value === v);
      if (e) Object.assign(e, { at: ++t, uses: e.uses + 1 });
      else entries.push({ id: `e${++n}`, scope, value: v, at: ++t, uses: 1 });
      notify(scope);
    },
    async list(scope) {
      return entries.filter((e) => e.scope === scope)
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.at - a.at)
        .map((e) => ({ ...e }));
    },
    async remove(id) { entries = entries.filter((e) => e.id !== id); notify(); },
    async pin(id, pinned = true) { const e = entries.find((x) => x.id === id); if (e) e.pinned = pinned; notify(); },
    async clear(scope) {
      const removed = entries.filter((e) => scope === undefined || e.scope === scope);
      entries = entries.filter((e) => !removed.includes(e));
      notify(scope);
      return removed;
    },
    async restore(list) { entries.push(...list.map((e) => ({ ...e }))); notify(); },
    subscribe(listener) { listeners.add(listener); return () => void listeners.delete(listener); },
  };
  for (const [scope, value] of seed) entries.push({ id: `e${++n}`, scope, value, at: ++t, uses: 1 });
  return { store, calls, all: () => entries };
}

const coarsePointer = () => vi.spyOn(window, 'matchMedia' as any).mockImplementation(((q: string) => ({
  matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {},
})) as any);

describe('historyLine and relativeTime', () => {
  it('shows the first non-empty line and counts the others', () => {
    expect(historyLine('one line')).toEqual({ first: 'one line', extraLines: 0 });
    expect(historyLine('\n  Verse one\nline two\nline three')).toEqual({ first: 'Verse one', extraLines: 3 });
  });
  it('reads as a compact relative time', () => {
    const now = 10_000_000_000;
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe('2 h ago');
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe('3 d ago');
  });
});

describe('createFieldHistoryState', () => {
  it('lists a scope, pinned first then most recent', async () => {
    const { store } = fakeStore([['lyrics', 'a'], ['lyrics', 'b'], ['title', 'x']]);
    const state = createFieldHistoryState(store, 'lyrics', { max: 10 });
    expect(state.loading).toBe(true);
    await settle();
    expect(state.loading).toBe(false);
    expect(state.entries.map((e) => e.value)).toEqual(['b', 'a']);
    await state.pin(state.entries[1]);
    expect(state.entries.map((e) => e.value)).toEqual(['a', 'b']);
  });

  it('records with the field cap and refreshes', async () => {
    const { store, calls } = fakeStore();
    const record = vi.spyOn(store, 'record');
    const state = createFieldHistoryState(store, 'lyrics', { max: 10 });
    await settle();
    await state.record('new value', 'submit');
    expect(record).toHaveBeenCalledWith('lyrics', 'new value', { reason: 'submit', max: 10 });
    expect(calls).toEqual([['lyrics', 'new value', 'submit']]);
    expect(state.entries.map((e) => e.value)).toEqual(['new value']);
  });

  it('follows changes made elsewhere, through the store subscribe, and tells its listeners', async () => {
    const { store } = fakeStore();
    const state = createFieldHistoryState(store, 'lyrics');
    const changed = vi.fn();
    state.onChange(changed);
    await settle();
    expect(state.entries).toEqual([]);
    await store.record('lyrics', 'used on submit', { reason: 'submit' });
    await settle();
    expect(state.entries.map((e) => e.value)).toEqual(['used on submit']);
    expect(changed).toHaveBeenCalled();
    state.destroy();
    await store.record('lyrics', 'after destroy', { reason: 'submit' });
    await settle();
    expect(state.entries.map((e) => e.value)).toEqual(['used on submit']);
  });

  it('clear resolves with the removed entries, and restore puts them back', async () => {
    const { store } = fakeStore([['s', 'a'], ['s', 'b']]);
    const state = createFieldHistoryState(store, 's');
    await settle();
    const removed = await state.clear();
    expect(removed.map((e) => e.value).sort()).toEqual(['a', 'b']);
    expect(state.entries).toEqual([]);
    await state.restore(removed);
    expect(state.entries.map((e) => e.value)).toEqual(['b', 'a']);
  });

  it('is empty and inert without a store or a scope', async () => {
    const state = createFieldHistoryState(undefined, 'lyrics');
    await settle();
    expect(state.entries).toEqual([]);
    await state.record('x');
    expect(await state.clear()).toEqual([]);
  });
});

describe('attachFieldHistory', () => {
  it('attaches nothing without a store or a config', () => {
    const field = document.createElement('input');
    expect(attachFieldHistory({ history: undefined, config: { scope: 's' }, label: 'L', field })).toBeNull();
    expect(attachFieldHistory({ history: fakeStore().store, config: undefined, label: 'L', field })).toBeNull();
  });

  it('the button is named "<label> history", draws the rotate-ccw-clock icon, and has press feedback', async () => {
    const field = document.createElement('input');
    const h = attachFieldHistory({ history: fakeStore([['s', 'a']]).store, config: { scope: 's' }, label: 'Lyrics', field })!;
    mount(h.element);
    await settle();
    const button = h.element.querySelector('button')!;
    expect(button.hidden).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Lyrics history');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBeTruthy();
    expect(button.hasAttribute('data-zodal-press')).toBe(true);
    expect(button.querySelector('svg[data-icon="rotate-ccw-clock"]')).not.toBeNull();
  });

  it('is at least 44 px under a coarse pointer; minTarget changes it', async () => {
    coarsePointer();
    const store = fakeStore([['s', 'a']]).store;
    const a = attachFieldHistory({ history: store, config: { scope: 's' }, label: 'L', field: document.createElement('input') })!;
    const b = attachFieldHistory({ history: store, config: { scope: 's' }, label: 'L', field: document.createElement('input'), minTarget: 48 })!;
    await settle();
    const style = a.element.querySelector('button')!.style;
    expect(style.minWidth).toBe(`${HISTORY_TOUCH_TARGET_PX}px`);
    expect(style.minHeight).toBe(`${HISTORY_TOUCH_TARGET_PX}px`);
    expect(b.element.querySelector('button')!.style.minHeight).toBe('48px');
  });

  it('stops following the store once its element has left the document', async () => {
    const { store } = fakeStore([['s', 'a']]);
    const unsubscribe = vi.fn();
    const subscribe = store.subscribe!.bind(store);
    store.subscribe = (l) => { const off = subscribe(l); return () => { unsubscribe(); off(); }; };
    const h = attachFieldHistory({ history: store, config: { scope: 's' }, label: 'L', field: document.createElement('input') })!;
    mount(h.element);
    await settle();
    container!.remove();
    await store.record('s', 'b');
    await settle();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

// The renderers, as an app draws them: registry.resolve(field, ctx) with { history } in the context.
function mountField(store: FieldHistoryStore | undefined, initial: string, { textarea = false, history = true } = {}) {
  const affordance = { zodType: 'string', editable: true, visible: true, title: 'Lyrics', ...(textarea ? { editWidget: 'textarea' } : {}) } as unknown as ResolvedFieldAffordance;
  const ctx = { mode: 'form' as const, history: store };
  const render = createVanillaRegistry().resolve(affordance, ctx) as VanillaRenderer;
  const written: unknown[] = [];
  const config = { name: 'lyrics', label: 'Lyrics', type: textarea ? 'textarea' : 'text', ...(history ? { history: { max: 50, scope: 'lyrics' } } : {}) };
  const c = mount(render({ field: { value: initial, onChange: (v: unknown) => written.push(v) }, config, context: ctx }));
  const field = () => c.querySelector(textarea ? 'textarea' : 'input[type="text"]') as HTMLInputElement | HTMLTextAreaElement;
  const button = () => {
    const b = c.querySelector('[data-role="history-button"]') as HTMLButtonElement | null;
    return b && !b.hidden ? b : null;
  };
  const list = () => c.querySelector('[data-role="history-list"]') as HTMLElement | null;
  const grid = () => list()!.querySelector('[role="grid"]') as HTMLElement;
  const rows = () => [...c.querySelectorAll('[data-role="history-row"]')] as HTMLElement[];
  const click = async (el: Element) => { (el as HTMLElement).click(); await settle(); };
  const key = async (el: Element, k: string, init: KeyboardEventInit = {}) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
    await settle();
  };
  return { c, field, button, list, grid, rows, click, key, written };
}

describe('text and textarea renderers with history', () => {
  it('a textarea field resolves to a textarea, holding its value', () => {
    const { field } = mountField(undefined, 'two\nlines', { textarea: true });
    expect(field().tagName).toBe('TEXTAREA');
    expect(field().value).toBe('two\nlines');
  });

  it('the textarea renderer takes only free text', () => {
    const registry = createVanillaRegistry();
    const resolveName = (zodType: string, extra: object = {}) =>
      registry.explain({ zodType, editWidget: 'textarea', editable: true, visible: true, title: 'X', ...extra } as unknown as ResolvedFieldAffordance, { mode: 'form' })
        .filter((r: any) => r.score > 0).sort((a: any, b: any) => b.score - a.score)[0]?.name;
    expect(resolveName('string')).toBe('TextareaInput');
    expect(resolveName('array')).not.toBe('TextareaInput');
    expect(resolveName('number')).toBe('NumberInput');
    expect(resolveName('enum')).toBe('SelectInput');
    expect(resolveName('string', { storageRole: 'content' })).not.toBe('TextareaInput');
  });

  it('draw no history button without a store, without config.history, or while empty', async () => {
    expect(mountField(undefined, 'x').button()).toBeNull();
    container?.remove();
    const { store } = fakeStore([['lyrics', 'old']]);
    const noConfig = mountField(store, 'x', { history: false });
    await settle();
    expect(noConfig.button()).toBeNull();
    container?.remove();
    const empty = mountField(fakeStore().store, 'x');
    await settle();
    expect(empty.button()).toBeNull();
  });

  it('the button appears after the first record, and not on a disabled field', async () => {
    const { store } = fakeStore();
    const f = mountField(store, 'x');
    await settle();
    expect(f.button()).toBeNull();
    await store.record('lyrics', 'first', { reason: 'submit' });
    await settle();
    expect(f.button()).not.toBeNull();
    container?.remove();
    const render = createVanillaRegistry().resolve({ zodType: 'string', editable: true, visible: true } as unknown as ResolvedFieldAffordance, { mode: 'form' }) as VanillaRenderer;
    const disabled = mount(render({ field: { value: '', onChange() {} }, config: { name: 'l', label: 'L', type: 'text', disabled: true, history: { max: 50, scope: 'lyrics' } }, context: { mode: 'form', history: store } }));
    await settle();
    expect(disabled.querySelector('[data-role="history-button"]')).toBeNull();
  });

  for (const textarea of [false, true]) {
    it(`picking an entry records the current value, replaces it, closes the list and returns focus (${textarea ? 'textarea' : 'input'})`, async () => {
      const past = textarea ? 'older verse\nwith a second line' : 'older verse';
      const { store, calls } = fakeStore([['lyrics', past]]);
      const f = mountField(store, 'what I typed', { textarea });
      await settle();
      await f.click(f.button()!);
      expect(f.list()).not.toBeNull();
      expect(f.list()!.getAttribute('popover')).toBe('auto');
      expect(f.button()!.getAttribute('aria-expanded')).toBe('true');
      const row = f.rows()[0];
      expect(row.textContent).toContain('older verse');
      if (textarea) expect(row.textContent).toContain('+1 line');
      await f.click(row.querySelector('[data-role="history-pick"]')!);
      expect(calls).toEqual([['lyrics', 'what I typed', 'pick'], ['lyrics', past, 'pick']]);
      expect(f.written).toEqual([past]);
      expect(f.field().value).toBe(past);
      expect(f.list()).toBeNull();
      expect(f.button()!.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(f.field());
      expect(f.field().selectionStart).toBe(past.length);
      // What was typed is in the history now: nothing was lost.
      await f.click(f.button()!);
      expect(f.rows().map((r) => r.textContent)).toEqual([expect.stringContaining('older verse'), expect.stringContaining('what I typed')]);
    });
  }

  it('Alt+ArrowDown on the field opens the list; Enter picks the active row; Escape closes and refocuses', async () => {
    const { store } = fakeStore([['lyrics', 'a'], ['lyrics', 'b']]);
    const f = mountField(store, '');
    await settle();
    await f.key(f.field(), 'ArrowDown', { altKey: true });
    expect(f.list()).not.toBeNull();
    expect(document.activeElement).toBe(f.grid());
    await f.key(f.grid(), 'ArrowDown');
    expect(f.rows()[1].getAttribute('aria-selected')).toBe('true');
    expect(f.grid().getAttribute('aria-activedescendant')).toBe(f.rows()[1].querySelector('[role="gridcell"]')!.id);
    await f.key(f.grid(), 'Escape');
    expect(f.list()).toBeNull();
    expect(document.activeElement).toBe(f.field());
    await f.key(f.field(), 'ArrowDown', { altKey: true });
    await f.key(f.grid(), 'End');
    await f.key(f.grid(), 'Enter');
    expect(f.written).toEqual(['a']); // empty field: nothing recorded first, 'a' (the older) picked
  });

  it('pin and remove from a row; Shift+Delete removes the active row', async () => {
    const { store, all } = fakeStore([['lyrics', 'a'], ['lyrics', 'b'], ['lyrics', 'c']]);
    const f = mountField(store, '');
    await settle();
    await f.click(f.button()!);
    await f.click(f.rows()[2].querySelector('[data-role="history-pin"]')!);
    expect(f.rows()[0].textContent).toContain('a');
    expect(f.rows()[0].hasAttribute('data-pinned')).toBe(true);
    expect(f.rows()[0].querySelector('[data-role="history-pin"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(f.list()!.textContent).toContain('Pinned');
    await f.click(f.rows()[1].querySelector('[data-role="history-remove"]')!);
    expect(all().map((e) => e.value).sort()).toEqual(['a', 'b']);
    await f.key(f.grid(), 'Delete', { shiftKey: true });
    expect(all().map((e) => e.value)).toEqual(['b']);
  });

  it('pin and remove are reachable with Tab; the pick is not', async () => {
    const { store } = fakeStore([['lyrics', 'a']]);
    const f = mountField(store, '');
    await settle();
    await f.click(f.button()!);
    const row = f.rows()[0];
    expect(row.querySelector('[data-role="history-pin"]')!.getAttribute('tabindex')).toBeNull();
    expect(row.querySelector('[data-role="history-remove"]')!.getAttribute('tabindex')).toBeNull();
    expect(row.querySelector('[data-role="history-pick"]')!.getAttribute('tabindex')).toBe('-1');
  });

  it('shows a full-value preview of a multi-line active entry', async () => {
    const { store } = fakeStore([['lyrics', 'line 1\nline 2\nline 3']]);
    const f = mountField(store, '', { textarea: true });
    await settle();
    await f.click(f.button()!);
    expect(f.list()!.querySelector('[data-role="history-preview"]')!.textContent).toBe('line 1\nline 2\nline 3');
  });

  it(`shows a filter only above ${HISTORY_FILTER_THRESHOLD} entries, and filters`, async () => {
    const values = Array.from({ length: HISTORY_FILTER_THRESHOLD }, (_, i) => ['lyrics', `v${i}`] as [string, string]);
    let f = mountField(fakeStore(values).store, '');
    await settle();
    await f.click(f.button()!);
    expect(f.list()!.querySelector('[data-role="history-filter"]')).toBeNull();
    container?.remove();

    f = mountField(fakeStore([...values, ['lyrics', 'Dark synthwave']]).store, '');
    await settle();
    await f.click(f.button()!);
    const filter = f.list()!.querySelector('[data-role="history-filter"]') as HTMLInputElement;
    expect(filter.getAttribute('role')).toBe('combobox');
    expect(document.activeElement).toBe(filter);
    filter.value = 'dark';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    expect(f.rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Dark synthwave')]);
    expect(document.activeElement).toBe(filter);
    expect(filter.getAttribute('aria-activedescendant')).toBe(f.rows()[0].querySelector('[role="gridcell"]')!.id);
    await f.key(filter, 'Enter');
    expect(f.written).toEqual(['Dark synthwave']);
  });

  it('Clear history clears at once and offers Undo', async () => {
    const { store, all } = fakeStore([['lyrics', 'a'], ['lyrics', 'b'], ['title', 'kept']]);
    const f = mountField(store, '');
    await settle();
    await f.click(f.button()!);
    await f.click(f.list()!.querySelector('[data-role="history-clear"]')!);
    expect(all().map((e) => e.value)).toEqual(['kept']);
    expect(f.button()).not.toBeNull(); // kept while Undo is offered
    expect(f.list()!.textContent).toContain('History cleared.');
    await f.click(f.list()!.querySelector('[data-role="history-undo"]')!);
    expect(all().map((e) => e.value).sort()).toEqual(['a', 'b', 'kept']);
    expect(f.button()).not.toBeNull();
  });

  it('Undo survives the list closing, and expires', async () => {
    const { store, all } = fakeStore([['lyrics', 'a']]);
    const f = mountField(store, '');
    await settle();
    await f.click(f.button()!);
    await f.click(f.list()!.querySelector('[data-role="history-clear"]')!);
    await f.key(f.list()!, 'Escape');
    expect(f.list()).toBeNull();
    expect(f.button()).not.toBeNull();
    await f.click(f.button()!);
    await f.click(f.list()!.querySelector('[data-role="history-undo"]')!);
    expect(all().map((e) => e.value)).toEqual(['a']);

    vi.useFakeTimers();
    try {
      f.list()!.querySelector<HTMLElement>('[data-role="history-clear"]')!.click();
      await vi.advanceTimersByTimeAsync(10);
      expect(f.list()!.querySelector('[data-role="history-undo"]')).not.toBeNull();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(f.list()!.querySelector('[data-role="history-undo"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Enter on the Clear history button does not pick', async () => {
    const { store } = fakeStore([['lyrics', 'a']]);
    const f = mountField(store, 'typed');
    await settle();
    await f.click(f.button()!);
    await f.key(f.list()!.querySelector('[data-role="history-clear"]')!, 'Enter');
    expect(f.written).toEqual([]);
  });

  it('a pick the store refuses keeps the value and says why, with the list open', async () => {
    const { store } = fakeStore([['lyrics', 'old']]);
    store.record = async () => { throw new Error('quota exceeded'); };
    const f = mountField(store, 'typed');
    await settle();
    await f.click(f.button()!);
    await f.click(f.rows()[0].querySelector('[data-role="history-pick"]')!);
    expect(f.written).toEqual([]);
    expect(f.field().value).toBe('typed');
    expect(f.list()!.querySelector('[role="alert"]')!.textContent).toContain('quota exceeded');
  });
});

describe('after review', () => {
  const plainText = { zodType: 'string', editable: true, visible: true } as unknown as ResolvedFieldAffordance;
  const draw = (store: FieldHistoryStore, config: Record<string, unknown>, onChange: (v: unknown) => void = () => {}) => {
    const render = createVanillaRegistry().resolve(plainText, { mode: 'form' }) as VanillaRenderer;
    return render({ field: { value: '', onChange }, config: { label: 'L', type: 'text', history: { max: 50, scope: 's' }, ...config }, context: { mode: 'form', history: store } });
  };

  it('never offers history on a secret: a secret flag, a password input, or a secret-looking name', async () => {
    const { store } = fakeStore([['s', 'hunter2']]);
    for (const config of [{ name: 'a', secret: true }, { name: 'b', type: 'password' }, { name: 'apiKey' }, { name: 'db_password' }, { name: 'access_token' }]) {
      const c = mount(draw(store, config));
      await settle();
      expect(c.querySelector('[data-role="field-history"]'), JSON.stringify(config)).toBeNull();
      container?.remove();
    }
    const c = mount(draw(store, { name: 'lyrics' }));
    await settle();
    expect(c.querySelector('[data-role="field-history"]')).not.toBeNull();
    expect(isSecretField({ name: 'monkeyBusiness' })).toBe(false);
    expect(isSecretField({ name: 'sortKey' })).toBe(true); // cautious: a missed history costs less than a leaked key
  });

  it('a history drawn before it is mounted stops once it has been mounted and removed, with no store change', async () => {
    const { store } = fakeStore([['s', 'a']]);
    const unsubscribed = vi.fn();
    const subscribe = store.subscribe!.bind(store);
    store.subscribe = (l) => { const off = subscribe(l); return () => { unsubscribed(); off(); }; };
    const node = draw(store, { name: 'lyrics' });
    await settle(); // the list arrives while it is not in the document: nothing is torn down
    expect(unsubscribed).not.toHaveBeenCalled();
    mount(node);
    await settle();
    container!.remove();
    await settle();
    expect(unsubscribed).toHaveBeenCalledTimes(1);
  });

  it('destroyFieldHistory(root) tears down the histories inside a form', async () => {
    const { store } = fakeStore([['s', 'a']]);
    const unsubscribed = vi.fn();
    const subscribe = store.subscribe!.bind(store);
    store.subscribe = (l) => { const off = subscribe(l); return () => { unsubscribed(); off(); }; };
    const form = document.createElement('form');
    form.append(draw(store, { name: 'one' }), draw(store, { name: 'two' }));
    destroyFieldHistory(form);
    expect(unsubscribed).toHaveBeenCalledTimes(2);
    const input = form.querySelector('input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
    expect(form.querySelector('[data-role="history-list"]')).toBeNull();
  });

  it('after a pick, a host that re-renders on change gets the focus in its new field', async () => {
    const { store } = fakeStore([['s', 'picked']]);
    const host = document.createElement('div');
    const renderForm = (value: string) => {
      destroyFieldHistory(host);
      const render = createVanillaRegistry().resolve(plainText, { mode: 'form' }) as VanillaRenderer;
      host.replaceChildren(render({
        field: { value, onChange: (v: unknown) => renderForm(String(v)) },
        config: { name: 'lyrics', label: 'L', type: 'text', history: { max: 50, scope: 's' } },
        context: { mode: 'form', history: store },
      }));
    };
    renderForm('');
    mount(host);
    await settle();
    (host.querySelector('[data-role="history-button"]') as HTMLElement).click();
    await settle();
    (host.querySelector('[data-role="history-pick"]') as HTMLElement).click();
    await settle();
    const field = host.querySelector('input') as HTMLInputElement;
    expect(field.value).toBe('picked');
    expect(document.activeElement).toBe(field);
  });

  it('an entry id with quotes in it does not break the list', async () => {
    const { store, all } = fakeStore([['s', 'a']]);
    all()[0].id = 'x"] , [y';
    const c = mount(draw(store, { name: 'lyrics' }));
    await settle();
    (c.querySelector('[data-role="history-button"]') as HTMLElement).click();
    await settle();
    const pinButton = c.querySelector('[data-role="history-pin"]') as HTMLElement;
    pinButton.focus();
    pinButton.click();
    await settle();
    expect(c.querySelector('[data-role="history-row"]')!.hasAttribute('data-pinned')).toBe(true);
    expect((document.activeElement as HTMLElement).getAttribute('data-role')).toBe('history-pin');
  });

  it('without popover support, a press outside closes the list; a press inside does not', async () => {
    const c = mount(draw(fakeStore([['s', 'a']]).store, { name: 'lyrics' }));
    await settle();
    (c.querySelector('[data-role="history-button"]') as HTMLElement).click();
    await settle();
    c.querySelector('[data-role="history-row"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(c.querySelector('[data-role="history-list"]')).not.toBeNull();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(c.querySelector('[data-role="history-list"]')).toBeNull();
  });

  it('with popover support, the list is shown as a popover and a light dismiss (toggle) closes it', async () => {
    const show = vi.fn();
    const hide = vi.fn(); // called on an already-closed popover: harmless
    (HTMLElement.prototype as any).showPopover = show;
    (HTMLElement.prototype as any).hidePopover = hide;
    try {
      const c = mount(draw(fakeStore([['s', 'a']]).store, { name: 'lyrics' }));
      await settle();
      (c.querySelector('[data-role="history-button"]') as HTMLElement).click();
      await settle();
      expect(show).toHaveBeenCalledTimes(1);
      const list = c.querySelector('[data-role="history-list"]')!;
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(c.querySelector('[data-role="history-list"]')).not.toBeNull(); // the browser does the light dismiss
      list.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }));
      expect(c.querySelector('[data-role="history-list"]')).toBeNull();
    } finally {
      delete (HTMLElement.prototype as any).showPopover;
      delete (HTMLElement.prototype as any).hidePopover;
    }
  });
});
