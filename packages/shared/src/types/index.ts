/**
 * @fileoverview Core type definitions for the Energy-Unit Statistics Platform
 */

/**
 * Technology types for energy units
 */
export type TechType = 'solar' | 'wind' | 'biomass' | 'hydro' | 'storage' | 'other';

/**
 * Valid technology types array for validation
 */
export const VALID_TECH_TYPES: readonly TechType[] = [
  'solar',
  'wind',
  'biomass',
  'hydro',
  'storage',
  'other',
] as const;

/**
 * Canonical representation of an energy unit
 */
export interface Unit {
  unit_id: string;
  tech: TechType;
  commissioning_date: string | null;
  decommissioning_date: string | null;
  brutto_kw: number | null;
  netto_kw: number | null;
  bundesland_code: string | null;
  ags: string | null;
  plz: string | null;
  is_active: boolean;
  first_seen_export_date: string;
  last_seen_export_date: string;
  record_hash: string;
  updated_at: Date;
}

/**
 * Parsed unit from XML before hash computation
 */
export interface ParsedUnit {
  unit_id: string;
  tech: TechType;
  commissioning_date: string | null;
  decommissioning_date: string | null;
  brutto_kw: number | null;
  netto_kw: number | null;
  bundesland_code: string | null;
  ags: string | null;
  plz: string | null;
}

/**
 * Unit fields used for hash computation (excludes metadata fields)
 */
export interface HashableUnitFields {
  tech: TechType;
  commissioning_date: string | null;
  decommissioning_date: string | null;
  brutto_kw: number | null;
  netto_kw: number | null;
  bundesland_code: string | null;
  ags: string | null;
  plz: string | null;
}

/**
 * Ingest run status
 */
export type IngestStatus = 'running' | 'success' | 'failed';

/**
 * Metadata for an ingest run
 */
export interface IngestRun {
  run_id: string;
  export_date: string;
  source: string;
  source_ref: string;
  file_sha256: string;
  started_at: Date;
  finished_at: Date | null;
  status: IngestStatus;
  error_message: string | null;
  parsed_records: number;
  inserted_records: number;
  updated_records: number;
}

/**
 * Aggregate by commissioning day
 */
export interface AggCommissioningDay {
  day: string;
  tech: TechType;
  bundesland_code: string;
  count_units: number;
  sum_brutto_kw: number;
  sum_netto_kw: number;
}

/**
 * Aggregate by first seen day
 */
export interface AggFirstSeenDay {
  day: string;
  tech: TechType;
  bundesland_code: string;
  count_units: number;
  sum_brutto_kw: number;
  sum_netto_kw: number;
}

/**
 * Ingest statistics returned after processing
 */
export interface IngestStats {
  parsed_records: number;
  inserted_records: number;
  updated_records: number;
  unchanged_records: number;
  skipped_invalid: number;
}

/**
 * API metadata response
 */
export interface MetaResponse {
  dataset: {
    last_success_export_date: string | null;
    last_run_id: string | null;
    total_units: number;
  };
  generated_at: string;
}

/**
 * KPI response for a single tech type
 */
export interface TechKpi {
  tech: TechType;
  count_units: number;
  sum_brutto_kw: number;
  sum_netto_kw: number;
}

/**
 * KPI today response
 */
export interface KpiTodayResponse {
  day: string;
  kpis: TechKpi[];
}

/**
 * KPI rolling response
 */
export interface KpiRollingResponse {
  start_date: string;
  end_date: string;
  days: number;
  kpis: TechKpi[];
}

/**
 * Bundesland ranking entry
 */
export interface BundeslandRanking {
  bundesland_code: string;
  count_units: number;
  sum_brutto_kw: number;
  sum_netto_kw: number;
  metric_value: number;
}

/**
 * Rankings response
 */
export interface RankingsResponse {
  tech: TechType;
  metric: 'brutto_kw' | 'netto_kw';
  start_date: string;
  end_date: string;
  rankings: BundeslandRanking[];
  total: {
    count_units: number;
    sum_brutto_kw: number;
    sum_netto_kw: number;
  };
}

/**
 * XML element names to canonical field mapping
 */
export const XML_FIELD_MAPPING: Record<string, keyof ParsedUnit> = {
  EinheitMastrNummer: 'unit_id',
  Inbetriebnahmedatum: 'commissioning_date',
  DatumEndgueltigeStilllegung: 'decommissioning_date',
  Bruttoleistung: 'brutto_kw',
  Nettonennleistung: 'netto_kw',
  Bundesland: 'bundesland_code',
  Gemeindeschluessel: 'ags',
  Postleitzahl: 'plz',
} as const;

/**
 * File name patterns to tech type mapping
 */
export const FILE_TECH_MAPPING: Record<string, TechType> = {
  EinheitenSolar: 'solar',
  EinheitenWind: 'wind',
  EinheitenBiomasse: 'biomass',
  EinheitenWasser: 'hydro',
  EinheitenSpeicher: 'storage',
} as const;
