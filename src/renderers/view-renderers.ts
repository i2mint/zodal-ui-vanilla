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
 * Feedback (design decision 7): every pressable here (operation buttons, an item with `onOpen`,
 * a group header) is wired with `wirePress`: pressed at once on `pointerdown`, pending while the
 * callback's promise is in flight, repeat presses ignored. Return the promise from `onOperation`,
 * `onCollectionOperation` and `onOpen` (an app opening, a command dispatching) to get that.
 *
 * One-way data flow (design decision 5): each call builds fresh DOM. A click on a group header
 * toggles that group in place and reports it through `onToggleGroup`, so a consumer can persist
 * it (`ViewStateStore.toggleGroup`) and pass `collapsedGroups` on the next render.
 */

import { el } from '../dom.js';
import { wirePress } from '../press.js';
import { FEEDBACK_MS, operationKey, type OperationStatusSource } from '../action-feedback.js';
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
  /**
   * Called when an operation button is clicked. Without it, no operation is drawn. Return the
   * work's promise (or command result): the button stays pending, and ignores presses, until it settles.
   */
  onOperation?: (operation: ViewOperationConfig, item: Item) => unknown;
  /** Override how a value is drawn (e.g. with a cell renderer from the registry). */
  renderValue?: ValueRenderer;
  /**
   * What a pending press is kept against across rebuilds (with the item and operation). Default:
   * the `config` object. Pass one object per pane when two panes draw the same config.
   */
  shareScope?: object;
  /**
   * Called when the item itself (outside its buttons) is clicked or activated with Enter. Return
   * the promise of whatever opening takes (a fetch, a lazy route): the item shows it is opening.
   */
  onOpen?: (item: Item) => unknown;
  /**
   * A shared status of operations (`createOperationStatus()`, zodal#112): an operation run from
   * another surface (the palette, a hotkey) shows pending on its button here, and its button
   * ignores presses meanwhile. Keys: `operationKey(op.name, itemId)` for item operations,
   * `operationKey(op.name)` for collection and selection operations.
   */
  operationStatus?: OperationStatusSource;
}

/** Where a collection's load is (`CollectionState.loadStatus` in `@zodal/ui`, zodal#111). */
export type ViewLoadStatus = 'idle' | 'first-load' | 'refreshing' | 'ready' | 'empty' | 'error';

/** The hand-order (Reorder) mode of a collection view (zodal#127). */
export interface ReorderOptions {
  /** Draw the Up/Down buttons (an explicit mode, so rows stay readable outside it). */
  active: boolean;
  /** Move an item one place; the host reorders (`moveUp`/`moveDown` from `@zodal/core`) and re-renders. */
  onMove: (id: string, direction: 'up' | 'down', item: Item) => unknown;
  /**
   * The item just moved, and how: its button for the same direction gets focus after the
   * re-render (or the other one, at an end), and the move is announced to screen readers.
   */
  moved?: { id: string; direction: 'up' | 'down' };
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
  /** Called for a collection or selection operation (`items`: the selected items, or none); return its promise, as for `onOperation`. */
  onCollectionOperation?: (operation: ViewOperationConfig, items: Item[]) => unknown;
  /** Header of the group of items with no value. Default: `'None'`. */
  emptyLabel?: string;
  /** Shown when there are no items. Default: `'No items'`. */
  emptyText?: string;
  /**
   * The load status (`CollectionState.loadStatus`, zodal#111): `first-load` draws skeleton rows in
   * the final layout, `refreshing` keeps the items, dimmed and `aria-busy`.
   */
  loadStatus?: ViewLoadStatus;
  /** How long the load has run; under `FEEDBACK_MS.indicator` nothing is shown (a fast load flashes nothing). */
  loadElapsedMs?: number;
  /** How many skeleton rows a first load draws. Default: 6. */
  skeletonCount?: number;
  /** Hand order: an explicit Reorder mode with Up/Down buttons (zodal#127). */
  reorder?: ReorderOptions;
}

/** Styles for skeleton rows, a refreshing view, the Reorder buttons and screen-reader-only text. */
export const VIEW_LOAD_CSS = `
.zodal-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.zodal-skeleton { background: var(--zodal-skeleton, rgba(127,127,127,.18)); border-radius: 4px; height: 1em; margin: 4px 0; }
.zodal-skeleton-label { width: 55%; }
.zodal-skeleton-line { width: 80%; height: .8em; }
@media (prefers-reduced-motion: no-preference) { .zodal-skeleton { animation: zodal-pulse 1.4s ease-in-out infinite; } }
@keyframes zodal-pulse { 50% { opacity: .5; } }
.zodal-view[data-load="stale"] { opacity: .6; transition: opacity .2s; }
.zodal-reorder { display: flex; gap: 4px; margin-inline-start: auto; }
.zodal-reorder-button { min-width: 44px; min-height: 44px; }
.zodal-reorder-button:disabled { opacity: .35; }
`;

const styledDocs = new WeakSet<Document>();
function installViewStyles(doc: Document): void {
  if (styledDocs.has(doc)) return;
  styledDocs.add(doc);
  doc.head.appendChild(el('style', { 'data-zodal': 'view' }, VIEW_LOAD_CSS));
}

/** What a view shows for its load (the same rule as `getLoadFeedback` in `@zodal/ui`). */
export function loadFeedbackOf(status: ViewLoadStatus | undefined, elapsedMs?: number): 'skeleton' | 'stale' | 'none' {
  if (status !== 'first-load' && status !== 'refreshing') return 'none';
  if (elapsedMs !== undefined && elapsedMs < FEEDBACK_MS.indicator) return 'none';
  return status === 'first-load' ? 'skeleton' : 'stale';
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

/**
 * The operation buttons. `share` keys each button's pending state to the view config, so a view
 * rebuilt while an operation runs (the host re-renders on every state change) keeps it.
 */
function operationButtons(
  ops: ViewOperationConfig[],
  run: (op: ViewOperationConfig) => unknown,
  share: { scope: object; prefix: string },
  status?: { source: OperationStatusSource; itemId?: string },
): HTMLElement | null {
  if (ops.length === 0) return null;
  return el('div', { class: 'zodal-view-actions' },
    ...ops.map((op) => {
      const button = el('button', {
        type: 'button',
        class: 'zodal-button',
        'data-operation': op.name,
        'data-variant': op.variant ?? 'default',
        'data-confirm': op.confirm ? 'true' : undefined,
        title: op.keyboardShortcut ? `${op.label} (${op.keyboardShortcut})` : undefined,
      }, op.label);
      wirePress(button, () => run(op), {
        stopPropagation: true,
        share: { scope: share.scope, key: `${share.prefix}${op.name}` },
        ...(status ? { status: { source: status.source, key: operationKey(op.name, status.itemId) } } : {}),
      });
      return button;
    }),
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

/** A placeholder item in the final layout (a first load): the label and secondary lines as bars. */
function skeletonItem(config: ViewConfig): HTMLElement {
  const bars = [el('div', { class: 'zodal-skeleton zodal-skeleton-label' })];
  for (let i = 0; i < Math.min(config.fields.secondary.length, 2); i++) bars.push(el('div', { class: 'zodal-skeleton zodal-skeleton-line' }));
  return config.kind === 'grid'
    ? el('article', { class: 'zodal-card zodal-skeleton-item', 'aria-hidden': 'true' }, el('div', { class: 'zodal-card-body' }, ...bars))
    : el('li', { class: 'zodal-list-item zodal-skeleton-item', 'aria-hidden': 'true' }, el('div', { class: 'zodal-list-body' }, ...bars));
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
    wirePress(root, () => onOpen(item), { enterKey: true, share: { scope: props.shareScope ?? config, key: `open:${itemId(item, config)}` } });
  }
  return root;
}

// ============================================================================
// Item renderers
// ============================================================================

/** One item as a list row: checkbox, thumbnail, label, badges, secondary text, operations. */
export function renderListItem(props: ItemViewProps): HTMLElement {
  const { item, config, onOperation } = props;
  const ops = onOperation
    ? operationButtons(
        config.operations.item,
        (op) => onOperation(op, item),
        { scope: props.shareScope ?? config, prefix: `item:${itemId(item, config)}:` },
        props.operationStatus ? { source: props.operationStatus, itemId: itemId(item, config) } : undefined,
      )
    : null;
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
  const ops = onOperation
    ? operationButtons(
        config.operations.item,
        (op) => onOperation(op, item),
        { scope: props.shareScope ?? config, prefix: `item:${itemId(item, config)}:` },
        props.operationStatus ? { source: props.operationStatus, itemId: itemId(item, config) } : undefined,
      )
    : null;
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
  let renderItem = config.kind === 'grid' ? renderGridCard : renderListItem;
  const itemProps = (item: Item): ItemViewProps => ({
    item,
    config,
    selected: selectedIds.includes(itemId(item, config)),
    onSelect: props.onSelect,
    onOperation: props.onOperation,
    renderValue: props.renderValue,
    onOpen: props.onOpen,
    shareScope: props.shareScope,
    ...(props.operationStatus ? { operationStatus: props.operationStatus } : {}),
  });
  const container = (children: HTMLElement[]) =>
    config.kind === 'grid'
      ? el('div', { class: 'zodal-grid', role: 'list' }, ...children.map((c) => (c.setAttribute('role', 'listitem'), c)))
      : el('ul', { class: 'zodal-list' }, ...children);

  const root = el('div', { class: `zodal-view zodal-view-${config.kind}`, 'data-kind': config.kind });

  if (onCollectionOperation) {
    const selected = items.filter((i) => selectedIds.includes(itemId(i, config)));
    const ops = [...config.operations.collection, ...(selected.length ? config.operations.selection : [])];
    const toolbar = operationButtons(
      ops,
      (op) => onCollectionOperation(op, config.operations.selection.includes(op) ? selected : []),
      { scope: props.shareScope ?? config, prefix: 'collection:' },
      props.operationStatus ? { source: props.operationStatus } : undefined,
    );
    if (toolbar) {
      toolbar.className = 'zodal-view-toolbar';
      root.appendChild(toolbar);
    }
  }

  const feedback = loadFeedbackOf(props.loadStatus, props.loadElapsedMs);
  if (feedback !== 'none' || props.reorder?.active) installViewStyles(root.ownerDocument);
  if (feedback === 'skeleton' && items.length === 0) {
    // Placeholders in the final layout, so nothing shifts when the items land.
    root.setAttribute('aria-busy', 'true');
    root.setAttribute('data-load', 'skeleton');
    const rows = Array.from({ length: props.skeletonCount ?? 6 }, () => skeletonItem(config));
    root.appendChild(container(rows));
    return root;
  }
  if (feedback === 'stale') {
    // A refresh keeps what is shown, marked busy: replacing it with a skeleton reads as data loss.
    root.setAttribute('aria-busy', 'true');
    root.setAttribute('data-load', 'stale');
  }

  if (items.length === 0) {
    root.appendChild(el('p', { class: 'zodal-view-empty zodal-muted' }, emptyText));
    return root;
  }

  const reorder = props.reorder?.active ? props.reorder : undefined;
  if (reorder) {
    root.setAttribute('data-reorder', 'true');
    const order = items.map((i) => itemId(i, config));
    const announce = el('div', { class: 'zodal-sr-only', role: 'status', 'aria-live': 'polite' });
    root.appendChild(announce);
    const moved = reorder.moved;
    if (moved) {
      const at = order.indexOf(moved.id);
      const item = items[at];
      if (item) announce.textContent = `Moved ${labelText(item, config)} to position ${at + 1} of ${order.length}`;
    }
    const withButtons = renderItem;
    const decorate = (node: HTMLElement, item: Item) => {
      const id = itemId(item, config);
      const at = order.indexOf(id);
      const label = labelText(item, config);
      const button = (direction: 'up' | 'down', disabled: boolean) => {
        const b = el('button', {
          type: 'button',
          class: 'zodal-button zodal-reorder-button',
          'data-move': direction,
          'aria-label': `Move ${label} ${direction}`,
          ...(disabled ? { disabled: true, 'aria-disabled': 'true' } : {}),
        }, direction === 'up' ? '\u2191' : '\u2193');
        if (!disabled) wirePress(b, () => reorder.onMove(id, direction, item), { stopPropagation: true });
        return b;
      };
      const up = button('up', at <= 0);
      const down = button('down', at >= order.length - 1);
      node.appendChild(el('div', { class: 'zodal-reorder' }, up, down));
      if (moved?.id === id) {
        // Focus follows the moved item: the same direction, or the other at an end.
        const target = (moved.direction === 'up' ? (up as HTMLButtonElement) : (down as HTMLButtonElement));
        const other = target === up ? down : up;
        const focusTarget = (target as HTMLButtonElement).disabled ? other : target;
        queueMicrotask(() => {
          if (focusTarget.isConnected) (focusTarget as HTMLButtonElement).focus();
        });
      }
      return node;
    };
    renderItem = (p: ItemViewProps) => decorate(withButtons(p), p.item);
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
        }, ...title)
      : el('div', { class: 'zodal-group-header' }, ...title);
    if (group.collapsible) {
      wirePress(header, () => {
        content.hidden = !content.hidden;
        header.setAttribute('aria-expanded', String(!content.hidden));
        section.setAttribute('data-collapsed', String(content.hidden));
        onToggleGroup?.(g.id);
      });
    }
    const section = el('section', { class: 'zodal-group', 'data-group-id': g.id, 'data-group-kind': g.kind, 'data-collapsed': String(g.collapsed) }, header, content);
    root.appendChild(section);
  }
  return root;
}
