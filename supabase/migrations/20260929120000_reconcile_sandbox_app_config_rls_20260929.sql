-- Keep the E2E sandbox app_config access contract aligned with production.
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_config_authenticated_read ON public.app_config;

CREATE POLICY app_config_authenticated_read
  ON public.app_config
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON TABLE public.app_config TO authenticated;
