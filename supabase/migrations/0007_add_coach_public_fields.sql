-- Migration: Add public profile fields to coaches table
-- Created: 2025-11-27

-- Add new columns for public profiles
ALTER TABLE coaches 
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS years_experience TEXT,
ADD COLUMN IF NOT EXISTS social_links JSONB;

-- Create index on slug for fast lookups
CREATE INDEX IF NOT EXISTS coaches_slug_idx ON coaches(slug);

-- Update existing coaches to generate slugs from names
-- This is a one-time operation for existing data
UPDATE coaches 
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
WHERE slug IS NULL AND name IS NOT NULL;

-- Add unique constraint check
-- Note: If there are duplicate slugs after the update, you'll need to manually fix them
-- Example: coach-name, coach-name-2, coach-name-3, etc.

COMMENT ON COLUMN coaches.slug IS 'URL-friendly identifier for public profile';
COMMENT ON COLUMN coaches.years_experience IS 'Years of coaching experience';
COMMENT ON COLUMN coaches.social_links IS 'Social media links (instagram, facebook, twitter, linkedin, website)';
