-- Prevent duplicate occurrences for the same class and calendar date.
CREATE UNIQUE INDEX IF NOT EXISTS class_sessions_class_date_unique
  ON public.class_sessions (class_id, session_date);
