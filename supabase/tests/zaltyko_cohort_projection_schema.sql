begin;

do $$
declare
  v_table_name text;
  v_organization_id uuid;
  v_metric_run_id uuid;
  v_projection_run_id uuid;
  v_watermark timestamptz;
begin
  foreach v_table_name in array array[
    'retention_cohort_projection_runs',
    'retention_cohort_projections'
  ] loop
    if not coalesce((
      select relrowsecurity and relforcerowsecurity
      from pg_class
      where oid = format('zaltyko.%I', v_table_name)::regclass
    ), false) then
      raise exception 'RLS must be enabled and forced on zaltyko.%', v_table_name;
    end if;
    if has_table_privilege('anon', format('zaltyko.%I', v_table_name), 'select')
       or has_table_privilege('authenticated', format('zaltyko.%I', v_table_name), 'select') then
      raise exception 'Data API roles must not have direct SELECT on zaltyko.%', v_table_name;
    end if;
    if not has_table_privilege('service_role', format('zaltyko.%I', v_table_name), 'select') then
      raise exception 'service_role requires read access to zaltyko.%', v_table_name;
    end if;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'zaltyko' and tablename = v_table_name
        and policyname = v_table_name || '_select_owner'
        and roles = array['authenticated']::name[]
    ) then
      raise exception 'Owner-scoped defense-in-depth SELECT policy missing on zaltyko.%', v_table_name;
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'zaltyko'
      and information_schema.columns.table_name = 'retention_cohort_projections'
      and column_name in ('athlete_id', 'person_id', 'family_id', 'enrollment_id', 'payment_id')
  ) then
    raise exception 'Retention cohort projection must not persist person/ledger identifiers';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'zaltyko'
      and indexname = 'retention_cohort_projections_scope_period_uq'
      and indexdef ilike '%UNIQUE%'
  ) then
    raise exception 'Projection rows must be idempotent within scope and period';
  end if;

  select run.organization_id, run.id, run.source_watermark
  into v_organization_id, v_metric_run_id, v_watermark
  from zaltyko.metric_runs run
  order by run.created_at
  limit 1;
  if v_metric_run_id is null then
    raise exception 'Schema test needs at least one synthetic metric run';
  end if;

  insert into zaltyko.retention_cohort_projection_runs (
    organization_id, metric_run_id, formula_version, source_watermark,
    status, idempotency_key, row_count, completed_at
  ) values (
    v_organization_id, v_metric_run_id, 1, v_watermark,
    'succeeded', 'schema-test:' || v_metric_run_id, 1, now()
  ) returning id into v_projection_run_id;

  insert into zaltyko.retention_cohort_projections (
    organization_id, projection_run_id, cohort_month, observation_month,
    cohort_size, active_count, paused_count, retention_rate, quality,
    numerator, denominator
  ) values (
    v_organization_id, v_projection_run_id,
    date_trunc('month', current_date)::date,
    date_trunc('month', current_date)::date,
    1, 1, 0, 1.0000, 'complete', 1, 1
  );

  begin
    insert into zaltyko.retention_cohort_projections (
      organization_id, projection_run_id, cohort_month, observation_month,
      cohort_size, active_count, paused_count, retention_rate, quality,
      numerator, denominator
    ) values (
      v_organization_id, v_projection_run_id,
      date_trunc('month', current_date)::date,
      date_trunc('month', current_date)::date,
      1, 1, 0, 1.0000, 'complete', 1, 1
    );
    raise exception 'Duplicate scope/month projection row was accepted';
  exception when unique_violation then
    null;
  end;
end
$$;

rollback;
