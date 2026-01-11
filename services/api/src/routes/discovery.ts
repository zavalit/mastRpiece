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
              endpoints: { type: 'object', additionalProperties: true },
              caching: { 
                type: 'object',
                properties: {
                  default_ttl_seconds: { type: 'number' },
                  supports_etag: { type: 'boolean' }
                }
              },
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

      // Get dynamically collected routes
      const registeredRoutes = app.registeredRoutes;
      const endpoints: Record<string, string> = {};
      
      if (registeredRoutes) {
        // Sort routes to ensure stable discovery response
        const sortedRoutes = Array.from(registeredRoutes).sort();
        
        for (const route of sortedRoutes) {
          // Create a key from the route (e.g. /stories/storage/wave -> storage_wave)
          let key = route.replace(/^\/stories\//, '').replace(/^\//, '').replace(/\//g, '_');
          if (!key) key = 'root';
          endpoints[key] = route;
        }
      } else {
        // Fallback for metadata
        endpoints['health'] = '/health';
        endpoints['meta'] = '/meta';
      }

      const response: DiscoveryResponse = {
        name: API_NAME,
        version: '1.0.0',
        base_url: baseUrl,
        openapi_url: `${baseUrl}/openapi.json`,
        docs_url: `${baseUrl}/docs`,
        endpoints,
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
