-- CANDIDATE ONLY: hosted application requires separate explicit approval.
-- Contains no operational/business rows, provider setup or scheduled jobs.
begin;

create table zaltyko.product_discovery_interests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  member_id uuid not null,
  location_id uuid,
  scope_key text not null,
  feature_id text not null,
  intent text not null,
  pilot boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint product_discovery_interests_scope_uq unique (organization_id, member_id, scope_key, feature_id),
  constraint product_discovery_interests_member_fk foreign key (organization_id, member_id)
    references zaltyko.organization_members(organization_id, id) on delete cascade,
  constraint product_discovery_interests_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations(organization_id, id) on delete cascade,
  constraint product_discovery_interests_scope_valid check (
    (location_id is null and scope_key = 'organization') or
    (location_id is not null and scope_key = location_id::text)
  ),
  constraint product_discovery_interests_intent_valid check (
    (feature_id = 'club-events' and intent in ('organize','participate')) or
    (feature_id = 'club-acquisition' and intent in ('capture','convert')) or
    (feature_id = 'sport-progression' and intent in ('plan','track'))
  )
);

create table zaltyko.product_discovery_signals (
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  feature_id text not null,
  catalog_version text not null,
  signal text not null,
  first_seen_at timestamptz not null default now(),
  primary key (organization_id, feature_id, catalog_version, signal),
  constraint product_discovery_signals_feature_valid check (feature_id in ('club-events','club-acquisition','sport-progression')),
  constraint product_discovery_signals_signal_valid check (signal in ('exposure','open')),
  constraint product_discovery_signals_version_valid check (catalog_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-v[0-9]+$')
);

alter table zaltyko.product_discovery_interests enable row level security;
alter table zaltyko.product_discovery_interests force row level security;
alter table zaltyko.product_discovery_signals enable row level security;
alter table zaltyko.product_discovery_signals force row level security;
-- Only the server may read/write after canonical membership/site validation.
-- Direct Auth REST access, including another academy's owner, is denied.
create policy product_discovery_interests_service on zaltyko.product_discovery_interests
  for all to service_role using (true) with check (true);
create policy product_discovery_signals_service on zaltyko.product_discovery_signals
  for all to service_role using (true) with check (true);
revoke all on zaltyko.product_discovery_interests, zaltyko.product_discovery_signals from public, anon, authenticated;
-- Foundation default privileges may otherwise leave additive UPDATE/TRUNCATE
-- grants in place even when this candidate declares a narrower grant below.
revoke all on zaltyko.product_discovery_interests, zaltyko.product_discovery_signals from service_role;
grant select, insert, update, delete on zaltyko.product_discovery_interests to service_role;
grant select, insert, delete on zaltyko.product_discovery_signals to service_role;

comment on table zaltyko.product_discovery_interests is
  'Structured current interest by academy member and authorized site. Withdrawal deletes the row. No marketing consent or automatic communications.';
comment on table zaltyko.product_discovery_signals is
  'Deduplicated academy funnel stages; no account, IP, child or free-text payload. Not operational records or a metrics worker queue.';

commit;
