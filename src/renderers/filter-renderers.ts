/**
 * Filter widget renderers.
 * Plain DOM elements with native event listeners.
 */

import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import { el } from '../dom.js';
import { fromDateInputValue, toDateInputValue } from './form-renderers.js';
import type { FilterFieldProps } from '../types.js';

function textFilter({ field, config }: FilterFieldProps): HTMLElement {
  return el('input', {
    type: 'text',
    value: String(field.value ?? ''),
    placeholder: `Filter ${config.label}...`,
    class: 'zodal-filter zodal-filter-text',
    onInput: (e: Event) => field.onChange((e.target as HTMLInputElement).value),
  });
}

function selectFilter({ field, config }: FilterFieldProps): HTMLElement {
  const select = el('select', {
    class: 'zodal-filter zodal-filter-select',
    onChange: (e: Event) => field.onChange((e.target as HTMLSelectElement).value || undefined),
  },
    el('option', { value: '' }, `All ${config.label}`),
    ...(config.options ?? []).map(opt =>
      el('option', { value: opt.value }, opt.label)
    ),
  );
  (select as HTMLSelectElement).value = String(field.value ?? '');
  return select;
}

function rangeFilter({ field, config }: FilterFieldProps): HTMLElement {
  const [min, max] = Array.isArray(field.value) ? field.value : [undefined, undefined];
  if (config.zodType === 'date') return dateRangeFilter({ field, config });
  return el('div', { style: { display: 'flex', gap: '4px' }, class: 'zodal-filter zodal-filter-range' },
    el('input', {
      type: 'number',
      value: min ?? '',
      placeholder: 'Min',
      min: config.bounds?.min,
      max: config.bounds?.max,
      class: 'zodal-input',
      onInput: (e: Event) => {
        const v = (e.target as HTMLInputElement).value;
        field.onChange([v ? Number(v) : undefined, max]);
      },
    }),
    el('input', {
      type: 'number',
      value: max ?? '',
      placeholder: 'Max',
      min: config.bounds?.min,
      max: config.bounds?.max,
      class: 'zodal-input',
      onInput: (e: Event) => {
        const v = (e.target as HTMLInputElement).value;
        field.onChange([min, v ? Number(v) : undefined]);
      },
    }),
  );
}

/** A date range: two date inputs, written back as Dates (UTC midnight), never numbers (i2mint/zodal#105). */
function dateRangeFilter({ field, config }: FilterFieldProps): HTMLElement {
  const value: [unknown, unknown] = Array.isArray(field.value) ? [field.value[0], field.value[1]] : [undefined, undefined];
  const b = config.bounds as { min?: unknown; max?: unknown } | undefined;
  const input = (i: 0 | 1, label: string) =>
    el('input', {
      type: 'date',
      'aria-label': `${config.label} ${label}`,
      value: toDateInputValue(value[i]),
      min: toDateInputValue(b?.min) || undefined,
      max: toDateInputValue(b?.max) || undefined,
      class: 'zodal-input',
      onInput: (e: Event) => {
        value[i] = fromDateInputValue((e.target as HTMLInputElement).value);
        field.onChange([value[0], value[1]]);
      },
    });
  return el('div', { style: { display: 'flex', gap: '4px' }, class: 'zodal-filter zodal-filter-range' }, input(0, 'from'), input(1, 'to'));
}

function booleanFilter({ field, config }: FilterFieldProps): HTMLElement {
  const select = el('select', {
    class: 'zodal-filter zodal-filter-boolean',
    onChange: (e: Event) => {
      const v = (e.target as HTMLSelectElement).value;
      field.onChange(v === 'true' ? true : v === 'false' ? false : undefined);
    },
  },
    el('option', { value: '' }, 'All'),
    el('option', { value: 'true' }, 'Yes'),
    el('option', { value: 'false' }, 'No'),
  );
  // Set initial value
  (select as HTMLSelectElement).value = field.value === true ? 'true' : field.value === false ? 'false' : '';
  return select;
}

/** Scalar types a text filter can match against; anything else (object, set, array) gets no filter. */
const TEXT_FILTERABLE_TYPES = ['string', 'number', 'int', 'float', 'bigint', 'enum', 'literal', 'date'];

export type FilterRenderer = (props: FilterFieldProps) => HTMLElement;

export const filterRenderers: RendererEntry<FilterRenderer>[] = [
  {
    tester: (field, ctx) => ctx.mode === 'filter' && TEXT_FILTERABLE_TYPES.includes(field.zodType) ? PRIORITY.FALLBACK : -1,
    renderer: textFilter,
    name: 'TextFilter (fallback)',
  },
  {
    tester: (field, ctx) => ctx.mode === 'filter' && (field as any).filterable === 'search' ? PRIORITY.DEFAULT : -1,
    renderer: textFilter,
    name: 'TextFilter',
  },
  {
    tester: (field, ctx) => ctx.mode === 'filter' && (field as any).filterable === 'select' ? PRIORITY.DEFAULT : -1,
    renderer: selectFilter,
    name: 'SelectFilter',
  },
  {
    tester: (field, ctx) => ctx.mode === 'filter' && (field as any).filterable === 'multiSelect' ? PRIORITY.DEFAULT : -1,
    renderer: selectFilter,
    name: 'MultiSelectFilter',
  },
  {
    tester: (field, ctx) => ctx.mode === 'filter' && (field as any).filterable === 'range' ? PRIORITY.DEFAULT : -1,
    renderer: rangeFilter,
    name: 'RangeFilter',
  },
  {
    tester: (field, ctx) => ctx.mode === 'filter' && field.zodType === 'boolean' ? PRIORITY.DEFAULT : -1,
    renderer: booleanFilter,
    name: 'BooleanFilter',
  },
];
