-- Corte controlado para el runner de migraciones SQL de Zaltyko.
-- No escribe ni modifica __drizzle_migrations. El bootstrap posterior calcula
-- hashes SHA-256 de los archivos reales y exige reconocer explícitamente el
-- historial ya aplicado antes de registrar el baseline.

CREATE TABLE IF NOT EXISTS public.zaltyko_schema_migrations (
  -- filename es la identidad: el legado tiene dos migraciones 0009_*.
  version text NOT NULL,
  filename text PRIMARY KEY,
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  execution_mode text NOT NULL CHECK (execution_mode IN ('ledger', 'baseline_verified')),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT current_user
);

ALTER TABLE public.zaltyko_schema_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.zaltyko_schema_migrations FROM anon, authenticated;
