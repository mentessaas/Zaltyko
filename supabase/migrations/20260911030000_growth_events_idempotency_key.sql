-- Repair partially provisioned environments where growth_events predates the
-- idempotency column. Safe to run repeatedly and preserves all event history.
ALTER TABLE public.growth_events
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS growth_events_idempotency_unique
  ON public.growth_events (idempotency_key);
