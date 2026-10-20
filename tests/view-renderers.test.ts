import { describe, it, expect, vi } from 'vitest';
import { renderCollectionView, renderGridCard, renderListItem, groupItems, groupId } from '../src/index.js';
import type { ViewConfig, ViewGroupConfig } from '../src/index.js';

// Built by hand: the shape `toViewConfig(collection, mode)` returns in @zodal/ui (#14), which
// the @zodal/ui on npm this package builds against does not have yet.
const group: ViewGroupConfig = {
  field: 'class', label: 'Class', collapsible: true, defaultState: 'expanded', multiValued: false, multiValue: 'duplicate',
  order: [{ value: 'strings', label: 'Strings' }, { value: 'winds', label: 'Winds' }],
};
const config = (kind: 'list' | 'grid', overrides: Partial<ViewConfig> = {}): ViewConfig => ({
  kind,
  idField: 'id',
  fields: {
    label: { name: 'name', label: 'Name', zodType: 'string' },
    image: { name: 'image', label: 'Image', zodType: 'string' },
    badges: [
      { name: 'tags', label: 'Tags', zodType: 'array', options: [{ value: 'loud', label: 'Loud' }] },
      { name: 'electric', label: 'Electric', zodType: 'boolean' },
    ],
    secondary: [{ name: 'maker', label: 'Maker', zodType: 'string', truncate: 6 }],
  },
  group,
  selection: 'multi',
  operations: {
    item: [{ name: 'edit', label: 'Edit', builtin: true }, { name: 'delete', label: 'Delete', variant: 'destructive', confirm: true, builtin: true }],
    selection: [{ name: 'bulkDelete', label: 'Delete selected', builtin: true }],
    collection: [{ name: 'create', label: 'New', builtin: true }],
  },
  ...overrides,
} as ViewConfig);

const items = [
  { id: 'i1', name: 'Violin', image: 'violin.png', class: 'strings', tags: ['loud'], electric: false, maker: 'Stradivari' },
  { id: 'i2', name: 'Flute', class: 'winds', tags: [], electric: false, maker: 'Yamaha' },
  { id: 'i3', name: 'Theremin', class: 'strings', tags: [], electric: true, maker: 'Moog' },
];

describe('renderListItem', () => {
  it('draws a row: thumbnail, label, badges with vocabulary labels, secondary text', () => {
    const row = renderListItem({ item: items[0], config: config('list') });
    expect(row.tagName).toBe('LI');
    expect(row.getAttribute('data-id')).toBe('i1');
    expect(row.querySelector('img.zodal-list-thumbnail')?.getAttribute('src')).toBe('violin.png');
    expect(row.querySelector('.zodal-view-label')?.textContent).toBe('Violin');
    expect([...row.querySelectorAll('.zodal-badge')].map((b) => b.textContent)).toEqual(['Loud']);
    // Truncated to the field's limit, full text on hover.
    const maker = row.querySelector('[data-field="maker"] span[title]');
    expect(maker?.getAttribute('title')).toBe('Stradivari');
    expect(maker?.textContent).toBe('Stradi...');
  });

  it('shows a true boolean badge by its label, a placeholder when there is no image', () => {
    const row = renderListItem({ item: items[2], config: config('list') });
    expect(row.querySelector('[data-field="electric"]')?.textContent).toBe('Electric');
    expect(row.querySelector('.zodal-list-thumbnail.zodal-placeholder')).not.toBeNull();
  });

  it('runs item operations and selection without opening the item', () => {
    const onOperation = vi.fn();
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const row = renderListItem({ item: items[0], config: config('list'), onOperation, onSelect, onOpen, selected: true });
    const buttons = [...row.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('data-operation'))).toEqual(['edit', 'delete']);
    expect(buttons[1].getAttribute('data-confirm')).toBe('true');
    buttons[0].click();
    expect(onOperation).toHaveBeenCalledWith(expect.objectContaining({ name: 'edit' }), items[0]);
    const box = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(onSelect).toHaveBeenCalledWith('i1', false, items[0]);
    expect(onOpen).not.toHaveBeenCalled();
    row.click();
    expect(onOpen).toHaveBeenCalledWith(items[0]);
  });

  it('draws no checkbox or buttons without handlers, nor a checkbox when the collection is not selectable', () => {
    expect(renderListItem({ item: items[0], config: config('list') }).querySelector('input, button')).toBeNull();
    const plain = renderListItem({ item: items[0], config: config('list', { selection: false }), onSelect: () => {} });
    expect(plain.querySelector('input')).toBeNull();
  });

  it('lets a custom value renderer draw a field', () => {
    const row = renderListItem({ item: items[0], config: config('list'), renderValue: (v, f) => (f.name === 'maker' ? `by ${v}` : null) });
    expect(row.querySelector('[data-field="maker"]')?.textContent).toBe('Maker: by Stradivari');
  });
});

describe('renderGridCard', () => {
  it('draws a card with the image as its cover', () => {
    const card = renderGridCard({ item: items[0], config: config('grid') });
    expect(card.tagName).toBe('ARTICLE');
    expect(card.firstElementChild?.matches('img.zodal-card-image')).toBe(true);
    expect(card.querySelector('.zodal-view-label')?.textContent).toBe('Violin');
  });
});

describe('renderCollectionView', () => {
  it('draws groups in vocabulary order, with counts, as a list or a grid', () => {
    const list = renderCollectionView({ items, config: config('list') });
    const sections = [...list.querySelectorAll('section.zodal-group')];
    expect(sections.map((s) => s.getAttribute('data-group-id'))).toEqual(['class:strings', 'class:winds']);
    expect(sections[0].querySelector('.zodal-group-count')?.textContent).toBe('2');
    expect(sections[0].querySelectorAll('ul.zodal-list > li')).toHaveLength(2);

    const grid = renderCollectionView({ items, config: config('grid') });
    expect(grid.classList.contains('zodal-view-grid')).toBe(true);
    expect(grid.querySelectorAll('.zodal-grid > article.zodal-card')).toHaveLength(3);
  });

  it('honours collapsed groups and toggles a group in place, reporting it', () => {
    const onToggleGroup = vi.fn();
    const view = renderCollectionView({ items, config: config('list'), collapsedGroups: ['class:winds'], onToggleGroup });
    const [strings, winds] = [...view.querySelectorAll('section.zodal-group')];
    const windsBody = winds.querySelector('ul') as HTMLElement;
    const header = winds.querySelector('button.zodal-group-header') as HTMLButtonElement;
    expect(windsBody.hidden).toBe(true);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.getAttribute('aria-controls')).toBe(windsBody.id);
    expect((strings.querySelector('ul') as HTMLElement).hidden).toBe(false);
    header.click();
    expect(windsBody.hidden).toBe(false);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(onToggleGroup).toHaveBeenCalledWith('class:winds');
  });

  it('opens groups collapsed by default unless expanded, and has no toggle when not collapsible', () => {
    const closed = config('list', { group: { ...group, defaultState: 'collapsed' } });
    const view = renderCollectionView({ items, config: closed, expandedGroups: ['class:strings'] });
    expect([...view.querySelectorAll('section')].map((s) => s.getAttribute('data-collapsed'))).toEqual(['false', 'true']);
    const fixed = renderCollectionView({ items, config: config('list', { group: { ...group, collapsible: false } }), collapsedGroups: ['class:winds'] });
    expect(fixed.querySelector('button.zodal-group-header')).toBeNull();
    expect([...fixed.querySelectorAll('section')].map((s) => s.getAttribute('data-collapsed'))).toEqual(['false', 'false']);
  });

  it('draws an ungrouped view without headers, and an empty one with a message', () => {
    const flat = renderCollectionView({ items, config: config('list', { group: null }) });
    expect(flat.querySelector('section')).toBeNull();
    expect(flat.querySelectorAll('li.zodal-list-item')).toHaveLength(3);
    expect(renderCollectionView({ items: [], config: config('grid'), emptyText: 'Nothing yet' }).textContent).toBe('Nothing yet');
  });

  it('puts collection operations, and selection operations while something is selected, in a toolbar', () => {
    const onCollectionOperation = vi.fn();
    const none = renderCollectionView({ items, config: config('list'), onCollectionOperation });
    expect([...none.querySelectorAll('.zodal-view-toolbar button')].map((b) => b.textContent)).toEqual(['New']);
    const some = renderCollectionView({ items, config: config('list'), onCollectionOperation, selectedIds: ['i3'] });
    const [create, bulk] = [...some.querySelectorAll('.zodal-view-toolbar button')] as HTMLButtonElement[];
    bulk.click();
    expect(onCollectionOperation).toHaveBeenCalledWith(expect.objectContaining({ name: 'bulkDelete' }), [items[2]]);
    create.click();
    expect(onCollectionOperation).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'create' }), []);
    expect(some.querySelector('li[data-id="i3"]')?.getAttribute('aria-selected')).toBe('true');
  });
});

describe('groupItems (local copy of @zodal/ui)', () => {
  it('buckets a multi-valued field, the no-value group last', () => {
    const tags: ViewGroupConfig = { ...group, field: 'tags', multiValued: true, order: undefined };
    expect(groupItems(items, tags).map((g) => [g.id, g.items.length])).toEqual([['tags:loud', 1], [groupId('tags', null), 2]]);
  });
});
