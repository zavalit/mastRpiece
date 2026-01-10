/**
 * @fileoverview Storage Colocation story builder with incremental DB writes
 * Uses two-pass approach with staging tables
 */

import type { DbClient } from '../types.js';
import type { StoryBuilder, StoryResult, SolarRecord, StorageRecord } from '../types.js';
import { parseDate, extractBundeslandAgs, getMonthStart } from '../io/xmlParser.js';
import { getPool } from '../db/pool.js';
import { streamZipEntries } from '../io/zipReader.js';
import { parseXmlWithCallback } from '../io/xmlParser.js';

interface AggValue {
  storage_units: number;
  colocated_units: number;
}

/**
 * Create StorageColocation story builder with incremental DB writes
 */
export function createStorageColocationStory(): StoryBuilder<SolarRecord | StorageRecord> {
  const solarLocations = new Map<string, string>();  // Buffer for one file
  const aggregates = new Map<string, AggValue>();
  let processedCount = 0;
  let exportDate = '';

  const makeKey = (month: string, bl: string) => `${month}|${bl}`;

  async function flushSolarLocations(): Promise<void> {
    if (solarLocations.size === 0 || !exportDate) return;

    const pool = getPool();
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const [location_id, bundesland_ags] of solarLocations.entries()) {
      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`);
      values.push(exportDate, location_id, bundesland_ags);
      paramIndex += 3;
    }

    await pool.query(`
      INSERT INTO story_solar_locations_staging (export_date, location_id, bundesland_ags)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (export_date, location_id) DO NOTHING
    `, values);

    solarLocations.clear();
  }

  async function flushAggregates(): Promise<void> {
    if (aggregates.size === 0 || !exportDate) return;

    const pool = getPool();
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const [key, value] of aggregates.entries()) {
      const [month, bundesland_ags] = key.split('|');
      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
      values.push(exportDate, month, bundesland_ags, value.storage_units, value.colocated_units);
      paramIndex += 5;
    }

    await pool.query(`
      INSERT INTO story_storage_colocation_staging 
        (export_date, month, bundesland_ags, storage_units, colocated_units)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (export_date, month, bundesland_ags) 
      DO UPDATE SET
        storage_units = story_storage_colocation_staging.storage_units + EXCLUDED.storage_units,
        colocated_units = story_storage_colocation_staging.colocated_units + EXCLUDED.colocated_units
    `, values);

    aggregates.clear();
  }

  return {
    name: 'storageColocation',
    
    getInterestedElement(filename: string): string | null {
      if (/^EinheitenSolar.*\.xml$/i.test(filename)) return 'EinheitSolar';
      return null;
    },

    onRecord(record: any): void {
      const mastrNr = record.EinheitMastrNummer || '';
      if (/^SEE/i.test(mastrNr) && record.LokationMaStRNummer) {
        const bl = extractBundeslandAgs(record.Gemeindeschluessel) || '99';
        solarLocations.set(record.LokationMaStRNummer, bl);
      }
    },

    async onFileComplete(): Promise<void> {
      await flushSolarLocations();
    },

    async prepareWrite(client: DbClient, exportDate_: string, bulkPath: string): Promise<void> {
      exportDate = exportDate_;
      
      // Clean staging tables
      await client.query('DELETE FROM story_solar_locations_staging WHERE export_date = $1', [exportDate]);
      await client.query('DELETE FROM story_storage_colocation_staging WHERE export_date = $1', [exportDate]);

      // Flush any remaining solar locations
      await flushSolarLocations();

      // Second pass: process storage files with incremental flushes
      for await (const entry of streamZipEntries(bulkPath)) {
        const filename = entry.filename;
        
        let recordElement: string | null = null;
        if (/^EinheitenStromSpeicher.*\.xml$/i.test(filename)) {
          recordElement = 'EinheitStromSpeicher';
        } else if (/^AnlagenStromSpeicher.*\.xml$/i.test(filename)) {
          recordElement = 'AnlageStromSpeicher';
        }

        if (!recordElement) {
          entry.stream.resume();
          await new Promise<void>((resolve) => {
            entry.stream.on('end', resolve);
            entry.stream.on('error', resolve);
          });
          continue;
        }

        await parseXmlWithCallback<StorageRecord>(
          entry.stream,
          recordElement,
          (record) => {
            const day = parseDate(record.Inbetriebnahmedatum);
            if (!day) return;

            const month = getMonthStart(day);
            if (!month) return;

            const bundesland_ags = extractBundeslandAgs(record.Gemeindeschluessel) ?? '99';
            const key = makeKey(month, bundesland_ags);
            const existing = aggregates.get(key);

            if (existing) {
              existing.storage_units++;
            } else {
              aggregates.set(key, {
                storage_units: 1,
                colocated_units: 0,
              });
            }
            processedCount++;
          }
        );

        // Flush after each file
        await flushAggregates();
      }

      // Compute colocation by joining with staging table
      await client.query(`
        UPDATE story_storage_colocation_staging sc
        SET colocated_units = (
          SELECT COUNT(DISTINCT sr.location_id)
          FROM story_solar_locations_staging sl
          WHERE sl.export_date = sc.export_date
            AND sl.bundesland_ags = sc.bundesland_ags
        )
        WHERE sc.export_date = $1
      `, [exportDate]);
    },

    async finalizeAndWrite(client: DbClient, exportDate_: string): Promise<StoryResult> {
      const startTime = Date.now();
      exportDate = exportDate_;

      // Copy from staging with computed rate
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
      `, [exportDate]);

      // Copy solar locations to final table
      await client.query(`
        INSERT INTO story_solar_locations (export_date, location_id, bundesland_ags)
        SELECT export_date, location_id, bundesland_ags
        FROM story_solar_locations_staging
        WHERE export_date = $1
      `, [exportDate]);

      // Cleanup
      await client.query('DELETE FROM story_solar_locations_staging WHERE export_date = $1', [exportDate]);
      await client.query('DELETE FROM story_storage_colocation_staging WHERE export_date = $1', [exportDate]);

      return {
        recordsProcessed: processedCount,
        rowsInserted: result.rowCount ?? 0,
        duration_ms: Date.now() - startTime,
      };
    },

    reset(): void {
      solarLocations.clear();
      aggregates.clear();
      processedCount = 0;
      exportDate = '';
    },
  };
}
