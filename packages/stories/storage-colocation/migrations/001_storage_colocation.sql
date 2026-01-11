-- Storage Colocation Story: PV and Storage co-location analysis

-- ============================================================================
-- STAGING TABLES
-- ============================================================================

-- PV facts: minimal data from solar units
CREATE TABLE IF NOT EXISTS story_colocation_pv_staging (
  export_date DATE NOT NULL,
  location_id TEXT NOT NULL,
  pv_date DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_colocation_pv_staging 
  ON story_colocation_pv_staging(export_date, location_id);

-- Storage facts: minimal data from storage units
CREATE TABLE IF NOT EXISTS story_colocation_storage_staging (
  export_date DATE NOT NULL,
  location_id TEXT NOT NULL,
  storage_date DATE NOT NULL,
  period TEXT NOT NULL  -- YYYY-MM format
);
CREATE INDEX IF NOT EXISTS idx_colocation_storage_staging 
  ON story_colocation_storage_staging(export_date, location_id);

-- Earliest PV date per location (computed during finalization)
CREATE TABLE IF NOT EXISTS story_colocation_pv_loc_staging (
  export_date DATE NOT NULL,
  location_id TEXT NOT NULL,
  earliest_pv_date DATE NOT NULL,
  PRIMARY KEY (export_date, location_id)
);

-- ============================================================================
-- CANONICAL TABLES
-- ============================================================================

-- Monthly storage statistics: total vs co-located
CREATE TABLE IF NOT EXISTS story_storage_colocation_stats (
  export_date DATE NOT NULL,
  period TEXT NOT NULL,  -- YYYY-MM
  total_storage BIGINT NOT NULL,
  colocated_storage BIGINT NOT NULL,
  PRIMARY KEY (export_date, period)
);

-- Lag histogram: time between PV and storage commissioning
-- Bins: pv_after_storage, 0-3m, 3-12m, 1-2y, 2-4y, 4-6y, 6y+
CREATE TABLE IF NOT EXISTS story_storage_colocation_lag_hist (
  export_date DATE NOT NULL,
  lag_bin TEXT NOT NULL,
  count BIGINT NOT NULL,
  PRIMARY KEY (export_date, lag_bin)
);
