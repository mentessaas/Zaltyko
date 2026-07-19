-- Fase 3 · Flujo entrenador "clase de hoy"
--
-- Vincula de forma opcional una evaluación técnica con la sesión desde la
-- que fue registrada. Es una ampliación aditiva: no reescribe registros
-- históricos y conserva evaluaciones si una sesión se elimina.

BEGIN;

ALTER TABLE public.athlete_assessments
  ADD COLUMN IF NOT EXISTS session_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'athlete_assessments_session_id_class_sessions_id_fk'
      AND conrelid = 'public.athlete_assessments'::regclass
  ) THEN
    ALTER TABLE public.athlete_assessments
      ADD CONSTRAINT athlete_assessments_session_id_class_sessions_id_fk
      FOREIGN KEY (session_id)
      REFERENCES public.class_sessions(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS athlete_assessments_session_idx
  ON public.athlete_assessments (session_id);

COMMENT ON COLUMN public.athlete_assessments.session_id IS
  'Sesión de clase que originó la evaluación; opcional para registros históricos o evaluaciones independientes.';

COMMIT;
