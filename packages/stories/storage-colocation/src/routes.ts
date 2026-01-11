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

  // === VISUALIZATION ENDPOINTS ===

  const BUNDESLAND_NAMES: Record<string, string> = {
    '01': 'Schleswig-Holstein',
    '02': 'Hamburg',
    '03': 'Niedersachsen',
    '04': 'Bremen',
    '05': 'Nordrhein-Westfalen',
    '06': 'Hessen',
    '07': 'Rheinland-Pfalz',
    '08': 'Baden-Württemberg',
    '09': 'Bayern',
    '10': 'Saarland',
    '11': 'Berlin',
    '12': 'Brandenburg',
    '13': 'Mecklenburg-Vorpommern',
    '14': 'Sachsen',
    '15': 'Sachsen-Anhalt',
    '16': 'Thüringen',
    '00': 'Unbekannt',
  };

  // Viz Endpoint 1: Time-series pivot (Multi-line chart)
  app.get('/stories/colocation/viz/stats-timeseries', {
    schema: {
      description: 'Get colocation rates pivoted by Bundesland for time-series charts',
      tags: ['Stories'],
      querystring: statsQuerySchema,
    },
  }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const { startPeriod, endPeriod } = request.query as { startPeriod?: string; endPeriod?: string };
    // @ts-ignore
    const query = app.db.query;
    // @ts-ignore
    const getLatestExportDate = app.getLatestExportDate;

    const exportDate = await getLatestExportDate();
    if (!exportDate) return { export_date: null, data: [] };

    const { rows } = await query(
      `SELECT 
         period,
         bundesland_ags,
         ROUND(100.0 * colocated_storage / NULLIF(total_storage, 0), 2) as colocation_rate
       FROM story_storage_colocation_stats
       WHERE export_date = $1
         AND ($2::text IS NULL OR period >= $2::text)
         AND ($3::text IS NULL OR period <= $3::text)
       ORDER BY period ASC`,
      [exportDate, startPeriod ?? null, endPeriod ?? null]
    );

    // Pivot data: period -> { [bundeslandName]: rate }
    const pivotMap = new Map<string, Record<string, any>>();
    for (const row of rows) {
      if (!pivotMap.has(row.period)) {
        pivotMap.set(row.period, { period: row.period });
      }
      const entry = pivotMap.get(row.period)!;
      const name = BUNDESLAND_NAMES[row.bundesland_ags] || row.bundesland_ags;
      entry[name] = parseFloat(row.colocation_rate);
    }

    return { export_date: exportDate, data: Array.from(pivotMap.values()) };
  });

  // Viz Endpoint 2: Fan-chart percentiles
  app.get('/stories/colocation/viz/lag-percentiles', {
    schema: {
      description: 'Get lag percentiles formatted for fan charts (area range)',
      tags: ['Stories'],
      querystring: {
        type: 'object',
        properties: {
          bundeslandAgs: { type: 'string', description: 'Bundesland AGS' },
          startPeriod: { type: 'string' },
          endPeriod: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const { bundeslandAgs, startPeriod, endPeriod } = request.query as any;
    // @ts-ignore
    const query = app.db.query;
    // @ts-ignore
    const getLatestExportDate = app.getLatestExportDate;

    const exportDate = await getLatestExportDate();
    if (!exportDate) return { export_date: null, data: [] };

    const { rows } = await query(
      `SELECT 
         period,
         p10, p25, p50, p75, p90
       FROM story_storage_colocation_percentiles
       WHERE export_date = $1
         AND ($2::text IS NULL OR bundesland_ags = $2::text)
         AND ($3::text IS NULL OR period >= $3::text)
         AND ($4::text IS NULL OR period <= $4::text)
       ORDER BY period ASC`,
      [exportDate, bundeslandAgs ?? null, startPeriod ?? null, endPeriod ?? null]
    );

    const data = rows.map((r: any) => ({
      period: r.period,
      p10_p90: [parseFloat(r.p10), parseFloat(r.p90)],
      p25_p75: [parseFloat(r.p25), parseFloat(r.p75)],
      median: parseFloat(r.p50),
    }));

    return { export_date: exportDate, data };
  });

  // Viz Endpoint 3: Map snapshot (Latest state of all regions)
  app.get('/stories/colocation/viz/map-snapshot', {
    schema: {
      description: 'Get latest colocation rates and totals per Bundesland for choropleth maps',
      tags: ['Stories'],
    } as any,
  }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    // @ts-ignore
    const query = app.db.query;
    // @ts-ignore
    const getLatestExportDate = app.getLatestExportDate;

    const exportDate = await getLatestExportDate();
    if (!exportDate) return { export_date: null, data: [] };

    const { rows } = await query(
      `SELECT 
         bundesland_ags,
         SUM(total_storage) as total,
         SUM(colocated_storage) as colocated,
         ROUND(100.0 * SUM(colocated_storage) / NULLIF(SUM(total_storage), 0), 2) as rate
       FROM story_storage_colocation_stats
       WHERE export_date = $1
       GROUP BY bundesland_ags`,
      [exportDate]
    );

    const data = rows.map((r: any) => ({
      ags: r.bundesland_ags,
      name: BUNDESLAND_NAMES[r.bundesland_ags] || r.bundesland_ags,
      total: parseInt(r.total),
      colocated: parseInt(r.colocated),
      rate: parseFloat(r.rate),
    }));

    return { export_date: exportDate, data };
  });
}
