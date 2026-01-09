/**
 * @fileoverview Storage Wave story builder
 * Aggregates storage units by day + bundesland
 */

import type { Pool } from 'pg';
import type { StoryBuilder, StoryResult, StorageRecord } from '../types.js';
import { parseNumber, parseDate, extractBundeslandAgs } from '../io/xmlParser.js';
import { bulkInsert } from '../db/write.js';

interface AggKey {
  day: string;
  bundesland_ags: string;
}

interface AggValue {
  count: number;
  sum_netto_kw: number;
  sum_inverter_kw: number;
}

/**
 * Create a StorageWave builder instance
 */
export function createStorageWaveBuilder(): StoryBuilder<StorageRecord> {
  const aggregates = new Map<string, AggValue>();
  let processedCount = 0;

  const makeKey = (day: string, bl: string) => `${day}|${bl}`;

  return {
    name: 'storageWave',
    
    filePatterns: [/^EinheitenStromSpeicher.*\.xml$/i, /^AnlagenStromSpeicher.*\.xml$/i],

    onRecord(record: StorageRecord): void {
      const day = parseDate(record.Inbetriebnahmedatum);
      if (!day) return; // Skip records without commissioning date

      const bundesland_ags = extractBundeslandAgs(record.Gemeindeschluessel) ?? '99';
      const netto_kw = parseNumber(record.Nettonennleistung) ?? 0;
      const inverter_kw = parseNumber(record.ZugeordnenteWirkleistungWechselrichter) ?? 0;

      const key = makeKey(day, bundesland_ags);
      const existing = aggregates.get(key);

      if (existing) {
        existing.count++;
        existing.sum_netto_kw += netto_kw;
        existing.sum_inverter_kw += inverter_kw;
      } else {
        aggregates.set(key, {
          count: 1,
          sum_netto_kw: netto_kw,
          sum_inverter_kw: inverter_kw,
        });
      }

      processedCount++;
    },

    async finalizeAndWrite(pool: Pool, exportDate: string): Promise<StoryResult> {
      const startTime = Date.now();

      const rows = Array.from(aggregates.entries()).map(([key, value]) => {
        const [day, bundesland_ags] = key.split('|');
        return {
          export_date: exportDate,
          day,
          bundesland_ags,
          count_units: value.count,
          sum_netto_kw: value.sum_netto_kw,
          sum_inverter_kw: value.sum_inverter_kw,
        };
      });

      const inserted = await bulkInsert(
        pool,
        'story_storage_day_region',
        ['export_date', 'day', 'bundesland_ags', 'count_units', 'sum_netto_kw', 'sum_inverter_kw'],
        rows
      );

      return {
        recordsProcessed: processedCount,
        rowsInserted: inserted,
        duration_ms: Date.now() - startTime,
      };
    },

    reset(): void {
      aggregates.clear();
      processedCount = 0;
    },
  };
}
