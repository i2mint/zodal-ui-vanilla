import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyButton, copyField, copyText, createVanillaRegistry } from '../src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const click = async (b: HTMLElement) => {
  b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('copyText', () => {
  it('uses the clipboard API when present', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    expect(await copyText('hi')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('hi');
  });
  it('falls back to execCommand, then to selecting the field', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    (document as any).execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText('hi')).toBe('copied');
    (document as any).execCommand = vi.fn().mockReturnValue(false);
    const input = document.createElement('input');
    input.value = 'hi';
    document.body.appendChild(input);
    expect(await copyText('hi', input)).toBe('selected');
    expect(await copyText('hi')).toBe('failed');
  });
});

describe('copyButton', () => {
  it('answers on itself: copied, announced, then idle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }, vibrate: vi.fn() });
    const outcomes: unknown[] = [];
    const b = copyButton(() => 'v', { name: 'Copy link', onOutcome: (o) => outcomes.push(o) });
    document.body.appendChild(b);
    expect(b.getAttribute('aria-label')).toBe('Copy link');
    await click(b);
    expect(b.getAttribute('data-state')).toBe('copied');
    expect(b.getAttribute('aria-label')).toBe('Copied');
    expect(outcomes).toEqual(['copied']);
    vi.advanceTimersByTime(60);
    expect(document.querySelector('[role=status]')?.textContent).toBe('Copied');
    vi.advanceTimersByTime(3000);
    expect(b.getAttribute('data-state')).toBe('idle');
  });
  it('says nothing to copy for an empty value', async () => {
    const outcomes: unknown[] = [];
    const b = copyButton('', { onOutcome: (o) => outcomes.push(o) });
    document.body.appendChild(b);
    await click(b);
    expect(outcomes).toEqual(['empty']);
  });
});

describe('copyable renderers', () => {
  const reg = createVanillaRegistry();
  it('a copyable cell shows the value and a copy button', () => {
    const Cell = reg.resolve({ zodType: 'string', copyable: true, visible: true } as any, { mode: 'cell' })!;
    const node = (Cell as any)({ value: 'abc', config: { header: 'Token', meta: {} } });
    expect(node.textContent).toContain('abc');
    expect(node.querySelector('button')?.getAttribute('aria-label')).toBe('Copy token');
  });
  it('a read-only copyable form field is a copy field; an editable one is not', () => {
    const ro = reg.resolve({ zodType: 'string', copyable: true, editable: false, visible: true } as any, { mode: 'form' })!;
    const node = (ro as any)({ field: { value: 'https://x', onChange() {} }, config: { name: 'u', label: 'Link' } });
    expect((node.querySelector('input') as HTMLInputElement).value).toBe('https://x');
    expect(node.querySelector('input')!.hasAttribute('readonly')).toBe(true);
    expect(node.querySelector('button')).not.toBeNull();
    const ed = reg.resolve({ zodType: 'string', copyable: true, editable: true, visible: true } as any, { mode: 'form' })!;
    expect(ed).not.toBe(ro);
  });
  it('copyField selects its own value when copying fails', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    (document as any).execCommand = vi.fn().mockReturnValue(false);
    const f = copyField('secret-ish', { name: 'Key' });
    document.body.appendChild(f);
    await click(f.querySelector('button')!);
    expect(f.querySelector('button')!.getAttribute('data-state')).toBe('selected');
  });
});
