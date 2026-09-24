CREATE UNIQUE INDEX IF NOT EXISTS class_waiting_list_class_athlete_unique
  ON public.class_waiting_list (tenant_id, class_id, athlete_id);
