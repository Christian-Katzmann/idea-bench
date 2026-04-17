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
  it('stays within the Vercel Hobby function limit', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const repoRoot = path.resolve(path.dirname(thisFile), '../../..');
    const apiDir = path.join(repoRoot, 'api');

    const entrypoints = collectApiEntrypoints(apiDir);

    expect(entrypoints.length).toBeLessThanOrEqual(12);
  });
});
