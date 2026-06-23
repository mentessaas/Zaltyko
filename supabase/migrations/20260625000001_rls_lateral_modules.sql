-- RLS para modulos laterales sin proteccion.
-- Tablas afectadas:
--   - announcements (academy_id)
--   - announcement_read_status (user_id + announcement_id)
--   - conversation_participants (user_id + conversation_id)
--   - conversation_messages (sender_id + conversation_id)
--   - message_read_receipts (user_id + message_id)

-- announcements: tenant via academy_id
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "announcements" TO authenticated, service_role;

DROP POLICY IF EXISTS "announcements_tenant_access" ON "announcements";
CREATE POLICY "announcements_tenant_access" ON "announcements"
  FOR ALL USING (
    is_admin() OR academy_in_current_tenant(academy_id)
  )
  WITH CHECK (
    is_admin() OR academy_in_current_tenant(academy_id)
  );

-- announcement_read_status: acceso si user_id = caller o announcement del tenant
ALTER TABLE "announcement_read_status" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "announcement_read_status" TO authenticated, service_role;

DROP POLICY IF EXISTS "announcement_read_status_user_or_tenant" ON "announcement_read_status";
CREATE POLICY "announcement_read_status_user_or_tenant" ON "announcement_read_status"
  FOR ALL USING (
    is_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM announcements a
      WHERE a.id = announcement_read_status.announcement_id
        AND academy_in_current_tenant(a.academy_id)
    )
  )
  WITH CHECK (
    is_admin() OR user_id = auth.uid()
  );

-- conversation_participants: solo si user_id = caller o admin
ALTER TABLE "conversation_participants" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "conversation_participants" TO authenticated, service_role;

DROP POLICY IF EXISTS "conversation_participants_user_access" ON "conversation_participants";
CREATE POLICY "conversation_participants_user_access" ON "conversation_participants"
  FOR ALL USING (
    is_admin() OR user_id = auth.uid()
  )
  WITH CHECK (
    is_admin() OR user_id = auth.uid()
  );

-- conversation_messages: sender o participante de la conversacion
ALTER TABLE "conversation_messages" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "conversation_messages" TO authenticated, service_role;

DROP POLICY IF EXISTS "conversation_messages_participant_access" ON "conversation_messages";
CREATE POLICY "conversation_messages_participant_access" ON "conversation_messages"
  FOR ALL USING (
    is_admin()
    OR sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversation_messages.conversation_id
        AND cp.user_id = auth.uid()
        AND cp.hidden_at IS NULL
    )
  )
  WITH CHECK (
    is_admin() OR sender_id = auth.uid()
  );

-- message_read_receipts: solo el user puede marcar/ver su propio read receipt
ALTER TABLE "message_read_receipts" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "message_read_receipts" TO authenticated, service_role;

DROP POLICY IF EXISTS "message_read_receipts_user_access" ON "message_read_receipts";
CREATE POLICY "message_read_receipts_user_access" ON "message_read_receipts"
  FOR ALL USING (
    is_admin() OR user_id = auth.uid()
  )
  WITH CHECK (
    is_admin() OR user_id = auth.uid()
  );
