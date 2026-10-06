/**
 * Tag widgets for array fields: a chip input for `'tags'` form fields, a chip
 * filter for `contains` filters, and a chip cell with "+N" overflow.
 *
 * Plain DOM; the decisions (what a draft means, which options match, how
 * suggestion requests are paced, what the filter emits) live in `../tag-logic.ts`.
 * Suggestions come from `context.suggest` (a `SuggestionSource` the app injects),
 * so no renderer imports a store.
 *
 * Accessibility follows the ARIA 1.2 combobox pattern with list autocomplete: the
 * input is `role="combobox"` controlling a `role="listbox"` popup, the highlighted
 * option is `aria-activedescendant`, and a polite live region announces every add,
 * remove and refusal. Chips are a list; each has a real remove `<button>`.
 * Typed text is never thrown away: a refused draft, a failed suggestion request
 * and a blur all leave it in the input.
 */

import type { SuggestionSource, VocabularyOption } from '@zodal/ui';
import { el, uniqueId, VISUALLY_HIDDEN } from '../dom.js';
import type { CellProps, FilterFieldProps, FormFieldProps } from '../types.js';
import {
  createSuggestionController,
  fromContainsFilter,
  labelOf,
  matchOptions,
  optionRaw,
  resolveChoice,
  resolveDraft,
  resolveTagSettings,
  splitTags,
  suggestionToOption,
  tagKey,
  toContainsFilter,
  toValueList,
  type DraftResolution,
  type SuggestionState,
  type TagOption,
  type TagSettings,
} from '../tag-logic.js';

// ============================================================================
// The chip combobox (shared by the form input and the type-ahead filter)
// ============================================================================

interface TagComboboxOptions {
  /** Field name, passed to `suggest`. */
  name: string;
  /** Field label, used in accessible names. */
  label: string;
  inputId: string;
  /** Id of the element naming the input, when no `<label for>` does. */
  labelledBy?: string;
  describedBy?: string;
  values: unknown[];
  options?: readonly VocabularyOption[];
  allowCreate: boolean;
  suggest?: SuggestionSource;
  disabled: boolean;
  required?: boolean;
  placeholder?: string;
  settings: TagSettings;
  onChange: (values: unknown[]) => void;
}

function createTagCombobox(o: TagComboboxOptions): HTMLElement {
  const { messages: m, limit, debounceMs } = o.settings;
  const options = o.options?.length ? o.options : undefined;
  // Closed vocabulary: offer `options`. Otherwise ask `suggest`; else offer
  // `options` if any were given; else free text only.
  const source: 'options' | 'suggest' | 'none' =
    !o.allowCreate && options ? 'options' : o.suggest ? 'suggest' : options ? 'options' : 'none';
  // With a closed vocabulary, Enter takes the first match; with an open one, Enter
  // adds what was typed and the arrow keys reach the suggestions.
  const autoHighlight = !o.allowCreate;

  let values = [...o.values];
  let items: TagOption[] = [];
  let status: SuggestionState['status'] = 'idle';
  let active = -1;
  let open = false;
  const labels = new Map<string, string>();
  const labelFor = (v: unknown) => labels.get(tagKey(v)) ?? labelOf(options, v);

  const uid = uniqueId('zodal-tags');
  const listboxId = `${uid}-listbox`;
  const optionId = (i: number) => `${uid}-option-${i}`;

  const live = el('div', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', class: 'zodal-live', style: VISUALLY_HIDDEN });
  const feedback = el('p', { class: 'zodal-tags-feedback', hidden: true });
  const chips = el('ul', { class: 'zodal-chips', 'aria-label': m.selected(o.label) });
  const input = el('input', {
    id: o.inputId,
    type: 'text',
    class: 'zodal-input zodal-tags-input',
    role: 'combobox',
    autocomplete: 'off',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': listboxId,
    'aria-labelledby': o.labelledBy,
    'aria-describedby': o.describedBy,
    'aria-required': o.required ? 'true' : undefined,
    placeholder: o.placeholder,
    disabled: o.disabled,
  }) as HTMLInputElement;
  const statusEl = el('div', { class: 'zodal-listbox-status', hidden: true });
  const listbox = el('ul', { id: listboxId, role: 'listbox', class: 'zodal-listbox', 'aria-label': m.suggestions(o.label) });
  const popup = el('div', { class: 'zodal-popup', hidden: true }, statusEl, listbox);
  const control = el('div', { class: 'zodal-tags' }, chips, input);
  control.addEventListener('click', (e) => {
    if (e.target === control) input.focus();
  });
  const root = el('div', { class: 'zodal-tags-combobox' }, control, popup, feedback, live);

  const controller = source === 'suggest' && o.suggest
    ? createSuggestionController({
        suggest: o.suggest,
        field: o.name,
        debounceMs,
        limit,
        onUpdate: (state) => {
          status = state.status;
          const taken = new Set(values.map(tagKey));
          items = state.items.map((s) => suggestionToOption(s, options)).filter((x) => !taken.has(x.value));
          active = autoHighlight && items.length ? 0 : -1;
          renderPopup();
        },
      })
    : undefined;

  function announce(message: string) {
    live.textContent = message;
  }

  function showFeedback(message: string) {
    feedback.textContent = message;
    feedback.hidden = !message;
  }

  function setOpen(next: boolean) {
    open = next;
    if (!next) {
      active = -1;
      items = [];
      controller?.cancel();
      status = 'idle';
    }
    popup.hidden = !next;
    input.setAttribute('aria-expanded', String(next));
    renderPopup();
  }

  function renderPopup() {
    listbox.replaceChildren(
      ...items.map((opt, i) =>
        el('li', {
          id: optionId(i),
          role: 'option',
          class: 'zodal-option',
          'aria-selected': String(i === active),
          onMousedown: (e: Event) => {
            e.preventDefault(); // keep focus in the input
            pick(i);
          },
        }, opt.label),
      ),
    );
    const draft = input.value.trim();
    const text = status === 'loading' ? m.loading
      : status === 'error' ? m.error
      : items.length === 0 && open ? (o.allowCreate && draft ? m.pressEnterToAdd(draft) : m.noMatches)
      : '';
    statusEl.textContent = text;
    statusEl.hidden = !text;
    listbox.setAttribute('aria-busy', String(status === 'loading'));
    root.toggleAttribute('data-loading', status === 'loading');
    if (open && active >= 0) input.setAttribute('aria-activedescendant', optionId(active));
    else input.removeAttribute('aria-activedescendant');
  }

  function renderChips() {
    chips.replaceChildren(
      ...values.map((v, i) => {
        const label = labelFor(v);
        return el('li', { class: 'zodal-chip' },
          el('span', { class: 'zodal-chip-label' }, label),
          el('button', {
            type: 'button',
            class: 'zodal-chip-remove',
            'aria-label': m.remove(label),
            disabled: o.disabled,
            onClick: () => {
              removeAt(i);
              input.focus();
            },
          }, '×'),
        );
      }),
    );
    chips.hidden = values.length === 0;
  }

  /** Show what matches `query`: local options at once, suggestions paced. */
  function refresh(query: string, { force = false } = {}) {
    if (source === 'none' || (!query.trim() && !force)) {
      setOpen(false);
      return;
    }
    if (!open) setOpen(true);
    if (source === 'options') {
      items = matchOptions(options!, query, values, limit);
      status = 'ready';
      active = autoHighlight && items.length ? 0 : -1;
      renderPopup();
    } else {
      controller!.request(query, { immediate: force });
    }
  }

  function commit(res: DraftResolution): boolean {
    if (!res.ok) {
      if (res.reason !== 'empty') {
        const message = res.reason === 'duplicate' ? m.duplicate(res.label) : m.notAllowed(res.label);
        announce(message);
        showFeedback(message);
      }
      return false;
    }
    values = [...values, res.value];
    labels.set(tagKey(res.value), res.label);
    o.onChange([...values]);
    renderChips();
    announce(m.added(res.label));
    showFeedback('');
    return true;
  }

  /** Every choice a typed draft may resolve to: options plus what is on screen. */
  const choices = (): TagOption[] => [...(options ?? []), ...items];

  /**
   * Commit typed text: each comma-separated part is a tag. Refused parts stay in
   * the input (never lose typed text), so a refusal can be corrected in place.
   */
  function commitText(text: string) {
    const refused = splitTags(text).filter(
      (part) => !commit(resolveDraft(part, { choices: choices(), allowCreate: o.allowCreate, selected: values })),
    );
    input.value = refused.join(', ');
    if (refused.length === 0) setOpen(false);
  }

  function pick(i: number) {
    const opt = items[i];
    if (!opt) return;
    if (commit(resolveChoice(opt, values))) {
      input.value = '';
      setOpen(false);
    }
  }

  function removeAt(i: number) {
    const removed = values[i];
    values = values.filter((_, j) => j !== i);
    o.onChange([...values]);
    renderChips();
    announce(m.removed(labelFor(removed)));
  }

  function move(delta: 1 | -1) {
    if (!items.length) return;
    active = active < 0
      ? (delta === 1 ? 0 : items.length - 1)
      : (active + delta + items.length) % items.length;
    renderPopup();
  }

  input.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'Enter':
      case ',': {
        if (open && active >= 0) {
          e.preventDefault();
          pick(active);
        } else if (input.value.trim()) {
          e.preventDefault();
          commitText(input.value);
        } else if (e.key === ',') {
          e.preventDefault(); // a lone comma is a separator, never part of a tag
        }
        // Enter on an empty input falls through: the form may submit.
        break;
      }
      case 'Backspace':
        if (input.value === '' && values.length) {
          e.preventDefault();
          removeAt(values.length - 1);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open || status === 'idle' || status === 'error') refresh(input.value, { force: true });
        else move(1);
        break;
      case 'ArrowUp':
        if (open) {
          e.preventDefault();
          move(-1);
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
    }
  });

  input.addEventListener('input', () => {
    showFeedback('');
    refresh(input.value);
  });

  // Pasting "a, b, c" adds each part at once.
  input.addEventListener('paste', (e) => {
    const text = (e as ClipboardEvent).clipboardData?.getData('text') ?? '';
    if (!/[,\n]/.test(text)) return;
    e.preventDefault();
    commitText(`${input.value}${text}`);
    if (input.value) refresh(input.value);
  });

  input.addEventListener('blur', () => {
    if (open) setOpen(false); // the draft stays in the input
  });

  renderChips();
  renderPopup();
  return root;
}

// ============================================================================
// Form: tag input
// ============================================================================

/**
 * A chip input for `type: 'tags'` form fields. Writes an array back through
 * `field.onChange`, with each option's `raw` (numbers stay numbers).
 */
export function createTagInput(settings: Partial<TagSettings> = {}) {
  const s = resolveTagSettings(settings);
  return function tagInput({ field, config, context }: FormFieldProps): HTMLElement {
    const helpId = config.helpText ? `${config.name}-help` : undefined;
    return el('div', { class: 'zodal-field zodal-field-tags' },
      el('label', { for: config.name, class: 'zodal-label' }, config.label),
      createTagCombobox({
        name: config.name,
        label: config.label,
        inputId: config.name,
        describedBy: helpId,
        values: toValueList(field.value),
        options: config.options,
        allowCreate: config.allowCreate !== false,
        suggest: context?.suggest,
        disabled: config.disabled,
        required: config.required,
        placeholder: config.placeholder,
        settings: s,
        onChange: (values) => field.onChange(values),
      }),
      config.helpText ? el('p', { id: helpId, class: 'zodal-help' }, config.helpText) : null,
    );
  };
}

export const tagInput = createTagInput();

// ============================================================================
// Filter: chip filter
// ============================================================================

/**
 * A chip filter for `contains` on an array field. Emits an `arrayContainsAny`
 * `FilterCondition` (or `undefined` when nothing is selected) through
 * `field.onChange`; see `toContainsFilter`. Up to `maxToggleOptions` options
 * show as toggle chips (`<button aria-pressed>`); more options, or none (free
 * text and `suggest`), give a type-ahead chip input.
 */
export function createChipFilter(settings: Partial<TagSettings> = {}) {
  const s = resolveTagSettings(settings);
  return function chipFilter({ field, config, context }: FilterFieldProps): HTMLElement {
    let values = fromContainsFilter(field.value);
    const emit = () => field.onChange(toContainsFilter(config.name, values));
    const options = config.options ?? [];
    const captionId = uniqueId('zodal-chip-filter');
    // Say the connective in words, at the point of use (faceted-filter-ux).
    const caption = el('span', { id: captionId, class: 'zodal-filter-caption' }, `${config.label} ${s.messages.anyOf}`);
    const group = (...children: HTMLElement[]) =>
      el('div', { role: 'group', 'aria-labelledby': captionId, class: 'zodal-filter zodal-filter-chips' }, caption, ...children);

    if (options.length > 0 && options.length <= s.maxToggleOptions) {
      const isOn = (raw: unknown) => values.some((v) => tagKey(v) === tagKey(raw));
      return group(...options.map((opt) => {
        const raw = optionRaw(opt);
        const button = el('button', {
          type: 'button',
          class: 'zodal-chip zodal-chip-toggle',
          'aria-pressed': String(isOn(raw)),
        }, opt.label);
        button.addEventListener('click', () => {
          values = isOn(raw) ? values.filter((v) => tagKey(v) !== tagKey(raw)) : [...values, raw];
          button.setAttribute('aria-pressed', String(isOn(raw)));
          emit();
        });
        return button;
      }));
    }

    return group(createTagCombobox({
      name: config.name,
      label: config.label,
      inputId: uniqueId('zodal-chip-filter-input'),
      labelledBy: captionId,
      values,
      options,
      // A closed vocabulary filters on its values only; otherwise any typed tag.
      allowCreate: options.length === 0,
      suggest: context?.suggest,
      disabled: false,
      placeholder: `Filter ${config.label}...`,
      settings: s,
      onChange: (next) => {
        values = next;
        emit();
      },
    }));
  };
}

export const chipFilter = createChipFilter();

// ============================================================================
// Cell: chips with overflow
// ============================================================================

/**
 * A chip cell for array values: the first `maxVisibleChips` values as chips, the
 * rest as one "+N" chip whose title and accessible name list them. Visually
 * hidden ", " separators keep copied text and screen-reader output readable.
 */
export function createChipCell(settings: Partial<TagSettings> = {}) {
  const s = resolveTagSettings(settings);
  return function chipCell({ value }: CellProps): HTMLElement {
    const list = Array.isArray(value) || value instanceof Set ? toValueList(value) : null;
    if (!list || list.length === 0) return el('span', { class: 'zodal-cell zodal-muted' }, '—');
    const shown = list.slice(0, s.maxVisibleChips);
    const hidden = list.slice(s.maxVisibleChips);
    const separator = () => el('span', { style: VISUALLY_HIDDEN }, ', ');
    const chips = shown.map((v, i) =>
      el('span', { role: 'listitem', class: 'zodal-chip' },
        tagKey(v),
        i < shown.length - 1 || hidden.length ? separator() : null,
      ),
    );
    if (hidden.length) {
      const rest = hidden.map(tagKey).join(', ');
      chips.push(el('span', {
        role: 'listitem',
        class: 'zodal-chip zodal-chip-overflow',
        title: rest,
        'aria-label': s.messages.more(hidden.length, rest),
      }, `+${hidden.length}`));
    }
    return el('span', { role: 'list', class: 'zodal-cell zodal-cell-array zodal-chips' }, ...chips);
  };
}

export const chipCell = createChipCell();
