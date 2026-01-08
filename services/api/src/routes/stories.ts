/**
 * @fileoverview Story endpoints - read from story tables
 * Implements story-first API pattern
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../infra/db.js';
import { withCache } from '../cache/cacheMiddleware.js';

/**
 * Get the latest successful export date
 */
async function getLatestExportDate(): Promise<string | null> {
  const result = await query<{ export_date: string }>(
    `SELECT export_date::text
     FROM ingest_run
     WHERE status = 'success'
     ORDER BY started_at DESC
     LIMIT 1`
  );
  return result.rows[0]?.export_date ?? null;
}

/**
 * GET /meta - Latest ingest run info
 */
async function getMetaHandler(
  _request: FastifyRequest,
  _reply: FastifyReply
): Promise<{ export_date: string | null; status: string; started_at: string | null }> {
  const result = await query<{
    export_date: string;
    status: string;
    started_at: string;
  }>(
    `SELECT export_date::text, status, started_at::text
     FROM ingest_run
     WHERE status = 'success'
     ORDER BY started_at DESC
     LIMIT 1`
  );

  const row = result.rows[0];
  return {
    export_date: row?.export_date ?? null,
    status: row?.status ?? 'no_data',
    started_at: row?.started_at ?? null,
  };
}

/**
 * GET /stories/storage/wave - Storage daily wave by region
 */
async function getStorageWaveHandler(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<{ export_date: string | null; data: unknown[] }> {
  const { start, end } = request.query as { start?: string; end?: string };
  const exportDate = await getLatestExportDate();

  if (!exportDate) {
    return { export_date: null, data: [] };
  }

  const result = await query(
    `SELECT 
       day::text,
       bundesland_ags,
       count_units,
       sum_netto_kw,
       sum_inverter_kw
     FROM story_storage_day_region
     WHERE export_date = $1
       AND ($2::date IS NULL OR day >= $2::date)
       AND ($3::date IS NULL OR day <= $3::date)
     ORDER BY day, bundesland_ags`,
    [exportDate, start ?? null, end ?? null]
  );

  return { export_date: exportDate, data: result.rows };
}

/**
 * GET /stories/solar/wave - Solar daily wave by region
 */
async function getSolarWaveHandler(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<{ export_date: string | null; data: unknown[] }> {
  const { start, end } = request.query as { start?: string; end?: string };
  const exportDate = await getLatestExportDate();

  if (!exportDate) {
    return { export_date: null, data: [] };
  }

  const result = await query(
    `SELECT 
       day::text,
       bundesland_ags,
       count_units,
       sum_netto_kw
     FROM story_solar_day_region
     WHERE export_date = $1
       AND ($2::date IS NULL OR day >= $2::date)
       AND ($3::date IS NULL OR day <= $3::date)
     ORDER BY day, bundesland_ags`,
    [exportDate, start ?? null, end ?? null]
  );

  return { export_date: exportDate, data: result.rows };
}

/**
 * GET /stories/storage/colocation - Storage colocation stats by month
 */
async function getStorageColocationHandler(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<{ export_date: string | null; data: unknown[] }> {
  const { startMonth, endMonth } = request.query as { startMonth?: string; endMonth?: string };
  const exportDate = await getLatestExportDate();

  if (!exportDate) {
    return { export_date: null, data: [] };
  }

  const result = await query(
    `SELECT 
       month::text,
       bundesland_ags,
       storage_units,
       colocated_units,
       colocated_rate
     FROM story_storage_colocation_month
     WHERE export_date = $1
       AND ($2::date IS NULL OR month >= $2::date)
       AND ($3::date IS NULL OR month <= $3::date)
     ORDER BY month, bundesland_ags`,
    [exportDate, startMonth ?? null, endMonth ?? null]
  );

  return { export_date: exportDate, data: result.rows };
}

/**
 * GET /stories/lag - Registration lag stats
 */
async function getLagHandler(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<{ export_date: string | null; data: unknown[] }> {
  const { tech, startMonth, endMonth } = request.query as {
    tech?: string;
    startMonth?: string;
    endMonth?: string;
  };
  const exportDate = await getLatestExportDate();

  if (!exportDate) {
    return { export_date: null, data: [] };
  }

  const result = await query(
    `SELECT 
       month::text,
       tech,
       bundesland_ags,
       count_units,
       p50_lag_days,
       p90_lag_days
     FROM story_registration_lag_month
     WHERE export_date = $1
       AND ($2::text IS NULL OR tech = $2::text)
       AND ($3::date IS NULL OR month >= $3::date)
       AND ($4::date IS NULL OR month <= $4::date)
     ORDER BY month, tech, bundesland_ags`,
    [exportDate, tech ?? null, startMonth ?? null, endMonth ?? null]
  );

  return { export_date: exportDate, data: result.rows };
}

// Schemas for OpenAPI
const dateQuerySchema = {
  type: 'object',
  properties: {
    start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    end: { type: 'string', description: 'End date (YYYY-MM-DD)' },
  },
};

const monthQuerySchema = {
  type: 'object',
  properties: {
    startMonth: { type: 'string', description: 'Start month (YYYY-MM-01)' },
    endMonth: { type: 'string', description: 'End month (YYYY-MM-01)' },
  },
};

const lagQuerySchema = {
  type: 'object',
  properties: {
    tech: { type: 'string', enum: ['storage', 'solar'], description: 'Technology type' },
    startMonth: { type: 'string', description: 'Start month (YYYY-MM-01)' },
    endMonth: { type: 'string', description: 'End month (YYYY-MM-01)' },
  },
};

/**
 * Register story routes
 */
export async function registerStoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/meta', {
    schema: {
      description: 'Get latest ingest run metadata',
      tags: ['Meta'],
      response: {
        200: {
          type: 'object',
          properties: {
            export_date: { type: 'string', nullable: true },
            status: { type: 'string' },
            started_at: { type: 'string', nullable: true },
          },
        },
      },
    },
  }, withCache(getMetaHandler));

  app.get('/stories/storage/wave', {
    schema: {
      description: 'Get storage wave data by day and region',
      tags: ['Stories'],
      querystring: dateQuerySchema,
    },
  }, withCache(getStorageWaveHandler));

  app.get('/stories/solar/wave', {
    schema: {
      description: 'Get solar wave data by day and region',
      tags: ['Stories'],
      querystring: dateQuerySchema,
    },
  }, withCache(getSolarWaveHandler));

  app.get('/stories/storage/colocation', {
    schema: {
      description: 'Get storage-solar colocation stats by month',
      tags: ['Stories'],
      querystring: monthQuerySchema,
    },
  }, withCache(getStorageColocationHandler));

  app.get('/stories/lag', {
    schema: {
      description: 'Get registration lag statistics',
      tags: ['Stories'],
      querystring: lagQuerySchema,
    },
  }, withCache(getLagHandler));
}
