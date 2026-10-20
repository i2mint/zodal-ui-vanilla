/**
 * Collection view renderers: the whole collection as a list of rows or a grid of cards,
 * grouped and collapsible, from a `ViewConfig` (`toViewConfig(collection, mode)` in `@zodal/ui`).
 *
 * - `renderListItem` / `renderGridCard`: one item, its fields drawn by role (image, label,
 *   badges, secondary text) plus its item operations and a selection checkbox;
 * - `renderCollectionView`: every item, bucketed into groups with a header that collapses and
 *   expands the group (when the config says the group is collapsible), and a toolbar with the
 *   collection operations (and the selection operations while something is selected).
 *
 * One-way data flow (design decision 5): each call builds fresh DOM. A click on a group header
 * toggles that group in place and reports it through `onToggleGroup`, so a consumer can persist
 * it (`ViewStateStore.toggleGroup`) and pass `collapsedGroups` on the next render.
 */

import { el } from '../dom.js';
import { groupItems } from '../group-items.js';
import type { ViewConfig, ViewFieldConfig, ViewOperationConfig } from '../view-types.js';

type Item = Record<string, unknown>;

/** Draw one field value; return `null` to fall back to the default text. */
export type ValueRenderer = (value: unknown, field: ViewFieldConfig, item: Item) => Node | string | null;

/** What every item renderer takes. */
export interface ItemViewProps {
  /** The item. */
  item: Item;
  /** The view config (`toViewConfig(collection, 'list' | 'grid')`). */
  config: ViewConfig;
  /** Is the item selected? */
  selected?: boolean;
  /** Called when the selection checkbox changes. Without it, no checkbox is drawn. */
  onSelect?: (id: string, selected: boolean, item: Item) => void;
  /** Called when an operation button is clicked. Without it, no operation is drawn. */
  onOperation?: (operation: ViewOperationConfig, item: Item) => void;
  /** Override how a value is drawn (e.g. with a cell renderer from the registry). */
  renderValue?: ValueRenderer;
  /** Called when the item itself (outside its buttons) is clicked or activated with Enter. */
  onOpen?: (item: Item) => void;
}

/** What the collection view takes. */
export interface CollectionViewProps extends Omit<ItemViewProps, 'item' | 'selected'> {
  /** The items to draw (already sorted and filtered). */
  items: readonly Item[];
  /** Ids of the collapsed groups (`ViewState.collapsedGroups`). */
  collapsedGroups?: readonly string[];
  /** Ids of the expanded groups (`ViewState.expandedGroups`); any other group follows `defaultState`. */
  expandedGroups?: readonly string[];
  /** Called when a group header is clicked; the group is toggled in place either way. */
  onToggleGroup?: (groupId: string) => void;
  /** Ids of the selected items. */
  selectedIds?: readonly string[];
  /** Called for a collection or selection operation (`items`: the selected items, or none). */
  onCollectionOperation?: (operation: ViewOperationConfig, items: Item[]) => void;
  /** Header of the group of items with no value. Default: `'None'`. */
  emptyLabel?: string;
  /** Shown when there are no items. Default: `'No items'`. */
  emptyText?: string;
}

const DASH = '—';
/** Makes group content ids unique across every view on the page. */
let groupSeq = 0;

/** The item's id, as a string. */
export function itemId(item: Item, config: ViewConfig): string {
  return String(item[config.idField] ?? '');
}

// ============================================================================
// Values
// ============================================================================

function isContentRef(value: unknown): value is { _tag: 'ContentRef'; url?: string } {
  return typeof value === 'object' && value !== null && (value as { _tag?: unknown })._tag === 'ContentRef';
}

function textOf(value: unknown, field: ViewFieldConfig): string {
  if (value === null || value === undefined || value === '') return DASH;
  if (value instanceof Date) return value.toLocaleDateString();
  if (field.zodType === 'date' && typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  }
  if (field.zodType === 'boolean' || typeof value === 'boolean') return value ? '✓' : '✗';
  if (Array.isArray(value) || value instanceof Set) return [...value].map(String).join(', ');
  if (isContentRef(value)) return value.url ?? DASH;
  return String(value);
}

function truncated(text: string, field: ViewFieldConfig): HTMLElement {
  const max = field.truncate;
  if (max && text.length > max) return el('span', { title: text }, `${text.slice(0, max)}...`);
  return el('span', null, text);
}

function valueNode(item: Item, field: ViewFieldConfig, renderValue?: ValueRenderer): Node {
  const custom = renderValue?.(item[field.name], field, item);
  if (custom !== null && custom !== undefined) return typeof custom === 'string' ? document.createTextNode(custom) : custom;
  return truncated(textOf(item[field.name], field), field);
}

function imageUrl(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (isContentRef(value) && value.url) return value.url;
  return null;
}

/** Badges: one per value (a tag list gives several); a boolean shows its label when true. */
function badgeNodes(item: Item, field: ViewFieldConfig): HTMLElement[] {
  const value = item[field.name];
  if (value === null || value === undefined || value === '') return [];
  if (field.zodType === 'boolean' || typeof value === 'boolean') {
    return value ? [el('span', { class: 'zodal-badge', 'data-field': field.name, 'data-variant': field.badge?.true ?? 'default' }, field.label)] : [];
  }
  const values = Array.isArray(value) || value instanceof Set ? [...value] : [value];
  const labelOf = (v: string) => field.options?.find((o) => o.value === v)?.label ?? v;
  return values.map((v) =>
    el('span', { class: 'zodal-badge', 'data-field': field.name, 'data-value': String(v), 'data-variant': field.badge?.[String(v)] ?? 'default' }, labelOf(String(v))),
  );
}

// ============================================================================
// Pieces shared by a row and a card
// ============================================================================

function operationButtons(ops: ViewOperationConfig[], run: (op: ViewOperationConfig) => void): HTMLElement | null {
  if (ops.length === 0) return null;
  return el('div', { class: 'zodal-view-actions' },
    ...ops.map((op) =>
      el('button', {
        type: 'button',
        class: 'zodal-button',
        'data-operation': op.name,
        'data-variant': op.variant ?? 'default',
        'data-confirm': op.confirm ? 'true' : undefined,
        title: op.keyboardShortcut ? `${op.label} (${op.keyboardShortcut})` : undefined,
        onClick: (e: Event) => {
          e.stopPropagation();
          run(op);
        },
      }, op.label),
    ),
  );
}

function selectBox(props: ItemViewProps): HTMLElement | null {
  const { item, config, selected = false, onSelect } = props;
  if (!config.selection || !onSelect) return null;
  const id = itemId(item, config);
  return el('input', {
    type: 'checkbox',
    class: 'zodal-view-select',
    checked: selected,
    'aria-label': `Select ${labelText(item, config)}`,
    onClick: (e: Event) => e.stopPropagation(),
    onChange: (e: Event) => onSelect(id, (e.target as HTMLInputElement).checked, item),
  });
}

function labelText(item: Item, config: ViewConfig): string {
  const f = config.fields.label;
  const v = f ? item[f.name] : undefined;
  return v === null || v === undefined || v === '' ? itemId(item, config) : String(v);
}

function imageNode(item: Item, config: ViewConfig, cls: string): HTMLElement | null {
  const f = config.fields.image;
  if (!f) return null;
  const url = imageUrl(item[f.name]);
  if (!url) return el('div', { class: `${cls} zodal-placeholder`, 'aria-hidden': 'true' });
  return el('img', { class: cls, src: url, alt: labelText(item, config), loading: 'lazy' });
}

function body(props: ItemViewProps): HTMLElement[] {
  const { item, config, renderValue } = props;
  const badges = config.fields.badges.flatMap((f) => badgeNodes(item, f));
  const secondary = config.fields.secondary.map((f) =>
    el('div', { class: 'zodal-view-secondary', 'data-field': f.name },
      el('span', { class: 'zodal-view-secondary-label' }, `${f.label}: `),
      valueNode(item, f, renderValue),
    ),
  );
  const out = [el('div', { class: 'zodal-view-label' }, labelText(item, config))];
  if (badges.length) out.push(el('div', { class: 'zodal-view-badges' }, ...badges));
  out.push(...secondary);
  return out;
}

function wire(root: HTMLElement, props: ItemViewProps): HTMLElement {
  const { item, config, selected, onOpen } = props;
  root.setAttribute('data-id', itemId(item, config));
  if (selected) root.setAttribute('aria-selected', 'true');
  if (onOpen) {
    root.tabIndex = 0;
    root.addEventListener('click', () => onOpen(item));
    root.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && e.target === root) onOpen(item);
    });
  }
  return root;
}

// ============================================================================
// Item renderers
// ============================================================================

/** One item as a list row: checkbox, thumbnail, label, badges, secondary text, operations. */
export function renderListItem(props: ItemViewProps): HTMLElement {
  const { item, config, onOperation } = props;
  const ops = onOperation ? operationButtons(config.operations.item, (op) => onOperation(op, item)) : null;
  return wire(
    el('li', { class: 'zodal-list-item' },
      selectBox(props),
      imageNode(item, config, 'zodal-list-thumbnail'),
      el('div', { class: 'zodal-list-body' }, ...body(props)),
      ops,
    ),
    props,
  );
}

/** One item as a grid card: cover image, then label, badges, secondary text, operations. */
export function renderGridCard(props: ItemViewProps): HTMLElement {
  const { item, config, onOperation } = props;
  const ops = onOperation ? operationButtons(config.operations.item, (op) => onOperation(op, item)) : null;
  return wire(
    el('article', { class: 'zodal-card' },
      imageNode(item, config, 'zodal-card-image'),
      el('div', { class: 'zodal-card-body' }, selectBox(props), ...body(props)),
      ops,
    ),
    props,
  );
}

// ============================================================================
// The collection view
// ============================================================================

/**
 * The whole collection as a list or a grid (`config.kind`), grouped by `config.group`.
 *
 * @example
 * ```typescript
 * const view = toViewConfig(instruments, 'grid');
 * const { collapsedGroups, expandedGroups } = viewState.get();
 * const node = renderCollectionView({
 *   items, config: view, collapsedGroups, expandedGroups,
 *   onToggleGroup: (id) => viewState.toggleGroup(id),
 *   onOperation: (op, item) => run(op.name, item),
 * });
 * container.replaceChildren(node);
 * ```
 */
export function renderCollectionView(props: CollectionViewProps): HTMLElement {
  const { items, config, collapsedGroups, expandedGroups, onToggleGroup, selectedIds = [], onCollectionOperation, emptyLabel, emptyText = 'No items' } = props;
  const renderItem = config.kind === 'grid' ? renderGridCard : renderListItem;
  const itemProps = (item: Item): ItemViewProps => ({
    item,
    config,
    selected: selectedIds.includes(itemId(item, config)),
    onSelect: props.onSelect,
    onOperation: props.onOperation,
    renderValue: props.renderValue,
    onOpen: props.onOpen,
  });
  const container = (children: HTMLElement[]) =>
    config.kind === 'grid'
      ? el('div', { class: 'zodal-grid', role: 'list' }, ...children.map((c) => (c.setAttribute('role', 'listitem'), c)))
      : el('ul', { class: 'zodal-list' }, ...children);

  const root = el('div', { class: `zodal-view zodal-view-${config.kind}`, 'data-kind': config.kind });

  if (onCollectionOperation) {
    const selected = items.filter((i) => selectedIds.includes(itemId(i, config)));
    const ops = [...config.operations.collection, ...(selected.length ? config.operations.selection : [])];
    const toolbar = operationButtons(ops, (op) => onCollectionOperation(op, config.operations.selection.includes(op) ? selected : []));
    if (toolbar) {
      toolbar.className = 'zodal-view-toolbar';
      root.appendChild(toolbar);
    }
  }

  if (items.length === 0) {
    root.appendChild(el('p', { class: 'zodal-view-empty zodal-muted' }, emptyText));
    return root;
  }

  const group = config.group;
  for (const g of groupItems(items, group, { collapsedGroups, expandedGroups, emptyLabel })) {
    if (g.kind === 'all' || !group) {
      root.appendChild(container(g.items.map((i) => renderItem(itemProps(i)))));
      continue;
    }
    const content = container(g.items.map((i) => renderItem(itemProps(i))));
    const contentId = `zodal-group-${++groupSeq}`;
    content.id = contentId;
    if (g.collapsed) content.hidden = true;
    const title = [el('span', { class: 'zodal-group-label' }, g.label), el('span', { class: 'zodal-group-count' }, String(g.items.length))];
    const header = group.collapsible
      ? el('button', {
          type: 'button',
          class: 'zodal-group-header',
          'aria-expanded': String(!g.collapsed),
          'aria-controls': contentId,
          onClick: () => {
            content.hidden = !content.hidden;
            header.setAttribute('aria-expanded', String(!content.hidden));
            section.setAttribute('data-collapsed', String(content.hidden));
            onToggleGroup?.(g.id);
          },
        }, ...title)
      : el('div', { class: 'zodal-group-header' }, ...title);
    const section = el('section', { class: 'zodal-group', 'data-group-id': g.id, 'data-group-kind': g.kind, 'data-collapsed': String(g.collapsed) }, header, content);
    root.appendChild(section);
  }
  return root;
}
