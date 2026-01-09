/**
 * @fileoverview Configuration module for the fetcher CLI
 */

import { Command } from 'commander';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';

// Load environment variables
dotenvConfig({ path: resolve(process.cwd(), '.env') });

/**
 * Fetcher configuration
 */
export interface FetcherConfig {
  portalUrl: string;
  artifactRoot: string;
  maxAttempts: number;
  userAgent: string;
  minFileSizeBytes: number;
  database: DatabaseConfig;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  maxConnections: number;
}

/**
 * Default MaStR portal URL
 */
export const DEFAULT_PORTAL_URL = 'https://www.marktstammdatenregister.de/MaStR/Datendownload';

/**
 * Parse CLI arguments and return configuration
 */
export function parseCliArgs(): FetcherConfig {
  const program = new Command();

  program
    .name('energy-fetch')
    .description('Fetch bulk ZIP files from MaStR portal')
    .version('1.0.0')
    .command('fetch-bulk')
    .option(
      '--portalUrl <url>',
      'MaStR Datendownload portal URL',
      process.env['PORTAL_URL'] ?? DEFAULT_PORTAL_URL
    )
    .option(
      '--artifactRoot <path>',
      'Root directory for artifacts',
      process.env['ARTIFACT_ROOT'] ?? '/data/artifacts'
    )
    .option('--maxAttempts <n>', 'Maximum retry attempts', '5')
    .action(() => {
      // Action handled by parseCliArgs return
    });

  program.parse();

  const cmd = program.commands[0];
  const opts = cmd?.opts<{
    portalUrl: string;
    artifactRoot: string;
    maxAttempts: string;
  }>() ?? {
    portalUrl: process.env['PORTAL_URL'] ?? DEFAULT_PORTAL_URL,
    artifactRoot: process.env['ARTIFACT_ROOT'] ?? '/data/artifacts',
    maxAttempts: '5',
  };

  return {
    portalUrl: opts.portalUrl,
    artifactRoot: resolve(process.env['INIT_CWD'] ?? process.cwd(), opts.artifactRoot),
    maxAttempts: parseInt(opts.maxAttempts, 10),
    userAgent: process.env['USER_AGENT'] ?? 'energy-fetcher/1.0',
    minFileSizeBytes: parseInt(process.env['MIN_FILE_SIZE_BYTES'] ?? '1000000', 10), // 1MB default
    database: getDatabaseConfig(),
  };
}

/**
 * Get database configuration from environment variables
 */
export function getDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: parseInt(process.env['POSTGRES_PORT'] ?? '5432', 10),
    user: process.env['POSTGRES_USER'] ?? 'energy',
    password: process.env['POSTGRES_PASSWORD'] ?? 'energy',
    database: process.env['POSTGRES_DB'] ?? 'energy',
    maxConnections: parseInt(process.env['POSTGRES_MAX_CONNECTIONS'] ?? '5', 10),
  };
}

/**
 * Backoff delays for retries (in milliseconds)
 */
export const RETRY_DELAYS_MS = [
  15 * 60 * 1000,  // 15 min
  30 * 60 * 1000,  // 30 min
  60 * 60 * 1000,  // 60 min
  120 * 60 * 1000, // 120 min
  240 * 60 * 1000, // 240 min
];
