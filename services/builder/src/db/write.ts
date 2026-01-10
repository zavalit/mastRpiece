import type { Pool, PoolClient } from 'pg';
import type { DbClient } from '../types.js';

const STORY_TABLES: Record<string, string[]> = {
  storageWave: ['story_storage_day_region'],
  solarWave: ['story_solar_day_region'],
  storageColocation: ['story_storage_colocation_month'],
  registrationLag: ['story_registration_lag_month'],
  solarLocations: ['story_solar_locations'],
};

/**
 * Delete data for a specific export snapshot and specific stories
 */
export async function deleteStorySnapshot(
  client: DbClient,
  exportDate: string,
  stories?: string[]
): Promise<void> {
  let tablesToDelete: string[] = [];

  if (stories && stories.length > 0) {
    // Collect tables for requested stories
    for (const story of stories) {
      const tables = STORY_TABLES[story];
      if (tables) {
        tablesToDelete.push(...tables);
      }
    }
    // solarLocations is special - it's a helper for colocation
    if (stories.includes('storageColocation')) {
      tablesToDelete.push(...STORY_TABLES['solarLocations']!);
    }
  } else {
    // Delete all known story tables if no list provided
    tablesToDelete = Object.values(STORY_TABLES).flat();
  }

  // Remove duplicates
  tablesToDelete = [...new Set(tablesToDelete)];

  for (const table of tablesToDelete) {
    await client.query(`DELETE FROM ${table} WHERE export_date = $1`, [exportDate]);
  }
}

/**
 * Bulk insert rows into a table
 */
export async function bulkInsert<T extends Record<string, unknown>>(
  client: DbClient,
  table: string,
  columns: string[],
  rows: T[],
  batchSize = 1000
): Promise<number> {
  if (rows.length === 0) return 0;

  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const row of batch) {
      const rowPlaceholders: string[] = [];
      for (const col of columns) {
        rowPlaceholders.push(`$${paramIndex}`);
        values.push(row[col]);
        paramIndex++;
      }
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${placeholders.join(', ')}
    `;

    await client.query(sql, values);
    inserted += batch.length;
  }

  return inserted;
}

/**
 * Upsert location core records (for opportunistic population)
 */
export async function upsertLocationCore(
  client: DbClient,
  records: Array<{ location_id: string; ags: string | null; plz: string | null; bundesland_ags: string | null }>
): Promise<number> {
  if (records.length === 0) return 0;

  const placeholders: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const rec of records) {
    placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
    values.push(rec.location_id, rec.ags, rec.plz, rec.bundesland_ags);
    paramIndex += 4;
  }

  const sql = `
    INSERT INTO location_core (location_id, ags, plz, bundesland_ags)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (location_id) DO UPDATE SET
      ags = COALESCE(EXCLUDED.ags, location_core.ags),
      plz = COALESCE(EXCLUDED.plz, location_core.plz),
      bundesland_ags = COALESCE(EXCLUDED.bundesland_ags, location_core.bundesland_ags)
  `;

  const result = await client.query(sql, values);
  return result.rowCount ?? 0;
}
