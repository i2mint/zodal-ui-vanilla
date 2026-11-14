/** Load status (zodal#111), shared operation status (zodal#112) and the Reorder mode (zodal#127). */
import { describe, it, expect, afterEach } from 'vitest';
import { renderCollectionView, loadFeedbackOf, createOperationStatus, operationKey } from '../src/index.js';

const config: any = {
  kind: 'list',
  idField: 'id',
  fields: { label: { name: 'name', label: 'Name' }, image: null, badges: [], secondary: [{ name: 'note', label: 'Note' }] },
  group: null,
  operations: { item: [{ name: 'archive', label: 'Archive' }], collection: [], selection: [] },
  selection: false,
};
const items = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => document.body.replaceChildren());

describe('load status', () => {
  it('a first load draws skeleton rows in the layout; a fast one draws nothing special', () => {
    const v = renderCollectionView({ items: [], config, loadStatus: 'first-load', skeletonCount: 4 });
    expect(v.getAttribute('aria-busy')).toBe('true');
    expect(v.querySelectorAll('li.zodal-skeleton-item').length).toBe(4);
    expect(v.textContent).not.toContain('No items');
    const fast = renderCollectionView({ items: [], config, loadStatus: 'first-load', loadElapsedMs: 50 });
    expect(fast.querySelectorAll('.zodal-skeleton-item').length).toBe(0);
    expect(loadFeedbackOf('refreshing', 500)).toBe('stale');
  });
  it('a refresh keeps the items, marked stale and busy', () => {
    const v = renderCollectionView({ items, config, loadStatus: 'refreshing' });
    expect(v.getAttribute('data-load')).toBe('stale');
    expect(v.querySelectorAll('li.zodal-list-item').length).toBe(3);
  });
});

describe('shared operation status', () => {
  it('an operation pending from the palette shows on the button and blocks presses', async () => {
    const source = createOperationStatus();
    source.set(operationKey('archive', 'b'), { status: 'pending', indicator: false });
    let ran = 0;
    const v = renderCollectionView({ items, config, operationStatus: source, onOperation: () => void ran++ });
    document.body.appendChild(v);
    const button = v.querySelector('[data-id="b"] [data-operation="archive"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-busy')).toBe('true');
    button.click();
    expect(ran).toBe(0);
    source.set(operationKey('archive', 'b'), { status: 'success', indicator: false });
    button.click();
    await flush();
    expect(ran).toBe(1);
  });
});

describe('reorder mode', () => {
  it('draws Up/Down with the ends disabled, moves, and moves focus and announces after a re-render', async () => {
    const moves: string[] = [];
    const v = renderCollectionView({ items, config, reorder: { active: true, onMove: (id, d) => void moves.push(`${id}:${d}`) } });
    document.body.appendChild(v);
    const up = (id: string) => v.querySelector(`[data-id="${id}"] [data-move="up"]`) as HTMLButtonElement;
    const down = (id: string) => v.querySelector(`[data-id="${id}"] [data-move="down"]`) as HTMLButtonElement;
    expect(up('a').disabled).toBe(true);
    expect(down('c').disabled).toBe(true);
    expect(up('a').getAttribute('aria-label')).toBe('Move A up');
    down('a').click();
    await flush();
    expect(moves).toEqual(['a:down']);
    // The host reorders and re-renders with `moved`.
    const reordered = [items[1], items[0], items[2]];
    const v2 = renderCollectionView({ items: reordered, config, reorder: { active: true, onMove: () => {}, moved: { id: 'a', direction: 'down' } } });
    document.body.replaceChildren(v2);
    await flush();
    expect(document.activeElement).toBe(v2.querySelector('[data-id="a"] [data-move="down"]'));
    expect(v2.querySelector('[role=status]')?.textContent).toBe('Moved A to position 2 of 3');
    // Outside Reorder mode no buttons are drawn.
    expect(renderCollectionView({ items, config }).querySelector('[data-move]')).toBeNull();
  });
  it('focus moves to the other button at an end, and an only item has both disabled', async () => {
    const v = renderCollectionView({ items, config, reorder: { active: true, onMove: () => {}, moved: { id: 'c', direction: 'down' } } });
    document.body.appendChild(v);
    await flush();
    expect(document.activeElement).toBe(v.querySelector('[data-id="c"] [data-move="up"]'));
    const only = renderCollectionView({ items: [items[0]], config, reorder: { active: true, onMove: () => {} } });
    expect([...only.querySelectorAll('[data-move]')].every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});
