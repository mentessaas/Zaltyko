-- Trazabilidad y rollback seguro de importaciones CSV de gimnastas.
-- Esta migración es idempotente y todavía requiere aplicación explícita en
-- cada entorno; el código no debe asumir que la tabla existe hasta entonces.

CREATE TABLE IF NOT EXISTS public.athlete_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  academy_id uuid REFERENCES public.academies(id) ON DELETE CASCADE,
  initiated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  file_hash text NOT NULL CHECK (length(file_hash) = 64),
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  created_count integer NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'rolled_back')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failed_at timestamptz,
  rolled_back_at timestamptz
);

CREATE INDEX IF NOT EXISTS athlete_import_batches_tenant_created_idx
  ON public.athlete_import_batches (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS athlete_import_batches_academy_created_idx
  ON public.athlete_import_batches (academy_id, created_at);
CREATE INDEX IF NOT EXISTS athlete_import_batches_status_idx
  ON public.athlete_import_batches (status);
CREATE INDEX IF NOT EXISTS athlete_import_batches_file_hash_idx
  ON public.athlete_import_batches (file_hash);

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS import_batch_id uuid
  REFERENCES public.athlete_import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS athletes_import_batch_idx
  ON public.athletes (import_batch_id);

ALTER TABLE public.athlete_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "athlete_import_batches_select" ON public.athlete_import_batches;
CREATE POLICY "athlete_import_batches_select" ON public.athlete_import_batches
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "athlete_import_batches_modify" ON public.athlete_import_batches;
CREATE POLICY "athlete_import_batches_modify" ON public.athlete_import_batches
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );
