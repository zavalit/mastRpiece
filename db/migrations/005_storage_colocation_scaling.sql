-- Staging table for storage units (used by colocation story)
CREATE TABLE IF NOT EXISTS story_storage_units_staging (
  export_date DATE NOT NULL,
  location_id TEXT NOT NULL,
  month DATE NOT NULL,
  bundesland_ags TEXT NOT NULL,
  PRIMARY KEY (export_date, location_id)
);
