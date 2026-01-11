# @mastrpiece/story-storage-colocation

Analyzing co-location patterns between PV (Solar) and Storage (Battery) units at the same physical locations.

## Statistic Domain Scope

This story processes the MaStR (Marktstammdatenregister) dataset to understand how battery storage adoption correlates with solar installations.

### Key Metrics

- **Colocation Rate**: The percentage of new storage units that are installed at a location that already has (or is simultaneously installing) a PV unit.
- **Commissioning Lag**: The time difference in months between the PV commissioning and the storage commissioning.

### Analysis Dimensions

1. **Monthly Statistics**: Total storage units vs. co-located storage units per month.
2. **Lag Distribution**: Binned histogram of the time gap between units:
   - `pv_after_storage`: Storage was installed before PV.
   - `0-3m`: Simultaneous or near-simultaneous installation (dominant pattern).
   - `3-12m`, `1-2y`, `2-4y`, `4-6y`: Various retrofitting timeframes.
   - `6y+`: Long-term retrofitting of existing solar sites.

## Implementation Overview

The package implements the `StoryBuilder` interface and follows the modular pipeline architecture of the Energy-Unit Statistics Platform.

### Data Processing Flow

1. **Element Extraction**: Uses `sax` for streaming XML parsing of `EinheitSolar` and `EinheitStromSpeicher` elements.
2. **In-Memory Buffering**: Records are parsed into light "Fact" objects and buffered.
3. **Batch Staging**: Buffered facts are periodically flushed to PostgreSQL staging tables (`story_colocation_pv_staging`, `story_colocation_storage_staging`) to maintain a low memory footprint.
4. **SQL-Based Aggregation**: The heavy lifting of joins and binning is performed in the `finalizeAndWrite` phase using optimized SQL queries:
   - Identifies the earliest PV date per location.
   - Joins storage records with location-level PV dates.
   - Computes month-precision lags using PostgreSQL date arithmetic.
5. **Idempotency**: All operations are idempotent per `exportDate` using `onPrepare` cleanup and `ON CONFLICT` upserts.

## Database Schema

### Canonical Tables

- `story_storage_colocation_stats`: Monthly aggregation of colocation counts.
- `story_storage_colocation_lag_hist`: Global distribution of installation lags.

## Integration

Registered in `stories.json` for discovery by the `builder` service. Exports Fastify routes for data consumption via the `api` service.
