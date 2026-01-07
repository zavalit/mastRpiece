/**
 * @fileoverview Integration tests using testcontainers
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import pg from 'pg';
import Redis from 'ioredis';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { Pool } = pg;

describe('E2E Integration Tests', () => {
  let postgresContainer: StartedTestContainer;
  let redisContainer: StartedTestContainer;
  let dbPool: pg.Pool;
  let redisClient: Redis;
  let apiBaseUrl: string;

  beforeAll(async () => {
    // Start PostgreSQL container
    postgresContainer = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
      .start();

    // Start Redis container
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();

    const pgHost = postgresContainer.getHost();
    const pgPort = postgresContainer.getMappedPort(5432);
    const redisHost = redisContainer.getHost();
    const redisPort = redisContainer.getMappedPort(6379);

    // Set environment variables for services
    process.env['POSTGRES_HOST'] = pgHost;
    process.env['POSTGRES_PORT'] = String(pgPort);
    process.env['POSTGRES_USER'] = 'test';
    process.env['POSTGRES_PASSWORD'] = 'test';
    process.env['POSTGRES_DB'] = 'test';
    process.env['REDIS_URL'] = `redis://${redisHost}:${redisPort}`;

    // Create database pool
    dbPool = new Pool({
      host: pgHost,
      port: pgPort,
      user: 'test',
      password: 'test',
      database: 'test',
    });

    // Create Redis client
    redisClient = new Redis({
      host: redisHost,
      port: redisPort,
    });

    // Apply migrations
    await applyMigrations(dbPool);
  }, 120000);

  afterAll(async () => {
    await dbPool?.end();
    await redisClient?.quit();
    await postgresContainer?.stop();
    await redisContainer?.stop();
  });

  async function applyMigrations(pool: pg.Pool): Promise<void> {
    const migrationsDir = resolve(process.cwd(), 'db', 'migrations');
    const migrations = ['001_init.sql', '002_indexes.sql', '003_aggregates.sql'];

    for (const filename of migrations) {
      const sql = await readFile(resolve(migrationsDir, filename), 'utf-8');
      await pool.query(sql);
    }
  }

  describe('Database Schema', () => {
    it('should have units table', async () => {
      const result = await dbPool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_name = 'units'`
      );
      expect(result.rows).toHaveLength(1);
    });

    it('should have ingest_runs table', async () => {
      const result = await dbPool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_name = 'ingest_runs'`
      );
      expect(result.rows).toHaveLength(1);
    });

    it('should have aggregate tables', async () => {
      const result = await dbPool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name IN ('agg_commissioning_day', 'agg_first_seen_day')`
      );
      expect(result.rows).toHaveLength(2);
    });
  });

  describe('Data Insertion', () => {
    it('should insert and query units', async () => {
      // Insert test unit
      await dbPool.query(
        `INSERT INTO units (
          unit_id, tech, commissioning_date, brutto_kw, netto_kw,
          bundesland_code, ags, plz, is_active,
          first_seen_export_date, last_seen_export_date, record_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          'TEST001',
          'solar',
          '2026-01-06',
          12.5,
          12.0,
          '08',
          '08111000',
          '70173',
          true,
          '2026-01-06',
          '2026-01-06',
          'testhash123',
        ]
      );

      // Query the unit
      const result = await dbPool.query<{ unit_id: string; tech: string }>(
        'SELECT unit_id, tech FROM units WHERE unit_id = $1',
        ['TEST001']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.tech).toBe('solar');
    });

    it('should insert and query aggregates', async () => {
      // Insert aggregate
      await dbPool.query(
        `INSERT INTO agg_commissioning_day (day, tech, bundesland_code, count_units, sum_brutto_kw, sum_netto_kw)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['2026-01-06', 'solar', '08', 1, 12.5, 12.0]
      );

      // Query aggregate
      const result = await dbPool.query<{ count_units: number }>(
        `SELECT count_units FROM agg_commissioning_day 
         WHERE day = $1 AND tech = $2`,
        ['2026-01-06', 'solar']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.count_units).toBe(1);
    });
  });

  describe('Redis Cache', () => {
    it('should set and get cache values', async () => {
      const key = 'test:key';
      const value = JSON.stringify({ test: 'value' });

      await redisClient.setex(key, 300, value);
      const cached = await redisClient.get(key);

      expect(cached).toBe(value);
    });
  });
});
