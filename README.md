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
| TextInput | string (+ fallback) | Text input with label |
| NumberInput | number, int, float | Number input |
| CheckboxInput | boolean | Checkbox with label |
| SelectInput | enum | Dropdown with options |
| DateInput | date | Date picker |

### Filter Renderers (filtering)

| Renderer | Filter Type | Description |
|----------|-------------|-------------|
| TextFilter | search (+ fallback) | Text search input |
| SelectFilter | select, multiSelect | Dropdown with "All" option |
| RangeFilter | range | Min/Max number inputs |
| BooleanFilter | boolean | All/Yes/No dropdown |

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


