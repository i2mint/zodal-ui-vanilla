# @zodal/ui-vanilla

zodal UI renderer for vanilla HTML/JS -- no React, no framework dependencies.

Produces plain `HTMLElement` instances from zodal's headless configuration objects.

## Install

```bash
npm install @zodal/ui-vanilla @zodal/core @zodal/ui
```

## Quick Start

```typescript
import { defineCollection } from '@zodal/core';
import { toColumnDefs } from '@zodal/ui';
import { createVanillaRegistry } from '@zodal/ui-vanilla';
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number(),
  active: z.boolean(),
});

const collection = defineCollection(schema);
const columns = toColumnDefs(collection);
const registry = createVanillaRegistry();

// Render a cell
for (const col of columns) {
  const field = collection.fieldAffordances[col.id];
  if (field) {
    const renderCell = registry.resolve(field, { mode: 'cell' });
    const element = renderCell({ value: 'Alice', config: col, row: {} });
    document.body.appendChild(element);
  }
}
```

## Supported Renderers

### Cell Renderers (table display)

| Renderer | Zod Type | Description |
|----------|----------|-------------|
| TextCell | string (+ fallback) | Plain text, optional truncation |
| NumberCell | number, int, float | Formatted numbers |
| CurrencyCell | number + currency meta | USD currency formatting |
| BooleanCell | boolean | Checkmark / cross |
| DateCell | date | Localized date string |
| BadgeCell | enum | Badge with data-variant |
| ArrayCell | array | Comma-separated values |

### Form Renderers (data entry)

| Renderer | Zod Type | Description |
|----------|----------|-------------|
| TextInput | string | Text input with label; a history button when the field has history |
| TextareaInput | string + `editWidget: 'textarea'` | Multi-line text (`description`, `notes`... or declared); a history button when the field has history |

**Changed in this version:** every free-text string field whose `editWidget` is `'textarea'` (which `@zodal/core` infers for names such as `description`, `notes`, `body`, or that you declare) now renders as a `<textarea>` (`TextareaInput`), with or without history. It used to render as a single-line `TextInput`. This matches zodal-ui-shadcn. To keep the old behaviour for a field, give it another `editWidget`, or register your own renderer above `PRIORITY.LIBRARY`.
| NumberInput | number, int, float | Number input |
| CheckboxInput | boolean | Checkbox with label |
| SelectInput | enum | Dropdown with options |
| DateInput | date | Date picker |
| ReadOnlyInput | fallback (object, set, bigint, ...) | The value as text, read-only |

### Filter Renderers (filtering)

| Renderer | Filter Type | Description |
|----------|-------------|-------------|
| TextFilter | search (+ fallback for scalar types; object, set and array fields get no filter) | Text search input |
| SelectFilter | select, multiSelect | Dropdown with "All" option |
| RangeFilter | range | Min/Max number inputs |
| BooleanFilter | boolean | All/Yes/No dropdown |

## Collection views: a list or a grid, grouped and collapsible

`renderCollectionView` draws the whole collection from a `ViewConfig` (`toViewConfig(collection, 'list' | 'grid')` in `@zodal/ui`): list rows or grid cards showing each item's image, label, badges and secondary text, bucketed into groups whose headers collapse and expand when the collection declares `groupBy.collapsible`.

```typescript
import { toViewConfig } from '@zodal/ui';
import { renderCollectionView } from '@zodal/ui-vanilla';

const view = toViewConfig(instruments, 'grid');
const draw = () => {
  const { collapsedGroups, expandedGroups } = viewState.get();
  container.replaceChildren(renderCollectionView({
    items, config: view, collapsedGroups, expandedGroups,
    onToggleGroup: (id) => viewState.toggleGroup(id),       // persist the collapse
    onOperation: (op, item) => run(op.name, item),          // edit, delete, declared item operations
    onSelect: (id, selected) => select(id, selected), selectedIds,
    onCollectionOperation: (op, selected) => run(op.name, selected),
  }));
};
```

`renderListItem` and `renderGridCard` draw one item; `renderValue` lets a registry cell renderer draw a field. A group header click toggles the group in place and calls `onToggleGroup`. Classes: `.zodal-view`, `.zodal-group`, `.zodal-group-header`, `.zodal-list-item`, `.zodal-card`, `.zodal-badge`, `.zodal-view-secondary`, `.zodal-view-actions`, `.zodal-view-toolbar`.

The `ViewConfig` type is declared here structurally (`src/view-types.ts`), and `groupItems` is a local copy, because the `@zodal/ui` on npm this package builds against predates `toViewConfig`; any object of that shape works.

## Feedback on every press (on by default)

Every pressable these renderers draw (operation buttons, collection and selection operations, an item with `onOpen`) acknowledges a press on itself at once and shows that work is going on:

- `data-pressed` on `pointerdown` (CSS `:active` alone does not fire on iOS Safari);
- `data-pending`, `aria-busy="true"` and `aria-disabled="true"` while the callback's promise runs, with repeat presses ignored (the double-tap guard);
- `data-indicator` (a small spinner) once the wait passes 400 ms, kept at least 500 ms so it never flickers;
- `data-status="success" | "error"` when it settles. A zodal command result `{ ok: false }` counts as an error.

To get the pending state, **return the work's promise** from `onOperation`, `onCollectionOperation` and `onOpen`. The view stays pending across rebuilds as long as you pass the same `ViewConfig` object (and a `shareScope` object per pane, if two panes draw the same config). Callbacks may return anything; a promise gets the pending state.

The default look is `FEEDBACK_CSS`: zero-specificity rules, so any rule of yours wins. It includes a reduced-motion variant and `touch-action: manipulation`, and is added to the document once, on first use. To style the attributes entirely yourself, put an empty `<style data-zodal-feedback></style>` in the page.

For your own elements, call `wirePress(element, action, { enterKey?, stopPropagation?, share? })`, or use `createActionFeedback` (the headless machine), `FEEDBACK_MS` (the 100 / 400 / 1000 / 10000 ms limits) and `feedbackFor(expectedMs)`. Why it is the default: i2mint/zodal `docs/adr/0001-feedback-principle.md`.

## Copyable values (`copyable`)

A field with `.meta({ copyable: true })` gets a copy button: beside the value in a table cell, and as a read-only field with the button in a form when it is not editable. For hand-drawn UIs:

```ts
import { copyButton, copyField } from '@zodal/ui-vanilla';
row.append(copyButton(() => link.href, { name: 'Copy link' }));       // icon-only, beside a value on screen
panel.append(copyField(apiUrl, { name: 'API URL', copyName: 'Copy API URL' }));
```

It copies inside the tap (the clipboard API, else `execCommand`; iOS refuses a write that waited), answers on itself (pressed at once, a check and "Copied", announced to screen readers, a short buzz where available), and when every copy path fails it selects the value so the device's own Copy finishes it, saying "Selected". 44px targets under `(pointer: coarse)`.

## Collection forms

Resolve each `toFormConfig` field through `formFieldAffordance`, so a closed choice (an enum, a literal, a union of literals) reaches the select renderer, which writes the option's `raw` value back (numbers stay numbers):

```ts
const render = registry.resolve(formFieldAffordance(collection.fieldAffordances[config.name], config), { mode: 'form' });
```

## Field input history

A text or textarea field whose config has `history` (from the `history` affordance: `fields: { lyrics: { history: true } }`) shows a history button when the render context carries a store, `{ mode: 'form', history }`, passed to the renderer as `context`. The store is `createFieldHistory()` from `@zodal/store`, or anything of the `FieldHistoryStore` shape:

```ts
import { createFieldHistory } from '@zodal/store';
import { createLocalStorageProvider } from '@zodal/store-localstorage';

const history = createFieldHistory({
  provider: createLocalStorageProvider({ storageKey: 'my-app.field-history' }),
});
const ctx = { mode: 'form', history };
const render = registry.resolve(formFieldAffordance(fa, config), ctx);
form.append(render({ field: { value, onChange }, config, context: ctx }));
```

- The button (lucide's `rotate-ccw-clock`, inline) is hidden while the history is empty, and named "<label> history".
- It opens a native `popover` listing past values: the first line, "+N lines" and a relative time per row, pinned first, a filter above 7 entries, a full-value preview, pin and remove per row (Shift+Delete removes the active row), and "Clear history" with Undo.
- Picking an entry records the current value first (so a pick never loses typing), writes the picked value into the field and calls `field.onChange`, closes the list and returns focus to the field. Alt+ArrowDown on the field opens the list.
- Controls are at least 44 px under a coarse pointer (`minTarget` to change it); on a narrow screen the list is a bottom sheet.
- "Clear history" clears at once; Undo stays offered for 10 seconds, even if the list is closed and reopened. A store failure (a pick, a pin, a clear) is shown in the list, and a refused pick leaves the field as it was.
- The list re-reads on the store's optional `subscribe`, so a `recordUse` on submit shows up at once. Once the button has been in the document and leaves it (a vanilla host re-rendering its form), it stops following the store and removes its listeners. A host that rebuilds its form can do that at once with `destroyFieldHistory(oldForm)`.
- A secret never gets history: a field with `secret`, a `password` input, or a secret-looking name (`apiKey`, `db_password`, `access_token`...) draws no button, whatever its config says.
- After a pick, focus goes to the field before `field.onChange` runs; if the host re-renders on change, focus moves to the new field with the same `id`.

The default look is `HISTORY_CSS` (zero-specificity `.zodal-history-*` rules, added once; an empty `<style data-zodal-history></style>` opts out).

For your own fields: `attachFieldHistory({ history, config, label, field, onChange })` returns `{ element, state, open, close, destroy }` (or `null` without a store or config): put `element` beside the field. `createFieldHistoryState(history, scope, { max })` is the headless part (entries kept current, record/remove/pin/clear/restore, `onChange`). Record what was used with `recordUse(fields, values, { history })` and start over with `startNewItem(...)`, both from `@zodal/ui`. The types (`FieldHistoryStore`, `HistoryEntry`) are declared here structurally until a `@zodal/ui` that has them is on npm. Design: [field-input-history.md](https://github.com/i2mint/zodal/blob/main/docs/research/field-input-history.md).

The icon's path data is lucide's `rotate-ccw-clock` (ISC License, Copyright (c) Lucide Icons and Contributors); its notice is kept in `src/field-history.ts` and in the built bundle.

## Options forms (settings, provider options)

`@zodal/ui`'s `toOptionsFormConfig(schema)` describes a settings-like object as form fields, with three widget types beyond a record form's: `'fieldset'` (a nested object, drawn as a `<fieldset>` of its fields), `'password'` (a secret: masked, never prefilled from a stored value) and `'code'` (a function, a client or a structured secret: a "Supplied in code" note, never an input). Resolve each field through `optionsFieldAffordance`:

```ts
import { createVanillaRegistry, optionsFieldAffordance } from '@zodal/ui-vanilla';

const registry = createVanillaRegistry();
for (const f of fields) {
  const render = registry.resolve(optionsFieldAffordance(f), { mode: 'form' });
  form.append(render({ config: f, field: { value: options[f.name], onChange: (v) => (options[f.name] = v) } }));
}
```

A fieldset draws its children through the `registry` you pass in its props (so your overrides apply inside it), else through `renderField`, else through this package's default registry. A disabled fieldset disables every child, and a secret child that is typed and then emptied keeps the stored secret.

The `OptionsFormField` type is declared here structurally (`src/options-form-types.ts`), like `ViewConfig`. Classes: `.zodal-fieldset`, `.zodal-code-note`.

## Styling

All elements use `.zodal-*` CSS class names. Style them however you want:

```css
.zodal-cell { font-family: inherit; }
.zodal-field { margin-bottom: 1rem; }
.zodal-label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
.zodal-input { padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
.zodal-badge { padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; }
.zodal-help { font-size: 0.875rem; color: #666; margin-top: 0.25rem; }
.zodal-muted { color: #999; }
.zodal-filter { padding: 0.25rem; }
.zodal-filter-range { display: flex; gap: 4px; }
```

## Browser Usage (import maps)

```html
<script type="importmap">
{ "imports": {
  "zod": "https://esm.sh/zod@4",
  "@zodal/core": "https://esm.sh/@zodal/core@0.1.0",
  "@zodal/ui": "https://esm.sh/@zodal/ui@0.1.0",
  "@zodal/ui-vanilla": "https://esm.sh/@zodal/ui-vanilla@0.1.0"
}}
</script>
<script type="module">
  import { createVanillaRegistry } from '@zodal/ui-vanilla';
  const registry = createVanillaRegistry();
  // ...
</script>
```

## Customization

Override any renderer by registering a higher-priority entry:

```typescript
import { createRendererRegistry, PRIORITY } from '@zodal/ui';
import { cellRenderers, formRenderers, filterRenderers } from '@zodal/ui-vanilla';

const registry = createRendererRegistry();
for (const entry of [...cellRenderers, ...formRenderers, ...filterRenderers]) {
  registry.register(entry);
}

// Add a custom renderer at higher priority
registry.register({
  tester: (field, ctx) =>
    ctx.mode === 'cell' && field.zodType === 'string' ? PRIORITY.APP : -1,
  renderer: (props) => {
    const el = document.createElement('strong');
    el.textContent = String(props.value);
    return el;
  },
  name: 'BoldTextCell',
});
```

## Selective Import

Use individual renderer arrays to pick only what you need:

```typescript
import { cellRenderers } from '@zodal/ui-vanilla';
import { createRendererRegistry } from '@zodal/ui';

const registry = createRendererRegistry();
for (const entry of cellRenderers) {
  registry.register(entry);
}
```

## Development

```bash
pnpm install
pnpm build       # Build with tsup
pnpm test        # Run tests
pnpm typecheck   # TypeScript check
```

## License

MIT


