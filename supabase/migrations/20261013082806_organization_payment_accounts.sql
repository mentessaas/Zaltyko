begin;

create type zaltyko.stripe_environment as enum ('test', 'live');

create type zaltyko.organization_payment_account_status as enum (
  'pending', 'onboarding', 'restricted', 'active', 'disabled'
);

-- The academy's merchant account is distinct from the Stripe account that
-- collects Zaltyko's own SaaS subscription.
create table zaltyko.organization_payment_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references zaltyko.organizations(id) on delete restrict,
  processor text not null default 'stripe'
    check (processor = 'stripe'),
  environment zaltyko.stripe_environment not null,
  provider_account_reference text not null
    check (provider_account_reference ~ '^acct_[A-Za-z0-9]+$'),
  accounts_api_generation integer not null default 2
    check (accounts_api_generation = 2),
  charge_model text not null default 'direct'
    check (charge_model = 'direct'),
  dashboard_access text not null default 'full'
    check (dashboard_access = 'full'),
  fees_collector text not null default 'stripe'
    check (fees_collector = 'stripe'),
  losses_collector text not null default 'stripe'
    check (losses_collector = 'stripe'),
  status zaltyko.organization_payment_account_status not null default 'pending',
  card_payments_capability_status text not null default 'pending'
    check (btrim(card_payments_capability_status) <> ''),
  revision integer not null default 1 check (revision > 0),
  last_provider_event_reference text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_payment_provider_accounts_organization_id_id_uq
    unique (organization_id, id),
  constraint organization_payment_provider_accounts_org_processor_env_uq
    unique (organization_id, processor, environment),
  constraint organization_payment_provider_accounts_provider_reference_uq
    unique (processor, environment, provider_account_reference)
);

create index organization_payment_provider_accounts_collection_ready_idx
  on zaltyko.organization_payment_provider_accounts
    (organization_id, environment, status, card_payments_capability_status);

alter table zaltyko.organization_payment_provider_accounts
  enable row level security;
alter table zaltyko.organization_payment_provider_accounts
  force row level security;
revoke all on table zaltyko.organization_payment_provider_accounts
  from public, anon, authenticated, service_role;
grant select, insert, update
  on table zaltyko.organization_payment_provider_accounts
  to service_role;

comment on table zaltyko.organization_payment_provider_accounts is
  'Server-only Connect account projection for academy direct charges; contains no secrets or family payment credentials.';
comment on column zaltyko.organization_payment_provider_accounts.provider_account_reference is
  'Opaque Stripe connected-account ID; never an API credential.';
comment on column zaltyko.organization_payment_provider_accounts.card_payments_capability_status is
  'Latest server-synced merchant card_payments capability status; charging requires the exact value active.';

commit;
