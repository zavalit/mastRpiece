-- Story: Registration lag (commissioned vs registered)
CREATE TABLE IF NOT EXISTS story_registration_lag_month (
  export_date DATE NOT NULL,
  month DATE NOT NULL,
  tech TEXT NOT NULL,                -- 'storage','solar'
  bundesland_ags TEXT,
  count_units INT NOT NULL,
  p50_lag_days INT NOT NULL,
  p90_lag_days INT NOT NULL,
  PRIMARY KEY (export_date, month, tech, bundesland_ags)
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

-- Staging table for raw lag events (for percentile computation)
CREATE TABLE IF NOT EXISTS story_registration_lag_events_staging (
  export_date DATE NOT NULL,
  month DATE NOT NULL,
  tech TEXT NOT NULL,
  bundesland_ags TEXT NOT NULL,
  lag_days INTEGER NOT NULL
);
