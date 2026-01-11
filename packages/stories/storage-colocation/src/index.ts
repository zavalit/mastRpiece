/**
 * @fileoverview Storage Colocation story definition
 */

import { createStorageColocationBuilder } from './builder.js';
import { registerRoutes } from './routes.js';
import type { StoryDefinition } from '@mastrpiece/shared';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const storageColocationStory: StoryDefinition = {
  name: 'storageColocation',
  tables: [
    'story_storage_colocation_stats', 
    'story_storage_colocation_lag_hist',
    'story_storage_colocation_percentiles'
  ],
  createBuilder: createStorageColocationBuilder,
  registerRoutes,
  migrationsDir: join(__dirname, '../migrations')
};

export default storageColocationStory;
export { createStorageColocationBuilder, registerRoutes };
