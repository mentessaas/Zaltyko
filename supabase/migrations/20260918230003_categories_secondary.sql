-- 20260918230003_categories_secondary.sql
-- T12 — Categorías secundarias (jerarquía completa)
-- Las 8 categorías top-level ahora pueden tener subcategorías.

-- Añadir sub-categorías como ejemplos
INSERT INTO "listing_categories" ("id", "parent_id", "slug", "name_es", "name_en", "icon", "sort_order")
SELECT
  gen_random_uuid(),
  (SELECT id FROM "listing_categories" WHERE slug = 'equipment'),
  'equipment-grips', 'Grips', 'Grips', '🤸', '1'
WHERE NOT EXISTS (SELECT 1 FROM "listing_categories" WHERE slug = 'equipment-grips');

INSERT INTO "listing_categories" ("id", "parent_id", "slug", "name_es", "name_en", "icon", "sort_order")
SELECT
  gen_random_uuid(),
  (SELECT id FROM "listing_categories" WHERE slug = 'equipment'),
  'equipment-mats', 'Colchonetas', 'Mats', '🤸', '2'
WHERE NOT EXISTS (SELECT 1 FROM "listing_categories" WHERE slug = 'equipment-mats');

INSERT INTO "listing_categories" ("id", "parent_id", "slug", "name_es", "name_en", "icon", "sort_order")
SELECT
  gen_random_uuid(),
  (SELECT id FROM "listing_categories" WHERE slug = 'apparel'),
  'apparel-leotards', 'Maillots', 'Leotards', '👕', '1'
WHERE NOT EXISTS (SELECT 1 FROM "listing_categories" WHERE slug = 'apparel-leotards');

INSERT INTO "listing_categories" ("id", "parent_id", "slug", "name_es", "name_en", "icon", "sort_order")
SELECT
  gen_random_uuid(),
  (SELECT id FROM "listing_categories" WHERE slug = 'camp-slots'),
  'camp-summer-2025', 'Summer camp 2025', 'Summer camp 2025', '☀️', '1'
WHERE NOT EXISTS (SELECT 1 FROM "listing_categories" WHERE slug = 'camp-summer-2025');

-- El FK de parent_id ya existía; verificamos índice
CREATE INDEX IF NOT EXISTS "listing_categories_parent_id_idx"
  ON "listing_categories" ("parent_id");
