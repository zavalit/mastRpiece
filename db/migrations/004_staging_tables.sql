-- Staging tables for incremental bulk data processing
-- These tables allow memory-efficient processing by using database upserts
-- instead of keeping all aggregates in memory

-- Staging table for story_solar_day_region
CREATE TABLE IF NOT EXISTS story_solar_day_region_staging (
  export_date DATE NOT NULL,
  day DATE NOT NULL,
  bundesland_ags TEXT NOT NULL,
  count_units INTEGER NOT NULL,
  sum_netto_kw NUMERIC NOT NULL,
  PRIMARY KEY (export_date, day, bundesland_ags)
);

-- Staging table for story_storage_day_region
CREATE TABLE IF NOT EXISTS story_storage_day_region_staging (
  export_date DATE NOT NULL,
  day DATE NOT NULL,
  bundesland_ags TEXT NOT NULL,
  count_units INTEGER NOT NULL,
  sum_netto_kw NUMERIC NOT NULL,
  sum_inverter_kw NUMERIC NOT NULL,
  PRIMARY KEY (export_date, day, bundesland_ags)
);

-- Staging table for solar locations (used by colocation story)
CREATE TABLE IF NOT EXISTS story_solar_locations_staging (
  export_date DATE NOT NULL,
  location_id TEXT NOT NULL,
  bundesland_ags TEXT,
  PRIMARY KEY (export_date, location_id)
);

-- Staging table for storage colocation aggregates
CREATE TABLE IF NOT EXISTS story_storage_colocation_staging (
  export_date DATE NOT NULL,
  month DATE NOT NULL,
  bundesland_ags TEXT NOT NULL,
  storage_units INTEGER NOT NULL,
  colocated_units INTEGER NOT NULL,
  PRIMARY KEY (export_date, month, bundesland_ags)
);

-- Staging table for registration lag histograms
CREATE TABLE IF NOT EXISTS story_registration_lag_staging (
  export_date DATE NOT NULL,
  month DATE NOT NULL,
  tech TEXT NOT NULL,
  bundesland_ags TEXT NOT NULL,
  count_units INTEGER NOT NULL,
  p50_lag_days INTEGER NOT NULL,
  p90_lag_days INTEGER NOT NULL,
  PRIMARY KEY (export_date, month, tech, bundesland_ags)
);
