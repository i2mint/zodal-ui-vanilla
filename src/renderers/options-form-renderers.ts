/**
 * Form renderers for the widget types `@zodal/ui`'s `toOptionsFormConfig` adds:
 * `'fieldset'` (a nested object), `'password'` (a secret) and `'code'` (a value supplied in
 * code, never an input). They key on `editWidget`; resolve an options-form field with
 * `optionsFieldAffordance(field)`.
 */

import { PRIORITY } from '@zodal/ui';
import type { RendererEntry, RendererRegistry } from '@zodal/ui';
import { el } from '../dom.js';
import type { FormFieldProps } from '../types.js';
import { optionsFieldAffordance, type OptionsFormField } from '../options-form-types.js';
import type { FormRenderer } from './form-renderers.js';

/** Props of an options-form renderer: `renderField` draws a fieldset's children. */
export interface OptionsFieldProps extends FormFieldProps {
  config: OptionsFormField;
  /** Draws one child field; default: this package's registry. */
  renderField?: (props: OptionsFieldProps) => HTMLElement;
}

/** A nested object: its fields inside a `<fieldset>`, each bound to its key of the value. */
function fieldsetInput({ field, config, renderField }: OptionsFieldProps): HTMLElement {
  const value = (field.value && typeof field.value === 'object' ? field.value : {}) as Record<string, unknown>;
  const draw = renderField ?? defaultRenderField;
  const children = (config.fields ?? []).filter((f) => !f.hidden).map((child) => {
    const key = child.path?.[child.path.length - 1] ?? child.name;
    return draw({
      config: child,
      renderField,
      field: {
        value: value[key],
        onChange: (v: unknown) => field.onChange({ ...((field.value as object) ?? {}), [key]: v }),
      },
    });
  });
  return el('fieldset', { class: 'zodal-fieldset', disabled: config.disabled },
    el('legend', { class: 'zodal-label' }, config.label),
    config.helpText ? el('p', { class: 'zodal-help' }, config.helpText) : null,
    ...children,
  );
}

/** A secret: masked, and never prefilled, so a stored value is never put in the page. */
function passwordInput({ field, config }: OptionsFieldProps): HTMLElement {
  return el('div', { class: 'zodal-field' },
    el('label', { for: config.name, class: 'zodal-label' }, config.label),
    el('input', {
      id: config.name,
      type: 'password',
      value: '',
      autocomplete: 'off',
      class: 'zodal-input',
      placeholder: field.value != null && field.value !== '' ? '(unchanged)' : config.placeholder,
      required: config.required && (field.value == null || field.value === ''),
      disabled: config.disabled,
      onInput: (e: Event) => field.onChange((e.target as HTMLInputElement).value),
    }),
    config.helpText ? el('p', { class: 'zodal-help' }, config.helpText) : null,
  );
}

/** A value only code can supply (a function, a client, a structured secret): a note, never an input. */
function codeNote({ config }: OptionsFieldProps): HTMLElement {
  return el('div', { class: 'zodal-field' },
    el('span', { class: 'zodal-label' }, config.label),
    el('p', { class: 'zodal-help zodal-code-note' }, 'Supplied in code'),
    config.helpText ? el('p', { class: 'zodal-help' }, config.helpText) : null,
  );
}

const widget = (type: string) => (field: { editWidget?: string }, ctx: { mode: string }) =>
  ctx.mode === 'form' && field.editWidget === type ? PRIORITY.LIBRARY : -1;

export const optionsFormRenderers: RendererEntry<FormRenderer>[] = [
  { tester: widget('fieldset'), renderer: fieldsetInput as FormRenderer, name: 'FieldsetInput' },
  { tester: widget('password'), renderer: passwordInput as FormRenderer, name: 'PasswordInput' },
  { tester: widget('code'), renderer: codeNote as FormRenderer, name: 'CodeNote' },
];

/** Draw a child through this package's registry (imported lazily: the registry imports this module). */
function defaultRenderField(props: OptionsFieldProps): HTMLElement {
  const renderer = registry().resolve(optionsFieldAffordance(props.config), { mode: 'form' }) as FormRenderer;
  return renderer(props);
}

let factory: (() => RendererRegistry<unknown>) | undefined;
let cached: RendererRegistry<unknown> | undefined;
function registry(): RendererRegistry<unknown> {
  return (cached ??= factory!());
}
/** Wired by `registry.ts`, so this module needs no import cycle. */
export function setDefaultRegistryFactory(make: () => RendererRegistry<unknown>): void {
  factory = make;
}
