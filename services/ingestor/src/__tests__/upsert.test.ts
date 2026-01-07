/**
 * @fileoverview Unit tests for upsert decision logic
 */

import { describe, it, expect } from 'vitest';
import { prepareUnit, determineUpsertDecision } from '../domain/mapping.js';
import type { ParsedUnit } from '@energy/shared';

describe('Upsert Logic', () => {
  describe('prepareUnit', () => {
    it('should set is_active to true when no decommissioning date', () => {
      const parsed: ParsedUnit = {
        unit_id: 'SEE0001',
        tech: 'solar',
        commissioning_date: '2026-01-06',
        decommissioning_date: null,
        brutto_kw: 12.5,
        netto_kw: 12.0,
        bundesland_code: '08',
        ags: '08111000',
        plz: '70173',
      };

      const prepared = prepareUnit(parsed);

      expect(prepared.is_active).toBe(true);
      expect(prepared.record_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should set is_active to false when decommissioned', () => {
      const parsed: ParsedUnit = {
        unit_id: 'SEE0002',
        tech: 'solar',
        commissioning_date: '2024-01-01',
        decommissioning_date: '2025-12-31',
        brutto_kw: 12.5,
        netto_kw: 12.0,
        bundesland_code: '08',
        ags: '08111000',
        plz: '70173',
      };

      const prepared = prepareUnit(parsed);

      expect(prepared.is_active).toBe(false);
    });

    it('should compute hash from relevant fields', () => {
      const parsed1: ParsedUnit = {
        unit_id: 'SEE0001',
        tech: 'solar',
        commissioning_date: '2026-01-06',
        decommissioning_date: null,
        brutto_kw: 12.5,
        netto_kw: 12.0,
        bundesland_code: '08',
        ags: '08111000',
        plz: '70173',
      };

      const parsed2: ParsedUnit = {
        unit_id: 'SEE0002', // Different ID, but same other fields
        tech: 'solar',
        commissioning_date: '2026-01-06',
        decommissioning_date: null,
        brutto_kw: 12.5,
        netto_kw: 12.0,
        bundesland_code: '08',
        ags: '08111000',
        plz: '70173',
      };

      const prepared1 = prepareUnit(parsed1);
      const prepared2 = prepareUnit(parsed2);

      // Hash should be the same because unit_id is not included in hash
      expect(prepared1.record_hash).toBe(prepared2.record_hash);
    });
  });

  describe('determineUpsertDecision', () => {
    it('should return insert for new records', () => {
      const parsed: ParsedUnit = {
        unit_id: 'SEE0001',
        tech: 'solar',
        commissioning_date: '2026-01-06',
        decommissioning_date: null,
        brutto_kw: 12.5,
        netto_kw: 12.0,
        bundesland_code: '08',
        ags: '08111000',
        plz: '70173',
      };

      const prepared = prepareUnit(parsed);
      const decision = determineUpsertDecision(prepared, null);

      expect(decision).toBe('insert');
    });

    it('should return update when hash differs', () => {
      const parsed: ParsedUnit = {
        unit_id: 'SEE0001',
        tech: 'solar',
        commissioning_date: '2026-01-06',
        decommissioning_date: null,
        brutto_kw: 15.0, // Changed
        netto_kw: 14.5,
        bundesland_code: '08',
        ags: '08111000',
        plz: '70173',
      };

      const prepared = prepareUnit(parsed);
      const oldHash = 'different_hash_value_here';
      const decision = determineUpsertDecision(prepared, oldHash);

      expect(decision).toBe('update');
    });

    it('should return unchanged when hash matches', () => {
      const parsed: ParsedUnit = {
        unit_id: 'SEE0001',
        tech: 'solar',
        commissioning_date: '2026-01-06',
        decommissioning_date: null,
        brutto_kw: 12.5,
        netto_kw: 12.0,
        bundesland_code: '08',
        ags: '08111000',
        plz: '70173',
      };

      const prepared = prepareUnit(parsed);
      const sameHash = prepared.record_hash;
      const decision = determineUpsertDecision(prepared, sameHash);

      expect(decision).toBe('unchanged');
    });
  });
});
