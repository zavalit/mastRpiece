/**
 * @fileoverview Integration tests for storage colocation builder
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createStorageColocationBuilder } from '../src/builder.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const { Pool } = pg;

describe('Storage Colocation Builder Integration', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;

  beforeAll(async () => {
    // Start Postgres container
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('energy')
      .withUsername('energy')
      .withPassword('energy')
      .start();

    pool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      user: 'energy',
      password: 'energy',
      database: 'energy',
    });

    // Run migrations
    const migrations = [
      '../migrations/001_storage_colocation.sql',
      '../migrations/002_colocation_enhancements.sql'
    ];
    for (const migration of migrations) {
      const sql = await readFile(resolve(__dirname, migration), 'utf-8');
      await pool.query(sql);
    }
  }, 120000); // 2 min timeout for container startup

  afterAll(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  it('should process PV and storage records and compute colocation stats with Bundesland and percentiles', async () => {
    const exportDate = '2026-01-08';
    const builder = createStorageColocationBuilder(exportDate);

    // Prepare
    await builder.onPrepare(pool);

    // Set file type to PV
    builder.getInterestedElement('EinheitenSolar_1.xml');

    // Simulate PV records at location A in Bavaria (09)
    await builder.onRecord({
      LokationMaStRNummer: 'LOC-A',
      Inbetriebnahmedatum: '2020-03-15',
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEE123456',
    } as any);

    await builder.onRecord({
      LokationMaStRNummer: 'LOC-A',
      Inbetriebnahmedatum: '2020-01-10', // Earlier date - should win
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEE789012',
    } as any);

    // Set file type to Storage
    builder.getInterestedElement('EinheitenStromSpeicher_1.xml');

    // Simulate storage records
    // Co-located at location A
    await builder.onRecord({
      LokationMaStRNummer: 'LOC-A',
      Inbetriebnahmedatum: '2021-05-20', // 16 months after earliest PV
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEH111111',
    } as any);

    // Non-colocated at location B in Berlin (11)
    await builder.onRecord({
      LokationMaStRNummer: 'LOC-B',
      Inbetriebnahmedatum: '2021-06-15',
      Gemeindeschluessel: '11000000',
      EinheitMastrNummer: 'SEH222222',
    } as any);

    // Flush after "file complete"
    await builder.onFileComplete(pool);

    // Finalize
    const result = await builder.finalizeAndWrite(pool);

    // Verify result metadata
    expect(result.recordsProcessed).toBe(4);
    expect(result.rowsInserted).toBeGreaterThan(0);

    // Verify stats table (grouped by Bundesland)
    const statsResult = await pool.query(
      `SELECT period, bundesland_ags, total_storage, colocated_storage
       FROM story_storage_colocation_stats
       WHERE export_date = $1
       ORDER BY period, bundesland_ags`,
      [exportDate]
    );

    // Berlin row (11)
    const berlinStats = statsResult.rows.find(r => r.bundesland_ags === '11');
    expect(berlinStats).toBeDefined();
    expect(parseInt(berlinStats.total_storage)).toBe(1);
    expect(parseInt(berlinStats.colocated_storage)).toBe(0);

    // Bavaria row (09)
    const bavariaStats = statsResult.rows.find(r => r.bundesland_ags === '09');
    expect(bavariaStats).toBeDefined();
    expect(parseInt(bavariaStats.total_storage)).toBe(1);
    expect(parseInt(bavariaStats.colocated_storage)).toBe(1);

    // Verify lag histogram (grouped by Bundesland)
    const lagResult = await pool.query(
      `SELECT lag_bin, bundesland_ags, count
       FROM story_storage_colocation_lag_hist
       WHERE export_date = $1 AND bundesland_ags = '09'
       ORDER BY lag_bin`,
      [exportDate]
    );

    const lagBin = lagResult.rows.find(r => r.lag_bin === '1-2y');
    expect(lagBin).toBeDefined();
    expect(parseInt(lagBin.count)).toBe(1);

    // Verify percentiles table
    const percResult = await pool.query(
      `SELECT * FROM story_storage_colocation_percentiles 
       WHERE export_date = $1 AND bundesland_ags = '09'`,
      [exportDate]
    );
    expect(percResult.rows.length).toBe(1);
    expect(parseFloat(percResult.rows[0].p50)).toBe(16); // Lag was 16 months

    // Verify staging tables are cleaned
    const pvStaging = await pool.query(
      'SELECT COUNT(*) FROM story_colocation_pv_staging WHERE export_date = $1',
      [exportDate]
    );
    expect(parseInt(pvStaging.rows[0].count)).toBe(0);
  }, 30000);

  it('should handle idempotent re-runs', async () => {
    const exportDate = '2026-01-09';
    const builder1 = createStorageColocationBuilder(exportDate);

    // First run
    await builder1.onPrepare(pool);
    builder1.getInterestedElement('EinheitenSolar_1.xml');
    await builder1.onRecord({
      LokationMaStRNummer: 'LOC-X',
      Inbetriebnahmedatum: '2020-01-01',
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEE999999',
    } as any);
    builder1.getInterestedElement('EinheitenStromSpeicher_1.xml');
    await builder1.onRecord({
      LokationMaStRNummer: 'LOC-X',
      Inbetriebnahmedatum: '2021-01-01',
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEH999999',
    } as any);
    await builder1.onFileComplete(pool);
    await builder1.finalizeAndWrite(pool);

    const firstResult = await pool.query(
      'SELECT COUNT(*) FROM story_storage_colocation_stats WHERE export_date = $1',
      [exportDate]
    );

    // Second run (idempotent)
    const builder2 = createStorageColocationBuilder(exportDate);
    await builder2.onPrepare(pool);
    builder2.getInterestedElement('EinheitenSolar_1.xml');
    await builder2.onRecord({
      LokationMaStRNummer: 'LOC-X',
      Inbetriebnahmedatum: '2020-01-01',
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEE999999',
    } as any);
    builder2.getInterestedElement('EinheitenStromSpeicher_1.xml');
    await builder2.onRecord({
      LokationMaStRNummer: 'LOC-X',
      Inbetriebnahmedatum: '2021-01-01',
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEH999999',
    } as any);
    await builder2.onFileComplete(pool);
    await builder2.finalizeAndWrite(pool);

    const secondResult = await pool.query(
      'SELECT COUNT(*) FROM story_storage_colocation_stats WHERE export_date = $1',
      [exportDate]
    );

    // Same result (idempotent)
    expect(firstResult.rows[0].count).toBe(secondResult.rows[0].count);
  }, 30000);

  it('should correctly bin various lag values', async () => {
    const exportDate = '2026-01-10';
    const builder = createStorageColocationBuilder(exportDate);

    await builder.onPrepare(pool);

    // PV installed 2020-01-01
    builder.getInterestedElement('EinheitenSolar_1.xml');
    await builder.onRecord({
      LokationMaStRNummer: 'LOC-LAG1',
      Inbetriebnahmedatum: '2020-01-01',
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEE111',
    } as any);

    // Storage 2 months later (0-3m bin)
    builder.getInterestedElement('EinheitenStromSpeicher_1.xml');
    await builder.onRecord({
      LokationMaStRNummer: 'LOC-LAG1',
      Inbetriebnahmedatum: '2020-03-01',
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEH111',
    } as any);

    // PV installed 2019-01-01
    builder.getInterestedElement('EinheitenSolar_2.xml');
    await builder.onRecord({
      LokationMaStRNummer: 'LOC-LAG2',
      Inbetriebnahmedatum: '2019-01-01',
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEE222',
    } as any);

    // Storage 8 months later (3-12m bin)
    builder.getInterestedElement('EinheitenStromSpeicher_2.xml');
    await builder.onRecord({
      LokationMaStRNummer: 'LOC-LAG2',
      Inbetriebnahmedatum: '2019-09-01',
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEH222',
    } as any);

    // PV installed 2018-01-01
    builder.getInterestedElement('EinheitenSolar_3.xml');
    await builder.onRecord({
      LokationMaStRNummer: 'LOC-LAG3',
      Inbetriebnahmedatum: '2018-01-01',
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEE333',
    } as any);

    // Storage 5 years later (4-6y bin)
    builder.getInterestedElement('EinheitenStromSpeicher_3.xml');
    await builder.onRecord({
      LokationMaStRNummer: 'LOC-LAG3',
      Inbetriebnahmedatum: '2023-01-01',
      Gemeindeschluessel: '09162000',
      EinheitMastrNummer: 'SEH333',
    } as any);

    await builder.onFileComplete(pool);
    await builder.finalizeAndWrite(pool);

    const lagResult = await pool.query(
      `SELECT lag_bin, count
       FROM story_storage_colocation_lag_hist
       WHERE export_date = $1
       ORDER BY lag_bin`,
      [exportDate]
    );

    const bins = lagResult.rows.reduce((acc, row) => {
      acc[row.lag_bin] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    expect(bins['0-3m']).toBe(1);
    expect(bins['3-12m']).toBe(1);
    expect(bins['4-6y']).toBe(1);
  }, 30000);
});
