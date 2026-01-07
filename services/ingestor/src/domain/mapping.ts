/**
 * @fileoverview Domain logic for mapping parsed units to database records
 */

import type { ParsedUnit, HashableUnitFields } from '@energy/shared';
import { computeRecordHash } from '@energy/shared';

/**
 * Unit record prepared for database insert/update
 */
export interface PreparedUnit {
  unit_id: string;
  tech: string;
  commissioning_date: string | null;
  decommissioning_date: string | null;
  brutto_kw: number | null;
  netto_kw: number | null;
  bundesland_code: string | null;
  ags: string | null;
  plz: string | null;
  is_active: boolean;
  record_hash: string;
}

/**
 * Prepare a parsed unit for database operations
 * Computes hash and determines is_active status
 */
export function prepareUnit(parsed: ParsedUnit): PreparedUnit {
  const hashableFields: HashableUnitFields = {
    tech: parsed.tech,
    commissioning_date: parsed.commissioning_date,
    decommissioning_date: parsed.decommissioning_date,
    brutto_kw: parsed.brutto_kw,
    netto_kw: parsed.netto_kw,
    bundesland_code: parsed.bundesland_code,
    ags: parsed.ags,
    plz: parsed.plz,
  };

  const record_hash = computeRecordHash(hashableFields);

  // Unit is active if it has no decommissioning date
  const is_active = parsed.decommissioning_date === null;

  return {
    unit_id: parsed.unit_id,
    tech: parsed.tech,
    commissioning_date: parsed.commissioning_date,
    decommissioning_date: parsed.decommissioning_date,
    brutto_kw: parsed.brutto_kw,
    netto_kw: parsed.netto_kw,
    bundesland_code: parsed.bundesland_code,
    ags: parsed.ags,
    plz: parsed.plz,
    is_active,
    record_hash,
  };
}

/**
 * Upsert decision based on existing record
 */
export type UpsertDecision = 'insert' | 'update' | 'unchanged';

/**
 * Determine the upsert decision for a record
 */
export function determineUpsertDecision(
  preparedUnit: PreparedUnit,
  existingHash: string | null
): UpsertDecision {
  if (existingHash === null) {
    return 'insert';
  }

  if (existingHash !== preparedUnit.record_hash) {
    return 'update';
  }

  return 'unchanged';
}
