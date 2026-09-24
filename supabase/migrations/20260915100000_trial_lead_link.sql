-- Additive commercial-pipeline link. Existing self-serve and historical trials
-- remain valid with a NULL lead_id until an audited backfill is approved.
alter table public.academy_trials
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

create index if not exists academy_trials_lead_idx
  on public.academy_trials (lead_id);
