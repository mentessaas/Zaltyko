do $$
declare
  protected_tables integer;
begin
  select count(*)::integer
  into protected_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'zaltyko'
    and relation.relname = any (array[
      'families', 'guardians', 'guardian_contacts', 'family_guardians',
      'family_members', 'family_payers', 'trials', 'trial_status_history',
      'trial_followups', 'waitlist_entries', 'waitlist_offers'
    ])
    and relation.relrowsecurity
    and relation.relforcerowsecurity;

  if protected_tables <> 11 then
    raise exception 'Expected 11 growth tables with forced RLS, found %', protected_tables;
  end if;

  if has_table_privilege('authenticated', 'zaltyko.families', 'SELECT')
    or has_table_privilege('authenticated', 'zaltyko.waitlist_entries', 'SELECT')
    or has_table_privilege('anon', 'zaltyko.trials', 'SELECT') then
    raise exception 'Sensitive growth tables must remain unavailable through Data API grants';
  end if;

  if not has_table_privilege('service_role', 'zaltyko.families', 'SELECT,INSERT,UPDATE,DELETE')
    or not has_table_privilege('service_role', 'zaltyko.waitlist_offers', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'service_role lacks required growth-table privileges';
  end if;
end
$$;

do $$
begin
  begin
    insert into zaltyko.family_members (
      organization_id,
      family_id,
      athlete_id,
      relationship,
      starts_on
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000601',
      '20000000-0000-0000-0000-000000000401',
      'parent',
      current_date
    );
    raise exception 'Cross-organization family member was accepted';
  exception
    when foreign_key_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into zaltyko.waitlist_entries (
      organization_id,
      location_id,
      athlete_id,
      class_template_id,
      contact_guardian_id,
      contactable,
      contact_consent_status
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000401',
      '10000000-0000-0000-0000-000000000801',
      '10000000-0000-0000-0000-000000000501',
      true,
      'unknown'
    );
    raise exception 'Contactable waitlist entry without granted consent was accepted';
  exception
    when check_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into zaltyko.family_payers (
      organization_id,
      family_id,
      guardian_id,
      is_primary,
      starts_on
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000601',
      '10000000-0000-0000-0000-000000000501',
      true,
      current_date
    );
    raise exception 'Second active primary payer was accepted';
  exception
    when unique_violation then null;
  end;
end
$$;

insert into zaltyko.enrollments (
  id,
  organization_id,
  location_id,
  athlete_id,
  class_template_id,
  status,
  starts_on,
  source
) values (
  '20000000-0000-0000-0000-000000000921',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000011',
  '20000000-0000-0000-0000-000000000401',
  '20000000-0000-0000-0000-000000000801',
  'trial',
  current_date,
  'trial'
);

do $$
begin
  begin
    insert into zaltyko.trials (
      organization_id,
      location_id,
      athlete_id,
      session_id,
      trial_enrollment_id
    ) values (
      '20000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000011',
      '20000000-0000-0000-0000-000000000401',
      '20000000-0000-0000-0000-000000000902',
      '20000000-0000-0000-0000-000000000921'
    );
    raise exception 'Cross-location trial session was accepted';
  exception
    when foreign_key_violation then null;
  end;
end
$$;

do $$
declare
  family_count integer;
  location_count integer;
begin
  select count(*)::integer into family_count from zaltyko.families;
  select count(*)::integer into location_count from zaltyko.locations;

  if family_count <> 2 or location_count <> 3 then
    raise exception 'Synthetic fixture is incomplete: families %, locations %', family_count, location_count;
  end if;
end
$$;
