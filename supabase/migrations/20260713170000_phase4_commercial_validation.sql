-- Fase 4: fuente first-party de funnel + entrevistas comerciales verificables.
-- Migracion aditiva: no modifica ni elimina datos existentes.

CREATE TABLE "growth_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_name" text NOT NULL,
  "visitor_id" text,
  "user_id" uuid,
  "academy_id" uuid,
  "tenant_id" uuid,
  "plan_code" text,
  "source" text DEFAULT 'app' NOT NULL,
  "properties" jsonb,
  "idempotency_key" text,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "commercial_interviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid,
  "academy_fingerprint" text NOT NULL,
  "academy_name" text NOT NULL,
  "contact_name" text,
  "contact_email" text,
  "country_code" text,
  "city" text,
  "modality" text,
  "athlete_count" integer,
  "coach_count" integer,
  "location_count" integer DEFAULT 1 NOT NULL,
  "current_tools" text,
  "biggest_pain" text,
  "most_valuable_feature" text,
  "primary_objection" text,
  "easy_price_eur_cents" integer,
  "limit_price_eur_cents" integer,
  "preferred_pricing_model" text,
  "free_plan_expectation" text,
  "upgrade_trigger" text,
  "beta_interest" text DEFAULT 'unknown' NOT NULL,
  "willingness_to_pay" text DEFAULT 'unknown' NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "scheduled_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "notes" text,
  "created_by_profile_id" uuid,
  "updated_by_profile_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "commercial_interviews_status_check"
    CHECK ("status" in ('scheduled', 'completed', 'no_show', 'cancelled')),
  CONSTRAINT "commercial_interviews_beta_interest_check"
    CHECK ("beta_interest" in ('unknown', 'yes', 'no', 'maybe')),
  CONSTRAINT "commercial_interviews_willingness_to_pay_check"
    CHECK ("willingness_to_pay" in ('unknown', 'yes', 'no', 'maybe')),
  CONSTRAINT "commercial_interviews_non_negative_counts_check"
    CHECK (coalesce("athlete_count", 0) >= 0 and coalesce("coach_count", 0) >= 0 and "location_count" > 0),
  CONSTRAINT "commercial_interviews_price_range_check"
    CHECK (coalesce("easy_price_eur_cents", 0) >= 0 and coalesce("limit_price_eur_cents", 0) >= coalesce("easy_price_eur_cents", 0)),
  CONSTRAINT "commercial_interviews_completed_evidence_check"
    CHECK (
      "status" <> 'completed'
      or (
        "completed_at" is not null
        and "athlete_count" is not null
        and nullif(btrim("current_tools"), '') is not null
        and nullif(btrim("biggest_pain"), '') is not null
        and nullif(btrim("primary_objection"), '') is not null
        and "easy_price_eur_cents" is not null
        and "limit_price_eur_cents" is not null
      )
    )
);

ALTER TABLE "growth_events"
  ADD CONSTRAINT "growth_events_user_id_profiles_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null;
ALTER TABLE "growth_events"
  ADD CONSTRAINT "growth_events_academy_id_academies_id_fk"
  FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE set null;
ALTER TABLE "commercial_interviews"
  ADD CONSTRAINT "commercial_interviews_lead_id_leads_id_fk"
  FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null;
ALTER TABLE "commercial_interviews"
  ADD CONSTRAINT "commercial_interviews_created_by_profile_id_profiles_id_fk"
  FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null;
ALTER TABLE "commercial_interviews"
  ADD CONSTRAINT "commercial_interviews_updated_by_profile_id_profiles_id_fk"
  FOREIGN KEY ("updated_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null;

CREATE INDEX "growth_events_event_occurred_idx" ON "growth_events" ("event_name", "occurred_at");
CREATE INDEX "growth_events_academy_occurred_idx" ON "growth_events" ("academy_id", "occurred_at");
CREATE INDEX "growth_events_visitor_occurred_idx" ON "growth_events" ("visitor_id", "occurred_at");
CREATE UNIQUE INDEX "growth_events_idempotency_unique" ON "growth_events" ("idempotency_key");
CREATE INDEX "commercial_interviews_status_completed_idx" ON "commercial_interviews" ("status", "completed_at");
CREATE INDEX "commercial_interviews_lead_idx" ON "commercial_interviews" ("lead_id");
CREATE UNIQUE INDEX "commercial_interviews_academy_fingerprint_unique"
  ON "commercial_interviews" ("academy_fingerprint");

-- La app escribe por conexion server-side. El cliente Supabase solo puede leer
-- o administrar estas superficies cuando el JWT pertenece a un Super Admin.
ALTER TABLE "growth_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_interviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "growth_events_super_admin_select" ON "growth_events"
  FOR SELECT USING (is_super_admin());

CREATE POLICY "commercial_interviews_super_admin_all" ON "commercial_interviews"
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "leads_insert" ON "leads";
DROP POLICY IF EXISTS "leads_select" ON "leads";
DROP POLICY IF EXISTS "leads_update" ON "leads";
DROP POLICY IF EXISTS "leads_delete" ON "leads";
DROP POLICY IF EXISTS "leads_super_admin_all" ON "leads";
CREATE POLICY "leads_super_admin_all" ON "leads"
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
