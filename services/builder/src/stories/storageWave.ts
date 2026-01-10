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
export function createStorageWaveBuilder(): StoryBuilder<StorageRecord> {
  const aggregates = new Map<string, AggValue>();
  let processedCount = 0;
  let exportDate = '';

  const makeKey = (day: string, bl: string) => `${day}|${bl}`;

  /**
   * Flush aggregates to staging table using upsert
   */
  async function flushToDb(): Promise<void> {
    if (aggregates.size === 0 || !exportDate) return;

    const pool = getPool();
    const rows = Array.from(aggregates.entries());
    
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;
    
    for (const [key, value] of rows) {
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

    aggregates.clear();
  }

  return {
    name: 'storageWave',
    
    getInterestedElement(filename: string): string | null {
      if (/^EinheitenStromSpeicher.*\.xml$/i.test(filename)) return 'EinheitStromSpeicher';
      if (/^AnlagenStromSpeicher.*\.xml$/i.test(filename)) return 'AnlageStromSpeicher';
      return null;
    },

    onRecord(record: StorageRecord): void {
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

    async prepareWrite(client: DbClient, exportDate_: string): Promise<void> {
      exportDate = exportDate_;
      
      // Clean staging table for this export_date
      await client.query(`
        DELETE FROM story_storage_day_region_staging 
        WHERE export_date = $1
      `, [exportDate]);
    },

    async onFileComplete(): Promise<void> {
      await flushToDb();
    },

    async finalizeAndWrite(client: DbClient, exportDate_: string): Promise<StoryResult> {
      const startTime = Date.now();
      exportDate = exportDate_;

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
