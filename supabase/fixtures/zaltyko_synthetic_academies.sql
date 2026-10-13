-- Synthetic, role-neutral fixtures only. All names, identifiers and contact
-- values are fabricated for automated tests; .invalid cannot receive email.

insert into auth.users (id) values
  ('10000000-0000-0000-0000-000000000101'),
  ('20000000-0000-0000-0000-000000000101'),
  ('20000000-0000-0000-0000-000000000102');

insert into zaltyko.organizations (id, name, status) values
  ('10000000-0000-0000-0000-000000000001', 'Academia Sintética Mono', 'active'),
  ('20000000-0000-0000-0000-000000000001', 'Academia Sintética Multi', 'active');

insert into zaltyko.locations (id, organization_id, code, name) values
  (
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000001',
    'sede-unica',
    'Sede Sintética Única'
  ),
  (
    '20000000-0000-0000-0000-000000000011',
    '20000000-0000-0000-0000-000000000001',
    'sede-norte',
    'Sede Sintética Norte'
  ),
  (
    '20000000-0000-0000-0000-000000000012',
    '20000000-0000-0000-0000-000000000001',
    'sede-sur',
    'Sede Sintética Sur'
  );

insert into zaltyko.organization_members (
  id,
  organization_id,
  user_id,
  role,
  status,
  location_scope_mode
) values
  (
    '10000000-0000-0000-0000-000000000201',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000101',
    'owner',
    'active',
    'all'
  ),
  (
    '20000000-0000-0000-0000-000000000201',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000101',
    'owner',
    'active',
    'all'
  ),
  (
    '20000000-0000-0000-0000-000000000202',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000102',
    'manager',
    'active',
    'selected'
  );

insert into zaltyko.member_location_scopes (
  id,
  organization_id,
  member_id,
  location_id
) values (
  '20000000-0000-0000-0000-000000000211',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000202',
  '20000000-0000-0000-0000-000000000011'
);

insert into zaltyko.people (id, organization_id, given_name, family_name) values
  (
    '10000000-0000-0000-0000-000000000301',
    '10000000-0000-0000-0000-000000000001',
    'Atleta',
    'Sintético A'
  ),
  (
    '10000000-0000-0000-0000-000000000302',
    '10000000-0000-0000-0000-000000000001',
    'Tutor',
    'Sintético A'
  ),
  (
    '20000000-0000-0000-0000-000000000301',
    '20000000-0000-0000-0000-000000000001',
    'Atleta',
    'Sintético B'
  ),
  (
    '20000000-0000-0000-0000-000000000302',
    '20000000-0000-0000-0000-000000000001',
    'Tutor',
    'Sintético B'
  ),
  (
    '20000000-0000-0000-0000-000000000303',
    '20000000-0000-0000-0000-000000000001',
    'Atleta',
    'Sintético C'
  );

insert into zaltyko.athletes (id, organization_id, person_id) values
  (
    '10000000-0000-0000-0000-000000000401',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000301'
  ),
  (
    '20000000-0000-0000-0000-000000000401',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000301'
  ),
  (
    '20000000-0000-0000-0000-000000000402',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000303'
  );

insert into zaltyko.families (id, organization_id, external_reference) values
  (
    '10000000-0000-0000-0000-000000000601',
    '10000000-0000-0000-0000-000000000001',
    'fixture-family-single'
  ),
  (
    '20000000-0000-0000-0000-000000000601',
    '20000000-0000-0000-0000-000000000001',
    'fixture-family-multi'
  );

insert into zaltyko.guardians (id, organization_id, person_id) values
  (
    '10000000-0000-0000-0000-000000000501',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000302'
  ),
  (
    '20000000-0000-0000-0000-000000000501',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000302'
  );

insert into zaltyko.guardian_contacts (
  id,
  organization_id,
  guardian_id,
  kind,
  value,
  normalized_value,
  is_primary,
  verified_at
) values
  (
    '10000000-0000-0000-0000-000000000511',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000501',
    'email',
    'guardian-single@example.invalid',
    'guardian-single@example.invalid',
    true,
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000511',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000501',
    'email',
    'guardian-multi@example.invalid',
    'guardian-multi@example.invalid',
    true,
    now()
  );

insert into zaltyko.family_guardians (
  id,
  organization_id,
  family_id,
  guardian_id,
  relationship,
  can_manage_enrollments
) values
  (
    '10000000-0000-0000-0000-000000000611',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000601',
    '10000000-0000-0000-0000-000000000501',
    'parent',
    true
  ),
  (
    '20000000-0000-0000-0000-000000000611',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000601',
    '20000000-0000-0000-0000-000000000501',
    'legal_guardian',
    true
  );

insert into zaltyko.family_members (
  id,
  organization_id,
  family_id,
  athlete_id,
  relationship,
  starts_on
) values
  (
    '10000000-0000-0000-0000-000000000621',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000601',
    '10000000-0000-0000-0000-000000000401',
    'parent',
    current_date - 30
  ),
  (
    '20000000-0000-0000-0000-000000000621',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000601',
    '20000000-0000-0000-0000-000000000401',
    'legal_guardian',
    current_date - 30
  );

insert into zaltyko.family_payers (
  id,
  organization_id,
  family_id,
  guardian_id,
  is_primary,
  starts_on
) values
  (
    '10000000-0000-0000-0000-000000000631',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000601',
    '10000000-0000-0000-0000-000000000501',
    true,
    current_date - 30
  ),
  (
    '20000000-0000-0000-0000-000000000631',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000601',
    '20000000-0000-0000-0000-000000000501',
    true,
    current_date - 30
  );

insert into zaltyko.organization_sports (
  id, organization_id, country_code, sport_profile_id, role, status
) values
  (
    '10000000-0000-0000-0000-000000000710',
    '10000000-0000-0000-0000-000000000001',
    'ES', '70000000-0000-4000-8000-000000000001', 'primary', 'active'
  ),
  (
    '20000000-0000-0000-0000-000000000710',
    '20000000-0000-0000-0000-000000000001',
    'ES', '70000000-0000-4000-8000-000000000002', 'primary', 'active'
  );

insert into zaltyko.programs (
  id, organization_id, name, kind, organization_sport_id, activity_key, status
) values
  (
    '10000000-0000-0000-0000-000000000701',
    '10000000-0000-0000-0000-000000000001',
    'Programa Sintético Base', 'gymnastics_sport',
    '10000000-0000-0000-0000-000000000710', null, 'active'
  ),
  (
    '20000000-0000-0000-0000-000000000701',
    '20000000-0000-0000-0000-000000000001',
    'Programa Sintético Multi', 'gymnastics_sport',
    '20000000-0000-0000-0000-000000000710', null, 'active'
  );

insert into zaltyko.groups (
  id, organization_id, location_id, program_id, name, status
) values
  (
    '20000000-0000-0000-0000-000000000798',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000011',
    '20000000-0000-0000-0000-000000000701',
    'Grupo Sintético Norte',
    'active'
  ),
  (
    '20000000-0000-0000-0000-000000000797',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000012',
    '20000000-0000-0000-0000-000000000701',
    'Grupo Sintético Sur',
    'active'
  );

insert into zaltyko.class_templates (
  id,
  organization_id,
  location_id,
  program_id,
  name,
  capacity,
  status,
  effective_from
) values
  (
    '10000000-0000-0000-0000-000000000801',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000701',
    'Clase Sintética Base',
    8,
    'active',
    current_date - 30
  ),
  (
    '20000000-0000-0000-0000-000000000801',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000011',
    '20000000-0000-0000-0000-000000000701',
    'Clase Sintética Norte',
    8,
    'active',
    current_date - 30
  ),
  (
    '20000000-0000-0000-0000-000000000802',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000012',
    '20000000-0000-0000-0000-000000000701',
    'Clase Sintética Sur',
    8,
    'active',
    current_date - 30
  );

insert into zaltyko.class_template_weekdays (
  id,
  organization_id,
  class_template_id,
  iso_weekday,
  starts_at_local,
  ends_at_local
) values
  (
    '10000000-0000-0000-0000-000000000811',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000801',
    extract(isodow from current_date + 1)::integer,
    '17:00',
    '18:00'
  ),
  (
    '20000000-0000-0000-0000-000000000811',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000801',
    extract(isodow from current_date + 1)::integer,
    '17:00',
    '18:00'
  ),
  (
    '20000000-0000-0000-0000-000000000812',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000802',
    extract(isodow from current_date + 1)::integer,
    '18:00',
    '19:00'
  );

insert into zaltyko.class_template_groups (
  id, organization_id, class_template_id, group_id
) values
  (
    '20000000-0000-0000-0000-000000000821',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000801',
    '20000000-0000-0000-0000-000000000798'
  ),
  (
    '20000000-0000-0000-0000-000000000822',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000802',
    '20000000-0000-0000-0000-000000000797'
  );

insert into zaltyko.sessions (
  id,
  organization_id,
  location_id,
  class_template_id,
  status,
  starts_at,
  ends_at
) values
  (
    '10000000-0000-0000-0000-000000000901',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000801',
    'scheduled',
    current_timestamp - interval '15 minutes',
    current_timestamp + interval '45 minutes'
  ),
  (
    '20000000-0000-0000-0000-000000000901',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000011',
    '20000000-0000-0000-0000-000000000801',
    'scheduled',
    current_timestamp - interval '15 minutes',
    current_timestamp + interval '45 minutes'
  ),
  (
    '20000000-0000-0000-0000-000000000902',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000012',
    '20000000-0000-0000-0000-000000000802',
    'scheduled',
    current_timestamp - interval '15 minutes',
    current_timestamp + interval '45 minutes'
  );
