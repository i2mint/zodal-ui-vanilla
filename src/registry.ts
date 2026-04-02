import { createRendererRegistry } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import { cellRenderers } from './renderers/cell-renderers.js';
import { formRenderers } from './renderers/form-renderers.js';
import { filterRenderers } from './renderers/filter-renderers.js';

/** A vanilla renderer function: takes props, returns an HTMLElement. */
export type VanillaRenderer = (props: any) => HTMLElement;

/**
 * Create a RendererRegistry pre-loaded with all vanilla DOM renderers.
 */
export function createVanillaRegistry() {
  const registry = createRendererRegistry<VanillaRenderer>();
  const allRenderers: RendererEntry<VanillaRenderer>[] = [
    ...cellRenderers,
    ...formRenderers,
    ...filterRenderers,
  ];
  for (const entry of allRenderers) {
    registry.register(entry);
  }
  return registry;
}
