-- marketing_outreach (ZAL-582 / ZAL-580)
-- Tabla operativa y auditable para que Marketing registre outreach manual 1:1
-- (campaign_id + academy_fingerprint + attempt_number + idempotency_key) y para
-- que el reporte operativo pueda reconciliar denominadores (attempts, replies,
-- consented, demos_held, first_value, trials_started, paid_conversions) sin PII
-- en la capa cliente. Esta migracion es aditiva y no modifica tablas vecinas.
--
-- Defensa-en-profundidad: la aplicacion conecta como `postgres` con BYPASSRLS,
-- por lo tanto el aislamiento real depende del wrapper de auth del endpoint
-- (`withAgentAuth`) y no de RLS. La politica RLS de abajo solo protege el camino
-- cliente anonimo/autenticado de Supabase; siempre devuelve deny-by-default.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS "marketing_outreach" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- Identificadores de outreach
  "tenant_id" uuid,
  "campaign_id" text NOT NULL,
  "channel" text NOT NULL,
  "modality" text,
  "country_code" text,
  "city" text,
  "academy_fingerprint" text NOT NULL,
  "academy_id" uuid,
  "attempt_number" integer NOT NULL DEFAULT 1,
  "template_id" text,
  "idempotency_key" text NOT NULL,
  -- Timestamps de eventos (todos opcionales; se rellenan al ocurrir)
  "sent_at" timestamptz,
  "reply_at" timestamptz,
  "reply_kind" text,
  "consent_at" timestamptz,
  "consent_text_version" text,
  "demo_session_id" uuid,
  "source" text NOT NULL DEFAULT 'agent',
  "created_by_agent_id" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,

  -- Intento positivo dentro de la misma campana + academia + canal
  CONSTRAINT "marketing_outreach_attempt_number_check"
    CHECK ("attempt_number" >= 1 AND "attempt_number" <= 10),
  -- Canal valido y acotado a los instrumentos aprobados en ZAL-576
  CONSTRAINT "marketing_outreach_channel_check"
    CHECK ("channel" IN ('instagram_dm','whatsapp','email','phone','other')),
  -- Modalidad acotada a las que el producto soporta en v1
  CONSTRAINT "marketing_outreach_modality_check"
    CHECK ("modality" IS NULL OR "modality" IN ('gymnastics_artistic','gymnastics_rythmics')),
  -- country_code ISO-3166-1 alpha-2 cuando se rellena
  CONSTRAINT "marketing_outreach_country_code_check"
    CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$'),
  -- reply_kind acotado a respuestas operativas
  CONSTRAINT "marketing_outreach_reply_kind_check"
    CHECK ("reply_kind" IS NULL OR "reply_kind" IN ('interested','not_interested','unsubscribe','out_of_office','other')),
  -- versionado semver-ish corto: vN-YYYY-MM-DD; formato acordado en ZAL-580
  CONSTRAINT "marketing_outreach_consent_text_version_check"
    CHECK ("consent_text_version" IS NULL OR "consent_text_version" ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  -- coherencia temporal: sent_at <= reply_at <= consent_at
  CONSTRAINT "marketing_outreach_timeline_check"
    CHECK (
      ("sent_at" IS NULL OR "reply_at" IS NULL OR "sent_at" <= "reply_at")
      AND ("reply_at" IS NULL OR "consent_at" IS NULL OR "reply_at" <= "consent_at")
    ),
  -- si hubo consentimiento debe quedar versionada la copia usada
  CONSTRAINT "marketing_outreach_consent_implies_version_check"
    CHECK ("consent_at" IS NULL OR ("consent_text_version" IS NOT NULL AND length("consent_text_version") > 0)),
  -- si hubo demo, debe referenciar al evento concreto
  CONSTRAINT "marketing_outreach_consent_implies_demo_session_check"
    CHECK ("consent_at" IS NULL OR "demo_session_id" IS NOT NULL),
  -- source acotado a productores esperados
  CONSTRAINT "marketing_outreach_source_check"
    CHECK ("source" IN ('agent','manual','import','test'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketing_outreach_idempotency_unique"
  ON "marketing_outreach" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "marketing_outreach_campaign_sent_idx"
  ON "marketing_outreach" ("campaign_id", "sent_at");
CREATE INDEX IF NOT EXISTS "marketing_outreach_tenant_sent_idx"
  ON "marketing_outreach" ("tenant_id", "sent_at");
CREATE INDEX IF NOT EXISTS "marketing_outreach_academy_sent_idx"
  ON "marketing_outreach" ("academy_fingerprint", "sent_at");
CREATE INDEX IF NOT EXISTS "marketing_outreach_reply_idx"
  ON "marketing_outreach" ("reply_at") WHERE "reply_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "marketing_outreach_consent_idx"
  ON "marketing_outreach" ("consent_at") WHERE "consent_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "marketing_outreach_demo_idx"
  ON "marketing_outreach" ("demo_session_id") WHERE "demo_session_id" IS NOT NULL;

DROP TRIGGER IF EXISTS "marketing_outreach_set_updated_at" ON "marketing_outreach";
CREATE TRIGGER "marketing_outreach_set_updated_at"
  BEFORE UPDATE ON "marketing_outreach"
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Defensa-en-profundidad: la app conecta con BYPASSRLS; las politicas solo
-- protegen el camino cliente anonimo/autenticado. Deny-by-default: solo Super
-- Admin (vía `is_super_admin()`) puede leer o escribir; cualquier otro rol ve
-- un conjunto vacio. La API server-side es el unico gate real.
ALTER TABLE "marketing_outreach" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketing_outreach_super_admin_all" ON "marketing_outreach";
CREATE POLICY "marketing_outreach_super_admin_all" ON "marketing_outreach"
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

ALTER TABLE "marketing_outreach"
  ADD CONSTRAINT "marketing_outreach_academy_id_academies_id_fk"
  FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE SET NULL;
