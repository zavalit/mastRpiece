-- Story helper: Solar locations (for colocation join)
CREATE TABLE IF NOT EXISTS story_solar_locations (
  export_date DATE NOT NULL,
  location_id TEXT NOT NULL,
  bundesland_ags TEXT,
  PRIMARY KEY (export_date, location_id)
);

-- Story: Storage ↔ Solar Co-location (monthly)
CREATE TABLE IF NOT EXISTS story_storage_colocation_month (
  export_date DATE NOT NULL,
  month DATE NOT NULL,               -- first day of month
  bundesland_ags TEXT,
  storage_units INT NOT NULL,
  colocated_units INT NOT NULL,
  colocated_rate NUMERIC NOT NULL,   -- 0..1
  PRIMARY KEY (export_date, month, bundesland_ags)
);

-- Staging table for solar locations
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

-- Staging table for individual storage units (for join)
CREATE TABLE IF NOT EXISTS story_storage_units_staging (
  export_date DATE NOT NULL,
  location_id TEXT NOT NULL,
  month DATE NOT NULL,
  bundesland_ags TEXT NOT NULL,
  PRIMARY KEY (export_date, location_id)
);
