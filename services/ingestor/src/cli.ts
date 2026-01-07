#!/usr/bin/env node
/**
 * @fileoverview CLI entry point for the energy ingestor
 */

import { parseCliArgs } from './config.js';
import { initPool, closePool } from './infra/db.js';
import { runIngest } from './usecases/runIngest.js';
import { rebuildAggregates } from './usecases/rebuildAggregates.js';

async function main(): Promise<void> {
  const config = parseCliArgs();

  console.error(
    JSON.stringify({
      level: 'info',
      msg: 'Starting ingestor',
      bulkPath: config.bulkPath,
      exportDate: config.exportDate,
      fullRebuildAggregates: config.fullRebuildAggregates,
    })
  );

  // Initialize database pool
  initPool(config.database);

  try {
    // Run the ingest process
    const stats = await runIngest(config);

    // Rebuild aggregates if requested
    if (config.fullRebuildAggregates) {
      await rebuildAggregates();
    }

    console.error(
      JSON.stringify({
        level: 'info',
        msg: 'Ingestor finished successfully',
        stats,
      })
    );

    // Exit with success
    process.exit(0);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Ingestor failed',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    );

    // Exit with failure
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
