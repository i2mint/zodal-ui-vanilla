/**
 * Form field renderers.
 * Plain DOM elements with native event listeners.
 */

import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import { el } from '../dom.js';
import type { FormFieldProps } from '../types.js';
import { copyField, installCopyStyles } from '../copy.js';
import { attachFieldHistory, type FieldHistoryHandle } from '../field-history.js';
import { fieldHistoryOf } from '../history-types.js';

/** Words that mark a field name as a secret (a local, cautious stand-in for `@zodal/core`'s `isSecretName`, which npm 0.2.0 lacks). */
const SECRET_WORD = /^(password|passwd|pwd|passphrase|secret|secrets|credential|credentials|otp|pin|cvv|cvc|ssn|token|tokens|apikey|privatekey|accesskey|clientsecret)$/;

/** The words of a field name: `apiKey`, `api_key`, `API-KEY` all read as `api key`. */
function nameWords(name: string): string[] {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Never remember a secret: a field marked `secret`, a password input, or a secret-looking name
 * (any secret word, or one ending in `key`), mirroring `@zodal/ui`'s `remembers()`.
 */
export function isSecretField(config: { name?: string; type?: string; secret?: unknown }): boolean {
  if ((config as { secret?: unknown }).secret || config.type === 'password') return true;
  const words = nameWords(config.name ?? '');
  const joined = words.join('');
  return words.some((w) => SECRET_WORD.test(w)) || SECRET_WORD.test(joined) || words[words.length - 1] === 'key';
}

/** The history control for a text field, when the context has a store and the config asks for history. */
function historyFor(props: FormFieldProps, field: HTMLInputElement | HTMLTextAreaElement): FieldHistoryHandle | null {
  const { config, context } = props;
  const history = fieldHistoryOf(config);
  if (!context?.history || !history || config.disabled || isSecretField(config)) return null;
  return attachFieldHistory({
    history: context.history,
    config: history,
    label: config.label,
    field,
    onChange: (v) => props.field.onChange(v),
  });
}

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

/** A single-line text input; with history, the history button sits at its inline end, outside the box. */
function textInput(props: FormFieldProps): HTMLElement {
  const { field, config } = props;
  const input = el('input', {
    id: config.name,
    type: 'text',
    value: String(field.value ?? ''),
    class: 'zodal-input',
    placeholder: config.placeholder,
    required: config.required,
    disabled: config.disabled,
    ...lengthAttrs(config),
    onInput: (e: Event) => field.onChange((e.target as HTMLInputElement).value),
  }) as HTMLInputElement;
  const history = historyFor(props, input);
  return el('div', { class: 'zodal-field' },
    el('label', { for: config.name, class: 'zodal-label' }, config.label),
    history ? el('div', { class: 'zodal-history-row' }, input, history.element) : input,
    config.helpText ? el('p', { class: 'zodal-help' }, config.helpText) : null,
  );
}

/** Multi-line text (`editWidget: 'textarea'`); with history, the history button sits at its top-right, outside the box. */
function textareaInput(props: FormFieldProps): HTMLElement {
  const { field, config } = props;
  const textarea = el('textarea', {
    id: config.name,
    class: 'zodal-input zodal-textarea',
    placeholder: config.placeholder,
    required: config.required,
    disabled: config.disabled,
    ...lengthAttrs(config),
    onInput: (e: Event) => field.onChange((e.target as HTMLTextAreaElement).value),
  }) as HTMLTextAreaElement;
  textarea.value = String(field.value ?? '');
  const history = historyFor(props, textarea);
  const label = el('label', { for: config.name, class: 'zodal-label' }, config.label);
  return el('div', { class: 'zodal-field' },
    history ? el('div', { class: 'zodal-field-head' }, label, history.element) : label,
    textarea,
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

/** A read-only `copyable` form field: the value in full, selectable, with a copy button (#21). */
function copyableReadOnly({ field, config }: FormFieldProps): HTMLElement {
  installCopyStyles();
  return el('div', { class: 'zodal-field' },
    el('label', { class: 'zodal-label' }, config.label),
    copyField(displayValue(field.value), { name: config.label, copyName: `Copy ${config.label.toLowerCase()}` }),
    config.helpText ? el('p', { class: 'zodal-help' }, config.helpText) : null,
  );
}

export const formRenderers: RendererEntry<FormRenderer>[] = [
  // A copyable value that cannot be edited: shown in full with a copy button.
  {
    tester: (field, ctx) =>
      ctx.mode === 'form' && (field as { copyable?: unknown }).copyable === true && field.editable === false ? PRIORITY.LIBRARY : -1,
    renderer: copyableReadOnly,
    name: 'CopyableField',
  },
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
    // editWidget: 'textarea' on free text, above the plain text input. Only free text: a `notes`
    // array or a `description` enum may also be marked 'textarea', and content keeps its own.
    tester: (field, ctx) =>
      ctx.mode === 'form' && field.editWidget === 'textarea' && field.zodType === 'string'
      && (field as { storageRole?: string }).storageRole !== 'content' ? PRIORITY.LIBRARY : -1,
    renderer: textareaInput,
    name: 'TextareaInput',
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
