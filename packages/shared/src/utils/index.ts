/**
 * @fileoverview Shared utility functions for the Energy-Unit Statistics Platform
 */

import { createHash } from 'node:crypto';
import type { HashableUnitFields, TechType } from '../types/index.js';

/**
 * Parse a date string in YYYY-MM-DD format
 * Returns null for invalid, empty, or missing dates
 */
export function parseDate(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  // Validate YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(trimmed)) {
    return null;
  }

  // Validate it's a real date
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    return null;
  }

  return trimmed;
}

/**
 * Parse a numeric value from string
 * Returns null for invalid, empty, or missing values
 * Handles both dot and comma as decimal separators
 */
export function parseNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  // Replace comma with dot for European format numbers
  const normalized = trimmed.replace(',', '.');

  const num = parseFloat(normalized);
  if (isNaN(num)) {
    return null;
  }

  return num;
}

/**
 * Normalize empty strings to null
 */
export function normalizeEmpty(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Compute a stable SHA-256 hash for unit record fields
 * Uses sorted keys to ensure deterministic output regardless of object property order
 */
export function computeRecordHash(fields: HashableUnitFields): string {
  // Define the exact order of keys for stable hashing
  const orderedKeys: (keyof HashableUnitFields)[] = [
    'tech',
    'commissioning_date',
    'decommissioning_date',
    'brutto_kw',
    'netto_kw',
    'bundesland_code',
    'ags',
    'plz',
  ];

  // Build object with sorted keys
  const orderedFields: Record<string, unknown> = {};
  for (const key of orderedKeys) {
    orderedFields[key] = fields[key];
  }

  // Create stable JSON string
  const json = JSON.stringify(orderedFields);

  // Compute SHA-256 hash
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Infer technology type from XML filename
 */
export function inferTechFromFilename(filename: string): TechType {
  const normalizedName = filename.toLowerCase();

  if (normalizedName.includes('solar')) {
    return 'solar';
  }
  if (normalizedName.includes('wind')) {
    return 'wind';
  }
  if (normalizedName.includes('biomasse') || normalizedName.includes('biomass')) {
    return 'biomass';
  }
  if (normalizedName.includes('wasser') || normalizedName.includes('hydro')) {
    return 'hydro';
  }
  if (normalizedName.includes('speicher') || normalizedName.includes('storage')) {
    return 'storage';
  }

  return 'other';
}

/**
 * Format date for SQL parameter (YYYY-MM-DD)
 */
export function formatDateForSql(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Parse ISO date string to Date object
 */
export function parseIsoDate(value: string): Date {
  return new Date(value);
}

/**
 * Generate a date range array between start and end (inclusive)
 */
export function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(formatDateForSql(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chunk an array into smaller arrays of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Validate that a value is a valid tech type
 */
export function isValidTechType(value: string): value is TechType {
  return ['solar', 'wind', 'biomass', 'hydro', 'storage', 'other'].includes(value);
}

/**
 * Extract bundesland AGS from Gemeindeschluessel (first 2 digits)
 */
export function extractBundeslandAgs(ags: string | undefined | null): string | null {
  if (!ags || ags.length < 2) return null;
  return ags.substring(0, 2);
}

/**
 * Get first day of month from a date string (YYYY-MM-DD)
 */
export function getMonthStart(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length < 2) return null;
  return `${parts[0]}-${parts[1]}-01`;
}

/**
 * German Bundesland codes
 */
export const BUNDESLAND_CODES: Record<string, string> = {
  '01': 'Schleswig-Holstein',
  '02': 'Hamburg',
  '03': 'Niedersachsen',
  '04': 'Bremen',
  '05': 'Nordrhein-Westfalen',
  '06': 'Hessen',
  '07': 'Rheinland-Pfalz',
  '08': 'Baden-Württemberg',
  '09': 'Bayern',
  '10': 'Saarland',
  '11': 'Berlin',
  '12': 'Brandenburg',
  '13': 'Mecklenburg-Vorpommern',
  '14': 'Sachsen',
  '15': 'Sachsen-Anhalt',
  '16': 'Thüringen',
} as const;

export * from './histogram.js';
