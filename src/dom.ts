/**
 * Internal DOM helpers: an element factory replacing React.createElement with the
 * native DOM API, and the inline style that hides text visually while keeping it
 * for assistive tech (live regions, list separators).
 */

/**
 * Visually hidden but read by screen readers. Inline rather than a class: it is
 * functional, not cosmetic, so it must work without the app's stylesheet.
 */
export const VISUALLY_HIDDEN: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
};

let idCounter = 0;

/** A document-unique id with a readable prefix. */
export function uniqueId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function el(
  tag: string,
  attrs?: Record<string, any> | null,
  ...children: (Node | string | null | undefined)[]
): HTMLElement {
  const element = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on') && typeof value === 'function') {
        const event = key.slice(2).toLowerCase();
        element.addEventListener(event, value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (value !== undefined && value !== null && value !== false) {
        element.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    if (child == null) continue;
    element.appendChild(
      typeof child === 'string' ? document.createTextNode(child) : child,
    );
  }
  return element;
}
