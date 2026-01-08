/**
 * @fileoverview Solar Wave story builder
 * Aggregates solar units by day + bundesland
 */

import type { Pool } from 'pg';
import type { StoryBuilder, StoryResult, SolarRecord } from '../types.js';
import { parseNumber, parseDate, extractBundeslandAgs } from '../io/xmlParser.js';
import { bulkInsert } from '../db/write.js';

interface AggKey {
  day: string;
  bundesland_ags: string;
}

interface AggValue {
  count: number;
  sum_netto_kw: number;
}

/**
 * Create a SolarWave builder instance
 */
export function createSolarWaveBuilder(): StoryBuilder<SolarRecord> {
  const aggregates = new Map<string, AggValue>();
  let processedCount = 0;

  const makeKey = (day: string, bl: string) => `${day}|${bl}`;

  return {
    name: 'solarWave',
    
    filePatterns: [/^EinheitenSolar.*\.xml$/i],

    onRecord(record: SolarRecord): void {
      const day = parseDate(record.Inbetriebnahmedatum);
      if (!day) return; // Skip records without commissioning date

      const bundesland_ags = extractBundeslandAgs(record.Gemeindeschluessel) ?? 'NULL';
      const netto_kw = parseNumber(record.Nettonennleistung) ?? 0;

      const key = makeKey(day, bundesland_ags);
      const existing = aggregates.get(key);

      if (existing) {
        existing.count++;
        existing.sum_netto_kw += netto_kw;
      } else {
        aggregates.set(key, {
          count: 1,
          sum_netto_kw: netto_kw,
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
          bundesland_ags: bundesland_ags === 'NULL' ? null : bundesland_ags,
          count_units: value.count,
          sum_netto_kw: value.sum_netto_kw,
        };
      });

      const inserted = await bulkInsert(
        pool,
        'story_solar_day_region',
        ['export_date', 'day', 'bundesland_ags', 'count_units', 'sum_netto_kw'],
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
