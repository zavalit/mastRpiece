/**
 * @fileoverview Solar Wave story definition
 */

import { createSolarWaveBuilder } from './builder.js';
import { registerRoutes } from './routes.js';
import type { StoryDefinition } from '@mastrpiece/shared';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const solarWaveStory: StoryDefinition = {
  name: 'solarWave',
  createBuilder: createSolarWaveBuilder,
  registerRoutes,
  migrationsDir: join(__dirname, '../migrations')
};

export default solarWaveStory;
export { createSolarWaveBuilder, registerRoutes };
