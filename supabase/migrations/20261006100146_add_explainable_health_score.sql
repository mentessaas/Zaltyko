begin;

create type zaltyko.health_dimension as enum ('enrollment', 'financial', 'operational', 'workforce');
create type zaltyko.health_score_status as enum ('critical', 'needs_attention', 'healthy', 'excellent', 'insufficient_data');
create type zaltyko.score_version_status as enum ('draft', 'active', 'retired');
create type zaltyko.benchmark_profile_status as enum ('draft', 'active', 'retired');
create type zaltyko.normalization_direction as enum ('higher_better', 'lower_better');

create table zaltyko.benchmark_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references zaltyko.organizations(id) on delete cascade,
  key text not null check (btrim(key) <> ''),
  name text not null check (btrim(name) <> ''),
  market text not null check (btrim(market) <> ''),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  organization_type text not null check (btrim(organization_type) <> ''),
  discipline_scope text not null check (btrim(discipline_scope) <> ''),
  source_title text not null check (btrim(source_title) <> ''),
  source_year integer,
  source_page text,
  methodology_notes text not null,
  effective_from date not null,
  effective_to date,
  version integer not null check (version > 0),
  status zaltyko.benchmark_profile_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint benchmark_profiles_dates_valid check (effective_to is null or effective_to >= effective_from)
);
create unique index benchmark_profiles_key_version_uq
  on zaltyko.benchmark_profiles (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), key, version
  );

create table zaltyko.benchmark_metric_targets (
  id uuid primary key default gen_random_uuid(),
  benchmark_profile_id uuid not null references zaltyko.benchmark_profiles(id) on delete cascade,
  metric_key text not null references zaltyko.metric_definitions(key) on delete restrict,
  target_numeric numeric(24,8) not null check (target_numeric > 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  grain zaltyko.metric_grain not null,
  normalization_direction zaltyko.normalization_direction not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint benchmark_metric_targets_uq unique (benchmark_profile_id, metric_key, currency)
);

create table zaltyko.health_score_versions (
  id uuid primary key default gen_random_uuid(),
  key text not null check (btrim(key) <> ''),
  version integer not null check (version > 0),
  name text not null check (btrim(name) <> ''),
  status zaltyko.score_version_status not null default 'draft',
  min_valid_dimensions integer not null check (min_valid_dimensions between 1 and 4),
  min_global_coverage numeric(5,4) not null check (min_global_coverage between 0 and 1),
  min_dimension_available_weight numeric(5,4) not null check (min_dimension_available_weight between 0 and 1),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint health_score_versions_key_version_uq unique (key, version)
);

create table zaltyko.health_score_dimension_weights (
  id uuid primary key default gen_random_uuid(),
  health_score_version_id uuid not null references zaltyko.health_score_versions(id) on delete cascade,
  dimension zaltyko.health_dimension not null,
  weight numeric(5,4) not null check (weight > 0 and weight <= 1),
  constraint health_score_dimension_weights_uq unique (health_score_version_id, dimension)
);

create table zaltyko.health_score_metric_weights (
  id uuid primary key default gen_random_uuid(),
  health_score_version_id uuid not null references zaltyko.health_score_versions(id) on delete cascade,
  dimension zaltyko.health_dimension not null,
  metric_key text not null references zaltyko.metric_definitions(key) on delete restrict,
  weight numeric(5,4) not null check (weight > 0 and weight <= 1),
  constraint health_score_metric_weights_uq unique (health_score_version_id, dimension, metric_key)
);

create table zaltyko.health_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid,
  metric_run_id uuid not null,
  health_score_version_id uuid not null references zaltyko.health_score_versions(id) on delete restrict,
  benchmark_profile_id uuid not null references zaltyko.benchmark_profiles(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  score numeric(5,2),
  status zaltyko.health_score_status not null,
  coverage numeric(5,4) not null check (coverage between 0 and 1),
  computed_at timestamptz not null,
  source_watermark timestamptz not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  explanation jsonb not null default '{}'::jsonb check (jsonb_typeof(explanation) = 'object'),
  created_at timestamptz not null default now(),
  constraint health_score_snapshots_period_valid check (period_end >= period_start),
  constraint health_score_snapshots_score_valid check (score is null or score between 0 and 100),
  constraint health_score_snapshots_status_value_valid check (
    (status = 'insufficient_data' and score is null)
    or (status <> 'insufficient_data' and score is not null)
  ),
  constraint health_score_snapshots_idempotency_uq unique (organization_id, idempotency_key),
  constraint health_score_snapshots_org_id_uq unique (organization_id, id),
  constraint health_score_snapshots_metric_run_fk foreign key (organization_id, metric_run_id)
    references zaltyko.metric_runs (organization_id, id) on delete restrict,
  constraint health_score_snapshots_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict
);
create index health_score_snapshots_dashboard_idx
  on zaltyko.health_score_snapshots (organization_id, period_end desc, computed_at desc);

create table zaltyko.health_score_dimension_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  health_score_snapshot_id uuid not null,
  dimension zaltyko.health_dimension not null,
  score numeric(5,2),
  status zaltyko.health_score_status not null,
  coverage numeric(5,4) not null check (coverage between 0 and 1),
  available_metric_weight numeric(5,4) not null check (available_metric_weight between 0 and 1),
  configured_metric_weight numeric(5,4) not null check (configured_metric_weight between 0 and 1),
  explanation jsonb not null default '{}'::jsonb check (jsonb_typeof(explanation) = 'object'),
  created_at timestamptz not null default now(),
  constraint health_score_dimension_score_valid check (score is null or score between 0 and 100),
  constraint health_score_dimension_status_value_valid check (
    (status = 'insufficient_data' and score is null)
    or (status <> 'insufficient_data' and score is not null)
  ),
  constraint health_score_dimension_snapshots_uq unique (health_score_snapshot_id, dimension),
  constraint health_score_dimension_snapshots_parent_fk foreign key (organization_id, health_score_snapshot_id)
    references zaltyko.health_score_snapshots (organization_id, id) on delete cascade
);

create unique index metric_run_values_organization_id_id_uq
  on zaltyko.metric_run_values (organization_id, id);

create table zaltyko.health_score_metric_contributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  health_score_snapshot_id uuid not null,
  dimension zaltyko.health_dimension not null,
  metric_key text not null references zaltyko.metric_definitions(key) on delete restrict,
  metric_run_value_id uuid,
  benchmark_target_id uuid references zaltyko.benchmark_metric_targets(id) on delete restrict,
  actual_value numeric(24,8),
  target_value numeric(24,8),
  normalized_score numeric(5,2),
  metric_weight numeric(5,4) not null check (metric_weight > 0 and metric_weight <= 1),
  metric_coverage numeric(5,4) not null check (metric_coverage between 0 and 1),
  effective_weight numeric(8,6) not null check (effective_weight >= 0),
  quality zaltyko.metric_quality not null,
  formula_version integer,
  explanation jsonb not null default '{}'::jsonb check (jsonb_typeof(explanation) = 'object'),
  created_at timestamptz not null default now(),
  constraint health_score_metric_contributions_score_valid check (normalized_score is null or normalized_score between 0 and 100),
  constraint health_score_metric_contributions_uq unique (health_score_snapshot_id, dimension, metric_key),
  constraint health_score_metric_contributions_parent_fk foreign key (organization_id, health_score_snapshot_id)
    references zaltyko.health_score_snapshots (organization_id, id) on delete cascade,
  constraint health_score_metric_contributions_value_fk foreign key (organization_id, metric_run_value_id)
    references zaltyko.metric_run_values (organization_id, id) on delete restrict
);

insert into zaltyko.health_score_versions (
  key, version, name, status, min_valid_dimensions, min_global_coverage,
  min_dimension_available_weight, notes
) values (
  'zaltyko_owner_health', 1, 'Zaltyko Owner Health V1', 'active', 3, 0.7000, 0.6000,
  'Versión inicial: usa solo métricas materializadas; Workforce queda sin puntuar hasta disponer de fuentes operativas.'
);

insert into zaltyko.health_score_dimension_weights (health_score_version_id, dimension, weight)
select version.id, weights.dimension::zaltyko.health_dimension, weights.weight
from zaltyko.health_score_versions version
cross join (values
  ('enrollment', 0.3000::numeric),
  ('financial', 0.3000::numeric),
  ('operational', 0.2500::numeric),
  ('workforce', 0.1500::numeric)
) weights(dimension, weight)
where version.key = 'zaltyko_owner_health' and version.version = 1;

insert into zaltyko.health_score_metric_weights (
  health_score_version_id, dimension, metric_key, weight
)
select version.id, weights.dimension::zaltyko.health_dimension, weights.metric_key, weights.weight
from zaltyko.health_score_versions version
cross join (values
  ('enrollment', 'class_fill_rate', 0.4500::numeric),
  ('enrollment', 'cohort_retention_rate', 0.3500::numeric),
  ('enrollment', 'churn_rate', 0.2000::numeric),
  ('financial', 'collection_rate', 1.0000::numeric),
  ('operational', 'attendance_coverage', 1.0000::numeric)
) weights(dimension, metric_key, weight)
where version.key = 'zaltyko_owner_health' and version.version = 1;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'benchmark_profiles', 'benchmark_metric_targets', 'health_score_versions',
    'health_score_dimension_weights', 'health_score_metric_weights',
    'health_score_snapshots', 'health_score_dimension_snapshots',
    'health_score_metric_contributions'
  ]
  loop
    execute format('alter table zaltyko.%I enable row level security', target_table);
    execute format('alter table zaltyko.%I force row level security', target_table);
  end loop;
end
$$;

create policy benchmark_profiles_member on zaltyko.benchmark_profiles
for select to authenticated
using (organization_id is null or (select zaltyko_private.has_organization_access(organization_id)));
create policy health_score_snapshots_member on zaltyko.health_score_snapshots
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy health_score_dimension_snapshots_member on zaltyko.health_score_dimension_snapshots
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));

revoke all on table
  zaltyko.benchmark_profiles,
  zaltyko.benchmark_metric_targets,
  zaltyko.health_score_versions,
  zaltyko.health_score_dimension_weights,
  zaltyko.health_score_metric_weights,
  zaltyko.health_score_snapshots,
  zaltyko.health_score_dimension_snapshots,
  zaltyko.health_score_metric_contributions
from anon, authenticated;

grant all privileges on table
  zaltyko.benchmark_profiles,
  zaltyko.benchmark_metric_targets,
  zaltyko.health_score_versions,
  zaltyko.health_score_dimension_weights,
  zaltyko.health_score_metric_weights,
  zaltyko.health_score_snapshots,
  zaltyko.health_score_dimension_snapshots,
  zaltyko.health_score_metric_contributions
to service_role;

commit;
