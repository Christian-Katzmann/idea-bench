import { sql } from 'drizzle-orm';
import { AVAILABLE_MODELS } from '../../lib/models.js';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';

export interface RegistryCatalogEntry {
  providerModelId: string;
  displayName: string;
  legacy?: boolean;
}

export interface RegistryFlags {
  enabled: boolean;
  legacy: boolean;
}

export interface RegistryDraftRow extends RegistryFlags {
  providerModelId: string;
  displayName: string;
}

export interface RegistryRow extends RegistryDraftRow {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function selectableRegistryModels<
  T extends { enabled: boolean; legacy: boolean },
>(rows: T[]): T[] {
  return rows.filter((row) => row.enabled && !row.legacy);
}

export function mergeCatalogIntoRegistry(
  catalog: RegistryCatalogEntry[],
  existing: Array<Pick<RegistryDraftRow, 'providerModelId' | 'displayName' | 'enabled' | 'legacy'>>,
): RegistryDraftRow[] {
  const existingById = new Map(
    existing.map((row) => [row.providerModelId, row]),
  );

  return catalog.map((entry) => {
    const prior = existingById.get(entry.providerModelId);
    return {
      providerModelId: entry.providerModelId,
      displayName: entry.displayName,
      enabled: prior?.enabled ?? true,
      legacy: prior?.legacy ?? !!entry.legacy,
    };
  });
}

export async function syncModelRegistry(
  db: ReturnType<typeof getDb>,
): Promise<RegistryRow[]> {
  const existing = await db
    .select({
      id: schema.modelRegistry.id,
      providerModelId: schema.modelRegistry.providerModelId,
      displayName: schema.modelRegistry.displayName,
      enabled: schema.modelRegistry.enabled,
      legacy: schema.modelRegistry.legacy,
      createdAt: schema.modelRegistry.createdAt,
      updatedAt: schema.modelRegistry.updatedAt,
    })
    .from(schema.modelRegistry);

  const merged = mergeCatalogIntoRegistry([...AVAILABLE_MODELS], existing);
  const now = new Date();

  if (merged.length > 0) {
    await db
      .insert(schema.modelRegistry)
      .values(
        merged.map((row) => ({
          ...row,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: schema.modelRegistry.providerModelId,
        set: {
          displayName: sql`excluded.display_name`,
          updatedAt: now,
        },
      });
  }

  const rows = await db
    .select({
      id: schema.modelRegistry.id,
      providerModelId: schema.modelRegistry.providerModelId,
      displayName: schema.modelRegistry.displayName,
      enabled: schema.modelRegistry.enabled,
      legacy: schema.modelRegistry.legacy,
      createdAt: schema.modelRegistry.createdAt,
      updatedAt: schema.modelRegistry.updatedAt,
    })
    .from(schema.modelRegistry);

  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function listSelectableRegistryModels(
  db: ReturnType<typeof getDb>,
): Promise<RegistryRow[]> {
  return selectableRegistryModels(await syncModelRegistry(db));
}
