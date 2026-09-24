-- 20260918230001_pg_trgm.sql
-- T8 — Búsqueda fuzzy con pg_trgm en marketplace_listings.
-- Mejora significativa vs LIKE para typos y búsquedas aproximadas.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "marketplace_listings_title_trgm_idx"
  ON "marketplace_listings"
  USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "marketplace_listings_description_trgm_idx"
  ON "marketplace_listings"
  USING GIN ("description" gin_trgm_ops)
  WHERE "description" IS NOT NULL;
