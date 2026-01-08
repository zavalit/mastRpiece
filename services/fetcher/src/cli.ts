#!/usr/bin/env node
/**
 * @fileoverview CLI entry point for the energy fetcher
 */

import { parseCliArgs } from './config.js';
import { fetchBulk } from './usecases/fetchBulk.js';
import logger from './infra/logger.js';

async function main(): Promise<void> {
  const config = parseCliArgs();

  logger.info(
    { portalUrl: config.portalUrl, artifactRoot: config.artifactRoot },
    'Starting fetcher'
  );

  const result = await fetchBulk(config);

  if (result.success) {
    if (result.skipped) {
      logger.info('Fetch skipped (already up to date)');
    } else {
      logger.info(
        {
          datasetId: result.datasetId,
          sha256: result.sha256?.substring(0, 12) + '...',
          bytes: result.bytes,
        },
        'Fetch completed successfully'
      );
    }
    process.exit(0);
  } else {
    logger.error({ error: result.error }, 'Fetch failed');
    process.exit(1);
  }
}

main();
