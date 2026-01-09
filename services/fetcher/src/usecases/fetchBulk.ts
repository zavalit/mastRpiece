/**
 * @fileoverview Main fetch-bulk orchestration
 */

import { randomUUID } from 'node:crypto';
import type { FetcherConfig } from '../config.js';
import type { DatasetManifest } from '@energy/shared';
import logger from '../infra/logger.js';
import {
  initPool,
  getPool,
  closePool,
  tryAcquireFetchLock,
  releaseFetchLock,
  getLastSuccessfulFetch,
} from '../infra/db.js';
import { fetchPortalPage, parsePortalHtml } from '../adapters/portalParser.js';
import { downloadFile, isHtmlContentType } from '../adapters/downloader.js';
import { validateZipFile } from '../domain/validation.js';
import { generateDatasetId } from '../domain/datasetId.js';
import {
  getArtifactPaths,
  getRunPaths,
  ensureArtifactDirs,
  createRunTmpDir,
  cleanupRunTmpDir,
  atomicPublishDataset,
} from './atomicPublish.js';

/**
 * Fetch result
 */
export interface FetchResult {
  success: boolean;
  skipped: boolean;
  datasetId: string | null;
  sha256: string | null;
  bytes: number | null;
  error: string | null;
}

/**
 * Run the complete fetch-bulk process
 */
export async function fetchBulk(config: FetcherConfig): Promise<FetchResult> {
  const runId = randomUUID();
  const startedAt = new Date();

  logger.info({ runId, portalUrl: config.portalUrl }, 'Starting fetch-bulk');

  // Initialize database
  initPool(config.database);

  // Try to acquire lock
  const lockAcquired = await tryAcquireFetchLock();
  if (!lockAcquired) {
    logger.warn({ runId }, 'Another fetch is in progress, skipping');
    await closePool();
    return {
      success: true,
      skipped: true,
      datasetId: null,
      sha256: null,
      bytes: null,
      error: null,
    };
  }

  try {
    // Create fetch run record
    await createFetchRun(runId, startedAt);

    // Fetch and parse portal page
    logger.info('Fetching portal page');
    const portalHtml = await fetchPortalPage(config.portalUrl, config.userAgent);
    const portalInfo = parsePortalHtml(portalHtml);

    logger.info(
      { downloadUrl: portalInfo.downloadUrl, lastUpdated: portalInfo.lastUpdatedLabel },
      'Portal parsed'
    );

    // Check if we should skip (already fetched)
    const lastFetch = await getLastSuccessfulFetch();
    if (lastFetch && portalInfo.lastUpdatedAt) {
      const lastUpdatedTime = lastFetch.portal_last_updated_at?.getTime();
      const currentUpdatedTime = portalInfo.lastUpdatedAt.getTime();

      if (lastUpdatedTime && lastUpdatedTime >= currentUpdatedTime) {
        logger.info({ lastUpdated: portalInfo.lastUpdatedLabel }, 'Dataset already up to date, skipping');
        await updateFetchRunSkipped(runId, 'Already up to date');
        return {
          success: true,
          skipped: true,
          datasetId: null,
          sha256: null,
          bytes: null,
          error: null,
        };
      }
    }

    // Setup artifact paths
    const paths = getArtifactPaths(config.artifactRoot);
    await ensureArtifactDirs(paths);

    // Create temp directory for this run
    const runPaths = getRunPaths(paths, runId, ''); // dataset_id will be computed later
    await createRunTmpDir(runPaths.tmpRunDir);

    logger.debug({ tmpDir: runPaths.tmpRunDir }, 'Temp directory created');

    try {
      // Download the file
      logger.info({ url: portalInfo.downloadUrl }, 'Starting download');

      const downloadResult = await downloadFile(
        portalInfo.downloadUrl,
        runPaths.tmpZipPath,
        config.userAgent
      );

      // Check if response was HTML (error page)
      if (isHtmlContentType(downloadResult.contentType)) {
        throw new Error('Received HTML response instead of ZIP (possible rate limit or error page)');
      }

      // Validate ZIP
      const validation = await validateZipFile(runPaths.tmpZipPath, config.minFileSizeBytes);
      if (!validation.valid) {
        throw new Error(`ZIP validation failed: ${validation.error}`);
      }

      logger.info('ZIP validated successfully');

      // Check for SHA256 dedupe
      if (lastFetch?.sha256 === downloadResult.sha256) {
        logger.info(
          { sha256: downloadResult.sha256.substring(0, 12) + '...' },
          'Same SHA256 as last fetch, skipping'
        );
        await cleanupRunTmpDir(runPaths.tmpRunDir);
        await updateFetchRunSkipped(runId, 'Same SHA256 as previous fetch');
        return {
          success: true,
          skipped: true,
          datasetId: null,
          sha256: downloadResult.sha256,
          bytes: downloadResult.bytes,
          error: null,
        };
      }

      // Generate dataset ID
      const datasetId = generateDatasetId(downloadResult.sha256, portalInfo.lastUpdatedAt);

      // Update run paths with actual dataset ID
      const finalRunPaths = getRunPaths(paths, runId, datasetId);

      // Create manifest
      const manifest: DatasetManifest = {
        dataset_id: datasetId,
        kind: 'bulk',
        portal_url: config.portalUrl,
        download_url: portalInfo.downloadUrl,
        portal_last_updated_label: portalInfo.lastUpdatedLabel,
        portal_last_updated_at: portalInfo.lastUpdatedAt?.toISOString() ?? null,
        fetched_at: new Date().toISOString(),
        sha256: downloadResult.sha256,
        bytes: downloadResult.bytes,
        http: {
          status: downloadResult.httpStatus,
          etag: downloadResult.etag,
          last_modified: downloadResult.lastModified,
          content_type: downloadResult.contentType,
        },
        local: {
          zip_path: finalRunPaths.finalZipPath,
        },
      };

      // Atomic publish
      logger.info({ datasetId }, 'Publishing dataset');
      await atomicPublishDataset(finalRunPaths, manifest, paths);

      // Update fetch run as successful
      await updateFetchRunSuccess(
        runId,
        portalInfo.lastUpdatedLabel,
        portalInfo.lastUpdatedAt,
        portalInfo.downloadUrl,
        downloadResult.sha256,
        downloadResult.bytes,
        datasetId,
        finalRunPaths.finalDir
      );

      logger.info({ runId, datasetId }, 'Fetch completed successfully');

      return {
        success: true,
        skipped: false,
        datasetId,
        sha256: downloadResult.sha256,
        bytes: downloadResult.bytes,
        error: null,
      };
    } catch (error) {
      // Cleanup on error
      await cleanupRunTmpDir(runPaths.tmpRunDir);
      throw error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({ runId, error: errorMessage, stack: errorStack }, 'Fetch failed');

    await updateFetchRunFailed(runId, errorMessage);

    return {
      success: false,
      skipped: false,
      datasetId: null,
      sha256: null,
      bytes: null,
      error: errorMessage,
    };
  } finally {
    await releaseFetchLock();
    await closePool();
  }
}

// Database helper functions

async function createFetchRun(runId: string, startedAt: Date): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO fetch_runs (run_id, started_at, status, attempts) VALUES ($1, $2, $3, $4)`,
    [runId, startedAt, 'running', 1]
  );
}

async function updateFetchRunSuccess(
  runId: string,
  portalLabel: string,
  portalAt: Date | null,
  downloadUrl: string,
  sha256: string,
  bytes: number,
  datasetId: string,
  artifactPath: string
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE fetch_runs SET
      finished_at = $2,
      status = $3,
      portal_last_updated_label = $4,
      portal_last_updated_at = $5,
      download_url = $6,
      sha256 = $7,
      bytes = $8,
      dataset_id = $9,
      artifact_path = $10
    WHERE run_id = $1`,
    [runId, new Date(), 'success', portalLabel, portalAt, downloadUrl, sha256, bytes, datasetId, artifactPath]
  );
}

async function updateFetchRunSkipped(runId: string, reason: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE fetch_runs SET finished_at = $2, status = $3, error_message = $4 WHERE run_id = $1`,
    [runId, new Date(), 'skipped', reason]
  );
}

async function updateFetchRunFailed(runId: string, errorMessage: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE fetch_runs SET finished_at = $2, status = $3, error_message = $4 WHERE run_id = $1`,
    [runId, new Date(), 'failed', errorMessage]
  );
}
