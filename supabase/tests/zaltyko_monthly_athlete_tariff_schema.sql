do $$
declare
  old_line record;
begin
  select enrollment_id, location_id, athlete_id
  into old_line
  from zaltyko.invoice_lines
  where id = '10000000-0000-0000-0000-000000000881';

  if old_line.enrollment_id <> '10000000-0000-0000-0000-000000000851'
    or old_line.location_id is not null
    or old_line.athlete_id is not null then
    raise exception 'The pre-migration invoice line was altered';
  end if;

  if not (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'zaltyko.price_plan_class_template_coverage'::regclass
  ) or not (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'zaltyko.invoice_line_enrollments'::regclass
  ) then
    raise exception 'New billing tables must have forced RLS';
  end if;

  if has_table_privilege('anon', 'zaltyko.price_plan_class_template_coverage', 'SELECT')
    or has_table_privilege('authenticated', 'zaltyko.price_plan_class_template_coverage', 'INSERT')
    or has_table_privilege('authenticated', 'zaltyko.invoice_line_enrollments', 'INSERT') then
    raise exception 'Client roles must not receive direct table privileges';
  end if;

  if not has_table_privilege('service_role', 'zaltyko.price_plan_class_template_coverage', 'SELECT')
    or not has_table_privilege('service_role', 'zaltyko.price_plan_class_template_coverage', 'UPDATE')
    or has_table_privilege('service_role', 'zaltyko.price_plan_class_template_coverage', 'DELETE')
    or not has_table_privilege('service_role', 'zaltyko.invoice_line_enrollments', 'INSERT')
    or has_table_privilege('service_role', 'zaltyko.invoice_line_enrollments', 'UPDATE')
    or has_table_privilege('service_role', 'zaltyko.invoice_line_enrollments', 'DELETE')
    or has_table_privilege('service_role', 'zaltyko.invoice_line_enrollments', 'TRUNCATE') then
    raise exception 'Service grants do not match the least-privilege contract';
  end if;
end
$$;

insert into zaltyko.price_plan_class_template_coverage (
  id, organization_id, location_id, price_plan_id, class_template_id,
  starts_on, ends_on
) values
  (
    '10000000-0000-0000-0000-000000000911',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000901',
    '10000000-0000-0000-0000-000000000801', date '2026-10-01', date '2026-10-31'
  ),
  (
    '10000000-0000-0000-0000-000000000912',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000901',
    '10000000-0000-0000-0000-000000000803', date '2026-10-01', date '2026-10-31'
  );

do $$
begin
  begin
    insert into zaltyko.price_plan_class_template_coverage (
      organization_id, location_id, price_plan_id, class_template_id,
      starts_on, ends_on
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000901',
      '10000000-0000-0000-0000-000000000801', date '2026-10-31', date '2026-11-15'
    );
    raise exception 'Overlapping tariff coverage was accepted';
  exception when exclusion_violation then null;
  end;

  begin
    insert into zaltyko.price_plan_class_template_coverage (
      organization_id, location_id, price_plan_id, class_template_id,
      starts_on, ends_on
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000901',
      '10000000-0000-0000-0000-000000000801', date '2026-12-01', date '2026-11-30'
    );
    raise exception 'Invalid coverage dates were accepted';
  exception when check_violation then null;
  end;

  begin
    insert into zaltyko.price_plan_class_template_coverage (
      organization_id, location_id, price_plan_id, class_template_id,
      starts_on, ends_on
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000901',
      '10000000-0000-0000-0000-000000000801', date '2026-10-01', date '2026-10-31'
    );
    raise exception 'Cross-organization location coverage was accepted';
  exception when foreign_key_violation then null;
  end;
end
$$;

insert into zaltyko.invoice_lines (
  id, organization_id, invoice_id, location_id, athlete_id, price_plan_id,
  line_type, quantity, unit_amount_cents, amount_cents, currency,
  service_period_start, service_period_end
) values (
  '10000000-0000-0000-0000-000000000882',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000871',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000401',
  '10000000-0000-0000-0000-000000000901', 'monthly_fee', 1, 3000, 3000, 'EUR',
  date '2026-10-01', date '2026-10-31'
);

insert into zaltyko.invoices (
  id, organization_id, location_id, family_id, family_payer_id, reference,
  status, currency, total_amount_cents, issued_at, due_at, idempotency_key
) values (
  '10000000-0000-0000-0000-000000000875',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000601',
  '10000000-0000-0000-0000-000000000631',
  'SYNTH-MONTHLY-LOCATION-NEGATIVE', 'issued', 'EUR', 3000, now(),
  now() + interval '7 days', 'synthetic-monthly-location-negative'
);

insert into zaltyko.invoices (
  id, organization_id, location_id, family_id, family_payer_id, reference,
  status, currency, total_amount_cents, issued_at, due_at, idempotency_key
) values (
  '10000000-0000-0000-0000-000000000874',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000601',
  '10000000-0000-0000-0000-000000000631',
  'SYNTH-MONTHLY-ATHLETE-B', 'issued', 'EUR', 3000, now(),
  now() + interval '7 days', 'synthetic-monthly-athlete-b'
);

insert into zaltyko.invoice_lines (
  id, organization_id, invoice_id, location_id, athlete_id, price_plan_id,
  line_type, quantity, unit_amount_cents, amount_cents, currency,
  service_period_start, service_period_end
) values (
  '10000000-0000-0000-0000-000000000883',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000874',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000402',
  '10000000-0000-0000-0000-000000000901', 'monthly_fee', 1, 3000, 3000, 'EUR',
  date '2026-10-01', date '2026-10-31'
);

insert into zaltyko.invoice_line_enrollments (
  organization_id, location_id, athlete_id, invoice_line_id, price_plan_id,
  enrollment_id, class_template_id, price_assignment_id, class_name_snapshot
) values
  (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000401',
    '10000000-0000-0000-0000-000000000882',
    '10000000-0000-0000-0000-000000000901',
    '10000000-0000-0000-0000-000000000851',
    '10000000-0000-0000-0000-000000000801',
    '10000000-0000-0000-0000-000000000861', 'Clase Sintética Base'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000401',
    '10000000-0000-0000-0000-000000000882',
    '10000000-0000-0000-0000-000000000901',
    '10000000-0000-0000-0000-000000000852',
    '10000000-0000-0000-0000-000000000803',
    '10000000-0000-0000-0000-000000000862', 'Clase Sintética Complementaria'
  );

do $$
begin
  if (
    select count(*)
    from zaltyko.invoice_line_enrollments
    where organization_id = '10000000-0000-0000-0000-000000000001'
      and invoice_line_id = '10000000-0000-0000-0000-000000000882'
  ) <> 2 then
    raise exception 'The athlete line did not preserve both covered enrollments';
  end if;

  begin
    insert into zaltyko.invoice_lines (
      organization_id, invoice_id, location_id, athlete_id, price_plan_id,
      line_type, quantity, unit_amount_cents, amount_cents, currency,
      service_period_start, service_period_end
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000871',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000401',
      '10000000-0000-0000-0000-000000000901', 'monthly_fee', 1, 3000, 3000, 'EUR',
      date '2026-10-01', date '2026-10-31'
    );
    raise exception 'Duplicate monthly athlete invoice line was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into zaltyko.invoice_lines (
      organization_id, invoice_id, location_id, athlete_id, price_plan_id,
      line_type, quantity, unit_amount_cents, amount_cents, currency,
      service_period_start, service_period_end
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000875',
      '10000000-0000-0000-0000-000000000012',
      '10000000-0000-0000-0000-000000000401',
      '10000000-0000-0000-0000-000000000901', 'monthly_fee', 1, 3000, 3000, 'EUR',
      date '2026-10-01', date '2026-10-31'
    );
    raise exception 'An invoice line from another location was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into zaltyko.invoice_lines (
      organization_id, invoice_id, location_id, athlete_id, price_plan_id,
      line_type, quantity, unit_amount_cents, amount_cents, currency,
      service_period_start, service_period_end
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000871',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000401',
      '10000000-0000-0000-0000-000000000901', 'monthly_fee', 1, 3000, 3000, 'EUR',
      date '2026-10-02', date '2026-10-31'
    );
    raise exception 'A partial monthly athlete line was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into zaltyko.invoice_lines (
      organization_id, invoice_id, location_id, athlete_id, price_plan_id,
      line_type, quantity, unit_amount_cents, amount_cents, currency,
      service_period_start, service_period_end
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000875',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000401',
      '10000000-0000-0000-0000-000000000901', 'monthly_fee', 1, 3000, 3000, 'EUR',
      null, date '2026-10-31'
    );
    raise exception 'An athlete line with a null period start was accepted';
  exception when not_null_violation then null;
  end;

  begin
    insert into zaltyko.invoice_lines (
      organization_id, invoice_id, location_id, athlete_id, price_plan_id,
      line_type, quantity, unit_amount_cents, amount_cents, currency,
      service_period_start, service_period_end
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000875',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000401',
      '10000000-0000-0000-0000-000000000901', 'monthly_fee', 1, 3000, 3000, 'EUR',
      date '2026-10-01', null
    );
    raise exception 'An athlete line with a null period end was accepted';
  exception when not_null_violation then null;
  end;

  begin
    insert into zaltyko.invoice_lines (
      organization_id, invoice_id, location_id, athlete_id, price_plan_id,
      line_type, quantity, unit_amount_cents, amount_cents, currency,
      service_period_start, service_period_end
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000875',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000401',
      '10000000-0000-0000-0000-000000000901', 'monthly_fee', 1, 3000, 3000, 'EUR',
      null, null
    );
    raise exception 'An athlete line with both period dates null was accepted';
  exception when not_null_violation then null;
  end;

  begin
    insert into zaltyko.invoice_lines (
      organization_id, invoice_id, location_id, athlete_id, price_plan_id,
      line_type, quantity, unit_amount_cents, amount_cents, currency,
      service_period_start, service_period_end
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000874',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000402',
      '10000000-0000-0000-0000-000000000901', 'monthly_fee', 1, 3000, 3000, 'EUR',
      null, date '2026-10-31'
    );
    raise exception 'An athlete monthly line with a null period was accepted';
  exception when not_null_violation then null;
  end;

  begin
    insert into zaltyko.invoice_line_enrollments (
      organization_id, location_id, athlete_id, invoice_line_id, price_plan_id,
      enrollment_id, class_template_id, price_assignment_id, class_name_snapshot
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000402',
      '10000000-0000-0000-0000-000000000883',
      '10000000-0000-0000-0000-000000000901',
      '10000000-0000-0000-0000-000000000853',
      '10000000-0000-0000-0000-000000000801',
      '10000000-0000-0000-0000-000000000863', 'Wrong class snapshot'
    );
    raise exception 'An enrollment linked to another class was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into zaltyko.invoice_line_enrollments (
      organization_id, location_id, athlete_id, invoice_line_id, price_plan_id,
      enrollment_id, class_template_id, price_assignment_id, class_name_snapshot
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000402',
      '10000000-0000-0000-0000-000000000883',
      '10000000-0000-0000-0000-000000000901',
      '10000000-0000-0000-0000-000000000853',
      '10000000-0000-0000-0000-000000000804',
      '10000000-0000-0000-0000-000000000861', 'Wrong assignment'
    );
    raise exception 'An assignment from another enrollment was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    update zaltyko.invoice_line_enrollments
    set class_name_snapshot = 'Mutated history'
    where enrollment_id = '10000000-0000-0000-0000-000000000851';
    raise exception 'Invoice coverage history accepted UPDATE';
  exception when object_not_in_prerequisite_state then null;
  end;

  begin
    insert into zaltyko.invoice_line_enrollments (
      organization_id, location_id, athlete_id, invoice_line_id, price_plan_id,
      enrollment_id, class_template_id, price_assignment_id, class_name_snapshot
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000402',
      '10000000-0000-0000-0000-000000000883',
      '10000000-0000-0000-0000-000000000901',
      '10000000-0000-0000-0000-000000000853',
      '10000000-0000-0000-0000-000000000804',
      '10000000-0000-0000-0000-000000000863', repeat('x', 121)
    );
    raise exception 'An oversized class snapshot was accepted';
  exception when check_violation then null;
  end;

  begin
    delete from zaltyko.invoice_line_enrollments
    where enrollment_id = '10000000-0000-0000-0000-000000000851';
    raise exception 'Invoice coverage history accepted DELETE';
  exception when object_not_in_prerequisite_state then null;
  end;

  begin
    execute 'truncate table zaltyko.invoice_line_enrollments';
    raise exception 'Invoice coverage history accepted TRUNCATE';
  exception when object_not_in_prerequisite_state then null;
  end;
end
$$;

begin;
grant usage on schema zaltyko to authenticated;
grant select, insert on table
  zaltyko.price_plan_class_template_coverage,
  zaltyko.invoice_line_enrollments
to authenticated;
set local role authenticated;
do $$
begin
  if exists (select 1 from zaltyko.price_plan_class_template_coverage)
    or exists (select 1 from zaltyko.invoice_line_enrollments) then
    raise exception 'Authenticated client read rows behind deny policy';
  end if;

  begin
    insert into zaltyko.price_plan_class_template_coverage (
      organization_id, location_id, price_plan_id, class_template_id,
      starts_on, ends_on
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000901',
      '10000000-0000-0000-0000-000000000801', date '2027-01-01', date '2027-01-31'
    );
    raise exception 'Authenticated client inserted coverage behind deny policy';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into zaltyko.invoice_line_enrollments (
      organization_id, location_id, athlete_id, invoice_line_id, price_plan_id,
      enrollment_id, class_template_id, price_assignment_id, class_name_snapshot
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000401',
      '10000000-0000-0000-0000-000000000882',
      '10000000-0000-0000-0000-000000000901',
      '10000000-0000-0000-0000-000000000851',
      '10000000-0000-0000-0000-000000000801',
      '10000000-0000-0000-0000-000000000861', 'Client write attempt'
    );
    raise exception 'Authenticated client inserted invoice coverage behind deny policy';
  exception when insufficient_privilege then null;
  end;
end
$$;
rollback;

select 'monthly athlete tariff schema checks passed' as result;
