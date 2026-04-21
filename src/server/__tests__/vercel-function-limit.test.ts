import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function collectApiEntrypoints(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectApiEntrypoints(fullPath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!fullPath.endsWith('.ts')) continue;
    if (!statSync(fullPath).isFile()) continue;
    files.push(fullPath);
  }

  return files.sort();
}

describe('Vercel function entrypoints', () => {
  /**
   * The project deploys under a Vercel Team plan (see
   * .vercel/project.json — `orgId` prefix `team_`), which has no hard
   * function count limit. This test still caps the count so growth is
   * intentional: adding a new entrypoint should be a deliberate
   * decision, with a quick review for "can this live inside an
   * existing dispatcher instead". If you raise the limit, update this
   * comment with why. Budget includes the 14 entrypoints as of Plan 02
   * Phase 1 (+3 for simulated-runs create/list, detail, actions).
   */
  it('stays within the configured function-count budget', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const repoRoot = path.resolve(path.dirname(thisFile), '../../..');
    const apiDir = path.join(repoRoot, 'api');

    const entrypoints = collectApiEntrypoints(apiDir);

    expect(entrypoints.length).toBeLessThanOrEqual(15);
  });
});
