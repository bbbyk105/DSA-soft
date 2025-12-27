-- Migration: Add session_id column to analyses table
-- Created: 2024-12-26

-- Add session_id column
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Create index for session_id queries
CREATE INDEX IF NOT EXISTS idx_analyses_session_id ON analyses(session_id, created_at DESC);

