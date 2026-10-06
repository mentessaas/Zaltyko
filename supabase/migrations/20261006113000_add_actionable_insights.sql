begin;

create type zaltyko.insight_rule_status as enum ('draft', 'active', 'retired');
create type zaltyko.insight_severity as enum ('info', 'warning', 'critical');
create type zaltyko.insight_status as enum (
  'open', 'viewed', 'actioned', 'snoozed', 'dismissed', 'resolved'
);
create type zaltyko.insight_action_status as enum ('recorded', 'completed', 'failed');
create type zaltyko.insight_outcome as enum (
  'pending', 'positive', 'neutral', 'negative', 'not_measurable'
);
create type zaltyko.insight_delivery_channel as enum ('in_app', 'email');
create type zaltyko.insight_delivery_status as enum (
  'pending', 'sent', 'failed', 'suppressed'
);
create type zaltyko.insight_run_status as enum ('running', 'succeeded', 'failed');

create table zaltyko.insight_rule_versions (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z][a-z0-9_]+$'),
  version integer not null check (version > 0),
  name text not null check (btrim(name) <> ''),
  status zaltyko.insight_rule_status not null default 'draft',
  severity zaltyko.insight_severity not null,
  cooldown_hours integer not null check (cooldown_hours between 1 and 8760),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  default_cta_key text not null check (btrim(default_cta_key) <> ''),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint insight_rule_versions_key_version_uq unique (key, version)
);

create table zaltyko.insight_rule_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid,
  rule_version_id uuid not null references zaltyko.insight_rule_versions(id) on delete restrict,
  status zaltyko.insight_run_status not null default 'running',
  evaluated_at timestamptz not null,
  source_watermark timestamptz not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  error_code text,
  error_detail text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint insight_rule_runs_idempotency_uq unique (organization_id, idempotency_key),
  constraint insight_rule_runs_org_id_uq unique (organization_id, id),
  constraint insight_rule_runs_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict
);

create table zaltyko.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid,
  rule_version_id uuid not null references zaltyko.insight_rule_versions(id) on delete restrict,
  series_key text not null check (btrim(series_key) <> ''),
  occurrence integer not null default 1 check (occurrence > 0),
  status zaltyko.insight_status not null default 'open',
  severity zaltyko.insight_severity not null,
  priority_score numeric(5,2) not null check (priority_score between 0 and 100),
  impact_score numeric(5,2) not null check (impact_score between 0 and 100),
  urgency_score numeric(5,2) not null check (urgency_score between 0 and 100),
  confidence_score numeric(5,2) not null check (confidence_score between 0 and 100),
  actionability_score numeric(5,2) not null check (actionability_score between 0 and 100),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id uuid,
  title text not null check (btrim(title) <> ''),
  detail text not null check (btrim(detail) <> ''),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  assumptions jsonb not null default '[]'::jsonb check (jsonb_typeof(assumptions) = 'array'),
  cta_key text not null check (btrim(cta_key) <> ''),
  cta_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(cta_payload) = 'object'),
  estimated_value_min_minor numeric(20,0),
  estimated_value_max_minor numeric(20,0),
  estimate_currency text,
  source_metric_run_id uuid,
  source_health_score_snapshot_id uuid,
  detected_at timestamptz not null,
  last_seen_at timestamptz not null,
  viewed_at timestamptz,
  snoozed_until timestamptz,
  resolved_at timestamptz,
  resolution_reason text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insights_series_occurrence_uq unique (organization_id, series_key, occurrence),
  constraint insights_org_id_uq unique (organization_id, id),
  constraint insights_estimate_range_valid check (
    estimated_value_min_minor is null
    or estimated_value_max_minor is null
    or estimated_value_max_minor >= estimated_value_min_minor
  ),
  constraint insights_estimate_currency_valid check (
    (estimated_value_min_minor is null and estimated_value_max_minor is null)
    or estimate_currency ~ '^[A-Z]{3}$'
  ),
  constraint insights_snooze_valid check (status <> 'snoozed' or snoozed_until is not null),
  constraint insights_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint insights_metric_run_fk foreign key (organization_id, source_metric_run_id)
    references zaltyko.metric_runs (organization_id, id) on delete restrict,
  constraint insights_health_snapshot_fk foreign key (organization_id, source_health_score_snapshot_id)
    references zaltyko.health_score_snapshots (organization_id, id) on delete restrict
);
create index insights_inbox_idx
  on zaltyko.insights (organization_id, status, priority_score desc, last_seen_at desc);
create index insights_location_inbox_idx
  on zaltyko.insights (organization_id, location_id, status, priority_score desc);

create table zaltyko.insight_run_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  rule_run_id uuid not null,
  insight_id uuid not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint insight_run_observations_uq unique (rule_run_id, insight_id),
  constraint insight_run_observations_run_fk foreign key (organization_id, rule_run_id)
    references zaltyko.insight_rule_runs (organization_id, id) on delete cascade,
  constraint insight_run_observations_insight_fk foreign key (organization_id, insight_id)
    references zaltyko.insights (organization_id, id) on delete cascade
);

create table zaltyko.insight_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  insight_id uuid not null,
  from_status zaltyko.insight_status,
  to_status zaltyko.insight_status not null,
  reason_code text not null check (btrim(reason_code) <> ''),
  actor_user_id uuid references auth.users(id) on delete set null,
  rule_run_id uuid,
  idempotency_key text,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  constraint insight_status_history_idempotency_uq unique (organization_id, idempotency_key),
  constraint insight_status_history_insight_fk foreign key (organization_id, insight_id)
    references zaltyko.insights (organization_id, id) on delete cascade,
  constraint insight_status_history_run_fk foreign key (organization_id, rule_run_id)
    references zaltyko.insight_rule_runs (organization_id, id) on delete restrict
);

create table zaltyko.insight_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid,
  insight_id uuid not null,
  action_key text not null check (btrim(action_key) <> ''),
  status zaltyko.insight_action_status not null default 'recorded',
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_member_id uuid not null,
  target_entity_type text not null check (btrim(target_entity_type) <> ''),
  target_entity_id uuid,
  before_value jsonb not null default '{}'::jsonb check (jsonb_typeof(before_value) = 'object'),
  after_value jsonb check (after_value is null or jsonb_typeof(after_value) = 'object'),
  evaluation_ends_at timestamptz not null,
  outcome zaltyko.insight_outcome not null default 'pending',
  outcome_notes text,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  correlation_id uuid not null default gen_random_uuid(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insight_actions_idempotency_uq unique (organization_id, idempotency_key),
  constraint insight_actions_insight_fk foreign key (organization_id, insight_id)
    references zaltyko.insights (organization_id, id) on delete restrict,
  constraint insight_actions_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint insight_actions_member_fk foreign key (organization_id, actor_member_id)
    references zaltyko.organization_members (organization_id, id) on delete restrict
);

create table zaltyko.insight_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  insight_id uuid not null,
  channel zaltyko.insight_delivery_channel not null,
  delivery_window_key text not null check (btrim(delivery_window_key) <> ''),
  status zaltyko.insight_delivery_status not null default 'pending',
  available_at timestamptz not null,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint insight_notifications_dedupe_uq unique (
    organization_id, insight_id, channel, delivery_window_key
  ),
  constraint insight_notifications_insight_fk foreign key (organization_id, insight_id)
    references zaltyko.insights (organization_id, id) on delete cascade
);

insert into zaltyko.insight_rule_versions (
  key, version, name, status, severity, cooldown_hours, config,
  default_cta_key, notes
) values
  ('underutilized_class', 1, 'Clase infrautilizada', 'active', 'warning', 168,
   '{"fillRateBelow":0.50,"minimumSessions":4,"windowDays":28}', 'review_schedule', ''),
  ('excess_demand', 1, 'Demanda excedente', 'active', 'warning', 168,
   '{"fillRateAtLeast":0.90,"eligibleWaitlistAtLeast":3}', 'simulate_group', 'Las estimaciones son rangos con supuestos, nunca ingreso garantizado.'),
  ('overdue_collections', 1, 'Cobros vencidos', 'active', 'warning', 24,
   '{"outstandingAboveMinor":0,"minimumAgeDays":3}', 'send_reminders', ''),
  ('incomplete_attendance', 1, 'Asistencia incompleta', 'active', 'warning', 24,
   '{"hoursAfterSession":12}', 'complete_attendance', ''),
  ('athlete_retention_risk', 1, 'Atleta en riesgo', 'draft', 'warning', 168,
   '{"highScoreAtLeast":70,"minimumSignals":2}', 'review_retention_signals', 'Desactivada hasta completar análisis de riesgo y gate RGPD/EIPD.'),
  ('trial_without_followup', 1, 'Trial sin seguimiento', 'active', 'warning', 72,
   '{"hoursAfterCompletion":24}', 'record_followup', ''),
  ('low_trial_conversion', 1, 'Baja conversión de trials', 'active', 'warning', 720,
   '{"minimumTrials":10,"windowDays":90}', 'review_trial_funnel', ''),
  ('capacity_without_price', 1, 'Capacidad sin precio', 'active', 'warning', 168,
   '{"requiresOpenCapacity":true}', 'configure_price', ''),
  ('session_without_coach', 1, 'Sesión sin entrenador', 'active', 'critical', 12,
   '{"hoursBeforeSession":72}', 'assign_coach', ''),
  ('critical_data_missing', 1, 'Dato crítico faltante', 'active', 'warning', 24,
   '{"blocksMetric":true}', 'fix_configuration', '');

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'insight_rule_versions', 'insight_rule_runs', 'insights',
    'insight_run_observations', 'insight_status_history', 'insight_actions',
    'insight_notifications'
  ]
  loop
    execute format('alter table zaltyko.%I enable row level security', target_table);
    execute format('alter table zaltyko.%I force row level security', target_table);
  end loop;
end
$$;

create policy insight_rule_versions_member on zaltyko.insight_rule_versions
for select to authenticated using (true);
create policy insight_rule_runs_member on zaltyko.insight_rule_runs
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy insights_member on zaltyko.insights
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy insight_actions_member on zaltyko.insight_actions
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));

revoke all on table
  zaltyko.insight_rule_versions,
  zaltyko.insight_rule_runs,
  zaltyko.insights,
  zaltyko.insight_run_observations,
  zaltyko.insight_status_history,
  zaltyko.insight_actions,
  zaltyko.insight_notifications
from anon, authenticated;

grant all privileges on table
  zaltyko.insight_rule_versions,
  zaltyko.insight_rule_runs,
  zaltyko.insights,
  zaltyko.insight_run_observations,
  zaltyko.insight_status_history,
  zaltyko.insight_actions,
  zaltyko.insight_notifications
to service_role;

create or replace function zaltyko_private.reject_insight_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'zaltyko.insight_status_history is append-only' using errcode = '55000';
end
$$;
revoke all on function zaltyko_private.reject_insight_history_mutation() from public;

create trigger insight_status_history_immutable
before update or delete on zaltyko.insight_status_history
for each row execute function zaltyko_private.reject_insight_history_mutation();

commit;
