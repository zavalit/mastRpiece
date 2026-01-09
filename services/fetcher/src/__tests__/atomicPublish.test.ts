/**
 * @fileoverview Unit tests for the atomicPublish use case
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  getArtifactPaths, 
  getRunPaths, 
  ensureArtifactDirs, 
  createRunTmpDir, 
  cleanupRunTmpDir, 
  atomicPublishDataset 
} from '../usecases/atomicPublish.js';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

describe('AtomicPublish', () => {
  const mockRoot = '/data/artifacts';
  const mockRunId = 'run-123';
  const mockDatasetId = 'ds-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getArtifactPaths', () => {
    it('should return correct path structure', () => {
      const paths = getArtifactPaths(mockRoot);
      expect(paths.artifactRoot).toBe(mockRoot);
      expect(paths.bulkDir).toBe(join(mockRoot, 'bulk'));
      expect(paths.datasetsDir).toBe(join(mockRoot, 'bulk', 'datasets'));
      expect(paths.tmpDir).toBe(join(mockRoot, 'bulk', 'tmp'));
    });
  });

  describe('getRunPaths', () => {
    it('should return correct paths for a run', () => {
      const paths = getArtifactPaths(mockRoot);
      const runPaths = getRunPaths(paths, mockRunId, mockDatasetId);
      
      expect(runPaths.tmpRunDir).toBe(join(paths.tmpDir, mockRunId));
      expect(runPaths.finalDir).toBe(join(paths.datasetsDir, mockDatasetId));
      expect(runPaths.tmpZipPath).toBe(join(runPaths.tmpRunDir, 'bulk.zip.tmp'));
      expect(runPaths.finalZipPath).toBe(join(runPaths.finalDir, 'bulk.zip'));
    });
  });

  describe('ensureArtifactDirs', () => {
    it('should create required directories', async () => {
      const paths = getArtifactPaths(mockRoot);
      await ensureArtifactDirs(paths);
      
      expect(fs.mkdir).toHaveBeenCalledWith(paths.bulkDir, { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith(paths.datasetsDir, { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith(paths.tmpDir, { recursive: true });
    });
  });

  describe('atomicPublishDataset', () => {
    it('should perform atomic publishing steps in order', async () => {
      const paths = getArtifactPaths(mockRoot);
      const runPaths = getRunPaths(paths, mockRunId, mockDatasetId);
      const mockManifest = {
        dataset_id: mockDatasetId,
        kind: 'bulk',
        sha256: 'abc',
      } as any;

      await atomicPublishDataset(runPaths, mockManifest, paths);

      // Verify sequence of renames and writes
      // 1. zip rename
      // 2. manifest write
      // 3. manifest rename
      // 4. ready marker
      // 5. dir rename
      // 6. latest write
      // 7. latest rename

      expect(fs.rename).toHaveBeenCalledTimes(4);
      expect(fs.writeFile).toHaveBeenCalledTimes(3);
      
      // Check final dir rename
      expect(fs.rename).toHaveBeenCalledWith(runPaths.tmpRunDir, runPaths.finalDir);
      
      // Check latest.json update
      expect(fs.rename).toHaveBeenCalledWith(
        join(paths.bulkDir, 'latest.json.tmp'),
        paths.latestJsonPath
      );
    });
  });
});
