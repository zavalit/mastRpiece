/**
 * @fileoverview Fastify server entry point with API discovery and OpenAPI
 * Refactored for story-first architecture
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { initPool, closePool } from './infra/db.js';
import { initRedis, closeRedis } from './infra/redis.js';
import { registerDiscoveryRoutes } from './routes/discovery.js';
import { registerStoryRoutes } from './routes/stories.js';

// Load environment variables
dotenvConfig({ path: resolve(process.cwd(), '.env') });

const HOST = process.env['API_HOST'] ?? '0.0.0.0';
const PORT = parseInt(process.env['API_PORT'] ?? '3000', 10);

/**
 * Get public base URL
 */
function getPublicBaseUrl(): string {
  return process.env['PUBLIC_BASE_URL'] ?? `http://localhost:${PORT}`;
}

/**
 * Build the Fastify application
 */
export async function buildApp() {
  const app = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });
  
  // Route collection for discovery
  const routes = new Set<string>();
  app.addHook('onRoute', (routeOptions) => {
    // Only collect GET routes that are not internal (swagger/docs)
    if (
      routeOptions.method === 'GET' && 
      !routeOptions.url.startsWith('/docs') &&
      !routeOptions.url.startsWith('/.well-known') &&
      routeOptions.url !== '/openapi.json'
    ) {
      routes.add(routeOptions.url);
    }
  });

  app.decorate('registeredRoutes', routes);

  // Register CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET'],
  });

  // Register Swagger (OpenAPI)
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Energy Statistics API',
        description: 'Story-first API for German energy unit statistics',
        version: '2.0.0',
      },
      servers: [
        {
          url: getPublicBaseUrl(),
          description: 'API Server',
        },
      ],
      tags: [
        { name: 'Meta', description: 'Dataset metadata' },
        { name: 'Stories', description: 'Story-first data endpoints' },
        { name: 'Discovery', description: 'API discovery' },
      ],
    },
  });

  // Register Swagger UI
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // OpenAPI spec
  app.get('/openapi.json', async (request, reply) => {
    const spec = app.swagger();
    return reply.send(spec);
  });
  
  // Decorate app with DB and helpers for stories
  app.decorate('db', { query: (text: string, params?: any[]) => initPool().query(text, params) });
  
  const getLatestExportDate = async (): Promise<string | null> => {
    const result = await initPool().query<{ export_date: string }>(
      `SELECT export_date::text
       FROM ingest_run
       WHERE status = 'success'
       ORDER BY started_at DESC
       LIMIT 1`
    );
    return result.rows[0]?.export_date ?? null;
  };

  app.decorate('getLatestExportDate', getLatestExportDate);

  // Discovery endpoint
  await registerDiscoveryRoutes(app);

  // Story routes (replaces old KPI/rankings routes)
  await registerStoryRoutes(app);

  return app;
}

/**
 * Start the server
 */
async function start(): Promise<void> {
  // Initialize infrastructure
  initPool();
  initRedis();

  const app = await buildApp();

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down...');
    await app.close();
    await closePool();
    await closeRedis();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await app.listen({ host: HOST, port: PORT });

    console.info(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 Energy Statistics API (Story-First)                   ║
║                                                            ║
║   Local:   http://localhost:${PORT}                          ║
║                                                            ║
║   Discovery:                                               ║
║     GET /.well-known/api     - API discovery               ║
║     GET /openapi.json        - OpenAPI spec                ║
║     GET /docs                - Swagger UI                  ║
║                                                            ║
║   Story Endpoints:                                         ║
║     GET /health              - Health check                ║
║     GET /meta                - Latest ingest run info      ║
║     GET /stories/storage/wave       - Storage wave         ║
║     GET /stories/solar/wave         - Solar wave           ║
║     GET /stories/storage/colocation - Colocation stats     ║
║     GET /stories/lag                - Registration lag     ║
║                                                            ║
║   Press Ctrl+C to stop                                     ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Run if this is the main module
start();
