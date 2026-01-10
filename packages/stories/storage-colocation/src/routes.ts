/**
 * @fileoverview Storage Colocation story API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Register storage colocation routes
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const monthQuerySchema = {
    type: 'object',
    properties: {
      startMonth: { type: 'string', description: 'Start month (YYYY-MM-01)' },
      endMonth: { type: 'string', description: 'End month (YYYY-MM-01)' },
    },
  };

  app.get('/stories/storage/colocation', {
    schema: {
      description: 'Get storage-solar colocation stats by month',
      tags: ['Stories'],
      querystring: monthQuerySchema,
    },
  }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const { startMonth, endMonth } = request.query as { startMonth?: string; endMonth?: string };
    
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

    return { export_date: exportDate, data: rows };
  });
}
