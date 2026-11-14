/** minlength/maxlength (#17), option labels in cells (#18), dates in date inputs and range filters (#19). */
import { describe, it, expect } from 'vitest';
import { cellRenderers } from '../src/renderers/cell-renderers.js';
import { formRenderers } from '../src/renderers/form-renderers.js';
import { filterRenderers } from '../src/renderers/filter-renderers.js';

const get = (list: { renderer: any; name: string }[], name: string) => list.find((r) => r.name === name)!.renderer;
const type = (input: HTMLInputElement, v: string) => {
  input.value = v;
  input.dispatchEvent(new Event('input'));
};

describe('#17 text lengths', () => {
  it('sets minlength and maxlength when the config has them', () => {
    const TextInput = get(formRenderers, 'TextInput');
    const node = TextInput({ field: { value: '', onChange() {} }, config: { name: 'n', label: 'N', minLength: 2, maxLength: 9 } });
    const input = node.querySelector('input')!;
    expect(input.getAttribute('minlength')).toBe('2');
    expect(input.getAttribute('maxlength')).toBe('9');
    const plain = TextInput({ field: { value: '', onChange() {} }, config: { name: 'n', label: 'N' } });
    expect(plain.querySelector('input')!.hasAttribute('maxlength')).toBe(false);
  });
});

describe('#18 option labels in cells', () => {
  const meta = { options: [{ value: '60', label: 'Every hour', hint: 'on the hour' }, { value: 'a', label: 'Alpha' }] };
  it('draws labels (with the hint as title), per element for arrays', () => {
    expect(get(cellRenderers, 'NumberCell')({ value: 60, config: { meta } }).textContent).toBe('Every hour');
    const badge = get(cellRenderers, 'BadgeCell')({ value: '60', config: { meta } });
    expect(badge.textContent).toBe('Every hour');
    expect(badge.getAttribute('title')).toBe('on the hour');
    expect(get(cellRenderers, 'ArrayCell')({ value: ['a', 'b'], config: { meta } }).textContent).toBe('Alpha, b');
    expect(get(cellRenderers, 'TextCell')({ value: 'zz', config: { meta } }).textContent).toBe('zz');
  });
});

describe('#19 dates', () => {
  it('a date input sets min/max from epoch-ms bounds and writes Dates (or undefined when cleared)', () => {
    const written: unknown[] = [];
    const DateInput = get(formRenderers, 'DateInput');
    const node = DateInput({
      field: { value: new Date('2026-03-04T00:00:00Z'), onChange: (v: unknown) => written.push(v) },
      config: { name: 'd', label: 'D', bounds: { min: Date.UTC(2026, 0, 1), max: Date.UTC(2026, 11, 31) } },
    });
    const input = node.querySelector('input')! as HTMLInputElement;
    expect(input.value).toBe('2026-03-04');
    expect(input.getAttribute('min')).toBe('2026-01-01');
    expect(input.getAttribute('max')).toBe('2026-12-31');
    type(input, '2026-05-06');
    type(input, '');
    expect((written[0] as Date).toISOString()).toBe('2026-05-06T00:00:00.000Z');
    expect(written[1]).toBeUndefined();
  });
  it('a date range filter shows dates and writes Dates', () => {
    const written: unknown[] = [];
    const RangeFilter = get(filterRenderers, 'RangeFilter');
    const node = RangeFilter({
      field: { value: [new Date('2026-01-05T00:00:00Z'), undefined], onChange: (v: unknown) => written.push(v) },
      config: { name: 'd', label: 'Day', zodType: 'date' },
    });
    const inputs = node.querySelectorAll('input[type=date]');
    expect(inputs.length).toBe(2);
    expect((inputs[0] as HTMLInputElement).value).toBe('2026-01-05');
    type(inputs[1] as HTMLInputElement, '2026-02-01');
    const [lo, hi] = written.at(-1) as [Date, Date];
    expect(lo.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    expect(hi.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});
