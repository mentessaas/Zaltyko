begin;

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001');

insert into zaltyko.organizations (id, name, status) values
  ('10000000-0000-4000-8000-000000000010', 'Academia Sintética Norte', 'active'),
  ('20000000-0000-4000-8000-000000000010', 'Academia Sintética Sur', 'active');

insert into zaltyko.organization_sports (
  id, organization_id, country_code, sport_profile_id, role, status
) values
  (
    '10000000-0000-4000-8000-000000000075',
    '10000000-0000-4000-8000-000000000010', 'ES',
    '70000000-0000-4000-8000-000000000001', 'primary', 'active'
  ),
  (
    '20000000-0000-4000-8000-000000000075',
    '20000000-0000-4000-8000-000000000010', 'ES',
    '70000000-0000-4000-8000-000000000002', 'primary', 'active'
  );

insert into zaltyko.locations (id, organization_id, code, name) values
  ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000010', 'centro', 'Centro'),
  ('10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000010', 'norte', 'Norte'),
  ('20000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000010', 'sur', 'Sur');

insert into zaltyko.organization_members (
  id, organization_id, user_id, role, status, location_scope_mode
) values
  (
    '10000000-0000-4000-8000-000000000030',
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    'manager', 'active', 'selected'
  ),
  (
    '20000000-0000-4000-8000-000000000030',
    '20000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000001',
    'owner', 'active', 'all'
  );

insert into zaltyko.member_location_scopes (
  organization_id, member_id, location_id
) values (
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000030',
  '10000000-0000-4000-8000-000000000020'
);

insert into zaltyko.facilities (id, organization_id, location_id, name) values
  (
    '10000000-0000-4000-8000-000000000040',
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000020',
    'Pabellón Centro'
  );

insert into zaltyko.spaces (
  id, organization_id, location_id, facility_id, name, capacity
) values (
  '10000000-0000-4000-8000-000000000050',
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000020',
  '10000000-0000-4000-8000-000000000040',
  'Tapiz principal',
  18
);

insert into zaltyko.people (id, organization_id, given_name, family_name) values
  (
    '10000000-0000-4000-8000-000000000060',
    '10000000-0000-4000-8000-000000000010',
    'Atleta', 'Sintética'
  );

insert into zaltyko.athletes (id, organization_id, person_id) values (
  '10000000-0000-4000-8000-000000000070',
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000060'
);

insert into zaltyko.programs (
  id, organization_id, name, kind, organization_sport_id, activity_key, status
) values (
  '10000000-0000-4000-8000-000000000080',
  '10000000-0000-4000-8000-000000000010',
  'Base artística', 'gymnastics_sport',
  '10000000-0000-4000-8000-000000000075', null, 'active'
);

insert into zaltyko.groups (
  id, organization_id, location_id, program_id, name, capacity
) values
  (
    '10000000-0000-4000-8000-000000000090',
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000080',
    'Iniciación A', 18
  ),
  (
    '10000000-0000-4000-8000-000000000091',
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000080',
    'Preparación física', 12
  );

-- La misma atleta pertenece a dos grupos: M:N canónico.
insert into zaltyko.group_memberships (
  organization_id, group_id, athlete_id, status, starts_on
) values
  (
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000090',
    '10000000-0000-4000-8000-000000000070',
    'active', '2026-09-01'
  ),
  (
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000091',
    '10000000-0000-4000-8000-000000000070',
    'active', '2026-09-01'
  );

select 1 / ((
  select count(*) = 2
  from zaltyko.group_memberships
  where athlete_id = '10000000-0000-4000-8000-000000000070'
)::integer);

do $$
begin
  begin
    insert into zaltyko.group_memberships (
      organization_id, group_id, athlete_id, status, starts_on
    ) values (
      '10000000-0000-4000-8000-000000000010',
      '10000000-0000-4000-8000-000000000090',
      '10000000-0000-4000-8000-000000000070',
      'paused', '2026-10-01'
    );
    raise exception 'duplicate open group membership was accepted';
  exception when unique_violation then
    null;
  end;

  begin
    insert into zaltyko.programs (
      organization_id, name, kind, organization_sport_id, activity_key
    ) values (
      '10000000-0000-4000-8000-000000000010', 'Cruce deportivo',
      'gymnastics_sport', '20000000-0000-4000-8000-000000000075', null
    );
    raise exception 'cross-organization sport reference was accepted';
  exception when foreign_key_violation then
    null;
  end;
end
$$;

insert into zaltyko.class_templates (
  id, organization_id, location_id, program_id, default_space_id,
  name, capacity, status, effective_from
) values (
  '10000000-0000-4000-8000-000000000100',
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000020',
  '10000000-0000-4000-8000-000000000080',
  '10000000-0000-4000-8000-000000000050',
  'Martes base', 20, 'active', '2026-09-01'
);

insert into zaltyko.sessions (
  id, organization_id, location_id, class_template_id, space_id,
  starts_at, ends_at
) values (
  '10000000-0000-4000-8000-000000000110',
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000020',
  '10000000-0000-4000-8000-000000000100',
  '10000000-0000-4000-8000-000000000050',
  '2026-10-06 16:00:00+02', '2026-10-06 17:30:00+02'
);

do $$
begin
  begin
    insert into zaltyko.groups (
      organization_id, location_id, name, capacity
    ) values (
      '20000000-0000-4000-8000-000000000010',
      '10000000-0000-4000-8000-000000000020',
      'Cruce prohibido', 10
    );
    raise exception 'cross-organization foreign key was accepted';
  exception when foreign_key_violation then
    null;
  end;
end
$$;

insert into zaltyko.audit_log (
  id, organization_id, actor_user_id, action, target_type, target_id
) values (
  '10000000-0000-4000-8000-000000000120',
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  'organization.created', 'organization',
  '10000000-0000-4000-8000-000000000010'
);

do $$
begin
  begin
    update zaltyko.audit_log
    set action = 'tampered'
    where id = '10000000-0000-4000-8000-000000000120';
    raise exception 'audit mutation was accepted';
  exception when sqlstate '55000' then
    null;
  end;
end
$$;

insert into zaltyko.outbox_events (
  organization_id, event_name, aggregate_type, aggregate_id,
  idempotency_key, payload, occurred_at
) values (
  '10000000-0000-4000-8000-000000000010',
  'enrollment.activated', 'enrollment',
  '10000000-0000-4000-8000-000000000130',
  'activate-synthetic-1', '{"status":"active"}', now()
);

do $$
begin
  begin
    insert into zaltyko.outbox_events (
      organization_id, event_name, aggregate_type, aggregate_id,
      idempotency_key, payload, occurred_at
    ) values (
      '10000000-0000-4000-8000-000000000010',
      'enrollment.activated', 'enrollment',
      '10000000-0000-4000-8000-000000000130',
      'activate-synthetic-1', '{"status":"active"}', now()
    );
    raise exception 'duplicate outbox event was accepted';
  exception when unique_violation then
    null;
  end;
end
$$;

-- Grants explícitos: PII y mutaciones no se exponen al rol autenticado.
select 1 / ((not has_table_privilege('authenticated', 'zaltyko.people', 'SELECT'))::integer);
select 1 / ((not has_table_privilege('authenticated', 'zaltyko.enrollments', 'SELECT'))::integer);
select 1 / ((not has_table_privilege('authenticated', 'zaltyko.outbox_events', 'SELECT'))::integer);
select 1 / ((not has_table_privilege('authenticated', 'zaltyko.sport_profiles', 'SELECT'))::integer);
select 1 / ((not has_table_privilege('authenticated', 'zaltyko.organization_sports', 'SELECT'))::integer);
select 1 / ((not has_table_privilege('authenticated', 'zaltyko.organizations', 'INSERT'))::integer);
select 1 / (has_table_privilege('authenticated', 'zaltyko.organizations', 'SELECT')::integer);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

-- El manager solo ve su organización y la sede seleccionada.
select 1 / (((select count(*) from zaltyko.organizations) = 1)::integer);
select 1 / (((select count(*) from zaltyko.locations) = 1)::integer);
select 1 / (((select count(*) from zaltyko.sessions) = 1)::integer);
select 1 / (((select count(*) from zaltyko.organization_members) = 1)::integer);

reset role;

select 1 / ((
  select bool_and(relrowsecurity and relforcerowsecurity)
  from pg_class
  join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where pg_namespace.nspname = 'zaltyko'
    and pg_class.relkind = 'r'
)::integer);

rollback;
