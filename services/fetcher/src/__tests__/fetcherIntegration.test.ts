/**
 * @fileoverview Integration tests for the fetcher database interactions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { 
  initPool, 
  closePool, 
  query, 
  tryAcquireFetchLock, 
  releaseFetchLock,
  isAlreadyFetched 
} from '../../src/infra/db.js';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('Fetcher Database Integration', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    // Start Postgres container
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('energy')
      .withUsername('energy')
      .withPassword('energy')
      .start();

    // Initialize pool
    initPool({
      host: container.getHost(),
      port: container.getPort(),
      user: 'energy',
      password: 'energy',
      database: 'energy',
      maxConnections: 5,
    });

    // Run migrations
    const migrationsDir = resolve(__dirname, '../../../../db/migrations');
    const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();
    
    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), 'utf-8');
      await query(sql);
    }
  }, 120000); // 2 min timeout for container startup

  afterAll(async () => {
    await closePool();
    if (container) {
      await container.stop();
    }
  });

  describe('Advisory Locks', () => {
    it('should acquire and release fetch lock correctly between sessions', async () => {
      const { getPool } = await import('../../src/infra/db.js');
      const pool = getPool();
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        const lockKey = 'test-lock-' + randomUUID();
        
        const res1 = await client1.query(`SELECT pg_try_advisory_lock(hashtext($1))`, [lockKey]);
        expect(res1.rows[0].pg_try_advisory_lock).toBe(true);

        const res2 = await client2.query(`SELECT pg_try_advisory_lock(hashtext($1))`, [lockKey]);
        expect(res2.rows[0].pg_try_advisory_lock).toBe(false);

        await client1.query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]);

        const res3 = await client2.query(`SELECT pg_try_advisory_lock(hashtext($1))`, [lockKey]);
        expect(res3.rows[0].pg_try_advisory_lock).toBe(true);
      } finally {
        client1.release();
        client2.release();
      }
    });
  });

  describe('Fetch Runs Tracking', () => {
    it('should track fetch status and deduplicate', async () => {
      const runId = randomUUID();
      const sha256 = 'mock-sha256-' + randomUUID();

      // Initially not fetched
      const alreadyFetched = await isAlreadyFetched(sha256);
      expect(alreadyFetched).toBe(false);

      // Insert a successful run
      await query(
        `INSERT INTO fetch_runs (run_id, started_at, finished_at, status, sha256) 
         VALUES ($1, now(), now(), 'success', $2)`,
        [runId, sha256]
      );

      // Now it should be fetched
      const fetchedNow = await isAlreadyFetched(sha256);
      expect(fetchedNow).toBe(true);
    });
  });
}, 120000);
