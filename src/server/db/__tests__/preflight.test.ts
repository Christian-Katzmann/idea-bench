import {
  evaluateDatabasePreflight,
  REQUIRED_PUBLIC_TABLES,
} from '../preflight';

describe('database preflight', () => {
  it('fails when required tables are missing and migrations are not tracked', () => {
    const result = evaluateDatabasePreflight({
      existingTables: REQUIRED_PUBLIC_TABLES.filter((table) => table !== 'model_registry'),
      hasMigrationsTable: false,
      appliedMigrationCount: 0,
      migrationFiles: ['0001_model_registry.sql'],
    });

    expect(result.ok).toBe(false);
    expect(result.missingTables).toContain('model_registry');
    expect(result.messages.join(' ')).toMatch(/db:migrate/i);
  });

  it('passes when required tables exist and all migrations are applied', () => {
    const result = evaluateDatabasePreflight({
      existingTables: REQUIRED_PUBLIC_TABLES,
      hasMigrationsTable: true,
      appliedMigrationCount: 1,
      migrationFiles: ['0001_model_registry.sql'],
    });

    expect(result.ok).toBe(true);
    expect(result.pendingMigrationCount).toBe(0);
  });
});
