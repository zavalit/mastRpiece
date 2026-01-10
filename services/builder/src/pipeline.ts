/**
 * @fileoverview Main build pipeline orchestration
 *
 * Pipeline steps:
 * 1. Insert ingest_run with status 'running'
 * 2. Compute SHA256 of the ZIP file
 * 3. Parse all XML files - dispatch records to interested stories
 * 4. Run prepareWrite hooks, then finalizeAndWrite for each story
 * 5. Mark ingest_run as success/failed
 */

import { randomUUID } from 'node:crypto';
import { getPool, query, withTransaction } from './db/pool.js';
import { deleteStorySnapshot } from './db/write.js';
import { streamZipEntries, computeFileHash } from './io/zipReader.js';
import { parseXmlWithCallback } from './io/xmlParser.js';
import { createStoryBuilders } from './stories/factory.js';
import logger from './logger.js';
import type { BuilderConfig, BuildResult } from './types.js';
import type { StoryBuilder } from '@mastrpiece/shared';

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
    // Step 3: Initialize builders from factory
    const builders = await createStoryBuilders(config.stories, config.exportDate);
    logger.info({ stories: builders.map(b => b.name) }, 'Initialized story builders');

    // Step 4: Run onPrepare hooks (clear staging, etc.)
    for (const builder of builders) {
      if (builder.onPrepare) {
        logger.info({ story: builder.name }, 'Running onPrepare');
        await builder.onPrepare(pool, config.bulkPath);
      }
    }

    // Step 5: Parse all files - dispatch records to interested stories
    logger.info('Parsing ZIP entries (streaming)');

    let totalRecords = 0;

    for await (const entry of streamZipEntries(config.bulkPath)) {
      const filename = entry.filename;

      // Find all builders interested in this file
      const interestedBuilders: { builder: StoryBuilder; element: string }[] = [];
      for (const builder of builders) {
        const element = builder.getInterestedElement(filename);
        if (element) {
          interestedBuilders.push({ builder, element });
        }
      }

      if (interestedBuilders.length === 0) {
        // No builders interested - skip file
        logger.debug({ filename }, 'Skipping file (no interested builders)');
        entry.stream.resume();
        await new Promise<void>((resolve) => {
          entry.stream.on('end', resolve);
          entry.stream.on('error', resolve);
        });
        continue;
      }

      // Group by element name (in case multiple builders want the same element)
      const elementToBuilders = new Map<string, StoryBuilder[]>();
      for (const { builder, element } of interestedBuilders) {
        const existing = elementToBuilders.get(element) || [];
        existing.push(builder);
        elementToBuilders.set(element, existing);
      }

      // Process file - we can only parse once, so use the first element
      // (assumption: all interested builders want the same element for a given file)
      const [targetElement, targetBuilders] = [...elementToBuilders.entries()][0]!;

      logger.info({ filename, element: targetElement, builderCount: targetBuilders.length }, 'Processing file');

      let fileRecords = 0;
      const { recordCount } = await parseXmlWithCallback(
        entry.stream,
        targetElement,
        async (record) => {
          for (const builder of targetBuilders) {
            await builder.onRecord(record);
          }
          fileRecords++;
          if (fileRecords % PROGRESS_INTERVAL === 0) {
            logger.info({ filename, records: fileRecords }, 'Progress');
          }
        }
      );

      totalRecords += recordCount;
      logger.info({ filename, records: recordCount }, 'Completed file');
      
      // Call onFileComplete hook if implemented
      for (const builder of targetBuilders) {
        if (builder.onFileComplete) {
          await builder.onFileComplete(pool, filename, recordCount);
        }
      }
    }

    logger.info({ totalRecords }, 'Parsing complete');

    // Step 6: Atomic write phase
    await withTransaction(async (client) => {
      // Step 6a: Targeted cleanup of ONLY the stories we are building
      logger.info(
        { exportDate: config.exportDate, stories: config.stories },
        'Cleaning up existing snapshot data selectively'
      );
      await deleteStorySnapshot(client, config.exportDate, config.stories);

      // Step 6b: Write story tables
      logger.info('Writing story tables');
      for (const builder of builders) {
        const storyResult = await builder.finalizeAndWrite(client, config.bulkPath);
        result.stories[builder.name] = storyResult;
        logger.info({ story: builder.name, rows: storyResult.rowsInserted }, 'Wrote story');
      }

      // Step 6c: Mark success inside the transaction
      await client.query(
        `UPDATE ingest_run SET
          finished_at = now(),
          status = 'success'
        WHERE export_date = $1`,
        [config.exportDate]
      );
    });

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
