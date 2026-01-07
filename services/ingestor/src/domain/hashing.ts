/**
 * @fileoverview Stable record hashing for change detection
 */

import { createHash } from 'node:crypto';
import type { HashableUnitFields } from '@energy/shared';

/**
 * Ordered keys for stable hashing
 */
const HASH_KEYS: (keyof HashableUnitFields)[] = [
  'tech',
  'commissioning_date',
  'decommissioning_date',
  'brutto_kw',
  'netto_kw',
  'bundesland_code',
  'ags',
  'plz',
];

/**
 * Compute a stable SHA-256 hash for a unit record
 * Uses ordered keys to ensure deterministic output
 */
export function computeStableHash(fields: HashableUnitFields): string {
  const orderedFields: Record<string, unknown> = {};

  for (const key of HASH_KEYS) {
    orderedFields[key] = fields[key];
  }

  const json = JSON.stringify(orderedFields);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Check if two hashes are equal
 */
export function hashesEqual(hash1: string, hash2: string): boolean {
  return hash1 === hash2;
}
