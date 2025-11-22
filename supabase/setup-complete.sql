-- ============================================
-- SCRIPT DE VERIFICACIÓN DE CONFIGURACIÓN
-- ============================================
-- Ejecuta este script DESPUÉS de ejecutar:
-- 1. storage-setup.sql
-- 2. realtime-setup.sql
-- 3. rls-policies.sql
-- ============================================

-- Verificar que el bucket existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'uploads'
  ) THEN
    RAISE WARNING '❌ El bucket uploads NO existe. Ejecuta storage-setup.sql primero.';
  ELSE
    RAISE NOTICE '✅ Bucket uploads existe';
  END IF;
END $$;

-- Verificar que Realtime está habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'notifications'
  ) THEN
    RAISE WARNING '❌ Realtime NO está habilitado para notifications. Ejecuta realtime-setup.sql primero.';
  ELSE
    RAISE NOTICE '✅ Realtime habilitado para notifications';
  END IF;
END $$;

-- Verificar políticas RLS
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'notifications';
  
  IF policy_count < 3 THEN
    RAISE WARNING '⚠️ Faltan políticas RLS para notifications. Ejecuta rls-policies.sql primero.';
  ELSE
    RAISE NOTICE '✅ Políticas RLS configuradas para notifications (%)', policy_count;
  END IF;
END $$;

-- Resumen de configuración
SELECT 
  'Storage' as componente,
  CASE 
    WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'uploads')
    THEN '✅ Configurado'
    ELSE '❌ No configurado'
  END as estado
UNION ALL
SELECT 
  'Realtime',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'notifications'
    )
    THEN '✅ Configurado'
    ELSE '❌ No configurado'
  END
UNION ALL
SELECT 
  'RLS Policies',
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'notifications') >= 3
    THEN '✅ Configurado'
    ELSE '❌ No configurado'
  END;

