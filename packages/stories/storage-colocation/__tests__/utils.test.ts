/**
 * @fileoverview Unit tests for storage colocation utilities
 */

import { describe, it, expect } from 'vitest';
import { extractPeriod, computeLagMonths, binLag } from '../src/utils.js';

describe('Storage Colocation Utils', () => {
  describe('extractPeriod', () => {
    it('should extract YYYY-MM from valid date', () => {
      expect(extractPeriod('2026-01-15')).toBe('2026-01');
      expect(extractPeriod('2025-12-31')).toBe('2025-12');
    });

    it('should return null for invalid dates', () => {
      expect(extractPeriod(null)).toBeNull();
      expect(extractPeriod('')).toBeNull();
      expect(extractPeriod('invalid')).toBeNull();
      expect(extractPeriod('2026-1-5')).toBeNull(); // Wrong format
    });

    it('should handle edge cases', () => {
      expect(extractPeriod('2026-01-01')).toBe('2026-01');
      expect(extractPeriod('2026-12-31')).toBe('2026-12');
    });
  });

  describe('computeLagMonths', () => {
    it('should compute positive lag (storage after PV)', () => {
      expect(computeLagMonths('2020-01-15', '2020-04-20')).toBe(3);
      expect(computeLagMonths('2020-01-01', '2021-01-01')).toBe(12);
      expect(computeLagMonths('2020-06-15', '2022-06-15')).toBe(24);
    });

    it('should compute negative lag (PV after storage)', () => {
      expect(computeLagMonths('2020-05-15', '2020-02-20')).toBe(-3);
      expect(computeLagMonths('2021-01-01', '2020-01-01')).toBe(-12);
    });

    it('should compute zero lag (same month)', () => {
      expect(computeLagMonths('2020-01-01', '2020-01-31')).toBe(0);
      expect(computeLagMonths('2020-06-15', '2020-06-20')).toBe(0);
    });

    it('should return null for invalid dates', () => {
      expect(computeLagMonths(null, '2020-01-01')).toBeNull();
      expect(computeLagMonths('2020-01-01', null)).toBeNull();
      expect(computeLagMonths('invalid', '2020-01-01')).toBeNull();
      expect(computeLagMonths('2020-01-01', 'invalid')).toBeNull();
    });

    it('should handle multi-year lags', () => {
      expect(computeLagMonths('2015-01-01', '2020-01-01')).toBe(60); // 5 years
      expect(computeLagMonths('2010-06-01', '2018-06-01')).toBe(96); // 8 years
    });
  });

  describe('binLag', () => {
    it('should bin negative lags as pv_after_storage', () => {
      expect(binLag(-1)).toBe('pv_after_storage');
      expect(binLag(-12)).toBe('pv_after_storage');
    });

    it('should bin 0-3 months', () => {
      expect(binLag(0)).toBe('0-3m');
      expect(binLag(1)).toBe('0-3m');
      expect(binLag(3)).toBe('0-3m');
    });

    it('should bin 3-12 months', () => {
      expect(binLag(4)).toBe('3-12m');
      expect(binLag(6)).toBe('3-12m');
      expect(binLag(12)).toBe('3-12m');
    });

    it('should bin 1-2 years', () => {
      expect(binLag(13)).toBe('1-2y');
      expect(binLag(18)).toBe('1-2y');
      expect(binLag(24)).toBe('1-2y');
    });

    it('should bin 2-4 years', () => {
      expect(binLag(25)).toBe('2-4y');
      expect(binLag(36)).toBe('2-4y');
      expect(binLag(48)).toBe('2-4y');
    });

    it('should bin 4-6 years', () => {
      expect(binLag(49)).toBe('4-6y');
      expect(binLag(60)).toBe('4-6y');
      expect(binLag(72)).toBe('4-6y');
    });

    it('should bin 6+ years', () => {
      expect(binLag(73)).toBe('6y+');
      expect(binLag(96)).toBe('6y+');
      expect(binLag(120)).toBe('6y+');
    });

    it('should handle boundary values correctly', () => {
      expect(binLag(3)).toBe('0-3m');
      expect(binLag(4)).toBe('3-12m');
      expect(binLag(12)).toBe('3-12m');
      expect(binLag(13)).toBe('1-2y');
      expect(binLag(24)).toBe('1-2y');
      expect(binLag(25)).toBe('2-4y');
      expect(binLag(48)).toBe('2-4y');
      expect(binLag(49)).toBe('4-6y');
      expect(binLag(72)).toBe('4-6y');
      expect(binLag(73)).toBe('6y+');
    });
  });
});
