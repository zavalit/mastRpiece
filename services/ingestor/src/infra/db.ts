/**
 * @fileoverview PostgreSQL database infrastructure for the ingestor
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
 * Execute multiple statements in a transaction
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
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

/**
 * Batch insert using parameterized VALUES
 * Returns the number of rows inserted
 */
export async function batchInsert(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][]
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const placeholders: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const row of rows) {
    const rowPlaceholders: string[] = [];
    for (const value of row) {
      rowPlaceholders.push(`$${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    placeholders.push(`(${rowPlaceholders.join(', ')})`);
  }

  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES ${placeholders.join(', ')}
  `;

  const result = await client.query(sql, values);
  return result.rowCount ?? 0;
}

/**
 * Batch upsert using ON CONFLICT
 */
export async function batchUpsert(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflictColumn: string,
  updateColumns: string[]
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const placeholders: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const row of rows) {
    const rowPlaceholders: string[] = [];
    for (const value of row) {
      rowPlaceholders.push(`$${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    placeholders.push(`(${rowPlaceholders.join(', ')})`);
  }

  const updateSetClauses = updateColumns.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (${conflictColumn}) 
    DO UPDATE SET ${updateSetClauses}
  `;

  const result = await client.query(sql, values);
  // PostgreSQL doesn't distinguish between insert and update in rowCount for upserts
  // We'll track this separately in the calling code
  return { inserted: result.rowCount ?? 0, updated: 0 };
}
