-- Crea las tablas del modulo leak-profitability (academy_diagnostics, academy_expenses,
-- churn_reasons, coach_compensation) que estaban en drizzle/0001_cloudy_sleeper.sql
-- pero no se aplicaron a la DB por el bloqueo SELF_SIGNED_CERT_IN_CHAIN.
--
-- Replica el contenido de 0001 con IF NOT EXISTS para idempotencia.
-- No escribe filas sinteticas en __drizzle_migrations: esta migracion debe
-- aparecer por su propio archivo/version y no simular hashes de Drizzle.
--
-- NO incluye ALTER sobre tablas ya existentes (athlete_assessments, billing_invoices)
-- porque el schema Drizzle actual diverge y un ALTER podria romper produccion.

CREATE TABLE IF NOT EXISTS "academy_diagnostics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "academy_id" uuid NOT NULL,
  "answers" jsonb NOT NULL,
  "yes_count" integer NOT NULL,
  "level" text NOT NULL,
  "recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "completed_by" uuid,
  "completed_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "academy_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "academy_id" uuid NOT NULL,
  "label" text NOT NULL,
  "category" text DEFAULT 'other' NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text DEFAULT 'EUR' NOT NULL,
  "recurrence" text DEFAULT 'monthly' NOT NULL,
  "allocation_type" text DEFAULT 'general' NOT NULL,
  "group_id" uuid,
  "class_id" uuid,
  "coach_id" uuid,
  "period" text,
  "effective_from" date,
  "effective_to" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "churn_reasons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "academy_id" uuid NOT NULL,
  "athlete_id" uuid NOT NULL,
  "previous_status" text,
  "new_status" text NOT NULL,
  "reason" text DEFAULT 'unregistered' NOT NULL,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "coach_compensation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "academy_id" uuid NOT NULL,
  "coach_id" uuid NOT NULL,
  "hourly_rate_cents" integer,
  "monthly_salary_cents" integer,
  "estimated_weekly_minutes" integer,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "academy_diagnostics" ADD CONSTRAINT "academy_diagnostics_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "academy_diagnostics" ADD CONSTRAINT "academy_diagnostics_completed_by_profiles_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "academy_expenses" ADD CONSTRAINT "academy_expenses_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "academy_expenses" ADD CONSTRAINT "academy_expenses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "academy_expenses" ADD CONSTRAINT "academy_expenses_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "academy_expenses" ADD CONSTRAINT "academy_expenses_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "churn_reasons" ADD CONSTRAINT "churn_reasons_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "churn_reasons" ADD CONSTRAINT "churn_reasons_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "churn_reasons" ADD CONSTRAINT "churn_reasons_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "coach_compensation" ADD CONSTRAINT "coach_compensation_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "coach_compensation" ADD CONSTRAINT "coach_compensation_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "academy_diagnostics_tenant_idx" ON "academy_diagnostics" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "academy_diagnostics_academy_idx" ON "academy_diagnostics" USING btree ("academy_id");
CREATE INDEX IF NOT EXISTS "academy_diagnostics_completed_at_idx" ON "academy_diagnostics" USING btree ("completed_at");
CREATE INDEX IF NOT EXISTS "academy_expenses_tenant_idx" ON "academy_expenses" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "academy_expenses_academy_idx" ON "academy_expenses" USING btree ("academy_id");
CREATE INDEX IF NOT EXISTS "academy_expenses_period_idx" ON "academy_expenses" USING btree ("academy_id","period");
CREATE INDEX IF NOT EXISTS "academy_expenses_group_idx" ON "academy_expenses" USING btree ("group_id");
CREATE INDEX IF NOT EXISTS "academy_expenses_coach_idx" ON "academy_expenses" USING btree ("coach_id");
CREATE INDEX IF NOT EXISTS "churn_reasons_tenant_idx" ON "churn_reasons" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "churn_reasons_academy_idx" ON "churn_reasons" USING btree ("academy_id");
CREATE INDEX IF NOT EXISTS "churn_reasons_athlete_idx" ON "churn_reasons" USING btree ("athlete_id");
CREATE INDEX IF NOT EXISTS "coach_compensation_tenant_idx" ON "coach_compensation" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "coach_compensation_academy_idx" ON "coach_compensation" USING btree ("academy_id");
CREATE INDEX IF NOT EXISTS "coach_compensation_coach_idx" ON "coach_compensation" USING btree ("coach_id");

ALTER TABLE "academy_diagnostics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academy_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "churn_reasons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coach_compensation" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "academy_diagnostics" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "academy_expenses" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "churn_reasons" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "coach_compensation" TO authenticated, service_role;
