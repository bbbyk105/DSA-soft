-- Migration: Create analyses table
-- Created: 2024-01-01

CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    uniprot_id TEXT NOT NULL,
    method TEXT NOT NULL,
    status TEXT NOT NULL,
    params JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ NULL,
    finished_at TIMESTAMPTZ NULL,
    progress INT NULL,
    metrics JSONB NULL,
    error_message TEXT NULL,
    r2_prefix TEXT NULL,
    result_key TEXT NULL,
    heatmap_key TEXT NULL,
    scatter_key TEXT NULL,
    logs_key TEXT NULL,
    backend_version TEXT NULL,
    git_commit TEXT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analyses_uniprot_created ON analyses(uniprot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
CREATE INDEX IF NOT EXISTS idx_analyses_method ON analyses(method);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at);


