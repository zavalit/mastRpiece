/**
 * @fileoverview Pino logger configuration for builder service
 */

import { pino, type LoggerOptions } from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';

const options: LoggerOptions = {
  level: process.env['LOG_LEVEL'] ?? 'info',
};

if (isDev) {
  options.transport = {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  };
}

export const logger = pino(options);

export default logger;
