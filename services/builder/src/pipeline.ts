/**
 * @fileoverview Main build pipeline orchestration
 *
 * Pipeline steps:
 * 1. Insert ingest_run with status 'running'
 * 2. Compute SHA256 of the ZIP file
 * 3. Parse ZIP entries streaming
 * 4. Route records to story builders
 * 5. TRUNCATE story tables + INSERT aggregated rows
 * 6. Mark ingest_run as success/failed
 */

import { randomUUID } from 'node:crypto';
import { getPool, query } from './db/pool.js';
import { truncateStoryTables } from './db/write.js';
import { streamZipEntries, computeFileHash } from './io/zipReader.js';
import { parseXmlRecords } from './io/xmlParser.js';
import {
  createStorageWaveBuilder,
  createSolarWaveBuilder,
  createSolarLocationsCollector,
  createStorageColocationBuilder,
  createRegistrationLagBuilder,
} from './stories/index.js';
import logger from './logger.js';
import type { BuilderConfig, BuildResult, StorageRecord, SolarRecord } from './types.js';

/**
 * Run the complete build pipeline
 */
export async function runBuild(config: BuilderConfig): Promise<BuildResult> {
  const runId = randomUUID();
  const startTime = Date.now();
  const pool = getPool();

  // Step 1: Compute file hash
  logger.info('Computing file hash');
  const fileHash = await computeFileHash(config.bulkPath);

  // Step 2: Create ingest_run record
  logger.info('Creating ingest_run record');
  await query(
    `INSERT INTO ingest_run (export_date, run_id, status, source_ref, file_sha256)
     VALUES ($1, $2, 'running', $3, $4)
     ON CONFLICT (export_date) DO UPDATE SET
       run_id = EXCLUDED.run_id,
       started_at = now(),
       finished_at = NULL,
       status = 'running',
       source_ref = EXCLUDED.source_ref,
       file_sha256 = EXCLUDED.file_sha256,
       error_message = NULL`,
    [config.exportDate, runId, config.bulkPath, fileHash]
  );

  const result: BuildResult = {
    exportDate: config.exportDate,
    runId,
    status: 'failed',
    duration_ms: 0,
    stories: {},
  };

  try {
    // Step 3: Initialize builders
    const storageWave = createStorageWaveBuilder();
    const solarWave = createSolarWaveBuilder();
    const solarLocationsCollector = createSolarLocationsCollector();
    const storageLag = createRegistrationLagBuilder('storage');
    const solarLag = createRegistrationLagBuilder('solar');

    // Track parsed files
    const parsedStorageFiles: StorageRecord[][] = [];
    const parsedSolarFiles: SolarRecord[][] = [];

    // Step 4: First pass - parse all files and collect solar locations
    logger.info('Parsing ZIP entries (first pass)');

    for await (const entry of streamZipEntries(config.bulkPath)) {
      const filename = entry.filename;
      logger.debug({ filename }, 'Processing file');

      if (/^EinheitenStromSpeicher/i.test(filename) || /^AnlagenStromSpeicher/i.test(filename)) {
        // Storage files - collect for second pass
        const recordElement = filename.includes('Anlagen') ? 'AnlageStromSpeicher' : 'EinheitStromSpeicher';
        const records = await parseXmlRecords<StorageRecord>(entry.stream, recordElement);
        parsedStorageFiles.push(records);
        
        // Process for storage wave and lag
        for (const record of records) {
          if (config.stories.includes('storageWave')) {
            storageWave.onRecord(record);
          }
          if (config.stories.includes('registrationLag')) {
            storageLag.onRecord(record);
          }
        }
      } else if (/^EinheitenSolar/i.test(filename)) {
        // Solar files
        const records = await parseXmlRecords<SolarRecord>(entry.stream, 'EinheitSolar');
        parsedSolarFiles.push(records);
        
        // Process for solar wave, solar locations, and lag
        for (const record of records) {
          if (config.stories.includes('solarWave')) {
            solarWave.onRecord(record);
          }
          if (config.stories.includes('storageColocation')) {
            solarLocationsCollector.onRecord(record);
          }
          if (config.stories.includes('registrationLag')) {
            solarLag.onRecord(record);
          }
        }
      }
    }

    // Step 5: Second pass for colocation (needs solar locations first)
    let colocationBuilder: ReturnType<typeof createStorageColocationBuilder> | null = null;
    
    if (config.stories.includes('storageColocation')) {
      logger.info('Processing colocation (second pass)');
      
      colocationBuilder = createStorageColocationBuilder(
        solarLocationsCollector.getLocations()
      );

      for (const records of parsedStorageFiles) {
        for (const record of records) {
          colocationBuilder.onRecord(record);
        }
      }
    }

    // Step 6: Truncate and write
    logger.info('Truncating story tables');
    await truncateStoryTables(pool);

    // Step 7: Write story tables
    logger.info('Writing story tables');

    if (config.stories.includes('storageWave')) {
      result.stories['storageWave'] = await storageWave.finalizeAndWrite(pool, config.exportDate);
      logger.info({ rows: result.stories['storageWave'].rowsInserted }, 'Wrote storageWave');
    }

    if (config.stories.includes('solarWave')) {
      result.stories['solarWave'] = await solarWave.finalizeAndWrite(pool, config.exportDate);
      logger.info({ rows: result.stories['solarWave'].rowsInserted }, 'Wrote solarWave');
    }

    if (config.stories.includes('storageColocation')) {
      // Write solar locations first
      await solarLocationsCollector.writeToDb(pool, config.exportDate);
      
      if (colocationBuilder) {
        result.stories['storageColocation'] = await colocationBuilder.finalizeAndWrite(pool, config.exportDate);
        logger.info({ rows: result.stories['storageColocation'].rowsInserted }, 'Wrote storageColocation');
      }
    }

    if (config.stories.includes('registrationLag')) {
      result.stories['storageLag'] = await storageLag.finalizeAndWrite(pool, config.exportDate);
      result.stories['solarLag'] = await solarLag.finalizeAndWrite(pool, config.exportDate);
      logger.info({
        storage: result.stories['storageLag'].rowsInserted,
        solar: result.stories['solarLag'].rowsInserted,
      }, 'Wrote registrationLag');
    }

    // Step 8: Mark success
    await query(
      `UPDATE ingest_run SET
        finished_at = now(),
        status = 'success'
      WHERE export_date = $1`,
      [config.exportDate]
    );

    result.status = 'success';
    result.duration_ms = Date.now() - startTime;

    return result;
  } catch (error) {
    // Mark failed
    const errorMessage = error instanceof Error ? error.message : String(error);
    await query(
      `UPDATE ingest_run SET
        finished_at = now(),
        status = 'failed',
        error_message = $2
      WHERE export_date = $1`,
      [config.exportDate, errorMessage]
    );

    result.duration_ms = Date.now() - startTime;
    throw error;
  }
}
