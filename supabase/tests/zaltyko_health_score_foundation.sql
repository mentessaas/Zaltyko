do $$
declare
  protected_tables integer;
  dimension_weight numeric;
  enrollment_weight numeric;
begin
  select count(*)::integer into protected_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'zaltyko'
    and relation.relname = any (array[
      'benchmark_profiles', 'benchmark_metric_targets', 'health_score_versions',
      'health_score_dimension_weights', 'health_score_metric_weights',
      'health_score_snapshots', 'health_score_dimension_snapshots',
      'health_score_metric_contributions'
    ])
    and relation.relrowsecurity and relation.relforcerowsecurity;
  if protected_tables <> 8 then
    raise exception 'Expected 8 score tables with forced RLS, found %', protected_tables;
  end if;

  select sum(weight) into dimension_weight
  from zaltyko.health_score_dimension_weights weight
  join zaltyko.health_score_versions version on version.id = weight.health_score_version_id
  where version.key = 'zaltyko_owner_health' and version.version = 1;
  if dimension_weight <> 1 then
    raise exception 'Dimension weights must sum to 1, found %', dimension_weight;
  end if;

  select sum(weight) into enrollment_weight
  from zaltyko.health_score_metric_weights weight
  join zaltyko.health_score_versions version on version.id = weight.health_score_version_id
  where version.key = 'zaltyko_owner_health' and version.version = 1
    and weight.dimension = 'enrollment';
  if enrollment_weight <> 1 then
    raise exception 'Enrollment weights must sum to 1, found %', enrollment_weight;
  end if;

  if has_table_privilege('authenticated', 'zaltyko.health_score_snapshots', 'SELECT')
    or has_table_privilege('anon', 'zaltyko.benchmark_profiles', 'SELECT') then
    raise exception 'Score tables must remain unavailable through Data API grants';
  end if;
  if not has_table_privilege('service_role', 'zaltyko.health_score_snapshots', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'service_role lacks score-table privileges';
  end if;
end
$$;
