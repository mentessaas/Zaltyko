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
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.academy_id = target_academy_id
        AND m.role = 'owner'
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
  'RLS helper for billing rows: admin/super-admin, academy owner, athlete self, linked guardian or legacy family contact.';

REVOKE ALL ON FUNCTION public.can_access_billing_athlete(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_billing_athlete(uuid, uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.charges TO authenticated;
GRANT SELECT ON TABLE public.receipts TO authenticated;

DROP POLICY IF EXISTS "charges_select" ON public.charges;
CREATE POLICY "charges_select" ON public.charges
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_billing_athlete(athlete_id, academy_id, tenant_id)
  );

DROP POLICY IF EXISTS "charges_modify" ON public.charges;
CREATE POLICY "charges_modify" ON public.charges
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.academy_id = charges.academy_id
        AND m.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.academy_id = charges.academy_id
        AND m.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "receipts_select" ON public.receipts;
CREATE POLICY "receipts_select" ON public.receipts
  FOR SELECT
  TO authenticated
  USING (
    athlete_id IS NOT NULL
    AND public.can_access_billing_athlete(athlete_id, academy_id, tenant_id)
  );

DROP POLICY IF EXISTS "receipts_insert" ON public.receipts;
CREATE POLICY "receipts_insert" ON public.receipts
  FOR INSERT
  TO service_role
  WITH CHECK (true);
