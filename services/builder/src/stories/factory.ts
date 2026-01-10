/**
 * @fileoverview Story factory - instantiates story builders based on config
 */

import type { StoryBuilder } from '../types.js';
import { createStorageWaveBuilder } from './storageWave.js';
import { createSolarWaveBuilder } from './solarWave.js';
import { createStorageColocationStory } from './storageColocation.js';
import { createRegistrationLagStory } from './registrationLag.js';

/**
 * Map of story names to their factory functions
 */
const STORY_FACTORIES: Record<string, (exportDate: string) => StoryBuilder> = {
  storageWave: createStorageWaveBuilder,
  solarWave: createSolarWaveBuilder,
  storageColocation: createStorageColocationStory,
  registrationLag: createRegistrationLagStory,
};

/**
 * Create story builders based on the requested story names
 */
export function createStoryBuilders(storyNames: string[], exportDate: string): StoryBuilder[] {
  const builders: StoryBuilder[] = [];

  for (const name of storyNames) {
    const factory = STORY_FACTORIES[name];
    if (factory) {
      const builder = factory(exportDate);
      builders.push(builder);
    } else {
      console.warn(`Unknown story: ${name}`);
    }
  }

  return builders;
}

/**
 * Get the list of all available story names
 */
export function getAvailableStories(): string[] {
  return Object.keys(STORY_FACTORIES);
}
