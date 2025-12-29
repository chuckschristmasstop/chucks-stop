-- Ensure description exists
ALTER TABLE contest_entries ADD COLUMN IF NOT EXISTS description text;

-- Drop old text column if it exists (to switch to jsonb)
ALTER TABLE contest_entries DROP COLUMN IF EXISTS allergens;
ALTER TABLE contest_entries DROP COLUMN IF EXISTS ingredients; -- consolidating into allergens/flags

-- Add allergens as JSONB
ALTER TABLE contest_entries ADD COLUMN allergens jsonb;
