create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  academy_id uuid not null references public.academies(id) on delete cascade,
  stripe_invoice_id text not null unique,
  status text not null,
  amount_due integer,
  amount_paid integer,
  currency text not null default 'eur',
  billing_reason text,
  hosted_invoice_url text,
  invoice_pdf text,
  period_start timestamptz,
  period_end timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  metadata jsonb
);

alter table public.billing_invoices
  add column if not exists tenant_id uuid,
  add column if not exists academy_id uuid references public.academies(id) on delete cascade,
  add column if not exists stripe_invoice_id text,
  add column if not exists status text,
  add column if not exists amount_due integer,
  add column if not exists amount_paid integer,
  add column if not exists currency text default 'eur',
  add column if not exists billing_reason text,
  add column if not exists hosted_invoice_url text,
  add column if not exists invoice_pdf text,
  add column if not exists period_start timestamptz,
  add column if not exists period_end timestamptz,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists metadata jsonb;

create unique index if not exists billing_invoices_stripe_invoice_id_unique
  on public.billing_invoices (stripe_invoice_id);

create index if not exists billing_invoices_academy_created_idx
  on public.billing_invoices (academy_id, created_at);

create index if not exists billing_invoices_tenant_created_idx
  on public.billing_invoices (tenant_id, created_at);
