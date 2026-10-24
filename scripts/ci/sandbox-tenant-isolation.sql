-- Disposable synthetic two-academy RLS replay check.
-- Runs only against the empty local Supabase database in GitHub Actions.
-- Every row is inside a transaction that is rolled back at the end.
BEGIN;

-- Do not let a tenant-scoped table disappear from the replay or silently lose
-- its fail-closed posture. has_table_privilege checks effective ACLs, including
-- PUBLIC grants and inherited role grants, before any client can reach RLS.
DO $assert_server_only_tenant_relations$
DECLARE
  v_relation_name text;
  v_relation_oid oid;
  v_role name;
  v_privilege text;
  v_column_name name;
  v_column_number smallint;
  v_policy_count integer;
  v_tenant_relations constant text[] := ARRAY[
    'public.actor_pages',
    'public.actor_consents',
    'public.athlete_skills',
    'public.products',
    'public.sales',
    'zaltyko.audit_log',
    'zaltyko.family_collection_preferences',
    'zaltyko.family_payment_authorizations',
    'zaltyko.health_score_metric_contributions',
    'zaltyko.insight_notifications',
    'zaltyko.insight_run_observations',
    'zaltyko.insight_status_history',
    'zaltyko.metric_event_consumptions',
    'zaltyko.metric_invalidations',
    'zaltyko.organization_bootstrap_commands',
    'zaltyko.organization_entitlement_changes',
    'zaltyko.organization_entitlements',
    'zaltyko.organization_payment_provider_accounts',
    'zaltyko.organization_saas_checkout_operations',
    'zaltyko.organization_saas_customers',
    'zaltyko.organization_saas_subscriptions',
    'zaltyko.organization_saas_trials',
    'zaltyko.organization_saas_webhook_events',
    'zaltyko.organization_saas_webhook_payload_conflicts',
    'zaltyko.organization_saas_webhook_reconciliation_decisions',
    'zaltyko.organization_saas_webhook_reconciliation_results',
    'zaltyko.outbox_events',
    'zaltyko.payment_provider_events'
  ];
  v_client_roles constant name[] := ARRAY['anon'::name, 'authenticated'::name];
  v_table_privileges constant text[] := ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
  ];
  v_column_privileges constant text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'];
BEGIN
  FOREACH v_relation_name IN ARRAY v_tenant_relations LOOP
    v_relation_oid := to_regclass(v_relation_name);
    IF v_relation_oid IS NULL THEN
      RAISE EXCEPTION 'RLS guard failed: required protected relation % is missing', v_relation_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE c.oid = v_relation_oid
        AND c.relkind IN ('r', 'p')
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS guard failed: required protected relation % is not RLS enabled and forced', v_relation_name;
    END IF;

    SELECT count(*) INTO v_policy_count
    FROM pg_policy p
    WHERE p.polrelid = v_relation_oid
      AND p.polname = 'deny_all_non_bypass_access'
      AND p.polcmd = '*'
      AND NOT p.polpermissive
      AND p.polroles = ARRAY[0::oid]
      AND pg_get_expr(p.polqual, p.polrelid) = 'false'
      AND pg_get_expr(p.polwithcheck, p.polrelid) = 'false';
    IF v_policy_count <> 1 THEN
      RAISE EXCEPTION 'RLS guard failed: required restrictive PUBLIC deny policy is missing or malformed on %', v_relation_name;
    END IF;

    FOREACH v_role IN ARRAY v_client_roles LOOP
      FOREACH v_privilege IN ARRAY v_table_privileges LOOP
        IF has_table_privilege(v_role, v_relation_oid, v_privilege) THEN
          RAISE EXCEPTION 'RLS guard failed: role % has effective % privilege on %',
            v_role, v_privilege, v_relation_name;
        END IF;
      END LOOP;

      FOR v_column_name, v_column_number IN
        SELECT a.attname, a.attnum
        FROM pg_attribute a
        WHERE a.attrelid = v_relation_oid
          AND a.attnum > 0
          AND NOT a.attisdropped
      LOOP
        FOREACH v_privilege IN ARRAY v_column_privileges LOOP
          IF has_column_privilege(v_role, v_relation_oid, v_column_number, v_privilege) THEN
            RAISE EXCEPTION 'RLS guard failed: role % has effective % privilege on %.%',
              v_role, v_privilege, v_relation_name, v_column_name;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END
$assert_server_only_tenant_relations$;

INSERT INTO auth.users (
  id,
  email
)
VALUES
  ('90000000-0000-4000-8000-000000000011','ci-owner-a@example.invalid'),
  ('90000000-0000-4000-8000-000000000022','ci-owner-b@example.invalid');

INSERT INTO public.profiles (id, user_id, tenant_id, name, role)
VALUES
  ('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000101','CI Owner A','owner'),
  ('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000022','90000000-0000-4000-8000-000000000202','CI Owner B','owner');

INSERT INTO public.academies (id, tenant_id, name, owner_id, is_public)
VALUES
  ('90000000-0000-4000-8000-000000000301','90000000-0000-4000-8000-000000000101','CI Academy A','90000000-0000-4000-8000-000000000001',false),
  ('90000000-0000-4000-8000-000000000302','90000000-0000-4000-8000-000000000202','CI Academy B','90000000-0000-4000-8000-000000000002',false);

INSERT INTO public.memberships (user_id, academy_id, role)
VALUES
  ('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000301','owner'),
  ('90000000-0000-4000-8000-000000000022','90000000-0000-4000-8000-000000000302','owner');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '90000000-0000-4000-8000-000000000011';

DO $owner_a$
DECLARE
  v_visible integer;
BEGIN
  SELECT count(*) INTO v_visible
  FROM public.academies
  WHERE id IN (
    '90000000-0000-4000-8000-000000000301',
    '90000000-0000-4000-8000-000000000302'
  );
  IF v_visible <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.academies
    WHERE id='90000000-0000-4000-8000-000000000301'
  ) THEN
    RAISE EXCEPTION 'Tenant isolation failed: owner A did not see only academy A';
  END IF;
END
$owner_a$;

SET LOCAL request.jwt.claim.sub = '90000000-0000-4000-8000-000000000022';

DO $owner_b$
DECLARE
  v_visible integer;
  v_changed integer;
BEGIN
  SELECT count(*) INTO v_visible
  FROM public.academies
  WHERE id IN (
    '90000000-0000-4000-8000-000000000301',
    '90000000-0000-4000-8000-000000000302'
  );
  IF v_visible <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.academies
    WHERE id='90000000-0000-4000-8000-000000000302'
  ) THEN
    RAISE EXCEPTION 'Tenant isolation failed: owner B did not see only academy B';
  END IF;

  UPDATE public.academies SET name='CI Academy B Updated'
  WHERE id='90000000-0000-4000-8000-000000000302';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN
    RAISE EXCEPTION 'Tenant isolation failed: owner B could not update its own academy';
  END IF;

  UPDATE public.academies SET name='Unauthorized change'
  WHERE id='90000000-0000-4000-8000-000000000301';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 0 THEN
    RAISE EXCEPTION 'Tenant isolation failed: owner B updated academy A';
  END IF;
END
$owner_b$;

DO $cross_tenant_insert$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.academies (id, tenant_id, name, owner_id, is_public)
    VALUES (
      '90000000-0000-4000-8000-000000000399',
      '90000000-0000-4000-8000-000000000101',
      'Unauthorized cross-tenant academy',
      '90000000-0000-4000-8000-000000000001',
      false
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Tenant isolation failed: cross-tenant academy insert was accepted';
  END IF;
END
$cross_tenant_insert$;

RESET ROLE;

DO $no_partial_insert$
BEGIN
  IF EXISTS (SELECT 1 FROM public.academies WHERE id='90000000-0000-4000-8000-000000000399') THEN
    RAISE EXCEPTION 'Tenant isolation failed: rejected insert left a partial academy';
  END IF;
  IF (SELECT name FROM public.academies WHERE id='90000000-0000-4000-8000-000000000301') <> 'CI Academy A' THEN
    RAISE EXCEPTION 'Tenant isolation failed: rejected cross-tenant update changed academy A';
  END IF;
  IF (SELECT name FROM public.academies WHERE id='90000000-0000-4000-8000-000000000302') <> 'CI Academy B Updated' THEN
    RAISE EXCEPTION 'Tenant isolation failed: owner B update did not persist inside the transaction';
  END IF;
END
$no_partial_insert$;

ROLLBACK;
