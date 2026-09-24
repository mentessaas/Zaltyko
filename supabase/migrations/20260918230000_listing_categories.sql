-- 20260918230000_listing_categories.sql
-- T7 — Categorización del marketplace.

CREATE TABLE IF NOT EXISTS "listing_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "parent_id" uuid,
  "slug" text NOT NULL,
  "name_es" text NOT NULL,
  "name_en" text NOT NULL,
  "icon" text,
  "sort_order" text NOT NULL DEFAULT '0'
);

CREATE UNIQUE INDEX IF NOT EXISTS "listing_categories_slug_uq"
  ON "listing_categories" ("slug");
CREATE INDEX IF NOT EXISTS "listing_categories_parent_idx"
  ON "listing_categories" ("parent_id");

-- Seed: 8 categorías top-level predefinidas
INSERT INTO "listing_categories" ("id", "slug", "name_es", "name_en", "icon", "sort_order")
VALUES
  (gen_random_uuid(), 'equipment', 'Material deportivo', 'Equipment', '🤸', '1'),
  (gen_random_uuid(), 'apparel', 'Ropa y textiles', 'Apparel', '👕', '2'),
  (gen_random_uuid(), 'camp-slots', 'Slots de camp', 'Camp slots', '🏕️', '3'),
  (gen_random_uuid(), 'session-packs', 'Packs de sesiones', 'Session packs', '🎟️', '4'),
  (gen_random_uuid(), 'mats-mats', 'Colchonetas y摔倒', 'Mats', '🤸', '5'),
  (gen_random_uuid(), 'refurbished', 'Reacondicionado', 'Refurbished', '♻️', '6'),
  (gen_random_uuid(), 'transport', 'Logística y transporte', 'Logistics', '🚚', '7'),
  (gen_random_uuid(), 'other', 'Otros', 'Other', '📦', '99')
ON CONFLICT ("slug") DO NOTHING;

ALTER TABLE "marketplace_listings"
  ADD COLUMN IF NOT EXISTS "category_id" uuid REFERENCES "listing_categories"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "marketplace_listings_category_idx"
  ON "marketplace_listings" ("category_id");

ALTER TABLE "listing_categories" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listing_categories_public_select" ON "listing_categories";
CREATE POLICY "listing_categories_public_select" ON "listing_categories"
  FOR SELECT USING (true);
