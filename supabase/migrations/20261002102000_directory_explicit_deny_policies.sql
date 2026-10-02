-- Make the server-only boundary explicit for the Data API and Supabase linter.
-- Table privileges are already revoked; these policies keep access denied if
-- a future grant is added accidentally. service_role retains its server access.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'directory_grants',
    'directory_claims',
    'directory_revisions',
    'directory_sources',
    'directory_batches',
    'directory_import_rows',
    'directory_favorites',
    'directory_subscriptions',
    'directory_deliveries',
    'directory_audit'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t || '_client_denied',
      t
    );
  END LOOP;
END $$;
