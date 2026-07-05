-- Crear message_history (definida en el ORM, faltaba en la DB real).
-- Completa el módulo de mensajería: communication-service.ts hace insert/select
-- sobre esta tabla en cada envío; sin ella, enviar un mensaje lanza
-- "relation does not exist". Tenant-scoped por tenant_id (nullable).
-- DDL 1:1 de src/db/schema/message-history.ts; RLS con patrón live.

CREATE TABLE IF NOT EXISTS message_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  profile_id uuid,
  sport_config_id uuid REFERENCES academy_sport_configs(id) ON DELETE SET NULL,
  phone text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  direction text NOT NULL DEFAULT 'outbound',
  status text NOT NULL DEFAULT 'pending',
  message text NOT NULL,
  template_id uuid,
  meta jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_history_tenant_idx ON message_history (tenant_id);
CREATE INDEX IF NOT EXISTS message_history_profile_idx ON message_history (profile_id);
CREATE INDEX IF NOT EXISTS message_history_sport_config_idx ON message_history (sport_config_id);
CREATE INDEX IF NOT EXISTS message_history_status_idx ON message_history (status);
CREATE INDEX IF NOT EXISTS message_history_created_at_idx ON message_history (created_at);

ALTER TABLE message_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_history_select" ON message_history;
CREATE POLICY "message_history_select" ON message_history
  FOR SELECT USING (is_admin() OR academy_in_current_tenant(tenant_id));
DROP POLICY IF EXISTS "message_history_modify" ON message_history;
CREATE POLICY "message_history_modify" ON message_history
  FOR ALL USING (is_admin() OR academy_in_current_tenant(tenant_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(tenant_id));
