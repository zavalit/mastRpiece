/**
 * @fileoverview Redis caching middleware for Fastify
 */

import type { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';
import { getCache, setCache } from '../infra/redis.js';

/**
 * Default cache TTL in seconds
 */
const DEFAULT_TTL = parseInt(process.env['CACHE_TTL'] ?? '300', 10);

/**
 * Generate cache key from request
 */
function generateCacheKey(request: FastifyRequest): string {
  const url = request.url;
  return `api:${url}`;
}

/**
 * Cache middleware options
 */
export interface CacheOptions {
  ttl?: number;
  keyPrefix?: string;
}

/**
 * Apply caching to specific routes
 * This is a simpler approach that wraps the handler
 */
export function withCache<T>(
  handler: (request: FastifyRequest<RouteGenericInterface>, reply: FastifyReply) => Promise<T>,
  options: CacheOptions = {}
): (request: FastifyRequest<RouteGenericInterface>, reply: FastifyReply) => Promise<T | string> {
  const ttl = options.ttl ?? DEFAULT_TTL;

  return async (request: FastifyRequest<RouteGenericInterface>, reply: FastifyReply): Promise<T | string> => {
    const cacheKey = generateCacheKey(request);

    try {
      const cached = await getCache(cacheKey);

      if (cached) {
        void reply.header('x-cache', 'hit');
        return cached;
      }
    } catch (error) {
      request.log.warn({ error }, 'Cache get error');
    }

    void reply.header('x-cache', 'miss');

    // Cast request to the handler's expected type since we've already validated
    const result = await handler(request as Parameters<typeof handler>[0], reply);

    // Cache the result
    try {
      const valueToCache = typeof result === 'string' ? result : JSON.stringify(result);
      await setCache(cacheKey, valueToCache, ttl);
    } catch (error) {
      request.log.warn({ error }, 'Cache set error');
    }

    return result;
  };
}
