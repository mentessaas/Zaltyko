-- Cobros y cuotas (FASE 4): payment_attempts.
--
-- Trazabilidad de cada intento de cobro con tarjeta off-session (Stripe) sobre
-- un cargo. Auditoria + reintentos + dunning. Idempotente + RLS tenant.

CREATE TABLE IF NOT EXISTS "payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "academy_id" uuid NOT NULL,
  "charge_id" uuid NOT NULL,
  "stripe_payment_intent_id" text,
  "stripe_account_id" text,
  "status" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'eur',
  "error_code" text,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "payment_attempts_charge_idx" ON "payment_attempts" USING btree ("charge_id");
CREATE INDEX IF NOT EXISTS "payment_attempts_tenant_idx" ON "payment_attempts" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "payment_attempts_payment_intent_idx" ON "payment_attempts" USING btree ("stripe_payment_intent_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_attempts_academy_id_academies_id_fk') THEN
    ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_academy_id_academies_id_fk"
      FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_attempts_charge_id_charges_id_fk') THEN
    ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_charge_id_charges_id_fk"
      FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "payment_attempts" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_attempts' AND policyname = 'payment_attempts_tenant_access'
  ) THEN
    CREATE POLICY "payment_attempts_tenant_access" ON "payment_attempts"
      FOR ALL
      USING (is_admin() OR tenant_id = get_current_tenant())
      WITH CHECK (is_admin() OR tenant_id = get_current_tenant());
  END IF;
END $$;
