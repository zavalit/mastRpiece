/**
 * @fileoverview Story endpoints - entry point for all story routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../infra/db.js';
import { withCache } from '../cache/cacheMiddleware.js';
import { loadStoryDefinitions } from '@mastrpiece/shared';

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
 * Register all story routes
 */
export async function registerStoryRoutes(app: FastifyInstance): Promise<void> {
  // Common metadata endpoint
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

  // Load and register independent story routes
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = resolve(__dirname, '../../../../');
  const storiesPath = resolve(workspaceRoot, 'stories.json');
  
  app.log.info(`Loading stories from: ${storiesPath}`);
  const definitions = await loadStoryDefinitions(workspaceRoot, 'stories.json');
  for (const definition of definitions) {
    app.log.info(`Registering story routes: ${definition.name}`);
    await definition.registerRoutes(app);
  }
}
