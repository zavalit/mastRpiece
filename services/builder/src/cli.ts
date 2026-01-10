#!/usr/bin/env node
/**
 * @fileoverview CLI entry point for the story builder service
 *
 * Usage:
 *   pnpm builder -- --bulkPath <path> --exportDate <YYYY-MM-DD>
 *   pnpm builder -- --bulkPath <path> --exportDate <YYYY-MM-DD> --stories storage,solar
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { initPool, closePool } from './db/pool.js';
import { runBuild } from './pipeline.js';
import logger from './logger.js';
import type { BuilderConfig } from './types.js';

// Load environment
dotenvConfig({ path: resolve(process.cwd(), '.env') });

function parseArgs(): BuilderConfig {
  const args = process.argv.slice(2);
  const config: Partial<BuilderConfig> = {
    stories: ['storageWave', 'solarWave', 'registrationLag'],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--bulkPath' && next) {
      const baseDir = process.env['INIT_CWD'] || process.cwd();
      config.bulkPath = resolve(baseDir, next);
      i++;
    } else if (arg === '--exportDate' && next) {
      config.exportDate = next;
      i++;
    } else if (arg === '--stories' && next) {
      config.stories = next.split(',').map((s) => s.trim());
      i++;
    } else if (arg === '--help') {
      console.log(`
Usage: builder --bulkPath <path> --exportDate <YYYY-MM-DD> [--stories <list>]

Options:
  --bulkPath     Path to bulk ZIP file (required)
  --exportDate   Export date in YYYY-MM-DD format (required)
  --stories      Comma-separated list of stories to build (default: all)
                 Available: storageWave, solarWave, registrationLag

Examples:
  builder --bulkPath ./demo-data/bulk.zip --exportDate 2026-01-06
  builder --bulkPath /data/bulk.zip --exportDate 2026-01-06 --stories storageWave,solarWave
`);
      process.exit(0);
    }
  }

  if (!config.bulkPath) {
    logger.error('--bulkPath is required');
    process.exit(1);
  }

  if (!config.exportDate) {
    logger.error('--exportDate is required');
    process.exit(1);
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.exportDate)) {
    logger.error('--exportDate must be in YYYY-MM-DD format');
    process.exit(1);
  }

  return config as BuilderConfig;
}

async function main(): Promise<void> {
  const config = parseArgs();

  logger.info({
    bulkPath: config.bulkPath,
    exportDate: config.exportDate,
    stories: config.stories,
  }, 'Starting builder');

  // Initialize database pool
  initPool({
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: parseInt(process.env['POSTGRES_PORT'] ?? '5432', 10),
    user: process.env['POSTGRES_USER'] ?? 'energy',
    password: process.env['POSTGRES_PASSWORD'] ?? 'energy',
    database: process.env['POSTGRES_DB'] ?? 'energy',
  });

  try {
    const result = await runBuild(config);

    logger.info({ result }, 'Builder finished successfully');

    process.exit(0);
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Builder failed');

    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
