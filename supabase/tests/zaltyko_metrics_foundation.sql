do $$
declare
  protected_tables integer;
  definitions integer;
begin
  select count(*)::integer into protected_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'zaltyko'
    and relation.relname = any (array[
      'metric_definitions', 'metric_runs', 'metric_run_values', 'metric_values',
      'metric_event_consumptions', 'metric_invalidations', 'data_quality_issues'
    ])
    and relation.relrowsecurity
    and relation.relforcerowsecurity;
  if protected_tables <> 7 then
    raise exception 'Expected 7 analytics tables with forced RLS, found %', protected_tables;
  end if;

  select count(*)::integer into definitions from zaltyko.metric_definitions;
  if definitions <> 12 then
    raise exception 'Expected 12 versioned metric definitions, found %', definitions;
  end if;

  if has_table_privilege('authenticated', 'zaltyko.metric_values', 'SELECT')
    or has_table_privilege('authenticated', 'zaltyko.metric_runs', 'SELECT')
    or has_table_privilege('anon', 'zaltyko.metric_definitions', 'SELECT') then
    raise exception 'Analytics tables must remain unavailable through Data API grants';
  end if;

  if not has_table_privilege('service_role', 'zaltyko.metric_values', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'service_role lacks analytics privileges';
  end if;
end
$$;

insert into zaltyko.metric_runs (
  id, organization_id, authorization_location_id, period_start, period_end,
  currency, formula_set_version, status, source_watermark, idempotency_key
) values (
  '10000000-0000-0000-0000-000000000751',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  current_date, current_date, 'EUR', 'foundation-v1', 'succeeded', now(),
  'metrics-foundation-run'
);

insert into zaltyko.metric_values (
  organization_id, metric_run_id, metric_key, period_start, period_end,
  value_numeric, numerator, coverage, quality, dimensions, dimensions_sha256,
  formula_version, computed_at, source_watermark
) values (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000751',
  'active_athletes_count', current_date, current_date,
  1, 1, 1, 'complete', '{}', repeat('a', 64), 1, now(), now()
);

do $$
begin
  begin
    insert into zaltyko.metric_values (
      organization_id, metric_run_id, metric_key, period_start, period_end,
      value_numeric, numerator, coverage, quality, dimensions, dimensions_sha256,
      formula_version, computed_at, source_watermark
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000751',
      'active_athletes_count', current_date, current_date,
      1, 1, 1, 'complete', '{}', repeat('a', 64), 1, now(), now()
    );
    raise exception 'Duplicate natural metric key was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into zaltyko.metric_run_values (
      organization_id, metric_run_id, metric_key, period_start, period_end,
      value_numeric, coverage, quality, dimensions_sha256, formula_version,
      computed_at, source_watermark
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000751',
      'class_fill_rate', current_date, current_date,
      0, 0, 'insufficient', repeat('b', 64), 1, now(), now()
    );
    raise exception 'Insufficient metric with zero instead of null was accepted';
  exception when check_violation then null;
  end;
end
$$;
