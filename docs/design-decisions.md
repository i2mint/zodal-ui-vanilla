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
