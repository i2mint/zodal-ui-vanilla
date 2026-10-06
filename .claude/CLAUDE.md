# zodal-ui-vanilla -- Agent Guide

## What This Is

A zodal UI renderer package for vanilla HTML/JS. Provides plain DOM element factories that consume zodal's headless configuration objects (ColumnConfig, FormFieldConfig, FilterFieldConfig) and produce HTMLElement instances without any framework dependency.

## Package Structure

```
src/
  index.ts             — Public exports
  types.ts             — Shared prop types (CellProps, FormFieldProps, FilterFieldProps, FieldBinding, BoundFieldProps)
  registry.ts          — createVanillaRegistry() factory + VanillaRenderer type
  dom.ts               — Internal el() DOM helper, uniqueId, VISUALLY_HIDDEN (NOT exported)
  tag-logic.ts         — Framework-free tag logic: draft resolution, option matching, the contains-filter value, suggestion pacing (mirrored in ui-shadcn; keep the copies identical)
  renderers/
    cell-renderers.ts  — Table cell renderers (text, number, boolean, date, badge, array → chips, currency)
    form-renderers.ts  — Form field renderers (text, number, checkbox, select, date, tags)
    filter-renderers.ts — Filter widget renderers (text, select, range, boolean, chip filter)
    tag-renderers.ts   — Tag widgets: createTagInput / createChipFilter / createChipCell
    content-renderers.ts — ContentRef cell and file-upload form field
tests/
  registry.test.ts     — Registry resolution tests, incl. "no winner changes for non-array fields"
  renderers.test.ts    — DOM output + event binding tests
  tag-logic.test.ts    — Tag logic (draft resolution, filter value, suggestion pacing)
  tag-renderers.test.ts — Tag widgets in jsdom (keyboard, ARIA, suggest, raw values, overflow)
```

## Key Patterns

- **No React**: Uses `document.createElement` via internal `el()` helper
- **HTMLElement return type**: All renderers return HTMLElement, not strings
- **Event binding**: Form/filter renderers attach native DOM event listeners (`input` for text, `change` for select/checkbox)
- **CSS classes**: All elements get `.zodal-*` classes for user styling
- **Headless first**: Renderers consume zodal config objects, not raw Zod schemas
- **Priority-based resolution**: Same tester/PRIORITY pattern as shadcn
- **Props = `FieldRenderProps` with `field` as the binding**: form/filter renderers get `{ field: { value, onChange }, config, context?, affordance? }`; `context.suggest` feeds the tag widgets (design decision 8)
- **Tag widgets are stateful within their element** (decision 7) and keep typed text on refusal, error and blur; the chip filter emits an `arrayContainsAny` `FilterCondition` (decision 9)
- **Known quirk, left as is**: the cell fallback (`() => FALLBACK`) matches every mode, so fields with no form/filter renderer of their own resolve to `TextCell (fallback)` in form/filter mode; `tests/registry.test.ts` pins it

## Skills

Before working on this package, read the zodal UI renderer skill:
- `zodal/.claude/skills/zodal-ui-renderer/SKILL.md`

## Dependencies

- `@zodal/core` and `@zodal/ui` as peer dependencies, caret on the lowest version needed (`^0.2.2`; see zodal's `docs/versioning.md`, which supersedes design decision 6)
- NO react, NO react-dom
- Build: tsup (dual CJS/ESM + .d.ts)
- Test: vitest with jsdom environment

## Commands

- `pnpm build` — Build with tsup
- `pnpm test` — Run vitest
- `pnpm typecheck` — TypeScript type check
