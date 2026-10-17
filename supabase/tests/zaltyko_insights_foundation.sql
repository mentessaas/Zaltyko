do $$
declare
  protected_tables integer;
  rule_count integer;
  active_count integer;
  immutable_trigger_count integer;
begin
  select count(*)::integer into protected_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'zaltyko'
    and relation.relname = any (array[
      'insight_rule_versions', 'insight_rule_runs', 'insights',
      'insight_run_observations', 'insight_status_history', 'insight_actions',
      'insight_notifications'
    ])
    and relation.relrowsecurity and relation.relforcerowsecurity;
  if protected_tables <> 7 then
    raise exception 'Expected 7 insight tables with forced RLS, found %', protected_tables;
  end if;

  select count(*)::integer,
         count(*) filter (where status = 'active')::integer
  into rule_count, active_count
  from zaltyko.insight_rule_versions
  where version = 1;
  if rule_count <> 10 or active_count <> 9 then
    raise exception 'Expected 10 P0 rules (9 active, 1 privacy-gated), found %/%', rule_count, active_count;
  end if;
  if not exists (
    select 1 from zaltyko.insight_rule_versions
    where key = 'athlete_retention_risk' and status = 'draft'
      and notes ilike '%RGPD%EIPD%'
  ) then
    raise exception 'Retention risk must remain privacy-gated';
  end if;

  select count(*)::integer into immutable_trigger_count
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'zaltyko'
    and relation.relname = 'insight_status_history'
    and trigger.tgname = 'insight_status_history_immutable'
    and not trigger.tgisinternal;
  if immutable_trigger_count <> 1 then
    raise exception 'Insight history immutable trigger missing';
  end if;

  if has_table_privilege('authenticated', 'zaltyko.insights', 'SELECT')
    or has_table_privilege('anon', 'zaltyko.insight_rule_versions', 'SELECT') then
    raise exception 'Insight tables must remain unavailable through Data API grants';
  end if;
  if not has_table_privilege('service_role', 'zaltyko.insights', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'service_role lacks insight-table privileges';
  end if;
end
$$;
