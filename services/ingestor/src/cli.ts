#!/usr/bin/env node
/**
 * @fileoverview CLI entry point for the energy ingestor
 */

import { parseCliArgs } from './config.js';
import { initPool, closePool } from './infra/db.js';
import { runIngest } from './usecases/runIngest.js';
import { rebuildAggregates } from './usecases/rebuildAggregates.js';
import {
  readLatestArtifact,
  readArtifactFromManifest,
  verifySha256,
} from './adapters/artifactReader.js';

async function main(): Promise<void> {
  const config = parseCliArgs();

  // Resolve the actual bulk path and export date from various sources
  let bulkPath: string;
  let exportDate: string = config.exportDate;

  if (config.artifactRoot) {
    // Read from artifact store
    console.error(
      JSON.stringify({
        level: 'info',
        msg: 'Reading from artifact store',
        artifact_root: config.artifactRoot,
      })
    );

    const artifact = await readLatestArtifact(config.artifactRoot);

    // Verify SHA256
    console.error(
      JSON.stringify({
        level: 'info',
        msg: 'Verifying artifact SHA256',
        expected: artifact.sha256.substring(0, 12) + '...',
      })
    );

    const sha256Valid = await verifySha256(artifact.zipPath, artifact.sha256);
    if (!sha256Valid) {
      throw new Error(`SHA256 mismatch for artifact ${artifact.datasetId}`);
    }

    bulkPath = artifact.zipPath;
    exportDate = artifact.exportDate;

    console.error(
      JSON.stringify({
        level: 'info',
        msg: 'Artifact verified',
        dataset_id: artifact.datasetId,
        export_date: exportDate,
      })
    );
  } else if (config.manifestPath) {
    // Read from manifest path
    console.error(
      JSON.stringify({
        level: 'info',
        msg: 'Reading from manifest',
        manifest_path: config.manifestPath,
      })
    );

    const artifact = await readArtifactFromManifest(config.manifestPath);
    bulkPath = artifact.zipPath;
    exportDate = artifact.exportDate;
  } else if (config.bulkPath) {
    // Direct bulk path
    bulkPath = config.bulkPath;
  } else {
    throw new Error('No input source provided');
  }

  console.error(
    JSON.stringify({
      level: 'info',
      msg: 'Starting ingestor',
      bulkPath,
      exportDate,
      fullRebuildAggregates: config.fullRebuildAggregates,
    })
  );

  // Initialize database pool
  initPool(config.database);

  try {
    // Run the ingest process
    const stats = await runIngest({
      ...config,
      bulkPath,
      exportDate,
    });

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
