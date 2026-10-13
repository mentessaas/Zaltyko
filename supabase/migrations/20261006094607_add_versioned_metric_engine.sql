begin;

create type zaltyko.metric_unit as enum ('count', 'ratio', 'currency_minor');
create type zaltyko.metric_direction as enum ('higher_better', 'lower_better', 'neutral');
create type zaltyko.metric_grain as enum ('day', 'week', 'month', 'season', 'year');
create type zaltyko.metric_run_status as enum ('running', 'succeeded', 'failed');
create type zaltyko.metric_quality as enum ('complete', 'partial', 'insufficient', 'stale', 'invalid');
create type zaltyko.data_quality_issue_status as enum ('open', 'resolved');

create table zaltyko.metric_definitions (
  key text primary key check (key ~ '^[a-z][a-z0-9_]+$'),
  name text not null check (btrim(name) <> ''),
  description text not null check (btrim(description) <> ''),
  unit zaltyko.metric_unit not null,
  direction zaltyko.metric_direction not null,
  grain zaltyko.metric_grain not null,
  formula_version integer not null check (formula_version > 0),
  owner text not null check (btrim(owner) <> ''),
  active boolean not null default true,
  formula text not null check (btrim(formula) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table zaltyko.metric_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  authorization_location_id uuid not null,
  period_start date not null,
  period_end date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  formula_set_version text not null check (btrim(formula_set_version) <> ''),
  status zaltyko.metric_run_status not null default 'running',
  parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters) = 'object'),
  source_watermark timestamptz not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text,
  error_detail text,
  created_at timestamptz not null default now(),
  constraint metric_runs_period_valid check (period_end >= period_start),
  constraint metric_runs_idempotency_uq unique (organization_id, idempotency_key),
  constraint metric_runs_organization_id_id_uq unique (organization_id, id),
  constraint metric_runs_authorization_location_fk
    foreign key (organization_id, authorization_location_id)
    references zaltyko.locations (organization_id, id) on delete restrict
);
create index metric_runs_period_idx
  on zaltyko.metric_runs (organization_id, period_end desc, started_at desc);

create table zaltyko.metric_run_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  metric_run_id uuid not null,
  location_id uuid,
  metric_key text not null references zaltyko.metric_definitions(key) on delete restrict,
  period_start date not null,
  period_end date not null,
  value_numeric numeric(24,8),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  numerator numeric(24,8),
  denominator numeric(24,8),
  coverage numeric(5,4) not null,
  quality zaltyko.metric_quality not null,
  dimensions jsonb not null default '{}'::jsonb check (jsonb_typeof(dimensions) = 'object'),
  dimensions_sha256 text not null check (dimensions_sha256 ~ '^[a-f0-9]{64}$'),
  formula_version integer not null check (formula_version > 0),
  computed_at timestamptz not null,
  source_watermark timestamptz not null,
  diagnostics jsonb not null default '{}'::jsonb check (jsonb_typeof(diagnostics) = 'object'),
  created_at timestamptz not null default now(),
  constraint metric_run_values_period_valid check (period_end >= period_start),
  constraint metric_run_values_coverage_valid check (coverage between 0 and 1),
  constraint metric_run_values_value_quality_valid check (
    (quality in ('insufficient', 'invalid') and value_numeric is null)
    or (quality in ('complete', 'partial', 'stale') and value_numeric is not null)
  ),
  constraint metric_run_values_run_fk foreign key (organization_id, metric_run_id)
    references zaltyko.metric_runs (organization_id, id) on delete cascade,
  constraint metric_run_values_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict
);
create unique index metric_run_values_natural_uq
  on zaltyko.metric_run_values (
    metric_run_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    metric_key,
    dimensions_sha256,
    coalesce(currency, '')
  );

create table zaltyko.metric_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  metric_run_id uuid not null,
  location_id uuid,
  metric_key text not null references zaltyko.metric_definitions(key) on delete restrict,
  period_start date not null,
  period_end date not null,
  value_numeric numeric(24,8),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  numerator numeric(24,8),
  denominator numeric(24,8),
  coverage numeric(5,4) not null,
  quality zaltyko.metric_quality not null,
  dimensions jsonb not null default '{}'::jsonb check (jsonb_typeof(dimensions) = 'object'),
  dimensions_sha256 text not null check (dimensions_sha256 ~ '^[a-f0-9]{64}$'),
  formula_version integer not null check (formula_version > 0),
  computed_at timestamptz not null,
  source_watermark timestamptz not null,
  diagnostics jsonb not null default '{}'::jsonb check (jsonb_typeof(diagnostics) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metric_values_period_valid check (period_end >= period_start),
  constraint metric_values_coverage_valid check (coverage between 0 and 1),
  constraint metric_values_value_quality_valid check (
    (quality in ('insufficient', 'invalid') and value_numeric is null)
    or (quality in ('complete', 'partial', 'stale') and value_numeric is not null)
  ),
  constraint metric_values_run_fk foreign key (organization_id, metric_run_id)
    references zaltyko.metric_runs (organization_id, id) on delete restrict,
  constraint metric_values_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict
);
create unique index metric_values_natural_uq
  on zaltyko.metric_values (
    organization_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    metric_key,
    period_start,
    period_end,
    dimensions_sha256,
    formula_version,
    coalesce(currency, '')
  );
create index metric_values_dashboard_idx
  on zaltyko.metric_values (organization_id, period_end desc, metric_key);

create unique index outbox_events_organization_id_id_uq
  on zaltyko.outbox_events (organization_id, id);

create table zaltyko.metric_event_consumptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  outbox_event_id uuid not null,
  handler_key text not null check (btrim(handler_key) <> ''),
  handler_version integer not null check (handler_version > 0),
  consumed_at timestamptz not null default now(),
  constraint metric_event_consumptions_uq unique (outbox_event_id, handler_key, handler_version),
  constraint metric_event_consumptions_event_fk foreign key (organization_id, outbox_event_id)
    references zaltyko.outbox_events (organization_id, id) on delete cascade
);

create table zaltyko.metric_invalidations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid,
  outbox_event_id uuid not null,
  handler_key text not null check (btrim(handler_key) <> ''),
  handler_version integer not null check (handler_version > 0),
  reason_event_name text not null check (btrim(reason_event_name) <> ''),
  affected_from date not null,
  affected_to date not null,
  status text not null default 'pending' check (status in ('pending', 'processed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint metric_invalidations_period_valid check (affected_to >= affected_from),
  constraint metric_invalidations_event_uq unique (outbox_event_id, handler_key, handler_version),
  constraint metric_invalidations_event_fk foreign key (organization_id, outbox_event_id)
    references zaltyko.outbox_events (organization_id, id) on delete cascade,
  constraint metric_invalidations_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict
);
create index metric_invalidations_pending_idx
  on zaltyko.metric_invalidations (organization_id, status, affected_from, affected_to);

create table zaltyko.data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  metric_run_id uuid not null,
  location_id uuid,
  metric_key text references zaltyko.metric_definitions(key) on delete restrict,
  issue_code text not null check (btrim(issue_code) <> ''),
  severity text not null check (severity in ('info', 'warning', 'error')),
  status zaltyko.data_quality_issue_status not null default 'open',
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint data_quality_issues_run_fk foreign key (organization_id, metric_run_id)
    references zaltyko.metric_runs (organization_id, id) on delete cascade,
  constraint data_quality_issues_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict
);
create index data_quality_issues_open_idx
  on zaltyko.data_quality_issues (organization_id, status, detected_at desc);

insert into zaltyko.metric_definitions (
  key, name, description, unit, direction, grain, formula_version, owner, formula
) values
  ('active_athletes_count', 'Atletas activos al cierre', 'Atletas distintos con enrollment activo al cierre del período.', 'count', 'higher_better', 'month', 1, 'analytics', 'distinct athletes active on period_end'),
  ('active_athletes_average', 'Atletas activos medios', 'Promedio diario de atletas distintos activos durante el período.', 'count', 'higher_better', 'month', 1, 'analytics', 'sum(daily active athletes) / days'),
  ('class_fill_rate', 'Ocupación ponderada', 'Plazas ocupadas sobre capacidad efectiva de sesiones elegibles.', 'ratio', 'neutral', 'month', 1, 'analytics', 'sum(occupied seats) / sum(effective capacity)'),
  ('attendance_rate', 'Asistencia', 'Registros present o late sobre asistencia registrada.', 'ratio', 'higher_better', 'month', 1, 'analytics', '(present + late) / attendance records'),
  ('attendance_coverage', 'Cobertura de asistencia', 'Asistencias registradas sobre enrollments esperados en sesiones completadas.', 'ratio', 'higher_better', 'month', 1, 'analytics', 'attendance records / expected attendance slots'),
  ('cohort_retention_rate', 'Retención de cohorte', 'Atletas activos al inicio que continúan activos al cierre.', 'ratio', 'higher_better', 'month', 1, 'analytics', 'retained starting cohort / starting cohort'),
  ('churn_rate', 'Churn de cohorte', 'Atletas de cohorte inicial sin enrollment activo al cierre.', 'ratio', 'lower_better', 'month', 1, 'analytics', 'lost starting cohort / starting cohort'),
  ('recognized_revenue_minor', 'Ingreso devengado neto', 'Cargos del período menos refunds atribuidos a sus asignaciones.', 'currency_minor', 'higher_better', 'month', 1, 'analytics', 'charges - succeeded refunds'),
  ('net_collected_minor', 'Cobrado neto', 'Asignaciones a cargos del período menos refunds.', 'currency_minor', 'higher_better', 'month', 1, 'analytics', 'allocations - succeeded refunds'),
  ('outstanding_minor', 'Saldo pendiente', 'Cargos del período menos asignaciones brutas.', 'currency_minor', 'lower_better', 'month', 1, 'analytics', 'charges - allocations'),
  ('collection_rate', 'Tasa de cobro', 'Cobrado neto sobre cargos vencidos del período.', 'ratio', 'higher_better', 'month', 1, 'analytics', 'net allocated to due charges / due charges'),
  ('waitlist_opportunity_count', 'Demanda contactable', 'Entradas waiting y contactables al cierre.', 'count', 'higher_better', 'month', 1, 'analytics', 'count(waiting and contactable entries)');

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'metric_definitions', 'metric_runs', 'metric_run_values', 'metric_values',
    'metric_event_consumptions', 'metric_invalidations', 'data_quality_issues'
  ]
  loop
    execute format('alter table zaltyko.%I enable row level security', target_table);
    execute format('alter table zaltyko.%I force row level security', target_table);
  end loop;
end
$$;

create policy metric_runs_select_member on zaltyko.metric_runs
for select to authenticated
using ((select zaltyko_domain_private.has_organization_access(organization_id)));
create policy metric_values_select_member on zaltyko.metric_values
for select to authenticated
using ((select zaltyko_domain_private.has_organization_access(organization_id)));
create policy data_quality_issues_select_member on zaltyko.data_quality_issues
for select to authenticated
using ((select zaltyko_domain_private.has_organization_access(organization_id)));

revoke all on table
  zaltyko.metric_definitions,
  zaltyko.metric_runs,
  zaltyko.metric_run_values,
  zaltyko.metric_values,
  zaltyko.metric_event_consumptions,
  zaltyko.metric_invalidations,
  zaltyko.data_quality_issues
from anon, authenticated;

grant all privileges on table
  zaltyko.metric_definitions,
  zaltyko.metric_runs,
  zaltyko.metric_run_values,
  zaltyko.metric_values,
  zaltyko.metric_event_consumptions,
  zaltyko.metric_invalidations,
  zaltyko.data_quality_issues
to service_role;

commit;
