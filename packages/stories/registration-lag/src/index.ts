/**
 * @fileoverview Registration Lag story definition
 */

import { createRegistrationLagBuilder } from './builder.js';
import { registerRoutes } from './routes.js';
import type { StoryDefinition } from '@mastrpiece/shared';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const registrationLagStory: StoryDefinition = {
  name: 'registrationLag',
  createBuilder: createRegistrationLagBuilder,
  registerRoutes,
  migrationsDir: join(__dirname, '../migrations')
};

export default registrationLagStory;
export { createRegistrationLagBuilder, registerRoutes };
