-- 20260918150000_marketplace_schema.sql
-- T3 — Marketplace B2B entre academias.
-- Schema: marketplace_listings, marketplace_orders.
-- T3.5 añadirá marketplace_disputes + ratings.
-- Todo aditivo, no rompe nada existente.

CREATE TABLE IF NOT EXISTS "marketplace_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_academy_id" uuid NOT NULL REFERENCES "academies"("id") ON DELETE CASCADE,
  "source_product_id" uuid REFERENCES "products"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "condition" text NOT NULL DEFAULT 'used'
    CHECK ("condition" IN ('new','used','refurbished')),
  "price_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'EUR',
  "quantity_available" integer NOT NULL DEFAULT 1,
  "quantity_sold" integer NOT NULL DEFAULT 0,
  "images_urls" text[] DEFAULT ARRAY[]::text[],
  "zaltyko_commission_cents" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft'
    CHECK ("status" IN ('draft','active','sold','withdrawn','expired')),
  "published_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CHECK ("price_cents" >= 0),
  CHECK ("quantity_available" >= 0),
  CHECK ("quantity_sold" >= 0)
);

CREATE INDEX IF NOT EXISTS "marketplace_listings_seller_idx"
  ON "marketplace_listings" ("seller_academy_id");
CREATE INDEX IF NOT EXISTS "marketplace_listings_status_idx"
  ON "marketplace_listings" ("status","published_at");

CREATE TABLE IF NOT EXISTS "marketplace_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "listing_id" uuid NOT NULL REFERENCES "marketplace_listings"("id") ON DELETE RESTRICT,
  "seller_academy_id" uuid NOT NULL REFERENCES "academies"("id") ON DELETE RESTRICT,
  "buyer_academy_id" uuid NOT NULL REFERENCES "academies"("id") ON DELETE RESTRICT,
  "quantity" integer NOT NULL,
  "total_cents" integer NOT NULL,
  "commission_cents" integer NOT NULL,
  "net_to_seller_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'EUR',
  "status" text NOT NULL DEFAULT 'pending_payment'
    CHECK ("status" IN ('pending_payment','paid','shipped','delivered','disputed','cancelled','refunded')),
  "stripe_checkout_session_id" text,
  "stripe_payment_intent_id" text,
  "paid_at" timestamp with time zone,
  "shipped_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "tracking_number" text,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CHECK ("quantity" > 0),
  CHECK ("total_cents" >= 0)
);

CREATE INDEX IF NOT EXISTS "marketplace_orders_listing_idx"
  ON "marketplace_orders" ("listing_id");
CREATE INDEX IF NOT EXISTS "marketplace_orders_seller_idx"
  ON "marketplace_orders" ("seller_academy_id");
CREATE INDEX IF NOT EXISTS "marketplace_orders_buyer_idx"
  ON "marketplace_orders" ("buyer_academy_id");
CREATE INDEX IF NOT EXISTS "marketplace_orders_status_idx"
  ON "marketplace_orders" ("status","created_at");

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE "marketplace_listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketplace_orders" ENABLE ROW LEVEL SECURITY;

-- listings: lectura pública si active+published; modificación solo seller
DROP POLICY IF EXISTS "marketplace_listings_select" ON "marketplace_listings";
CREATE POLICY "marketplace_listings_select" ON "marketplace_listings"
  FOR SELECT USING (
    is_admin()
    OR status = 'active' AND published_at IS NOT NULL
       AND (expires_at IS NULL OR expires_at > now())
    OR EXISTS (
      SELECT 1 FROM academies a
       WHERE a.id = marketplace_listings.seller_academy_id
         AND a.tenant_id = get_current_tenant()
    )
  );

DROP POLICY IF EXISTS "marketplace_listings_modify" ON "marketplace_listings";
CREATE POLICY "marketplace_listings_modify" ON "marketplace_listings"
  FOR ALL USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academies a
       WHERE a.id = marketplace_listings.seller_academy_id
         AND a.tenant_id = get_current_tenant()
    )
  ) WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academies a
       WHERE a.id = marketplace_listings.seller_academy_id
         AND a.tenant_id = get_current_tenant()
    )
  );

-- orders: seller y buyer pueden leer; modificación admin + service role
DROP POLICY IF EXISTS "marketplace_orders_select" ON "marketplace_orders";
CREATE POLICY "marketplace_orders_select" ON "marketplace_orders"
  FOR SELECT USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academies a
       WHERE a.id IN (marketplace_orders.seller_academy_id, marketplace_orders.buyer_academy_id)
         AND a.tenant_id = get_current_tenant()
    )
  );

DROP POLICY IF EXISTS "marketplace_orders_modify" ON "marketplace_orders";
CREATE POLICY "marketplace_orders_modify" ON "marketplace_orders"
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
