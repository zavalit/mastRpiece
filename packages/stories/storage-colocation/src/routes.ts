/**
 * @fileoverview Storage Colocation story API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Register storage colocation routes
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const statsQuerySchema = {
    type: 'object',
    properties: {
      startPeriod: { type: 'string', description: 'Start period (YYYY-MM)' },
      endPeriod: { type: 'string', description: 'End period (YYYY-MM)' },
      bundeslandAgs: { type: 'string', description: 'Bundesland AGS (2 digits)' },
    },
  };

  // Endpoint 1: Get colocation statistics by period
  app.get('/stories/colocation/stats', {
    schema: {
      description: 'Get storage colocation statistics by period and Bundesland',
      tags: ['Stories'],
      querystring: statsQuerySchema,
    },
  }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const { startPeriod, endPeriod, bundeslandAgs } = request.query as {
      startPeriod?: string;
      endPeriod?: string;
      bundeslandAgs?: string;
    };
    
    // @ts-ignore
    const query = app.db.query;
    // @ts-ignore
    const getLatestExportDate = app.getLatestExportDate;

    const exportDate = await getLatestExportDate();
    if (!exportDate) {
      return { export_date: null, data: [] };
    }

    const { rows } = await query(
      `SELECT 
         period,
         bundesland_ags,
         total_storage,
         colocated_storage,
         ROUND(100.0 * colocated_storage / NULLIF(total_storage, 0), 2) as colocation_rate
       FROM story_storage_colocation_stats
       WHERE export_date = $1
         AND ($2::text IS NULL OR period >= $2::text)
         AND ($3::text IS NULL OR period <= $3::text)
         AND ($4::text IS NULL OR bundesland_ags = $4::text)
       ORDER BY period, bundesland_ags`,
      [exportDate, startPeriod ?? null, endPeriod ?? null, bundeslandAgs ?? null]
    );

    return { export_date: exportDate, data: rows };
  });

  // Endpoint 2: Get colocation lag histogram
  app.get('/stories/colocation/lag-histogram', {
    schema: {
      description: 'Get storage colocation lag histogram by Bundesland',
      tags: ['Stories'],
      querystring: {
        type: 'object',
        properties: {
          bundeslandAgs: { type: 'string', description: 'Bundesland AGS' },
        },
      },
    },
  }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const { bundeslandAgs } = request.query as { bundeslandAgs?: string };
    // @ts-ignore
    const query = app.db.query;
    // @ts-ignore
    const getLatestExportDate = app.getLatestExportDate;

    const exportDate = await getLatestExportDate();
    if (!exportDate) {
      return { export_date: null, data: [] };
    }

    const { rows } = await query(
      `SELECT 
         lag_bin,
         bundesland_ags,
         count,
         ROUND(100.0 * count / SUM(count) OVER (PARTITION BY bundesland_ags), 2) as percentage
       FROM story_storage_colocation_lag_hist
       WHERE export_date = $1
         AND ($2::text IS NULL OR bundesland_ags = $2::text)
       ORDER BY bundesland_ags, CASE lag_bin
         WHEN 'pv_after_storage' THEN 0
         WHEN '0-3m' THEN 1
         WHEN '3-12m' THEN 2
         WHEN '1-2y' THEN 3
         WHEN '2-4y' THEN 4
         WHEN '4-6y' THEN 5
         WHEN '6y+' THEN 6
       END`,
      [exportDate, bundeslandAgs ?? null]
    );

    return { export_date: exportDate, data: rows };
  });

  // Endpoint 3: Get lag percentiles
  app.get('/stories/colocation/percentiles', {
    schema: {
      description: 'Get storage colocation lag percentiles by period and Bundesland',
      tags: ['Stories'],
      querystring: statsQuerySchema,
    },
  }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const { startPeriod, endPeriod, bundeslandAgs } = request.query as {
      startPeriod?: string;
      endPeriod?: string;
      bundeslandAgs?: string;
    };
    
    // @ts-ignore
    const query = app.db.query;
    // @ts-ignore
    const getLatestExportDate = app.getLatestExportDate;

    const exportDate = await getLatestExportDate();
    if (!exportDate) {
      return { export_date: null, data: [] };
    }

    const { rows } = await query(
      `SELECT 
         period,
         bundesland_ags,
         p10, p25, p50, p75, p90,
         count
       FROM story_storage_colocation_percentiles
       WHERE export_date = $1
         AND ($2::text IS NULL OR period >= $2::text)
         AND ($3::text IS NULL OR period <= $3::text)
         AND ($4::text IS NULL OR bundesland_ags = $4::text)
       ORDER BY period, bundesland_ags`,
      [exportDate, startPeriod ?? null, endPeriod ?? null, bundeslandAgs ?? null]
    );

    return { export_date: exportDate, data: rows };
  });
}
