/**
 * @fileoverview Artifact store reader for ingestor
 */

import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import type { LatestPointer, DatasetManifest } from '@energy/shared';

/**
 * Artifact reading result
 */
export interface ArtifactInfo {
  datasetId: string;
  zipPath: string;
  exportDate: string;
  sha256: string;
  manifest: DatasetManifest;
}

/**
 * Read artifact from the artifact store
 * Looks up latest.json, loads manifest, verifies READY marker
 */
export async function readLatestArtifact(artifactRoot: string): Promise<ArtifactInfo> {
  const latestJsonPath = join(artifactRoot, 'bulk', 'latest.json');

  // Check if latest.json exists
  try {
    await access(latestJsonPath);
  } catch {
    throw new Error(`No latest.json found at ${latestJsonPath}. Has fetcher run?`);
  }

  // Read latest.json
  const latestContent = await readFile(latestJsonPath, 'utf-8');
  const latest: LatestPointer = JSON.parse(latestContent);

  // Read manifest
  const manifestContent = await readFile(latest.manifest_path, 'utf-8');
  const manifest: DatasetManifest = JSON.parse(manifestContent);

  // Verify READY marker exists
  const datasetDir = join(artifactRoot, 'bulk', 'datasets', manifest.dataset_id);
  const readyPath = join(datasetDir, 'READY');

  try {
    await access(readyPath);
  } catch {
    throw new Error(`READY marker not found for dataset ${manifest.dataset_id}. Dataset may be incomplete.`);
  }

  // Verify ZIP exists
  try {
    await access(manifest.local.zip_path);
  } catch {
    throw new Error(`ZIP file not found at ${manifest.local.zip_path}`);
  }

  // Extract export date from dataset ID
  const exportDate = extractExportDate(manifest.dataset_id, manifest.portal_last_updated_at);

  return {
    datasetId: manifest.dataset_id,
    zipPath: manifest.local.zip_path,
    exportDate,
    sha256: manifest.sha256,
    manifest,
  };
}

/**
 * Read artifact from a direct manifest path
 */
export async function readArtifactFromManifest(manifestPath: string): Promise<ArtifactInfo> {
  const manifestContent = await readFile(manifestPath, 'utf-8');
  const manifest: DatasetManifest = JSON.parse(manifestContent);

  const exportDate = extractExportDate(manifest.dataset_id, manifest.portal_last_updated_at);

  return {
    datasetId: manifest.dataset_id,
    zipPath: manifest.local.zip_path,
    exportDate,
    sha256: manifest.sha256,
    manifest,
  };
}

/**
 * Verify SHA256 of ZIP file matches manifest
 */
export async function verifySha256(zipPath: string, expectedSha256: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(zipPath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const actualSha256 = hash.digest('hex');
      resolve(actualSha256 === expectedSha256);
    });
    stream.on('error', reject);
  });
}

/**
 * Extract export date from dataset ID or manifest
 */
function extractExportDate(datasetId: string, portalLastUpdatedAt: string | null): string {
  // Try to parse from portal timestamp
  if (portalLastUpdatedAt) {
    const date = new Date(portalLastUpdatedAt);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0] ?? '';
    }
  }

  // Try to parse from dataset ID
  // Pattern: YYYYMMDDTHHMM_sha256_... or exportDate_YYYYMMDD_sha256_...
  const timestampMatch = datasetId.match(/^(\d{4})(\d{2})(\d{2})T/);
  if (timestampMatch) {
    return `${timestampMatch[1]}-${timestampMatch[2]}-${timestampMatch[3]}`;
  }

  const exportDateMatch = datasetId.match(/^exportDate_(\d{4})(\d{2})(\d{2})_/);
  if (exportDateMatch) {
    return `${exportDateMatch[1]}-${exportDateMatch[2]}-${exportDateMatch[3]}`;
  }

  // Fallback to today
  return new Date().toISOString().split('T')[0] ?? '';
}
