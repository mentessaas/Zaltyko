-- Disposable synthetic two-academy RLS replay check.
-- Runs only against the empty local Supabase database in GitHub Actions.
-- Every row is inside a transaction that is rolled back at the end.
BEGIN;

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

