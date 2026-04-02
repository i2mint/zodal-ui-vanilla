/**
 * Filter widget renderers.
 * Plain DOM elements with native event listeners.
 */

import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import { el } from '../dom.js';
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

export type FilterRenderer = (props: FilterFieldProps) => HTMLElement;

export const filterRenderers: RendererEntry<FilterRenderer>[] = [
  {
    tester: (_, ctx) => ctx.mode === 'filter' ? PRIORITY.FALLBACK : -1,
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
