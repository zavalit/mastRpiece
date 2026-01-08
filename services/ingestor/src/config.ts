/**
 * @fileoverview Configuration module for the ingestor CLI
 */

import { Command } from 'commander';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { formatDateForSql } from '@energy/shared';

// Load environment variables
dotenvConfig({ path: resolve(process.cwd(), '.env') });

/**
 * Ingestor configuration
 */
export interface IngestorConfig {
  bulkPath: string | null;
  artifactRoot: string | null;
  manifestPath: string | null;
  exportDate: string;
  fullRebuildAggregates: boolean;
  database: DatabaseConfig;
  batchSize: number;
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
 * Parse CLI arguments and return configuration
 */
export function parseCliArgs(): IngestorConfig {
  const program = new Command();

  program
    .name('energy-ingest')
    .description('Ingest bulk ZIP files into the energy statistics database')
    .version('1.0.0')
    .option('--bulkPath <path>', 'Path to the bulk ZIP file')
    .option('--artifactRoot <path>', 'Root directory of artifact store (reads latest.json)')
    .option('--manifestPath <path>', 'Direct path to a manifest.json file')
    .option('--exportDate <date>', 'Export date in YYYY-MM-DD format', formatDateForSql(new Date()))
    .option('--fullRebuildAggregates', 'Rebuild aggregate tables after ingest', true)
    .option('--batchSize <size>', 'Number of records per batch insert', '500')
    .parse();

  const opts = program.opts<{
    bulkPath?: string;
    artifactRoot?: string;
    manifestPath?: string;
    exportDate: string;
    fullRebuildAggregates: boolean;
    batchSize: string;
  }>();

  // Validate that at least one source is provided
  if (!opts.bulkPath && !opts.artifactRoot && !opts.manifestPath) {
    console.error('Error: Must provide one of --bulkPath, --artifactRoot, or --manifestPath');
    process.exit(1);
  }

  const config: IngestorConfig = {
    bulkPath: opts.bulkPath ? resolve(process.cwd(), opts.bulkPath) : null,
    artifactRoot: opts.artifactRoot ? resolve(process.cwd(), opts.artifactRoot) : null,
    manifestPath: opts.manifestPath ? resolve(process.cwd(), opts.manifestPath) : null,
    exportDate: opts.exportDate,
    fullRebuildAggregates: opts.fullRebuildAggregates,
    batchSize: parseInt(opts.batchSize, 10),
    database: getDatabaseConfig(),
  };

  return config;
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
    maxConnections: parseInt(process.env['POSTGRES_MAX_CONNECTIONS'] ?? '10', 10),
  };
}
