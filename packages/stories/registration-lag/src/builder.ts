/**
 * @fileoverview Registration Lag story builder logic
 */

import type { 
  DbClient, 
  StoryBuilder, 
  StoryResult, 
  StorageRecord, 
  SolarRecord 
} from '@mastrpiece/shared';
import { 
  parseDate, 
  extractBundeslandAgs, 
  getMonthStart,
  type Histogram,
  createHistogram,
  addToHistogram,
  histogramPercentile
} from '@mastrpiece/shared/utils';

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

export function createRegistrationLagBuilder(initialExportDate: string = ''): StoryBuilder<StorageRecord | SolarRecord> {
  const storageHistograms = new Map<string, Histogram>();
  const solarHistograms = new Map<string, Histogram>();
  let processedCount = 0;
  let exportDate = initialExportDate;

  const makeKey = (month: string, bl: string) => `${month}|${bl}`;

  function getOrCreateHistogram(histograms: Map<string, Histogram>, key: string): Histogram {
    let histogram = histograms.get(key);
    if (!histogram) {
      histogram = createHistogram();
      histograms.set(key, histogram);
    }
    return histogram;
  }

  function processRecord(
    record: StorageRecord | SolarRecord,
    histograms: Map<string, Histogram>
  ): void {
    const day = parseDate(record.Inbetriebnahmedatum);
    if (!day) return;

    const month = getMonthStart(day);
    if (!month) return;

    const bundesland_ags = extractBundeslandAgs(record.Gemeindeschluessel) ?? '99';
    const registrationDate = parseDate(record.Registrierungsdatum);
    const lag = computeLagDays(day, registrationDate);

    if (lag !== null) {
      const key = makeKey(month, bundesland_ags);
      const histogram = getOrCreateHistogram(histograms, key);
      addToHistogram(histogram, lag);
    }

    processedCount++;
  }

  async function flushHistograms(client: DbClient, tech: string, histograms: Map<string, Histogram>): Promise<void> {
    if (histograms.size === 0 || !exportDate) return;

    const entries = Array.from(histograms.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const CHUNK_SIZE = 1000;

    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const [key, histogram] of chunk) {
        const [month, bundesland_ags] = key.split('|');
        const p50 = histogramPercentile(histogram, 50);
        const p90 = histogramPercentile(histogram, 90);

        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`);
        values.push(exportDate, month, tech, bundesland_ags, histogram.total, p50, p90);
        paramIndex += 7;
      }

      await client.query(`
        INSERT INTO story_registration_lag_staging 
          (export_date, month, tech, bundesland_ags, count_units, p50_lag_days, p90_lag_days)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (export_date, month, tech, bundesland_ags) 
        DO UPDATE SET
          count_units = story_registration_lag_staging.count_units + EXCLUDED.count_units,
          p50_lag_days = (story_registration_lag_staging.p50_lag_days + EXCLUDED.p50_lag_days) / 2,
          p90_lag_days = (story_registration_lag_staging.p90_lag_days + EXCLUDED.p90_lag_days) / 2
      `, values);
    }

    histograms.clear();
  }

  return {
    name: 'registrationLag',

    getInterestedElement(filename: string): string | null {
      if (/^EinheitenStromSpeicher.*\.xml$/i.test(filename)) return 'EinheitStromSpeicher';
      if (/^AnlagenStromSpeicher.*\.xml$/i.test(filename)) return 'AnlageStromSpeicher';
      if (/^EinheitenSolar.*\.xml$/i.test(filename)) return 'EinheitSolar';
      return null;
    },

    async onRecord(record: any): Promise<void> {
      const mastrNr = record.EinheitMastrNummer || '';
      if (/^SEE/i.test(mastrNr)) {
        processRecord(record, solarHistograms);
      } else {
        processRecord(record, storageHistograms);
      }
    },

    async onFileComplete(client: DbClient): Promise<void> {
      await flushHistograms(client, 'storage', storageHistograms);
      await flushHistograms(client, 'solar', solarHistograms);
    },

    async onPrepare(client: DbClient): Promise<void> {
      await client.query('DELETE FROM story_registration_lag_staging WHERE export_date = $1', [exportDate]);
    },

    async finalizeAndWrite(client: DbClient): Promise<StoryResult> {
      const startTime = Date.now();
      await flushHistograms(client, 'storage', storageHistograms);
      await flushHistograms(client, 'solar', solarHistograms);

      const result = await client.query(`
        INSERT INTO story_registration_lag_month 
          (export_date, month, tech, bundesland_ags, count_units, p50_lag_days, p90_lag_days)
        SELECT export_date, month, tech, bundesland_ags, count_units, p50_lag_days, p90_lag_days
        FROM story_registration_lag_staging
        WHERE export_date = $1
        ON CONFLICT (export_date, month, tech, bundesland_ags) DO UPDATE SET
          count_units = EXCLUDED.count_units,
          p50_lag_days = EXCLUDED.p50_lag_days,
          p90_lag_days = EXCLUDED.p90_lag_days
      `, [exportDate]);

      await client.query('DELETE FROM story_registration_lag_staging WHERE export_date = $1', [exportDate]);

      return {
        recordsProcessed: processedCount,
        rowsInserted: result.rowCount ?? 0,
        duration_ms: Date.now() - startTime,
      };
    },

    reset(): void {
      storageHistograms.clear();
      solarHistograms.clear();
      processedCount = 0;
      exportDate = '';
    },
  };
}
