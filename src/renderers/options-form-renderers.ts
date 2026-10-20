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

/** Props of an options-form renderer; a fieldset passes `registry` and `renderField` to its children. */
export interface OptionsFieldProps extends FormFieldProps {
  config: OptionsFormField;
  /** The registry a fieldset resolves its children with; default: `createVanillaRegistry()`. */
  registry?: RendererRegistry<unknown>;
  /** Draws one child field; default: the renderer `registry` resolves. */
  renderField?: (props: OptionsFieldProps) => HTMLElement;
}

/** A copy of an object value; anything else (an array, a primitive) is no object to edit. */
const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};

/** For each value a fieldset emitted, the outside value its edits started from (by identity: a
 *  host that copies the value it is handed back loses the link, and a copy counts as outside). */
const EMITTED_FROM = new WeakMap<object, Record<string, unknown>>();

/** A nested object: its fields inside a `<fieldset>`, each bound to its key of the value. */
function fieldsetInput({ field, config, registry, renderField }: OptionsFieldProps): HTMLElement {
  // The value as it came from outside (what an emptied secret child falls back to): when the host
  // re-renders with a value this fieldset emitted (the echo of an edit), the outside value is the
  // one that edit started from, not the echo. And the latest value, so edits to two children
  // without a re-render in between both survive.
  const echoed = field.value && typeof field.value === 'object' ? EMITTED_FROM.get(field.value) : undefined;
  const stored = echoed ?? asObject(field.value);
  let current = asObject(field.value);
  const draw = renderField ?? defaultRenderField;
  const children = (config.fields ?? []).filter((f) => !f.hidden).map((child) => {
    const key = child.path?.[child.path.length - 1] ?? child.name.split('.').pop()!;
    const secret = optionsFieldAffordance(child).editWidget === 'password';
    return draw({
      // A disabled fieldset disables every child, native control or not.
      config: config.disabled && !child.disabled ? { ...child, disabled: true } : child,
      registry,
      renderField,
      field: {
        value: current[key],
        onChange: (v: unknown) => {
          // A secret emptied again means "no new value": keep the stored one, never drop it.
          current = { ...current, [key]: secret && v === undefined ? stored[key] : v };
          EMITTED_FROM.set(current, stored);
          field.onChange(current);
        },
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
      // Emptied again: no new value (undefined), never '' over the stored secret.
      onInput: (e: Event) => field.onChange((e.target as HTMLInputElement).value || undefined),
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

/** Draw a child with the renderer its registry resolves (the given one, else this package's). */
function defaultRenderField(props: OptionsFieldProps): HTMLElement {
  const renderer = (props.registry ?? defaultRegistry()).resolve(optionsFieldAffordance(props.config), { mode: 'form' }) as FormRenderer;
  return renderer(props);
}

let factory: (() => RendererRegistry<unknown>) | undefined;
let cached: RendererRegistry<unknown> | undefined;
function defaultRegistry(): RendererRegistry<unknown> {
  if (!factory) {
    throw new Error(
      'FieldsetInput has no registry to draw its fields with: pass `registry` (or `renderField`), '
      + "or import createVanillaRegistry from '@zodal/ui-vanilla'.",
    );
  }
  return (cached ??= factory());
}
/** Wired by `registry.ts` (built lazily: the registry imports this module). */
export function setDefaultRegistryFactory(make: () => RendererRegistry<unknown>): void {
  factory = make;
}
