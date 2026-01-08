/**
 * @fileoverview Minimal SQL migration runner
 */

import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import pg from 'pg';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: resolve(process.cwd(), '.env') });

const { Pool } = pg;

const MIGRATIONS_DIR = resolve(process.cwd(), 'db', 'migrations');

interface Migration {
  version: string;
  filename: string;
  sql: string;
}

async function getMigrationFiles(): Promise<Migration[]> {
  const files = await readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const migrations: Migration[] = [];

  for (const filename of sqlFiles) {
    const version = filename.replace(/\.sql$/, '');
    const filepath = join(MIGRATIONS_DIR, filename);
    const sql = await readFile(filepath, 'utf-8');
    migrations.push({ version, filename, sql });
  }

  return migrations;
}

async function getAppliedMigrations(pool: pg.Pool): Promise<Set<string>> {
  try {
    const result = await pool.query<{ version: string }>(
      'SELECT version FROM schema_migrations'
    );
    return new Set(result.rows.map((r) => r.version));
  } catch (error) {
    // Table doesn't exist yet, will be created by first migration
    return new Set();
  }
}

async function applyMigration(
  pool: pg.Pool,
  migration: Migration
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Execute the migration SQL
    await client.query(migration.sql);

    // Record the migration
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
      [migration.version]
    );

    await client.query('COMMIT');

    console.log(`✓ Applied migration: ${migration.filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✗ Failed migration: ${migration.filename}`);
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  console.log('Starting database migrations...\n');

  const pool = new Pool({
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: parseInt(process.env['POSTGRES_PORT'] ?? '5432', 10),
    user: process.env['POSTGRES_USER'] ?? 'energy',
    password: process.env['POSTGRES_PASSWORD'] ?? 'energy',
    database: process.env['POSTGRES_DB'] ?? 'energy',
  });

  try {
    // Get all migration files
    const migrations = await getMigrationFiles();
    console.log(`Found ${migrations.length} migration files`);

    // Get already applied migrations
    const applied = await getAppliedMigrations(pool);
    console.log(`${applied.size} migrations already applied\n`);

    // Apply pending migrations
    let appliedCount = 0;
    for (const migration of migrations) {
      if (!applied.has(migration.version)) {
        await applyMigration(pool, migration);
        appliedCount++;
      }
    }

    if (appliedCount === 0) {
      console.log('No new migrations to apply.');
    } else {
      console.log(`\n✓ Applied ${appliedCount} new migrations`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
