-- Cobros y cuotas (FASE 9): refunds.
--
-- Registro de reembolsos de cargos cobrados con tarjeta. Stripe ejecuta el
-- reembolso sobre la cuenta conectada de la academia. Idempotente + RLS tenant.

CREATE TABLE IF NOT EXISTS "refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "academy_id" uuid NOT NULL,
  "charge_id" uuid NOT NULL,
  "stripe_refund_id" text NOT NULL,
  "stripe_payment_intent_id" text,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'eur',
  "reason" text,
  "status" text NOT NULL DEFAULT 'pending',
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "refunds_charge_idx" ON "refunds" USING btree ("charge_id");
CREATE INDEX IF NOT EXISTS "refunds_tenant_idx" ON "refunds" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "refunds_refund_id_idx" ON "refunds" USING btree ("stripe_refund_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_academy_id_academies_id_fk') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_academy_id_academies_id_fk"
      FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_charge_id_charges_id_fk') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_charge_id_charges_id_fk"
      FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_created_by_profiles_id_fk') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_profiles_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'refunds' AND policyname = 'refunds_tenant_access'
  ) THEN
    CREATE POLICY "refunds_tenant_access" ON "refunds"
      FOR ALL
      USING (is_admin() OR tenant_id = get_current_tenant())
      WITH CHECK (is_admin() OR tenant_id = get_current_tenant());
  END IF;
END $$;
