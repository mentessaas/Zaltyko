-- 20260918100000_store_schema.sql
-- T2 — Tienda interna por academia.
-- Schema: products, stock_movements, sales, sale_lines.
-- Todo aditivo; no modifica tablas existentes.

-- ============================================================================
-- PRODUCTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "academy_id" uuid NOT NULL REFERENCES "academies"("id") ON DELETE CASCADE,
  "sku" text,
  "name" text NOT NULL,
  "description" text,
  "product_type" text NOT NULL DEFAULT 'physical'
    CHECK (product_type IN ('physical','digital','camp_registration','session_pack')),
  "price_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'EUR',
  "is_active" boolean NOT NULL DEFAULT true,
  "is_featured" boolean NOT NULL DEFAULT false,
  "stock_quantity" integer,
  "low_stock_threshold" integer DEFAULT 5,
  "image_urls" text[] DEFAULT ARRAY[]::text[],
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "visibility" text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','members_only')),
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CHECK ("price_cents" >= 0),
  CHECK ("stock_quantity" IS NULL OR "stock_quantity" >= 0)
);

CREATE INDEX IF NOT EXISTS "products_academy_idx" ON "products" ("academy_id");
CREATE INDEX IF NOT EXISTS "products_academy_active_idx"
  ON "products" ("academy_id","is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "products_sku_uq"
  ON "products" ("academy_id","sku") WHERE "sku" IS NOT NULL;

-- ============================================================================
-- STOCK_MOVEMENTS (auditoría de stock)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "change" integer NOT NULL,
  "source" text NOT NULL
    CHECK (source IN ('sale','manual_adjust','return','restock','initial')),
  "source_id" uuid,
  "notes" text,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "stock_movements_product_idx"
  ON "stock_movements" ("product_id");
CREATE INDEX IF NOT EXISTS "stock_movements_product_created_idx"
  ON "stock_movements" ("product_id","created_at");

-- ============================================================================
-- SALES (cabecera)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "sales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "academy_id" uuid NOT NULL REFERENCES "academies"("id") ON DELETE CASCADE,
  "customer_email" text NOT NULL,
  "customer_name" text,
  "subtotal_cents" integer NOT NULL,
  "total_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'EUR',
  "status" text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','refunded','failed','cancelled')),
  "stripe_checkout_session_id" text,
  "stripe_payment_intent_id" text,
  "stripe_account_id" text, -- Connect destination account
  "paid_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CHECK ("subtotal_cents" >= 0),
  CHECK ("total_cents" >= 0)
);

CREATE INDEX IF NOT EXISTS "sales_academy_idx" ON "sales" ("academy_id");
CREATE INDEX IF NOT EXISTS "sales_academy_status_idx"
  ON "sales" ("academy_id","status");
CREATE INDEX IF NOT EXISTS "sales_status_created_idx"
  ON "sales" ("status","created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_stripe_session_uq"
  ON "sales" ("stripe_checkout_session_id") WHERE "stripe_checkout_session_id" IS NOT NULL;

-- ============================================================================
-- SALE_LINES (items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "sale_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sale_id" uuid NOT NULL REFERENCES "sales"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "quantity" integer NOT NULL,
  "unit_price_cents" integer NOT NULL,
  "line_total_cents" integer NOT NULL,
  CHECK ("quantity" > 0),
  CHECK ("unit_price_cents" >= 0),
  CHECK ("line_total_cents" >= 0)
);

CREATE INDEX IF NOT EXISTS "sale_lines_sale_idx" ON "sale_lines" ("sale_id");
CREATE INDEX IF NOT EXISTS "sale_lines_product_idx" ON "sale_lines" ("product_id");

-- ============================================================================
-- RLS POLICIES para store
-- ============================================================================
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_lines" ENABLE ROW LEVEL SECURITY;

-- products: lectura pública para is_active=true, modificación por owner
DROP POLICY IF EXISTS "products_public_select" ON "products";
CREATE POLICY "products_public_select" ON "products"
  FOR SELECT USING (
    is_admin()
    OR is_active = true AND visibility = 'public' AND published_at IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM academies a
       WHERE a.id = products.academy_id
         AND a.tenant_id = get_current_tenant()
    )
  );

DROP POLICY IF EXISTS "products_modify" ON "products";
CREATE POLICY "products_modify" ON "products"
  FOR ALL USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academies a
       WHERE a.id = products.academy_id
         AND a.tenant_id = get_current_tenant()
    )
  ) WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academies a
       WHERE a.id = products.academy_id
         AND a.tenant_id = get_current_tenant()
    )
  );

-- stock_movements: solo dentro del tenant
DROP POLICY IF EXISTS "stock_movements_modify" ON "stock_movements";
CREATE POLICY "stock_movements_modify" ON "stock_movements"
  FOR ALL USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM products p
        JOIN academies a ON a.id = p.academy_id
       WHERE p.id = stock_movements.product_id
         AND a.tenant_id = get_current_tenant()
    )
  );

-- sales: academy owner lee/edita; customer puede leer solo si match por email
DROP POLICY IF EXISTS "sales_select" ON "sales";
CREATE POLICY "sales_select" ON "sales"
  FOR SELECT USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academies a
       WHERE a.id = sales.academy_id
         AND a.tenant_id = get_current_tenant()
    )
  );

DROP POLICY IF EXISTS "sales_modify" ON "sales";
CREATE POLICY "sales_modify" ON "sales"
  FOR ALL USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academies a
       WHERE a.id = sales.academy_id
         AND a.tenant_id = get_current_tenant()
    )
  ) WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academies a
       WHERE a.id = sales.academy_id
         AND a.tenant_id = get_current_tenant()
    )
  );

-- sales_lines: lectura sigue sales; escritura solo service role
DROP POLICY IF EXISTS "sale_lines_select" ON "sale_lines";
CREATE POLICY "sale_lines_select" ON "sale_lines"
  FOR SELECT USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM sales s
        JOIN academies a ON a.id = s.academy_id
       WHERE s.id = sale_lines.sale_id
         AND a.tenant_id = get_current_tenant()
    )
  );

DROP POLICY IF EXISTS "sale_lines_insert" ON "sale_lines";
CREATE POLICY "sale_lines_insert" ON "sale_lines"
  FOR INSERT WITH CHECK (is_admin());
