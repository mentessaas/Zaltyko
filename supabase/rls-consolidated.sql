-- ============================================================================
-- ZALTYKO SAAS - RLS POLICIES CONSOLIDATED
-- ============================================================================
-- Este es el archivo maestro consolidado de todas las políticas RLS
-- Última actualización: 2025-11-26
-- 
-- IMPORTANTE: Este archivo reemplaza a:
--   - supabase/rls.sql (deprecado)
--   - supabase/rls-policies.sql (deprecado)
--
-- Para aplicar estas políticas, ejecutar en Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- EXTENSIONES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Obtener el perfil del usuario actual
CREATE OR REPLACE FUNCTION get_current_profile()
RETURNS profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_current_profile() IS 
  'Retorna el perfil completo del usuario autenticado actual';

-- Obtener el tenant_id del usuario actual
CREATE OR REPLACE FUNCTION get_current_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.tenant_id
  FROM profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_current_tenant() IS 
  'Retorna el tenant_id del usuario autenticado actual';

-- Verificar si el usuario es admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.role IN ('admin', 'super_admin'), false)
  FROM profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION is_admin() IS 
  'Retorna true si el usuario tiene rol admin o super_admin';

-- Verificar si el usuario es super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.role = 'super_admin', false)
  FROM profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION is_super_admin() IS 
  'Retorna true si el usuario tiene rol super_admin';

-- Verificar si una academia pertenece al tenant actual
CREATE OR REPLACE FUNCTION academy_in_current_tenant(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM academies a
    WHERE a.id = target
      AND a.tenant_id = get_current_tenant()
  );
$$;

COMMENT ON FUNCTION academy_in_current_tenant(uuid) IS 
  'Verifica si una academia pertenece al tenant del usuario actual';

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE academies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_coach_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_weekdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_geo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scholarships ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ACADEMIES
-- ============================================================================

DROP POLICY IF EXISTS "academies_select" ON academies;
CREATE POLICY "academies_select" ON academies
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

COMMENT ON POLICY "academies_select" ON academies IS 
  'Permite a admins y usuarios del mismo tenant ver academias';

DROP POLICY IF EXISTS "academies_modify" ON academies;
CREATE POLICY "academies_modify" ON academies
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

COMMENT ON POLICY "academies_modify" ON academies IS 
  'Permite a admins y usuarios del mismo tenant modificar academias';

-- ============================================================================
-- PROFILES
-- ============================================================================

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    is_admin()
    OR user_id = auth.uid()
    OR tenant_id = get_current_tenant()
  );

COMMENT ON POLICY "profiles_select" ON profiles IS 
  'Permite ver: propio perfil, perfiles del mismo tenant, o todos si es admin';

DROP POLICY IF EXISTS "profiles_insert_self" ON profiles;
CREATE POLICY "profiles_insert_self" ON profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

COMMENT ON POLICY "profiles_insert_self" ON profiles IS 
  'Permite a usuarios crear solo su propio perfil';

DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON POLICY "profiles_update_self" ON profiles IS 
  'Permite a usuarios actualizar solo su propio perfil';

DROP POLICY IF EXISTS "profiles_manage_tenant" ON profiles;
CREATE POLICY "profiles_manage_tenant" ON profiles
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

COMMENT ON POLICY "profiles_manage_tenant" ON profiles IS 
  'Permite a admins y usuarios del tenant gestionar perfiles del tenant';

-- ============================================================================
-- MEMBERSHIPS
-- ============================================================================

DROP POLICY IF EXISTS "memberships_select" ON memberships;
CREATE POLICY "memberships_select" ON memberships
  FOR SELECT USING (
    is_admin() OR academy_in_current_tenant(academy_id)
  );

DROP POLICY IF EXISTS "memberships_modify" ON memberships;
CREATE POLICY "memberships_modify" ON memberships
  FOR ALL USING (
    is_admin() OR academy_in_current_tenant(academy_id)
  ) WITH CHECK (
    is_admin() OR academy_in_current_tenant(academy_id)
  );

-- ============================================================================
-- SUBSCRIPTIONS
-- ============================================================================

DROP POLICY IF EXISTS "subscriptions_select" ON subscriptions;
CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT USING (
    is_admin() OR user_id IN (
      SELECT user_id FROM profiles WHERE tenant_id = get_current_tenant()
    )
  );

DROP POLICY IF EXISTS "subscriptions_modify" ON subscriptions;
CREATE POLICY "subscriptions_modify" ON subscriptions
  FOR ALL USING (
    is_admin() OR user_id IN (
      SELECT user_id FROM profiles WHERE tenant_id = get_current_tenant()
    )
  ) WITH CHECK (
    is_admin() OR user_id IN (
      SELECT user_id FROM profiles WHERE tenant_id = get_current_tenant()
    )
  );

-- ============================================================================
-- PLANS
-- ============================================================================

DROP POLICY IF EXISTS "plans_read" ON plans;
CREATE POLICY "plans_read" ON plans
  FOR SELECT USING (auth.role() = 'authenticated');

COMMENT ON POLICY "plans_read" ON plans IS 
  'Todos los usuarios autenticados pueden ver los planes disponibles';

DROP POLICY IF EXISTS "plans_admin_only" ON plans;
CREATE POLICY "plans_admin_only" ON plans
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());

COMMENT ON POLICY "plans_admin_only" ON plans IS 
  'Solo admins pueden modificar planes';

-- ============================================================================
-- TENANT-SCOPED TABLES (Standard Pattern)
-- ============================================================================
-- Estas tablas siguen el patrón estándar: acceso por tenant_id

-- ATHLETES
DROP POLICY IF EXISTS "athletes_select" ON athletes;
CREATE POLICY "athletes_select" ON athletes
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "athletes_modify" ON athletes;
CREATE POLICY "athletes_modify" ON athletes
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- COACHES
DROP POLICY IF EXISTS "coaches_select" ON coaches;
CREATE POLICY "coaches_select" ON coaches
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "coaches_modify" ON coaches;
CREATE POLICY "coaches_modify" ON coaches
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- CLASSES
DROP POLICY IF EXISTS "classes_select" ON classes;
CREATE POLICY "classes_select" ON classes
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "classes_modify" ON classes;
CREATE POLICY "classes_modify" ON classes
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- CLASS SESSIONS
DROP POLICY IF EXISTS "class_sessions_select" ON class_sessions;
CREATE POLICY "class_sessions_select" ON class_sessions
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "class_sessions_modify" ON class_sessions;
CREATE POLICY "class_sessions_modify" ON class_sessions
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- ATTENDANCE RECORDS
DROP POLICY IF EXISTS "attendance_records_select" ON attendance_records;
CREATE POLICY "attendance_records_select" ON attendance_records
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "attendance_records_modify" ON attendance_records;
CREATE POLICY "attendance_records_modify" ON attendance_records
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- FAMILY CONTACTS
DROP POLICY IF EXISTS "family_contacts_select" ON family_contacts;
CREATE POLICY "family_contacts_select" ON family_contacts
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "family_contacts_modify" ON family_contacts;
CREATE POLICY "family_contacts_modify" ON family_contacts
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- SKILL CATALOG
DROP POLICY IF EXISTS "skill_catalog_select" ON skill_catalog;
CREATE POLICY "skill_catalog_select" ON skill_catalog
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "skill_catalog_modify" ON skill_catalog;
CREATE POLICY "skill_catalog_modify" ON skill_catalog
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- ATHLETE ASSESSMENTS
DROP POLICY IF EXISTS "athlete_assessments_select" ON athlete_assessments;
CREATE POLICY "athlete_assessments_select" ON athlete_assessments
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "athlete_assessments_modify" ON athlete_assessments;
CREATE POLICY "athlete_assessments_modify" ON athlete_assessments
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- ASSESSMENT SCORES
DROP POLICY IF EXISTS "assessment_scores_select" ON assessment_scores;
CREATE POLICY "assessment_scores_select" ON assessment_scores
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "assessment_scores_modify" ON assessment_scores;
CREATE POLICY "assessment_scores_modify" ON assessment_scores
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- COACH NOTES
DROP POLICY IF EXISTS "coach_notes_select" ON coach_notes;
CREATE POLICY "coach_notes_select" ON coach_notes
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "coach_notes_modify" ON coach_notes;
CREATE POLICY "coach_notes_modify" ON coach_notes
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- AUDIT LOGS
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "audit_logs_modify" ON audit_logs;
CREATE POLICY "audit_logs_modify" ON audit_logs
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- GUARDIANS
DROP POLICY IF EXISTS "guardians_select" ON guardians;
CREATE POLICY "guardians_select" ON guardians
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "guardians_modify" ON guardians;
CREATE POLICY "guardians_modify" ON guardians
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- GUARDIAN ATHLETES
DROP POLICY IF EXISTS "guardian_athletes_select" ON guardian_athletes;
CREATE POLICY "guardian_athletes_select" ON guardian_athletes
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "guardian_athletes_modify" ON guardian_athletes;
CREATE POLICY "guardian_athletes_modify" ON guardian_athletes
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- GROUPS
DROP POLICY IF EXISTS "groups_select" ON groups;
CREATE POLICY "groups_select" ON groups
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "groups_modify" ON groups;
CREATE POLICY "groups_modify" ON groups
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- GROUP ATHLETES
DROP POLICY IF EXISTS "group_athletes_select" ON group_athletes;
CREATE POLICY "group_athletes_select" ON group_athletes
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "group_athletes_modify" ON group_athletes;
CREATE POLICY "group_athletes_modify" ON group_athletes
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- CLASS COACH ASSIGNMENTS
DROP POLICY IF EXISTS "class_coach_assignments_select" ON class_coach_assignments;
CREATE POLICY "class_coach_assignments_select" ON class_coach_assignments
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "class_coach_assignments_modify" ON class_coach_assignments;
CREATE POLICY "class_coach_assignments_modify" ON class_coach_assignments
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- ONBOARDING STATES
DROP POLICY IF EXISTS "onboarding_states_select" ON onboarding_states;
CREATE POLICY "onboarding_states_select" ON onboarding_states
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "onboarding_states_modify" ON onboarding_states;
CREATE POLICY "onboarding_states_modify" ON onboarding_states
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- ONBOARDING CHECKLIST ITEMS
DROP POLICY IF EXISTS "onboarding_checklist_items_select" ON onboarding_checklist_items;
CREATE POLICY "onboarding_checklist_items_select" ON onboarding_checklist_items
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "onboarding_checklist_items_modify" ON onboarding_checklist_items;
CREATE POLICY "onboarding_checklist_items_modify" ON onboarding_checklist_items
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- CLASS WEEKDAYS
DROP POLICY IF EXISTS "class_weekdays_select" ON class_weekdays;
CREATE POLICY "class_weekdays_select" ON class_weekdays
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "class_weekdays_modify" ON class_weekdays;
CREATE POLICY "class_weekdays_modify" ON class_weekdays
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- CLASS GROUPS
DROP POLICY IF EXISTS "class_groups_select" ON class_groups;
CREATE POLICY "class_groups_select" ON class_groups
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "class_groups_modify" ON class_groups;
CREATE POLICY "class_groups_modify" ON class_groups
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- ============================================================================
-- EVENTS (Public + Tenant-scoped)
-- ============================================================================

DROP POLICY IF EXISTS "events_select" ON events;
CREATE POLICY "events_select" ON events
  FOR SELECT USING (
    is_public = true  -- Eventos públicos accesibles sin autenticación
    OR is_admin()
    OR tenant_id = get_current_tenant()
  );

COMMENT ON POLICY "events_select" ON events IS 
  'Permite ver eventos públicos o eventos del tenant actual';

DROP POLICY IF EXISTS "events_modify" ON events;
CREATE POLICY "events_modify" ON events
  FOR ALL USING (
    is_admin()
    OR (
      tenant_id = get_current_tenant()
      AND academy_id IN (
        SELECT id FROM academies WHERE tenant_id = get_current_tenant()
      )
    )
  ) WITH CHECK (
    is_admin()
    OR (
      tenant_id = get_current_tenant()
      AND academy_id IN (
        SELECT id FROM academies WHERE tenant_id = get_current_tenant()
      )
    )
  );

COMMENT ON POLICY "events_modify" ON events IS 
  'Solo academias del tenant pueden modificar sus eventos';

-- ============================================================================
-- INVITATIONS (Super Admin + Tenant)
-- ============================================================================

DROP POLICY IF EXISTS "invitations_select" ON invitations;
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT USING (
    is_super_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "invitations_modify" ON invitations;
CREATE POLICY "invitations_modify" ON invitations
  FOR ALL USING (
    is_super_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = get_current_tenant()
  );

-- ============================================================================
-- BILLING TABLES
-- ============================================================================

-- BILLING INVOICES
DROP POLICY IF EXISTS "billing_invoices_select" ON billing_invoices;
CREATE POLICY "billing_invoices_select" ON billing_invoices
  FOR SELECT USING (
    is_super_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "billing_invoices_modify" ON billing_invoices;
CREATE POLICY "billing_invoices_modify" ON billing_invoices
  FOR ALL USING (
    is_super_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = get_current_tenant()
  );

-- BILLING EVENTS (Super Admin Only)
DROP POLICY IF EXISTS "billing_events_select" ON billing_events;
CREATE POLICY "billing_events_select" ON billing_events
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "billing_events_modify" ON billing_events;
CREATE POLICY "billing_events_modify" ON billing_events
  FOR ALL USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- BILLING ITEMS (Academy-scoped)
DROP POLICY IF EXISTS "billing_items_select" ON billing_items;
CREATE POLICY "billing_items_select" ON billing_items
  FOR SELECT USING (
    is_admin() OR academy_in_current_tenant(academy_id)
  );

DROP POLICY IF EXISTS "billing_items_modify" ON billing_items;
CREATE POLICY "billing_items_modify" ON billing_items
  FOR ALL USING (
    is_admin() OR academy_in_current_tenant(academy_id)
  ) WITH CHECK (
    is_admin() OR academy_in_current_tenant(academy_id)
  );

-- CHARGES (Academy-scoped)
DROP POLICY IF EXISTS "charges_select" ON charges;
CREATE POLICY "charges_select" ON charges
  FOR SELECT USING (
    is_admin() OR academy_in_current_tenant(academy_id)
  );

DROP POLICY IF EXISTS "charges_modify" ON charges;
CREATE POLICY "charges_modify" ON charges
  FOR ALL USING (
    is_admin() OR academy_in_current_tenant(academy_id)
  ) WITH CHECK (
    is_admin() OR academy_in_current_tenant(academy_id)
  );

-- ============================================================================
-- USER PREFERENCES (User + Tenant)
-- ============================================================================

DROP POLICY IF EXISTS "user_preferences_select" ON user_preferences;
CREATE POLICY "user_preferences_select" ON user_preferences
  FOR SELECT USING (
    is_admin()
    OR user_id = auth.uid()
    OR (tenant_id IS NOT NULL AND tenant_id = get_current_tenant())
  );

DROP POLICY IF EXISTS "user_preferences_modify" ON user_preferences;
CREATE POLICY "user_preferences_modify" ON user_preferences
  FOR ALL USING (
    is_admin()
    OR user_id = auth.uid()
    OR (tenant_id IS NOT NULL AND tenant_id = get_current_tenant())
  ) WITH CHECK (
    is_admin()
    OR user_id = auth.uid()
    OR (tenant_id IS NOT NULL AND tenant_id = get_current_tenant())
  );

-- ============================================================================
-- EVENT LOGS (Super Admin + Academy)
-- ============================================================================

DROP POLICY IF EXISTS "event_logs_select" ON event_logs;
CREATE POLICY "event_logs_select" ON event_logs
  FOR SELECT USING (
    is_super_admin() 
    OR (academy_id IS NOT NULL AND academy_in_current_tenant(academy_id))
  );

DROP POLICY IF EXISTS "event_logs_modify" ON event_logs;
CREATE POLICY "event_logs_modify" ON event_logs
  FOR ALL USING (
    is_super_admin() 
    OR (academy_id IS NOT NULL AND academy_in_current_tenant(academy_id))
  ) WITH CHECK (
    is_super_admin() 
    OR (academy_id IS NOT NULL AND academy_in_current_tenant(academy_id))
  );

-- ============================================================================
-- ACADEMY MESSAGES (Super Admin Only - Future Feature)
-- ============================================================================

DROP POLICY IF EXISTS "academy_messages_select" ON academy_messages;
CREATE POLICY "academy_messages_select" ON academy_messages
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "academy_messages_modify" ON academy_messages;
CREATE POLICY "academy_messages_modify" ON academy_messages
  FOR ALL USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================================================
-- ACADEMY GEO GROUPS (Super Admin Only - Future Feature)
-- ============================================================================

DROP POLICY IF EXISTS "academy_geo_groups_select" ON academy_geo_groups;
CREATE POLICY "academy_geo_groups_select" ON academy_geo_groups
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "academy_geo_groups_modify" ON academy_geo_groups;
CREATE POLICY "academy_geo_groups_modify" ON academy_geo_groups
  FOR ALL USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================================================
-- CONTACT MESSAGES (Public Insert + Academy/Admin Read)
-- ============================================================================

DROP POLICY IF EXISTS "contact_messages_select" ON contact_messages;
CREATE POLICY "contact_messages_select" ON contact_messages
  FOR SELECT USING (
    is_admin() 
    OR academy_in_current_tenant(academy_id)
  );

DROP POLICY IF EXISTS "contact_messages_insert" ON contact_messages;
CREATE POLICY "contact_messages_insert" ON contact_messages
  FOR INSERT WITH CHECK (
    -- Permitir inserción pública desde formulario de contacto
    true
  );

COMMENT ON POLICY "contact_messages_insert" ON contact_messages IS 
  'Permite inserción pública de mensajes de contacto';

DROP POLICY IF EXISTS "contact_messages_modify" ON contact_messages;
CREATE POLICY "contact_messages_modify" ON contact_messages
  FOR UPDATE USING (
    is_admin() 
    OR academy_in_current_tenant(academy_id)
  ) WITH CHECK (
    is_admin() 
    OR academy_in_current_tenant(academy_id)
  );

DROP POLICY IF EXISTS "contact_messages_delete" ON contact_messages;
CREATE POLICY "contact_messages_delete" ON contact_messages
  FOR DELETE USING (
    is_admin() 
    OR academy_in_current_tenant(academy_id)
  );

-- ============================================================================
-- NOTIFICATIONS (User-scoped)
-- ============================================================================

DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT 
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON POLICY "notifications_select" ON notifications IS 
  'Usuarios pueden ver solo sus propias notificaciones';

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON POLICY "notifications_insert" ON notifications IS 
  'Service role puede crear notificaciones';

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON POLICY "notifications_update" ON notifications IS 
  'Usuarios pueden actualizar sus propias notificaciones (marcar como leídas)';

DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON POLICY "notifications_delete" ON notifications IS 
  'Usuarios pueden eliminar sus propias notificaciones';

-- ============================================================================
-- EMAIL LOGS (Tenant-scoped + Service Role)
-- ============================================================================

DROP POLICY IF EXISTS "email_logs_select" ON email_logs;
CREATE POLICY "email_logs_select" ON email_logs
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "email_logs_select" ON email_logs IS 
  'Usuarios pueden ver logs de emails de su tenant';

DROP POLICY IF EXISTS "email_logs_insert" ON email_logs;
CREATE POLICY "email_logs_insert" ON email_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON POLICY "email_logs_insert" ON email_logs IS 
  'Service role puede crear logs de emails';

-- ============================================================================
-- SCHOLARSHIPS (Tenant-scoped + Admin)
-- ============================================================================

DROP POLICY IF EXISTS "scholarships_select" ON scholarships;
CREATE POLICY "scholarships_select" ON scholarships
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "scholarships_select" ON scholarships IS 
  'Usuarios pueden ver becas de su tenant';

DROP POLICY IF EXISTS "scholarships_manage" ON scholarships;
CREATE POLICY "scholarships_manage" ON scholarships
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    ) AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner', 'super_admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    ) AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner', 'super_admin')
    )
  );

COMMENT ON POLICY "scholarships_manage" ON scholarships IS 
  'Solo admins/owners pueden gestionar becas';

-- ============================================================================
-- DISCOUNTS (Tenant-scoped + Admin)
-- ============================================================================

DROP POLICY IF EXISTS "discounts_select" ON discounts;
CREATE POLICY "discounts_select" ON discounts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "discounts_select" ON discounts IS 
  'Usuarios pueden ver descuentos de su tenant';

DROP POLICY IF EXISTS "discounts_manage" ON discounts;
CREATE POLICY "discounts_manage" ON discounts
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    ) AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner', 'super_admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    ) AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner', 'super_admin')
    )
  );

COMMENT ON POLICY "discounts_manage" ON discounts IS 
  'Solo admins/owners pueden gestionar descuentos';

-- ============================================================================
-- RECEIPTS (Tenant-scoped + Service Role)
-- ============================================================================

DROP POLICY IF EXISTS "receipts_select" ON receipts;
CREATE POLICY "receipts_select" ON receipts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "receipts_select" ON receipts IS 
  'Usuarios pueden ver recibos de su tenant';

DROP POLICY IF EXISTS "receipts_insert" ON receipts;
CREATE POLICY "receipts_insert" ON receipts
  FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON POLICY "receipts_insert" ON receipts IS 
  'Service role puede crear recibos';

-- ============================================================================
-- EVENT INVITATIONS (Tenant-scoped)
-- ============================================================================

DROP POLICY IF EXISTS "event_invitations_select" ON event_invitations;
CREATE POLICY "event_invitations_select" ON event_invitations
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "event_invitations_select" ON event_invitations IS 
  'Usuarios pueden ver invitaciones de eventos de su tenant';

DROP POLICY IF EXISTS "event_invitations_manage" ON event_invitations;
CREATE POLICY "event_invitations_manage" ON event_invitations
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "event_invitations_manage" ON event_invitations IS 
  'Usuarios pueden gestionar invitaciones de eventos de su tenant';

-- ============================================================================
-- NOTIFICATION PREFERENCES (User-scoped)
-- ============================================================================

DROP POLICY IF EXISTS "notification_preferences_manage" ON notification_preferences;
CREATE POLICY "notification_preferences_manage" ON notification_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON POLICY "notification_preferences_manage" ON notification_preferences IS 
  'Usuarios pueden gestionar sus propias preferencias de notificaciones';

-- ============================================================================
-- END OF CONSOLIDATED RLS POLICIES
-- ============================================================================
