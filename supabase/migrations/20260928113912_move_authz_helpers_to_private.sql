-- Move SECURITY DEFINER tenant helpers out of the Data API's public schema.
-- RLS policies retain their function OIDs when ALTER FUNCTION changes schema.
-- Keep the helpers executable for policy evaluation, but expose only an
-- invoker wrapper for is_super_admin() (which returns the caller's own flag).

DO $$
BEGIN
  IF to_regnamespace('zaltyko_private') IS NULL THEN
    RAISE EXCEPTION 'Required schema zaltyko_private is missing';
  END IF;
  IF to_regprocedure('public.academy_in_current_tenant(uuid)') IS NULL
     OR to_regprocedure('public.get_current_tenant()') IS NULL
     OR to_regprocedure('public.is_admin()') IS NULL
     OR to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'Expected public authorization helper is missing';
  END IF;
  IF to_regprocedure('zaltyko_private.is_super_admin()') IS NULL
     OR to_regprocedure('zaltyko_private.current_tenant_id()') IS NULL THEN
    RAISE EXCEPTION 'Required private authorization primitive is missing';
  END IF;
END $$;

ALTER FUNCTION public.academy_in_current_tenant(uuid) SET SCHEMA zaltyko_private;
ALTER FUNCTION public.get_current_tenant() SET SCHEMA zaltyko_private;
ALTER FUNCTION public.is_admin() SET SCHEMA zaltyko_private;

ALTER FUNCTION zaltyko_private.academy_in_current_tenant(uuid) SET search_path = '';
ALTER FUNCTION zaltyko_private.get_current_tenant() SET search_path = '';
ALTER FUNCTION zaltyko_private.is_admin() SET search_path = '';

-- The public super-admin predicate remains for existing RLS expressions, but
-- runs as the caller and delegates only the caller's own check to the private
-- SECURITY DEFINER primitive.
ALTER FUNCTION public.is_super_admin() SECURITY INVOKER;
ALTER FUNCTION public.is_super_admin() SET search_path = '';

GRANT USAGE ON SCHEMA zaltyko_private TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION zaltyko_private.academy_in_current_tenant(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION zaltyko_private.get_current_tenant()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION zaltyko_private.is_admin()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION zaltyko_private.academy_in_current_tenant(uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION zaltyko_private.get_current_tenant()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION zaltyko_private.is_admin()
  TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION zaltyko_private.is_super_admin()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION zaltyko_private.is_super_admin()
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_super_admin()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin()
  TO anon, authenticated, service_role;
