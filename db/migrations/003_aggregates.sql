-- Migration: 003_aggregates.sql
-- Description: Create aggregate tables for API endpoints

-- Aggregate table: units commissioned per day
-- Groups by commissioning_date (the day unit was commissioned)
CREATE TABLE agg_commissioning_day (
    day DATE NOT NULL,
    tech TEXT NOT NULL,
    bundesland_code TEXT NULL,
    count_units INT NOT NULL,
    sum_brutto_kw NUMERIC NOT NULL,
    sum_netto_kw NUMERIC NOT NULL,
    PRIMARY KEY (day, tech, bundesland_code)
);

-- Handle NULL bundesland_code in primary key by using empty string
-- We'll store NULL as empty string in the aggregate, but query logic will handle this
ALTER TABLE agg_commissioning_day 
    ALTER COLUMN bundesland_code SET DEFAULT '';

-- Drop and recreate with proper constraint
DROP TABLE agg_commissioning_day;

CREATE TABLE agg_commissioning_day (
    day DATE NOT NULL,
    tech TEXT NOT NULL,
    bundesland_code TEXT NOT NULL DEFAULT '',
    count_units INT NOT NULL,
    sum_brutto_kw NUMERIC NOT NULL,
    sum_netto_kw NUMERIC NOT NULL,
    PRIMARY KEY (day, tech, bundesland_code)
);

-- Aggregate table: units first seen per export day
-- Groups by first_seen_export_date (the day unit first appeared in exports)
CREATE TABLE agg_first_seen_day (
    day DATE NOT NULL,
    tech TEXT NOT NULL,
    bundesland_code TEXT NOT NULL DEFAULT '',
    count_units INT NOT NULL,
    sum_brutto_kw NUMERIC NOT NULL,
    sum_netto_kw NUMERIC NOT NULL,
    PRIMARY KEY (day, tech, bundesland_code)
);

-- Index for efficient range queries on aggregates
CREATE INDEX idx_agg_commissioning_day_range ON agg_commissioning_day (day, tech);
CREATE INDEX idx_agg_first_seen_day_range ON agg_first_seen_day (day, tech);
