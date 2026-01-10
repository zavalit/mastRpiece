/**
 * @fileoverview Registration Lag story API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Register registration lag routes
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const lagQuerySchema = {
    type: 'object',
    properties: {
      tech: { type: 'string', enum: ['storage', 'solar'], description: 'Technology type' },
      startMonth: { type: 'string', description: 'Start month (YYYY-MM-01)' },
      endMonth: { type: 'string', description: 'End month (YYYY-MM-01)' },
    },
  };

  app.get('/stories/lag', {
    schema: {
      description: 'Get registration lag statistics',
      tags: ['Stories'],
      querystring: lagQuerySchema,
    },
  }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const { tech, startMonth, endMonth } = request.query as {
      tech?: string;
      startMonth?: string;
      endMonth?: string;
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

    return { export_date: exportDate, data: rows };
  });
}
