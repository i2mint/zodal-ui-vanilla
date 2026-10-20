import { describe, it, expect } from 'vitest';
import { createVanillaRegistry, optionsFieldAffordance, type OptionsFormField } from '../src/index.js';
import type { FormRenderer } from '../src/renderers/form-renderers.js';

const base = { required: false, disabled: false, hidden: false, order: 0 };
const s3Options: OptionsFormField[] = [
  { ...base, name: 'bucket', path: ['bucket'], label: 'Bucket', type: 'text', zodType: 'string' },
  { ...base, name: 'secretAccessKey', path: ['secretAccessKey'], label: 'Secret access key', type: 'password', zodType: 'string', secret: true },
  { ...base, name: 'client', path: ['client'], label: 'Client', type: 'code', zodType: 'custom', suppliedInCode: true, disabled: true },
  {
    ...base, name: 'retry', path: ['retry'], label: 'Retry', type: 'fieldset', zodType: 'object',
    fields: [{ ...base, name: 'retry.attempts', path: ['retry', 'attempts'], label: 'Attempts', type: 'number', zodType: 'number' }],
  },
];

const registry = createVanillaRegistry();
const top = (f: OptionsFormField) => registry.explain(optionsFieldAffordance(f), { mode: 'form' })[0]?.name;
const render = (f: OptionsFormField, value: unknown, onChange: (v: unknown) => void = () => {}) =>
  (registry.resolve(optionsFieldAffordance(f), { mode: 'form' }) as FormRenderer)({ field: { value, onChange }, config: f });

describe('options-form widget types (#6)', () => {
  it('resolves fieldset, password and code to their renderers', () => {
    expect(s3Options.map(top)).toEqual(['TextInput', 'PasswordInput', 'CodeNote', 'FieldsetInput']);
  });

  it('masks a secret and never prefills it', () => {
    const changes: unknown[] = [];
    const node = render(s3Options[1], 'stored-secret', (v) => changes.push(v));
    const input = node.querySelector('input')!;
    expect(input.type).toBe('password');
    expect(input.value).toBe('');
    expect(node.outerHTML).not.toContain('stored-secret');
    input.value = 'new';
    input.dispatchEvent(new Event('input'));
    expect(changes).toEqual(['new']);
  });

  it('shows a value supplied in code as a note, never an input', () => {
    const node = render(s3Options[2], { some: 'client' });
    expect(node.querySelector('input, textarea, select')).toBeNull();
    expect(node.textContent).toContain('Supplied in code');
  });

  it('draws a fieldset with its children bound to keys of the value', () => {
    const changes: unknown[] = [];
    const node = render(s3Options[3], { attempts: 3, other: true }, (v) => changes.push(v));
    expect(node.tagName).toBe('FIELDSET');
    expect(node.querySelector('legend')!.textContent).toBe('Retry');
    const input = node.querySelector('input')!;
    expect(input.value).toBe('3');
    input.value = '5';
    input.dispatchEvent(new Event('input'));
    expect(changes).toEqual([{ attempts: 5, other: true }]);
  });

  it('keeps both edits when two children change without a re-render', () => {
    const retry: OptionsFormField = {
      ...s3Options[3],
      fields: [
        { ...base, name: 'retry.attempts', path: ['retry', 'attempts'], label: 'Attempts', type: 'number', zodType: 'number' },
        { ...base, name: 'retry.backoff', path: ['retry', 'backoff'], label: 'Backoff', type: 'number', zodType: 'number' },
      ],
    };
    let latest: unknown;
    const inputs = render(retry, {}, (v) => (latest = v)).querySelectorAll('input');
    inputs[0].value = '5';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = '2';
    inputs[1].dispatchEvent(new Event('input'));
    expect(latest).toEqual({ attempts: 5, backoff: 2 });
  });

  it('writes no empty string over a stored secret', () => {
    const changes: unknown[] = [];
    const input = render(s3Options[1], 'stored', (v) => changes.push(v)).querySelector('input')!;
    input.value = 'x';
    input.dispatchEvent(new Event('input'));
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(changes).toEqual(['x', undefined]);
  });

  it('never resolves a secret or a code-supplied field to an editable input', () => {
    expect(top({ ...s3Options[0], type: 'text', secret: true })).toBe('PasswordInput');
    expect(top({ ...s3Options[0], type: 'text', suppliedInCode: true })).toBe('CodeNote');
  });
});
