/**
 * @fileoverview Logger configuration for fetcher service
 */

import { pino } from 'pino';
import type { LoggerOptions } from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';

const options: LoggerOptions = {
  level: process.env['LOG_LEVEL'] ?? 'info',
};

// Only add transport in dev mode (pino-pretty must be installed)
if (isDev) {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  };
}

export const logger = pino(options);

export default logger;
