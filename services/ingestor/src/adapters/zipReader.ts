/**
 * @fileoverview Streaming ZIP file reader
 */

import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import unzipper from 'unzipper';
import type { Readable } from 'node:stream';
import { inferTechFromFilename, type TechType } from '@energy/shared';

/**
 * Entry from the ZIP file
 */
export interface ZipEntry {
  filename: string;
  tech: TechType;
  stream: Readable;
}

/**
 * Compute SHA-256 hash of a file
 */
export async function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Validate that the ZIP file exists and is accessible
 */
export async function validateZipFile(filePath: string): Promise<void> {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`ZIP file not found: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Stream entries from a ZIP file
 * Only yields XML files (filters out directories and non-XML files)
 */
export async function* streamZipEntries(filePath: string): AsyncGenerator<ZipEntry> {
  await validateZipFile(filePath);

  const zip = createReadStream(filePath).pipe(unzipper.Parse({ forceStream: true }));

  for await (const entry of zip) {
    const filename = entry.path as string;
    const type = entry.type as string;

    // Skip directories and non-XML files
    if (type === 'Directory' || !filename.toLowerCase().endsWith('.xml')) {
      entry.autodrain();
      continue;
    }

    // Extract just the filename without path
    const basename = filename.split('/').pop() ?? filename;

    // Infer tech type from filename
    const tech = inferTechFromFilename(basename);

    yield {
      filename: basename,
      tech,
      stream: entry as Readable,
    };
  }
}

/**
 * Group split files by base name
 * e.g., EinheitenSolar_1.xml and EinheitenSolar_2.xml are grouped together
 */
export function getBaseFilename(filename: string): string {
  // Remove _N suffix before extension (e.g., EinheitenSolar_1.xml -> EinheitenSolar)
  const withoutExt = filename.replace(/\.xml$/i, '');
  const withoutSuffix = withoutExt.replace(/_\d+$/, '');
  return withoutSuffix;
}
