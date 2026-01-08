/**
 * @fileoverview Rankings endpoint - top Bundesland by metric
 * GET /v1/rankings/bundesland
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../infra/db.js';
import { withCache } from '../cache/cacheMiddleware.js';
import type { RankingsResponse, BundeslandRanking, TechType } from '@energy/shared';
import { isValidTechType } from '@energy/shared';

interface RankingRow {
  bundesland_code: string;
  count_units: string;
  sum_brutto_kw: string;
  sum_netto_kw: string;
}

interface TotalRow {
  total_count: string;
  total_brutto: string;
  total_netto: string;
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
 * GET /rankings/bundesland - Top Bundesland by metric
 */
async function getRankingsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<RankingsResponse | { error: string }> {
  const queryParams = request.query as {
    days?: string;
    end?: string;
    tech?: string;
    metric?: string;
  };
  
  const days = parseInt(queryParams.days ?? '7', 10);
  let endDate = queryParams.end;
  const tech = queryParams.tech ?? 'solar';
  const metric = queryParams.metric ?? 'brutto_kw';

  // Validate tech
  if (!isValidTechType(tech)) {
    void reply.status(400);
    return { error: `Invalid tech type: ${tech}` };
  }

  // Validate metric
  if (metric !== 'brutto_kw' && metric !== 'netto_kw') {
    void reply.status(400);
    return { error: `Invalid metric: ${metric}. Must be 'brutto_kw' or 'netto_kw'` };
  }

  // If no end date provided, use last successful export date
  if (!endDate) {
    const lastDate = await getLastExportDate();
    if (!lastDate) {
      return {
        tech: tech as TechType,
        metric,
        start_date: '',
        end_date: '',
        rankings: [],
        total: {
          count_units: 0,
          sum_brutto_kw: 0,
          sum_netto_kw: 0,
        },
      };
    }
    endDate = lastDate;
  }

  // Calculate start date
  const end = new Date(endDate);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const startDate = start.toISOString().split('T')[0];

  // Query rankings
  const metricColumn = metric === 'brutto_kw' ? 'sum_brutto_kw' : 'sum_netto_kw';
  
  const rankingsResult = await query<RankingRow>(
    `SELECT 
       bundesland_code,
       SUM(count_units)::text as count_units,
       SUM(sum_brutto_kw)::text as sum_brutto_kw,
       SUM(sum_netto_kw)::text as sum_netto_kw
     FROM agg_commissioning_day
     WHERE day >= $1 AND day <= $2 AND tech = $3 AND bundesland_code != ''
     GROUP BY bundesland_code
     ORDER BY SUM(${metricColumn}) DESC`,
    [startDate, endDate, tech]
  );

  // Get totals
  const totalResult = await query<TotalRow>(
    `SELECT 
       SUM(count_units)::text as total_count,
       SUM(sum_brutto_kw)::text as total_brutto,
       SUM(sum_netto_kw)::text as total_netto
     FROM agg_commissioning_day
     WHERE day >= $1 AND day <= $2 AND tech = $3`,
    [startDate, endDate, tech]
  );

  const rankings: BundeslandRanking[] = rankingsResult.rows.map((row: RankingRow) => ({
    bundesland_code: row.bundesland_code,
    count_units: parseInt(row.count_units, 10),
    sum_brutto_kw: parseFloat(row.sum_brutto_kw),
    sum_netto_kw: parseFloat(row.sum_netto_kw),
    metric_value: metric === 'brutto_kw' 
      ? parseFloat(row.sum_brutto_kw) 
      : parseFloat(row.sum_netto_kw),
  }));

  const total = totalResult.rows[0];

  return {
    tech: tech as TechType,
    metric,
    start_date: startDate ?? '',
    end_date: endDate,
    rankings,
    total: {
      count_units: parseInt(total?.total_count ?? '0', 10),
      sum_brutto_kw: parseFloat(total?.total_brutto ?? '0'),
      sum_netto_kw: parseFloat(total?.total_netto ?? '0'),
    },
  };
}

/**
 * Rankings schema for OpenAPI
 */
const rankingsSchema = {
  description: 'Get Bundesland rankings by metric',
  tags: ['Rankings'],
  querystring: {
    type: 'object',
    properties: {
      days: { type: 'integer', default: 7, description: 'Number of days in window' },
      end: { type: 'string', description: 'End date in YYYY-MM-DD format' },
      tech: { type: 'string', default: 'solar', description: 'Technology type' },
      metric: { type: 'string', default: 'brutto_kw', enum: ['brutto_kw', 'netto_kw'] },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        tech: { type: 'string' },
        metric: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        rankings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              bundesland_code: { type: 'string' },
              count_units: { type: 'integer' },
              sum_brutto_kw: { type: 'number' },
              sum_netto_kw: { type: 'number' },
              metric_value: { type: 'number' },
            },
          },
        },
        total: {
          type: 'object',
          properties: {
            count_units: { type: 'integer' },
            sum_brutto_kw: { type: 'number' },
            sum_netto_kw: { type: 'number' },
          },
        },
      },
    },
    400: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
  },
};

/**
 * Register rankings routes
 */
export async function registerRankingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/rankings/bundesland', { schema: rankingsSchema }, withCache(getRankingsHandler));
}
