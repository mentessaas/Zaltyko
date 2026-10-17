begin;

-- Rebuildable, PII-free read model for owner retention cohorts. A run is
-- published only after every dimension/period row is committed atomically.
create table zaltyko.retention_cohort_projection_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  metric_run_id uuid not null,
  location_id uuid,
  formula_version integer not null,
  source_watermark timestamptz not null,
  status text not null default 'running',
  idempotency_key text not null,
  row_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text,
  constraint retention_cohort_projection_runs_idempotency_uq
    unique (organization_id, idempotency_key),
  constraint retention_cohort_projection_runs_organization_id_id_uq
    unique (organization_id, id),
  constraint retention_cohort_projection_runs_metric_run_fk
    foreign key (organization_id, metric_run_id)
    references zaltyko.metric_runs(organization_id, id) on delete restrict,
  constraint retention_cohort_projection_runs_location_fk
    foreign key (organization_id, location_id)
    references zaltyko.locations(organization_id, id) on delete restrict,
  constraint retention_cohort_projection_runs_version_positive
    check (formula_version > 0),
  constraint retention_cohort_projection_runs_row_count_nonnegative
    check (row_count >= 0),
  constraint retention_cohort_projection_runs_status_valid
    check (status in ('running', 'succeeded', 'failed')),
  constraint retention_cohort_projection_runs_completion_valid
    check ((status = 'succeeded') = (completed_at is not null))
);

create index retention_cohort_projection_runs_latest_idx
  on zaltyko.retention_cohort_projection_runs
  (organization_id, location_id, status, source_watermark desc, completed_at desc);

create table zaltyko.retention_cohort_projections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  projection_run_id uuid not null,
  location_id uuid,
  program_id uuid,
  group_id uuid,
  cohort_month date not null,
  observation_month date not null,
  cohort_size integer not null,
  active_count integer not null,
  paused_count integer not null,
  retention_rate numeric(5,4),
  quality zaltyko.metric_quality not null,
  numerator integer not null,
  denominator integer not null,
  created_at timestamptz not null default now(),
  constraint retention_cohort_projections_run_fk
    foreign key (organization_id, projection_run_id)
    references zaltyko.retention_cohort_projection_runs(organization_id, id) on delete cascade,
  constraint retention_cohort_projections_location_fk
    foreign key (organization_id, location_id)
    references zaltyko.locations(organization_id, id) on delete restrict,
  constraint retention_cohort_projections_program_fk
    foreign key (organization_id, program_id)
    references zaltyko.programs(organization_id, id) on delete restrict,
  constraint retention_cohort_projections_group_fk
    foreign key (organization_id, group_id)
    references zaltyko.groups(organization_id, id) on delete restrict,
  constraint retention_cohort_projections_months_valid
    check (
      date_trunc('month', cohort_month::timestamp)::date = cohort_month
      and date_trunc('month', observation_month::timestamp)::date = observation_month
      and observation_month >= cohort_month
    ),
  constraint retention_cohort_projections_counts_valid
    check (
      cohort_size > 0
      and active_count between 0 and cohort_size
      and paused_count between 0 and cohort_size
      and numerator = active_count
      and denominator = cohort_size
    ),
  constraint retention_cohort_projections_rate_quality_valid
    check (
      (paused_count > 0 and retention_rate is null and quality = 'insufficient')
      or (paused_count = 0 and retention_rate is not null and quality = 'complete')
  )
);

create unique index retention_cohort_projections_scope_period_uq
  on zaltyko.retention_cohort_projections (
    organization_id,
    projection_run_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    cohort_month,
    observation_month
  );
create index retention_cohort_projections_read_idx
  on zaltyko.retention_cohort_projections
  (organization_id, location_id, program_id, group_id, cohort_month, observation_month, projection_run_id);
create index retention_cohort_projections_run_idx
  on zaltyko.retention_cohort_projections(organization_id, projection_run_id);

alter table zaltyko.retention_cohort_projection_runs enable row level security;
alter table zaltyko.retention_cohort_projection_runs force row level security;
alter table zaltyko.retention_cohort_projections enable row level security;
alter table zaltyko.retention_cohort_projections force row level security;

-- Defense-in-depth policies mirror Owner scope. No Data API table grants are
-- added; the server still authorizes before querying these worker-owned rows.
create policy retention_cohort_projection_runs_select_owner
on zaltyko.retention_cohort_projection_runs
for select to authenticated
using (
  exists (
    select 1
    from zaltyko.organization_members member
    where member.organization_id = retention_cohort_projection_runs.organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'admin', 'manager')
      and (
        (retention_cohort_projection_runs.location_id is null and member.location_scope_mode = 'all')
        or (retention_cohort_projection_runs.location_id is not null and (
          member.location_scope_mode = 'all'
          or exists (
            select 1
            from zaltyko.member_location_scopes scope
            where scope.organization_id = member.organization_id
              and scope.member_id = member.id
              and scope.location_id = retention_cohort_projection_runs.location_id
          )
        ))
      )
  )
);

create policy retention_cohort_projections_select_owner
on zaltyko.retention_cohort_projections
for select to authenticated
using (
  exists (
    select 1
    from zaltyko.organization_members member
    where member.organization_id = retention_cohort_projections.organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'admin', 'manager')
      and (
        (retention_cohort_projections.location_id is null and member.location_scope_mode = 'all')
        or (retention_cohort_projections.location_id is not null and (
          member.location_scope_mode = 'all'
          or exists (
            select 1
            from zaltyko.member_location_scopes scope
            where scope.organization_id = member.organization_id
              and scope.member_id = member.id
              and scope.location_id = retention_cohort_projections.location_id
          )
        ))
      )
  )
);

revoke all on table zaltyko.retention_cohort_projection_runs,
  zaltyko.retention_cohort_projections from anon, authenticated;
grant all privileges on table zaltyko.retention_cohort_projection_runs,
  zaltyko.retention_cohort_projections to service_role;

comment on table zaltyko.retention_cohort_projections is
  'PII-free, rebuildable owner retention cohort read model. Never use as an operational source of truth.';

commit;
