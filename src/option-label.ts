/**
 * Option labels for display: the label a value stands for in `ColumnConfig.meta.options`
 * (i2mint/zodal#100). Shared by the cell renderers and the chip cell.
 */

import type { CellProps } from './types.js';

/**
 * The option a value stands for in `ColumnConfig.meta.options`, compared as strings like
 * `labelOf` in `@zodal/ui`; read structurally, and tolerant of a config without `meta`.
 */
export function optionOf(config: CellProps['config'] | undefined, value: unknown): { label: string; hint?: string } | undefined {
  const options = (config?.meta as { options?: unknown } | undefined)?.options;
  if (!Array.isArray(options)) return undefined;
  const key = String(value);
  const hit = options.find((o) => o && typeof o === 'object' && String((o as { value?: unknown }).value) === key) as
    | { label?: unknown; hint?: unknown }
    | undefined;
  if (!hit || typeof hit.label !== 'string' || hit.label === '') return undefined;
  return typeof hit.hint === 'string' ? { label: hit.label, hint: hit.hint } : { label: hit.label };
}

/** The text a cell shows for a value: its option label, else the value. */
export function cellLabel(config: CellProps['config'] | undefined, value: unknown): string {
  return optionOf(config, value)?.label ?? String(value ?? '');
}
