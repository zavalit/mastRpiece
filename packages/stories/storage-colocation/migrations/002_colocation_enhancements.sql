-- Storage Colocation Story Enhancements: Bundesland breakdown and Percentiles

-- ============================================================================
-- SCHEMA UPDATES
-- ============================================================================

-- 1. Update PV staging to include Bundesland
ALTER TABLE story_colocation_pv_staging ADD COLUMN IF NOT EXISTS bundesland_ags TEXT DEFAULT '00';

-- 2. Update Storage staging to include Bundesland
ALTER TABLE story_colocation_storage_staging ADD COLUMN IF NOT EXISTS bundesland_ags TEXT DEFAULT '00';

-- 3. Update PV location staging to include Bundesland
ALTER TABLE story_colocation_pv_loc_staging ADD COLUMN IF NOT EXISTS bundesland_ags TEXT DEFAULT '00';
-- Update PK:
ALTER TABLE story_colocation_pv_loc_staging DROP CONSTRAINT IF EXISTS story_colocation_pv_loc_staging_pkey;
ALTER TABLE story_colocation_pv_loc_staging ADD PRIMARY KEY (export_date, location_id, bundesland_ags);

-- 4. Update Stats table to include Bundesland
ALTER TABLE story_storage_colocation_stats ADD COLUMN IF NOT EXISTS bundesland_ags TEXT DEFAULT '00';
ALTER TABLE story_storage_colocation_stats DROP CONSTRAINT IF EXISTS story_storage_colocation_stats_pkey;
ALTER TABLE story_storage_colocation_stats ADD PRIMARY KEY (export_date, period, bundesland_ags);

-- 5. Update Lag Hist table to include Bundesland
ALTER TABLE story_storage_colocation_lag_hist ADD COLUMN IF NOT EXISTS bundesland_ags TEXT DEFAULT '00';
ALTER TABLE story_storage_colocation_lag_hist DROP CONSTRAINT IF EXISTS story_storage_colocation_lag_hist_pkey;
ALTER TABLE story_storage_colocation_lag_hist ADD PRIMARY KEY (export_date, lag_bin, bundesland_ags);

-- 6. New table for Percentiles
CREATE TABLE IF NOT EXISTS story_storage_colocation_percentiles (
  export_date DATE NOT NULL,
  period TEXT NOT NULL,
  bundesland_ags TEXT NOT NULL,
  p10 NUMERIC,
  p25 NUMERIC,
  p50 NUMERIC,
  p75 NUMERIC,
  p90 NUMERIC,
  count BIGINT NOT NULL,
  PRIMARY KEY (export_date, period, bundesland_ags)
);
