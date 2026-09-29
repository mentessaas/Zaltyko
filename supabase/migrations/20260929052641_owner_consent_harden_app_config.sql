-- ZAL-158 follow-up: keep policy configuration server-only and harden helper
-- function search paths before this migration is promoted beyond sandbox.
BEGIN;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_config FROM anon, authenticated;

ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.owner_consent_audit_append_only() SET search_path = public, pg_temp;
ALTER FUNCTION public.current_policy_version() SET search_path = public, pg_temp;

COMMIT;
