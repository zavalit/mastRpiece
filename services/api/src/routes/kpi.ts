/**
 * @fileoverview KPI endpoints - today and rolling window statistics
 * GET /v1/kpi/today
 * GET /v1/kpi/rolling
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../infra/db.js';
import { withCache } from '../cache/cacheMiddleware.js';
import type { KpiTodayResponse, KpiRollingResponse, TechKpi, TechType } from '@energy/shared';

interface AggRow {
  tech: TechType;
  count_units: string;
  sum_brutto_kw: string;
  sum_netto_kw: string;
}

interface LastSuccessRun {
  export_date: string;
}

/**
 * Get last successful export date
 */
async function getLastExportDate(): Promise<string | null> {
  const result = await query<LastSuccessRun>(
    `SELECT export_date::text 
     FROM ingest_runs 
     WHERE status = 'success' 
     ORDER BY finished_at DESC 
     LIMIT 1`
  );
  return result.rows[0]?.export_date ?? null;
}

/**
 * GET /kpi/today - Daily KPI for a specific day
 */
async function getKpiTodayHandler(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<KpiTodayResponse> {
  const queryParams = request.query as { day?: string };
  let day = queryParams.day;

  // If no day provided, use last successful export date
  if (!day) {
    const lastDate = await getLastExportDate();
    if (!lastDate) {
      return {
        day: '',
        kpis: [],
      };
    }
    day = lastDate;
  }

  // Query aggregate table for the day
  const result = await query<AggRow>(
    `SELECT 
       tech,
       SUM(count_units)::text as count_units,
       SUM(sum_brutto_kw)::text as sum_brutto_kw,
       SUM(sum_netto_kw)::text as sum_netto_kw
     FROM agg_commissioning_day
     WHERE day = $1
     GROUP BY tech
     ORDER BY tech`,
    [day]
  );

  const kpis: TechKpi[] = result.rows.map((row: AggRow) => ({
    tech: row.tech,
    count_units: parseInt(row.count_units, 10),
    sum_brutto_kw: parseFloat(row.sum_brutto_kw),
    sum_netto_kw: parseFloat(row.sum_netto_kw),
  }));

  return {
    day,
    kpis,
  };
}

/**
 * GET /kpi/rolling - Rolling window KPI
 */
async function getKpiRollingHandler(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<KpiRollingResponse> {
  const queryParams = request.query as { days?: string; end?: string };
  const days = parseInt(queryParams.days ?? '7', 10);
  let endDate = queryParams.end;

  // If no end date provided, use last successful export date
  if (!endDate) {
    const lastDate = await getLastExportDate();
    if (!lastDate) {
      return {
        start_date: '',
        end_date: '',
        days,
        kpis: [],
      };
    }
    endDate = lastDate;
  }

  // Calculate start date (end - days + 1)
  const end = new Date(endDate);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const startDate = start.toISOString().split('T')[0];

  // Query aggregate table for the rolling window
  const result = await query<AggRow>(
    `SELECT 
       tech,
       SUM(count_units)::text as count_units,
       SUM(sum_brutto_kw)::text as sum_brutto_kw,
       SUM(sum_netto_kw)::text as sum_netto_kw
     FROM agg_commissioning_day
     WHERE day >= $1 AND day <= $2
     GROUP BY tech
     ORDER BY tech`,
    [startDate, endDate]
  );

  const kpis: TechKpi[] = result.rows.map((row: AggRow) => ({
    tech: row.tech,
    count_units: parseInt(row.count_units, 10),
    sum_brutto_kw: parseFloat(row.sum_brutto_kw),
    sum_netto_kw: parseFloat(row.sum_netto_kw),
  }));

  return {
    start_date: startDate ?? '',
    end_date: endDate,
    days,
    kpis,
  };
}

/**
 * TechKpi schema for OpenAPI
 */
const techKpiSchema = {
  type: 'object',
  properties: {
    tech: { type: 'string' },
    count_units: { type: 'integer' },
    sum_brutto_kw: { type: 'number' },
    sum_netto_kw: { type: 'number' },
  },
};

/**
 * KPI today schema
 */
const kpiTodaySchema = {
  description: 'Get daily KPI for a specific day',
  tags: ['KPI'],
  querystring: {
    type: 'object',
    properties: {
      day: { type: 'string', description: 'Date in YYYY-MM-DD format' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        day: { type: 'string' },
        kpis: { type: 'array', items: techKpiSchema },
      },
    },
  },
};

/**
 * KPI rolling schema
 */
const kpiRollingSchema = {
  description: 'Get rolling window KPI statistics',
  tags: ['KPI'],
  querystring: {
    type: 'object',
    properties: {
      days: { type: 'integer', default: 7, description: 'Number of days in window' },
      end: { type: 'string', description: 'End date in YYYY-MM-DD format' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        days: { type: 'integer' },
        kpis: { type: 'array', items: techKpiSchema },
      },
    },
  },
};

/**
 * Register KPI routes
 */
export async function registerKpiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/kpi/today', { schema: kpiTodaySchema }, withCache(getKpiTodayHandler));
  app.get('/kpi/rolling', { schema: kpiRollingSchema }, withCache(getKpiRollingHandler));
}
