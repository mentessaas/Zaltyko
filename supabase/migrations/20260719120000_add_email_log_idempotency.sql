ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS email_logs_idempotency_unique
  ON public.email_logs (idempotency_key);
