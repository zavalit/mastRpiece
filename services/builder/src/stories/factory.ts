/**
 * @fileoverview Story factory - dynamic loading of story builders
 */

import { loadStoryDefinitions, type StoryBuilder, type StoryDefinition } from '@mastrpiece/shared';

/**
 * Create story builders based on the requested story names
 */
export async function createStoryBuilders(storyNames: string[], exportDate: string): Promise<StoryBuilder[]> {
  const definitions: StoryDefinition[] = await loadStoryDefinitions();
  const builders: StoryBuilder[] = [];

  for (const name of storyNames) {
    const definition = definitions.find((d: StoryDefinition) => d.name === name);
    if (definition) {
      const builder = definition.createBuilder(exportDate);
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
export async function getAvailableStories(): Promise<string[]> {
  const definitions: StoryDefinition[] = await loadStoryDefinitions();
  return definitions.map((d: StoryDefinition) => d.name);
}
