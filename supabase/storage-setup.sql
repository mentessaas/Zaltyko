-- ============================================
-- CONFIGURACIÓN DE SUPABASE STORAGE
-- ============================================
-- Este script configura el bucket de Storage para uploads
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- ============================================

-- Crear bucket 'uploads' si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  false, -- Bucket privado
  5242880, -- 5MB en bytes
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- POLÍTICAS RLS PARA STORAGE
-- ============================================

-- Política: Usuarios autenticados pueden subir archivos
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Política: Usuarios pueden leer sus propios archivos
CREATE POLICY "Users can read their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Política: Usuarios pueden actualizar sus propios archivos
CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Política: Usuarios pueden eliminar sus propios archivos
CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Política: Service role puede hacer todo (para el endpoint de upload)
CREATE POLICY "Service role has full access"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'uploads')
WITH CHECK (bucket_id = 'uploads');

-- Comentarios
COMMENT ON POLICY "Authenticated users can upload files" ON storage.objects IS 
  'Permite a usuarios autenticados subir archivos al bucket uploads';
COMMENT ON POLICY "Users can read their own files" ON storage.objects IS 
  'Permite a usuarios leer sus propios archivos del bucket uploads';
COMMENT ON POLICY "Users can update their own files" ON storage.objects IS 
  'Permite a usuarios actualizar sus propios archivos del bucket uploads';
COMMENT ON POLICY "Users can delete their own files" ON storage.objects IS 
  'Permite a usuarios eliminar sus propios archivos del bucket uploads';
COMMENT ON POLICY "Service role has full access" ON storage.objects IS 
  'Permite al service role acceso completo para operaciones del servidor';

