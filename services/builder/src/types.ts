/**
 * @fileoverview Type definitions for the builder service
 */

import type { Pool } from 'pg';

/**
 * Builder CLI configuration
 */
export interface BuilderConfig {
  bulkPath: string;
  exportDate: string;
  stories: string[];
}

/**
 * Build result statistics
 */
export interface BuildResult {
  exportDate: string;
  runId: string;
  status: 'success' | 'failed';
  duration_ms: number;
  stories: Record<string, StoryResult>;
}

/**
 * Result for a single story build
 */
export interface StoryResult {
  recordsProcessed: number;
  rowsInserted: number;
  duration_ms: number;
}

/**
 * Story builder interface
 */
export interface StoryBuilder<TRecord = unknown> {
  /** Name of the story (for logging) */
  readonly name: string;
  
  /** XML file patterns this builder handles */
  readonly filePatterns: RegExp[];
  
  /** Process a single record from XML */
  onRecord(record: TRecord): void;
  
  /** Finalize and write aggregated data to DB */
  finalizeAndWrite(pool: Pool, exportDate: string): Promise<StoryResult>;
  
  /** Reset internal state for a new run */
  reset(): void;
}

/**
 * XML record types
 */
export interface StorageRecord {
  [key: string]: string | undefined;
  EinheitMastrNummer: string;
  LokationMaStRNummer?: string;
  Inbetriebnahmedatum?: string;
  Registrierungsdatum?: string;
  Gemeindeschluessel?: string;
  Postleitzahl?: string;
  Nettonennleistung?: string;
  ZugeordnenteWirkleistungWechselrichter?: string;
}

export interface SolarRecord {
  [key: string]: string | undefined;
  EinheitMastrNummer: string;
  LokationMaStRNummer?: string;
  Inbetriebnahmedatum?: string;
  Registrierungsdatum?: string;
  Gemeindeschluessel?: string;
  Postleitzahl?: string;
  Nettonennleistung?: string;
}

export interface NetzanschlusspunktRecord {
  [key: string]: string | undefined;
  NetzanschlusspunktMaStRNummer: string;
  LokationMaStRNummer?: string;
  NetzbetreiberMaStRNummer?: string;
  NochInPlanung?: string;
  LetzteAenderung?: string;
}

/**
 * DB pool configuration
 */
export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}
