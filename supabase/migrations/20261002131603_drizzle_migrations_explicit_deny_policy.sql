-- Keep the Drizzle migration ledger explicitly invisible to Supabase client
-- roles, even if a future grant or permissive policy is introduced.
CREATE POLICY __drizzle_migrations_client_denied
  ON public.__drizzle_migrations
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
