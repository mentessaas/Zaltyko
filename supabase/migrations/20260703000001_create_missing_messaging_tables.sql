-- Crear 4 tablas de mensajería definidas en el ORM que faltaban en la DB real
-- (verificado 2026-07-03). class_exceptions se corrige aparte en 0006 (FK + RLS).
--
-- Desbloquea el cron scheduled-notifications + módulo mensajería:
--   scheduled_notifications, message_templates, message_groups, notification_preferences
--
-- DDL derivado 1:1 de src/db/schema/communication.ts.
-- RLS replica los patrones LIVE de producción:
--   tenant-scoped -> is_admin() OR academy_in_current_tenant(tenant_id)
--   user-scoped   -> profile_id resuelto vía profiles (profiles.id != auth.uid();
--                    auth.uid() = profiles.user_id, verificado en prod).

-- ============================================================================
-- message_templates (tenant-scoped; tenant_id NULL = plantilla de sistema)
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  sport_config_id uuid REFERENCES academy_sport_configs(id) ON DELETE SET NULL,
  name varchar(200) NOT NULL,
  description text,
  channel varchar(50) NOT NULL DEFAULT 'whatsapp',
  template_type varchar(100) NOT NULL,
  subject varchar(200),
  body text NOT NULL,
  variables jsonb,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS message_templates_tenant_idx ON message_templates (tenant_id);
CREATE INDEX IF NOT EXISTS message_templates_sport_config_idx ON message_templates (sport_config_id);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_templates_select" ON message_templates;
CREATE POLICY "message_templates_select" ON message_templates
  FOR SELECT USING (is_admin() OR tenant_id IS NULL OR academy_in_current_tenant(tenant_id));
DROP POLICY IF EXISTS "message_templates_modify" ON message_templates;
CREATE POLICY "message_templates_modify" ON message_templates
  FOR ALL USING (is_admin() OR academy_in_current_tenant(tenant_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(tenant_id));

-- ============================================================================
-- message_groups (tenant-scoped)
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name varchar(200) NOT NULL,
  description text,
  recipient_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_groups_tenant_idx ON message_groups (tenant_id);

ALTER TABLE message_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_groups_select" ON message_groups;
CREATE POLICY "message_groups_select" ON message_groups
  FOR SELECT USING (is_admin() OR academy_in_current_tenant(tenant_id));
DROP POLICY IF EXISTS "message_groups_modify" ON message_groups;
CREATE POLICY "message_groups_modify" ON message_groups
  FOR ALL USING (is_admin() OR academy_in_current_tenant(tenant_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(tenant_id));

-- ============================================================================
-- scheduled_notifications (tenant-scoped; el cron la lee vía service role)
-- ============================================================================
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  group_id uuid,
  template_id uuid,
  channel varchar(50) NOT NULL DEFAULT 'whatsapp',
  scheduled_for timestamptz NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_notifications_tenant_idx ON scheduled_notifications (tenant_id);
CREATE INDEX IF NOT EXISTS scheduled_notifications_status_idx ON scheduled_notifications (status);

ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scheduled_notifications_select" ON scheduled_notifications;
CREATE POLICY "scheduled_notifications_select" ON scheduled_notifications
  FOR SELECT USING (is_admin() OR academy_in_current_tenant(tenant_id));
DROP POLICY IF EXISTS "scheduled_notifications_modify" ON scheduled_notifications;
CREATE POLICY "scheduled_notifications_modify" ON scheduled_notifications
  FOR ALL USING (is_admin() OR academy_in_current_tenant(tenant_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(tenant_id));

-- ============================================================================
-- notification_preferences (user-scoped; profile_id -> profiles.id)
-- profiles.id != auth.uid() (verificado): auth.uid() = profiles.user_id.
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  channel varchar(50) NOT NULL DEFAULT 'whatsapp',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS notification_preferences_profile_idx ON notification_preferences (profile_id);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_preferences_select" ON notification_preferences;
CREATE POLICY "notification_preferences_select" ON notification_preferences
  FOR SELECT USING (
    is_admin() OR profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "notification_preferences_modify" ON notification_preferences;
CREATE POLICY "notification_preferences_modify" ON notification_preferences
  FOR ALL USING (
    is_admin() OR profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    is_admin() OR profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );
