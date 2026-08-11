-- commercial_interviews: consent + demo evidence (ZAL-583 / ZAL-582 / ZAL-580)
--
-- Cierra el hueco de instrumentacion identificado por Data en ZAL-579/ZAL-580:
-- hasta ahora `consented` y `demos_held` no eran reconstruibles con SQL puro
-- desde `commercial_interviews` (solo desde `marketing_outreach`). Con estas
-- columnas los dos denominadores quedan definidos como queries reproducibles:
--
--   consented  = COUNT(*) FILTER (
--                  WHERE consent_at IS NOT NULL
--                    AND consent_text_version IS NOT NULL)
--   demos_held = COUNT(*) FILTER (
--                  WHERE status = 'completed'
--                    AND demo_ended_at IS NOT NULL
--                    AND attendees_count >= 1)
--
-- Migracion aditiva: no toca columnas existentes, no migra datos y NO modifica
-- `commercial_interviews_completed_evidence_check` (se mantiene tal cual).
--
-- Defensa-en-profundidad: la app conecta como `postgres` con BYPASSRLS, asi que
-- el aislamiento real lo da el wrapper de auth del endpoint (`withSuperAdmin` en
-- `/api/super-admin/growth/interviews`). La RLS existente de la tabla no cambia.
--
-- AVISO PARA PRODUCCION (no aplicar aqui): el CHECK
-- `commercial_interviews_demo_evidence_check` exige `demo_ended_at` en toda fila
-- `status='completed'`. Antes de aplicarlo fuera de sandbox hay que backfillear
-- las filas completadas historicas o el ALTER fallara. Platform & Security debe
-- validar ese backfill; este agente solo aplica en sandbox/local.

ALTER TABLE "commercial_interviews"
  ADD COLUMN IF NOT EXISTS "consent_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "consent_text_version" text,
  ADD COLUMN IF NOT EXISTS "demo_started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "demo_ended_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "attendees_count" integer;

-- Versionado de la copia de consentimiento: vN-YYYY-MM-DD (mismo formato que
-- `marketing_outreach_consent_text_version_check`, acordado en ZAL-580).
ALTER TABLE "commercial_interviews"
  DROP CONSTRAINT IF EXISTS "commercial_interviews_consent_text_version_check";
ALTER TABLE "commercial_interviews"
  ADD CONSTRAINT "commercial_interviews_consent_text_version_check"
  CHECK ("consent_text_version" IS NULL
         OR "consent_text_version" ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$');

-- Si hubo consentimiento debe quedar versionada la copia usada; sin las dos
-- columnas la fila no cuenta como `consented`.
ALTER TABLE "commercial_interviews"
  DROP CONSTRAINT IF EXISTS "commercial_interviews_consent_implies_version_check";
ALTER TABLE "commercial_interviews"
  ADD CONSTRAINT "commercial_interviews_consent_implies_version_check"
  CHECK ("consent_at" IS NULL OR "consent_text_version" IS NOT NULL);

-- Asistentes reales a la demo: 1..50 (un rango operativo, no un dato agregado).
ALTER TABLE "commercial_interviews"
  DROP CONSTRAINT IF EXISTS "commercial_interviews_attendees_count_check";
ALTER TABLE "commercial_interviews"
  ADD CONSTRAINT "commercial_interviews_attendees_count_check"
  CHECK ("attendees_count" IS NULL OR "attendees_count" BETWEEN 1 AND 50);

-- Coherencia temporal de la demo: no puede terminar antes de empezar.
ALTER TABLE "commercial_interviews"
  DROP CONSTRAINT IF EXISTS "commercial_interviews_demo_timeline_check";
ALTER TABLE "commercial_interviews"
  ADD CONSTRAINT "commercial_interviews_demo_timeline_check"
  CHECK ("demo_started_at" IS NULL
         OR "demo_ended_at" IS NULL
         OR "demo_started_at" <= "demo_ended_at");

-- Evidencia de demo: una entrevista `completed` tiene un cierre de demo real.
ALTER TABLE "commercial_interviews"
  DROP CONSTRAINT IF EXISTS "commercial_interviews_demo_evidence_check";
ALTER TABLE "commercial_interviews"
  ADD CONSTRAINT "commercial_interviews_demo_evidence_check"
  CHECK ("status" <> 'completed' OR "demo_ended_at" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "commercial_interviews_consent_idx"
  ON "commercial_interviews" ("consent_at") WHERE "consent_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "commercial_interviews_demo_ended_idx"
  ON "commercial_interviews" ("demo_ended_at") WHERE "demo_ended_at" IS NOT NULL;

COMMENT ON COLUMN "commercial_interviews"."consent_at" IS
  'Momento del consentimiento explicito del contacto. Denominador `consented` junto a consent_text_version.';
COMMENT ON COLUMN "commercial_interviews"."consent_text_version" IS
  'Version de la copia de consentimiento mostrada (vN-YYYY-MM-DD).';
COMMENT ON COLUMN "commercial_interviews"."demo_started_at" IS
  'Inicio real de la demo.';
COMMENT ON COLUMN "commercial_interviews"."demo_ended_at" IS
  'Cierre real de la demo. Requisito para status=completed y para el denominador `demos_held`.';
COMMENT ON COLUMN "commercial_interviews"."attendees_count" IS
  'Personas de la academia presentes en la demo (1..50). >=1 es requisito de `demos_held`.';
