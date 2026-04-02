/**
 * Form field renderers.
 * Plain DOM elements with native event listeners.
 */

import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import { el } from '../dom.js';
import type { FormFieldProps } from '../types.js';

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
    onChange: (e: Event) => field.onChange((e.target as HTMLSelectElement).value),
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
  const dateValue = field.value instanceof Date
    ? (field.value as Date).toISOString().split('T')[0]
    : String(field.value ?? '');

  return el('div', { class: 'zodal-field' },
    el('label', { for: config.name, class: 'zodal-label' }, config.label),
    el('input', {
      id: config.name,
      type: 'date',
      value: dateValue,
      class: 'zodal-input',
      required: config.required,
      disabled: config.disabled,
      onInput: (e: Event) => field.onChange(new Date((e.target as HTMLInputElement).value)),
    }),
  );
}

export type FormRenderer = (props: FormFieldProps) => HTMLElement;

export const formRenderers: RendererEntry<FormRenderer>[] = [
  {
    tester: (_, ctx) => ctx.mode === 'form' ? PRIORITY.FALLBACK : -1,
    renderer: textInput,
    name: 'TextInput (fallback)',
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
    tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'enum' ? PRIORITY.DEFAULT : -1,
    renderer: selectInput,
    name: 'SelectInput',
  },
  {
    tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'date' ? PRIORITY.DEFAULT : -1,
    renderer: dateInput,
    name: 'DateInput',
  },
];
