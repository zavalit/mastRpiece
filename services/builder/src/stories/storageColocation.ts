/**
 * @fileoverview Storage Colocation story builder
 * Tracks storage units that share a location with solar installations
 */

import type { Pool } from 'pg';
import type { StoryBuilder, StoryResult, SolarRecord, StorageRecord } from '../types.js';
import { parseDate, extractBundeslandAgs, getMonthStart } from '../io/xmlParser.js';
import { bulkInsert } from '../db/write.js';

interface AggValue {
  storage_units: number;
  colocated_units: number;
}

/**
 * Collector for solar locations (phase 1)
 */
export function createSolarLocationsCollector(): {
  onRecord(record: SolarRecord): void;
  getLocations(): Set<string>;
  reset(): void;
  getLocationBundesland(): Map<string, string>;
  /**
   * Write solar locations to story_solar_locations table
   */
  writeToDb(pool: Pool, exportDate: string): Promise<number>;
} {
  const locations = new Set<string>();
  const locationBundesland = new Map<string, string>();

  return {
    onRecord(record: SolarRecord): void {
      if (record.LokationMaStRNummer) {
        locations.add(record.LokationMaStRNummer);
        const bl = extractBundeslandAgs(record.Gemeindeschluessel);
        if (bl) {
          locationBundesland.set(record.LokationMaStRNummer, bl);
        }
      }
    },

    getLocations(): Set<string> {
      return locations;
    },

    getLocationBundesland(): Map<string, string> {
      return locationBundesland;
    },

    async writeToDb(pool: Pool, exportDate: string): Promise<number> {
      const rows = Array.from(locations).map((loc) => ({
        export_date: exportDate,
        location_id: loc,
        bundesland_ags: locationBundesland.get(loc) ?? '99',
      }));

      return await bulkInsert(
        pool,
        'story_solar_locations',
        ['export_date', 'location_id', 'bundesland_ags'],
        rows
      );
    },

    reset(): void {
      locations.clear();
      locationBundesland.clear();
    },
  };
}

/**
 * Create StorageColocation builder (phase 2)
 */
export function createStorageColocationBuilder(
  solarLocations: Set<string>
): StoryBuilder<StorageRecord> {
  // Aggregates by month+bundesland
  const aggregates = new Map<string, AggValue>();
  let processedCount = 0;

  const makeKey = (month: string, bl: string) => `${month}|${bl}`;

  return {
    name: 'storageColocation',
    
    filePatterns: [/^EinheitenStromSpeicher.*\.xml$/i, /^AnlagenStromSpeicher.*\.xml$/i],

    onRecord(record: StorageRecord): void {
      const day = parseDate(record.Inbetriebnahmedatum);
      if (!day) return;

      const month = getMonthStart(day);
      if (!month) return;

      const bundesland_ags = extractBundeslandAgs(record.Gemeindeschluessel) ?? '99';
      const isColocated = record.LokationMaStRNummer
        ? solarLocations.has(record.LokationMaStRNummer)
        : false;

      const key = makeKey(month, bundesland_ags);
      const existing = aggregates.get(key);

      if (existing) {
        existing.storage_units++;
        if (isColocated) existing.colocated_units++;
      } else {
        aggregates.set(key, {
          storage_units: 1,
          colocated_units: isColocated ? 1 : 0,
        });
      }

      processedCount++;
    },

    async finalizeAndWrite(pool: Pool, exportDate: string): Promise<StoryResult> {
      const startTime = Date.now();

      const rows = Array.from(aggregates.entries()).map(([key, value]) => {
        const [month, bundesland_ags] = key.split('|');
        return {
          export_date: exportDate,
          month,
          bundesland_ags,
          storage_units: value.storage_units,
          colocated_units: value.colocated_units,
          colocated_rate:
            value.storage_units > 0
              ? value.colocated_units / value.storage_units
              : 0,
        };
      });

      const inserted = await bulkInsert(
        pool,
        'story_storage_colocation_month',
        [
          'export_date',
          'month',
          'bundesland_ags',
          'storage_units',
          'colocated_units',
          'colocated_rate',
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
      aggregates.clear();
      processedCount = 0;
    },
  };
}
