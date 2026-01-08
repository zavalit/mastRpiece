/**
 * @fileoverview PostgreSQL connection pool for builder service
 */

import pg from 'pg';
import type { DbConfig } from '../types.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Initialize the connection pool
 */
export function initPool(config: DbConfig): void {
  if (pool) {
    throw new Error('Pool already initialized');
  }
  pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: 10,
  });
}

/**
 * Get the connection pool
 */
export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Pool not initialized. Call initPool first.');
  }
  return pool;
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Execute a query with the pool
 */
export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const p = getPool();
  return p.query<T>(text, params);
}

/**
 * Execute a transaction
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const p = getPool();
  const client = await p.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
