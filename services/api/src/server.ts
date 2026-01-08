/**
 * @fileoverview Fastify server entry point with API discovery and OpenAPI
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
import { registerMetaRoutes } from './routes/meta.js';
import { registerKpiRoutes } from './routes/kpi.js';
import { registerRankingsRoutes } from './routes/rankings.js';
import { registerCapabilitiesRoutes } from './routes/capabilities.js';

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
        description: 'API for German energy unit statistics',
        version: '1.0.0',
      },
      servers: [
        {
          url: getPublicBaseUrl(),
          description: 'API Server',
        },
      ],
      tags: [
        { name: 'Meta', description: 'Dataset metadata' },
        { name: 'KPI', description: 'Key performance indicators' },
        { name: 'Rankings', description: 'Bundesland rankings' },
        { name: 'Capabilities', description: 'API capabilities' },
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
  
  // Discovery endpoint
  await registerDiscoveryRoutes(app);

  // All routes at root level
  await registerMetaRoutes(app);
  await registerKpiRoutes(app);
  await registerRankingsRoutes(app);
  await registerCapabilitiesRoutes(app);

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
║   🚀 Energy Statistics API is running!                     ║
║                                                            ║
║   Local:   http://localhost:${PORT}                          ║
║                                                            ║
║   Discovery:                                               ║
║     GET /.well-known/api     - API discovery               ║
║     GET /openapi.json        - OpenAPI spec                ║
║     GET /docs                - Swagger UI                  ║
║                                                            ║
║   Endpoints:                                               ║
║     GET /health              - Health check                ║
║     GET /meta                - Dataset metadata            ║
║     GET /kpi/today           - Daily KPI                   ║
║     GET /kpi/rolling         - Rolling window KPI          ║
║     GET /rankings/bundesland - Bundesland rankings         ║
║     GET /capabilities        - API capabilities            ║
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
