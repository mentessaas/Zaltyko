create table if not exists coach_compensation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  academy_id uuid not null references academies(id) on delete cascade,
  coach_id uuid not null references coaches(id) on delete cascade,
  hourly_rate_cents integer not null default 0,
  monthly_salary_cents integer not null default 0,
  estimated_weekly_hours integer not null default 0,
  notes text,
  effective_from date not null,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists academy_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  academy_id uuid not null references academies(id) on delete cascade,
  label text not null,
  category text not null default 'other',
  amount_cents integer not null,
  currency text not null default 'EUR',
  recurrence text not null default 'monthly',
  applies_to_type text not null default 'academy',
  applies_to_id uuid,
  expense_date date not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists churn_reasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  academy_id uuid not null references academies(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  previous_status text,
  new_status text not null,
  reason text not null,
  notes text,
  created_by_profile_id uuid,
  created_at timestamptz default now()
);

create table if not exists academy_diagnostics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  academy_id uuid not null references academies(id) on delete cascade,
  answers jsonb not null,
  score integer not null,
  level text not null,
  recommended_tasks jsonb not null default '[]'::jsonb,
  created_by_profile_id uuid,
  created_at timestamptz default now()
);

create table if not exists leak_action_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  academy_id uuid not null references academies(id) on delete cascade,
  action_type text not null,
  athlete_id uuid references athletes(id) on delete set null,
  class_id uuid references classes(id) on delete set null,
  channel text not null default 'whatsapp',
  message text,
  payload jsonb default '{}'::jsonb,
  created_by_profile_id uuid,
  created_at timestamptz default now()
);

create index if not exists coach_compensation_tenant_idx on coach_compensation(tenant_id);
create index if not exists coach_compensation_academy_coach_idx on coach_compensation(academy_id, coach_id);

create index if not exists academy_expenses_tenant_idx on academy_expenses(tenant_id);
create index if not exists academy_expenses_academy_idx on academy_expenses(academy_id);
create index if not exists academy_expenses_applies_to_idx on academy_expenses(applies_to_type, applies_to_id);

create index if not exists churn_reasons_tenant_idx on churn_reasons(tenant_id);
create index if not exists churn_reasons_academy_athlete_idx on churn_reasons(academy_id, athlete_id);

create index if not exists academy_diagnostics_tenant_idx on academy_diagnostics(tenant_id);
create index if not exists academy_diagnostics_academy_created_idx on academy_diagnostics(academy_id, created_at);

create index if not exists leak_action_history_tenant_idx on leak_action_history(tenant_id);
create index if not exists leak_action_history_academy_created_idx on leak_action_history(academy_id, created_at);
create index if not exists leak_action_history_athlete_idx on leak_action_history(athlete_id);
create index if not exists leak_action_history_class_idx on leak_action_history(class_id);

alter table coach_compensation enable row level security;
alter table academy_expenses enable row level security;
alter table churn_reasons enable row level security;
alter table academy_diagnostics enable row level security;
alter table leak_action_history enable row level security;

grant select, insert, update, delete on coach_compensation to authenticated, service_role;
grant select, insert, update, delete on academy_expenses to authenticated, service_role;
grant select, insert, update, delete on churn_reasons to authenticated, service_role;
grant select, insert, update, delete on academy_diagnostics to authenticated, service_role;
grant select, insert, update, delete on leak_action_history to authenticated, service_role;

drop policy if exists coach_compensation_tenant_access on coach_compensation;
create policy coach_compensation_tenant_access on coach_compensation
  for all using (is_admin() or tenant_id = get_current_tenant())
  with check (is_admin() or tenant_id = get_current_tenant());

drop policy if exists academy_expenses_tenant_access on academy_expenses;
create policy academy_expenses_tenant_access on academy_expenses
  for all using (is_admin() or tenant_id = get_current_tenant())
  with check (is_admin() or tenant_id = get_current_tenant());

drop policy if exists churn_reasons_tenant_access on churn_reasons;
create policy churn_reasons_tenant_access on churn_reasons
  for all using (is_admin() or tenant_id = get_current_tenant())
  with check (is_admin() or tenant_id = get_current_tenant());

drop policy if exists academy_diagnostics_tenant_access on academy_diagnostics;
create policy academy_diagnostics_tenant_access on academy_diagnostics
  for all using (is_admin() or tenant_id = get_current_tenant())
  with check (is_admin() or tenant_id = get_current_tenant());

drop policy if exists leak_action_history_tenant_access on leak_action_history;
create policy leak_action_history_tenant_access on leak_action_history
  for all using (is_admin() or tenant_id = get_current_tenant())
  with check (is_admin() or tenant_id = get_current_tenant());
