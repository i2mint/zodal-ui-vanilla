# Design Decisions: @zodal/ui-vanilla

## Why This Package Exists

zodal's core packages (`@zodal/core`, `@zodal/store`, `@zodal/ui`) are headless — they produce configuration objects, not DOM. The only renderer package (`@zodal/ui-shadcn`) requires React. This blocks zodal usage in vanilla HTML/JS apps. `@zodal/ui-vanilla` fills that gap.

## Decision 1: Return `HTMLElement`, not HTML strings

**Choice**: Renderer functions return `HTMLElement`.

**Rationale**: Form and filter renderers must attach event listeners (`onChange` callbacks). With HTML strings, you'd need a two-step create-then-hydrate pattern. `HTMLElement` handles this naturally. If SSR is ever needed, `.outerHTML` can serialize the result.

## Decision 2: Internal `el()` DOM helper

**Choice**: A small internal function `el(tag, attrs, ...children)` replaces `React.createElement` 1:1.

**Rationale**: The native DOM API (`document.createElement` + `setAttribute` + `appendChild`) is verbose. The `el()` helper keeps renderer code concise and readable while handling event listener attachment (`onXxx` attrs), style objects, and text children. It is internal (not exported) — just a development convenience.

## Decision 3: `input` event for text inputs, `change` for select/checkbox

**Choice**: Text, number, and date inputs use the `input` event. Checkboxes and selects use the `change` event.

**Rationale**: React's synthetic `onChange` fires on every keystroke for text inputs. The native DOM `change` event only fires on blur. Using `input` matches the reactive behavior users expect from form bindings.

## Decision 4: CSS class names, no bundled styles

**Choice**: All elements get `.zodal-*` CSS class names. No styles are auto-injected.

**Rationale**: Vanilla JS users typically have their own CSS approach. Class names serve as hooks. The package ships no mandatory CSS — users style `.zodal-cell`, `.zodal-field`, `.zodal-filter` etc. as they wish.

## Decision 5: One-way data flow (no re-render)

**Choice**: Renderers create initial DOM. The consumer is responsible for replacing elements on state change.

**Rationale**: Unlike React where re-render is automatic, vanilla DOM requires explicit update logic. Each renderer call produces a fresh element. If the state changes, the consumer calls the renderer again and swaps the old element. This is the standard pattern for vanilla DOM libraries and avoids building a mini-framework.

## Decision 6: Peer ranges go to the next MAJOR, not the next minor

> **Superseded** by zodal's [`docs/versioning.md`](https://github.com/i2mint/zodal/blob/main/docs/versioning.md). Peers are now a caret on the lowest version needed (`^0.2.1`). The failure this decision guarded against, a core minor orphaning this package, is now caught on the core side: zodal's release CI runs `scripts/check-satellite-peers.mjs` and refuses a core release that a published satellite's peer range would newly reject, so satellites are widened (`^0.2.1 || ^0.3.0`) before the breaking minor ships. A range to the next major would accept a breaking `0.3.0` and move the break from install time to runtime in an app. The original text is kept below for history.

**Choice**: `peerDependencies` on `@zodal/core` and `@zodal/ui` are `>=X.Y.0 <1.0.0`, not `^X.Y.0`.

**Rationale**: npm's caret is *exact-minor* below 1.0 — `^0.1.0` resolves to `>=0.1.0 <0.2.0`. So while the core packages are pre-1.0, a caret peer turns every core **minor** release into a hard `ERESOLVE` install failure for this package, even when nothing it uses has changed. That is exactly what happened when core/ui went to 0.2.0: this renderer typechecked, built, and passed its whole suite against 0.2.0, yet `npm install` refused it — the only non-React renderer in the ecosystem was uninstallable for a version range, not an incompatibility.

A range to the next major says what is actually meant: "works across the 0.x line". A genuine break gets caught by CI (typecheck + build + test all run against the current core), and the floor moves up when a real minimum appears.

## Decision 7: Tag widgets keep their own state inside the element

**Choice**: The tag input and the type-ahead chip filter update their own chips, draft and suggestion list in place, and report every change through `field.onChange` with the whole new value (an array for the form, a `FilterCondition` or `undefined` for the filter).

**Rationale**: A chip input's interaction (type, pick, add, remove, keep focus, keep the half-typed draft) cannot survive the swap-the-element cycle of Decision 5: re-rendering on each add would drop focus and the draft. So these widgets are the one place where the element outlives a change. The consumer still owns the value; it need not re-render on `onChange`, and if it does, the new element starts from the value it passes in.

## Decision 8: `field` stays the value binding; the affordance travels as `affordance`

**Choice**: Form and filter props are `@zodal/ui`'s `FieldRenderProps` (`config`, optional `context`) with `field` kept as the `{ value, onChange }` binding this package has always used, and the resolved affordance as an optional `affordance` (`BoundFieldProps<C>` in `src/types.ts`).

**Rationale**: `FieldRenderProps.field` is the affordance, which collides with this package's `field` binding. Renaming the binding would break every existing caller; keeping it and adding `context` (which carries `suggest`) and `affordance` as optional props keeps old call sites working and gets the context to the widgets.

## Decision 9: The chip filter emits `arrayContainsAny`, even for one value

**Choice**: `toContainsFilter(name, values)` returns `{ field, operator: 'arrayContainsAny', value: [...] }`, or `undefined` when nothing is selected.

**Rationale**: OR within one field is the faceted-filter convention (AND across fields is the consumer's `{ and: [...] }`), and the filter says so in words ("Tags is any of"). For a single value it equals `arrayContains`, so one operator loses nothing and keeps the value's shape stable: it never flips between a scalar and an array as chips are added or removed, which keeps app state, URLs and backend translation simple. Every adapter that supports `contains` filters translates `arrayContainsAny` (in-memory `filterToFunction`, Supabase `ov`/`&&`, HTTP).
