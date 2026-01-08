/**
 * @fileoverview Bulk write utilities for story tables
 */

import type { Pool } from 'pg';

/**
 * Truncate story tables for a fresh rebuild
 */
export async function truncateStoryTables(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE 
      story_storage_day_region,
      story_solar_day_region,
      story_solar_locations,
      story_storage_colocation_month,
      story_registration_lag_month,
      story_storage_day_netzbetreiber
    CASCADE
  `);
}

/**
 * Bulk insert rows into a table
 */
export async function bulkInsert<T extends Record<string, unknown>>(
  pool: Pool,
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

    await pool.query(sql, values);
    inserted += batch.length;
  }

  return inserted;
}

/**
 * Upsert location core records (for opportunistic population)
 */
export async function upsertLocationCore(
  pool: Pool,
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

  const result = await pool.query(sql, values);
  return result.rowCount ?? 0;
}
