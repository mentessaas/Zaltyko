# Configuración de Supabase Storage para Fotos de Perfil

## Requisitos

Para que la funcionalidad de subida de fotos de perfil funcione correctamente, necesitas configurar un bucket de almacenamiento en Supabase.

## Pasos de Configuración

### 1. Crear el Bucket en Supabase

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **Storage** en el menú lateral
3. Haz clic en **New bucket**
4. Configura el bucket con:
   - **Name**: `avatars`
   - **Public bucket**: ✅ Activado (para que las imágenes sean accesibles públicamente)
   - **File size limit**: 5 MB (o el límite que prefieras)
   - **Allowed MIME types**: `image/jpeg,image/jpg,image/png,image/webp`

### 2. Configurar Políticas RLS (Row Level Security)

En el SQL Editor de Supabase, ejecuta las siguientes políticas:

```sql
-- Permitir a usuarios autenticados subir sus propias fotos
CREATE POLICY "Users can upload their own profile photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir a usuarios autenticados leer sus propias fotos
CREATE POLICY "Users can read their own profile photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir lectura pública de fotos de perfil
CREATE POLICY "Public can read profile photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Permitir a usuarios autenticados actualizar sus propias fotos
CREATE POLICY "Users can update their own profile photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir a usuarios autenticados eliminar sus propias fotos
CREATE POLICY "Users can delete their own profile photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

### 3. Verificar Configuración

Una vez configurado, los usuarios podrán:
- Subir fotos de perfil desde el formulario de edición
- Ver sus propias fotos y las de otros usuarios (si son públicas)
- Actualizar o eliminar sus propias fotos

## Estructura de Archivos

Las fotos se almacenan con la siguiente estructura:
```
avatars/
  └── {user_id}/
      └── {uuid}.{ext}
```

Ejemplo: `avatars/123e4567-e89b-12d3-a456-426614174000/abc123.jpg`

## Notas Importantes

- El tamaño máximo de archivo es de 5MB por defecto
- Solo se permiten formatos: JPG, PNG, WebP
- Las imágenes se almacenan de forma pública para facilitar el acceso
- Cada usuario solo puede subir/editar/eliminar sus propias fotos gracias a las políticas RLS

