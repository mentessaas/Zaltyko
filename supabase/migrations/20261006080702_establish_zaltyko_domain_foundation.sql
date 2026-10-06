begin;

create schema if not exists zaltyko;
create schema if not exists zaltyko_private;

comment on schema zaltyko is
  'Authoritative domain boundary for the rebuilt Zaltyko product.';
comment on schema zaltyko_private is
  'Non-exposed helpers used by RLS and database invariants.';

revoke all on schema zaltyko from public, anon, authenticated;
revoke all on schema zaltyko_private from public, anon, authenticated;
grant usage on schema zaltyko to authenticated, service_role;
grant usage on schema zaltyko_private to authenticated, service_role;

create type zaltyko.organization_status as enum ('trial', 'active', 'suspended', 'closed');
create type zaltyko.member_role as enum ('owner', 'manager', 'admin', 'coach');
create type zaltyko.member_status as enum ('invited', 'active', 'suspended', 'revoked');
create type zaltyko.location_scope_mode as enum ('all', 'selected');
create type zaltyko.lifecycle_status as enum ('draft', 'active', 'archived');
create type zaltyko.group_membership_status as enum ('pending', 'active', 'paused', 'ended');
create type zaltyko.session_status as enum ('scheduled', 'completed', 'cancelled');
create type zaltyko.enrollment_status as enum (
  'pending', 'trial', 'active', 'paused', 'cancelled', 'completed'
);
create type zaltyko.enrollment_source as enum (
  'import', 'owner', 'parent', 'trial', 'waitlist', 'transfer', 'api'
);
create type zaltyko.attendance_status as enum ('present', 'absent', 'excused', 'late');
create type zaltyko.billing_cadence as enum (
  'one_time', 'weekly', 'monthly', 'quarterly', 'annual'
);
create type zaltyko.outbox_status as enum ('pending', 'processing', 'processed', 'failed');

create table zaltyko.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  legal_name text,
  status zaltyko.organization_status not null default 'trial',
  country_code text not null default 'ES' check (country_code ~ '^[A-Z]{2}$'),
  default_timezone text not null default 'Europe/Madrid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table zaltyko.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  name text not null check (btrim(name) <> ''),
  timezone text not null default 'Europe/Madrid',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_organization_code_uq unique (organization_id, code),
  constraint locations_organization_id_id_uq unique (organization_id, id)
);
create index locations_organization_idx on zaltyko.locations (organization_id);

create table zaltyko.facilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facilities_organization_id_id_uq unique (organization_id, id),
  constraint facilities_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete cascade
);
create index facilities_location_idx on zaltyko.facilities (organization_id, location_id);

create table zaltyko.spaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  facility_id uuid not null,
  name text not null check (btrim(name) <> ''),
  capacity integer check (capacity is null or capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spaces_organization_id_id_uq unique (organization_id, id),
  constraint spaces_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete cascade,
  constraint spaces_facility_fk foreign key (organization_id, facility_id)
    references zaltyko.facilities (organization_id, id) on delete cascade
);
create index spaces_location_idx on zaltyko.spaces (organization_id, location_id);
create index spaces_facility_idx on zaltyko.spaces (organization_id, facility_id);

create table zaltyko.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role zaltyko.member_role not null,
  status zaltyko.member_status not null default 'invited',
  location_scope_mode zaltyko.location_scope_mode not null default 'selected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_user_uq unique (organization_id, user_id),
  constraint organization_members_organization_id_id_uq unique (organization_id, id)
);
create index organization_members_user_idx on zaltyko.organization_members (user_id);

create table zaltyko.member_location_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  member_id uuid not null,
  location_id uuid not null,
  created_at timestamptz not null default now(),
  constraint member_location_scopes_member_location_uq
    unique (organization_id, member_id, location_id),
  constraint member_location_scopes_member_fk foreign key (organization_id, member_id)
    references zaltyko.organization_members (organization_id, id) on delete cascade,
  constraint member_location_scopes_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete cascade
);
create index member_location_scopes_location_idx
  on zaltyko.member_location_scopes (organization_id, location_id);

create table zaltyko.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  given_name text not null check (btrim(given_name) <> ''),
  family_name text not null check (btrim(family_name) <> ''),
  preferred_name text,
  date_of_birth date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_organization_id_id_uq unique (organization_id, id)
);
create index people_organization_idx on zaltyko.people (organization_id);

create table zaltyko.athletes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  person_id uuid not null,
  external_reference text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athletes_organization_person_uq unique (organization_id, person_id),
  constraint athletes_organization_id_id_uq unique (organization_id, id),
  constraint athletes_person_fk foreign key (organization_id, person_id)
    references zaltyko.people (organization_id, id) on delete restrict
);
create index athletes_organization_active_idx
  on zaltyko.athletes (organization_id, is_active);

create table zaltyko.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  person_id uuid not null,
  member_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profiles_organization_person_uq unique (organization_id, person_id),
  constraint staff_profiles_organization_id_id_uq unique (organization_id, id),
  constraint staff_profiles_person_fk foreign key (organization_id, person_id)
    references zaltyko.people (organization_id, id) on delete restrict,
  constraint staff_profiles_member_fk foreign key (organization_id, member_id)
    references zaltyko.organization_members (organization_id, id) on delete restrict
);

create table zaltyko.programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  discipline text not null check (btrim(discipline) <> ''),
  status zaltyko.lifecycle_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_organization_id_id_uq unique (organization_id, id)
);
create index programs_organization_status_idx
  on zaltyko.programs (organization_id, status);

create table zaltyko.groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  program_id uuid,
  name text not null check (btrim(name) <> ''),
  capacity integer check (capacity is null or capacity > 0),
  status zaltyko.lifecycle_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_organization_id_id_uq unique (organization_id, id),
  constraint groups_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint groups_program_fk foreign key (organization_id, program_id)
    references zaltyko.programs (organization_id, id) on delete restrict
);
create index groups_location_status_idx
  on zaltyko.groups (organization_id, location_id, status);

create table zaltyko.group_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  group_id uuid not null,
  athlete_id uuid not null,
  status zaltyko.group_membership_status not null default 'active',
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_memberships_dates_valid check (ends_on is null or ends_on >= starts_on),
  constraint group_memberships_group_fk foreign key (organization_id, group_id)
    references zaltyko.groups (organization_id, id) on delete cascade,
  constraint group_memberships_athlete_fk foreign key (organization_id, athlete_id)
    references zaltyko.athletes (organization_id, id) on delete cascade
);
create index group_memberships_group_idx
  on zaltyko.group_memberships (organization_id, group_id, status);
create index group_memberships_athlete_idx
  on zaltyko.group_memberships (organization_id, athlete_id, status);
create unique index group_memberships_open_uq
  on zaltyko.group_memberships (organization_id, group_id, athlete_id)
  where status in ('pending', 'active', 'paused');

create table zaltyko.class_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  program_id uuid,
  default_space_id uuid,
  name text not null check (btrim(name) <> ''),
  capacity integer not null check (capacity > 0),
  status zaltyko.lifecycle_status not null default 'draft',
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_templates_dates_valid
    check (effective_to is null or effective_to >= effective_from),
  constraint class_templates_organization_id_id_uq unique (organization_id, id),
  constraint class_templates_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint class_templates_program_fk foreign key (organization_id, program_id)
    references zaltyko.programs (organization_id, id) on delete restrict,
  constraint class_templates_space_fk foreign key (organization_id, default_space_id)
    references zaltyko.spaces (organization_id, id) on delete restrict
);
create index class_templates_location_status_idx
  on zaltyko.class_templates (organization_id, location_id, status);

create table zaltyko.class_template_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  class_template_id uuid not null,
  group_id uuid not null,
  constraint class_template_groups_uq
    unique (organization_id, class_template_id, group_id),
  constraint class_template_groups_template_fk foreign key (organization_id, class_template_id)
    references zaltyko.class_templates (organization_id, id) on delete cascade,
  constraint class_template_groups_group_fk foreign key (organization_id, group_id)
    references zaltyko.groups (organization_id, id) on delete cascade
);

create table zaltyko.class_template_weekdays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  class_template_id uuid not null,
  iso_weekday integer not null check (iso_weekday between 1 and 7),
  starts_at_local time not null,
  ends_at_local time not null,
  constraint class_template_weekdays_time_valid check (ends_at_local > starts_at_local),
  constraint class_template_weekdays_uq
    unique (organization_id, class_template_id, iso_weekday, starts_at_local),
  constraint class_template_weekdays_template_fk foreign key (organization_id, class_template_id)
    references zaltyko.class_templates (organization_id, id) on delete cascade
);

create table zaltyko.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  class_template_id uuid not null,
  space_id uuid,
  status zaltyko.session_status not null default 'scheduled',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity_override integer check (capacity_override is null or capacity_override > 0),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_time_valid check (ends_at > starts_at),
  constraint sessions_organization_id_id_uq unique (organization_id, id),
  constraint sessions_template_start_uq unique (organization_id, class_template_id, starts_at),
  constraint sessions_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint sessions_template_fk foreign key (organization_id, class_template_id)
    references zaltyko.class_templates (organization_id, id) on delete restrict,
  constraint sessions_space_fk foreign key (organization_id, space_id)
    references zaltyko.spaces (organization_id, id) on delete restrict
);
create index sessions_location_start_idx
  on zaltyko.sessions (organization_id, location_id, starts_at);

create table zaltyko.session_staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  session_id uuid not null,
  staff_profile_id uuid not null,
  assignment_role text not null default 'coach',
  constraint session_staff_uq unique (organization_id, session_id, staff_profile_id),
  constraint session_staff_session_fk foreign key (organization_id, session_id)
    references zaltyko.sessions (organization_id, id) on delete cascade,
  constraint session_staff_profile_fk foreign key (organization_id, staff_profile_id)
    references zaltyko.staff_profiles (organization_id, id) on delete restrict
);

create table zaltyko.price_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  cadence zaltyko.billing_cadence not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_plans_organization_id_id_uq unique (organization_id, id)
);

create table zaltyko.enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  athlete_id uuid not null,
  class_template_id uuid not null,
  price_plan_id uuid,
  status zaltyko.enrollment_status not null default 'pending',
  starts_on date not null,
  ends_on date,
  source zaltyko.enrollment_source not null,
  source_entity_id uuid,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollments_dates_valid check (ends_on is null or ends_on >= starts_on),
  constraint enrollments_organization_id_id_uq unique (organization_id, id),
  constraint enrollments_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint enrollments_athlete_fk foreign key (organization_id, athlete_id)
    references zaltyko.athletes (organization_id, id) on delete restrict,
  constraint enrollments_template_fk foreign key (organization_id, class_template_id)
    references zaltyko.class_templates (organization_id, id) on delete restrict,
  constraint enrollments_price_plan_fk foreign key (organization_id, price_plan_id)
    references zaltyko.price_plans (organization_id, id) on delete restrict
);
create index enrollments_class_status_idx
  on zaltyko.enrollments (organization_id, class_template_id, status);
create index enrollments_athlete_status_idx
  on zaltyko.enrollments (organization_id, athlete_id, status);
create unique index enrollments_open_uq
  on zaltyko.enrollments (organization_id, athlete_id, class_template_id)
  where status in ('pending', 'trial', 'active', 'paused');

create table zaltyko.enrollment_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  enrollment_id uuid not null,
  from_status zaltyko.enrollment_status,
  to_status zaltyko.enrollment_status not null,
  reason_code text,
  changed_by_member_id uuid,
  idempotency_key text not null,
  changed_at timestamptz not null default now(),
  constraint enrollment_status_history_idempotency_uq
    unique (organization_id, idempotency_key),
  constraint enrollment_status_history_enrollment_fk foreign key (organization_id, enrollment_id)
    references zaltyko.enrollments (organization_id, id) on delete cascade,
  constraint enrollment_status_history_member_fk foreign key (organization_id, changed_by_member_id)
    references zaltyko.organization_members (organization_id, id) on delete restrict
);
create index enrollment_status_history_enrollment_idx
  on zaltyko.enrollment_status_history (organization_id, enrollment_id, changed_at);

create table zaltyko.enrollment_pauses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  enrollment_id uuid not null,
  starts_on date not null,
  ends_on date,
  reason_code text,
  created_at timestamptz not null default now(),
  constraint enrollment_pauses_dates_valid check (ends_on is null or ends_on >= starts_on),
  constraint enrollment_pauses_enrollment_fk foreign key (organization_id, enrollment_id)
    references zaltyko.enrollments (organization_id, id) on delete cascade
);
create index enrollment_pauses_enrollment_idx
  on zaltyko.enrollment_pauses (organization_id, enrollment_id);

create table zaltyko.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  session_id uuid not null,
  enrollment_id uuid not null,
  athlete_id uuid not null,
  status zaltyko.attendance_status not null,
  recorded_by_member_id uuid,
  recorded_at timestamptz not null default now(),
  constraint attendance_records_session_enrollment_uq
    unique (organization_id, session_id, enrollment_id),
  constraint attendance_records_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint attendance_records_session_fk foreign key (organization_id, session_id)
    references zaltyko.sessions (organization_id, id) on delete cascade,
  constraint attendance_records_enrollment_fk foreign key (organization_id, enrollment_id)
    references zaltyko.enrollments (organization_id, id) on delete restrict,
  constraint attendance_records_athlete_fk foreign key (organization_id, athlete_id)
    references zaltyko.athletes (organization_id, id) on delete restrict,
  constraint attendance_records_member_fk foreign key (organization_id, recorded_by_member_id)
    references zaltyko.organization_members (organization_id, id) on delete restrict
);
create index attendance_records_athlete_idx
  on zaltyko.attendance_records (organization_id, athlete_id, recorded_at);

create table zaltyko.outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid,
  event_name text not null check (btrim(event_name) <> ''),
  event_version integer not null default 1 check (event_version > 0),
  aggregate_type text not null check (btrim(aggregate_type) <> ''),
  aggregate_id uuid not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  payload jsonb not null,
  status zaltyko.outbox_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  occurred_at timestamptz not null,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint outbox_events_idempotency_uq
    unique (organization_id, event_name, idempotency_key),
  constraint outbox_events_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict
);
create index outbox_events_dispatch_idx
  on zaltyko.outbox_events (status, available_at);

create table zaltyko.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete restrict,
  location_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (btrim(action) <> ''),
  target_type text not null check (btrim(target_type) <> ''),
  target_id uuid,
  request_id text,
  idempotency_key text,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_log_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict
);
create index audit_log_target_idx
  on zaltyko.audit_log (organization_id, target_type, target_id);
create index audit_log_created_idx
  on zaltyko.audit_log (organization_id, created_at);
create unique index audit_log_idempotency_uq
  on zaltyko.audit_log (organization_id, idempotency_key)
  where idempotency_key is not null;

comment on table zaltyko.group_memberships is
  'Canonical many-to-many athlete-to-group membership; athletes never own a singular group_id.';
comment on table zaltyko.enrollments is
  'Canonical dated athlete-to-class-template enrollment used by capacity, retention and revenue attribution.';
comment on table zaltyko.outbox_events is
  'Transactional outbox. Payloads must contain operational identifiers and states, never minor PII or medical data.';
comment on table zaltyko.audit_log is
  'Append-only audit trail for sensitive actions.';

create or replace function zaltyko_private.has_organization_access(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from zaltyko.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  )
$$;

create or replace function zaltyko_private.has_location_access(
  target_organization_id uuid,
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from zaltyko.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        member.location_scope_mode = 'all'
        or exists (
          select 1
          from zaltyko.member_location_scopes scope
          where scope.organization_id = member.organization_id
            and scope.member_id = member.id
            and scope.location_id = target_location_id
        )
      )
  )
$$;

revoke all on function zaltyko_private.has_organization_access(uuid) from public;
revoke all on function zaltyko_private.has_location_access(uuid, uuid) from public;
grant execute on function zaltyko_private.has_organization_access(uuid)
  to authenticated, service_role;
grant execute on function zaltyko_private.has_location_access(uuid, uuid)
  to authenticated, service_role;

create or replace function zaltyko_private.reject_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'zaltyko.audit_log is append-only' using errcode = '55000';
end
$$;
revoke all on function zaltyko_private.reject_audit_mutation() from public;

create trigger audit_log_immutable
before update or delete on zaltyko.audit_log
for each row execute function zaltyko_private.reject_audit_mutation();

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'organizations', 'locations', 'facilities', 'spaces',
    'organization_members', 'member_location_scopes', 'people', 'athletes',
    'staff_profiles', 'programs', 'groups', 'group_memberships',
    'class_templates', 'class_template_groups', 'class_template_weekdays',
    'sessions', 'session_staff', 'price_plans', 'enrollments',
    'enrollment_status_history', 'enrollment_pauses', 'attendance_records',
    'outbox_events', 'audit_log'
  ]
  loop
    execute format('alter table zaltyko.%I enable row level security', target_table);
    execute format('alter table zaltyko.%I force row level security', target_table);
  end loop;
end
$$;

create policy organizations_select_member on zaltyko.organizations
for select to authenticated
using ((select zaltyko_private.has_organization_access(id)));

create policy organization_members_select_self on zaltyko.organization_members
for select to authenticated
using (user_id = (select auth.uid()) and status = 'active');

create policy member_location_scopes_select_self on zaltyko.member_location_scopes
for select to authenticated
using (
  exists (
    select 1
    from zaltyko.organization_members member
    where member.id = member_location_scopes.member_id
      and member.organization_id = member_location_scopes.organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

create policy locations_select_scoped on zaltyko.locations
for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, id)));

create policy facilities_select_scoped on zaltyko.facilities
for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, location_id)));

create policy spaces_select_scoped on zaltyko.spaces
for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, location_id)));

create policy groups_select_scoped on zaltyko.groups
for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, location_id)));

create policy class_templates_select_scoped on zaltyko.class_templates
for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, location_id)));

create policy sessions_select_scoped on zaltyko.sessions
for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, location_id)));

create policy programs_select_member on zaltyko.programs
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));

create policy class_template_groups_select_member on zaltyko.class_template_groups
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));

create policy class_template_weekdays_select_member on zaltyko.class_template_weekdays
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));

create policy session_staff_select_member on zaltyko.session_staff
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));

create policy price_plans_select_member on zaltyko.price_plans
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));

-- Sensitive and worker-only tables remain default-deny at Data API level. The
-- policies below are defense in depth for future explicit grants; current app
-- access must go through server authorization and organization-scoped queries.
create policy people_select_member on zaltyko.people
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy athletes_select_member on zaltyko.athletes
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy staff_profiles_select_member on zaltyko.staff_profiles
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy group_memberships_select_member on zaltyko.group_memberships
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy enrollments_select_member on zaltyko.enrollments
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy enrollment_status_history_select_member on zaltyko.enrollment_status_history
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy enrollment_pauses_select_member on zaltyko.enrollment_pauses
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy attendance_records_select_member on zaltyko.attendance_records
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));

revoke all on all tables in schema zaltyko from anon, authenticated;
revoke all on all sequences in schema zaltyko from anon, authenticated;

grant select on table
  zaltyko.organizations,
  zaltyko.locations,
  zaltyko.facilities,
  zaltyko.spaces,
  zaltyko.organization_members,
  zaltyko.member_location_scopes,
  zaltyko.programs,
  zaltyko.groups,
  zaltyko.class_templates,
  zaltyko.class_template_groups,
  zaltyko.class_template_weekdays,
  zaltyko.sessions,
  zaltyko.session_staff,
  zaltyko.price_plans
to authenticated;

grant all privileges on all tables in schema zaltyko to service_role;
grant all privileges on all sequences in schema zaltyko to service_role;
alter default privileges in schema zaltyko
  grant all privileges on tables to service_role;
alter default privileges in schema zaltyko
  grant all privileges on sequences to service_role;

commit;
