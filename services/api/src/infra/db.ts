/**
 * @fileoverview PostgreSQL database infrastructure for the API
 */

import pg from 'pg';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';

dotenvConfig({ path: resolve(process.cwd(), '.env') });

const { Pool } = pg;

export type PoolType = InstanceType<typeof Pool>;

let pool: PoolType | null = null;

/**
 * Initialize the database connection pool
 */
export function initPool(): PoolType {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: parseInt(process.env['POSTGRES_PORT'] ?? '5432', 10),
    user: process.env['POSTGRES_USER'] ?? 'energy',
    password: process.env['POSTGRES_PASSWORD'] ?? 'energy',
    database: process.env['POSTGRES_DB'] ?? 'energy',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
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
