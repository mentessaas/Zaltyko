-- Evita postulaciones duplicadas por carrera entre dos pestañas o reintentos.
CREATE UNIQUE INDEX IF NOT EXISTS empleo_application_listing_user_unique
  ON public.empleo_applications (listing_id, user_id);
