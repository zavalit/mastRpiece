/**
 * @fileoverview Storage Colocation story builder logic
 */

import type { 
  DbClient, 
  StoryBuilder, 
  StoryResult, 
  StorageRecord,
  SolarRecord
} from '@mastrpiece/shared';
import { parseDate, extractBundeslandAgs } from '@mastrpiece/shared/utils';
import { extractPeriod, computeLagMonths, binLag } from './utils.js';

interface PVFact {
  location_id: string;
  pv_date: string;
  bundesland_ags: string;
}

interface StorageFact {
  location_id: string;
  storage_date: string;
  period: string;
  bundesland_ags: string;
}

const BATCH_SIZE = 4000;

export function createStorageColocationBuilder(initialExportDate: string = ''): StoryBuilder<StorageRecord | SolarRecord> {
  const pvFacts: PVFact[] = [];
  const storageFacts: StorageFact[] = [];
  let exportDate = initialExportDate;
  let pvProcessed = 0;
  let storageProcessed = 0;
  let pvSkipped = 0;
  let storageSkipped = 0;
  let currentFileType: 'pv' | 'storage' | null = null;

  async function flushPVFacts(client: DbClient): Promise<void> {
    if (pvFacts.length === 0 || !exportDate) return;

    for (let i = 0; i < pvFacts.length; i += BATCH_SIZE) {
      const batch = pvFacts.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const fact of batch) {
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
        values.push(exportDate, fact.location_id, fact.pv_date, fact.bundesland_ags);
        paramIndex += 4;
      }

      await client.query(`
        INSERT INTO story_colocation_pv_staging (export_date, location_id, pv_date, bundesland_ags)
        VALUES ${placeholders.join(', ')}
      `, values);
    }

    pvFacts.length = 0;
  }

  async function flushStorageFacts(client: DbClient): Promise<void> {
    if (storageFacts.length === 0 || !exportDate) return;

    for (let i = 0; i < storageFacts.length; i += BATCH_SIZE) {
      const batch = storageFacts.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const fact of batch) {
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
        values.push(exportDate, fact.location_id, fact.storage_date, fact.period, fact.bundesland_ags);
        paramIndex += 5;
      }

      await client.query(`
        INSERT INTO story_colocation_storage_staging (export_date, location_id, storage_date, period, bundesland_ags)
        VALUES ${placeholders.join(', ')}
      `, values);
    }

    storageFacts.length = 0;
  }

  return {
    name: 'storageColocation',

    getInterestedElement(filename: string): string | null {
      // PV files
      if (/^EinheitenSolar.*\.xml$/i.test(filename)) {
        currentFileType = 'pv';
        return 'EinheitSolar';
      }
      // Storage files
      if (/^EinheitenStromSpeicher.*\.xml$/i.test(filename)) {
        currentFileType = 'storage';
        return 'EinheitStromSpeicher';
      }
      if (/^AnlagenStromSpeicher.*\.xml$/i.test(filename)) {
        currentFileType = 'storage';
        return 'AnlageStromSpeicher';
      }
      currentFileType = null;
      return null;
    },

    async onRecord(record: StorageRecord | SolarRecord): Promise<void> {
      const locationId = (record as any).LokationMaStRNummer || (record as any).LokationMastrNummer;
      const commissioningDate = parseDate(record.Inbetriebnahmedatum);

      // Skip if missing location or date
      if (!locationId || !commissioningDate) {
        if (!locationId && !commissioningDate) {
          // Count as skipped
        } else if (!locationId) {
          // Missing location
        } else {
          // Invalid date
        }
        return;
      }

      const bundeslandAgs = extractBundeslandAgs(record.Gemeindeschluessel) || '00';

      // Use the current file type to determine if PV or Storage
      if (currentFileType === 'pv') {
        pvFacts.push({
          location_id: locationId,
          pv_date: commissioningDate,
          bundesland_ags: bundeslandAgs,
        });
        pvProcessed++;
      } else if (currentFileType === 'storage') {
        const period = extractPeriod(commissioningDate);
        if (!period) {
          storageSkipped++;
          return;
        }

        storageFacts.push({
          location_id: locationId,
          storage_date: commissioningDate,
          period,
          bundesland_ags: bundeslandAgs,
        });
        storageProcessed++;
      }
    },

    async onPrepare(client: DbClient): Promise<void> {
      // Clear all staging tables for this export_date
      await client.query('DELETE FROM story_colocation_pv_staging WHERE export_date = $1', [exportDate]);
      await client.query('DELETE FROM story_colocation_storage_staging WHERE export_date = $1', [exportDate]);
      await client.query('DELETE FROM story_colocation_pv_loc_staging WHERE export_date = $1', [exportDate]);
    },

    async onFileComplete(client: DbClient): Promise<void> {
      // Flush both buffers after each file
      await flushPVFacts(client);
      await flushStorageFacts(client);
    },

    async finalizeAndWrite(client: DbClient): Promise<StoryResult> {
      const startTime = Date.now();

      // Flush any remaining facts
      await flushPVFacts(client);
      await flushStorageFacts(client);

      // Step 1: Build earliest PV per location
      await client.query(`
        INSERT INTO story_colocation_pv_loc_staging (export_date, location_id, bundesland_ags, earliest_pv_date)
        SELECT export_date, location_id, bundesland_ags, MIN(pv_date)
        FROM story_colocation_pv_staging
        WHERE export_date = $1
        GROUP BY export_date, location_id, bundesland_ags
        ON CONFLICT (export_date, location_id, bundesland_ags) DO UPDATE SET
          earliest_pv_date = LEAST(EXCLUDED.earliest_pv_date, story_colocation_pv_loc_staging.earliest_pv_date)
      `, [exportDate]);

      // Step 2: Insert storage stats (total vs co-located)
      const statsResult = await client.query(`
        INSERT INTO story_storage_colocation_stats (export_date, period, bundesland_ags, total_storage, colocated_storage)
        SELECT 
          s.export_date,
          s.period,
          s.bundesland_ags,
          COUNT(*) as total_storage,
          COUNT(p.location_id) as colocated_storage
        FROM story_colocation_storage_staging s
        LEFT JOIN story_colocation_pv_loc_staging p
          ON p.export_date = s.export_date 
          AND p.location_id = s.location_id 
          AND p.bundesland_ags = s.bundesland_ags
        WHERE s.export_date = $1
        GROUP BY s.export_date, s.period, s.bundesland_ags
        ON CONFLICT (export_date, period, bundesland_ags) DO UPDATE SET
          total_storage = EXCLUDED.total_storage,
          colocated_storage = EXCLUDED.colocated_storage
      `, [exportDate]);

      // Step 3: Insert lag histogram
      await client.query(`
        INSERT INTO story_storage_colocation_lag_hist (export_date, bundesland_ags, lag_bin, count)
        SELECT 
          s.export_date,
          s.bundesland_ags,
          CASE
            WHEN ((EXTRACT(YEAR FROM s.storage_date::date) - EXTRACT(YEAR FROM p.earliest_pv_date::date)) * 12 +
                  (EXTRACT(MONTH FROM s.storage_date::date) - EXTRACT(MONTH FROM p.earliest_pv_date::date))) < 0 
              THEN 'pv_after_storage'
            WHEN ((EXTRACT(YEAR FROM s.storage_date::date) - EXTRACT(YEAR FROM p.earliest_pv_date::date)) * 12 +
                  (EXTRACT(MONTH FROM s.storage_date::date) - EXTRACT(MONTH FROM p.earliest_pv_date::date))) <= 3 
              THEN '0-3m'
            WHEN ((EXTRACT(YEAR FROM s.storage_date::date) - EXTRACT(YEAR FROM p.earliest_pv_date::date)) * 12 +
                  (EXTRACT(MONTH FROM s.storage_date::date) - EXTRACT(MONTH FROM p.earliest_pv_date::date))) <= 12 
              THEN '3-12m'
            WHEN ((EXTRACT(YEAR FROM s.storage_date::date) - EXTRACT(YEAR FROM p.earliest_pv_date::date)) * 12 +
                  (EXTRACT(MONTH FROM s.storage_date::date) - EXTRACT(MONTH FROM p.earliest_pv_date::date))) <= 24 
              THEN '1-2y'
            WHEN ((EXTRACT(YEAR FROM s.storage_date::date) - EXTRACT(YEAR FROM p.earliest_pv_date::date)) * 12 +
                  (EXTRACT(MONTH FROM s.storage_date::date) - EXTRACT(MONTH FROM p.earliest_pv_date::date))) <= 48 
              THEN '2-4y'
            WHEN ((EXTRACT(YEAR FROM s.storage_date::date) - EXTRACT(YEAR FROM p.earliest_pv_date::date)) * 12 +
                  (EXTRACT(MONTH FROM s.storage_date::date) - EXTRACT(MONTH FROM p.earliest_pv_date::date))) <= 72 
              THEN '4-6y'
            ELSE '6y+'
          END as lag_bin,
          COUNT(*) as count
        FROM story_colocation_storage_staging s
        INNER JOIN story_colocation_pv_loc_staging p
          ON p.export_date = s.export_date AND p.location_id = s.location_id AND p.bundesland_ags = s.bundesland_ags
        WHERE s.export_date = $1
        GROUP BY s.export_date, s.bundesland_ags, lag_bin
        ON CONFLICT (export_date, lag_bin, bundesland_ags) DO UPDATE SET
          count = EXCLUDED.count
      `, [exportDate]);

      // Step 4: Insert Percentiles
      await client.query(`
        INSERT INTO story_storage_colocation_percentiles (
          export_date, period, bundesland_ags, 
          p10, p25, p50, p75, p90, count
        )
        SELECT 
          s.export_date,
          s.period,
          s.bundesland_ags,
          PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY (
            (EXTRACT(YEAR FROM s.storage_date::date) - EXTRACT(YEAR FROM p.earliest_pv_date::date)) * 12 +
            (EXTRACT(MONTH FROM s.storage_date::date) - EXTRACT(MONTH FROM p.earliest_pv_date::date))
          )) as p10,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY (
            (EXTRACT(YEAR FROM s.storage_date::date) - EXTRACT(YEAR FROM p.earliest_pv_date::date)) * 12 +
            (EXTRACT(MONTH FROM s.storage_date::date) - EXTRACT(MONTH FROM p.earliest_pv_date::date))
          )) as p25,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (
            (EXTRACT(YEAR FROM s.storage_date::date) - EXTRACT(YEAR FROM p.earliest_pv_date::date)) * 12 +
            (EXTRACT(MONTH FROM s.storage_date::date) - EXTRACT(MONTH FROM p.earliest_pv_date::date))
          )) as p50,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (
            (EXTRACT(YEAR FROM s.storage_date::date) - EXTRACT(YEAR FROM p.earliest_pv_date::date)) * 12 +
            (EXTRACT(MONTH FROM s.storage_date::date) - EXTRACT(MONTH FROM p.earliest_pv_date::date))
          )) as p75,
          PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY (
            (EXTRACT(YEAR FROM s.storage_date::date) - EXTRACT(YEAR FROM p.earliest_pv_date::date)) * 12 +
            (EXTRACT(MONTH FROM s.storage_date::date) - EXTRACT(MONTH FROM p.earliest_pv_date::date))
          )) as p90,
          COUNT(*) as count
        FROM story_colocation_storage_staging s
        INNER JOIN story_colocation_pv_loc_staging p
          ON p.export_date = s.export_date AND p.location_id = s.location_id AND p.bundesland_ags = s.bundesland_ags
        WHERE s.export_date = $1
        GROUP BY s.export_date, s.period, s.bundesland_ags
        ON CONFLICT (export_date, period, bundesland_ags) DO UPDATE SET
          p10 = EXCLUDED.p10,
          p25 = EXCLUDED.p25,
          p50 = EXCLUDED.p50,
          p75 = EXCLUDED.p75,
          p90 = EXCLUDED.p90,
          count = EXCLUDED.count
      `, [exportDate]);

      // Step 4: Cleanup staging tables
      await client.query('DELETE FROM story_colocation_pv_staging WHERE export_date = $1', [exportDate]);
      await client.query('DELETE FROM story_colocation_storage_staging WHERE export_date = $1', [exportDate]);
      await client.query('DELETE FROM story_colocation_pv_loc_staging WHERE export_date = $1', [exportDate]);

      return {
        recordsProcessed: pvProcessed + storageProcessed,
        rowsInserted: (statsResult.rowCount ?? 0),
        duration_ms: Date.now() - startTime,
      };
    },

    reset(): void {
      pvFacts.length = 0;
      storageFacts.length = 0;
      pvProcessed = 0;
      storageProcessed = 0;
      pvSkipped = 0;
      storageSkipped = 0;
      exportDate = '';
    },
  };
}
