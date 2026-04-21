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
   * comment with why.
   *
   * Budget history:
   *   14  pre-Plan-02
   *   15  +3 Phase 1 simulated-runs (consolidated via [id]/[action])
   *   17  +2 Phase 2 personas (list/create, [id] CRUD)
   *   12  -5 Plan 02 deploy: simulated-runs + personas each collapsed
   *        into a single [[...path]].ts catch-all dispatcher so prod
   *        fits under Vercel Hobby's 12-function ceiling. The Vite dev
   *        API plugin (src/server/vite-api-plugin.ts) also learned to
   *        route [[...path]] patterns to match.
   */
  it('stays within the configured function-count budget', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const repoRoot = path.resolve(path.dirname(thisFile), '../../..');
    const apiDir = path.join(repoRoot, 'api');

    const entrypoints = collectApiEntrypoints(apiDir);

    expect(entrypoints.length).toBeLessThanOrEqual(12);
  });
});
