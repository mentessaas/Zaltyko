-- 20260918200000_product_variants.sql
-- T4.3 — Variantes de producto (talla, color, etc.)

CREATE TABLE IF NOT EXISTS "product_variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "sku" text,
  "name" text NOT NULL,
  "attributes" text[] DEFAULT ARRAY[]::text[],
  "price_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'EUR',
  "stock_quantity" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CHECK ("price_cents" >= 0)
);

CREATE INDEX IF NOT EXISTS "product_variants_product_idx"
  ON "product_variants" ("product_id");
CREATE INDEX IF NOT EXISTS "product_variants_product_sort_idx"
  ON "product_variants" ("product_id","sort_order");

ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_variants_modify" ON "product_variants";
CREATE POLICY "product_variants_modify" ON "product_variants"
  FOR ALL USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM products p
        JOIN academies a ON a.id = p.academy_id
       WHERE p.id = product_variants.product_id
         AND a.tenant_id = get_current_tenant()
    )
  ) WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM products p
        JOIN academies a ON a.id = p.academy_id
       WHERE p.id = product_variants.product_id
         AND a.tenant_id = get_current_tenant()
    )
  );

DROP POLICY IF EXISTS "product_variants_select" ON "product_variants";
CREATE POLICY "product_variants_select" ON "product_variants"
  FOR SELECT USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM products p
        JOIN academies a ON a.id = p.academy_id
       WHERE p.id = product_variants.product_id
         AND a.tenant_id = get_current_tenant()
    )
  );
