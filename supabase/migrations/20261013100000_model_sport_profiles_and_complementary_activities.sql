begin;

create type zaltyko.sport_profile_status as enum (
  'identity_only', 'verified', 'draft', 'retired'
);
create type zaltyko.organization_sport_role as enum ('primary', 'additional');
create type zaltyko.organization_sport_status as enum ('active', 'inactive');
create type zaltyko.program_kind as enum (
  'gymnastics_sport', 'complementary_activity'
);

alter table zaltyko.organizations
  add constraint organizations_id_country_uq unique (id, country_code);

create table zaltyko.sport_profiles (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  discipline_key text not null check (discipline_key ~ '^[a-z][a-z0-9_]{1,47}$'),
  federation_code text not null default 'unconfigured'
    check (federation_code ~ '^[a-z][a-z0-9_-]{1,47}$'),
  profile_version text not null check (btrim(profile_version) <> ''),
  status zaltyko.sport_profile_status not null default 'identity_only',
  configuration_schema_version integer not null default 1
    check (configuration_schema_version > 0),
  configuration jsonb not null default '{}'::jsonb,
  source_title text,
  source_url text check (source_url is null or source_url ~ '^https://'),
  source_verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sport_profiles_country_id_uq unique (country_code, id),
  constraint sport_profiles_version_uq unique (
    country_code, discipline_key, federation_code, profile_version
  ),
  constraint sport_profiles_verified_source_required check (
    status <> 'verified' or (
      source_title is not null and source_url is not null and source_verified_at is not null
    )
  ),
  constraint sport_profiles_identity_only_empty check (
    status <> 'identity_only' or configuration = '{}'::jsonb
  )
);

comment on table zaltyko.sport_profiles is
  'Country/federation-specific, versioned sport context. Identity-only entries contain no inferred rules.';

-- These rows identify the launch disciplines only. They intentionally contain
-- no categories, levels, apparatus rules, or federation requirements.
insert into zaltyko.sport_profiles (
  id, country_code, discipline_key, federation_code, profile_version,
  status, configuration_schema_version, configuration
) values
  (
    '70000000-0000-4000-8000-000000000001', 'ES', 'artistic',
    'unconfigured', 'identity-v1', 'identity_only', 1, '{}'::jsonb
  ),
  (
    '70000000-0000-4000-8000-000000000002', 'ES', 'rhythmic',
    'unconfigured', 'identity-v1', 'identity_only', 1, '{}'::jsonb
  );

create table zaltyko.organization_sports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  country_code text not null,
  sport_profile_id uuid not null,
  role zaltyko.organization_sport_role not null,
  status zaltyko.organization_sport_status not null default 'active',
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_sports_organization_id_id_uq unique (organization_id, id),
  constraint organization_sports_country_fk foreign key (organization_id, country_code)
    references zaltyko.organizations (id, country_code) on delete cascade,
  constraint organization_sports_profile_fk foreign key (country_code, sport_profile_id)
    references zaltyko.sport_profiles (country_code, id) on delete restrict,
  constraint organization_sports_dates_valid check (ends_on is null or ends_on >= starts_on)
);

create unique index organization_sports_active_profile_uq
  on zaltyko.organization_sports (organization_id, sport_profile_id)
  where status = 'active';
create unique index organization_sports_primary_active_uq
  on zaltyko.organization_sports (organization_id)
  where role = 'primary' and status = 'active';
create index organization_sports_profile_idx
  on zaltyko.organization_sports (country_code, sport_profile_id);

comment on table zaltyko.organization_sports is
  'M:N organization-to-sport specialties, with at most one active primary specialty.';

do $$
begin
  if exists (select 1 from zaltyko.programs) then
    raise exception 'Sport model migration requires an empty greenfield zaltyko.programs table';
  end if;
end;
$$;

alter table zaltyko.programs
  drop column discipline,
  add column kind zaltyko.program_kind not null,
  add column organization_sport_id uuid,
  add column activity_key text;

alter table zaltyko.programs
  add constraint programs_organization_sport_fk
    foreign key (organization_id, organization_sport_id)
    references zaltyko.organization_sports (organization_id, id) on delete restrict,
  add constraint programs_classification_valid check (
    (kind = 'gymnastics_sport' and organization_sport_id is not null and activity_key is null)
    or
    (kind = 'complementary_activity' and organization_sport_id is null
      and activity_key is not null and btrim(activity_key) <> '')
  ),
  add constraint programs_activity_key_format check (
    activity_key is null or activity_key ~ '^[a-z][a-z0-9_]{1,47}$'
  );

create index programs_organization_sport_idx
  on zaltyko.programs (organization_id, organization_sport_id)
  where organization_sport_id is not null;
create index programs_organization_activity_idx
  on zaltyko.programs (organization_id, activity_key)
  where activity_key is not null;

alter table zaltyko.sport_profiles enable row level security;
alter table zaltyko.sport_profiles force row level security;
alter table zaltyko.organization_sports enable row level security;
alter table zaltyko.organization_sports force row level security;

create policy sport_profiles_select_catalog on zaltyko.sport_profiles
for select to authenticated using (true);
create policy organization_sports_select_member on zaltyko.organization_sports
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));

revoke all on zaltyko.sport_profiles, zaltyko.organization_sports
  from public, anon, authenticated;
grant all privileges on zaltyko.sport_profiles, zaltyko.organization_sports
  to service_role;

commit;
