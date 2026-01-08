/**
 * @fileoverview Atomic file publishing operations
 */

import { mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { DatasetManifest, LatestPointer } from '@energy/shared';

/**
 * Paths configuration for artifact store
 */
export interface ArtifactPaths {
  artifactRoot: string;
  bulkDir: string;
  datasetsDir: string;
  tmpDir: string;
  latestJsonPath: string;
}

/**
 * Get artifact paths from root
 */
export function getArtifactPaths(artifactRoot: string): ArtifactPaths {
  const bulkDir = join(artifactRoot, 'bulk');
  return {
    artifactRoot,
    bulkDir,
    datasetsDir: join(bulkDir, 'datasets'),
    tmpDir: join(bulkDir, 'tmp'),
    latestJsonPath: join(bulkDir, 'latest.json'),
  };
}

/**
 * Get paths for a specific run/dataset
 */
export function getRunPaths(paths: ArtifactPaths, runId: string, datasetId: string) {
  const tmpRunDir = join(paths.tmpDir, runId);
  const finalDir = join(paths.datasetsDir, datasetId);
  
  return {
    tmpRunDir,
    tmpZipPath: join(tmpRunDir, 'bulk.zip.tmp'),
    tmpZipFinal: join(tmpRunDir, 'bulk.zip'),
    tmpManifestPath: join(tmpRunDir, 'manifest.json.tmp'),
    tmpManifestFinal: join(tmpRunDir, 'manifest.json'),
    tmpReadyPath: join(tmpRunDir, 'READY'),
    finalDir,
    finalZipPath: join(finalDir, 'bulk.zip'),
    finalManifestPath: join(finalDir, 'manifest.json'),
    finalReadyPath: join(finalDir, 'READY'),
  };
}

/**
 * Ensure artifact directories exist
 */
export async function ensureArtifactDirs(paths: ArtifactPaths): Promise<void> {
  await mkdir(paths.bulkDir, { recursive: true });
  await mkdir(paths.datasetsDir, { recursive: true });
  await mkdir(paths.tmpDir, { recursive: true });
}

/**
 * Create run temp directory
 */
export async function createRunTmpDir(tmpRunDir: string): Promise<void> {
  await mkdir(tmpRunDir, { recursive: true });
}

/**
 * Cleanup run temp directory
 */
export async function cleanupRunTmpDir(tmpRunDir: string): Promise<void> {
  try {
    await rm(tmpRunDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Atomic rename (within same filesystem)
 */
async function atomicRename(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await rename(src, dest);
}

/**
 * Atomically publish a dataset
 * 
 * Steps:
 * 1. Rename tmp zip to final name in tmp dir
 * 2. Write and rename manifest in tmp dir
 * 3. Create READY marker in tmp dir
 * 4. Rename entire tmp dir to final dataset dir
 * 5. Atomically update latest.json
 */
export async function atomicPublishDataset(
  runPaths: ReturnType<typeof getRunPaths>,
  manifest: DatasetManifest,
  paths: ArtifactPaths
): Promise<void> {
  // Step 1: Rename tmp zip to final name
  await atomicRename(runPaths.tmpZipPath, runPaths.tmpZipFinal);

  // Step 2: Write manifest atomically
  await writeFile(runPaths.tmpManifestPath, JSON.stringify(manifest, null, 2));
  await atomicRename(runPaths.tmpManifestPath, runPaths.tmpManifestFinal);

  // Step 3: Create READY marker
  await writeFile(runPaths.tmpReadyPath, '');

  // Step 4: Rename tmp dir to final dataset dir
  await atomicRename(runPaths.tmpRunDir, runPaths.finalDir);

  // Step 5: Update latest.json atomically
  const latestPointer: LatestPointer = {
    dataset_id: manifest.dataset_id,
    manifest_path: runPaths.finalManifestPath,
    updated_at: new Date().toISOString(),
  };

  const tmpLatestPath = join(paths.bulkDir, 'latest.json.tmp');
  await writeFile(tmpLatestPath, JSON.stringify(latestPointer, null, 2));
  await atomicRename(tmpLatestPath, paths.latestJsonPath);
}
