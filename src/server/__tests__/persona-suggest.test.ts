/**
 * Plan 06 P1-12 — tests for the persona pre-filter helper.
 *
 * The helper is pure: no DB, no network. We exercise the ranking and
 * tie-break behavior, the case-insensitive matching contract, and the
 * empty-input edges. The "personas without tags still surface" rule
 * is the load-bearing one — Plan 06's PRD calls it out specifically
 * (operators with no tagged personas otherwise see nothing).
 */
import { describe, it, expect } from 'vitest';
import { suggestPersonas } from '../simulated-runs/persona-suggest';
import type { Persona } from '../../lib/api';

const makePersona = (overrides: Partial<Persona> = {}): Persona => ({
  id: overrides.id ?? `p-${Math.random().toString(36).slice(2, 8)}`,
  name: 'Persona',
  description: '',
  systemPrompt: '',
  priorities: [],
  antiPatterns: [],
  tags: [],
  isStarter: true,
  derivedFromPersonaId: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  ...overrides,
});

describe('suggestPersonas', () => {
  it('ranks personas by tag-overlap with campaign categories (desc)', () => {
    const personas = [
      makePersona({ id: 'a', tags: ['legal'] }),
      makePersona({
        id: 'b',
        tags: ['brand-voice', 'corporate'],
      }),
      makePersona({
        id: 'c',
        tags: ['brand-voice', 'corporate', 'support'],
      }),
    ];
    const out = suggestPersonas({
      campaignCategories: ['brand-voice', 'corporate', 'support'],
      personas,
    });
    expect(out.map((s) => s.persona.id)).toEqual(['c', 'b', 'a']);
    expect(out.map((s) => s.matchCount)).toEqual([3, 2, 0]);
  });

  it('matches case-insensitively and trims whitespace', () => {
    const personas = [
      makePersona({ id: 'lower', tags: ['brand voice'] }),
      makePersona({ id: 'upper', tags: ['  Brand Voice '] }),
      makePersona({ id: 'mixed', tags: ['BRAND voice'] }),
    ];
    const out = suggestPersonas({
      campaignCategories: ['Brand Voice'],
      personas,
    });
    // All three score 1 — comparison normalizes both sides.
    for (const s of out) expect(s.matchCount).toBe(1);
  });

  it('returns ALL personas (matchCount=0) when no overlap exists', () => {
    // PRD: "personas without category tags should still appear in the
    // refine field — they just don't surface in the pre-filtered list.
    // Don't silently exclude them." This test pins down the
    // never-drop-rows contract.
    const personas = [
      makePersona({ id: 'a', tags: ['legal'] }),
      makePersona({ id: 'b', tags: [] }),
      makePersona({ id: 'c', tags: ['support'] }),
    ];
    const out = suggestPersonas({
      campaignCategories: ['marketing'],
      personas,
    });
    expect(out).toHaveLength(3);
    for (const s of out) expect(s.matchCount).toBe(0);
  });

  it('returns ALL personas with matchCount=0 when campaign has no categories', () => {
    const personas = [
      makePersona({ id: 'a', tags: ['legal'] }),
      makePersona({ id: 'b', tags: ['support'] }),
    ];
    const out = suggestPersonas({ campaignCategories: [], personas });
    expect(out).toHaveLength(2);
    for (const s of out) expect(s.matchCount).toBe(0);
  });

  it('returns an empty array when there are no personas', () => {
    const out = suggestPersonas({
      campaignCategories: ['anything'],
      personas: [],
    });
    expect(out).toEqual([]);
  });

  it('breaks ties by updatedAt (newest first)', () => {
    const personas = [
      makePersona({
        id: 'old',
        tags: ['x'],
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      makePersona({
        id: 'new',
        tags: ['x'],
        updatedAt: '2026-04-15T00:00:00.000Z',
      }),
      makePersona({
        id: 'mid',
        tags: ['x'],
        updatedAt: '2026-02-15T00:00:00.000Z',
      }),
    ];
    const out = suggestPersonas({
      campaignCategories: ['x'],
      personas,
    });
    expect(out.map((s) => s.persona.id)).toEqual(['new', 'mid', 'old']);
  });

  it('ignores empty / whitespace-only campaign categories', () => {
    const personas = [
      makePersona({ id: 'a', tags: ['brand-voice'] }),
      makePersona({ id: 'b', tags: [] }),
    ];
    const out = suggestPersonas({
      campaignCategories: ['', '   ', 'brand-voice'],
      personas,
    });
    // 'brand-voice' is the only effective category — first persona scores 1.
    const a = out.find((s) => s.persona.id === 'a')!;
    const b = out.find((s) => s.persona.id === 'b')!;
    expect(a.matchCount).toBe(1);
    expect(b.matchCount).toBe(0);
  });
});
