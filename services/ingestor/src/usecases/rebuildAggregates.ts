/**
 * @fileoverview Rebuild aggregate tables from canonical data
 */

import { getPool } from '../infra/db.js';

/**
 * Rebuild all aggregate tables
 * Uses TRUNCATE + INSERT for MVP simplicity
 */
export async function rebuildAggregates(): Promise<void> {
  const pool = getPool();

  console.error(
    JSON.stringify({
      level: 'info',
      msg: 'Starting aggregate rebuild',
    })
  );

  const startTime = Date.now();

  // Use a transaction for consistency
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Rebuild agg_commissioning_day
    await client.query('TRUNCATE TABLE agg_commissioning_day');
    await client.query(`
      INSERT INTO agg_commissioning_day (day, tech, bundesland_code, count_units, sum_brutto_kw, sum_netto_kw)
      SELECT 
        commissioning_date as day,
        tech,
        COALESCE(bundesland_code, '') as bundesland_code,
        COUNT(*) as count_units,
        COALESCE(SUM(brutto_kw), 0) as sum_brutto_kw,
        COALESCE(SUM(netto_kw), 0) as sum_netto_kw
      FROM units
      WHERE commissioning_date IS NOT NULL
      GROUP BY commissioning_date, tech, COALESCE(bundesland_code, '')
    `);

    // Rebuild agg_first_seen_day
    await client.query('TRUNCATE TABLE agg_first_seen_day');
    await client.query(`
      INSERT INTO agg_first_seen_day (day, tech, bundesland_code, count_units, sum_brutto_kw, sum_netto_kw)
      SELECT 
        first_seen_export_date as day,
        tech,
        COALESCE(bundesland_code, '') as bundesland_code,
        COUNT(*) as count_units,
        COALESCE(SUM(brutto_kw), 0) as sum_brutto_kw,
        COALESCE(SUM(netto_kw), 0) as sum_netto_kw
      FROM units
      GROUP BY first_seen_export_date, tech, COALESCE(bundesland_code, '')
    `);

    await client.query('COMMIT');

    const duration = Date.now() - startTime;

    console.error(
      JSON.stringify({
        level: 'info',
        msg: 'Aggregate rebuild completed',
        duration_ms: duration,
      })
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get aggregate statistics for verification
 */
export async function getAggregateStats(): Promise<{
  commissioningDayRows: number;
  firstSeenDayRows: number;
}> {
  const pool = getPool();

  const [commResult, firstSeenResult] = await Promise.all([
    pool.query<{ count: string }>('SELECT COUNT(*) as count FROM agg_commissioning_day'),
    pool.query<{ count: string }>('SELECT COUNT(*) as count FROM agg_first_seen_day'),
  ]);

  return {
    commissioningDayRows: parseInt(commResult.rows[0]?.count ?? '0', 10),
    firstSeenDayRows: parseInt(firstSeenResult.rows[0]?.count ?? '0', 10),
  };
}
