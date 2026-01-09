/**
 * @fileoverview Registration Lag story builder
 * Computes lag between commissioning and registration dates
 */

import type { Pool } from 'pg';
import type { StoryBuilder, StoryResult, StorageRecord, SolarRecord } from '../types.js';
import { parseDate, extractBundeslandAgs, getMonthStart } from '../io/xmlParser.js';
import { bulkInsert } from '../db/write.js';

interface LagBucket {
  lags: number[];
}

/**
 * Compute percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0;
}

/**
 * Compute lag in days between two date strings
 */
function computeLagDays(
  commissioningDate: string | null,
  registrationDate: string | null
): number | null {
  if (!commissioningDate || !registrationDate) return null;
  
  const commissioning = new Date(commissioningDate);
  const registration = new Date(registrationDate);
  
  if (isNaN(commissioning.getTime()) || isNaN(registration.getTime())) return null;
  
  const diffMs = registration.getTime() - commissioning.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Create a RegistrationLag builder for a specific tech type
 */
export function createRegistrationLagBuilder(
  tech: 'storage' | 'solar'
): StoryBuilder<StorageRecord | SolarRecord> {
  // Aggregates by month+bundesland
  const buckets = new Map<string, LagBucket>();
  let processedCount = 0;

  const makeKey = (month: string, bl: string) => `${month}|${bl}`;

  const filePatterns =
    tech === 'storage'
      ? [/^EinheitenStromSpeicher.*\.xml$/i, /^AnlagenStromSpeicher.*\.xml$/i]
      : [/^EinheitenSolar.*\.xml$/i];

  return {
    name: `registrationLag_${tech}`,
    filePatterns,

    onRecord(record: StorageRecord | SolarRecord): void {
      const day = parseDate(record.Inbetriebnahmedatum);
      if (!day) return;

      const month = getMonthStart(day);
      if (!month) return;

      const bundesland_ags = extractBundeslandAgs(record.Gemeindeschluessel) ?? '99';

      const registrationDate = parseDate(record.Registrierungsdatum);
      const lag = computeLagDays(day, registrationDate);

      if (lag !== null) {
        const key = makeKey(month, bundesland_ags);
        const existing = buckets.get(key);

        if (existing) {
          existing.lags.push(lag);
        } else {
          buckets.set(key, { lags: [lag] });
        }
      }

      processedCount++;
    },

    async finalizeAndWrite(pool: Pool, exportDate: string): Promise<StoryResult> {
      const startTime = Date.now();

      const rows = Array.from(buckets.entries()).map(([key, value]) => {
        const [month, bundesland_ags] = key.split('|');
        
        // Sort lags for percentile calculation
        const sorted = [...value.lags].sort((a, b) => a - b);
        
        return {
          export_date: exportDate,
          month,
          tech,
          bundesland_ags,
          count_units: value.lags.length,
          p50_lag_days: percentile(sorted, 50),
          p90_lag_days: percentile(sorted, 90),
        };
      });

      const inserted = await bulkInsert(
        pool,
        'story_registration_lag_month',
        [
          'export_date',
          'month',
          'tech',
          'bundesland_ags',
          'count_units',
          'p50_lag_days',
          'p90_lag_days',
        ],
        rows
      );

      return {
        recordsProcessed: processedCount,
        rowsInserted: inserted,
        duration_ms: Date.now() - startTime,
      };
    },

    reset(): void {
      buckets.clear();
      processedCount = 0;
    },
  };
}
