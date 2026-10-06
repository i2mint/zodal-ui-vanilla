/**
 * Prop types for the vanilla renderers.
 *
 * Form and filter props follow `@zodal/ui`'s `FieldRenderProps` (`config` plus the
 * render `context`, which carries `suggest` and `history`), with one difference kept for
 * backward compatibility: `field` is the value binding (`{ value, onChange }`),
 * as it has always been in this package, so the resolved affordance travels as
 * `affordance`. Both `context` and `affordance` are optional: renderers written
 * for the old props keep working, and callers that never pass a context get the
 * same widgets without suggestions or history.
 */

import type { ResolvedFieldAffordance } from '@zodal/core';
import type {
  ColumnConfig,
  FormFieldConfig,
  FilterFieldConfig,
  FieldRenderProps,
  RendererContext,
  SuggestionSource,
} from '@zodal/ui';
import type { FieldHistoryStore } from './history-types.js';

/**
 * The render context a field renderer may receive: `@zodal/ui`'s `RendererContext`, with `mode`
 * optional and `history` typed by this package's structural `FieldHistoryStore`.
 */
export interface FieldRenderContext {
  mode?: string;
  /** Where a tag input or chip filter gets its suggestions. Absent: `options`, or free text. */
  suggest?: SuggestionSource;
  /** Where a field with `config.history` reads and writes its past values. Absent: no history UI. */
  history?: FieldHistoryStore;
  [key: string]: unknown;
}

/** A value binding: the current value and the way to change it. */
export interface FieldBinding<V = unknown> {
  value: V;
  onChange: (value: V) => void;
}

/** `FieldRenderProps` with `field` as the value binding and the affordance as `affordance`. */
export type BoundFieldProps<C> = Omit<FieldRenderProps<C>, 'field' | 'context'> & {
  /** Form or filter binding (value + onChange). */
  field: FieldBinding;
  /** The render context (`{ mode, suggest, history }`). */
  context?: FieldRenderContext;
  /** The field's resolved affordance (what `FieldRenderProps.field` holds in `@zodal/ui`). */
  affordance?: ResolvedFieldAffordance;
};

/** Props passed to cell renderer functions. */
export interface CellProps {
  /** The cell value. */
  value: unknown;
  /** The column configuration from toColumnDefs(). */
  config: ColumnConfig;
  /** The full row data. */
  row: Record<string, unknown>;
  /** The render context, when the caller has one. */
  context?: RendererContext;
}

/** Props passed to form field renderer functions. */
export type FormFieldProps = BoundFieldProps<FormFieldConfig>;

/** Props passed to filter renderer functions. */
export type FilterFieldProps = BoundFieldProps<FilterFieldConfig>;
