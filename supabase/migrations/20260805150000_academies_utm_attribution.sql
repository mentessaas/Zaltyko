-- =============================================================================
-- ZAL-157 [GTM-DEP.1] UTM capture en signup (first-touch, sessionStorage)
-- Issue:    ZAL-157
-- Parent:   ZAL-156 [GTM-DEP] Track de instrumentación de tracking + atribución
-- Spec:     ZAL-157 §"Stack propuesto" — columnas utm_* en `academies`
-- Owner:    Web Developer (agent 5bcea506)
-- Date:     2026-08-05
-- Status:   VERSIONED — NO APLICADA. Aplica con `pnpm db:migrate:reviewed`
--           sobre sandbox antes de producción.
--
-- Atribución first-touch: el signup persiste el primer set de UTMs observado
-- en la sesión del visitante. Si no llega UTM al signup, se registra
-- `direct/none/none/none/none` para mantener trazabilidad (per spec §Notas).
-- Validación se hace en la capa de aplicación (`src/lib/growth/utm.ts`) —
-- esta migración solo agrega columnas nullables + timestamps + índices.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Columnas UTM en `academies`
-- -----------------------------------------------------------------------------
ALTER TABLE "academies"
  ADD COLUMN IF NOT EXISTS "utm_source" text,
  ADD COLUMN IF NOT EXISTS "utm_medium" text,
  ADD COLUMN IF NOT EXISTS "utm_campaign" text,
  ADD COLUMN IF NOT EXISTS "utm_term" text,
  ADD COLUMN IF NOT EXISTS "utm_content" text,
  ADD COLUMN IF NOT EXISTS "utm_captured_at" timestamp with time zone;

COMMENT ON COLUMN "academies"."utm_source" IS
  'ZAL-157: utm_source del primer touch (lowercase, snake_case). Fallback "direct" si no hay atribución.';
COMMENT ON COLUMN "academies"."utm_medium" IS
  'ZAL-157: utm_medium del primer touch (lowercase, snake_case). Fallback "none" si no hay atribución.';
COMMENT ON COLUMN "academies"."utm_campaign" IS
  'ZAL-157: utm_campaign del primer touch (lowercase, snake_case). Fallback "none" si no hay atribución.';
COMMENT ON COLUMN "academies"."utm_term" IS
  'ZAL-157: utm_term del primer touch (puede ser null si la campaña no lo usa).';
COMMENT ON COLUMN "academies"."utm_content" IS
  'ZAL-157: utm_content del primer touch (puede ser null si la campaña no lo usa).';
COMMENT ON COLUMN "academies"."utm_captured_at" IS
  'ZAL-157: momento en que se persistieron los UTMs al crear la academia.';

-- -----------------------------------------------------------------------------
-- Índices para queries de atribución por canal (ZAL-156.3 downstream)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "academies_utm_source_idx"
  ON "academies" ("utm_source");
CREATE INDEX IF NOT EXISTS "academies_utm_captured_at_idx"
  ON "academies" ("utm_captured_at");

COMMIT;