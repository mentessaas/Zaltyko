-- Explicit publication control for legacy assessments.
alter table public.athlete_assessments
  add column if not exists visible_to_guardians boolean not null default false;
