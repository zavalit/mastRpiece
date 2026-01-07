-- Migration: 001_init.sql
-- Description: Create core tables for energy unit tracking

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Canonical table for energy units
CREATE TABLE units (
    unit_id TEXT PRIMARY KEY,
    tech TEXT NOT NULL CHECK (tech IN ('solar', 'wind', 'biomass', 'hydro', 'storage', 'other')),
    commissioning_date DATE NULL,
    decommissioning_date DATE NULL,
    brutto_kw NUMERIC NULL,
    netto_kw NUMERIC NULL,
    bundesland_code TEXT NULL,
    ags TEXT NULL,
    plz TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    first_seen_export_date DATE NOT NULL,
    last_seen_export_date DATE NOT NULL,
    record_hash TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ingest run metadata table
CREATE TABLE ingest_runs (
    run_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    export_date DATE NOT NULL,
    source TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    file_sha256 TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    error_message TEXT NULL,
    parsed_records INT NOT NULL DEFAULT 0,
    inserted_records INT NOT NULL DEFAULT 0,
    updated_records INT NOT NULL DEFAULT 0
);

-- Index on ingest_runs for quick lookup of latest successful run
CREATE INDEX idx_ingest_runs_status_export_date ON ingest_runs (status, export_date DESC);
