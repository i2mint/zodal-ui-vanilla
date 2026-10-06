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
| ArrayCell | array | Chips, the first 3 shown, then a "+N" chip naming the rest |

### Form Renderers (data entry)

| Renderer | Zod Type | Description |
|----------|----------|-------------|
| TextInput | string (+ fallback) | Text input with label |
| NumberInput | number, int, float | Number input |
| CheckboxInput | boolean | Checkbox with label |
| SelectInput | enum | Dropdown with options |
| DateInput | date | Date picker |
| TagInput | array (`type: 'tags'`), or `editWidget: 'tags'` | Chip input: add with Enter or comma, remove with Backspace or a chip's button; options or `context.suggest` |

### Filter Renderers (filtering)

| Renderer | Filter Type | Description |
|----------|-------------|-------------|
| TextFilter | search (+ fallback) | Text search input |
| SelectFilter | select, multiSelect | Dropdown with "All" option |
| RangeFilter | range | Min/Max number inputs |
| BooleanFilter | boolean | All/Yes/No dropdown |
| ChipFilter | `contains` on an array | Toggle chips ("Tags is any of"), or a type-ahead when options are many or absent; emits `arrayContainsAny` |

## Tag fields

An array field gets chips in all three modes: `TagInput` in forms (`toFormConfig` gives it `type: 'tags'`), `ChipFilter` for its `contains` filter, and `ArrayCell` (chips with "+N") in tables.

```typescript
const schema = z.object({
  title: z.string(),
  tags: z.array(z.string()),                          // open: new tags allowed
  labels: z.array(z.enum(['bug', 'feature', 'docs'])), // closed: only these
});
const collection = defineCollection(schema);
const registry = createVanillaRegistry();

// Where suggestions come from: values already used, a zodal-groups vocabulary, an endpoint.
const suggest = async (query, field, { signal, limit }) => {
  const res = await fetch(`/api/${field}?q=${encodeURIComponent(query)}&limit=${limit}`, { signal });
  return res.json(); // [{ value, label }]
};

for (const config of toFormConfig(collection)) {
  const field = collection.fieldAffordances[config.name];
  const context = { mode: 'form' as const, suggest };
  const render = registry.resolve(field, context);
  form.appendChild(render({ field: { value: item[config.name], onChange: (v) => (item[config.name] = v) }, config, context }));
}
```

- **Keyboard**: Enter or comma adds the draft; Backspace on an empty input removes the last chip; arrow keys move through suggestions, Enter picks one, Escape closes the list; every chip has a remove button in the tab order. Pasting `a, b, c` adds three tags.
- **Vocabulary**: with `allowCreate: false` (a closed vocabulary) only `options` can be added and the first match is highlighted; free text is refused and stays in the input. Otherwise `context.suggest` is asked (debounced, the previous request aborted through its `AbortSignal`, stale results dropped, a loading state shown, at most `limit` results), or `options` are matched locally, or the input takes free text.
- **Values**: duplicates are refused; an option's `raw` is written back, so a numeric vocabulary stays numeric.
- **Accessibility**: ARIA 1.2 combobox (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`) over a `role="listbox"`; a polite live region announces adds, removes and refusals.
- **Typed text is never lost**: a refusal, a failed suggestion request and a blur all leave the draft in place.

The filter emits a ready `FilterExpression` condition, `{ field, operator: 'arrayContainsAny', value: [...] }`, or `undefined` when nothing is selected. It always uses `arrayContainsAny` (OR within the field, said on screen as "is any of"): for one value it equals `arrayContains`, and the value keeps one shape as chips come and go. Combine several fields' conditions with `{ and: [...] }`. `fromContainsFilter(value)` reads a selection back.

Settings (debounce, limit, visible chips, the toggle/type-ahead threshold, every message for i18n) go through the factories:

```typescript
import { PRIORITY } from '@zodal/ui';
import { createTagInput } from '@zodal/ui-vanilla';

registry.register({
  tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'array' ? PRIORITY.APP : -1,
  renderer: createTagInput({ debounceMs: 300, limit: 8, messages: { added: (l) => `${l} ajouté` } }),
  name: 'TagInput (French)',
});
```

Form and filter renderers take `{ field: { value, onChange }, config, context?, affordance? }`: `@zodal/ui`'s `FieldRenderProps` with `field` kept as the value binding, so existing call sites keep working.

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
.zodal-chips { display: inline-flex; flex-wrap: wrap; gap: 4px; list-style: none; margin: 0; padding: 0; }
.zodal-chip { padding: 0 8px; border-radius: 9999px; background: #eef; font-size: 0.8rem; }
.zodal-chip-toggle[aria-pressed="true"] { background: #336; color: white; }
.zodal-tags { display: flex; flex-wrap: wrap; gap: 4px; border: 1px solid #ccc; border-radius: 4px; padding: 4px; }
.zodal-tags-input { border: 0; flex: 1; min-width: 8ch; outline: none; }
.zodal-popup { border: 1px solid #ccc; border-radius: 4px; }
.zodal-option[aria-selected="true"] { background: #eef; }
.zodal-tags-combobox[data-loading] .zodal-listbox-status { opacity: 0.7; }
```

## Browser Usage (import maps)

```html
<script type="importmap">
{ "imports": {
  "zod": "https://esm.sh/zod@4",
  "@zodal/core": "https://esm.sh/@zodal/core@0.2.2",
  "@zodal/ui": "https://esm.sh/@zodal/ui@0.2.2",
  "@zodal/ui-vanilla": "https://esm.sh/@zodal/ui-vanilla@0.3.0"
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


