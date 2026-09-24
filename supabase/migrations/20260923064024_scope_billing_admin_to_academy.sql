-- LOCAL PROPOSAL: not applied remotely. Requires explicit authorization.
-- Preserves linked-family reads; replaces the global admin billing bypass.
-- Scope billing rows to academy managers, linked guardians, and the athlete self.
-- This tightens Data API/Realtimes reads for minors' charges and receipts inside a tenant.

CREATE OR REPLACE FUNCTION public.can_access_billing_athlete(
  target_athlete_id uuid,
  target_academy_id uuid,
  target_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    zaltyko_private.is_super_admin()
    OR (
      zaltyko_private.is_academy_manager(target_academy_id)
      AND zaltyko_private.row_in_current_tenant(target_tenant_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.athletes a
      WHERE a.id = target_athlete_id
        AND a.academy_id = target_academy_id
        AND a.tenant_id = target_tenant_id
        AND a.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.guardians g
        ON g.profile_id = p.id
       AND g.tenant_id = target_tenant_id
      JOIN public.guardian_athletes ga
        ON ga.guardian_id = g.id
       AND ga.tenant_id = target_tenant_id
      JOIN public.athletes a
        ON a.id = ga.athlete_id
       AND a.academy_id = target_academy_id
       AND a.tenant_id = target_tenant_id
      WHERE p.user_id = auth.uid()
        AND ga.athlete_id = target_athlete_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.family_contacts fc
      JOIN public.athletes a
        ON a.id = fc.athlete_id
       AND a.academy_id = target_academy_id
       AND a.tenant_id = target_tenant_id
      WHERE fc.tenant_id = target_tenant_id
        AND fc.athlete_id = target_athlete_id
        AND lower(fc.email) = lower(auth.jwt() ->> 'email')
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.can_access_billing_athlete(uuid, uuid, uuid) IS
  'RLS helper for billing rows: active super-admin, academy-scoped manager, athlete self, linked guardian or legacy family contact.';

REVOKE ALL ON FUNCTION public.can_access_billing_athlete(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_billing_athlete(uuid, uuid, uuid) TO authenticated, service_role;


-- A global admin profile does not authorize another academy's billing.
DROP POLICY IF EXISTS "charges_modify" ON public.charges;
CREATE POLICY "charges_modify" ON public.charges FOR ALL TO authenticated
USING (
  zaltyko_private.is_academy_manager(academy_id)
  AND zaltyko_private.row_in_current_tenant(tenant_id)
)
WITH CHECK (
  zaltyko_private.is_academy_manager(academy_id)
  AND zaltyko_private.row_in_current_tenant(tenant_id)
);
