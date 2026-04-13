/**
 * Content-aware renderers for bifurcated collections.
 *
 * Cell: download link or image thumbnail (based on ContentRef)
 * Form: file upload input with accept/maxSize
 */

import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import { el } from '../dom.js';
import type { CellProps, FormFieldProps } from '../types.js';

/** Check if a value is a ContentRef (matches @zodal/core isContentRef). */
function isContentRef(value: unknown): value is { _tag: 'ContentRef'; field: string; itemId: string; url?: string; mimeType?: string; size?: number } {
  return typeof value === 'object' && value !== null && '_tag' in value && (value as any)._tag === 'ContentRef';
}

// ============================================================================
// Cell Renderer: Content download/preview
// ============================================================================

function contentCell({ value, config }: CellProps): HTMLElement {
  if (isContentRef(value)) {
    const ref = value;

    // Image preview for image MIME types
    if (ref.mimeType?.startsWith('image/') && ref.url) {
      return el('a', {
        href: ref.url,
        target: '_blank',
        class: 'zodal-cell zodal-cell-content zodal-content-image',
      },
        el('img', {
          src: ref.url,
          alt: ref.field,
          style: { maxHeight: '32px', maxWidth: '64px', objectFit: 'cover', borderRadius: '4px' },
        }),
      );
    }

    // Download link for other types
    if (ref.url) {
      const sizeStr = ref.size ? ` (${formatSize(ref.size)})` : '';
      const typeStr = ref.mimeType ? ` [${ref.mimeType}]` : '';
      return el('a', {
        href: ref.url,
        target: '_blank',
        download: ref.field,
        class: 'zodal-cell zodal-cell-content zodal-content-download',
      }, `\u2913 Download${sizeStr}${typeStr}`);
    }

    // No URL — show placeholder
    return el('span', {
      class: 'zodal-cell zodal-cell-content zodal-muted',
    }, `[${ref.field}]`);
  }

  // Not a ContentRef — fallback
  return el('span', { class: 'zodal-cell zodal-muted' }, String(value ?? '\u2014'));
}

// ============================================================================
// Form Renderer: File upload
// ============================================================================

function fileUploadInput({ field, config }: FormFieldProps): HTMLElement {
  const input = el('input', {
    id: config.name,
    type: 'file',
    class: 'zodal-input zodal-input-file',
    accept: (config as any).acceptMimeTypes?.join(',') ?? undefined,
    required: config.required,
    disabled: config.disabled,
    onChange: (e: Event) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        const file = files[0];
        // Check max size
        const maxSize = (config as any).maxSize;
        if (maxSize && file.size > maxSize) {
          alert(`File too large. Max: ${formatSize(maxSize)}, got: ${formatSize(file.size)}`);
          (e.target as HTMLInputElement).value = '';
          return;
        }
        field.onChange(file);
      }
    },
  }) as HTMLInputElement;

  const wrapper = el('div', { class: 'zodal-field zodal-field-file' },
    el('label', { for: config.name, class: 'zodal-label' }, config.label),
    input,
    config.helpText
      ? el('p', { class: 'zodal-help' }, config.helpText)
      : null,
    (config as any).maxSize
      ? el('p', { class: 'zodal-help zodal-muted' }, `Max size: ${formatSize((config as any).maxSize)}`)
      : null,
  );

  // Show current value if it's a ContentRef
  if (isContentRef(field.value)) {
    const ref = field.value;
    const current = el('p', { class: 'zodal-help' },
      ref.url
        ? el('a', { href: ref.url, target: '_blank' }, `Current: ${ref.field}${ref.size ? ` (${formatSize(ref.size)})` : ''}`)
        : `Current: ${ref.field}`,
    );
    wrapper.appendChild(current);
  }

  return wrapper;
}

// ============================================================================
// Helpers
// ============================================================================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ============================================================================
// Exports
// ============================================================================

export type ContentCellRenderer = (props: CellProps) => HTMLElement;
export type ContentFormRenderer = (props: FormFieldProps) => HTMLElement;

/** Cell renderers for content fields (download link, image preview). */
export const contentCellRenderers: RendererEntry<ContentCellRenderer>[] = [
  {
    tester: (field, ctx) =>
      ctx.mode === 'cell' && (field as any).storageRole === 'content' ? PRIORITY.LIBRARY : -1,
    renderer: contentCell,
    name: 'ContentCell',
  },
];

/** Form renderers for content fields (file upload). */
export const contentFormRenderers: RendererEntry<ContentFormRenderer>[] = [
  {
    tester: (field, ctx) =>
      ctx.mode === 'form' && (field as any).storageRole === 'content' ? PRIORITY.LIBRARY : -1,
    renderer: fileUploadInput,
    name: 'FileUploadInput',
  },
];
