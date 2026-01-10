/**
 * @fileoverview Storage Wave story builder
 * Aggregates storage units by day + bundesland
 */

import type { DbClient } from '../types.js';
import type { StoryBuilder, StoryResult, StorageRecord } from '../types.js';
import { parseNumber, parseDate, extractBundeslandAgs } from '../io/xmlParser.js';
import { getPool } from '../db/pool.js';

interface AggValue {
  count: number;
  sum_netto_kw: number;
  sum_inverter_kw: number;
}

/**
 * Create a StorageWave builder instance with incremental DB upserts
 */
export function createStorageWaveBuilder(initialExportDate: string = ''): StoryBuilder<StorageRecord> {
  const aggregates = new Map<string, AggValue>();
  let processedCount = 0;
  let exportDate = initialExportDate;

  const makeKey = (day: string, bl: string) => `${day}|${bl}`;

  /**
   * Flush aggregates to staging table using upsert
   */
  async function flushToDb(): Promise<void> {
    if (aggregates.size === 0 || !exportDate) return;

    const pool = getPool();
    const rows = Array.from(aggregates.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const CHUNK_SIZE = 1000;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const [key, value] of chunk) {
        const [day, bundesland_ags] = key.split('|');
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`);
        values.push(exportDate, day, bundesland_ags, value.count, value.sum_netto_kw, value.sum_inverter_kw);
        paramIndex += 6;
      }

      await pool.query(`
        INSERT INTO story_storage_day_region_staging 
          (export_date, day, bundesland_ags, count_units, sum_netto_kw, sum_inverter_kw)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (export_date, day, bundesland_ags) 
        DO UPDATE SET
          count_units = story_storage_day_region_staging.count_units + EXCLUDED.count_units,
          sum_netto_kw = story_storage_day_region_staging.sum_netto_kw + EXCLUDED.sum_netto_kw,
          sum_inverter_kw = story_storage_day_region_staging.sum_inverter_kw + EXCLUDED.sum_inverter_kw
      `, values);
    }

    aggregates.clear();
  }

  return {
    name: 'storageWave',
    
    getInterestedElement(filename: string): string | null {
      if (/^EinheitenStromSpeicher.*\.xml$/i.test(filename)) return 'EinheitStromSpeicher';
      if (/^AnlagenStromSpeicher.*\.xml$/i.test(filename)) return 'AnlageStromSpeicher';
      return null;
    },

    async onRecord(record: StorageRecord): Promise<void> {
      const day = parseDate(record.Inbetriebnahmedatum);
      if (!day) return;

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

    async onPrepare(client: DbClient): Promise<void> {
      // Clean staging table for this export_date
      await client.query(`
        DELETE FROM story_storage_day_region_staging 
        WHERE export_date = $1
      `, [exportDate]);
    },

    async onFileComplete(): Promise<void> {
      await flushToDb();
    },

    async finalizeAndWrite(client: DbClient): Promise<StoryResult> {
      const startTime = Date.now();

      // Flush any remaining in-memory aggregates
      await flushToDb();

      // Copy from staging to final table
      const result = await client.query(`
        INSERT INTO story_storage_day_region (export_date, day, bundesland_ags, count_units, sum_netto_kw, sum_inverter_kw)
        SELECT export_date, day, bundesland_ags, count_units, sum_netto_kw, sum_inverter_kw
        FROM story_storage_day_region_staging
        WHERE export_date = $1
      `, [exportDate]);

      // Clean up staging data
      await client.query(`
        DELETE FROM story_storage_day_region_staging 
        WHERE export_date = $1
      `, [exportDate]);

      return {
        recordsProcessed: processedCount,
        rowsInserted: result.rowCount ?? 0,
        duration_ms: Date.now() - startTime,
      };
    },

    reset(): void {
      aggregates.clear();
      processedCount = 0;
      exportDate = '';
    },
  };
}
