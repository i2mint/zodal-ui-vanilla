/**
 * Cell renderers for table display.
 * Plain DOM elements — no framework dependency.
 */

import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import { el } from '../dom.js';
import type { CellProps } from '../types.js';

/**
 * The option a value stands for in `ColumnConfig.meta.options` (i2mint/zodal#100), compared as
 * strings like `labelOf` in `@zodal/ui`; read structurally since the `@zodal/ui` on npm predates it.
 */
function optionOf(config: CellProps['config'], value: unknown): { label: string; hint?: string } | undefined {
  const options = (config.meta as { options?: unknown }).options;
  if (!Array.isArray(options)) return undefined;
  const key = String(value);
  const hit = options.find((o) => o && typeof o === 'object' && String((o as { value?: unknown }).value) === key) as
    | { label?: unknown; hint?: unknown }
    | undefined;
  if (!hit || typeof hit.label !== 'string' || hit.label === '') return undefined;
  return typeof hit.hint === 'string' ? { label: hit.label, hint: hit.hint } : { label: hit.label };
}

/** The text a cell shows for a value: its option label, else the value. */
export function cellLabel(config: CellProps['config'], value: unknown): string {
  return optionOf(config, value)?.label ?? String(value ?? '');
}

function textCell({ value, config }: CellProps): HTMLElement {
  const option = value == null ? undefined : optionOf(config, value);
  if (option) return el('span', { class: 'zodal-cell zodal-cell-text', title: option.hint }, option.label);
  const str = String(value ?? '');
  const truncate = config.meta.truncate;
  if (truncate && str.length > truncate) {
    return el('span', { title: str, class: 'zodal-cell zodal-cell-text' }, str.slice(0, truncate) + '...');
  }
  return el('span', { class: 'zodal-cell zodal-cell-text' }, str);
}

function numberCell({ value, config }: CellProps): HTMLElement {
  if (value == null) return el('span', { class: 'zodal-cell zodal-muted' }, '\u2014');
  const formatted = config.meta.displayFormat === 'currency'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value as number)
    : cellLabel(config, value);
  return el('span', { class: 'zodal-cell zodal-cell-number', title: optionOf(config, value)?.hint }, formatted);
}

function booleanCell({ value }: CellProps): HTMLElement {
  return el('span', { class: 'zodal-cell zodal-cell-boolean' }, value ? '\u2713' : '\u2717');
}

function dateCell({ value }: CellProps): HTMLElement {
  if (value == null) return el('span', { class: 'zodal-cell zodal-muted' }, '\u2014');
  const date = value instanceof Date ? value : new Date(value as string);
  return el('span', { class: 'zodal-cell zodal-cell-date' }, date.toLocaleDateString());
}

function badgeCell({ value, config }: CellProps): HTMLElement {
  const str = String(value ?? '');
  const variant = config.meta.badge?.[str] ?? 'default';
  const option = value == null ? undefined : optionOf(config, value);
  return el('span', {
    class: 'zodal-cell zodal-badge',
    'data-variant': variant,
    title: option?.hint,
  }, option?.label ?? str);
}

function arrayCell({ value, config }: CellProps): HTMLElement {
  if (!Array.isArray(value)) return el('span', { class: 'zodal-cell zodal-muted' }, '\u2014');
  return el('span', { class: 'zodal-cell zodal-cell-array' }, value.map((v) => cellLabel(config, v)).join(', '));
}

export type CellRenderer = (props: CellProps) => HTMLElement;

export const cellRenderers: RendererEntry<CellRenderer>[] = [
  {
    tester: (_, ctx) => ctx.mode === 'cell' ? PRIORITY.FALLBACK : -1,
    renderer: textCell,
    name: 'TextCell (fallback)',
  },
  {
    tester: (field, ctx) => ctx.mode === 'cell' && field.zodType === 'string' ? PRIORITY.DEFAULT : -1,
    renderer: textCell,
    name: 'TextCell',
  },
  {
    tester: (field, ctx) => ctx.mode === 'cell' && ['number', 'int', 'float'].includes(field.zodType) ? PRIORITY.DEFAULT : -1,
    renderer: numberCell,
    name: 'NumberCell',
  },
  {
    tester: (field, ctx) => ctx.mode === 'cell' && field.zodType === 'boolean' ? PRIORITY.DEFAULT : -1,
    renderer: booleanCell,
    name: 'BooleanCell',
  },
  {
    tester: (field, ctx) => ctx.mode === 'cell' && field.zodType === 'date' ? PRIORITY.DEFAULT : -1,
    renderer: dateCell,
    name: 'DateCell',
  },
  {
    tester: (field, ctx) => ctx.mode === 'cell' && field.zodType === 'enum' ? PRIORITY.DEFAULT : -1,
    renderer: badgeCell,
    name: 'BadgeCell',
  },
  {
    tester: (field, ctx) => ctx.mode === 'cell' && field.zodType === 'array' ? PRIORITY.DEFAULT : -1,
    renderer: arrayCell,
    name: 'ArrayCell',
  },
  {
    tester: (field, ctx) => ctx.mode === 'cell' && (field as any).displayFormat === 'currency' ? PRIORITY.LIBRARY : -1,
    renderer: numberCell,
    name: 'CurrencyCell',
  },
];
