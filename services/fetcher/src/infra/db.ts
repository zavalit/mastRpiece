/**
 * @fileoverview PostgreSQL database infrastructure for the fetcher
 */

import pg from 'pg';
import type { DatabaseConfig } from '../config.js';

const { Pool } = pg;

export type PoolType = InstanceType<typeof Pool>;
export type PoolClient = pg.PoolClient;

let pool: PoolType | null = null;

/**
 * Initialize the database connection pool
 */
export function initPool(config: DatabaseConfig): PoolType {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: config.maxConnections,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err: Error) => {
    console.error('Unexpected database pool error:', err);
  });

  return pool;
}

/**
 * Get the current pool instance
 */
export function getPool(): PoolType {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initPool first.');
  }
  return pool;
}

/**
 * Close the database pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Execute a query with parameters
 */
export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<pg.QueryResult<T>> {
  const p = getPool();
  return p.query<T>(sql, params);
}

/**
 * Lock key for bulk fetch operations
 */
const BULK_FETCH_LOCK_KEY = 'bulk-fetch';

/**
 * Try to acquire an advisory lock for bulk fetch
 * Returns true if lock acquired, false if another process holds it
 */
export async function tryAcquireFetchLock(): Promise<boolean> {
  const result = await query<{ pg_try_advisory_lock: boolean }>(
    `SELECT pg_try_advisory_lock(hashtext($1))`,
    [BULK_FETCH_LOCK_KEY]
  );
  return result.rows[0]?.pg_try_advisory_lock ?? false;
}

/**
 * Release the advisory lock for bulk fetch
 */
export async function releaseFetchLock(): Promise<void> {
  await query(`SELECT pg_advisory_unlock(hashtext($1))`, [BULK_FETCH_LOCK_KEY]);
}

/**
 * Check if a dataset with given SHA256 was already successfully fetched
 */
export async function isAlreadyFetched(sha256: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM fetch_runs WHERE sha256 = $1 AND status = 'success'`,
    [sha256]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
}

/**
 * Get the last successful fetch run
 */
export async function getLastSuccessfulFetch(): Promise<{
  sha256: string;
  portal_last_updated_at: Date | null;
} | null> {
  const result = await query<{
    sha256: string;
    portal_last_updated_at: Date | null;
  }>(
    `SELECT sha256, portal_last_updated_at FROM fetch_runs 
     WHERE status = 'success' 
     ORDER BY finished_at DESC 
     LIMIT 1`
  );
  return result.rows[0] ?? null;
}
