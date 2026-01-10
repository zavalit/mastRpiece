/**
 * @fileoverview Dynamic story loader
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { StoryDefinition } from './types/index.js';

/**
 * Load story definitions from a configuration file
 * @param cwd Current working directory (defaults to process.cwd())
 * @param configName Name of the config file (defaults to stories.json)
 */
export async function loadStoryDefinitions(
  cwd: string = process.cwd(),
  configName: string = 'stories.json'
): Promise<StoryDefinition[]> {
  const configPath = resolve(cwd, configName);
  
  try {
    const content = await readFile(configPath, 'utf8');
    const { stories } = JSON.parse(content) as { stories: string[] };
    
    if (!stories || !Array.isArray(stories)) {
      throw new Error('Invalid stories.json format: expected "stories" array');
    }

    const definitions: StoryDefinition[] = [];
    
    for (const entry of stories) {
      try {
        let module;
        
        // Path-based resolution (starts with . or /)
        if (entry.startsWith('.') || entry.startsWith('/')) {
          const absolutePath = entry.startsWith('/') ? entry : resolve(cwd, entry);
          module = await import(new URL(`file://${absolutePath}`).href);
        } else {
          // Standard package resolution (npm package name)
          module = await import(entry);
        }

        const definition = (module.default || module) as StoryDefinition;
        
        if (definition && definition.name && typeof definition.createBuilder === 'function') {
          definitions.push(definition);
        } else {
          console.warn(`Entry ${entry} does not export a valid StoryDefinition`);
        }
      } catch (importError) {
        console.warn(`Failed to load story ${entry}:`, (importError as Error).message);
      }
    }
    
    return definitions;
  } catch (error) {
    console.warn(`Could not load stories from ${configPath}:`, error);
    return [];
  }
}
