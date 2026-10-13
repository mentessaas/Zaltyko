begin;

create type zaltyko.saas_plan_code as enum ('free', 'starter', 'growth', 'network');
create type zaltyko.entitlement_source as enum ('bootstrap', 'stripe_subscription', 'contract');
create type zaltyko.saas_billing_interval as enum ('month', 'year');
create type zaltyko.family_collection_mode as enum ('manual', 'automatic');
create type zaltyko.payment_authorization_status as enum (
  'pending', 'active', 'revoked', 'expired'
);

-- Current provider projection for the academy's Zaltyko subscription. It is
-- deliberately separate from Stripe Connect and from family-facing charges.
create table zaltyko.organization_saas_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references zaltyko.organizations(id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  environment zaltyko.stripe_environment not null,
  provider_account_reference text not null check (btrim(provider_account_reference) <> ''),
  customer_reference text not null check (btrim(customer_reference) <> ''),
  subscription_reference text not null check (btrim(subscription_reference) <> ''),
  price_reference text not null check (btrim(price_reference) <> ''),
  plan_code zaltyko.saas_plan_code not null
    check (plan_code in ('starter', 'growth', 'network')),
  provider_status text not null check (provider_status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due',
    'canceled', 'unpaid', 'paused'
  )),
  billing_interval zaltyko.saas_billing_interval not null,
  current_period_started_at timestamptz not null,
  current_period_ends_at timestamptz not null,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  last_provider_event_reference text,
  last_synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_saas_subscriptions_organization_id_id_uq
    unique (organization_id, id),
  constraint organization_saas_subscriptions_provider_reference_uq
    unique (environment, provider_account_reference, subscription_reference),
  constraint organization_saas_subscriptions_period_valid
    check (current_period_ends_at > current_period_started_at),
  constraint organization_saas_subscriptions_event_reference_valid
    check (last_provider_event_reference is null or btrim(last_provider_event_reference) <> '')
);
create unique index organization_saas_subscriptions_organization_uq
  on zaltyko.organization_saas_subscriptions (organization_id);
create index organization_saas_subscriptions_status_idx
  on zaltyko.organization_saas_subscriptions
    (organization_id, provider_status, current_period_ends_at);

-- One server-owned current entitlement projection. New organizations receive
-- Free; old organizations without a projection fail closed and are not inferred.
create table zaltyko.organization_entitlements (
  organization_id uuid primary key
    references zaltyko.organizations(id) on delete cascade,
  plan_code zaltyko.saas_plan_code not null,
  revision integer not null default 1 check (revision > 0),
  source zaltyko.entitlement_source not null,
  source_reference text not null check (btrim(source_reference) <> ''),
  subscription_id uuid,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_entitlements_period_valid
    check (effective_until is null or effective_until > effective_from),
  constraint organization_entitlements_source_valid check (
    (source = 'bootstrap' and plan_code = 'free' and subscription_id is null)
    or (source = 'stripe_subscription' and plan_code <> 'free' and subscription_id is not null)
    or (source = 'contract' and subscription_id is null)
  ),
  constraint organization_entitlements_subscription_fk
    foreign key (organization_id, subscription_id)
    references zaltyko.organization_saas_subscriptions (organization_id, id)
    on delete restrict
);

create table zaltyko.organization_entitlement_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references zaltyko.organizations(id) on delete cascade,
  revision integer not null check (revision > 0),
  plan_code zaltyko.saas_plan_code not null,
  source zaltyko.entitlement_source not null,
  source_reference text not null check (btrim(source_reference) <> ''),
  subscription_id uuid,
  effective_from timestamptz not null,
  effective_until timestamptz,
  changed_at timestamptz not null default now(),
  constraint organization_entitlement_changes_revision_uq
    unique (organization_id, revision),
  constraint organization_entitlement_changes_snapshot_uq
    unique (organization_id, id),
  constraint organization_entitlement_changes_period_valid
    check (effective_until is null or effective_until > effective_from),
  constraint organization_entitlement_changes_subscription_fk
    foreign key (organization_id, subscription_id)
    references zaltyko.organization_saas_subscriptions (organization_id, id)
    on delete restrict
);
create index organization_entitlement_changes_history_idx
  on zaltyko.organization_entitlement_changes (organization_id, revision desc);

create function zaltyko.guard_entitlement_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, zaltyko
as $$
begin
  if row(new.plan_code, new.source, new.source_reference, new.subscription_id,
         new.effective_from, new.effective_until)
     is distinct from
     row(old.plan_code, old.source, old.source_reference, old.subscription_id,
         old.effective_from, old.effective_until) then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create function zaltyko.record_entitlement_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, zaltyko
as $$
begin
  if tg_op = 'UPDATE' and new.revision = old.revision then
    return new;
  end if;
  insert into zaltyko.organization_entitlement_changes (
    organization_id, revision, plan_code, source, source_reference,
    subscription_id, effective_from, effective_until, changed_at
  ) values (
    new.organization_id, new.revision, new.plan_code, new.source,
    new.source_reference, new.subscription_id, new.effective_from,
    new.effective_until, new.updated_at
  );
  return new;
end;
$$;

create function zaltyko.reject_entitlement_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, zaltyko
as $$
begin
  raise exception 'organization_entitlement_changes is append-only'
    using errcode = '55000';
end;
$$;

create function zaltyko.seed_free_entitlement()
returns trigger
language plpgsql
set search_path = pg_catalog, zaltyko
as $$
begin
  insert into zaltyko.organization_entitlements (
    organization_id, plan_code, revision, source, source_reference,
    effective_from, created_at, updated_at
  ) values (
    new.id, 'free', 1, 'bootstrap', 'organization-created:' || new.id::text,
    new.created_at, new.created_at, new.created_at
  );
  return new;
end;
$$;

create trigger organization_entitlements_revision_guard
before update on zaltyko.organization_entitlements
for each row execute function zaltyko.guard_entitlement_revision();
create trigger organization_entitlements_revision_history
after insert or update on zaltyko.organization_entitlements
for each row execute function zaltyko.record_entitlement_revision();
create trigger organization_entitlement_changes_append_only
before update or delete on zaltyko.organization_entitlement_changes
for each row execute function zaltyko.reject_entitlement_history_mutation();
create trigger organizations_seed_free_entitlement
after insert on zaltyko.organizations
for each row execute function zaltyko.seed_free_entitlement();

create table zaltyko.family_collection_preferences (
  organization_id uuid not null
    references zaltyko.organizations(id) on delete cascade,
  family_id uuid not null,
  requested_mode zaltyko.family_collection_mode not null default 'manual',
  version integer not null default 1 check (version > 0),
  entitlement_revision integer,
  updated_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, family_id),
  constraint family_collection_preferences_entitlement_revision_positive
    check (entitlement_revision is null or entitlement_revision > 0),
  constraint family_collection_preferences_family_fk
    foreign key (organization_id, family_id)
    references zaltyko.families (organization_id, id) on delete cascade,
  constraint family_collection_preferences_member_fk
    foreign key (organization_id, updated_by_member_id)
    references zaltyko.organization_members (organization_id, id) on delete restrict
);
create index family_collection_preferences_mode_idx
  on zaltyko.family_collection_preferences
    (organization_id, requested_mode, entitlement_revision);

-- Existing charges remain manual. New invoice issuance snapshots only an
-- eligible, current family preference; this field never starts a payment.
alter table zaltyko.charges
  add column collection_mode zaltyko.family_collection_mode not null default 'manual';

-- Restricted provider/consent references only: no card, bank, or raw identity data.
create table zaltyko.family_payment_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references zaltyko.organizations(id) on delete cascade,
  family_id uuid not null,
  family_payer_id uuid not null,
  payment_provider_account_id uuid not null,
  status zaltyko.payment_authorization_status not null default 'pending',
  provider_setup_reference text not null
    check (btrim(provider_setup_reference) <> ''),
  payment_method_reference text not null check (btrim(payment_method_reference) <> ''),
  mandate_reference text check (
    mandate_reference is null or btrim(mandate_reference) <> ''
  ),
  consent_version text,
  consent_evidence_reference text check (
    consent_evidence_reference is null or btrim(consent_evidence_reference) <> ''
  ),
  consent_evidence_sha256 text check (
    consent_evidence_sha256 is null or consent_evidence_sha256 ~ '^[a-f0-9]{64}$'
  ),
  consented_at timestamptz,
  consented_by_guardian_id uuid,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_payment_authorizations_organization_id_id_uq
    unique (organization_id, id),
  constraint family_payment_authorizations_setup_uq
    unique (organization_id, payment_provider_account_id, provider_setup_reference),
  constraint family_payment_authorizations_active_consent_valid check (
    status <> 'active' or (
      consent_version is not null and btrim(consent_version) <> ''
      and consent_evidence_reference is not null
      and consent_evidence_sha256 is not null
      and consented_at is not null
      and consented_by_guardian_id is not null
      and (valid_until is null or valid_until > consented_at)
      and revoked_at is null
    )
  ),
  constraint family_payment_authorizations_revocation_valid check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked' and revoked_at is null)
  ),
  constraint family_payment_authorizations_payer_fk
    foreign key (organization_id, family_id, family_payer_id)
    references zaltyko.family_payers (organization_id, family_id, id) on delete restrict,
  constraint family_payment_authorizations_provider_account_fk
    foreign key (organization_id, payment_provider_account_id)
    references zaltyko.organization_payment_provider_accounts
      (organization_id, id) on delete restrict,
  constraint family_payment_authorizations_guardian_fk
    foreign key (organization_id, family_id, consented_by_guardian_id)
    references zaltyko.family_guardians (organization_id, family_id, guardian_id) on delete restrict
);
create unique index family_payment_authorizations_active_method_uq
  on zaltyko.family_payment_authorizations
    (organization_id, payment_provider_account_id, family_payer_id)
  where status = 'active';
create index family_payment_authorizations_payer_status_idx
  on zaltyko.family_payment_authorizations
    (organization_id, family_id, family_payer_id, status, valid_until);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'organization_saas_subscriptions', 'organization_entitlements',
    'organization_entitlement_changes', 'family_collection_preferences',
    'family_payment_authorizations'
  ]
  loop
    execute format('alter table zaltyko.%I enable row level security', target_table);
    execute format('alter table zaltyko.%I force row level security', target_table);
  end loop;
end
$$;

revoke all on table
  zaltyko.organization_saas_subscriptions,
  zaltyko.organization_entitlements,
  zaltyko.organization_entitlement_changes,
  zaltyko.family_collection_preferences,
  zaltyko.family_payment_authorizations
from public, anon, authenticated;
revoke all on table
  zaltyko.organization_saas_subscriptions,
  zaltyko.organization_entitlements,
  zaltyko.organization_entitlement_changes,
  zaltyko.family_collection_preferences,
  zaltyko.family_payment_authorizations
from service_role;
grant select, insert, update on table
  zaltyko.organization_saas_subscriptions,
  zaltyko.organization_entitlements,
  zaltyko.family_collection_preferences,
  zaltyko.family_payment_authorizations
to service_role;
grant select, insert on table zaltyko.organization_entitlement_changes to service_role;
revoke all on function zaltyko.guard_entitlement_revision() from public, anon, authenticated;
revoke all on function zaltyko.record_entitlement_revision() from public, anon, authenticated;
revoke all on function zaltyko.reject_entitlement_history_mutation() from public, anon, authenticated;
revoke all on function zaltyko.seed_free_entitlement() from public, anon, authenticated;

comment on table zaltyko.organization_saas_subscriptions is
  'Current Stripe subscription projection for Zaltyko SaaS; no secrets, webhook processing, or family charge credentials.';
comment on table zaltyko.organization_entitlements is
  'Server-owned effective plan snapshot. Missing or stale state denies paid capabilities.';
comment on table zaltyko.organization_entitlement_changes is
  'Append-only entitlement revisions used for audit and preference invalidation.';
comment on table zaltyko.family_collection_preferences is
  'Per-family requested collection mode only. It is not payer consent or an instruction to initiate payment.';
comment on table zaltyko.family_payment_authorizations is
  'Reserved server-only model bound to one organization payment account and verifiable payer consent; not operational in this release.';
comment on column zaltyko.charges.collection_mode is
  'Collection-mode snapshot fixed at charge creation; defaults to manual and is not changed by later preference updates.';

commit;
