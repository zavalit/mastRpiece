-- Migration: 002_indexes.sql
-- Description: Create performance indexes on units table

-- Composite index for tech + commissioning date queries
CREATE INDEX idx_units_tech_commissioning ON units (tech, commissioning_date);

-- Composite index for bundesland + commissioning date queries
CREATE INDEX idx_units_bundesland_commissioning ON units (bundesland_code, commissioning_date);

-- Index for commissioning date range queries
CREATE INDEX idx_units_commissioning_date ON units (commissioning_date);

-- Index for last seen export date (for tracking stale records)
CREATE INDEX idx_units_last_seen_export_date ON units (last_seen_export_date);

-- Index for active units filtering
CREATE INDEX idx_units_is_active ON units (is_active) WHERE is_active = true;
