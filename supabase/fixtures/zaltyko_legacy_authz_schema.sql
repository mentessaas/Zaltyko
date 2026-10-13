-- Synthetic legacy schema for proving that greenfield migrations stay isolated.
CREATE SCHEMA zaltyko_private;
COMMENT ON SCHEMA zaltyko_private IS 'legacy auth helpers - must remain unchanged';
GRANT USAGE ON SCHEMA zaltyko_private TO anon, authenticated, service_role;

CREATE FUNCTION zaltyko_private.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$ SELECT '10000000-0000-4000-8000-000000000099'::uuid $$;
GRANT EXECUTE ON FUNCTION zaltyko_private.current_tenant_id()
  TO anon, authenticated, service_role;
