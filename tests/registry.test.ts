import { describe, it, expect } from 'vitest';
import { createRendererRegistry } from '@zodal/ui';
import { createVanillaRegistry, formFieldAffordance, tagInput, chipFilter, chipCell } from '../src/index.js';
import type { VanillaRenderer } from '../src/index.js';
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
    for (const zodType of ['object', 'set', 'bigint', 'unknown_type']) {
      expect(top(zodType, 'form')).toBe('ReadOnlyInput (fallback)');
    }
    expect(top('array', 'form')).toBe('TagInput');
    for (const zodType of ['object', 'set', 'array', 'unknown_type']) {
      expect(registry.resolve(mockField({ zodType, filterable: 'exact' } as any), { mode: 'filter' })).toBeNull();
    }
    expect(top('bigint', 'filter')).toBe('TextFilter (fallback)');
    expect(top('string', 'filter')).toBe('TextFilter (fallback)');
    expect(top('string', 'form')).toBe('TextInput');
  });

  it('picks SelectInput from the form config widget, whatever the zodType (#14)', () => {
    const top = (zodType: string, type: string, filterable: unknown) =>
      registry.explain(formFieldAffordance(mockField({ zodType, filterable } as any), { type }), { mode: 'form' })[0]?.name;
    // A literal whose filterable was overridden is still a select; an open union (json) never is.
    expect(top('literal', 'select', 'exact')).toBe('SelectInput');
    expect(top('union', 'select', 'select')).toBe('SelectInput');
    expect(top('union', 'json', 'select')).not.toBe('SelectInput');
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

describe('tag renderers in the registry', () => {
  const registry = createVanillaRegistry();
  const TAG_ENTRIES = new Set(['TagInput', 'ChipFilter']);
  // The registry as it was before the tag renderers (ArrayCell keeps its name and tester).
  const legacy = createRendererRegistry<VanillaRenderer>();
  for (const entry of registry.entries) if (!TAG_ENTRIES.has(entry.name!)) legacy.register(entry);

  // Every field type zodal infers, with the `filterable` its type defaults give.
  const FIELD_TYPES: Array<[string, unknown]> = [
    ['string', 'search'], ['number', 'range'], ['int', 'range'], ['float', 'range'], ['bigint', 'range'],
    ['boolean', 'boolean'], ['enum', 'select'], ['date', 'range'], ['object', false], ['record', false],
    ['set', 'contains'], ['tuple', 'contains'], ['unknown', false],
  ];
  const MODES = ['cell', 'form', 'filter'] as const;
  /** The winning renderer's name, or null when nothing matches (`resolve` returns null). */
  const winner = (f: ResolvedFieldAffordance, mode: (typeof MODES)[number]) => {
    const top = registry.explain(f, { mode })[0];
    return top && top.score >= 0 ? top.name : null;
  };

  it('changes no winner for any non-array field', () => {
    for (const [zodType, filterable] of FIELD_TYPES) {
      for (const mode of MODES) {
        const field = mockField({ zodType, filterable } as any);
        expect(registry.resolve(field, { mode }), `${zodType} / ${mode}`).toBe(legacy.resolve(field, { mode }));
      }
    }
  });

  it('resolves the expected renderers for every field type', () => {
    const table = Object.fromEntries(FIELD_TYPES.map(([zodType, filterable]) => {
      const field = mockField({ zodType, filterable } as any);
      return [zodType, MODES.map((mode) => winner(field, mode))];
    }));
    // Each fallback stays in its own mode (#2): no form/filter renderer → ReadOnlyInput / none.
    expect(table).toEqual({
      string: ['TextCell', 'TextInput', 'TextFilter'],
      number: ['NumberCell', 'NumberInput', 'RangeFilter'],
      int: ['NumberCell', 'NumberInput', 'RangeFilter'],
      float: ['NumberCell', 'NumberInput', 'RangeFilter'],
      bigint: ['TextCell (fallback)', 'ReadOnlyInput (fallback)', 'RangeFilter'],
      boolean: ['BooleanCell', 'CheckboxInput', 'BooleanFilter'],
      enum: ['BadgeCell', 'SelectInput', 'SelectFilter'],
      date: ['DateCell', 'DateInput', 'RangeFilter'],
      object: ['TextCell (fallback)', 'ReadOnlyInput (fallback)', null],
      record: ['TextCell (fallback)', 'ReadOnlyInput (fallback)', null],
      set: ['TextCell (fallback)', 'ReadOnlyInput (fallback)', null],
      tuple: ['TextCell (fallback)', 'ReadOnlyInput (fallback)', null],
      unknown: ['TextCell (fallback)', 'ReadOnlyInput (fallback)', null],
    });
  });

  it('resolves the chip renderers for an array field', () => {
    const field = mockField({ zodType: 'array', filterable: 'contains' } as any);
    expect(MODES.map((mode) => winner(field, mode))).toEqual(['ArrayCell', 'TagInput', 'ChipFilter']);
    expect(registry.resolve(field, { mode: 'form' })).toBe(tagInput);
    expect(registry.resolve(field, { mode: 'filter' })).toBe(chipFilter);
    expect(registry.resolve(field, { mode: 'cell' })).toBe(chipCell);
  });

  it('keys the chip filter on contains over an array, not on a string', () => {
    const substring = mockField({ zodType: 'string', filterable: 'contains' } as any);
    expect(winner(substring, 'filter')).not.toBe('ChipFilter');
    expect(registry.resolve(substring, { mode: 'filter' })).toBe(legacy.resolve(substring, { mode: 'filter' }));
    expect(winner(mockField({ zodType: 'array', filterable: 'multiSelect' } as any), 'filter')).toBe('MultiSelectFilter');
  });

  it('respects editWidget: another widget declared on an array, or tags asked for on any field', () => {
    expect(winner(mockField({ zodType: 'array', editWidget: 'json' } as any), 'form')).not.toBe('TagInput');
    expect(winner(mockField({ zodType: 'string', editWidget: 'tags' } as any), 'form')).toBe('TagInput');
  });
});
