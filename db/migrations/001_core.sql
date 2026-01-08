-- Core tables for story-first architecture
-- Minimal data model: no canonical unit layer

-- Ingest run tracking (replaces ingest_runs)
CREATE TABLE IF NOT EXISTS ingest_run (
  export_date DATE PRIMARY KEY,
  run_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running','success','failed')),
  source_ref TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  error_message TEXT
);

-- Location core lookup (populated opportunistically from unit XML)
CREATE TABLE IF NOT EXISTS location_core (
  location_id TEXT PRIMARY KEY,  -- SEL...
  ags TEXT,
  plz TEXT,
  bundesland_ags TEXT  -- substring(ags,1,2)
);
CREATE INDEX IF NOT EXISTS location_core_bl_idx ON location_core(bundesland_ags);

-- Netzbetreiber lookup (derived from Netzanschlusspunkte)
CREATE TABLE IF NOT EXISTS location_netzbetreiber (
  location_id TEXT PRIMARY KEY,     -- SEL...
  netzbetreiber_id TEXT,            -- SNB...
  last_change_ts TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS location_netzbetreiber_nb_idx ON location_netzbetreiber(netzbetreiber_id);
