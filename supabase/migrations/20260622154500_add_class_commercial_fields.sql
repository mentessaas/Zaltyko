alter table public.classes
  add column if not exists allows_free_trial boolean not null default false,
  add column if not exists waiting_list_enabled boolean not null default false,
  add column if not exists cancellation_hours_before integer default 24,
  add column if not exists cancellation_policy text default 'standard';
