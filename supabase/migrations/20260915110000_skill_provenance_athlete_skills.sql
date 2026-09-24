-- Additive catalog provenance and append-only athlete skill observations.
alter table public.skill_catalog add column if not exists source text;
alter table public.skill_catalog add column if not exists source_id text;
alter table public.skill_catalog add column if not exists source_version text;
alter table public.skill_catalog add column if not exists content_hash text;
alter table public.skill_catalog add column if not exists quality_status text not null default 'active';

create index if not exists skill_catalog_source_identity_idx
  on public.skill_catalog (source, source_id, source_version);
create index if not exists skill_catalog_content_hash_idx
  on public.skill_catalog (content_hash);

create table if not exists public.athlete_skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  academy_id uuid not null references public.academies(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  skill_id uuid not null references public.skill_catalog(id) on delete cascade,
  status text not null default 'learning',
  score integer,
  observed_at date not null,
  observed_by uuid references public.profiles(id) on delete set null,
  notes text,
  evidence jsonb,
  visible_to_guardians boolean not null default false,
  idempotency_key text,
  created_at timestamptz default now()
);

alter table public.athlete_skills
  add column if not exists visible_to_guardians boolean not null default false;

create index if not exists athlete_skills_tenant_athlete_idx
  on public.athlete_skills (tenant_id, athlete_id);
create index if not exists athlete_skills_athlete_skill_idx
  on public.athlete_skills (athlete_id, skill_id);
create index if not exists athlete_skills_observed_at_idx
  on public.athlete_skills (observed_at);
create unique index if not exists athlete_skills_idempotency_idx
  on public.athlete_skills (tenant_id, idempotency_key);

alter table public.athlete_skills enable row level security;
drop policy if exists "athlete_skills_select" on public.athlete_skills;
create policy "athlete_skills_select" on public.athlete_skills
  for select using (is_admin() or tenant_id = get_current_tenant());
drop policy if exists "athlete_skills_modify" on public.athlete_skills;
create policy "athlete_skills_modify" on public.athlete_skills
  for all using (is_admin() or tenant_id = get_current_tenant())
  with check (is_admin() or tenant_id = get_current_tenant());
