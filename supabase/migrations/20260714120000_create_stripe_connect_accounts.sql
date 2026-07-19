-- Cobros y cuotas (FASE 1): tabla stripe_accounts para Stripe Connect Standard.
--
-- Cada academia conecta su propia cuenta de Stripe (Connect Standard). Zaltyko
-- solo persiste el id de la cuenta conectada (acct_…) y el estado de
-- habilitacion reportado por Stripe (webhook account.updated). Nunca guarda
-- claves secretas ni custodia fondos.
--
-- Idempotente (IF NOT EXISTS). RLS replica el patron tenant del proyecto: la
-- tabla es defensa en profundidad para acceso directo del cliente Supabase; el
-- aislamiento real lo garantizan los wrappers server-side (withTenant).

CREATE TABLE IF NOT EXISTS "stripe_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "academy_id" uuid NOT NULL,
  "stripe_account_id" text NOT NULL,
  "country" text,
  "default_currency" text NOT NULL DEFAULT 'eur',
  "charges_enabled" boolean NOT NULL DEFAULT false,
  "payouts_enabled" boolean NOT NULL DEFAULT false,
  "details_submitted" boolean NOT NULL DEFAULT false,
  "onboarding_status" text NOT NULL DEFAULT 'pending',
  "last_synced_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "stripe_accounts_academy_unique" ON "stripe_accounts" USING btree ("academy_id");
CREATE INDEX IF NOT EXISTS "stripe_accounts_tenant_idx" ON "stripe_accounts" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "stripe_accounts_account_id_idx" ON "stripe_accounts" USING btree ("stripe_account_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_accounts_academy_id_academies_id_fk') THEN
    ALTER TABLE "stripe_accounts" ADD CONSTRAINT "stripe_accounts_academy_id_academies_id_fk"
      FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "stripe_accounts" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stripe_accounts' AND policyname = 'stripe_accounts_tenant_access'
  ) THEN
    CREATE POLICY "stripe_accounts_tenant_access" ON "stripe_accounts"
      FOR ALL
      USING (is_admin() OR tenant_id = get_current_tenant())
      WITH CHECK (is_admin() OR tenant_id = get_current_tenant());
  END IF;
END $$;
