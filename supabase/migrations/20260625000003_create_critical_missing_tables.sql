-- Sprint 6C.1 + 6C.4: Crear tablas criticas faltantes con FKs, indices y RLS.
--
-- Cubre (ordenadas por impacto de negocio):
--   - event_registrations, event_waitlist, event_categories, event_payments (modulo eventos)
--   - class_waiting_list (lista de espera de clases)
--   - athlete_documents (documentos de atletas)
--
-- El schema Drizzle declara estas tablas pero no se habian aplicado a la DB.
-- Se crean con IF NOT EXISTS para idempotencia. RLS y policies replican el
-- patron tenant del proyecto.

-- ========================================
-- event_registrations
-- ========================================
CREATE TABLE IF NOT EXISTS "event_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "registered_at" timestamptz DEFAULT now(),
  "notes" text
);

CREATE INDEX IF NOT EXISTS "event_registrations_tenant_idx" ON "event_registrations" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "event_registrations_event_idx" ON "event_registrations" USING btree ("event_id");
CREATE INDEX IF NOT EXISTS "event_registrations_profile_idx" ON "event_registrations" USING btree ("profile_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_registrations_event_id_events_id_fk') THEN
    ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk"
      FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_registrations_profile_id_profiles_id_fk') THEN
    ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "event_registrations" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_registrations" TO authenticated, service_role;

DROP POLICY IF EXISTS "event_registrations_tenant_access" ON "event_registrations";
CREATE POLICY "event_registrations_tenant_access" ON "event_registrations"
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  )
  WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- ========================================
-- event_waitlist
-- ========================================
CREATE TABLE IF NOT EXISTS "event_waitlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "added_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "event_waitlist_tenant_idx" ON "event_waitlist" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "event_waitlist_event_idx" ON "event_waitlist" USING btree ("event_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_waitlist_event_id_events_id_fk') THEN
    ALTER TABLE "event_waitlist" ADD CONSTRAINT "event_waitlist_event_id_events_id_fk"
      FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_waitlist_profile_id_profiles_id_fk') THEN
    ALTER TABLE "event_waitlist" ADD CONSTRAINT "event_waitlist_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "event_waitlist" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_waitlist" TO authenticated, service_role;

DROP POLICY IF EXISTS "event_waitlist_tenant_access" ON "event_waitlist";
CREATE POLICY "event_waitlist_tenant_access" ON "event_waitlist"
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  )
  WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- ========================================
-- event_categories
-- ========================================
CREATE TABLE IF NOT EXISTS "event_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL,
  "description" text
);

CREATE INDEX IF NOT EXISTS "event_categories_tenant_idx" ON "event_categories" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "event_categories_event_idx" ON "event_categories" USING btree ("event_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_categories_event_id_events_id_fk') THEN
    ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_event_id_events_id_fk"
      FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "event_categories" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_categories" TO authenticated, service_role;

DROP POLICY IF EXISTS "event_categories_tenant_access" ON "event_categories";
CREATE POLICY "event_categories_tenant_access" ON "event_categories"
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  )
  WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- ========================================
-- event_payments
-- ========================================
CREATE TABLE IF NOT EXISTS "event_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "registration_id" uuid NOT NULL,
  "amount" integer NOT NULL,
  "currency" varchar(10) NOT NULL DEFAULT 'EUR',
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "paid_at" timestamptz,
  "created_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "event_payments_tenant_idx" ON "event_payments" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "event_payments_registration_idx" ON "event_payments" USING btree ("registration_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_payments_registration_id_event_registrations_id_fk') THEN
    ALTER TABLE "event_payments" ADD CONSTRAINT "event_payments_registration_id_event_registrations_id_fk"
      FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "event_payments" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_payments" TO authenticated, service_role;

DROP POLICY IF EXISTS "event_payments_tenant_access" ON "event_payments";
CREATE POLICY "event_payments_tenant_access" ON "event_payments"
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  )
  WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- ========================================
-- class_waiting_list (crear tabla completa con FKs)
-- ========================================
CREATE TABLE IF NOT EXISTS "class_waiting_list" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "academy_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  "athlete_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "added_at" timestamptz DEFAULT now(),
  "notes" varchar(500)
);

CREATE INDEX IF NOT EXISTS "class_waiting_list_tenant_idx" ON "class_waiting_list" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "class_waiting_list_tenant_academy_idx" ON "class_waiting_list" USING btree ("tenant_id", "academy_id");
CREATE INDEX IF NOT EXISTS "class_waiting_list_class_idx" ON "class_waiting_list" USING btree ("class_id");
CREATE INDEX IF NOT EXISTS "class_waiting_list_athlete_idx" ON "class_waiting_list" USING btree ("athlete_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_waiting_list_academy_id_academies_id_fk') THEN
    ALTER TABLE "class_waiting_list" ADD CONSTRAINT "class_waiting_list_academy_id_academies_id_fk"
      FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_waiting_list_class_id_classes_id_fk') THEN
    ALTER TABLE "class_waiting_list" ADD CONSTRAINT "class_waiting_list_class_id_classes_id_fk"
      FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_waiting_list_athlete_id_athletes_id_fk') THEN
    ALTER TABLE "class_waiting_list" ADD CONSTRAINT "class_waiting_list_athlete_id_athletes_id_fk"
      FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "class_waiting_list" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "class_waiting_list" TO authenticated, service_role;

-- ========================================
-- athlete_documents
-- ========================================
CREATE TABLE IF NOT EXISTS "athlete_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "athlete_id" uuid NOT NULL,
  "document_type" varchar(50) NOT NULL,
  "title" varchar(200) NOT NULL,
  "file_url" text NOT NULL,
  "file_name" varchar(255),
  "file_size" integer,
  "mime_type" varchar(100),
  "uploaded_by" uuid,
  "uploaded_at" timestamptz DEFAULT now(),
  "expires_at" timestamptz,
  "notes" text,
  "created_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "athlete_documents_tenant_idx" ON "athlete_documents" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "athlete_documents_athlete_idx" ON "athlete_documents" USING btree ("athlete_id");
CREATE INDEX IF NOT EXISTS "athlete_documents_type_idx" ON "athlete_documents" USING btree ("document_type");
CREATE INDEX IF NOT EXISTS "athlete_documents_uploader_idx" ON "athlete_documents" USING btree ("uploaded_by");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'athlete_documents_athlete_id_athletes_id_fk') THEN
    ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_athlete_id_athletes_id_fk"
      FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'athlete_documents_uploaded_by_profiles_id_fk') THEN
    ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_uploaded_by_profiles_id_fk"
      FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "athlete_documents" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "athlete_documents" TO authenticated, service_role;