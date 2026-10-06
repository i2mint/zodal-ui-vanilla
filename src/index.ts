/**
 * @zodal/ui-vanilla: zodal renderers as plain DOM element factories.
 *
 * `createVanillaRegistry()` holds every renderer; the arrays (`cellRenderers`,
 * `formRenderers`, `filterRenderers`, content renderers) are exported for
 * selective use, and the tag widgets' factories for custom settings.
 */

export { createVanillaRegistry } from './registry.js';
export type { VanillaRenderer } from './registry.js';
export { cellRenderers } from './renderers/cell-renderers.js';
export { formRenderers } from './renderers/form-renderers.js';
export { filterRenderers } from './renderers/filter-renderers.js';
export { contentCellRenderers, contentFormRenderers } from './renderers/content-renderers.js';
export {
  createTagInput,
  createChipFilter,
  createChipCell,
  tagInput,
  chipFilter,
  chipCell,
} from './renderers/tag-renderers.js';
export {
  DEFAULT_TAG_MESSAGES,
  DEFAULT_TAG_SETTINGS,
  resolveTagSettings,
  toContainsFilter,
  fromContainsFilter,
  createSuggestionController,
} from './tag-logic.js';
export type {
  TagMessages,
  TagSettings,
  TagValue,
  TagOption,
  SuggestionState,
  SuggestionController,
} from './tag-logic.js';
export type {
  CellProps,
  FormFieldProps,
  FilterFieldProps,
  FieldBinding,
  BoundFieldProps,
} from './types.js';
