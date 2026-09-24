-- Prospect class trials are distinct from academy subscription trials.
create table if not exists public.lead_trials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  academy_id uuid not null references public.academies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'scheduled',
  scheduled_at timestamptz,
  attended_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lead_trials_academy_status_idx on public.lead_trials (academy_id, status);
create index if not exists lead_trials_tenant_lead_idx on public.lead_trials (tenant_id, lead_id);
create unique index if not exists lead_trials_idempotency_idx on public.lead_trials (tenant_id, idempotency_key) where idempotency_key is not null;

create table if not exists public.lead_trial_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  academy_id uuid not null references public.academies(id) on delete cascade,
  lead_trial_id uuid not null references public.lead_trials(id) on delete cascade,
  outcome text not null,
  notes text,
  next_action_at timestamptz,
  recorded_by uuid references public.profiles(id) on delete set null,
  idempotency_key text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_trial_outcomes_trial_idx on public.lead_trial_outcomes (tenant_id, lead_trial_id, created_at);
create unique index if not exists lead_trial_outcomes_idempotency_idx on public.lead_trial_outcomes (tenant_id, idempotency_key) where idempotency_key is not null;

alter table public.lead_trials enable row level security;
drop policy if exists "lead_trials_tenant_access" on public.lead_trials;
create policy "lead_trials_tenant_access" on public.lead_trials for all using (is_admin() or tenant_id = get_current_tenant()) with check (is_admin() or tenant_id = get_current_tenant());
alter table public.lead_trial_outcomes enable row level security;
drop policy if exists "lead_trial_outcomes_tenant_access" on public.lead_trial_outcomes;
create policy "lead_trial_outcomes_tenant_access" on public.lead_trial_outcomes for all using (is_admin() or tenant_id = get_current_tenant()) with check (is_admin() or tenant_id = get_current_tenant());
