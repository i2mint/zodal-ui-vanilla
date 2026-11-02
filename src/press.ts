/**
 * Press feedback for any pressable element: the feedback principle, applied by default.
 *
 * Every press is acknowledged on the pressed element itself, within the 0.1 s limit, before any
 * network or navigation work: `data-pressed` from `pointerdown` (CSS `:active` is not enough on
 * iOS Safari, which applies it only when a touch listener exists), then, while the action runs,
 * `data-pending` + `aria-busy` + `aria-disabled`, with repeat presses ignored (the double-tap
 * guard), and `data-indicator` once the wait is long enough for a spinner. The action runs on
 * `click` (and Enter, for an element that is not a button), never on `pointerdown` (WCAG 2.5.2).
 * A page restored from the back/forward cache drops a pending state left by a press that
 * navigated away.
 *
 * `FEEDBACK_CSS` styles those attributes at zero specificity (`:where`), so any rule of yours
 * wins; it is added to the document once, on first use, unless a `<style data-zodal-feedback>`
 * is already there (put an empty one in to opt out and style the attributes yourself).
 */

import { createActionFeedback, type ActionFeedback, type ActionFeedbackOptions, type ActionFeedbackState } from './action-feedback.js';

/** What {@link wirePress} takes beyond the element and the action. */
export interface PressOptions<R = unknown> extends Pick<ActionFeedbackOptions<R>, 'indicatorDelayMs' | 'minIndicatorMs' | 'isFailure' | 'clock'> {
  /** Also run on Enter (for an element that is not a native button, such as a card). */
  enterKey?: boolean;
  /** Stop the click from reaching an ancestor (a button inside a clickable card). */
  stopPropagation?: boolean;
  /** Called when the action settles (or is reset): show a failure's message here. */
  onSettled?: (state: Readonly<ActionFeedbackState<R>>) => void;
  /**
   * Share the action's state with every element wired with the same `scope` (any stable object,
   * such as the view config) and `key`. A vanilla host rebuilds its DOM when state changes, so a
   * button rebuilt while its action is in flight would otherwise come back idle and pressable
   * again; with `share`, the new element shows the pending state and the guard still holds. The
   * tracker keeps the timing options of the first element wired for it.
   */
  share?: { scope: object; key: string };
}

/**
 * The default look of the feedback attributes, at zero specificity (every selector is inside
 * `:where`). Pressed: a quick scale-down; pending: dimmed with a progress cursor; indicator: a
 * small spinner in its own child element (`.zodal-press-indicator`), so it never touches the
 * host's `::before` / `::after`. Reduced motion swaps the scale and the spin for opacity.
 */
export const FEEDBACK_CSS = `
:where([data-zodal-press]) { touch-action: manipulation; -webkit-tap-highlight-color: transparent; transition: transform 80ms ease-out, opacity 80ms ease-out; }
:where([data-zodal-press][data-pressed]) { transform: scale(0.97); opacity: 0.85; }
:where([data-zodal-press][data-pending]) { opacity: 0.6; cursor: progress; }
:where(.zodal-press-indicator) { display: inline-block; width: 0.8em; height: 0.8em; margin-inline-start: 0.4em; vertical-align: -0.1em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: zodal-spin 0.8s linear infinite; }
@keyframes zodal-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  :where([data-zodal-press]) { transition: opacity 80ms linear; }
  :where([data-zodal-press][data-pressed]) { transform: none; opacity: 0.7; }
  :where(.zodal-press-indicator) { animation: zodal-pulse 1.6s ease-in-out infinite; }
  @keyframes zodal-pulse { 50% { opacity: 0.3; } }
}
`;

/** Add {@link FEEDBACK_CSS} to `doc` once, unless a `<style data-zodal-feedback>` is already there. */
export function installFeedbackStyles(doc: Document = document): void {
  if (doc.querySelector('style[data-zodal-feedback]')) return;
  const style = doc.createElement('style');
  style.setAttribute('data-zodal-feedback', '');
  style.textContent = FEEDBACK_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}

/** Each wired element's reset, for a back/forward-cache restore (weak: renders are thrown away). */
const resets = new WeakMap<Element, () => void>();
const pageshowInstalled = new WeakSet<Window>();
function onPageshow(e: Event) {
  if (!(e as PageTransitionEvent).persisted) return;
  const doc = (e.currentTarget as Window).document;
  doc.querySelectorAll('[data-zodal-press][data-pending]').forEach((pending) => resets.get(pending)?.());
}

/** One action's feedback, shared by the elements drawn for it (the newest one shows it). */
interface Tracker {
  feedback: ActionFeedback<[], unknown>;
  element: HTMLElement;
  action: () => unknown;
  onSettled?: (state: Readonly<ActionFeedbackState<unknown>>) => void;
}
const sharedTrackers = new WeakMap<object, Map<string, Tracker>>();

/** Reflect an action's state on the element drawn for it. */
function paint(element: HTMLElement, s: Readonly<ActionFeedbackState<unknown>>): void {
  const pending = s.status === 'pending';
  element.toggleAttribute('data-pending', pending);
  element.toggleAttribute('data-indicator', s.indicator);
  const spinner = element.querySelector(':scope > .zodal-press-indicator');
  if (s.indicator && !spinner) {
    const span = element.ownerDocument.createElement('span');
    span.className = 'zodal-press-indicator';
    span.setAttribute('aria-hidden', 'true');
    element.appendChild(span);
  } else if (!s.indicator && spinner) spinner.remove();
  if (pending) {
    element.setAttribute('aria-busy', 'true');
    element.setAttribute('aria-disabled', 'true');
  } else {
    element.removeAttribute('aria-busy');
    element.removeAttribute('aria-disabled');
    element.removeAttribute('data-pressed');
  }
  if (s.status === 'success' || s.status === 'error') element.setAttribute('data-status', s.status);
  else element.removeAttribute('data-status');
}

/** Controls inside a pressable press themselves, not the pressable around them. */
const OWN_PRESS = '[data-zodal-press], button, a[href], input, select, textarea, label, [contenteditable]';

/**
 * Give `element` press feedback and run `action` on each press (unless one is in flight).
 * `action` may return a promise (or a zodal command result): the element stays pending until it
 * settles. Returns a function that removes the wiring.
 *
 * @example
 * ```ts
 * const tile = el('article', { class: 'tile' }, 'Synth');
 * wirePress(tile, () => openApp('synth'), { enterKey: true });
 * ```
 */
export function wirePress<R>(element: HTMLElement, action: () => R | PromiseLike<R>, options: PressOptions<R> = {}): () => void {
  const { enterKey = false, stopPropagation = false, onSettled, share, ...timing } = options;
  const doc = element.ownerDocument;
  installFeedbackStyles(doc);
  element.setAttribute('data-zodal-press', '');

  const shelf = share ? sharedTrackers.get(share.scope) ?? sharedTrackers.set(share.scope, new Map()).get(share.scope)! : undefined;
  let tracker = shelf?.get(share!.key);
  if (!tracker) {
    const t: Tracker = {
      element,
      action,
      onSettled: onSettled as Tracker['onSettled'],
      feedback: createActionFeedback(() => t.action(), {
        ...(timing as Pick<ActionFeedbackOptions<unknown>, 'indicatorDelayMs' | 'minIndicatorMs' | 'isFailure' | 'clock'>),
        onChange: (s) => {
          paint(t.element, s);
          // Shared from the moment it turns pending, before the action runs: a host that rebuilds
          // the view synchronously inside its callback gets the pending tracker for the new element.
          if (s.status === 'pending') shelf?.set(share!.key, t);
          else {
            if (shelf?.get(share!.key) === t) shelf.delete(share!.key);
            t.onSettled?.(s);
          }
        },
      }),
    };
    tracker = t;
  } else {
    tracker.element = element;
    tracker.action = action;
    tracker.onSettled = onSettled as Tracker['onSettled'];
    paint(element, tracker.feedback.state);
  }
  const { feedback } = tracker;
  const t = tracker;

  const press = () => void feedback.run();
  // `closest` duck-typed, not `instanceof Element`, which fails across realms (an iframe).
  const owns = (e: Event) => {
    const target = e.target as Element | null;
    return typeof target?.closest === 'function' && target.closest(OWN_PRESS) === element;
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || !owns(e)) return;
    element.setAttribute('data-pressed', '');
    element.removeAttribute('data-status'); // the last outcome is stale once a new press starts
  };
  const up = () => element.removeAttribute('data-pressed');
  const click = (e: Event) => {
    if (stopPropagation) e.stopPropagation();
    if (owns(e)) press();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.target === element) press();
  };

  element.addEventListener('pointerdown', down);
  for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) element.addEventListener(t, up);
  element.addEventListener('click', click);
  if (enterKey) element.addEventListener('keydown', key);
  resets.set(element, feedback.reset);
  const win = doc.defaultView;
  if (win && !pageshowInstalled.has(win)) {
    win.addEventListener('pageshow', onPageshow);
    pageshowInstalled.add(win);
  }

  return () => {
    element.removeEventListener('pointerdown', down);
    for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) element.removeEventListener(t, up);
    element.removeEventListener('click', click);
    element.removeEventListener('keydown', key);
    resets.delete(element);
    if (t.element === element && shelf?.get(share!.key) !== t) feedback.dispose();
  };
}
