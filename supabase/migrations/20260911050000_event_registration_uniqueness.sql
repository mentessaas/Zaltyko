-- Prevent duplicate registrations when two requests arrive concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_event_profile_uq
  ON public.event_registrations (event_id, profile_id);
