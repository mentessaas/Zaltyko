-- 20260622140000_sync_athlete_assessments_schema.sql
-- Sincroniza la tabla athlete_assessments con el schema de Drizzle en src/db/schema/athlete-assessments.ts.
-- Detectado el 2026-06-22 via E2E: GET /app/[academyId]/athletes/[athleteId]/assessments devolvia 500
-- "column athlete_assessments.assessment_type does not exist".
--
-- Idempotente: cada paso verifica la existencia antes de actuar.

-- 1. Crear el enum si no existe (los valores deben coincidir con el schema TS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assessment_type') THEN
    CREATE TYPE assessment_type AS ENUM (
      'technical',
      'artistic',
      'execution',
      'coach_feedback',
      'competition',
      'practice'
    );
  END IF;
END
$$;

-- 2. Agregar columnas faltantes. IF NOT EXISTS requiere PG 9.6+ (Supabase usa 15+).
ALTER TABLE athlete_assessments
  ADD COLUMN IF NOT EXISTS assessment_type assessment_type NOT NULL DEFAULT 'technical';

ALTER TABLE athlete_assessments
  ADD COLUMN IF NOT EXISTS total_score numeric(6,2);

ALTER TABLE athlete_assessments
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE athlete_assessments
  ADD COLUMN IF NOT EXISTS rubric_id uuid;

-- 3. Indices.
CREATE INDEX IF NOT EXISTS athlete_assessments_type_idx
  ON athlete_assessments (assessment_type);

CREATE INDEX IF NOT EXISTS athlete_assessments_tenant_idx
  ON athlete_assessments (tenant_id);
