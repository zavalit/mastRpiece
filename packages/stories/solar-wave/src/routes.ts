/**
 * @fileoverview Solar Wave story API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Register solar wave routes
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const dateQuerySchema = {
    type: 'object',
    properties: {
      start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
      end: { type: 'string', description: 'End date (YYYY-MM-DD)' },
    },
  };

  app.get('/stories/solar/wave', {
    schema: {
      description: 'Get solar wave data by day and region',
      tags: ['Stories'],
      querystring: dateQuerySchema,
    },
  }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const { start, end } = request.query as { start?: string; end?: string };
    
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

    return { export_date: exportDate, data: rows };
  });
}
