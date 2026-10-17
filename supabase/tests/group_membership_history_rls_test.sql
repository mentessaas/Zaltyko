BEGIN;
SELECT plan(25);

INSERT INTO auth.users (id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000001');

INSERT INTO zaltyko.organizations (id, name, status) VALUES
  ('10000000-0000-4000-8000-000000000010', 'Academia sintética A', 'active'),
  ('20000000-0000-4000-8000-000000000010', 'Academia sintética B', 'active');

INSERT INTO zaltyko.locations (id, organization_id, code, name) VALUES
  ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000010', 'centro', 'Centro'),
  ('10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000010', 'norte', 'Norte'),
  ('20000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000010', 'sur', 'Sur');

INSERT INTO zaltyko.organization_members (
  id, organization_id, user_id, role, status, location_scope_mode
) VALUES
  ('10000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 'owner', 'active', 'all'),
  ('10000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', 'manager', 'active', 'selected'),
  ('20000000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', 'owner', 'active', 'all');

INSERT INTO zaltyko.member_location_scopes (organization_id, member_id, location_id)
VALUES ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000020');

INSERT INTO zaltyko.people (id, organization_id, given_name, family_name) VALUES
  ('10000000-0000-4000-8000-000000000061', '10000000-0000-4000-8000-000000000010', 'Atleta', 'A'),
  ('20000000-0000-4000-8000-000000000061', '20000000-0000-4000-8000-000000000010', 'Atleta', 'B');

INSERT INTO zaltyko.athletes (id, organization_id, person_id) VALUES
  ('10000000-0000-4000-8000-000000000071', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000061'),
  ('20000000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000061');

INSERT INTO zaltyko.groups (id, organization_id, location_id, name, status) VALUES
  ('10000000-0000-4000-8000-000000000090', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'Grupo Centro', 'active'),
  ('10000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000021', 'Grupo Norte', 'active'),
  ('20000000-0000-4000-8000-000000000090', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000020', 'Grupo Sur', 'active');

INSERT INTO zaltyko.group_memberships (
  id, organization_id, group_id, athlete_id, status, starts_on
) VALUES
  ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000090', '10000000-0000-4000-8000-000000000071', 'active', current_date),
  ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000071', 'active', current_date),
  ('20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000090', '20000000-0000-4000-8000-000000000071', 'active', current_date);

INSERT INTO zaltyko.group_membership_history (
  organization_id, membership_id, from_status, to_status, changed_by_member_id,
  idempotency_key, effective_on
) VALUES
  ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000101', NULL, 'active', '10000000-0000-4000-8000-000000000030', 'pgtap-group-history-a1', current_date),
  ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000102', NULL, 'active', '10000000-0000-4000-8000-000000000030', 'pgtap-group-history-a2', current_date),
  ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000101', NULL, 'active', '20000000-0000-4000-8000-000000000030', 'pgtap-group-history-b1', current_date);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'zaltyko.group_memberships'::regclass), 'group_memberships has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'zaltyko.group_memberships'::regclass), 'group_memberships forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'zaltyko.group_membership_history'::regclass), 'group_membership_history has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'zaltyko.group_membership_history'::regclass), 'group_membership_history forces RLS');

SELECT ok(NOT has_table_privilege('anon', 'zaltyko.group_memberships', 'SELECT'), 'anon cannot read group memberships');
SELECT ok(NOT has_table_privilege('anon', 'zaltyko.group_membership_history', 'SELECT'), 'anon cannot read membership history');
SELECT ok(has_table_privilege('authenticated', 'zaltyko.group_memberships', 'SELECT'), 'authenticated can read scoped memberships');
SELECT ok(has_table_privilege('authenticated', 'zaltyko.group_membership_history', 'SELECT'), 'authenticated can read scoped history');
SELECT ok(NOT has_table_privilege('authenticated', 'zaltyko.group_memberships', 'INSERT') AND NOT has_table_privilege('authenticated', 'zaltyko.group_memberships', 'UPDATE') AND NOT has_table_privilege('authenticated', 'zaltyko.group_memberships', 'DELETE'), 'authenticated cannot mutate group memberships directly');
SELECT ok(NOT has_table_privilege('authenticated', 'zaltyko.group_membership_history', 'INSERT') AND NOT has_table_privilege('authenticated', 'zaltyko.group_membership_history', 'UPDATE') AND NOT has_table_privilege('authenticated', 'zaltyko.group_membership_history', 'DELETE'), 'authenticated cannot mutate membership history');
SELECT ok(has_table_privilege('service_role', 'zaltyko.group_memberships', 'SELECT') AND has_table_privilege('service_role', 'zaltyko.group_memberships', 'INSERT') AND has_table_privilege('service_role', 'zaltyko.group_memberships', 'UPDATE'), 'service_role can operate group memberships');
SELECT ok(NOT has_table_privilege('service_role', 'zaltyko.group_memberships', 'DELETE'), 'service_role cannot delete group memberships');
SELECT ok(has_table_privilege('service_role', 'zaltyko.group_membership_history', 'SELECT') AND has_table_privilege('service_role', 'zaltyko.group_membership_history', 'INSERT'), 'service_role can read and append membership history');
SELECT ok(NOT has_table_privilege('service_role', 'zaltyko.group_membership_history', 'UPDATE') AND NOT has_table_privilege('service_role', 'zaltyko.group_membership_history', 'DELETE'), 'membership history is not mutable by service_role');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*) FROM zaltyko.group_memberships), 2::bigint, 'academy owner sees both groups in their academy');
SELECT is((SELECT count(*) FROM zaltyko.group_membership_history), 2::bigint, 'academy owner sees history in their academy');

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*) FROM zaltyko.group_memberships), 1::bigint, 'manager sees only the selected physical site');
SELECT is((SELECT count(*) FROM zaltyko.group_membership_history), 1::bigint, 'manager sees only history from the selected physical site');

SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*) FROM zaltyko.group_memberships), 1::bigint, 'other academy owner sees only their own membership');
SELECT is((SELECT count(*) FROM zaltyko.group_memberships WHERE id = '10000000-0000-4000-8000-000000000101'), 0::bigint, 'other academy owner cannot see a foreign membership');
SELECT is((SELECT count(*) FROM zaltyko.group_membership_history), 1::bigint, 'other academy owner sees only their own history');
SELECT is((SELECT count(*) FROM zaltyko.group_membership_history WHERE membership_id = '10000000-0000-4000-8000-000000000101'), 0::bigint, 'other academy owner cannot see foreign history');

SELECT throws_ok(
  $$INSERT INTO zaltyko.group_membership_history (organization_id, membership_id, to_status, changed_by_member_id, idempotency_key, effective_on) VALUES ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000101', 'ended', '20000000-0000-4000-8000-000000000030', 'pgtap-forbidden-write', current_date)$$,
  '42501', NULL, 'authenticated cannot append history outside the server service'
);
SELECT throws_ok(
  $$UPDATE zaltyko.group_memberships SET status = 'ended' WHERE id = '20000000-0000-4000-8000-000000000101'$$,
  '42501', NULL, 'authenticated cannot change membership state directly'
);
RESET ROLE;
SELECT throws_ok(
  $$INSERT INTO zaltyko.group_membership_history (organization_id, membership_id, to_status, changed_by_member_id, idempotency_key, effective_on, reason_code) VALUES ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000101', 'ended', '20000000-0000-4000-8000-000000000030', 'pgtap-invalid-reason', current_date, 'free text')$$,
  '23514', NULL, 'database rejects free-text membership reasons'
);

SELECT * FROM finish();
ROLLBACK;
