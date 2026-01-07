/**
 * @fileoverview Unit tests for hashing
 */

import { describe, it, expect } from 'vitest';
import { computeRecordHash, type HashableUnitFields } from '@energy/shared';
import { computeStableHash } from '../domain/hashing.js';

describe('Hashing', () => {
  describe('computeRecordHash', () => {
    it('should produce consistent hash for same input', () => {
      const fields: HashableUnitFields = {
        tech: 'solar',
        commissioning_date: '2026-01-06',
        decommissioning_date: null,
        brutto_kw: 12.5,
        netto_kw: 12.0,
        bundesland_code: '08',
        ags: '08111000',
        plz: '70173',
      };

      const hash1 = computeRecordHash(fields);
      const hash2 = computeRecordHash(fields);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it('should produce different hash for different input', () => {
      const fields1: HashableUnitFields = {
        tech: 'solar',
        commissioning_date: '2026-01-06',
        decommissioning_date: null,
        brutto_kw: 12.5,
        netto_kw: 12.0,
        bundesland_code: '08',
        ags: '08111000',
        plz: '70173',
      };

      const fields2: HashableUnitFields = {
        ...fields1,
        brutto_kw: 15.0, // Different power
      };

      const hash1 = computeRecordHash(fields1);
      const hash2 = computeRecordHash(fields2);

      expect(hash1).not.toBe(hash2);
    });

    it('should be stable across property order', () => {
      // Create objects with different property order
      const fields1: HashableUnitFields = {
        tech: 'solar',
        commissioning_date: '2026-01-06',
        decommissioning_date: null,
        brutto_kw: 12.5,
        netto_kw: 12.0,
        bundesland_code: '08',
        ags: '08111000',
        plz: '70173',
      };

      // Create object with different insertion order
      const fields2: HashableUnitFields = {
        plz: '70173',
        ags: '08111000',
        bundesland_code: '08',
        netto_kw: 12.0,
        brutto_kw: 12.5,
        decommissioning_date: null,
        commissioning_date: '2026-01-06',
        tech: 'solar',
      };

      const hash1 = computeRecordHash(fields1);
      const hash2 = computeRecordHash(fields2);

      expect(hash1).toBe(hash2);
    });

    it('should handle null values correctly', () => {
      const fieldsWithNulls: HashableUnitFields = {
        tech: 'solar',
        commissioning_date: null,
        decommissioning_date: null,
        brutto_kw: null,
        netto_kw: null,
        bundesland_code: null,
        ags: null,
        plz: null,
      };

      const hash = computeRecordHash(fieldsWithNulls);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);

      // Should be consistent
      expect(computeRecordHash(fieldsWithNulls)).toBe(hash);
    });
  });

  describe('computeStableHash', () => {
    it('should produce same result as computeRecordHash', () => {
      const fields: HashableUnitFields = {
        tech: 'wind',
        commissioning_date: '2025-12-15',
        decommissioning_date: null,
        brutto_kw: 3500,
        netto_kw: 3400,
        bundesland_code: '01',
        ags: '01002000',
        plz: '24103',
      };

      const hash1 = computeRecordHash(fields);
      const hash2 = computeStableHash(fields);

      expect(hash1).toBe(hash2);
    });
  });
});
