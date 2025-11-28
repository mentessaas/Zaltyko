-- ============================================================================
-- ⚠️  DEPRECATION NOTICE ⚠️
-- ============================================================================
-- Este archivo está DEPRECADO y será eliminado en futuras versiones.
-- 
-- Por favor, usa el archivo consolidado:
--   → supabase/rls-consolidated.sql
--
-- Todas las políticas de este archivo han sido migradas al archivo consolidado.
-- Este archivo se mantiene temporalmente para referencia, pero NO debe
-- ser modificado ni usado para aplicar políticas RLS.
--
-- Fecha de deprecación: 2025-11-26
-- ============================================================================

-- ============================================
-- POLÍTICAS RLS ADICIONALES PARA NUEVAS TABLAS
-- ============================================
-- Este script agrega políticas RLS para las nuevas tablas creadas
-- Ejecutar después de aplicar las migraciones
-- ============================================

-- ============================================
-- POLÍTICAS PARA NOTIFICACIONES
-- ============================================

-- Política: Usuarios pueden ver solo sus propias notificaciones
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Política: Service role puede crear notificaciones
CREATE POLICY "Service role can create notifications"
ON notifications FOR INSERT
TO service_role
WITH CHECK (true);

-- Política: Usuarios pueden actualizar sus propias notificaciones (marcar como leídas)
CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Política: Usuarios pueden eliminar sus propias notificaciones
CREATE POLICY "Users can delete their own notifications"
ON notifications FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- POLÍTICAS PARA EMAIL_LOGS
-- ============================================

-- Política: Usuarios pueden ver logs de emails de su tenant
CREATE POLICY "Users can view email logs from their tenant"
ON email_logs FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  )
);

-- Política: Service role puede crear logs de emails
CREATE POLICY "Service role can create email logs"
ON email_logs FOR INSERT
TO service_role
WITH CHECK (true);

-- ============================================
-- POLÍTICAS PARA SCHOLARSHIPS
-- ============================================

-- Política: Usuarios pueden ver becas de su tenant
CREATE POLICY "Users can view scholarships from their tenant"
ON scholarships FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  )
);

-- Política: Usuarios con rol admin/owner pueden gestionar becas
CREATE POLICY "Admins can manage scholarships"
ON scholarships FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
);

-- ============================================
-- POLÍTICAS PARA DISCOUNTS
-- ============================================

-- Política: Usuarios pueden ver descuentos de su tenant
CREATE POLICY "Users can view discounts from their tenant"
ON discounts FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  )
);

-- Política: Usuarios con rol admin/owner pueden gestionar descuentos
CREATE POLICY "Admins can manage discounts"
ON discounts FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
);

-- ============================================
-- POLÍTICAS PARA RECEIPTS
-- ============================================

-- Política: Usuarios pueden ver recibos de su tenant
CREATE POLICY "Users can view receipts from their tenant"
ON receipts FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  )
);

-- Política: Service role puede crear recibos
CREATE POLICY "Service role can create receipts"
ON receipts FOR INSERT
TO service_role
WITH CHECK (true);

-- ============================================
-- POLÍTICAS PARA EVENT_INVITATIONS
-- ============================================

-- Política: Usuarios pueden ver invitaciones de eventos de su tenant
CREATE POLICY "Users can view event invitations from their tenant"
ON event_invitations FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  )
);

-- Política: Usuarios pueden gestionar invitaciones de eventos
CREATE POLICY "Users can manage event invitations"
ON event_invitations FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  )
);

-- ============================================
-- POLÍTICAS PARA NOTIFICATION_PREFERENCES
-- ============================================

-- Política: Usuarios pueden ver y gestionar sus propias preferencias
CREATE POLICY "Users can manage their own notification preferences"
ON notification_preferences FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================
-- COMENTARIOS
-- ============================================

COMMENT ON POLICY "Users can view their own notifications" ON notifications IS 
  'Permite a usuarios ver solo sus propias notificaciones';
COMMENT ON POLICY "Service role can create notifications" ON notifications IS 
  'Permite al service role crear notificaciones para cualquier usuario';
COMMENT ON POLICY "Users can update their own notifications" ON notifications IS 
  'Permite a usuarios marcar sus notificaciones como leídas';
COMMENT ON POLICY "Users can delete their own notifications" ON notifications IS 
  'Permite a usuarios eliminar sus propias notificaciones';

