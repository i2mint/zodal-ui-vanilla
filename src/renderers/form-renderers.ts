/**
 * Form field renderers.
 * Plain DOM elements with native event listeners.
 */

import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import { el } from '../dom.js';
import type { FormFieldProps } from '../types.js';

/**
 * `minlength` / `maxlength` from `FormFieldConfig.minLength` / `maxLength` (i2mint/zodal#84),
 * read structurally: the `@zodal/ui` on npm predates them.
 */
function lengthAttrs(config: object): { minlength?: number; maxlength?: number } {
  const c = config as { minLength?: unknown; maxLength?: unknown };
  const out: { minlength?: number; maxlength?: number } = {};
  if (typeof c.minLength === 'number' && Number.isFinite(c.minLength)) out.minlength = c.minLength;
  if (typeof c.maxLength === 'number' && Number.isFinite(c.maxLength)) out.maxlength = c.maxLength;
  return out;
}

/** `YYYY-MM-DD` (UTC) for a Date, epoch ms or ISO string; '' when unset or invalid. */
export function toDateInputValue(v: unknown): string {
  if (v == null || v === '') return '';
  const d = v instanceof Date ? v : new Date(v as number | string);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** A date input's value as a Date at UTC midnight, or `undefined` when cleared. */
export function fromDateInputValue(s: string): Date | undefined {
  return s ? new Date(`${s}T00:00:00.000Z`) : undefined;
}

function textInput({ field, config }: FormFieldProps): HTMLElement {
  return el('div', { class: 'zodal-field' },
    el('label', { for: config.name, class: 'zodal-label' }, config.label),
    el('input', {
      id: config.name,
      type: 'text',
      value: String(field.value ?? ''),
      class: 'zodal-input',
      placeholder: config.placeholder,
      required: config.required,
      disabled: config.disabled,
      ...lengthAttrs(config),
      onInput: (e: Event) => field.onChange((e.target as HTMLInputElement).value),
    }),
    config.helpText ? el('p', { class: 'zodal-help' }, config.helpText) : null,
  );
}

function numberInput({ field, config }: FormFieldProps): HTMLElement {
  return el('div', { class: 'zodal-field' },
    el('label', { for: config.name, class: 'zodal-label' }, config.label),
    el('input', {
      id: config.name,
      type: 'number',
      value: field.value ?? '',
      class: 'zodal-input',
      required: config.required,
      disabled: config.disabled,
      onInput: (e: Event) => field.onChange(Number((e.target as HTMLInputElement).value)),
    }),
  );
}

function checkboxInput({ field, config }: FormFieldProps): HTMLElement {
  return el('div', { class: 'zodal-field' },
    el('label', { class: 'zodal-label' },
      el('input', {
        type: 'checkbox',
        checked: Boolean(field.value),
        class: 'zodal-input',
        disabled: config.disabled,
        onChange: (e: Event) => field.onChange((e.target as HTMLInputElement).checked),
      }),
      ' ',
      config.label,
    ),
  );
}

function selectInput({ field, config }: FormFieldProps): HTMLElement {
  const select = el('select', {
    id: config.name,
    class: 'zodal-input',
    required: config.required,
    disabled: config.disabled,
    onChange: (e: Event) => {
      const value = (e.target as HTMLSelectElement).value;
      // Write the option's `raw` back: a numeric choice must stay a number.
      // `raw` is typed in @zodal/ui > 0.2.0 only (not yet on npm), hence the structural cast.
      const option = ((config.options ?? []) as { value: string; raw?: unknown }[]).find((o) => o.value === value);
      if (option) field.onChange(option.raw ?? option.value);
      // The placeholder: clearing an optional field means no value, not ''.
      else field.onChange(value === '' && !config.required ? undefined : value);
    },
  },
    el('option', { value: '' }, `Select ${config.label}...`),
    ...(config.options ?? []).map(opt =>
      el('option', { value: opt.value }, opt.label)
    ),
  );
  // Set selected value after creation
  (select as HTMLSelectElement).value = String(field.value ?? '');

  return el('div', { class: 'zodal-field' },
    el('label', { for: config.name, class: 'zodal-label' }, config.label),
    select,
  );
}

function dateInput({ field, config }: FormFieldProps): HTMLElement {
  const dateValue = toDateInputValue(field.value);
  // Date bounds arrive in epoch ms (i2mint/zodal#108); dates are read and written in UTC.
  const bounds = (config as { bounds?: { min?: unknown; max?: unknown } }).bounds;

  return el('div', { class: 'zodal-field' },
    el('label', { for: config.name, class: 'zodal-label' }, config.label),
    el('input', {
      id: config.name,
      type: 'date',
      value: dateValue,
      class: 'zodal-input',
      required: config.required,
      disabled: config.disabled,
      min: toDateInputValue(bounds?.min) || undefined,
      max: toDateInputValue(bounds?.max) || undefined,
      onInput: (e: Event) => field.onChange(fromDateInputValue((e.target as HTMLInputElement).value)),
    }),
  );
}

/** A value as text, for a field no form renderer can edit (object, set, bigint, ...). */
function displayValue(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Set || Array.isArray(value)) return [...value].map(displayValue).join(', ');
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? String(v) : v));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Shows the value without offering to edit it: a text input would write a string back. */
function readOnlyInput({ field, config }: FormFieldProps): HTMLElement {
  return el('div', { class: 'zodal-field' },
    el('label', { for: config.name, class: 'zodal-label' }, config.label),
    el('input', {
      id: config.name,
      type: 'text',
      value: displayValue(field.value),
      class: 'zodal-input zodal-input-readonly',
      readonly: true,
    }),
  );
}

export type FormRenderer = (props: FormFieldProps) => HTMLElement;

export const formRenderers: RendererEntry<FormRenderer>[] = [
  {
    tester: (_, ctx) => ctx.mode === 'form' ? PRIORITY.FALLBACK : -1,
    renderer: readOnlyInput,
    name: 'ReadOnlyInput (fallback)',
  },
  {
    tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'string' ? PRIORITY.DEFAULT : -1,
    renderer: textInput,
    name: 'TextInput',
  },
  {
    tester: (field, ctx) => ctx.mode === 'form' && ['number', 'int', 'float'].includes(field.zodType) ? PRIORITY.DEFAULT : -1,
    renderer: numberInput,
    name: 'NumberInput',
  },
  {
    tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'boolean' ? PRIORITY.DEFAULT : -1,
    renderer: checkboxInput,
    name: 'CheckboxInput',
  },
  {
    tester: (field, ctx) => ctx.mode === 'form' && (field.editWidget === 'select' || field.zodType === 'enum') ? PRIORITY.DEFAULT : -1,
    renderer: selectInput,
    name: 'SelectInput',
  },
  {
    tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'date' ? PRIORITY.DEFAULT : -1,
    renderer: dateInput,
    name: 'DateInput',
  },
];
