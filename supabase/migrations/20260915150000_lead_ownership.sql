-- Additive ownership for legacy public leads. Existing rows remain unassigned
-- until they are claimed by an authorized academy workflow.
alter table public.leads add column if not exists tenant_id uuid;
alter table public.leads add column if not exists academy_id uuid;

do $$ begin
  alter table public.leads
    add constraint leads_academy_id_fkey foreign key (academy_id)
    references public.academies(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists leads_ownership_idx on public.leads (tenant_id, academy_id);
