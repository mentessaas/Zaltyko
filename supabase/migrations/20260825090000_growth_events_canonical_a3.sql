-- Zaltyko A3: sobre canónico para eventos first-party y reconciliación.
-- Migración estrictamente aditiva: no reescribe ni elimina filas históricas.
-- `growth_events.event_id` es la identidad canónica; `id` sigue siendo la PK interna.

ALTER TABLE public.growth_events
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS schema_version smallint,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS evidence_scope text,
  ADD COLUMN IF NOT EXISTS alias_source text,
  ADD COLUMN IF NOT EXISTS transaction_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'growth_events_schema_version_check'
  ) THEN
    ALTER TABLE public.growth_events
      ADD CONSTRAINT growth_events_schema_version_check
      CHECK (schema_version IS NULL OR schema_version = 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'growth_events_environment_check'
  ) THEN
    ALTER TABLE public.growth_events
      ADD CONSTRAINT growth_events_environment_check
      CHECK (
        environment IS NULL
        OR environment IN ('local', 'sandbox', 'preview', 'production_authorized')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'growth_events_evidence_scope_check'
  ) THEN
    ALTER TABLE public.growth_events
      ADD CONSTRAINT growth_events_evidence_scope_check
      CHECK (evidence_scope IS NULL OR evidence_scope IN ('L', 'T', 'P', 'X', 'H'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'growth_events_transaction_id_check'
  ) THEN
    ALTER TABLE public.growth_events
      ADD CONSTRAINT growth_events_transaction_id_check
      CHECK (
        transaction_id IS NULL
        OR transaction_id ~ '^sha256:[a-f0-9]{64}$'
      );
  END IF;
END $$;

-- La identidad canónica es nullable únicamente para conservar filas pre-A3.
CREATE UNIQUE INDEX IF NOT EXISTS growth_events_event_id_unique
  ON public.growth_events (event_id);

-- El índice único existente respalda retries y concurrencia de la clave A3.
-- IF NOT EXISTS mantiene la migración segura en instalaciones parciales.
CREATE UNIQUE INDEX IF NOT EXISTS growth_events_idempotency_unique
  ON public.growth_events (idempotency_key);
