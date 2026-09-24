-- Scope communication history to its academy.
-- Backfill is defensive: malformed or unknown metadata is left nullable and
-- remains readable through the legacy meta fallback in the application.

ALTER TABLE public.message_history
  ADD COLUMN IF NOT EXISTS academy_id uuid REFERENCES public.academies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS message_history_academy_idx
  ON public.message_history (academy_id, created_at DESC);

UPDATE public.message_history mh
SET academy_id = (mh.meta ->> 'academyId')::uuid
WHERE mh.academy_id IS NULL
  AND mh.meta ? 'academyId'
  AND (mh.meta ->> 'academyId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.academies a
    WHERE a.id = (mh.meta ->> 'academyId')::uuid
      AND a.tenant_id = mh.tenant_id
  );
