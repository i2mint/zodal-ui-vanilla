# zodal-ui-vanilla -- Agent Guide

## What This Is

A zodal UI renderer package for vanilla HTML/JS. Provides plain DOM element factories that consume zodal's headless configuration objects (ColumnConfig, FormFieldConfig, FilterFieldConfig) and produce HTMLElement instances without any framework dependency.

## Package Structure

```
src/
  index.ts             — Public exports
  types.ts             — Shared prop types (CellProps, FormFieldProps, FilterFieldProps)
  registry.ts          — createVanillaRegistry() factory + VanillaRenderer type
  dom.ts               — Internal el() DOM helper (NOT exported)
  renderers/
    cell-renderers.ts  — Table cell renderers (text, number, boolean, date, badge, array, currency)
    form-renderers.ts  — Form field renderers (text, number, checkbox, select, date)
    filter-renderers.ts — Filter widget renderers (text, select, range, boolean)
tests/
  registry.test.ts     — Registry resolution tests
  renderers.test.ts    — DOM output + event binding tests
```

## Key Patterns

- **No React**: Uses `document.createElement` via internal `el()` helper
- **HTMLElement return type**: All renderers return HTMLElement, not strings
- **Event binding**: Form/filter renderers attach native DOM event listeners (`input` for text, `change` for select/checkbox)
- **CSS classes**: All elements get `.zodal-*` classes for user styling
- **Headless first**: Renderers consume zodal config objects, not raw Zod schemas
- **Priority-based resolution**: Same tester/PRIORITY pattern as shadcn

## Skills

Before working on this package, read the zodal UI renderer skill:
- `zodal/.claude/skills/zodal-ui-renderer/SKILL.md`

## Dependencies

- `@zodal/core` and `@zodal/ui` as peer dependencies
- NO react, NO react-dom
- Build: tsup (dual CJS/ESM + .d.ts)
- Test: vitest with jsdom environment

## Commands

- `pnpm build` — Build with tsup
- `pnpm test` — Run vitest
- `pnpm typecheck` — TypeScript type check
