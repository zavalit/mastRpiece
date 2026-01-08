/**
 * @fileoverview Main ingest use case - orchestrates the entire ingest process
 */

import { randomUUID } from 'node:crypto';
import type { PoolClient } from '../infra/db.js';
import { getPool, withTransaction } from '../infra/db.js';
import { streamZipEntries, computeFileHash } from '../adapters/zipReader.js';
import { parseXmlStream } from '../adapters/xmlParser.js';
import { prepareUnit } from '../domain/mapping.js';
import type { IngestorConfig } from '../config.js';
import type { IngestStats, ParsedUnit } from '@energy/shared';
import { chunk } from '@energy/shared';

/**
 * Resolved config with non-null bulkPath for runIngest
 */
export interface ResolvedIngestorConfig extends Omit<IngestorConfig, 'bulkPath'> {
  bulkPath: string;
  exportDate: string;
}

/**
 * Run the complete ingest process
 */
export async function runIngest(config: ResolvedIngestorConfig): Promise<IngestStats> {
  const runId = randomUUID();
  const startedAt = new Date();

  // Compute file hash
  const fileHash = await computeFileHash(config.bulkPath);

  // Create ingest run record
  await createIngestRun(runId, config, fileHash, startedAt);

  const stats: IngestStats = {
    parsed_records: 0,
    inserted_records: 0,
    updated_records: 0,
    unchanged_records: 0,
    skipped_invalid: 0,
  };

  try {
    // Process ZIP file
    for await (const entry of streamZipEntries(config.bulkPath)) {
      console.error(
        JSON.stringify({
          level: 'info',
          msg: 'Processing file',
          filename: entry.filename,
          tech: entry.tech,
        })
      );

      // Collect parsed units
      const parsedUnits: ParsedUnit[] = [];
      const parseGen = parseXmlStream(entry.stream, entry.tech);

      let result = await parseGen.next();
      while (!result.done) {
        parsedUnits.push(result.value);
        result = await parseGen.next();
      }

      // Get final stats from generator return
      stats.skipped_invalid += result.value.skipped;

      // Process in batches
      const batches = chunk(parsedUnits, config.batchSize);

      for (const batch of batches) {
        const batchStats = await processBatch(batch, config.exportDate);
        stats.parsed_records += batch.length;
        stats.inserted_records += batchStats.inserted;
        stats.updated_records += batchStats.updated;
        stats.unchanged_records += batchStats.unchanged;
      }
    }

    // Update ingest run as successful
    await updateIngestRunSuccess(runId, stats);

    console.error(
      JSON.stringify({
        level: 'info',
        msg: 'Ingest completed successfully',
        run_id: runId,
        stats,
      })
    );

    return stats;
  } catch (error) {
    // Update ingest run as failed
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateIngestRunFailed(runId, stats, errorMessage);

    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Ingest failed',
        run_id: runId,
        error: errorMessage,
      })
    );

    throw error;
  }
}

/**
 * Process a batch of parsed units
 */
async function processBatch(
  units: ParsedUnit[],
  exportDate: string
): Promise<{ inserted: number; updated: number; unchanged: number }> {
  return withTransaction(async (client) => {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    // Get existing records for this batch
    const unitIds = units.map((u) => u.unit_id);
    const existingMap = await getExistingUnits(client, unitIds);

    // Prepare units with hashes
    const preparedUnits = units.map((u) => prepareUnit(u));

    // Separate into inserts and updates
    const toInsert: typeof preparedUnits = [];
    const toUpdate: typeof preparedUnits = [];
    const toUpdateLastSeen: string[] = [];

    for (const prepared of preparedUnits) {
      const existing = existingMap.get(prepared.unit_id);

      if (!existing) {
        toInsert.push(prepared);
        inserted++;
      } else if (existing.record_hash !== prepared.record_hash) {
        toUpdate.push(prepared);
        updated++;
      } else {
        // Hash unchanged - just update last_seen
        toUpdateLastSeen.push(prepared.unit_id);
        unchanged++;
      }
    }

    // Perform batch insert
    if (toInsert.length > 0) {
      await batchInsertUnits(client, toInsert, exportDate);
    }

    // Perform batch update
    if (toUpdate.length > 0) {
      await batchUpdateUnits(client, toUpdate, exportDate);
    }

    // Update last_seen for unchanged records
    if (toUpdateLastSeen.length > 0) {
      await updateLastSeen(client, toUpdateLastSeen, exportDate);
    }

    return { inserted, updated, unchanged };
  });
}

/**
 * Get existing units by IDs
 */
async function getExistingUnits(
  client: PoolClient,
  unitIds: string[]
): Promise<Map<string, { record_hash: string }>> {
  if (unitIds.length === 0) {
    return new Map();
  }

  const placeholders = unitIds.map((_, i) => `$${i + 1}`).join(', ');
  const result = await client.query<{ unit_id: string; record_hash: string }>(
    `SELECT unit_id, record_hash FROM units WHERE unit_id IN (${placeholders})`,
    unitIds
  );

  const map = new Map<string, { record_hash: string }>();
  for (const row of result.rows) {
    map.set(row.unit_id, { record_hash: row.record_hash });
  }

  return map;
}

/**
 * Batch insert new units
 */
async function batchInsertUnits(
  client: PoolClient,
  units: ReturnType<typeof prepareUnit>[],
  exportDate: string
): Promise<void> {
  if (units.length === 0) return;

  const columns = [
    'unit_id',
    'tech',
    'commissioning_date',
    'decommissioning_date',
    'brutto_kw',
    'netto_kw',
    'bundesland_code',
    'ags',
    'plz',
    'is_active',
    'first_seen_export_date',
    'last_seen_export_date',
    'record_hash',
    'updated_at',
  ];

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const unit of units) {
    const rowPlaceholders: string[] = [];
    const rowValues = [
      unit.unit_id,
      unit.tech,
      unit.commissioning_date,
      unit.decommissioning_date,
      unit.brutto_kw,
      unit.netto_kw,
      unit.bundesland_code,
      unit.ags,
      unit.plz,
      unit.is_active,
      exportDate, // first_seen_export_date
      exportDate, // last_seen_export_date
      unit.record_hash,
      new Date(), // updated_at
    ];

    for (const value of rowValues) {
      rowPlaceholders.push(`$${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    placeholders.push(`(${rowPlaceholders.join(', ')})`);
  }

  const sql = `
    INSERT INTO units (${columns.join(', ')})
    VALUES ${placeholders.join(', ')}
  `;

  await client.query(sql, values);
}

/**
 * Batch update existing units
 */
async function batchUpdateUnits(
  client: PoolClient,
  units: ReturnType<typeof prepareUnit>[],
  exportDate: string
): Promise<void> {
  // For updates, we use individual UPDATE statements in a single transaction
  // This is simpler and still efficient within a transaction
  for (const unit of units) {
    await client.query(
      `UPDATE units SET
        tech = $2,
        commissioning_date = $3,
        decommissioning_date = $4,
        brutto_kw = $5,
        netto_kw = $6,
        bundesland_code = $7,
        ags = $8,
        plz = $9,
        is_active = $10,
        last_seen_export_date = $11,
        record_hash = $12,
        updated_at = $13
      WHERE unit_id = $1`,
      [
        unit.unit_id,
        unit.tech,
        unit.commissioning_date,
        unit.decommissioning_date,
        unit.brutto_kw,
        unit.netto_kw,
        unit.bundesland_code,
        unit.ags,
        unit.plz,
        unit.is_active,
        exportDate,
        unit.record_hash,
        new Date(),
      ]
    );
  }
}

/**
 * Update last_seen_export_date for unchanged records
 */
async function updateLastSeen(
  client: PoolClient,
  unitIds: string[],
  exportDate: string
): Promise<void> {
  if (unitIds.length === 0) return;

  const placeholders = unitIds.map((_, i) => `$${i + 2}`).join(', ');
  await client.query(
    `UPDATE units SET last_seen_export_date = $1 WHERE unit_id IN (${placeholders})`,
    [exportDate, ...unitIds]
  );
}

/**
 * Create initial ingest run record
 */
async function createIngestRun(
  runId: string,
  config: IngestorConfig,
  fileHash: string,
  startedAt: Date
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO ingest_runs (
      run_id, export_date, source, source_ref, file_sha256,
      started_at, status, parsed_records, inserted_records, updated_records
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      runId,
      config.exportDate,
      'local_file',
      config.bulkPath,
      fileHash,
      startedAt,
      'running',
      0,
      0,
      0,
    ]
  );
}

/**
 * Update ingest run as successful
 */
async function updateIngestRunSuccess(runId: string, stats: IngestStats): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE ingest_runs SET
      finished_at = $2,
      status = $3,
      parsed_records = $4,
      inserted_records = $5,
      updated_records = $6
    WHERE run_id = $1`,
    [
      runId,
      new Date(),
      'success',
      stats.parsed_records,
      stats.inserted_records,
      stats.updated_records,
    ]
  );
}

/**
 * Update ingest run as failed
 */
async function updateIngestRunFailed(
  runId: string,
  stats: IngestStats,
  errorMessage: string
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE ingest_runs SET
      finished_at = $2,
      status = $3,
      error_message = $4,
      parsed_records = $5,
      inserted_records = $6,
      updated_records = $7
    WHERE run_id = $1`,
    [
      runId,
      new Date(),
      'failed',
      errorMessage,
      stats.parsed_records,
      stats.inserted_records,
      stats.updated_records,
    ]
  );
}
