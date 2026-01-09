-- Fetcher run tracking
CREATE TABLE IF NOT EXISTS fetch_runs (
  run_id UUID PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'skipped', 'failed')),
  attempts INT NOT NULL DEFAULT 1,
  portal_last_updated_label TEXT,
  portal_last_updated_at TIMESTAMPTZ,
  download_url TEXT,
  sha256 TEXT,
  bytes BIGINT,
  dataset_id TEXT,
  artifact_path TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS fetch_runs_status_idx ON fetch_runs(status);
CREATE INDEX IF NOT EXISTS fetch_runs_sha256_idx ON fetch_runs(sha256);
CREATE INDEX IF NOT EXISTS fetch_runs_finished_idx ON fetch_runs(finished_at DESC);
