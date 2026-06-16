-- ============================================
-- CONFIGURACIÓN POST-MIGRACIÓN
-- ============================================
-- Este script completa la configuración de Supabase
-- después de ejecutar las migraciones de Drizzle
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- ============================================

-- ============================================
-- 1. HABILITAR REALTIME PARA NOTIFICACIONES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications'
  ) THEN
    -- Intentar agregar a Realtime (puede fallar si ya está agregado)
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
      RAISE NOTICE '✅ Realtime habilitado para notifications';
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE 'ℹ️ Realtime ya estaba habilitado para notifications';
      WHEN OTHERS THEN
        RAISE WARNING '⚠️ Error al habilitar Realtime: %', SQLERRM;
    END;
  ELSE
    RAISE WARNING '⚠️ Tabla notifications no existe. Ejecuta las migraciones primero.';
  END IF;
END $$;

-- ============================================
-- 2. CREAR FUNCIÓN Y TRIGGER PARA NOTIFICACIONES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications'
  ) THEN
    -- Crear función para notificar cambios
    CREATE OR REPLACE FUNCTION notify_new_notification()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM pg_notify(
        'new_notification',
        json_build_object(
          'id', NEW.id,
          'user_id', NEW.user_id,
          'type', NEW.type,
          'title', NEW.title
        )::text
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Crear trigger
    DROP TRIGGER IF EXISTS on_notification_insert ON notifications;
    CREATE TRIGGER on_notification_insert
      AFTER INSERT ON notifications
      FOR EACH ROW
      EXECUTE FUNCTION notify_new_notification();
    
    RAISE NOTICE '✅ Función y trigger creados para notifications';
  END IF;
END $$;

-- ============================================
-- 3. POLÍTICAS RLS PARA NOTIFICACIONES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications'
  ) THEN
    DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
    CREATE POLICY "Users can view their own notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

    DROP POLICY IF EXISTS "Service role can create notifications" ON notifications;
    CREATE POLICY "Service role can create notifications"
    ON notifications FOR INSERT
    TO service_role
    WITH CHECK (true);

    DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
    CREATE POLICY "Users can update their own notifications"
    ON notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;
    CREATE POLICY "Users can delete their own notifications"
    ON notifications FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
    
    RAISE NOTICE '✅ Políticas RLS creadas para notifications';
  END IF;
END $$;

-- ============================================
-- 4. POLÍTICAS RLS PARA EMAIL_LOGS
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'email_logs'
  ) THEN
    DROP POLICY IF EXISTS "Users can view email logs from their tenant" ON email_logs;
    CREATE POLICY "Users can view email logs from their tenant"
    ON email_logs FOR SELECT
    TO authenticated
    USING (
      tenant_id IN (
        SELECT tenant_id FROM profiles WHERE id = auth.uid()
      )
    );

    DROP POLICY IF EXISTS "Service role can create email logs" ON email_logs;
    CREATE POLICY "Service role can create email logs"
    ON email_logs FOR INSERT
    TO service_role
    WITH CHECK (true);
    
    RAISE NOTICE '✅ Políticas RLS creadas para email_logs';
  END IF;
END $$;

-- ============================================
-- 5. POLÍTICAS RLS PARA SCHOLARSHIPS
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'scholarships'
  ) THEN
    DROP POLICY IF EXISTS "Users can view scholarships from their tenant" ON scholarships;
    CREATE POLICY "Users can view scholarships from their tenant"
    ON scholarships FOR SELECT
    TO authenticated
    USING (
      tenant_id IN (
        SELECT tenant_id FROM profiles WHERE id = auth.uid()
      )
    );

    DROP POLICY IF EXISTS "Admins can manage scholarships" ON scholarships;
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
    
    RAISE NOTICE '✅ Políticas RLS creadas para scholarships';
  END IF;
END $$;

-- ============================================
-- 6. POLÍTICAS RLS PARA DISCOUNTS
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'discounts'
  ) THEN
    DROP POLICY IF EXISTS "Users can view discounts from their tenant" ON discounts;
    CREATE POLICY "Users can view discounts from their tenant"
    ON discounts FOR SELECT
    TO authenticated
    USING (
      tenant_id IN (
        SELECT tenant_id FROM profiles WHERE id = auth.uid()
      )
    );

    DROP POLICY IF EXISTS "Admins can manage discounts" ON discounts;
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
    
    RAISE NOTICE '✅ Políticas RLS creadas para discounts';
  END IF;
END $$;

-- ============================================
-- 7. POLÍTICAS RLS PARA RECEIPTS
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'receipts'
  ) THEN
    DROP POLICY IF EXISTS "Users can view receipts from their tenant" ON receipts;
    CREATE POLICY "Users can view receipts from their tenant"
    ON receipts FOR SELECT
    TO authenticated
    USING (
      tenant_id IN (
        SELECT tenant_id FROM profiles WHERE id = auth.uid()
      )
    );

    DROP POLICY IF EXISTS "Service role can create receipts" ON receipts;
    CREATE POLICY "Service role can create receipts"
    ON receipts FOR INSERT
    TO service_role
    WITH CHECK (true);
    
    RAISE NOTICE '✅ Políticas RLS creadas para receipts';
  END IF;
END $$;

-- ============================================
-- 8. POLÍTICAS RLS PARA EVENT_INVITATIONS
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'event_invitations'
  ) THEN
    DROP POLICY IF EXISTS "Users can view event invitations from their tenant" ON event_invitations;
    CREATE POLICY "Users can view event invitations from their tenant"
    ON event_invitations FOR SELECT
    TO authenticated
    USING (
      tenant_id IN (
        SELECT tenant_id FROM profiles WHERE id = auth.uid()
      )
    );

    DROP POLICY IF EXISTS "Users can manage event invitations" ON event_invitations;
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
    
    RAISE NOTICE '✅ Políticas RLS creadas para event_invitations';
  END IF;
END $$;

-- ============================================
-- 9. POLÍTICAS RLS PARA NOTIFICATION_PREFERENCES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_preferences'
  ) THEN
    DROP POLICY IF EXISTS "Users can manage their own notification preferences" ON notification_preferences;
    CREATE POLICY "Users can manage their own notification preferences"
    ON notification_preferences FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
    
    RAISE NOTICE '✅ Políticas RLS creadas para notification_preferences';
  END IF;
END $$;

-- ============================================
-- VERIFICACIÓN FINAL
-- ============================================

SELECT 
  'Storage Bucket' as componente,
  CASE 
    WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'uploads')
    THEN '✅ Configurado'
    ELSE '❌ No configurado'
  END as estado
UNION ALL
SELECT 
  'Storage Policies',
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects') >= 5
    THEN '✅ Configurado (' || (SELECT COUNT(*)::text FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects') || ' políticas)'
    ELSE '⚠️ Faltan políticas'
  END
UNION ALL
SELECT 
  'Realtime (notifications)',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'notifications'
    )
    THEN '✅ Habilitado'
    ELSE '⚠️ No habilitado'
  END
UNION ALL
SELECT 
  'RLS Policies',
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('notifications', 'email_logs', 'scholarships', 'discounts', 'receipts', 'event_invitations', 'notification_preferences')) > 0
    THEN '✅ Configurado (' || (SELECT COUNT(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('notifications', 'email_logs', 'scholarships', 'discounts', 'receipts', 'event_invitations', 'notification_preferences')) || ' políticas)'
    ELSE '⚠️ Sin políticas'
  END;

-- Mensaje final
DO $$
BEGIN
  RAISE NOTICE '🎉 Script de configuración post-migración completado';
  RAISE NOTICE 'Revisa los mensajes anteriores para ver qué se configuró correctamente';
END $$;

