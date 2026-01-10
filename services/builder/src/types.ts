/**
 * @fileoverview Type definitions for the builder service
 */

import type { Pool } from 'pg';

/**
 * Shared interface for DB operations (works with both Pool and PoolClient)
 */
export interface DbClient {
  query: (text: string, params?: any[]) => Promise<any>;
}

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
