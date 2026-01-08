/**
 * @fileoverview Capabilities endpoint - provides API capabilities for UI
 * GET /v1/capabilities
 */

import type { FastifyInstance } from 'fastify';
import { getPool } from '../infra/db.js';
import { withCache } from '../cache/cacheMiddleware.js';

/**
 * Capabilities response structure
 */
interface CapabilitiesResponse {
  techs: string[];
  regions: {
    bundesland_codes: string[];
  };
  date_range: {
    commissioning_min: string | null;
    commissioning_max: string | null;
    first_seen_min: string | null;
    first_seen_max: string | null;
  };
  metrics: string[];
  defaults: {
    rolling_days: number;
  };
}

/**
 * All German Bundesland codes
 */
const BUNDESLAND_CODES = [
  '01', '02', '03', '04', '05', '06', '07', '08',
  '09', '10', '11', '12', '13', '14', '15', '16',
];

/**
 * Supported technology types
 */
const TECH_TYPES = ['solar', 'wind', 'biomass', 'hydro', 'storage', 'other'];

/**
 * Available metrics
 */
const METRICS = ['count_units', 'sum_brutto_kw', 'sum_netto_kw'];

/**
 * Get date ranges from aggregate tables
 */
async function getDateRanges(): Promise<CapabilitiesResponse['date_range']> {
  const pool = getPool();

  // Query commissioning date range
  const commissioningResult = await pool.query<{
    min_day: string | null;
    max_day: string | null;
  }>(`
    SELECT 
      MIN(day)::text as min_day,
      MAX(day)::text as max_day
    FROM agg_commissioning_day
  `);

  // Query first seen date range
  const firstSeenResult = await pool.query<{
    min_day: string | null;
    max_day: string | null;
  }>(`
    SELECT 
      MIN(day)::text as min_day,
      MAX(day)::text as max_day
    FROM agg_first_seen_day
  `);

  return {
    commissioning_min: commissioningResult.rows[0]?.min_day ?? null,
    commissioning_max: commissioningResult.rows[0]?.max_day ?? null,
    first_seen_min: firstSeenResult.rows[0]?.min_day ?? null,
    first_seen_max: firstSeenResult.rows[0]?.max_day ?? null,
  };
}

/**
 * Register capabilities routes
 */
export async function registerCapabilitiesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/capabilities',
    {
      schema: {
        description: 'API capabilities and available options',
        tags: ['Capabilities'],
        response: {
          200: {
            type: 'object',
            properties: {
              techs: { type: 'array', items: { type: 'string' } },
              regions: {
                type: 'object',
                properties: {
                  bundesland_codes: { type: 'array', items: { type: 'string' } },
                },
              },
              date_range: {
                type: 'object',
                properties: {
                  commissioning_min: { type: 'string', nullable: true },
                  commissioning_max: { type: 'string', nullable: true },
                  first_seen_min: { type: 'string', nullable: true },
                  first_seen_max: { type: 'string', nullable: true },
                },
              },
              metrics: { type: 'array', items: { type: 'string' } },
              defaults: {
                type: 'object',
                properties: {
                  rolling_days: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    withCache(async () => {
      const dateRange = await getDateRanges();

      const response: CapabilitiesResponse = {
        techs: TECH_TYPES,
        regions: {
          bundesland_codes: BUNDESLAND_CODES,
        },
        date_range: dateRange,
        metrics: METRICS,
        defaults: {
          rolling_days: 7,
        },
      };

      return response;
    }, { ttl: 3600 })
  );
}
