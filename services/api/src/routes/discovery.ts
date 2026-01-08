/**
 * @fileoverview Discovery endpoint for API clients
 * GET /.well-known/api
 */

import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';

const API_NAME = 'energy-stats-api';
const DEFAULT_CACHE_TTL = parseInt(process.env['CACHE_TTL'] ?? '300', 10);

/**
 * Get public base URL from environment or derive from request
 */
function getPublicBaseUrl(requestHost?: string, requestProto?: string): string {
  const envUrl = process.env['PUBLIC_BASE_URL'];
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  
  if (requestHost) {
    const proto = requestProto ?? 'http';
    return `${proto}://${requestHost}`;
  }
  
  return 'http://localhost:3000';
}

/**
 * Discovery response structure
 */
interface DiscoveryResponse {
  name: string;
  version: string;
  base_url: string;
  openapi_url: string;
  docs_url: string;
  endpoints: Record<string, string>;
  caching: {
    default_ttl_seconds: number;
    supports_etag: boolean;
  };
}

/**
 * Register discovery routes
 */
export async function registerDiscoveryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/.well-known/api',
    {
      schema: {
        description: 'API discovery endpoint',
        tags: ['Discovery'],
        response: {
          200: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              base_url: { type: 'string' },
              openapi_url: { type: 'string' },
              docs_url: { type: 'string' },
              endpoints: { type: 'object' },
              caching: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const baseUrl = getPublicBaseUrl(
        request.headers.host,
        request.headers['x-forwarded-proto'] as string | undefined
      );

      const response: DiscoveryResponse = {
        name: API_NAME,
        version: '1.0.0',
        base_url: baseUrl,
        openapi_url: `${baseUrl}/openapi.json`,
        docs_url: `${baseUrl}/docs`,
        endpoints: {
          health: '/health',
          meta: '/meta',
          kpi_today: '/kpi/today',
          kpi_rolling: '/kpi/rolling',
          rankings_bundesland: '/rankings/bundesland',
          capabilities: '/capabilities',
        },
        caching: {
          default_ttl_seconds: DEFAULT_CACHE_TTL,
          supports_etag: true,
        },
      };

      // Generate ETag from response content
      const etag = `"${createHash('md5').update(JSON.stringify(response)).digest('hex')}"`;

      // Check If-None-Match for 304 response
      const ifNoneMatch = request.headers['if-none-match'];
      if (ifNoneMatch === etag) {
        return reply.status(304).send();
      }

      reply
        .header('Content-Type', 'application/json')
        .header('Cache-Control', 'public, max-age=60')
        .header('ETag', etag);

      return response;
    }
  );
}
