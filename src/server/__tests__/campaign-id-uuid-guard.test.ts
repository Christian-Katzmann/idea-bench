/**
 * F-002 regression: the campaign-by-id route used to hand non-UUID strings
 * straight to Postgres, which threw an "invalid input syntax for uuid" error
 * that surfaced as a 500. The route now pre-checks the shape and answers
 * 404 for anything that can't be a UUID. This test pins the guard so a
 * future cleanup can't accidentally widen the accepted shape.
 */
import { describe, expect, it } from 'vitest';

import { isLikelyUuid } from '../../../api/campaigns/[id]/index.js';

describe('isLikelyUuid', () => {
  it('accepts canonical v4 uuids', () => {
    expect(isLikelyUuid('11111111-2222-4333-8444-555555555555')).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(isLikelyUuid('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE')).toBe(true);
  });

  it('rejects free-form slugs from stale links', () => {
    expect(isLikelyUuid('not-a-real-campaign')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isLikelyUuid('')).toBe(false);
  });

  it('rejects strings that contain a uuid but include extra characters', () => {
    expect(
      isLikelyUuid('11111111-2222-4333-8444-555555555555-leak'),
    ).toBe(false);
  });

  it('rejects strings missing the version nibble', () => {
    // Position 13 must be 1-5; using 0 means it isn't a standard uuid.
    expect(isLikelyUuid('11111111-2222-0333-8444-555555555555')).toBe(false);
  });
});
