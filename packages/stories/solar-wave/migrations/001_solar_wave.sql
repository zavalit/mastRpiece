-- Story: Solar Wave (daily additions by region)
CREATE TABLE IF NOT EXISTS story_solar_day_region (
  export_date DATE NOT NULL,
  day DATE NOT NULL,
  bundesland_ags TEXT,
  count_units INT NOT NULL,
  sum_netto_kw NUMERIC NOT NULL,
  PRIMARY KEY (export_date, day, bundesland_ags)
);

-- Staging table for story_solar_day_region
CREATE TABLE IF NOT EXISTS story_solar_day_region_staging (
  export_date DATE NOT NULL,
  day DATE NOT NULL,
  bundesland_ags TEXT NOT NULL,
  count_units INTEGER NOT NULL,
  sum_netto_kw NUMERIC NOT NULL,
  PRIMARY KEY (export_date, day, bundesland_ags)
);
