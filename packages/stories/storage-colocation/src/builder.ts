/**
 * @fileoverview Storage Colocation story builder logic
 */

import type { 
  DbClient, 
  StoryBuilder, 
  StoryResult, 
  SolarRecord, 
  StorageRecord 
} from '@mastrpiece/shared';
import { 
  parseDate, 
  extractBundeslandAgs, 
  getMonthStart 
} from '@mastrpiece/shared/utils';

export function createStorageColocationBuilder(initialExportDate: string = ''): StoryBuilder<SolarRecord | StorageRecord> {
  const solarLocations = new Map<string, string>(); 
  const storageUnits = new Map<string, { month: string; bl: string }>();
  
  let processedCount = 0;
  let exportDate = initialExportDate;
  const FLUSH_THRESHOLD = 5000;

  async function flushSolarLocations(client: DbClient): Promise<void> {
    if (solarLocations.size === 0 || !exportDate) return;

    const entries = Array.from(solarLocations.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const CHUNK_SIZE = 1000;

    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const [location_id, bundesland_ags] of chunk) {
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`);
        values.push(exportDate, location_id, bundesland_ags);
        paramIndex += 3;
      }

      await client.query(`
        INSERT INTO story_solar_locations_staging (export_date, location_id, bundesland_ags)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (export_date, location_id) DO NOTHING
      `, values);
    }

    solarLocations.clear();
  }

  async function flushStorageUnits(client: DbClient): Promise<void> {
    if (storageUnits.size === 0 || !exportDate) return;

    const entries = Array.from(storageUnits.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const CHUNK_SIZE = 1000;

    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const [location_id, data] of chunk) {
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
        values.push(exportDate, location_id, data.month, data.bl);
        paramIndex += 4;
      }

      await client.query(`
        INSERT INTO story_storage_units_staging (export_date, location_id, month, bundesland_ags)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (export_date, location_id) DO NOTHING
      `, values);
    }

    storageUnits.clear();
  }

  return {
    name: 'storageColocation',
    
    getInterestedElement(filename: string): string | null {
      // Only process unit-level records which have LokationMaStRNummer
      // AnlagenStromSpeicher records are installation-level and don't have location data
      if (/^EinheitenSolar.*\.xml$/i.test(filename)) return 'EinheitSolar';
      if (/^EinheitenStromSpeicher.*\.xml$/i.test(filename)) return 'EinheitStromSpeicher';
      return null;
    },

    async onRecord(record: any): Promise<void> {
      const mastrNr = record.EinheitMastrNummer || '';
      const locationId = record.LokationMaStRNummer;
      if (!locationId) return;

      if (/^SEE/i.test(mastrNr)) {
        // Solar unit
        const bl = extractBundeslandAgs(record.Gemeindeschluessel) || '99';
        solarLocations.set(locationId, bl);
      } else if (/^SSE/i.test(mastrNr)) {
        // Storage unit
        const day = parseDate(record.Inbetriebnahmedatum);
        if (!day) return;
        const month = getMonthStart(day);
        if (!month) return;
        
        const bl = extractBundeslandAgs(record.Gemeindeschluessel) || '99';
        storageUnits.set(locationId, { month, bl });
        processedCount++;
      }
    },

    async onFileComplete(client: DbClient): Promise<void> {
      await flushSolarLocations(client);
      await flushStorageUnits(client);
    },

    async onPrepare(client: DbClient): Promise<void> {
      await client.query('DELETE FROM story_solar_locations_staging WHERE export_date = $1', [exportDate]);
      await client.query('DELETE FROM story_storage_units_staging WHERE export_date = $1', [exportDate]);
      await client.query('DELETE FROM story_storage_colocation_staging WHERE export_date = $1', [exportDate]);
    },

    async finalizeAndWrite(client: DbClient): Promise<StoryResult> {
      const startTime = Date.now();
      await flushSolarLocations(client);
      await flushStorageUnits(client);

      // Aggregate via SQL JOIN
      await client.query(`
        INSERT INTO story_storage_colocation_staging (export_date, month, bundesland_ags, storage_units, colocated_units)
        SELECT 
          su.export_date,
          su.month,
          su.bundesland_ags,
          COUNT(*) as storage_units,
          COUNT(sl.location_id) as colocated_units
        FROM story_storage_units_staging su
        LEFT JOIN story_solar_locations_staging sl 
          ON su.export_date = sl.export_date 
          AND su.location_id = sl.location_id
        WHERE su.export_date = $1
        GROUP BY su.export_date, su.month, su.bundesland_ags
      `, [exportDate]);

      const result = await client.query(`
        INSERT INTO story_storage_colocation_month 
          (export_date, month, bundesland_ags, storage_units, colocated_units, colocated_rate)
        SELECT 
          export_date,
          month,
          bundesland_ags,
          storage_units,
          colocated_units,
          CASE WHEN storage_units > 0 
            THEN colocated_units::numeric / storage_units 
            ELSE 0 
          END as colocated_rate
        FROM story_storage_colocation_staging
        WHERE export_date = $1
        ON CONFLICT (export_date, month, bundesland_ags) DO UPDATE SET
          storage_units = EXCLUDED.storage_units,
          colocated_units = EXCLUDED.colocated_units,
          colocated_rate = EXCLUDED.colocated_rate
      `, [exportDate]);

      // Copy solar locations to permanent table
      await client.query(`
        INSERT INTO story_solar_locations (export_date, location_id, bundesland_ags)
        SELECT export_date, location_id, bundesland_ags
        FROM story_solar_locations_staging
        WHERE export_date = $1
        ON CONFLICT (export_date, location_id) DO NOTHING
      `, [exportDate]);

      // Cleanup
      await client.query('DELETE FROM story_solar_locations_staging WHERE export_date = $1', [exportDate]);
      await client.query('DELETE FROM story_storage_units_staging WHERE export_date = $1', [exportDate]);
      await client.query('DELETE FROM story_storage_colocation_staging WHERE export_date = $1', [exportDate]);

      return {
        recordsProcessed: processedCount,
        rowsInserted: result.rowCount ?? 0,
        duration_ms: Date.now() - startTime,
      };
    },

    reset(): void {
      solarLocations.clear();
      storageUnits.clear();
      processedCount = 0;
      exportDate = '';
    },
  };
}
