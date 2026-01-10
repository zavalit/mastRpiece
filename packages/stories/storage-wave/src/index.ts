/**
 * @fileoverview Storage Wave story definition
 */

import { createStorageWaveBuilder } from './builder.js';
import { registerRoutes } from './routes.js';
import type { StoryDefinition } from '@mastrpiece/shared';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const storageWaveStory: StoryDefinition = {
  name: 'storageWave',
  createBuilder: createStorageWaveBuilder,
  registerRoutes,
  migrationsDir: join(__dirname, '../migrations')
};

export default storageWaveStory;
export { createStorageWaveBuilder, registerRoutes };
