/**
 * @fileoverview Streaming file downloader with SHA256 computation
 */

import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import logger from '../infra/logger.js';

/**
 * Download result with metadata
 */
export interface DownloadResult {
  sha256: string;
  bytes: number;
  httpStatus: number;
  etag: string | null;
  lastModified: string | null;
  contentType: string | null;
}

/**
 * Progress callback
 */
export type ProgressCallback = (bytesDownloaded: number, totalBytes: number | null) => void;

/**
 * Format bytes to human-readable string (KB, MB, GB)
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

/**
 * Download a file streamingly while computing SHA256
 * Returns metadata about the download
 */
export async function downloadFile(
  url: string,
  destPath: string,
  userAgent: string,
  onProgress?: ProgressCallback
): Promise<DownloadResult> {
  logger.debug({ url, dest: destPath }, 'Starting HTTP request');

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/zip,application/octet-stream,*/*',
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ url, error: errorMsg }, 'HTTP request failed');
    throw new Error(`HTTP request failed: ${errorMsg}`);
  }

  logger.debug(
    {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    },
    'HTTP response received'
  );

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Response has no body');
  }

  const contentLength = response.headers.get('content-length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

  // Only log total size if known
  if (totalBytes) {
    logger.info({ totalSize: formatBytes(totalBytes) }, 'Download started');
  } else {
    logger.info('Download started (file size unknown, streaming)');
  }

  // Create hash for SHA256
  const hash = createHash('sha256');
  let bytesDownloaded = 0;
  let lastProgressLog = 0;
  const startTime = Date.now();

  // Create transform stream for SHA256 computation and progress
  const hashTransform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      bytesDownloaded += chunk.length;

      if (onProgress) {
        onProgress(bytesDownloaded, totalBytes);
      }

      // Log progress every 50MB or every 5%
      const mbInterval = 50 * 1024 * 1024;
      const shouldLogMB = bytesDownloaded - lastProgressLog > mbInterval;
      
      let shouldLogPercent = false;
      if (totalBytes) {
        const currentPercent = Math.floor((bytesDownloaded / totalBytes) * 100);
        const lastPercent = Math.floor((lastProgressLog / totalBytes) * 100);
        shouldLogPercent = Math.floor(currentPercent / 5) > Math.floor(lastPercent / 5);
      }

      if (shouldLogMB || shouldLogPercent) {
        lastProgressLog = bytesDownloaded;
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speedMBps = elapsedSec > 0 ? (bytesDownloaded / 1024 / 1024 / elapsedSec).toFixed(2) : '0';

        const logData: Record<string, string | number> = {
          downloaded: formatBytes(bytesDownloaded),
          speed: speedMBps + ' MB/s',
        };

        // Add percentage only if total is known
        if (totalBytes) {
          logData['percent'] = ((bytesDownloaded / totalBytes) * 100).toFixed(1) + '%';
        }

        logger.info(logData, 'Download progress');
      }

      callback(null, chunk);
    },
  });

  // Create write stream
  const writeStream = createWriteStream(destPath);

  // Handle stream errors
  writeStream.on('error', (err) => {
    logger.error({ error: err.message }, 'Write stream error');
  });

  try {
    // Pipeline: response body -> hash transform -> file
    const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
    await pipeline(nodeStream, hashTransform, writeStream);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      { error: errorMsg, stack: errorStack, bytesDownloaded, totalBytes },
      'Download stream failed'
    );
    throw new Error(`Download stream failed at ${formatBytes(bytesDownloaded)}: ${errorMsg}`);
  }

  const sha256 = hash.digest('hex');
  const elapsedSec = (Date.now() - startTime) / 1000;

  logger.info(
    {
      size: formatBytes(bytesDownloaded),
      sha256: sha256.substring(0, 12) + '...',
      elapsed: elapsedSec.toFixed(1) + 's',
    },
    'Download completed'
  );

  return {
    sha256,
    bytes: bytesDownloaded,
    httpStatus: response.status,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    contentType: response.headers.get('content-type'),
  };
}

/**
 * Check if response content type indicates an error page
 */
export function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().includes('text/html');
}
