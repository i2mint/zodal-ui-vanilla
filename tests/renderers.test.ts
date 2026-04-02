import { describe, it, expect } from 'vitest';
import type { CellProps, FormFieldProps, FilterFieldProps } from '../src/types.js';
import type { ColumnConfig, FormFieldConfig, FilterFieldConfig } from '@zodal/ui';

// Import renderer arrays to get the actual functions
import { cellRenderers } from '../src/renderers/cell-renderers.js';
import { formRenderers } from '../src/renderers/form-renderers.js';
import { filterRenderers } from '../src/renderers/filter-renderers.js';

// Helper: get named renderer function from array
function getRenderer<T>(renderers: { renderer: T; name: string }[], name: string): T {
  const entry = renderers.find(r => r.name === name);
  if (!entry) throw new Error(`Renderer "${name}" not found`);
  return entry.renderer;
}

function mockColumnConfig(overrides: Partial<ColumnConfig> = {}): ColumnConfig {
  return {
    id: 'test',
    header: 'Test',
    accessorKey: 'test',
    enableSorting: true,
    enableColumnFilter: false,
    enableGlobalFilter: false,
    enableGrouping: false,
    enableHiding: true,
    enableResizing: true,
    meta: {
      zodType: 'string',
      filterType: false,
      editable: true,
      inlineEditable: false,
    },
    ...overrides,
  } as ColumnConfig;
}

function mockFormConfig(overrides: Partial<FormFieldConfig> = {}): FormFieldConfig {
  return {
    name: 'test',
    label: 'Test',
    type: 'text',
    required: false,
    disabled: false,
    hidden: false,
    order: 0,
    zodType: 'string',
    ...overrides,
  } as FormFieldConfig;
}

function mockFilterConfig(overrides: Partial<FilterFieldConfig> = {}): FilterFieldConfig {
  return {
    name: 'test',
    label: 'Test',
    filterType: 'search',
    zodType: 'string',
    ...overrides,
  } as FilterFieldConfig;
}

describe('Cell Renderers', () => {
  const textCell = getRenderer(cellRenderers, 'TextCell');
  const numberCell = getRenderer(cellRenderers, 'NumberCell');
  const booleanCell = getRenderer(cellRenderers, 'BooleanCell');
  const dateCell = getRenderer(cellRenderers, 'DateCell');
  const badgeCell = getRenderer(cellRenderers, 'BadgeCell');
  const arrayCell = getRenderer(cellRenderers, 'ArrayCell');

  it('TextCell returns a span with text content', () => {
    const el = textCell({ value: 'hello', config: mockColumnConfig(), row: {} });
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toBe('hello');
    expect(el.classList.contains('zodal-cell')).toBe(true);
  });

  it('TextCell truncates long text and adds title', () => {
    const config = mockColumnConfig({ meta: { zodType: 'string', filterType: false, editable: true, inlineEditable: false, truncate: 5 } });
    const el = textCell({ value: 'hello world', config, row: {} });
    expect(el.textContent).toBe('hello...');
    expect(el.getAttribute('title')).toBe('hello world');
  });

  it('NumberCell formats currency', () => {
    const config = mockColumnConfig({ meta: { zodType: 'number', filterType: false, editable: true, inlineEditable: false, displayFormat: 'currency' } });
    const el = numberCell({ value: 42.5, config, row: {} });
    expect(el.textContent).toContain('42.50');
  });

  it('NumberCell shows em-dash for null', () => {
    const el = numberCell({ value: null, config: mockColumnConfig(), row: {} });
    expect(el.textContent).toBe('\u2014');
  });

  it('BooleanCell shows checkmark for true', () => {
    const el = booleanCell({ value: true, config: mockColumnConfig(), row: {} });
    expect(el.textContent).toBe('\u2713');
  });

  it('BooleanCell shows cross for false', () => {
    const el = booleanCell({ value: false, config: mockColumnConfig(), row: {} });
    expect(el.textContent).toBe('\u2717');
  });

  it('DateCell formats dates', () => {
    const el = dateCell({ value: new Date('2024-01-15'), config: mockColumnConfig(), row: {} });
    expect(el.textContent).toBeTruthy();
    expect(el.classList.contains('zodal-cell-date')).toBe(true);
  });

  it('BadgeCell sets data-variant attribute', () => {
    const config = mockColumnConfig({ meta: { zodType: 'enum', filterType: false, editable: true, inlineEditable: false, badge: { active: 'success' } } });
    const el = badgeCell({ value: 'active', config, row: {} });
    expect(el.getAttribute('data-variant')).toBe('success');
    expect(el.classList.contains('zodal-badge')).toBe(true);
  });

  it('ArrayCell joins values with commas', () => {
    const el = arrayCell({ value: ['a', 'b', 'c'], config: mockColumnConfig(), row: {} });
    expect(el.textContent).toBe('a, b, c');
  });

  it('ArrayCell shows em-dash for non-array', () => {
    const el = arrayCell({ value: 'not-an-array', config: mockColumnConfig(), row: {} });
    expect(el.textContent).toBe('\u2014');
  });
});

describe('Form Renderers', () => {
  const textInput = getRenderer(formRenderers, 'TextInput');
  const numberInput = getRenderer(formRenderers, 'NumberInput');
  const checkboxInput = getRenderer(formRenderers, 'CheckboxInput');
  const selectInput = getRenderer(formRenderers, 'SelectInput');

  it('TextInput creates label + input structure', () => {
    const el = textInput({
      field: { value: 'hi', onChange: () => {} },
      config: mockFormConfig(),
    });
    expect(el.tagName).toBe('DIV');
    expect(el.classList.contains('zodal-field')).toBe(true);
    expect(el.querySelector('label')).toBeTruthy();
    expect(el.querySelector('input[type="text"]')).toBeTruthy();
  });

  it('TextInput fires onChange on input event', () => {
    let received: unknown;
    const el = textInput({
      field: { value: '', onChange: (v) => { received = v; } },
      config: mockFormConfig(),
    });
    const input = el.querySelector('input') as HTMLInputElement;
    Object.defineProperty(input, 'value', { writable: true, value: 'hello' });
    input.dispatchEvent(new Event('input'));
    expect(received).toBe('hello');
  });

  it('NumberInput parses value to number', () => {
    let received: unknown;
    const el = numberInput({
      field: { value: 0, onChange: (v) => { received = v; } },
      config: mockFormConfig({ type: 'number', zodType: 'number' }),
    });
    const input = el.querySelector('input[type="number"]') as HTMLInputElement;
    Object.defineProperty(input, 'value', { writable: true, value: '42' });
    input.dispatchEvent(new Event('input'));
    expect(received).toBe(42);
  });

  it('CheckboxInput fires onChange with boolean', () => {
    let received: unknown;
    const el = checkboxInput({
      field: { value: false, onChange: (v) => { received = v; } },
      config: mockFormConfig({ type: 'checkbox', zodType: 'boolean' }),
    });
    const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    Object.defineProperty(input, 'checked', { writable: true, value: true });
    input.dispatchEvent(new Event('change'));
    expect(received).toBe(true);
  });

  it('SelectInput creates options from config', () => {
    const el = selectInput({
      field: { value: 'b', onChange: () => {} },
      config: mockFormConfig({
        type: 'select',
        zodType: 'enum',
        options: [
          { label: 'Alpha', value: 'a' },
          { label: 'Beta', value: 'b' },
        ],
      }),
    });
    const options = el.querySelectorAll('option');
    // placeholder + 2 options
    expect(options.length).toBe(3);
  });

  it('TextInput shows help text when provided', () => {
    const el = textInput({
      field: { value: '', onChange: () => {} },
      config: mockFormConfig({ helpText: 'Enter your name' }),
    });
    const help = el.querySelector('.zodal-help');
    expect(help).toBeTruthy();
    expect(help!.textContent).toBe('Enter your name');
  });
});

describe('Filter Renderers', () => {
  const textFilter = getRenderer(filterRenderers, 'TextFilter');
  const selectFilter = getRenderer(filterRenderers, 'SelectFilter');
  const rangeFilter = getRenderer(filterRenderers, 'RangeFilter');
  const booleanFilter = getRenderer(filterRenderers, 'BooleanFilter');

  it('TextFilter creates an input with placeholder', () => {
    const el = textFilter({
      field: { value: '', onChange: () => {} },
      config: mockFilterConfig(),
    });
    expect(el.tagName).toBe('INPUT');
    expect(el.getAttribute('placeholder')).toBe('Filter Test...');
  });

  it('TextFilter fires onChange on input', () => {
    let received: unknown;
    const el = textFilter({
      field: { value: '', onChange: (v) => { received = v; } },
      config: mockFilterConfig(),
    });
    Object.defineProperty(el, 'value', { writable: true, value: 'search' });
    el.dispatchEvent(new Event('input'));
    expect(received).toBe('search');
  });

  it('SelectFilter creates select with All option', () => {
    const el = selectFilter({
      field: { value: '', onChange: () => {} },
      config: mockFilterConfig({
        filterType: 'select',
        options: [{ label: 'Active', value: 'active' }],
      }),
    });
    expect(el.tagName).toBe('SELECT');
    const options = el.querySelectorAll('option');
    expect(options[0].textContent).toBe('All Test');
    expect(options.length).toBe(2);
  });

  it('RangeFilter creates two number inputs', () => {
    const el = rangeFilter({
      field: { value: [10, 100], onChange: () => {} },
      config: mockFilterConfig({ filterType: 'range' }),
    });
    const inputs = el.querySelectorAll('input[type="number"]');
    expect(inputs.length).toBe(2);
    expect(el.style.display).toBe('flex');
  });

  it('RangeFilter fires onChange with min/max tuple', () => {
    let received: unknown;
    const el = rangeFilter({
      field: { value: [undefined, undefined], onChange: (v) => { received = v; } },
      config: mockFilterConfig({ filterType: 'range' }),
    });
    const minInput = el.querySelectorAll('input')[0] as HTMLInputElement;
    Object.defineProperty(minInput, 'value', { writable: true, value: '5' });
    minInput.dispatchEvent(new Event('input'));
    expect(received).toEqual([5, undefined]);
  });

  it('BooleanFilter creates All/Yes/No dropdown', () => {
    const el = booleanFilter({
      field: { value: undefined, onChange: () => {} },
      config: mockFilterConfig({ filterType: 'boolean', zodType: 'boolean' }),
    });
    expect(el.tagName).toBe('SELECT');
    const options = el.querySelectorAll('option');
    expect(options.length).toBe(3);
    expect(options[0].textContent).toBe('All');
    expect(options[1].textContent).toBe('Yes');
    expect(options[2].textContent).toBe('No');
  });
});
