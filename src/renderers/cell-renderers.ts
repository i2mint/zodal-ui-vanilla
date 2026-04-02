/**
 * Cell renderers for table display.
 * Plain DOM elements — no framework dependency.
 */

import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import { el } from '../dom.js';
import type { CellProps } from '../types.js';

function textCell({ value, config }: CellProps): HTMLElement {
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
    : String(value);
  return el('span', { class: 'zodal-cell zodal-cell-number' }, formatted);
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
  return el('span', {
    class: 'zodal-cell zodal-badge',
    'data-variant': variant,
  }, str);
}

function arrayCell({ value }: CellProps): HTMLElement {
  if (!Array.isArray(value)) return el('span', { class: 'zodal-cell zodal-muted' }, '\u2014');
  return el('span', { class: 'zodal-cell zodal-cell-array' }, value.join(', '));
}

export type CellRenderer = (props: CellProps) => HTMLElement;

export const cellRenderers: RendererEntry<CellRenderer>[] = [
  {
    tester: () => PRIORITY.FALLBACK,
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
