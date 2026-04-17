export const REQUIRED_PUBLIC_TABLES = [
  'campaign_models',
  'campaigns',
  'generations',
  'model_registry',
  'participants',
  'prompts',
  'ratings',
  'tournaments',
  'votes',
] as const;

export interface DatabasePreflightInput {
  existingTables: readonly string[];
  hasMigrationsTable: boolean;
  appliedMigrationCount: number;
  migrationFiles: readonly string[];
}

export interface DatabasePreflightResult {
  ok: boolean;
  missingTables: string[];
  pendingMigrationCount: number;
  messages: string[];
}

export function evaluateDatabasePreflight(
  input: DatabasePreflightInput,
): DatabasePreflightResult {
  const existing = new Set(input.existingTables);
  const missingTables = REQUIRED_PUBLIC_TABLES.filter((table) => !existing.has(table));
  const pendingMigrationCount = Math.max(
    input.migrationFiles.length - input.appliedMigrationCount,
    0,
  );
  const messages: string[] = [];

  if (!input.hasMigrationsTable) {
    messages.push(
      'Drizzle migration tracking is missing. Run `npm run db:migrate` before deploying.',
    );
  }

  if (missingTables.length > 0) {
    messages.push(
      `Missing required tables: ${missingTables.join(', ')}. Run \`npm run db:migrate\`.`,
    );
  }

  if (pendingMigrationCount > 0) {
    messages.push(
      `${pendingMigrationCount} pending migration${pendingMigrationCount === 1 ? '' : 's'} detected. Run \`npm run db:migrate\`.`,
    );
  }

  return {
    ok: messages.length === 0,
    missingTables: [...missingTables],
    pendingMigrationCount,
    messages,
  };
}
