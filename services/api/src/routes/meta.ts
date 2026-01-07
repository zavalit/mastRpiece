/**
 * @fileoverview Meta endpoint - dataset metadata
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../infra/db.js';
import { withCache } from '../cache/cacheMiddleware.js';
import type { MetaResponse } from '@energy/shared';

interface LastSuccessRun {
  run_id: string;
  export_date: string;
}

interface TotalUnits {
  count: string;
}

/**
 * Get dataset metadata
 */
async function getMetaHandler(
  _request: FastifyRequest,
  _reply: FastifyReply
): Promise<MetaResponse> {
  // Get last successful ingest run
  const lastRunResult = await query<LastSuccessRun>(
    `SELECT run_id, export_date::text 
     FROM ingest_runs 
     WHERE status = 'success' 
     ORDER BY finished_at DESC 
     LIMIT 1`
  );

  const lastRun = lastRunResult.rows[0];

  // Get total units count
  const totalUnitsResult = await query<TotalUnits>(
    'SELECT COUNT(*)::text as count FROM units'
  );

  const totalUnits = parseInt(totalUnitsResult.rows[0]?.count ?? '0', 10);

  return {
    dataset: {
      last_success_export_date: lastRun?.export_date ?? null,
      last_run_id: lastRun?.run_id ?? null,
      total_units: totalUnits,
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * Register meta routes
 */
export async function registerMetaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/meta', withCache(getMetaHandler));
}
