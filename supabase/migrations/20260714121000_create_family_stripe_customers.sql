-- Cobros y cuotas (FASE 2): family_stripe_customers.
--
-- Customer de Stripe de cada familia dentro de la cuenta conectada de su
-- academia (Connect Standard). Clave (academy_id, profile_id). Solo referencias
-- e info de display de la tarjeta; NUNCA el PAN. Idempotente + RLS tenant.

CREATE TABLE IF NOT EXISTS "family_stripe_customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "academy_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "stripe_customer_id" text NOT NULL,
  "default_payment_method_id" text,
  "card_brand" text,
  "card_last4" text,
  "card_exp_month" integer,
  "card_exp_year" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "family_stripe_customers_academy_profile_unique"
  ON "family_stripe_customers" USING btree ("academy_id", "profile_id");
CREATE INDEX IF NOT EXISTS "family_stripe_customers_tenant_idx"
  ON "family_stripe_customers" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "family_stripe_customers_customer_idx"
  ON "family_stripe_customers" USING btree ("stripe_customer_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'family_stripe_customers_academy_id_academies_id_fk') THEN
    ALTER TABLE "family_stripe_customers" ADD CONSTRAINT "family_stripe_customers_academy_id_academies_id_fk"
      FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'family_stripe_customers_profile_id_profiles_id_fk') THEN
    ALTER TABLE "family_stripe_customers" ADD CONSTRAINT "family_stripe_customers_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "family_stripe_customers" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'family_stripe_customers' AND policyname = 'family_stripe_customers_tenant_access'
  ) THEN
    CREATE POLICY "family_stripe_customers_tenant_access" ON "family_stripe_customers"
      FOR ALL
      USING (is_admin() OR tenant_id = get_current_tenant())
      WITH CHECK (is_admin() OR tenant_id = get_current_tenant());
  END IF;
END $$;
