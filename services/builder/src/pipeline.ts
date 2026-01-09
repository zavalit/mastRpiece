/**
 * @fileoverview Main build pipeline orchestration
 *
 * Pipeline steps:
 * 1. Insert ingest_run with status 'running'
 * 2. Compute SHA256 of the ZIP file
 * 3. Parse all XML files in single pass (solar first to get locations, then storage)
 * 4. TRUNCATE story tables + INSERT aggregated rows
 * 5. Mark ingest_run as success/failed
 */

import { randomUUID } from 'node:crypto';
import { getPool, query } from './db/pool.js';
import { deleteStorySnapshot } from './db/write.js';
import { streamZipEntries, computeFileHash } from './io/zipReader.js';
import { parseXmlWithCallback } from './io/xmlParser.js';
import {
  createStorageWaveBuilder,
  createSolarWaveBuilder,
  createSolarLocationsCollector,
  createStorageColocationBuilder,
  createRegistrationLagBuilder,
} from './stories/index.js';
import logger from './logger.js';
import type { BuilderConfig, BuildResult, StorageRecord, SolarRecord } from './types.js';

const PROGRESS_INTERVAL = 50000; // Log progress every N records

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

    let totalStorageRecords = 0;
    let totalSolarRecords = 0;
    
    // For colocation, we need to collect storage records and process after solar
    const storedStorageRecords: StorageRecord[] = [];
    const needsColocation = config.stories.includes('storageColocation');

    // Step 4: Parse all files - process solar first (they come first alphabetically anyway)
    logger.info('Parsing ZIP entries (streaming)');

    for await (const entry of streamZipEntries(config.bulkPath)) {
      const filename = entry.filename;
      
      if (/^EinheitenSolar/i.test(filename)) {
        // Solar files - process first to collect locations
        logger.info({ filename }, 'Processing solar file');
        
        let fileRecords = 0;
        const { recordCount } = await parseXmlWithCallback<SolarRecord>(
          entry.stream,
          'EinheitSolar',
          (record) => {
            if (config.stories.includes('solarWave')) {
              solarWave.onRecord(record);
            }
            if (needsColocation) {
              solarLocationsCollector.onRecord(record);
            }
            if (config.stories.includes('registrationLag')) {
              solarLag.onRecord(record);
            }
            
            fileRecords++;
            if (fileRecords % PROGRESS_INTERVAL === 0) {
              logger.info({ filename, records: fileRecords }, 'Progress');
            }
          }
        );
        
        totalSolarRecords += recordCount;
        logger.info({ filename, records: recordCount }, 'Completed file');
        
      } else if (/^EinheitenStromSpeicher/i.test(filename) || /^AnlagenStromSpeicher/i.test(filename)) {
        // Storage files
        logger.info({ filename }, 'Processing storage file');
        const recordElement = filename.includes('Anlagen') ? 'AnlageStromSpeicher' : 'EinheitStromSpeicher';
        
        let fileRecords = 0;
        const { recordCount } = await parseXmlWithCallback<StorageRecord>(
          entry.stream,
          recordElement,
          (record) => {
            if (config.stories.includes('storageWave')) {
              storageWave.onRecord(record);
            }
            if (config.stories.includes('registrationLag')) {
              storageLag.onRecord(record);
            }
            
            // Store for colocation processing after all solar locations are known
            if (needsColocation) {
              storedStorageRecords.push(record);
            }
            
            fileRecords++;
            if (fileRecords % PROGRESS_INTERVAL === 0) {
              logger.info({ filename, records: fileRecords }, 'Progress');
            }
          }
        );
        
        totalStorageRecords += recordCount;
        logger.info({ filename, records: recordCount }, 'Completed file');
      } else {
        // Skip other files (but must consume the stream)
        logger.debug({ filename }, 'Skipping file');
        // Stream is already consumed by zipReader's autodrain for non-yielded entries
        // But for yielded entries we need to drain manually
        entry.stream.resume();
        await new Promise<void>((resolve) => {
          entry.stream.on('end', resolve);
          entry.stream.on('error', resolve);
        });
      }
    }

    logger.info({ totalStorageRecords, totalSolarRecords }, 'Parsing complete');

    // Step 5: Post-process colocation (now we have all solar locations)
    let colocationBuilder: ReturnType<typeof createStorageColocationBuilder> | null = null;
    
    if (needsColocation) {
      logger.info({ 
        solarLocations: solarLocationsCollector.getLocations().size,
        storageRecords: storedStorageRecords.length 
      }, 'Processing colocation');
      
      colocationBuilder = createStorageColocationBuilder(
        solarLocationsCollector.getLocations()
      );
      
      for (const record of storedStorageRecords) {
        colocationBuilder.onRecord(record);
      }
      
      // Clear stored records to free memory
      storedStorageRecords.length = 0;
    }

    // Step 6: Targeted cleanup of this snapshot
    logger.info({ exportDate: config.exportDate }, 'Cleaning up existing snapshot data');
    await deleteStorySnapshot(pool, config.exportDate);

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

    if (needsColocation) {
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
