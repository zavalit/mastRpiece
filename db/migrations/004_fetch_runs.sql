-- Migration: 004_fetch_runs.sql
-- Description: Create table for fetch run metadata

CREATE TABLE fetch_runs (
    run_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
    portal_last_updated_label TEXT NULL,
    portal_last_updated_at TIMESTAMPTZ NULL,
    download_url TEXT NULL,
    sha256 TEXT NULL,
    bytes BIGINT NULL,
    dataset_id TEXT NULL,
    artifact_path TEXT NULL,
    error_message TEXT NULL,
    attempts INT NOT NULL DEFAULT 1
);

-- Index for finding latest successful fetch
CREATE INDEX idx_fetch_runs_status_finished ON fetch_runs (status, finished_at DESC);

-- Index for deduping by SHA256
CREATE INDEX idx_fetch_runs_sha256 ON fetch_runs (sha256) WHERE sha256 IS NOT NULL;
