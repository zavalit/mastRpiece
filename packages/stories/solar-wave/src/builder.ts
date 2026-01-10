/**
 * @fileoverview Solar Wave story builder logic
 */

import type { 
  DbClient, 
  StoryBuilder, 
  StoryResult, 
  SolarRecord 
} from '@mastrpiece/shared';
import { 
  parseNumber, 
  parseDate, 
  extractBundeslandAgs 
} from '@mastrpiece/shared/utils';

interface AggValue {
  count: number;
  sum_netto_kw: number;
}

export function createSolarWaveBuilder(initialExportDate: string = ''): StoryBuilder<SolarRecord> {
  const aggregates = new Map<string, AggValue>();
  let processedCount = 0;
  let exportDate = initialExportDate;

  const makeKey = (day: string, bl: string) => `${day}|${bl}`;

  async function flushToDb(client: DbClient): Promise<void> {
    if (aggregates.size === 0 || !exportDate) return;

    const rows = Array.from(aggregates.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const CHUNK_SIZE = 1000;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const [key, value] of chunk) {
        const [day, bundesland_ags] = key.split('|');
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
        values.push(exportDate, day, bundesland_ags, value.count, value.sum_netto_kw);
        paramIndex += 5;
      }

      await client.query(`
        INSERT INTO story_solar_day_region_staging 
          (export_date, day, bundesland_ags, count_units, sum_netto_kw)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (export_date, day, bundesland_ags) 
        DO UPDATE SET
          count_units = story_solar_day_region_staging.count_units + EXCLUDED.count_units,
          sum_netto_kw = story_solar_day_region_staging.sum_netto_kw + EXCLUDED.sum_netto_kw
      `, values);
    }

    aggregates.clear();
  }

  return {
    name: 'solarWave',
    
    getInterestedElement(filename: string): string | null {
      if (/^EinheitenSolar.*\.xml$/i.test(filename)) return 'EinheitSolar';
      return null;
    },

    async onRecord(record: SolarRecord): Promise<void> {
      const day = parseDate(record.Inbetriebnahmedatum);
      if (!day) return;

      const bundesland_ags = extractBundeslandAgs(record.Gemeindeschluessel) ?? '99';
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

    async onPrepare(client: DbClient): Promise<void> {
      await client.query(`
        DELETE FROM story_solar_day_region_staging 
        WHERE export_date = $1
      `, [exportDate]);
    },

    async onFileComplete(client: DbClient): Promise<void> {
      await flushToDb(client);
    },

    async finalizeAndWrite(client: DbClient): Promise<StoryResult> {
      const startTime = Date.now();
      await flushToDb(client);

      const result = await client.query(`
        INSERT INTO story_solar_day_region (export_date, day, bundesland_ags, count_units, sum_netto_kw)
        SELECT export_date, day, bundesland_ags, count_units, sum_netto_kw
        FROM story_solar_day_region_staging
        WHERE export_date = $1
        ON CONFLICT (export_date, day, bundesland_ags) DO UPDATE SET
          count_units = EXCLUDED.count_units,
          sum_netto_kw = EXCLUDED.sum_netto_kw
      `, [exportDate]);

      await client.query(`
        DELETE FROM story_solar_day_region_staging 
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
