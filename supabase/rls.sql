-- Enable required extension for UUID generation if not present
create extension if not exists "pgcrypto";

-- Helper functions ---------------------------------------------------------

create or replace function get_current_profile()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles where user_id = auth.uid() limit 1;
$$;

create or replace function get_current_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from profiles where user_id = auth.uid() limit 1;
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(role = 'admin', false)
  from profiles
  where user_id = auth.uid()
  limit 1;
$$;

-- Enable RLS ---------------------------------------------------------------

alter table academies enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table subscriptions enable row level security;
alter table athletes enable row level security;
alter table coaches enable row level security;
alter table classes enable row level security;
alter table events enable row level security;
alter table audit_logs enable row level security;
alter table plans enable row level security;
alter table class_sessions enable row level security;
alter table attendance_records enable row level security;
alter table family_contacts enable row level security;
alter table skill_catalog enable row level security;
alter table athlete_assessments enable row level security;
alter table assessment_scores enable row level security;
alter table coach_notes enable row level security;

-- Academies ----------------------------------------------------------------

drop policy if exists "academies_tenant_read" on academies;
create policy "academies_tenant_read" on academies
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "academies_tenant_write" on academies;
create policy "academies_tenant_write" on academies
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Profiles -----------------------------------------------------------------

drop policy if exists "profiles_read" on profiles;
create policy "profiles_read" on profiles
  for select using (
    is_admin() or user_id = auth.uid() or tenant_id = get_current_tenant()
  );

drop policy if exists "profiles_write" on profiles;
create policy "profiles_write" on profiles
  for all using (
    is_admin() or user_id = auth.uid() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or user_id = auth.uid() or tenant_id = get_current_tenant()
  );

-- Memberships --------------------------------------------------------------

drop policy if exists "memberships_read" on memberships;
create policy "memberships_read" on memberships
  for select using (
    is_admin() or exists (
      select 1 from academies a
      where a.id = memberships.academy_id
        and a.tenant_id = get_current_tenant()
    )
  );

drop policy if exists "memberships_write" on memberships;
create policy "memberships_write" on memberships
  for all using (
    is_admin() or exists (
      select 1 from academies a
      where a.id = memberships.academy_id
        and a.tenant_id = get_current_tenant()
    )
  ) with check (
    is_admin() or exists (
      select 1 from academies a
      where a.id = memberships.academy_id
        and a.tenant_id = get_current_tenant()
    )
  );

-- Subscriptions ------------------------------------------------------------

drop policy if exists "subscriptions_read" on subscriptions;
create policy "subscriptions_read" on subscriptions
  for select using (
    is_admin() or exists (
      select 1 from academies a
      where a.id = subscriptions.academy_id
        and a.tenant_id = get_current_tenant()
    )
  );

drop policy if exists "subscriptions_write" on subscriptions;
create policy "subscriptions_write" on subscriptions
  for all using (
    is_admin() or exists (
      select 1 from academies a
      where a.id = subscriptions.academy_id
        and a.tenant_id = get_current_tenant()
    )
  ) with check (
    is_admin() or exists (
      select 1 from academies a
      where a.id = subscriptions.academy_id
        and a.tenant_id = get_current_tenant()
    )
  );

-- Athletes -----------------------------------------------------------------

drop policy if exists "athletes_tenant_read" on athletes;
create policy "athletes_tenant_read" on athletes
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "athletes_tenant_write" on athletes;
create policy "athletes_tenant_write" on athletes
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Coaches ------------------------------------------------------------------

drop policy if exists "coaches_tenant_read" on coaches;
create policy "coaches_tenant_read" on coaches
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "coaches_tenant_write" on coaches;
create policy "coaches_tenant_write" on coaches
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Classes ------------------------------------------------------------------

drop policy if exists "classes_tenant_read" on classes;
create policy "classes_tenant_read" on classes
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "classes_tenant_write" on classes;
create policy "classes_tenant_write" on classes
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Events -------------------------------------------------------------------

drop policy if exists "events_tenant_read" on events;
create policy "events_tenant_read" on events
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "events_tenant_write" on events;
create policy "events_tenant_write" on events
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Audit logs ---------------------------------------------------------------

drop policy if exists "audit_logs_read" on audit_logs;
create policy "audit_logs_read" on audit_logs
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "audit_logs_write" on audit_logs;
create policy "audit_logs_write" on audit_logs
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Plans --------------------------------------------------------------------

drop policy if exists "plans_read" on plans;
create policy "plans_read" on plans
  for select using (auth.role() = 'authenticated');

drop policy if exists "plans_write" on plans;
create policy "plans_write" on plans
  for all using (is_admin()) with check (is_admin());
-- Funciones helper
create or replace function get_current_profile()
returns profiles
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from profiles p
  where p.user_id = auth.uid()
  limit 1;
$$;

create or replace function get_current_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from profiles
  where user_id = auth.uid()
  limit 1;
$$;

-- Activar RLS en tablas multi-tenant
alter table academies enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table subscriptions enable row level security;
alter table athletes enable row level security;
alter table coaches enable row level security;
alter table classes enable row level security;
alter table events enable row level security;
alter table audit_logs enable row level security;

-- Políticas base por tenant
create policy "tenant_select" on academies
  for select
  using (
    tenant_id = get_current_tenant() or exists (
      select 1 from profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
  );

create policy "tenant_modify" on academies
  for all
  using (tenant_id = get_current_tenant())
  with check (tenant_id = get_current_tenant());

create policy "profiles_select" on profiles
  for select
  using (
    tenant_id = get_current_tenant() or role = 'super_admin'
  );

create policy "profiles_self_update" on profiles
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "memberships_access" on memberships
  for all
  using (
    tenant_id = get_current_tenant() or exists (
      select 1 from profiles p where p.user_id = auth.uid() and p.role = 'super_admin'
    )
  )
  with check (tenant_id = get_current_tenant());

create policy "subscriptions_tenant_select" on subscriptions
  for select
  using (
    exists (
      select 1 from academies a
      where a.id = subscriptions.academy_id
        and a.tenant_id = get_current_tenant()
    )
  );

create policy "subscriptions_tenant_mod" on subscriptions
  for all
  using (
    exists (
      select 1 from academies a
      where a.id = subscriptions.academy_id
        and a.tenant_id = get_current_tenant()
    )
  )
  with check (
    exists (
      select 1 from academies a
      where a.id = subscriptions.academy_id
        and a.tenant_id = get_current_tenant()
    )
  );

-- Políticas genéricas para tablas con tenant_id
create policy "generic_select" on athletes
  for select using (tenant_id = get_current_tenant());
create policy "generic_modify" on athletes
  for all using (tenant_id = get_current_tenant())
  with check (tenant_id = get_current_tenant());

create policy "generic_select" on coaches
  for select using (tenant_id = get_current_tenant());
create policy "generic_modify" on coaches
  for all using (tenant_id = get_current_tenant())
  with check (tenant_id = get_current_tenant());

create policy "generic_select" on classes
  for select using (tenant_id = get_current_tenant());
create policy "generic_modify" on classes
  for all using (tenant_id = get_current_tenant())
  with check (tenant_id = get_current_tenant());

create policy "generic_select" on events
  for select using (tenant_id = get_current_tenant());
create policy "generic_modify" on events
  for all using (tenant_id = get_current_tenant())
  with check (tenant_id = get_current_tenant());

create policy "generic_select" on audit_logs
  for select using (
    tenant_id = get_current_tenant() or exists (
      select 1 from profiles p where p.user_id = auth.uid() and p.role = 'super_admin'
    )
  );
create policy "generic_modify" on audit_logs
  for all using (tenant_id = get_current_tenant())
  with check (tenant_id = get_current_tenant());

-- Class sessions ------------------------------------------------------------

drop policy if exists "class_sessions_read" on class_sessions;
create policy "class_sessions_read" on class_sessions
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "class_sessions_write" on class_sessions;
create policy "class_sessions_write" on class_sessions
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Attendance records -------------------------------------------------------

drop policy if exists "attendance_records_read" on attendance_records;
create policy "attendance_records_read" on attendance_records
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "attendance_records_write" on attendance_records;
create policy "attendance_records_write" on attendance_records
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Family contacts ----------------------------------------------------------

drop policy if exists "family_contacts_read" on family_contacts;
create policy "family_contacts_read" on family_contacts
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "family_contacts_write" on family_contacts;
create policy "family_contacts_write" on family_contacts
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Skill catalog ------------------------------------------------------------

drop policy if exists "skill_catalog_read" on skill_catalog;
create policy "skill_catalog_read" on skill_catalog
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "skill_catalog_write" on skill_catalog;
create policy "skill_catalog_write" on skill_catalog
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Athlete assessments ------------------------------------------------------

drop policy if exists "athlete_assessments_read" on athlete_assessments;
create policy "athlete_assessments_read" on athlete_assessments
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "athlete_assessments_write" on athlete_assessments;
create policy "athlete_assessments_write" on athlete_assessments
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Assessment scores --------------------------------------------------------

drop policy if exists "assessment_scores_read" on assessment_scores;
create policy "assessment_scores_read" on assessment_scores
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "assessment_scores_write" on assessment_scores;
create policy "assessment_scores_write" on assessment_scores
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Coach notes --------------------------------------------------------------

drop policy if exists "coach_notes_read" on coach_notes;
create policy "coach_notes_read" on coach_notes
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "coach_notes_write" on coach_notes;
create policy "coach_notes_write" on coach_notes
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );
