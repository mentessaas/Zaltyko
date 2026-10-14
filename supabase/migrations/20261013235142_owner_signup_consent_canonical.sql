begin;

grant usage on schema zaltyko to authenticated, service_role;

create table zaltyko.owner_signup_consent_policy (
  singleton boolean primary key default true check (singleton = true),
  policy_version text not null
    check (policy_version ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  rollout_at timestamptz not null default clock_timestamp()
);
insert into zaltyko.owner_signup_consent_policy (singleton, policy_version)
values (true, 'v1-2026-08-01');
alter table zaltyko.owner_signup_consent_policy enable row level security;
alter table zaltyko.owner_signup_consent_policy force row level security;

create table zaltyko.owner_signup_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'granted' check (state in ('granted', 'revoked')),
  policy_version text not null
    check (policy_version ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  source text not null check (source in ('signup', 'setup')),
  consent_proof text not null
    check (consent_proof ~ '^(signup|setup):[a-zA-Z0-9_-]{1,128}$'),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index owner_signup_consents_policy_version_idx
  on zaltyko.owner_signup_consents (policy_version);

create table zaltyko.owner_signup_consent_audits (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately no Auth FK: audit history survives status/Auth row deletion.
  user_id uuid not null,
  event text not null default 'grant' check (event in ('grant', 're_grant')),
  policy_version text not null
    check (policy_version ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  source text not null check (source in ('signup', 'setup')),
  consent_proof text not null
    check (consent_proof ~ '^(signup|setup):[a-zA-Z0-9_-]{1,128}$'),
  recorded_at timestamptz not null default now()
);
create index owner_signup_consent_audits_user_recorded_idx
  on zaltyko.owner_signup_consent_audits (user_id, recorded_at);

create function zaltyko.reject_owner_signup_consent_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'owner signup consent audit is append-only';
end;
$$;
revoke all on function zaltyko.reject_owner_signup_consent_audit_mutation()
  from public, anon, authenticated;
create trigger owner_signup_consent_audit_append_only
  before update or delete on zaltyko.owner_signup_consent_audits
  for each row execute function zaltyko.reject_owner_signup_consent_audit_mutation();
create trigger owner_signup_consent_audit_no_truncate
  before truncate on zaltyko.owner_signup_consent_audits
  for each statement execute function zaltyko.reject_owner_signup_consent_audit_mutation();

alter table zaltyko.owner_signup_consents enable row level security;
alter table zaltyko.owner_signup_consents force row level security;
create policy owner_signup_consents_self_read
  on zaltyko.owner_signup_consents for select to authenticated
  using (user_id = (select auth.uid()));

alter table zaltyko.owner_signup_consent_audits enable row level security;
alter table zaltyko.owner_signup_consent_audits force row level security;
create policy owner_signup_consent_audits_self_read
  on zaltyko.owner_signup_consent_audits for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on zaltyko.owner_signup_consent_policy,
  zaltyko.owner_signup_consents,
  zaltyko.owner_signup_consent_audits from public, anon, authenticated, service_role;
grant select on zaltyko.owner_signup_consents,
  zaltyko.owner_signup_consent_audits to authenticated;
grant select on zaltyko.owner_signup_consent_policy to service_role;
grant select, insert, update on zaltyko.owner_signup_consents to service_role;
grant select, insert on zaltyko.owner_signup_consent_audits to service_role;

commit;
