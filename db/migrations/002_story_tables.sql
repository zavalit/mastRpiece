-- Story tables for data-mart approach
-- These are rebuilt nightly via TRUNCATE + INSERT

-- Story 1: Storage Wave (daily additions by region)
CREATE TABLE IF NOT EXISTS story_storage_day_region (
  export_date DATE NOT NULL,
  day DATE NOT NULL,                 -- Inbetriebnahmedatum
  bundesland_ags TEXT,
  count_units INT NOT NULL,
  sum_netto_kw NUMERIC NOT NULL,
  sum_inverter_kw NUMERIC NOT NULL,
  PRIMARY KEY (export_date, day, bundesland_ags)
);

-- Story 2: Solar Wave (daily additions by region)
CREATE TABLE IF NOT EXISTS story_solar_day_region (
  export_date DATE NOT NULL,
  day DATE NOT NULL,
  bundesland_ags TEXT,
  count_units INT NOT NULL,
  sum_netto_kw NUMERIC NOT NULL,
  PRIMARY KEY (export_date, day, bundesland_ags)
);

-- Story 3 helper: Solar locations (for colocation join)
CREATE TABLE IF NOT EXISTS story_solar_locations (
  export_date DATE NOT NULL,
  location_id TEXT NOT NULL,
  bundesland_ags TEXT,
  PRIMARY KEY (export_date, location_id)
);

-- Story 3: Storage ↔ Solar Co-location (monthly)
CREATE TABLE IF NOT EXISTS story_storage_colocation_month (
  export_date DATE NOT NULL,
  month DATE NOT NULL,               -- first day of month
  bundesland_ags TEXT,
  storage_units INT NOT NULL,
  colocated_units INT NOT NULL,
  colocated_rate NUMERIC NOT NULL,   -- 0..1
  PRIMARY KEY (export_date, month, bundesland_ags)
);

-- Story 4: Registration lag (commissioned vs registered)
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

-- Optional Story 5: Storage by DSO (netzbetreiber)
CREATE TABLE IF NOT EXISTS story_storage_day_netzbetreiber (
  export_date DATE NOT NULL,
  day DATE NOT NULL,
  netzbetreiber_id TEXT,
  count_units INT NOT NULL,
  sum_netto_kw NUMERIC NOT NULL,
  PRIMARY KEY (export_date, day, netzbetreiber_id)
);
