-- Keep server-only operational tables closed to Supabase client roles.
-- RESTRICTIVE policies continue to deny access if a future permissive policy
-- is accidentally added; service_role and the trusted DB connection remain usable.
REVOKE ALL ON TABLE public.lead_interactions FROM PUBLIC, anon, authenticated;
-- Keep the trusted Supabase server role able to read/write this private table.
GRANT ALL ON TABLE public.lead_interactions TO service_role;

CREATE POLICY lead_interactions_client_denied
  ON public.lead_interactions
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY zaltyko_schema_migrations_client_denied
  ON public.zaltyko_schema_migrations
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- The application migration runner uses the trusted server role for its ledger.
GRANT ALL ON TABLE public.zaltyko_schema_migrations TO service_role;
