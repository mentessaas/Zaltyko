-- ============================================
-- CONFIGURACIÓN DE SUPABASE REALTIME
-- ============================================
-- Este script habilita Realtime para notificaciones
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- ============================================

-- Habilitar Realtime para la tabla notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Verificar que la tabla notifications existe y tiene las columnas necesarias
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications'
  ) THEN
    RAISE EXCEPTION 'La tabla notifications no existe. Ejecuta primero las migraciones.';
  END IF;
END $$;

-- Crear función para notificar cambios (opcional, para notificaciones más avanzadas)
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

-- Crear trigger para notificar nuevos inserts (opcional)
DROP TRIGGER IF EXISTS on_notification_insert ON notifications;
CREATE TRIGGER on_notification_insert
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_notification();

-- Comentarios
COMMENT ON FUNCTION notify_new_notification() IS 
  'Función que notifica cuando se crea una nueva notificación';
COMMENT ON TRIGGER on_notification_insert ON notifications IS 
  'Trigger que ejecuta notify_new_notification() cuando se inserta una notificación';

