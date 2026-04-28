/**
 * Plan 06 P0-A drift remediation — shape test for the curated starter
 * persona library. The seeder script (`scripts/seed-starter-personas.ts`)
 * validates the same fields at runtime; this test catches edits to
 * `data/starter-personas.json` before they reach a deploy.
 *
 * No DB connection — pure JSON validation. Runs in the standard test
 * suite so editing the library file without breaking field shape is a
 * cheap iteration loop.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DATA_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'starter-personas.json',
);

interface StarterPersona {
  name: string;
  description: string;
  systemPrompt: string;
  priorities: string[];
  antiPatterns: string[];
  tags: string[];
}

function loadStarters(): unknown[] {
  const raw = readFileSync(DATA_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('starter-personas.json must be a JSON array');
  }
  return parsed;
}

describe('data/starter-personas.json', () => {
  const starters = loadStarters();

  it('contains at least one persona', () => {
    expect(starters.length).toBeGreaterThan(0);
  });

  it('every entry has the required string fields', () => {
    for (const [i, raw] of starters.entries()) {
      expect(typeof raw, `entry ${i}`).toBe('object');
      const p = raw as Record<string, unknown>;
      expect(typeof p.name, `entry ${i}.name`).toBe('string');
      expect((p.name as string).length, `entry ${i}.name length`).toBeGreaterThan(0);
      expect(typeof p.description, `entry ${i}.description`).toBe('string');
      expect((p.description as string).length, `entry ${i}.description length`).toBeGreaterThan(0);
      expect(typeof p.systemPrompt, `entry ${i}.systemPrompt`).toBe('string');
      expect((p.systemPrompt as string).length, `entry ${i}.systemPrompt length`).toBeGreaterThan(0);
    }
  });

  it('every entry has tags / priorities / antiPatterns as string[] (possibly empty)', () => {
    for (const [i, raw] of starters.entries()) {
      const p = raw as StarterPersona;
      expect(Array.isArray(p.priorities), `entry ${i}.priorities`).toBe(true);
      for (const x of p.priorities) {
        expect(typeof x, `entry ${i}.priorities item`).toBe('string');
      }
      expect(Array.isArray(p.antiPatterns), `entry ${i}.antiPatterns`).toBe(true);
      for (const x of p.antiPatterns) {
        expect(typeof x, `entry ${i}.antiPatterns item`).toBe('string');
      }
      expect(Array.isArray(p.tags), `entry ${i}.tags`).toBe(true);
      for (const x of p.tags) {
        expect(typeof x, `entry ${i}.tags item`).toBe('string');
      }
    }
  });

  it('persona names are unique (the seeder uses name as the idempotency key)', () => {
    const names = (starters as StarterPersona[]).map((p) => p.name);
    const unique = new Set(names);
    expect(unique.size, 'duplicate persona names found').toBe(names.length);
  });

  it("system prompts don't include the literal '{{input}}' template token", () => {
    // Personas judge generation outputs — they're not user-prompt
    // templates. Catching this early prevents accidental copy-paste
    // from a Plan 05 prompt-arena variant.
    for (const [i, raw] of starters.entries()) {
      const p = raw as StarterPersona;
      expect(
        p.systemPrompt.includes('{{input}}'),
        `entry ${i}.systemPrompt has stray {{input}} token`,
      ).toBe(false);
    }
  });
});
