/**
 * The feedback contract (i2mint/zodal docs/adr/0001-feedback-principle.md): every pressable this
 * package draws acknowledges a press on itself, synchronously, and stays pending, ignoring repeat
 * presses, while the work it started is in flight.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderCollectionView, renderGridCard, wirePress, FEEDBACK_CSS, FEEDBACK_MS } from '../src/index.js';
import type { ViewConfig } from '../src/index.js';

const config: ViewConfig = {
  kind: 'grid',
  idField: 'id',
  fields: { label: { name: 'name', label: 'Name', zodType: 'string' }, badges: [], secondary: [] },
  selection: 'multi',
  operations: { item: [{ name: 'launch', label: 'Launch' }], selection: [], collection: [{ name: 'create', label: 'New' }] },
} as unknown as ViewConfig;
const item = { id: 'a', name: 'Synth' };

const pointer = (type: string) =>
  typeof PointerEvent === 'function' ? new PointerEvent(type, { bubbles: true, button: 0 }) : new MouseEvent(type, { bubbles: true, button: 0 });
const never = () => new Promise<never>(() => {});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('the feedback contract, for every pressable', () => {
  const cases: Array<[string, (onPress: () => unknown) => HTMLElement]> = [
    ['an operation button', (onPress) => renderGridCard({ item, config, onOperation: onPress }).querySelector('[data-operation="launch"]')!],
    ['an item with onOpen', (onPress) => renderGridCard({ item, config, onOpen: onPress })],
    ['a collection operation', (onPress) => renderCollectionView({ items: [item], config, onCollectionOperation: onPress }).querySelector('[data-operation="create"]')!],
  ];

  for (const [name, make] of cases) {
    describe(name, () => {
      it('is pressed on pointerdown, before any work, and released on pointerup / pointercancel', () => {
        const target = make(() => {});
        target.dispatchEvent(pointer('pointerdown'));
        expect(target.hasAttribute('data-pressed')).toBe(true);
        target.dispatchEvent(pointer('pointerup'));
        expect(target.hasAttribute('data-pressed')).toBe(false);
        target.dispatchEvent(pointer('pointerdown'));
        target.dispatchEvent(pointer('pointercancel')); // a scroll took the pointer
        expect(target.hasAttribute('data-pressed')).toBe(false);
      });

      it('is pending synchronously with the click, and ignores repeat presses while in flight', async () => {
        const work = deferred();
        const onPress = vi.fn(() => work.promise);
        const target = make(onPress);
        document.body.appendChild(target);
        target.click();
        expect(target.hasAttribute('data-pending')).toBe(true);
        expect(target.getAttribute('aria-busy')).toBe('true');
        expect(target.getAttribute('aria-disabled')).toBe('true');
        target.click();
        target.click();
        expect(onPress).toHaveBeenCalledTimes(1);
        work.resolve();
        await flush();
        expect(target.hasAttribute('data-pending')).toBe(false);
        expect(target.hasAttribute('aria-busy')).toBe(false);
        expect(target.getAttribute('data-status')).toBe('success');
        target.click();
        expect(onPress).toHaveBeenCalledTimes(2);
      });

      it('a synchronous callback leaves nothing pending', () => {
        const target = make(() => undefined);
        target.click();
        expect(target.hasAttribute('data-pending')).toBe(false);
      });
    });
  }

  it('shows the indicator only once the wait passes the delay (no spinner flash)', () => {
    vi.useFakeTimers();
    const button = document.createElement('button');
    wirePress(button, never);
    button.click();
    vi.advanceTimersByTime(FEEDBACK_MS.indicator - 1);
    expect(button.hasAttribute('data-indicator')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(button.hasAttribute('data-indicator')).toBe(true);
  });

  it('a failed command result reads as an error', async () => {
    const button = document.createElement('button');
    const onSettled = vi.fn();
    wirePress(button, async () => ({ ok: false, error: { code: 'x', message: 'Nope' } }), { onSettled });
    button.click();
    await flush();
    expect(button.getAttribute('data-status')).toBe('error');
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', error: { code: 'x', message: 'Nope' } }));
  });

  it('a press on a control inside an item does not press or open the item', () => {
    const onOpen = vi.fn();
    const card = renderGridCard({ item, config, onOpen, onSelect: () => {} });
    const checkbox = card.querySelector('input[type="checkbox"]')!;
    checkbox.dispatchEvent(pointer('pointerdown'));
    expect(card.hasAttribute('data-pressed')).toBe(false);
    (checkbox as HTMLElement).click();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('an item opens on Enter, with the same guard', () => {
    const onOpen = vi.fn(never);
    const card = renderGridCard({ item, config, onOpen });
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(card.hasAttribute('data-pending')).toBe(true);
  });

  it('a back/forward-cache restore clears a pending state left by a press that navigated away', () => {
    const card = renderGridCard({ item, config, onOpen: never });
    document.body.appendChild(card);
    card.click();
    expect(card.hasAttribute('data-pending')).toBe(true);
    const restore = new Event('pageshow');
    Object.defineProperty(restore, 'persisted', { value: true });
    window.dispatchEvent(restore);
    expect(card.hasAttribute('data-pending')).toBe(false);
    expect(card.hasAttribute('aria-busy')).toBe(false);
  });

  it('a view rebuilt while an operation runs keeps it pending and guarded (the host re-renders on every change)', async () => {
    let finish!: () => void;
    const onOperation = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const draw = () => renderCollectionView({ items: [item], config, onOperation });
    const first = draw();
    (first.querySelector('[data-operation="launch"]') as HTMLElement).click();
    const rebuilt = draw(); // e.g. an optimistic update changed the store mid-flight
    const button = rebuilt.querySelector('[data-operation="launch"]') as HTMLElement;
    expect(button.hasAttribute('data-pending')).toBe(true);
    button.click();
    expect(onOperation).toHaveBeenCalledTimes(1);
    finish();
    await flush();
    expect(button.hasAttribute('data-pending')).toBe(false);
    const fresh = draw().querySelector('[data-operation="launch"]') as HTMLElement;
    expect(fresh.hasAttribute('data-pending')).toBe(false);
    fresh.click();
    expect(onOperation).toHaveBeenCalledTimes(2);
  });

  it('a host that rebuilds synchronously inside its callback keeps the new button pending and guarded', () => {
    let current: HTMLElement;
    const scope = {}; // its own pane, so no earlier test's pending press is shared
    const draw = () => (current = renderCollectionView({ items: [item], config, onOperation, shareScope: scope }));
    const onOperation = vi.fn(() => {
      draw(); // e.g. state = setLoading(state, true); render(); then await the provider
      return never();
    });
    draw();
    (current!.querySelector('[data-operation="launch"]') as HTMLElement).click();
    const rebuilt = current!.querySelector('[data-operation="launch"]') as HTMLElement;
    expect(rebuilt.hasAttribute('data-pending')).toBe(true);
    rebuilt.click();
    expect(onOperation).toHaveBeenCalledTimes(1);
  });

  it('two panes drawing the same config keep their own pending state with shareScope', () => {
    const onOperation = vi.fn(never);
    const left = renderCollectionView({ items: [item], config, onOperation, shareScope: {} });
    const right = renderCollectionView({ items: [item], config, onOperation, shareScope: {} });
    (left.querySelector('[data-operation="launch"]') as HTMLElement).click();
    expect(right.querySelector('[data-operation="launch"]')!.hasAttribute('data-pending')).toBe(false);
    (right.querySelector('[data-operation="launch"]') as HTMLElement).click();
    expect(onOperation).toHaveBeenCalledTimes(2);
  });

  it('the indicator is its own child element (never the host::after), removed when it settles', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const button = document.createElement('button');
    wirePress(button, () => new Promise<void>((r) => (finish = r)));
    button.click();
    vi.advanceTimersByTime(FEEDBACK_MS.indicator);
    expect(button.querySelectorAll(':scope > .zodal-press-indicator')).toHaveLength(1);
    expect(FEEDBACK_CSS).not.toContain('::after');
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(button.querySelector('.zodal-press-indicator')).toBeNull();
  });

  it('the last outcome is cleared when a new press starts', async () => {
    const button = document.createElement('button');
    wirePress(button, () => undefined);
    button.click();
    expect(button.getAttribute('data-status')).toBe('success');
    button.dispatchEvent(pointer('pointerdown'));
    expect(button.hasAttribute('data-status')).toBe(false);
  });

  it('dispose removes the wiring', () => {
    const onPress = vi.fn();
    const button = document.createElement('button');
    const dispose = wirePress(button, onPress);
    dispose();
    button.click();
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('feedback styles', () => {
  it('are installed once, at zero specificity, with a reduced-motion variant', () => {
    document.head.querySelectorAll('style[data-zodal-feedback]').forEach((s) => s.remove());
    renderGridCard({ item, config, onOpen: () => {} });
    renderGridCard({ item, config, onOpen: () => {} });
    expect(document.head.querySelectorAll('style[data-zodal-feedback]')).toHaveLength(1);
    expect(FEEDBACK_CSS).toContain(':where([data-zodal-press][data-pressed])');
    expect(FEEDBACK_CSS).toContain('prefers-reduced-motion');
    expect(FEEDBACK_CSS).toContain('touch-action: manipulation');
  });
  it('are not installed when the page brings its own', () => {
    document.head.querySelectorAll('style[data-zodal-feedback]').forEach((s) => s.remove());
    const own = document.createElement('style');
    own.setAttribute('data-zodal-feedback', '');
    document.head.appendChild(own);
    renderGridCard({ item, config, onOpen: () => {} });
    expect(document.head.querySelectorAll('style[data-zodal-feedback]')).toHaveLength(1);
    expect(own.textContent).toBe('');
  });
});

describe('src/action-feedback.ts is a faithful copy of @zodal/ui feedback.ts', () => {
  const core = resolve(process.cwd(), '../zodal/packages/ui/src/feedback.ts'); // tests run from the package root
  const body = (text: string) =>
    text
      .slice(text.indexOf('*/\n') + 3)
      .replace(/import type \{ OperationCommandResult \} from '@zodal\/core';\n/, '')
      .replace('(value as Partial<OperationCommandResult<unknown>>).ok === false', '(value as { ok?: unknown }).ok === false')
      .trim();
  it.skipIf(!existsSync(core))('matches the sibling checkout (skipped where zodal is not beside this repo)', () => {
    const mirror = readFileSync(resolve(process.cwd(), 'src/action-feedback.ts'), 'utf8');
    expect(body(mirror)).toBe(body(readFileSync(core, 'utf8')));
  });
});
