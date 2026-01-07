/**
 * @fileoverview Redis infrastructure for caching
 */

import { Redis } from 'ioredis';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';

dotenvConfig({ path: resolve(process.cwd(), '.env') });

let redis: Redis | null = null;

/**
 * Initialize Redis client
 */
export function initRedis(): Redis {
  if (redis) {
    return redis;
  }

  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  redis.on('error', (err: Error) => {
    console.error('Redis connection error:', err);
  });

  redis.on('connect', () => {
    console.info('Redis connected');
  });

  return redis;
}

/**
 * Get the current Redis client
 */
export function getRedis(): Redis {
  if (!redis) {
    throw new Error('Redis not initialized. Call initRedis first.');
  }
  return redis;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

/**
 * Get cached value
 */
export async function getCache(key: string): Promise<string | null> {
  const r = getRedis();
  return r.get(key);
}

/**
 * Set cached value with TTL
 */
export async function setCache(key: string, value: string, ttlSeconds: number): Promise<void> {
  const r = getRedis();
  await r.setex(key, ttlSeconds, value);
}

/**
 * Delete cached value
 */
export async function deleteCache(key: string): Promise<void> {
  const r = getRedis();
  await r.del(key);
}

/**
 * Clear all cache keys matching a pattern
 */
export async function clearCachePattern(pattern: string): Promise<void> {
  const r = getRedis();
  const keys = await r.keys(pattern);
  if (keys.length > 0) {
    await r.del(...keys);
  }
}
