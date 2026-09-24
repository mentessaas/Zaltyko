-- Preserve every inbound contact while keeping leads deduplicated by email.
create table if not exists public.lead_interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  submission_id uuid not null,
  name text not null,
  email text not null,
  academy text,
  reason text not null,
  plan text,
  source text not null,
  message text not null,
  visitor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists lead_interactions_lead_idx
  on public.lead_interactions (lead_id, created_at);
create unique index if not exists lead_interactions_submission_idx
  on public.lead_interactions (submission_id);

-- Contact history is written through the trusted server API only.
alter table public.lead_interactions enable row level security;
