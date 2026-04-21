/**
 * CI guard: every entry in AVAILABLE_MODELS must declare a family.
 * Families drive the cross-family exclusion rule in simulated-run panel
 * assembly — a missing family silently disables that protection for
 * whichever model omits it. The test is cheap insurance against the
 * "new provider shipped, forgot to update family map" failure mode
 * called out in Plan 02's risk list.
 */
import { describe, it, expect } from 'vitest';
import { AVAILABLE_MODELS, familyOf, type ModelFamily } from '../../lib/models.js';

const VALID_FAMILIES = new Set<ModelFamily>([
  'anthropic',
  'openai',
  'google',
  'meta',
  'deepseek',
]);

describe('model catalog family metadata', () => {
  it('every catalog entry declares a family', () => {
    for (const m of AVAILABLE_MODELS) {
      expect(
        m.family,
        `model ${m.providerModelId} is missing family`,
      ).toBeTruthy();
    }
  });

  it('every declared family is in the valid set', () => {
    for (const m of AVAILABLE_MODELS) {
      expect(
        VALID_FAMILIES.has(m.family),
        `model ${m.providerModelId} has unknown family '${m.family}'`,
      ).toBe(true);
    }
  });

  it('familyOf returns the declared family for known ids', () => {
    for (const m of AVAILABLE_MODELS) {
      expect(familyOf(m.providerModelId)).toBe(m.family);
    }
  });

  it('familyOf returns null for unknown ids', () => {
    expect(familyOf('unknown/model-x')).toBeNull();
  });
});
