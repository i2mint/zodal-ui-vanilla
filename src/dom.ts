/**
 * Internal DOM element factory.
 * Replaces React.createElement with native DOM API.
 */
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
