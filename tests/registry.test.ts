import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineCollection } from '@zodal/core';
import { toFormConfig } from '@zodal/ui';
import { createVanillaRegistry, formFieldAffordance } from '../src/index.js';
import type { ResolvedFieldAffordance } from '@zodal/core';

function mockField(overrides: Partial<ResolvedFieldAffordance> = {}): ResolvedFieldAffordance {
  return {
    zodType: 'string',
    sortable: true,
    filterable: false,
    searchable: false,
    editable: true,
    visible: true,
    title: 'Test',
    ...overrides,
  } as ResolvedFieldAffordance;
}

describe('createVanillaRegistry', () => {
  const registry = createVanillaRegistry();

  it('resolves a renderer for string fields in cell mode', () => {
    const renderer = registry.resolve(mockField({ zodType: 'string' }), { mode: 'cell' });
    expect(renderer).toBeDefined();
  });

  it('resolves a renderer for number fields in cell mode', () => {
    const renderer = registry.resolve(mockField({ zodType: 'number' }), { mode: 'cell' });
    expect(renderer).toBeDefined();
  });

  it('resolves a renderer for boolean fields in cell mode', () => {
    const renderer = registry.resolve(mockField({ zodType: 'boolean' }), { mode: 'cell' });
    expect(renderer).toBeDefined();
  });

  it('resolves a renderer for enum fields in cell mode', () => {
    const renderer = registry.resolve(mockField({ zodType: 'enum' }), { mode: 'cell' });
    expect(renderer).toBeDefined();
  });

  it('resolves a renderer for date fields in cell mode', () => {
    const renderer = registry.resolve(mockField({ zodType: 'date' }), { mode: 'cell' });
    expect(renderer).toBeDefined();
  });

  it('resolves a form renderer for string fields', () => {
    const renderer = registry.resolve(mockField({ zodType: 'string' }), { mode: 'form' });
    expect(renderer).toBeDefined();
  });

  it('resolves a filter renderer', () => {
    const renderer = registry.resolve(
      mockField({ zodType: 'string', filterable: 'search' } as any),
      { mode: 'filter' },
    );
    expect(renderer).toBeDefined();
  });

  it('has a fallback for unknown types', () => {
    const renderer = registry.resolve(mockField({ zodType: 'unknown_type' }), { mode: 'cell' });
    expect(renderer).toBeDefined();
  });

  it('keeps each fallback to its own mode (#2)', () => {
    const top = (zodType: string, mode: 'cell' | 'form' | 'filter') =>
      registry.explain(mockField({ zodType, filterable: 'exact' } as any), { mode })[0]?.name;
    for (const zodType of ['object', 'set', 'bigint', 'unknown_type']) {
      expect(top(zodType, 'cell')).toBe('TextCell (fallback)');
    }
    expect(top('array', 'cell')).toBe('ArrayCell');
    for (const zodType of ['object', 'set', 'bigint', 'array', 'unknown_type']) {
      expect(top(zodType, 'form')).toBe('ReadOnlyInput (fallback)');
    }
    for (const zodType of ['object', 'set', 'array', 'unknown_type']) {
      expect(registry.resolve(mockField({ zodType, filterable: 'exact' } as any), { mode: 'filter' })).toBeNull();
    }
    expect(top('bigint', 'filter')).toBe('TextFilter (fallback)');
    expect(top('string', 'filter')).toBe('TextFilter (fallback)');
    expect(top('string', 'form')).toBe('TextInput');
  });

  it('picks SelectInput from the generated form config, for any closed choice (#14)', () => {
    const c = defineCollection(z.object({
      id: z.string(),
      size: z.literal([2, 4]),
      kind: z.union([z.literal('a'), z.literal('b')]),
      locked: z.literal(['x', 'y']).meta({ filterable: 'exact' }),
      status: z.union([z.string(), z.number()]),
    }));
    const configs = toFormConfig(c);
    const top = (name: string) => {
      const config = configs.find((f) => f.name === name)!;
      return registry.explain(formFieldAffordance(c.fieldAffordances[name], config), { mode: 'form' })[0]?.name;
    };
    for (const name of ['size', 'kind', 'locked']) expect(top(name), name).toBe('SelectInput');
    // An open union is a json field: it must not resolve to an empty select.
    expect(top('status')).not.toBe('SelectInput');
  });

  it('explains renderer resolution', () => {
    const scores = registry.explain(mockField({ zodType: 'string' }), { mode: 'cell' });
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0]).toHaveProperty('score');
    expect(scores[0]).toHaveProperty('name');
  });

  it('prefers currency renderer over number for currency fields', () => {
    const field = mockField({ zodType: 'number', displayFormat: 'currency' } as any);
    const scores = registry.explain(field, { mode: 'cell' });
    const topScorer = scores[0];
    expect(topScorer.name).toContain('Currency');
  });
});
