/**
 * Cell renderers for table display.
 * Plain DOM elements — no framework dependency.
 */

import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import { el } from '../dom.js';
import type { CellProps } from '../types.js';
import { copyButton, installCopyStyles } from '../copy.js';
import { optionOf, cellLabel } from '../option-label.js';
import { chipCell } from './tag-renderers.js';

export { cellLabel };

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

/** A `copyable` cell: the value, with an icon-only copy button beside it (zodal-ui-vanilla#21). */
function copyableCell({ value, config }: CellProps): HTMLElement {
  installCopyStyles();
  const text = value == null ? '' : cellLabel(config, value);
  const raw = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const header = (config as { header?: unknown }).header;
  return el('span', { class: 'zodal-cell zodal-cell-copyable' },
    el('span', null, text),
    raw ? copyButton(raw, { name: `Copy ${typeof header === 'string' ? header.toLowerCase() : 'value'}` }) : null,
  );
}

export type CellRenderer = (props: CellProps) => HTMLElement;

export const cellRenderers: RendererEntry<CellRenderer>[] = [
  // copyable (any type): above the type defaults, below an app's own renderers
  {
    tester: (field, ctx) => ctx.mode === 'cell' && (field as { copyable?: unknown }).copyable === true ? PRIORITY.LIBRARY : -1,
    renderer: copyableCell,
    name: 'CopyableCell',
  },
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
    // Chips with "+N" overflow (see tag-renderers.ts); the name is kept for lookups.
    renderer: chipCell,
    name: 'ArrayCell',
  },
  {
    tester: (field, ctx) => ctx.mode === 'cell' && (field as any).displayFormat === 'currency' ? PRIORITY.LIBRARY : -1,
    renderer: numberCell,
    name: 'CurrencyCell',
  },
];
