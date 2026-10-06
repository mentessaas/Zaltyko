begin;

create type zaltyko.invoice_status as enum (
  'draft', 'issued', 'partially_paid', 'paid', 'void'
);
create type zaltyko.charge_status as enum (
  'due', 'partially_paid', 'paid', 'void'
);
create type zaltyko.payment_status as enum (
  'pending', 'succeeded', 'partially_refunded', 'refunded', 'failed'
);
create type zaltyko.payment_attempt_status as enum (
  'pending', 'succeeded', 'failed'
);
create type zaltyko.refund_status as enum (
  'pending', 'succeeded', 'failed'
);
create type zaltyko.provider_environment as enum ('sandbox', 'live');
create type zaltyko.provider_event_status as enum (
  'received', 'processing', 'processed', 'failed'
);
create type zaltyko.reconciliation_status as enum ('balanced', 'unbalanced');

create unique index family_payers_organization_id_id_uq
  on zaltyko.family_payers (organization_id, id);
create unique index family_payers_organization_family_id_uq
  on zaltyko.family_payers (organization_id, family_id, id);

create table zaltyko.enrollment_price_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  enrollment_id uuid not null,
  price_plan_id uuid not null,
  unit_amount_cents bigint not null check (unit_amount_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollment_price_assignments_dates_valid
    check (ends_on is null or ends_on >= starts_on),
  constraint enrollment_price_assignments_organization_id_id_uq
    unique (organization_id, id),
  constraint enrollment_price_assignments_enrollment_fk
    foreign key (organization_id, location_id, enrollment_id)
    references zaltyko.enrollments (organization_id, location_id, id) on delete restrict,
  constraint enrollment_price_assignments_plan_fk
    foreign key (organization_id, price_plan_id)
    references zaltyko.price_plans (organization_id, id) on delete restrict
);
create unique index enrollment_price_assignments_one_open_uq
  on zaltyko.enrollment_price_assignments (organization_id, enrollment_id)
  where ends_on is null;
create index enrollment_price_assignments_period_idx
  on zaltyko.enrollment_price_assignments (organization_id, enrollment_id, starts_on, ends_on);

create table zaltyko.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid,
  family_id uuid not null,
  family_payer_id uuid,
  reference text not null check (btrim(reference) <> ''),
  status zaltyko.invoice_status not null default 'draft',
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_amount_cents bigint not null check (total_amount_cents >= 0),
  issued_at timestamptz,
  due_at timestamptz not null,
  voided_at timestamptz,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_reference_uq unique (organization_id, reference),
  constraint invoices_idempotency_uq unique (organization_id, idempotency_key),
  constraint invoices_organization_id_id_uq unique (organization_id, id),
  constraint invoices_organization_id_currency_uq unique (organization_id, id, currency),
  constraint invoices_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint invoices_family_fk foreign key (organization_id, family_id)
    references zaltyko.families (organization_id, id) on delete restrict,
  constraint invoices_family_payer_fk
    foreign key (organization_id, family_id, family_payer_id)
    references zaltyko.family_payers (organization_id, family_id, id) on delete restrict
);
create index invoices_due_status_idx
  on zaltyko.invoices (organization_id, status, due_at);

create table zaltyko.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  invoice_id uuid not null,
  enrollment_id uuid,
  price_plan_id uuid,
  line_type text not null check (btrim(line_type) <> ''),
  quantity integer not null check (quantity > 0),
  unit_amount_cents bigint not null check (unit_amount_cents >= 0),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  service_period_start date not null,
  service_period_end date not null,
  created_at timestamptz not null default now(),
  constraint invoice_lines_period_valid
    check (service_period_end >= service_period_start),
  constraint invoice_lines_amount_valid
    check (amount_cents = quantity::bigint * unit_amount_cents),
  constraint invoice_lines_organization_id_id_uq unique (organization_id, id),
  constraint invoice_lines_organization_id_currency_uq unique (organization_id, id, currency),
  constraint invoice_lines_invoice_fk
    foreign key (organization_id, invoice_id, currency)
    references zaltyko.invoices (organization_id, id, currency) on delete cascade,
  constraint invoice_lines_enrollment_fk foreign key (organization_id, enrollment_id)
    references zaltyko.enrollments (organization_id, id) on delete restrict,
  constraint invoice_lines_price_plan_fk foreign key (organization_id, price_plan_id)
    references zaltyko.price_plans (organization_id, id) on delete restrict
);
create index invoice_lines_invoice_idx on zaltyko.invoice_lines (organization_id, invoice_id);

create table zaltyko.charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid,
  invoice_id uuid not null,
  invoice_line_id uuid not null,
  family_id uuid not null,
  family_payer_id uuid,
  enrollment_id uuid,
  status zaltyko.charge_status not null default 'due',
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  due_at timestamptz not null,
  service_period_start date not null,
  service_period_end date not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint charges_period_valid check (service_period_end >= service_period_start),
  constraint charges_invoice_line_uq unique (organization_id, invoice_line_id),
  constraint charges_idempotency_uq unique (organization_id, idempotency_key),
  constraint charges_organization_id_id_uq unique (organization_id, id),
  constraint charges_organization_id_currency_uq unique (organization_id, id, currency),
  constraint charges_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint charges_invoice_fk foreign key (organization_id, invoice_id, currency)
    references zaltyko.invoices (organization_id, id, currency) on delete restrict,
  constraint charges_invoice_line_fk foreign key (organization_id, invoice_line_id, currency)
    references zaltyko.invoice_lines (organization_id, id, currency) on delete restrict,
  constraint charges_family_fk foreign key (organization_id, family_id)
    references zaltyko.families (organization_id, id) on delete restrict,
  constraint charges_family_payer_fk
    foreign key (organization_id, family_id, family_payer_id)
    references zaltyko.family_payers (organization_id, family_id, id) on delete restrict,
  constraint charges_enrollment_fk foreign key (organization_id, enrollment_id)
    references zaltyko.enrollments (organization_id, id) on delete restrict
);
create index charges_due_status_idx
  on zaltyko.charges (organization_id, status, due_at);
create index charges_service_period_idx
  on zaltyko.charges (organization_id, currency, service_period_start, service_period_end);

create table zaltyko.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid,
  family_id uuid not null,
  family_payer_id uuid,
  status zaltyko.payment_status not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  processor text not null check (btrim(processor) <> ''),
  environment zaltyko.provider_environment not null,
  provider_payment_id text not null check (btrim(provider_payment_id) <> ''),
  received_at timestamptz not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_provider_uq
    unique (processor, environment, provider_payment_id),
  constraint payments_idempotency_uq unique (organization_id, idempotency_key),
  constraint payments_organization_id_id_uq unique (organization_id, id),
  constraint payments_organization_id_currency_uq unique (organization_id, id, currency),
  constraint payments_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint payments_family_fk foreign key (organization_id, family_id)
    references zaltyko.families (organization_id, id) on delete restrict,
  constraint payments_family_payer_fk
    foreign key (organization_id, family_id, family_payer_id)
    references zaltyko.family_payers (organization_id, family_id, id) on delete restrict
);
create index payments_received_idx
  on zaltyko.payments (organization_id, currency, received_at);

create table zaltyko.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid,
  family_id uuid not null,
  family_payer_id uuid,
  invoice_id uuid,
  payment_id uuid,
  status zaltyko.payment_attempt_status not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  processor text not null check (btrim(processor) <> ''),
  environment zaltyko.provider_environment not null,
  provider_attempt_id text not null check (btrim(provider_attempt_id) <> ''),
  failure_code text,
  attempted_at timestamptz not null,
  provider_event_id uuid,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null default now(),
  constraint payment_attempts_provider_uq
    unique (processor, environment, provider_attempt_id),
  constraint payment_attempts_idempotency_uq unique (organization_id, idempotency_key),
  constraint payment_attempts_organization_id_id_uq unique (organization_id, id),
  constraint payment_attempts_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint payment_attempts_family_fk foreign key (organization_id, family_id)
    references zaltyko.families (organization_id, id) on delete restrict,
  constraint payment_attempts_family_payer_fk
    foreign key (organization_id, family_id, family_payer_id)
    references zaltyko.family_payers (organization_id, family_id, id) on delete restrict,
  constraint payment_attempts_invoice_fk
    foreign key (organization_id, invoice_id, currency)
    references zaltyko.invoices (organization_id, id, currency) on delete restrict,
  constraint payment_attempts_payment_fk
    foreign key (organization_id, payment_id, currency)
    references zaltyko.payments (organization_id, id, currency) on delete restrict
);
create index payment_attempts_invoice_idx
  on zaltyko.payment_attempts (organization_id, invoice_id, attempted_at);

create table zaltyko.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  payment_id uuid not null,
  charge_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  allocated_at timestamptz not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null default now(),
  constraint payment_allocations_idempotency_uq unique (organization_id, idempotency_key),
  constraint payment_allocations_organization_id_id_uq unique (organization_id, id),
  constraint payment_allocations_organization_id_currency_uq
    unique (organization_id, id, currency),
  constraint payment_allocations_payment_fk
    foreign key (organization_id, payment_id, currency)
    references zaltyko.payments (organization_id, id, currency) on delete restrict,
  constraint payment_allocations_charge_fk
    foreign key (organization_id, charge_id, currency)
    references zaltyko.charges (organization_id, id, currency) on delete restrict
);
create index payment_allocations_payment_idx
  on zaltyko.payment_allocations (organization_id, payment_id, allocated_at);
create index payment_allocations_charge_idx
  on zaltyko.payment_allocations (organization_id, charge_id, allocated_at);

create table zaltyko.refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  payment_id uuid not null,
  payment_allocation_id uuid not null,
  status zaltyko.refund_status not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  processor text not null check (btrim(processor) <> ''),
  environment zaltyko.provider_environment not null,
  provider_refund_id text not null check (btrim(provider_refund_id) <> ''),
  reason_code text not null check (btrim(reason_code) <> ''),
  refunded_at timestamptz not null,
  provider_event_id uuid,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null default now(),
  constraint refunds_provider_uq unique (processor, environment, provider_refund_id),
  constraint refunds_idempotency_uq unique (organization_id, idempotency_key),
  constraint refunds_organization_id_id_uq unique (organization_id, id),
  constraint refunds_payment_fk
    foreign key (organization_id, payment_id, currency)
    references zaltyko.payments (organization_id, id, currency) on delete restrict,
  constraint refunds_allocation_fk
    foreign key (organization_id, payment_allocation_id, currency)
    references zaltyko.payment_allocations (organization_id, id, currency) on delete restrict
);
create index refunds_payment_idx on zaltyko.refunds (organization_id, payment_id, refunded_at);

create table zaltyko.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  processor text not null check (btrim(processor) <> ''),
  environment zaltyko.provider_environment not null,
  provider_event_id text not null check (btrim(provider_event_id) <> ''),
  event_type text not null check (btrim(event_type) <> ''),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  signature_verified boolean not null check (signature_verified),
  status zaltyko.provider_event_status not null default 'received',
  effect_type text,
  effect_id uuid,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_provider_events_provider_uq
    unique (processor, environment, provider_event_id),
  constraint payment_provider_events_organization_id_id_uq unique (organization_id, id)
);
create index payment_provider_events_processing_idx
  on zaltyko.payment_provider_events (status, received_at);

alter table zaltyko.payment_attempts
  add constraint payment_attempts_provider_event_fk
  foreign key (organization_id, provider_event_id)
  references zaltyko.payment_provider_events (organization_id, id) on delete restrict;
alter table zaltyko.refunds
  add constraint refunds_provider_event_fk
  foreign key (organization_id, provider_event_id)
  references zaltyko.payment_provider_events (organization_id, id) on delete restrict;

create table zaltyko.financial_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  period_start date not null,
  period_end date not null,
  expected_cents bigint not null,
  allocated_cents bigint not null,
  refunded_cents bigint not null,
  net_collected_cents bigint not null,
  outstanding_cents bigint not null,
  status zaltyko.reconciliation_status not null,
  formula_version integer not null default 1 check (formula_version > 0),
  source_watermark timestamptz not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  computed_at timestamptz not null default now(),
  constraint financial_reconciliation_period_valid check (period_end >= period_start),
  constraint financial_reconciliation_amounts_valid check (
    expected_cents >= 0
    and allocated_cents >= 0
    and refunded_cents >= 0
    and allocated_cents <= expected_cents
    and refunded_cents <= allocated_cents
    and net_collected_cents = allocated_cents - refunded_cents
    and outstanding_cents = expected_cents - allocated_cents
  ),
  constraint financial_reconciliation_natural_uq
    unique (organization_id, currency, period_start, period_end, formula_version),
  constraint financial_reconciliation_idempotency_uq
    unique (organization_id, idempotency_key)
);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'enrollment_price_assignments', 'invoices', 'invoice_lines', 'charges',
    'payments', 'payment_attempts', 'payment_allocations', 'refunds',
    'payment_provider_events', 'financial_reconciliation_runs'
  ]
  loop
    execute format('alter table zaltyko.%I enable row level security', target_table);
    execute format('alter table zaltyko.%I force row level security', target_table);
  end loop;
end
$$;

-- Defense-in-depth policies for a future explicit server-mediated grant. No
-- financial table is granted to authenticated or anon in this migration.
create policy enrollment_price_assignments_select_scoped
on zaltyko.enrollment_price_assignments for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, location_id)));
create policy invoices_select_member on zaltyko.invoices
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy invoice_lines_select_member on zaltyko.invoice_lines
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy charges_select_member on zaltyko.charges
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy payments_select_member on zaltyko.payments
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy payment_attempts_select_member on zaltyko.payment_attempts
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy payment_allocations_select_member on zaltyko.payment_allocations
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy refunds_select_member on zaltyko.refunds
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy financial_reconciliation_runs_select_member
on zaltyko.financial_reconciliation_runs for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));

revoke all on table
  zaltyko.enrollment_price_assignments,
  zaltyko.invoices,
  zaltyko.invoice_lines,
  zaltyko.charges,
  zaltyko.payments,
  zaltyko.payment_attempts,
  zaltyko.payment_allocations,
  zaltyko.refunds,
  zaltyko.payment_provider_events,
  zaltyko.financial_reconciliation_runs
from anon, authenticated;

grant all privileges on table
  zaltyko.enrollment_price_assignments,
  zaltyko.invoices,
  zaltyko.invoice_lines,
  zaltyko.charges,
  zaltyko.payments,
  zaltyko.payment_attempts,
  zaltyko.payment_allocations,
  zaltyko.refunds,
  zaltyko.payment_provider_events,
  zaltyko.financial_reconciliation_runs
to service_role;

comment on table zaltyko.payment_provider_events is
  'Restricted webhook inbox. Verify signatures before insert; payload retention must be bounded.';

commit;
