/**
 * @fileoverview Unit tests for dataset ID generation
 */

import { describe, it, expect } from 'vitest';
import { generateDatasetId, extractExportDateFromId } from '../domain/datasetId.js';

describe('Dataset ID', () => {
  describe('generateDatasetId', () => {
    it('should generate ID with portal timestamp', () => {
      const sha256 = 'a1b2c3d4e5f6789012345678901234567890abcdef123456789012345678901234';
      const timestamp = new Date('2026-01-07T05:00:00+01:00');

      const id = generateDatasetId(sha256, timestamp);

      expect(id).toMatch(/^20260107T0[45]00_sha256_a1b2c3d4e5f6$/);
    });

    it('should generate ID with exportDate prefix when no timestamp', () => {
      const sha256 = 'a1b2c3d4e5f6789012345678901234567890abcdef123456789012345678901234';

      const id = generateDatasetId(sha256, null);

      expect(id).toMatch(/^exportDate_\d{8}_sha256_a1b2c3d4e5f6$/);
    });

    it('should use first 12 characters of SHA256', () => {
      const sha256 = '9f3a12b4c8d1abcdef1234567890abcdef1234567890abcdef1234567890abcd';
      const timestamp = new Date('2026-01-07T05:00:00+01:00');

      const id = generateDatasetId(sha256, timestamp);

      expect(id).toContain('_sha256_9f3a12b4c8d1');
    });
  });

  describe('extractExportDateFromId', () => {
    it('should extract date from timestamp-style ID', () => {
      const date = extractExportDateFromId('20260107T0500_sha256_9f3a12b4c8d1');
      expect(date).toBe('2026-01-07');
    });

    it('should extract date from exportDate-style ID', () => {
      const date = extractExportDateFromId('exportDate_20260107_sha256_9f3a12b4c8d1');
      expect(date).toBe('2026-01-07');
    });
  });
});
