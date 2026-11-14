import { describe, it, expect, vi, afterEach } from 'vitest';
import type { FormFieldConfig, FilterFieldConfig, ColumnConfig, RendererContext } from '@zodal/ui';
import { createTagInput, createChipFilter, createChipCell, tagInput, chipFilter, chipCell } from '../src/index.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function tagsConfig(overrides: Partial<FormFieldConfig> = {}): FormFieldConfig {
  return {
    name: 'tags', label: 'Tags', type: 'tags', required: false, disabled: false, hidden: false,
    order: 0, zodType: 'array', allowCreate: true, ...overrides,
  } as FormFieldConfig;
}

function mount(node: HTMLElement): HTMLElement {
  document.body.replaceChildren(node);
  return node;
}

function renderTags(config: Partial<FormFieldConfig> = {}, value: unknown = [], context?: RendererContext) {
  const onChange = vi.fn();
  const root = mount(tagInput({ field: { value, onChange }, config: tagsConfig(config), context }));
  const input = root.querySelector('input')!;
  return { root, input, onChange, last: () => onChange.mock.calls.at(-1)?.[0] };
}

function type(input: HTMLInputElement, text: string) {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function key(target: HTMLElement, k: string): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

const chipLabels = (root: HTMLElement) =>
  [...root.querySelectorAll('.zodal-chip-label')].map((n) => n.textContent);
const live = (root: HTMLElement) => root.querySelector('[role="status"]')!.textContent;
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// form: tag input
// ---------------------------------------------------------------------------

describe('TagInput (form)', () => {
  it('has the combobox / listbox ARIA wiring and a polite live region', () => {
    const { root, input } = renderTags({ options: [{ label: 'A', value: 'a' }], allowCreate: false });
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    const listbox = root.querySelector(`#${input.getAttribute('aria-controls')}`)!;
    expect(listbox.getAttribute('role')).toBe('listbox');
    expect(root.querySelector('[role="status"]')!.getAttribute('aria-live')).toBe('polite');
    expect(root.querySelector('label')!.getAttribute('for')).toBe(input.id);
  });

  it('shows the current values as chips with keyboard-reachable remove buttons', () => {
    const { root } = renderTags({}, ['x', 'y']);
    expect(chipLabels(root)).toEqual(['x', 'y']);
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.zodal-chip-remove')];
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.type).toBe('button');
      expect(b.tabIndex).toBe(0);
    }
    expect(buttons[0].getAttribute('aria-label')).toBe('Remove x');
  });

  it('adds with Enter and with a comma, and announces the add', () => {
    const { root, input, last } = renderTags();
    type(input, 'alpha');
    expect(key(input, 'Enter').defaultPrevented).toBe(true);
    expect(last()).toEqual(['alpha']);
    expect(input.value).toBe('');
    type(input, 'beta');
    key(input, ',');
    expect(last()).toEqual(['alpha', 'beta']);
    expect(chipLabels(root)).toEqual(['alpha', 'beta']);
    expect(live(root)).toBe('beta added');
  });

  it('lets Enter on an empty input through (the form may submit)', () => {
    const { input, onChange } = renderTags();
    expect(key(input, 'Enter').defaultPrevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the last chip with Backspace on an empty input', () => {
    const { root, input, last } = renderTags({}, ['a', 'b']);
    type(input, '');
    key(input, 'Backspace');
    expect(last()).toEqual(['a']);
    expect(live(root)).toBe('b removed');
    // not when there is text to delete
    type(input, 'q');
    key(input, 'Backspace');
    expect(last()).toEqual(['a']);
  });

  it('removes a chip with its button and returns focus to the input', () => {
    const { root, input, last } = renderTags({}, ['a', 'b']);
    root.querySelector<HTMLButtonElement>('[aria-label="Remove a"]')!.click();
    expect(last()).toEqual(['b']);
    expect(document.activeElement).toBe(input);
    expect(live(root)).toBe('a removed');
  });

  it('refuses a duplicate and keeps the typed text', () => {
    const { root, input, onChange } = renderTags({}, ['a']);
    type(input, 'a');
    key(input, 'Enter');
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('a');
    expect(live(root)).toBe('a is already added');
    expect(root.querySelector('.zodal-tags-feedback')!.textContent).toBe('a is already added');
  });

  it('with allowCreate false, refuses free text and keeps it, but takes a matching option', () => {
    const { root, input, onChange, last } = renderTags({
      allowCreate: false,
      options: [{ label: 'Design', value: 'design' }, { label: 'Dev', value: 'dev' }],
    });
    type(input, 'nonsense');
    key(input, 'Enter');
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('nonsense');
    expect(live(root)).toBe('nonsense is not one of the allowed values');

    type(input, 'des');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const options = [...root.querySelectorAll('[role="option"]')];
    expect(options.map((o) => o.textContent)).toEqual(['Design']);
    // closed vocabulary: the first match is highlighted, Enter takes it
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    key(input, 'Enter');
    expect(last()).toEqual(['design']);
    expect(chipLabels(root)).toEqual(['Design']);
  });

  it('moves through options with the arrow keys and closes with Escape, keeping the draft', () => {
    const { root, input, last } = renderTags({
      allowCreate: false,
      options: [{ label: 'One', value: 'one' }, { label: 'Two', value: 'two' }],
    });
    input.focus();
    key(input, 'ArrowDown'); // opens with every option, first highlighted
    const ids = [...root.querySelectorAll('[role="option"]')].map((o) => o.id);
    expect(ids).toHaveLength(2);
    key(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[1]);
    key(input, 'ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[0]);
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(last()).toEqual(['two']);
    type(input, 'o');
    expect(key(input, 'Escape').defaultPrevented).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('o');
  });

  it('writes back numeric raw values and labels chips from options', () => {
    const options = [{ label: 'Low', value: '1', raw: 1 }, { label: 'High', value: '3', raw: 3 }];
    const { root, input, last } = renderTags({ allowCreate: false, options }, [1]);
    expect(chipLabels(root)).toEqual(['Low']);
    type(input, 'hi');
    key(input, 'Enter');
    expect(last()).toEqual([1, 3]);
    expect(typeof last()[1]).toBe('number');
    // the option list never offers what is already selected
    input.focus();
    type(input, '');
    key(input, 'ArrowDown');
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it('picks an option with the mouse without losing focus', () => {
    const { root, input, last } = renderTags({ allowCreate: false, options: [{ label: 'A', value: 'a' }] });
    type(input, 'a');
    const option = root.querySelector('[role="option"]')!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    option.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(last()).toEqual(['a']);
  });

  it('adds every part of pasted comma-separated text', () => {
    const { input, last } = renderTags();
    input.focus();
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'a, b,c' } });
    input.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(last()).toEqual(['a', 'b', 'c']);
    expect(input.value).toBe('');
  });

  it('keeps the draft on blur', () => {
    const { input, onChange } = renderTags();
    type(input, 'half-typed');
    input.dispatchEvent(new FocusEvent('blur'));
    expect(input.value).toBe('half-typed');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables the input and the remove buttons when the field is disabled', () => {
    const { root, input } = renderTags({ disabled: true }, ['a']);
    expect(input.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('.zodal-chip-remove')!.disabled).toBe(true);
  });
});

describe('TagInput with context.suggest', () => {
  it('debounces, passes an AbortSignal and the limit, shows loading, then the results', async () => {
    vi.useFakeTimers();
    let resolve!: (v: any) => void;
    const suggest = vi.fn(() => new Promise<any>((r) => (resolve = r)));
    const render = createTagInput({ debounceMs: 150, limit: 2 });
    const onChange = vi.fn();
    const root = mount(render({ field: { value: [], onChange }, config: tagsConfig(), context: { mode: 'form', suggest } }));
    const input = root.querySelector('input')!;

    type(input, 'fr');
    // feedback is immediate: loading state before the request is even sent
    const listbox = root.querySelector('[role="listbox"]')!;
    expect(listbox.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('.zodal-tags-combobox')!.hasAttribute('data-loading')).toBe(true);
    expect(root.querySelector('.zodal-listbox-status')!.textContent).toBe('Loading suggestions…');
    expect(suggest).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(150);
    expect(suggest).toHaveBeenCalledTimes(1);
    const [query, field, opts] = suggest.mock.calls[0] as any[];
    expect(query).toBe('fr');
    expect(field).toBe('tags');
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(opts.limit).toBe(2);

    resolve([
      { value: 'frontend', label: 'Frontend' },
      { value: 'french', label: 'French' },
      { value: 'fries', label: 'Fries' },
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(listbox.getAttribute('aria-busy')).toBe('false');
    expect([...root.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['Frontend', 'French']);

    // open vocabulary: nothing highlighted, Enter would add the text; ArrowDown reaches a suggestion
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(onChange).toHaveBeenLastCalledWith(['frontend']);
    expect(root.querySelector('.zodal-chip-label')!.textContent).toBe('Frontend');
  });

  it('aborts the previous request when the user keeps typing and ignores its stale result', async () => {
    const pending: Array<{ q: string; signal: AbortSignal; resolve: (v: any) => void }> = [];
    const suggest = vi.fn((q: string, _f: string, o: any) =>
      new Promise<any>((resolve) => pending.push({ q, signal: o.signal, resolve })));
    const render = createTagInput({ debounceMs: 0 });
    const root = mount(render({ field: { value: [], onChange: vi.fn() }, config: tagsConfig(), context: { mode: 'form', suggest } }));
    const input = root.querySelector('input')!;

    type(input, 'a');
    await flush();
    type(input, 'ab');
    await flush();
    expect(pending.map((p) => p.q)).toEqual(['a', 'ab']);
    expect(pending[0].signal.aborted).toBe(true);
    expect(pending[1].signal.aborted).toBe(false);

    pending[1].resolve([{ value: 'abc', label: 'abc' }]);
    await flush();
    pending[0].resolve([{ value: 'apple', label: 'apple' }]); // late, stale
    await flush();
    expect([...root.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['abc']);
  });

  it('keeps the draft when suggest fails, and still adds it on Enter', async () => {
    const suggest = vi.fn(() => Promise.reject(new Error('offline')));
    const render = createTagInput({ debounceMs: 0 });
    const onChange = vi.fn();
    const root = mount(render({ field: { value: [], onChange }, config: tagsConfig(), context: { mode: 'form', suggest } }));
    const input = root.querySelector('input')!;
    type(input, 'kept');
    await flush();
    expect(root.querySelector('.zodal-listbox-status')!.textContent).toBe('Could not load suggestions');
    expect(input.value).toBe('kept');
    key(input, 'Enter');
    expect(onChange).toHaveBeenLastCalledWith(['kept']);
  });

  it('uses options, not suggest, for a closed vocabulary', () => {
    const suggest = vi.fn(() => []);
    const { input } = renderTags(
      { allowCreate: false, options: [{ label: 'A', value: 'a' }] },
      [],
      { mode: 'form', suggest },
    );
    type(input, 'a');
    expect(suggest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// filter: chip filter
// ---------------------------------------------------------------------------

function filterConfig(overrides: Partial<FilterFieldConfig> = {}): FilterFieldConfig {
  return { name: 'tags', label: 'Tags', filterType: 'contains', zodType: 'array', ...overrides } as FilterFieldConfig;
}

describe('ChipFilter', () => {
  const opts = [{ label: 'Red', value: 'red' }, { label: 'Blue', value: 'blue' }];

  it('shows options as aria-pressed toggles and emits arrayContainsAny', () => {
    const onChange = vi.fn();
    const root = mount(chipFilter({ field: { value: undefined, onChange }, config: filterConfig({ options: opts }) }));
    expect(root.getAttribute('role')).toBe('group');
    expect(root.textContent).toContain('Tags is any of');
    const [red, blue] = [...root.querySelectorAll<HTMLButtonElement>('button')];
    expect(red.getAttribute('aria-pressed')).toBe('false');
    red.click();
    expect(red.getAttribute('aria-pressed')).toBe('true');
    expect(onChange).toHaveBeenLastCalledWith({ field: 'tags', operator: 'arrayContainsAny', value: ['red'] });
    blue.click();
    expect(onChange).toHaveBeenLastCalledWith({ field: 'tags', operator: 'arrayContainsAny', value: ['red', 'blue'] });
    red.click();
    blue.click();
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('reflects the current filter value and emits raw numbers', () => {
    const numeric = [{ label: 'One', value: '1', raw: 1 }, { label: 'Two', value: '2', raw: 2 }];
    const onChange = vi.fn();
    const root = mount(chipFilter({
      field: { value: { field: 'n', operator: 'arrayContainsAny', value: [2] }, onChange },
      config: filterConfig({ name: 'n', options: numeric }),
    }));
    const [one, two] = [...root.querySelectorAll('button')];
    expect(two.getAttribute('aria-pressed')).toBe('true');
    one.click();
    expect(onChange).toHaveBeenLastCalledWith({ field: 'n', operator: 'arrayContainsAny', value: [2, 1] });
  });

  it('switches to a type-ahead above maxToggleOptions, limited to the vocabulary', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ label: `Tag ${i}`, value: `t${i}` }));
    const onChange = vi.fn();
    const root = mount(createChipFilter({ maxToggleOptions: 3 })({ field: { value: undefined, onChange }, config: filterConfig({ options: many }) }));
    const input = root.querySelector<HTMLInputElement>('[role="combobox"]')!;
    expect(input.getAttribute('aria-labelledby')).toBe(root.getAttribute('aria-labelledby'));
    type(input, 'free text');
    key(input, 'Enter');
    expect(onChange).not.toHaveBeenCalled();
    type(input, 'tag 3');
    key(input, 'Enter');
    expect(onChange).toHaveBeenLastCalledWith({ field: 'tags', operator: 'arrayContainsAny', value: ['t3'] });
  });

  it('without options, takes typed tags and asks suggest', async () => {
    const suggest = vi.fn(() => [{ value: 'urgent', label: 'urgent' }]);
    const onChange = vi.fn();
    const root = mount(createChipFilter({ debounceMs: 0 })({
      field: { value: undefined, onChange }, config: filterConfig(), context: { mode: 'filter', suggest },
    }));
    const input = root.querySelector<HTMLInputElement>('[role="combobox"]')!;
    type(input, 'urg');
    await flush();
    expect(suggest).toHaveBeenCalledWith('urg', 'tags', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    type(input, 'anything');
    key(input, 'Enter');
    expect(onChange).toHaveBeenLastCalledWith({ field: 'tags', operator: 'arrayContainsAny', value: ['anything'] });
  });
});

// ---------------------------------------------------------------------------
// cell: chip cell
// ---------------------------------------------------------------------------

function columnConfig(): ColumnConfig {
  return {
    id: 'tags', header: 'Tags', accessorKey: 'tags', enableSorting: false, enableColumnFilter: true,
    enableGlobalFilter: false, enableGrouping: false, enableHiding: true, enableResizing: true,
    meta: { zodType: 'array', filterType: 'contains', editable: true, inlineEditable: false },
  } as ColumnConfig;
}

describe('ChipCell', () => {
  it('shows chips and a "+N" overflow chip naming what it hides', () => {
    const node = chipCell({ value: ['a', 'b', 'c', 'd', 'e'], config: columnConfig(), row: {} });
    expect(node.getAttribute('role')).toBe('list');
    const items = [...node.querySelectorAll('[role="listitem"]')];
    expect(items).toHaveLength(4);
    const overflow = node.querySelector('.zodal-chip-overflow')!;
    expect(overflow.textContent).toBe('+2');
    expect(overflow.getAttribute('aria-label')).toBe('2 more: d, e');
    expect(overflow.getAttribute('title')).toBe('d, e');
  });

  it('shows no overflow chip when everything fits', () => {
    const node = chipCell({ value: [1, 2], config: columnConfig(), row: {} });
    expect(node.querySelector('.zodal-chip-overflow')).toBeNull();
    expect(node.querySelectorAll('.zodal-chip')).toHaveLength(2);
  });

  it('takes the number of visible chips as a setting', () => {
    const node = createChipCell({ maxVisibleChips: 1 })({ value: ['a', 'b', 'c'], config: columnConfig(), row: {} });
    expect(node.querySelector('.zodal-chip-overflow')!.textContent).toBe('+2');
  });

  it('shows an em dash for an empty array or a non-array', () => {
    expect(chipCell({ value: [], config: columnConfig(), row: {} }).textContent).toBe('—');
    expect(chipCell({ value: null, config: columnConfig(), row: {} }).textContent).toBe('—');
  });
});
