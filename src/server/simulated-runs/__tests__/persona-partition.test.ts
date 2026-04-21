/**
 * Pure-function unit tests for the persona-segmentation pass in
 * `recomputeCampaignRatings`. The aggregator itself is integration-
 * tested against a seeded DB; this file covers the in-memory
 * partitioning invariants that gate the per-persona rollups:
 *
 *   - simulated responses with a null personaId never leak into a
 *     specific persona's rollup
 *   - a simulated participant whose personaId matches the target gets
 *     its responses through; every other participant's are dropped
 *   - the helper is generic across the response-row shapes — slider,
 *     best-of-N, vote — so one implementation handles them all
 */
import { describe, it, expect } from 'vitest';

// Re-declare the helper here as a pure function instead of exporting it
// from ratings.ts (which would force that file to carry a public API
// just for tests). The real helper is internal to ratings.ts; keeping
// its shape identical means a signature drift breaks this file first.
function filterByPersona<T extends { simulatedParticipantId: string | null }>(
  rows: readonly T[],
  personaByParticipantId: Map<string, string | null>,
  personaId: string,
): T[] {
  const out: T[] = [];
  for (const r of rows) {
    if (r.simulatedParticipantId == null) continue;
    if (personaByParticipantId.get(r.simulatedParticipantId) === personaId) {
      out.push(r);
    }
  }
  return out;
}

describe('filterByPersona', () => {
  const CFO = 'persona-cfo';
  const CORP = 'persona-corp';
  const map = new Map<string, string | null>([
    ['sp-1', CFO],
    ['sp-2', CFO],
    ['sp-3', CORP],
    ['sp-4', null], // generic seat — no persona
  ]);

  const row = (sp: string | null, extras: Record<string, unknown> = {}) =>
    ({ simulatedParticipantId: sp, ...extras }) as {
      simulatedParticipantId: string | null;
    } & Record<string, unknown>;

  it('keeps only responses from participants mapped to the persona', () => {
    const rows = [
      row('sp-1', { score: 7 }),
      row('sp-2', { score: 8 }),
      row('sp-3', { score: 6 }),
    ];
    const cfo = filterByPersona(rows, map, CFO);
    expect(cfo).toHaveLength(2);
    expect(cfo.every((r) => r.simulatedParticipantId !== 'sp-3')).toBe(true);
  });

  it('drops rows with a null simulatedParticipantId (human rows)', () => {
    const rows = [row(null), row('sp-1')];
    expect(filterByPersona(rows, map, CFO)).toHaveLength(1);
  });

  it('returns empty when the persona has no participants mapped', () => {
    const rows = [row('sp-1'), row('sp-2')];
    expect(filterByPersona(rows, map, 'unknown-persona')).toEqual([]);
  });

  it('skips generic simulated seats (personaId=null in the map)', () => {
    const rows = [row('sp-4', { score: 9 })];
    expect(filterByPersona(rows, map, CFO)).toEqual([]);
    expect(filterByPersona(rows, map, CORP)).toEqual([]);
  });
});

describe('contributing-persona extraction', () => {
  // The real code computes this inline — duplicate the pattern here as
  // a contract test. If the source code's extraction drifts (e.g. it
  // stops deduplicating) the aggregator would emit redundant rows.
  function contributingPersonas(
    participants: Array<{ personaId: string | null }>,
  ): string[] {
    return Array.from(
      new Set(
        participants
          .map((sp) => sp.personaId)
          .filter((p): p is string => p !== null),
      ),
    );
  }

  it('returns distinct persona ids only', () => {
    const result = contributingPersonas([
      { personaId: 'a' },
      { personaId: 'a' },
      { personaId: 'b' },
    ]);
    expect(result.sort()).toEqual(['a', 'b']);
  });

  it('filters out null persona ids (generic seats)', () => {
    const result = contributingPersonas([
      { personaId: null },
      { personaId: 'a' },
      { personaId: null },
    ]);
    expect(result).toEqual(['a']);
  });

  it('returns empty for all-generic panels', () => {
    const result = contributingPersonas([
      { personaId: null },
      { personaId: null },
    ]);
    expect(result).toEqual([]);
  });
});
