-- Synthetic rows only; included inside the CI rehearsal transaction.
-- Auth helpers here are platform stand-ins, not an authenticated application journey.
DO $ci_fixture_guard$
BEGIN
  IF current_database() <> 'zaltyko_canonical_rehearsal_ci'
     OR current_setting('app.canonical_domain_rehearsal', true) IS DISTINCT FROM 'ci-explicit' THEN
    RAISE EXCEPTION 'Refusing canonical tenant fixture outside disposable rehearsal';
  END IF;
END
$ci_fixture_guard$;

INSERT INTO auth.users(id) VALUES
 ('70000000-0000-4000-8000-000000000001'),
 ('70000000-0000-4000-8000-000000000002');
INSERT INTO zaltyko.organizations(id, name) VALUES
 ('70000000-0000-4000-8000-000000000101', 'CI canonical A'),
 ('70000000-0000-4000-8000-000000000102', 'CI canonical B');
INSERT INTO zaltyko.locations(id, organization_id, code, name) VALUES
 ('70000000-0000-4000-8000-000000000201', '70000000-0000-4000-8000-000000000101', 'a1', 'CI A selected'),
 ('70000000-0000-4000-8000-000000000202', '70000000-0000-4000-8000-000000000101', 'a2', 'CI A excluded'),
 ('70000000-0000-4000-8000-000000000203', '70000000-0000-4000-8000-000000000102', 'b1', 'CI B');
INSERT INTO zaltyko.organization_members(id, organization_id, user_id, role, status, location_scope_mode) VALUES
 ('70000000-0000-4000-8000-000000000301', '70000000-0000-4000-8000-000000000101', '70000000-0000-4000-8000-000000000001', 'owner', 'active', 'selected'),
 ('70000000-0000-4000-8000-000000000302', '70000000-0000-4000-8000-000000000102', '70000000-0000-4000-8000-000000000002', 'owner', 'active', 'all');
INSERT INTO zaltyko.member_location_scopes(organization_id, member_id, location_id) VALUES
 ('70000000-0000-4000-8000-000000000101', '70000000-0000-4000-8000-000000000301', '70000000-0000-4000-8000-000000000201');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000001"}', true);
DO $assert_tenant_a$
BEGIN
  IF (SELECT count(*) FROM zaltyko.organizations) <> 1
     OR NOT EXISTS (SELECT 1 FROM zaltyko.organizations WHERE name='CI canonical A')
     OR EXISTS (SELECT 1 FROM zaltyko.organizations WHERE id='70000000-0000-4000-8000-000000000102') THEN
    RAISE EXCEPTION 'Organization A positive/cross-tenant isolation failed';
  END IF;
  IF (SELECT count(*) FROM zaltyko.locations) <> 1
     OR NOT EXISTS (SELECT 1 FROM zaltyko.locations WHERE code='a1')
     OR EXISTS (SELECT 1 FROM zaltyko.locations WHERE code IN ('a2','b1')) THEN
    RAISE EXCEPTION 'Location A positive/cross-location isolation failed';
  END IF;
  IF (SELECT count(*) FROM zaltyko.organization_members) <> 1 THEN
    RAISE EXCEPTION 'Membership self policy failed';
  END IF;
  BEGIN
    INSERT INTO zaltyko.organizations(id,name)
      VALUES ('70000000-0000-4000-8000-000000000199','Forbidden partial row');
    RAISE EXCEPTION 'Client organization insert unexpectedly permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE zaltyko.organizations SET name='Forbidden mutation'
      WHERE id='70000000-0000-4000-8000-000000000102';
    RAISE EXCEPTION 'Client organization update unexpectedly permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$assert_tenant_a$;

SELECT set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000002"}', true);
DO $assert_tenant_b$
BEGIN
  IF (SELECT count(*) FROM zaltyko.organizations) <> 1
     OR NOT EXISTS (SELECT 1 FROM zaltyko.organizations WHERE name='CI canonical B')
     OR EXISTS (SELECT 1 FROM zaltyko.organizations WHERE id='70000000-0000-4000-8000-000000000101') THEN
    RAISE EXCEPTION 'Organization B positive/cross-tenant isolation failed';
  END IF;
  IF (SELECT count(*) FROM zaltyko.locations) <> 1
     OR NOT EXISTS (SELECT 1 FROM zaltyko.locations WHERE code='b1') THEN
    RAISE EXCEPTION 'Location B positive/cross-tenant isolation failed';
  END IF;
END
$assert_tenant_b$;

SET LOCAL ROLE anon;
DO $assert_anon_denied$
BEGIN
  BEGIN
    PERFORM count(*) FROM zaltyko.organizations;
    RAISE EXCEPTION 'Anonymous canonical read unexpectedly permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$assert_anon_denied$;

RESET ROLE;
DO $assert_no_partial_rows$
BEGIN
  IF (SELECT count(*) FROM zaltyko.organizations) <> 2
     OR (SELECT count(*) FROM zaltyko.organization_entitlements) <> 2
     OR EXISTS (SELECT 1 FROM zaltyko.organizations WHERE name LIKE 'Forbidden%') THEN
    RAISE EXCEPTION 'Denied client writes left partial rows or mutated canonical data';
  END IF;
END
$assert_no_partial_rows$;
