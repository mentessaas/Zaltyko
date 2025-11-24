-- Supabase RLS configuration for GymnaSaaS
-- ----------------------------------------

create extension if not exists "pgcrypto";

-- Helper functions ----------------------------------------------------------

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
  select p.tenant_id
  from profiles p
  where p.user_id = auth.uid()
  limit 1;
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.role in ('admin', 'super_admin'), false)
  from profiles p
  where p.user_id = auth.uid()
  limit 1;
$$;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.role = 'super_admin', false)
  from profiles p
  where p.user_id = auth.uid()
  limit 1;
$$;

create or replace function academy_in_current_tenant(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from academies a
    where a.id = target
      and a.tenant_id = get_current_tenant()
  );
$$;

-- Enable RLS on multi-tenant tables ----------------------------------------

alter table academies enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table subscriptions enable row level security;
alter table plans enable row level security;
alter table athletes enable row level security;
alter table coaches enable row level security;
alter table classes enable row level security;
alter table class_sessions enable row level security;
alter table attendance_records enable row level security;
alter table events enable row level security;
alter table family_contacts enable row level security;
alter table skill_catalog enable row level security;
alter table athlete_assessments enable row level security;
alter table assessment_scores enable row level security;
alter table coach_notes enable row level security;
alter table audit_logs enable row level security;
alter table guardians enable row level security;
alter table guardian_athletes enable row level security;
alter table invitations enable row level security;
alter table class_coach_assignments enable row level security;
alter table billing_invoices enable row level security;
alter table billing_events enable row level security;
alter table groups enable row level security;
alter table group_athletes enable row level security;
alter table onboarding_states enable row level security;
alter table onboarding_checklist_items enable row level security;
alter table user_preferences enable row level security;
alter table class_weekdays enable row level security;
alter table class_groups enable row level security;
alter table billing_items enable row level security;
alter table charges enable row level security;
alter table event_logs enable row level security;
alter table academy_messages enable row level security;
alter table academy_geo_groups enable row level security;
alter table contact_messages enable row level security;

-- Academies -----------------------------------------------------------------

drop policy if exists "academies_select" on academies;
create policy "academies_select" on academies
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "academies_modify" on academies;
create policy "academies_modify" on academies
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Public Academies View -----------------------------------------------------
-- La vista public_academies_view NO tiene RLS (acceso público sin autenticación)
-- Solo expone campos públicos de academias con is_public = true
-- Las consultas públicas deben usar esta vista, nunca la tabla academies directamente

-- Profiles ------------------------------------------------------------------

drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles
  for select using (
    is_admin()
    or user_id = auth.uid()
    or tenant_id = get_current_tenant()
  );

drop policy if exists "profiles_insert_self" on profiles;
create policy "profiles_insert_self" on profiles
  for insert with check (user_id = auth.uid());

drop policy if exists "profiles_update_self" on profiles;
create policy "profiles_update_self" on profiles
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "profiles_manage_tenant" on profiles;
create policy "profiles_manage_tenant" on profiles
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Memberships ---------------------------------------------------------------

drop policy if exists "memberships_select" on memberships;
create policy "memberships_select" on memberships
  for select using (
    is_admin() or academy_in_current_tenant(academy_id)
  );

drop policy if exists "memberships_modify" on memberships;
create policy "memberships_modify" on memberships
  for all using (
    is_admin() or academy_in_current_tenant(academy_id)
  ) with check (
    is_admin() or academy_in_current_tenant(academy_id)
  );

-- Subscriptions -------------------------------------------------------------

drop policy if exists "subscriptions_select" on subscriptions;
create policy "subscriptions_select" on subscriptions
  for select using (
    is_admin() or user_id in (
      select user_id from profiles where tenant_id = get_current_tenant()
    )
  );

drop policy if exists "subscriptions_modify" on subscriptions;
create policy "subscriptions_modify" on subscriptions
  for all using (
    is_admin() or user_id in (
      select user_id from profiles where tenant_id = get_current_tenant()
    )
  ) with check (
    is_admin() or user_id in (
      select user_id from profiles where tenant_id = get_current_tenant()
    )
  );

-- Plans ---------------------------------------------------------------------

drop policy if exists "plans_read" on plans;
create policy "plans_read" on plans
  for select using (auth.role() = 'authenticated');

drop policy if exists "plans_admin_only" on plans;
create policy "plans_admin_only" on plans
  for all using (is_admin())
  with check (is_admin());

-- Generic helper macro (tenant_id column) -----------------------------------

-- Athletes ------------------------------------------------------------------

drop policy if exists "athletes_select" on athletes;
create policy "athletes_select" on athletes
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "athletes_modify" on athletes;
create policy "athletes_modify" on athletes
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Coaches -------------------------------------------------------------------

drop policy if exists "coaches_select" on coaches;
create policy "coaches_select" on coaches
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "coaches_modify" on coaches;
create policy "coaches_modify" on coaches
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Classes -------------------------------------------------------------------

drop policy if exists "classes_select" on classes;
create policy "classes_select" on classes
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "classes_modify" on classes;
create policy "classes_modify" on classes
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Class sessions ------------------------------------------------------------

drop policy if exists "class_sessions_select" on class_sessions;
create policy "class_sessions_select" on class_sessions
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "class_sessions_modify" on class_sessions;
create policy "class_sessions_modify" on class_sessions
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Attendance records --------------------------------------------------------

drop policy if exists "attendance_records_select" on attendance_records;
create policy "attendance_records_select" on attendance_records
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "attendance_records_modify" on attendance_records;
create policy "attendance_records_modify" on attendance_records
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Events --------------------------------------------------------------------

drop policy if exists "events_select" on events;
create policy "events_select" on events
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "events_modify" on events;
create policy "events_modify" on events
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Family contacts -----------------------------------------------------------

drop policy if exists "family_contacts_select" on family_contacts;
create policy "family_contacts_select" on family_contacts
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "family_contacts_modify" on family_contacts;
create policy "family_contacts_modify" on family_contacts
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Skill catalog -------------------------------------------------------------

drop policy if exists "skill_catalog_select" on skill_catalog;
create policy "skill_catalog_select" on skill_catalog
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "skill_catalog_modify" on skill_catalog;
create policy "skill_catalog_modify" on skill_catalog
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Athlete assessments -------------------------------------------------------

drop policy if exists "athlete_assessments_select" on athlete_assessments;
create policy "athlete_assessments_select" on athlete_assessments
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "athlete_assessments_modify" on athlete_assessments;
create policy "athlete_assessments_modify" on athlete_assessments
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Assessment scores ---------------------------------------------------------

drop policy if exists "assessment_scores_select" on assessment_scores;
create policy "assessment_scores_select" on assessment_scores
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "assessment_scores_modify" on assessment_scores;
create policy "assessment_scores_modify" on assessment_scores
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Coach notes ---------------------------------------------------------------

drop policy if exists "coach_notes_select" on coach_notes;
create policy "coach_notes_select" on coach_notes
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "coach_notes_modify" on coach_notes;
create policy "coach_notes_modify" on coach_notes
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Audit logs ----------------------------------------------------------------

drop policy if exists "audit_logs_select" on audit_logs;
create policy "audit_logs_select" on audit_logs
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "audit_logs_modify" on audit_logs;
create policy "audit_logs_modify" on audit_logs
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Guardians -----------------------------------------------------------------

drop policy if exists "guardians_select" on guardians;
create policy "guardians_select" on guardians
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "guardians_modify" on guardians;
create policy "guardians_modify" on guardians
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Guardian athletes ---------------------------------------------------------

drop policy if exists "guardian_athletes_select" on guardian_athletes;
create policy "guardian_athletes_select" on guardian_athletes
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "guardian_athletes_modify" on guardian_athletes;
create policy "guardian_athletes_modify" on guardian_athletes
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Groups --------------------------------------------------------------------

drop policy if exists "groups_select" on groups;
create policy "groups_select" on groups
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "groups_modify" on groups;
create policy "groups_modify" on groups
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Group athletes ------------------------------------------------------------

drop policy if exists "group_athletes_select" on group_athletes;
create policy "group_athletes_select" on group_athletes
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "group_athletes_modify" on group_athletes;
create policy "group_athletes_modify" on group_athletes
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Invitations -----------------------------------------------------------------

drop policy if exists "invitations_select" on invitations;
create policy "invitations_select" on invitations
  for select using (
    is_super_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "invitations_modify" on invitations;
create policy "invitations_modify" on invitations
  for all using (
    is_super_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_super_admin() or tenant_id = get_current_tenant()
  );

-- Class coach assignments -----------------------------------------------------

drop policy if exists "class_coach_assignments_select" on class_coach_assignments;
create policy "class_coach_assignments_select" on class_coach_assignments
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "class_coach_assignments_modify" on class_coach_assignments;
create policy "class_coach_assignments_modify" on class_coach_assignments
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Billing invoices ------------------------------------------------------------

drop policy if exists "billing_invoices_select" on billing_invoices;
create policy "billing_invoices_select" on billing_invoices
  for select using (
    is_super_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "billing_invoices_modify" on billing_invoices;
create policy "billing_invoices_modify" on billing_invoices
  for all using (
    is_super_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_super_admin() or tenant_id = get_current_tenant()
  );

-- Billing events --------------------------------------------------------------

drop policy if exists "billing_events_select" on billing_events;
create policy "billing_events_select" on billing_events
  for select using (
    is_super_admin()
  );

drop policy if exists "billing_events_modify" on billing_events;
create policy "billing_events_modify" on billing_events
  for all using (
    is_super_admin()
  ) with check (
    is_super_admin()
  );

-- Onboarding states ----------------------------------------------------------

drop policy if exists "onboarding_states_select" on onboarding_states;
create policy "onboarding_states_select" on onboarding_states
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "onboarding_states_modify" on onboarding_states;
create policy "onboarding_states_modify" on onboarding_states
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Onboarding checklist items -------------------------------------------------

drop policy if exists "onboarding_checklist_items_select" on onboarding_checklist_items;
create policy "onboarding_checklist_items_select" on onboarding_checklist_items
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "onboarding_checklist_items_modify" on onboarding_checklist_items;
create policy "onboarding_checklist_items_modify" on onboarding_checklist_items
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- User preferences ------------------------------------------------------------

drop policy if exists "user_preferences_select" on user_preferences;
create policy "user_preferences_select" on user_preferences
  for select using (
    is_admin()
    or user_id = auth.uid()
    or (tenant_id is not null and tenant_id = get_current_tenant())
  );

drop policy if exists "user_preferences_modify" on user_preferences;
create policy "user_preferences_modify" on user_preferences
  for all using (
    is_admin()
    or user_id = auth.uid()
    or (tenant_id is not null and tenant_id = get_current_tenant())
  ) with check (
    is_admin()
    or user_id = auth.uid()
    or (tenant_id is not null and tenant_id = get_current_tenant())
  );

-- Class weekdays --------------------------------------------------------------

drop policy if exists "class_weekdays_select" on class_weekdays;
create policy "class_weekdays_select" on class_weekdays
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "class_weekdays_modify" on class_weekdays;
create policy "class_weekdays_modify" on class_weekdays
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Class groups -----------------------------------------------------------------

drop policy if exists "class_groups_select" on class_groups;
create policy "class_groups_select" on class_groups
  for select using (
    is_admin() or tenant_id = get_current_tenant()
  );

drop policy if exists "class_groups_modify" on class_groups;
create policy "class_groups_modify" on class_groups
  for all using (
    is_admin() or tenant_id = get_current_tenant()
  ) with check (
    is_admin() or tenant_id = get_current_tenant()
  );

-- Billing items ------------------------------------------------------------

drop policy if exists "billing_items_select" on billing_items;
create policy "billing_items_select" on billing_items
  for select using (
    is_admin() or academy_in_current_tenant(academy_id)
  );

drop policy if exists "billing_items_modify" on billing_items;
create policy "billing_items_modify" on billing_items
  for all using (
    is_admin() or academy_in_current_tenant(academy_id)
  ) with check (
    is_admin() or academy_in_current_tenant(academy_id)
  );

-- Charges -------------------------------------------------------------------

drop policy if exists "charges_select" on charges;
create policy "charges_select" on charges
  for select using (
    is_admin() or academy_in_current_tenant(academy_id)
  );

drop policy if exists "charges_modify" on charges;
create policy "charges_modify" on charges
  for all using (
    is_admin() or academy_in_current_tenant(academy_id)
  ) with check (
    is_admin() or academy_in_current_tenant(academy_id)
  );

-- Event logs ---------------------------------------------------------------

drop policy if exists "event_logs_select" on event_logs;
create policy "event_logs_select" on event_logs
  for select using (
    is_super_admin() 
    or (academy_id is not null and academy_in_current_tenant(academy_id))
  );

drop policy if exists "event_logs_modify" on event_logs;
create policy "event_logs_modify" on event_logs
  for all using (
    is_super_admin() 
    or (academy_id is not null and academy_in_current_tenant(academy_id))
  ) with check (
    is_super_admin() 
    or (academy_id is not null and academy_in_current_tenant(academy_id))
  );

-- Academy Messages -----------------------------------------------------------
-- Tabla preparada para funcionalidad futura de mensajería entre academias
-- Por ahora, solo super_admin puede acceder

drop policy if exists "academy_messages_select" on academy_messages;
create policy "academy_messages_select" on academy_messages
  for select using (is_super_admin());

drop policy if exists "academy_messages_modify" on academy_messages;
create policy "academy_messages_modify" on academy_messages
  for all using (is_super_admin())
  with check (is_super_admin());

-- Academy Geo Groups ----------------------------------------------------------
-- Tabla preparada para funcionalidad futura de agrupación geográfica
-- Por ahora, solo super_admin puede acceder

drop policy if exists "academy_geo_groups_select" on academy_geo_groups;
create policy "academy_geo_groups_select" on academy_geo_groups
  for select using (is_super_admin());

drop policy if exists "academy_geo_groups_modify" on academy_geo_groups;
create policy "academy_geo_groups_modify" on academy_geo_groups
  for all using (is_super_admin())
  with check (is_super_admin());

-- Contact Messages ------------------------------------------------------------
-- Mensajes de contacto desde el directorio público de academias
-- Los propietarios de academias pueden ver y gestionar sus mensajes
-- Los admins pueden ver todos los mensajes de su tenant
-- Cualquiera puede crear mensajes (desde el formulario público)

drop policy if exists "contact_messages_select" on contact_messages;
create policy "contact_messages_select" on contact_messages
  for select using (
    is_admin() 
    or academy_in_current_tenant(academy_id)
  );

drop policy if exists "contact_messages_insert" on contact_messages;
create policy "contact_messages_insert" on contact_messages
  for insert with check (
    -- Permitir inserción pública (desde formulario de contacto)
    -- La validación de academia pública se hace en la aplicación
    true
  );

drop policy if exists "contact_messages_modify" on contact_messages;
create policy "contact_messages_modify" on contact_messages
  for update using (
    is_admin() 
    or academy_in_current_tenant(academy_id)
  ) with check (
    is_admin() 
    or academy_in_current_tenant(academy_id)
  );

drop policy if exists "contact_messages_delete" on contact_messages;
create policy "contact_messages_delete" on contact_messages
  for delete using (
    is_admin() 
    or academy_in_current_tenant(academy_id)
  );
