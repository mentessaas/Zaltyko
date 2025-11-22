# 📦 Guía de Uso de Storage

Storage está completamente configurado y listo para usar.

## ✅ Configuración Actual

### Bucket `uploads`
- **Nombre:** `uploads`
- **Tipo:** Privado (no público)
- **Límite de tamaño:** 5MB por archivo
- **Tipos permitidos:**
  - `image/jpeg`
  - `image/png`
  - `image/gif`
  - `image/webp`

### Políticas de Seguridad
- ✅ Usuarios autenticados pueden subir archivos
- ✅ Usuarios pueden leer sus propios archivos
- ✅ Usuarios pueden actualizar sus propios archivos
- ✅ Usuarios pueden eliminar sus propios archivos
- ✅ Service role tiene acceso completo (para el endpoint del servidor)

---

## 🚀 Cómo Usar

### 1. Desde el Frontend (Componente React)

```typescript
import { useState } from 'react';

export function FileUploader({ academyId, folder = 'uploads' }: { academyId: string; folder?: string }) {
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('academyId', academyId);
    formData.append('folder', folder);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.ok) {
        setUrl(data.url);
        console.log('Archivo subido:', data.path);
      } else {
        console.error('Error:', data.error);
      }
    } catch (error) {
      console.error('Error al subir:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
        disabled={uploading}
      />
      {uploading && <p>Subiendo...</p>}
      {url && <img src={url} alt="Uploaded" />}
    </div>
  );
}
```

### 2. Desde el Backend (API Route)

El endpoint `/api/upload` ya está configurado y listo para usar:

```typescript
// Ejemplo de uso desde otro endpoint
const formData = new FormData();
formData.append('file', file);
formData.append('academyId', academyId);
formData.append('folder', 'coach-gallery'); // o 'athlete-photos', etc.

const response = await fetch('/api/upload', {
  method: 'POST',
  headers: {
    'Cookie': sessionCookie, // Necesario para autenticación
  },
  body: formData,
});

const { ok, url, path } = await response.json();
```

### 3. Usando los Helpers Directamente

```typescript
import { uploadFile, generateFilePath, getPublicUrl } from '@/lib/supabase/storage-helpers';

// Subir archivo
const path = generateFilePath(tenantId, academyId, 'coach-gallery', file.name);
const { url, path: filePath } = await uploadFile(file, path, {
  contentType: file.type,
  upsert: false,
});

// Obtener URL pública
const publicUrl = getPublicUrl(filePath);

// Eliminar archivo
await deleteFile(filePath);
```

---

## 📁 Estructura de Carpetas

Los archivos se organizan automáticamente con esta estructura:

```
uploads/
  └── {tenantId}/
      └── {academyId}/
          └── {folder}/
              └── {timestamp}-{random}.{ext}
```

**Ejemplo:**
```
uploads/
  └── abc123-tenant/
      └── def456-academy/
          └── coach-gallery/
              └── 1703123456789-xyz789.jpg
```

### Carpetas Recomendadas

- `coach-gallery` - Fotos de entrenadores
- `athlete-photos` - Fotos de atletas
- `event-images` - Imágenes de eventos
- `documents` - Documentos (si se permite en el futuro)
- `receipts` - Recibos en PDF (si se almacenan)

---

## 🔒 Seguridad

### Validaciones Implementadas

1. **Tipo de archivo:** Solo imágenes (JPEG, PNG, GIF, WEBP)
2. **Tamaño máximo:** 5MB por archivo
3. **Autenticación:** Usuario debe estar autenticado
4. **Tenant isolation:** Usuarios solo pueden acceder a archivos de su tenant
5. **Estructura de carpetas:** Basada en tenant/academy/folder

### Políticas RLS

- Los usuarios solo pueden ver archivos en su carpeta (`{userId}/...`)
- El service role puede acceder a todo (para operaciones del servidor)
- Las políticas previenen acceso cruzado entre tenants

---

## 🧪 Testing

### Probar Upload desde Terminal

```bash
curl -X POST http://localhost:3000/api/upload \
  -H "Cookie: your-session-cookie" \
  -F "file=@/path/to/test-image.jpg" \
  -F "academyId=your-academy-id" \
  -F "folder=coach-gallery"
```

### Respuesta Esperada

```json
{
  "ok": true,
  "url": "https://your-project.supabase.co/storage/v1/object/public/uploads/tenant/academy/folder/file.jpg",
  "path": "tenant/academy/folder/1703123456789-xyz789.jpg"
}
```

### Errores Comunes

```json
// Archivo muy grande
{
  "error": "FILE_TOO_LARGE",
  "message": "El archivo no puede ser mayor a 5MB"
}

// Tipo no permitido
{
  "error": "INVALID_FILE_TYPE",
  "message": "Solo se permiten imágenes (JPEG, PNG, GIF, WEBP)"
}

// No autenticado
{
  "error": "UNAUTHORIZED"
}
```

---

## 📝 Ejemplos de Uso

### Subir Foto de Entrenador

```typescript
// En el componente de perfil de entrenador
const handlePhotoUpload = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('academyId', academyId);
  formData.append('folder', 'coach-gallery');

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const { url } = await response.json();
  
  // Actualizar perfil del entrenador con la URL
  await updateCoachProfile(coachId, { photoUrl: url });
};
```

### Subir Foto de Atleta

```typescript
// En el componente de perfil de atleta
const handleAthletePhoto = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('academyId', academyId);
  formData.append('folder', 'athlete-photos');

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const { url } = await response.json();
  
  // Guardar URL en el perfil del atleta
  await updateAthlete(athleteId, { photoUrl: url });
};
```

### Eliminar Archivo

```typescript
import { deleteFile } from '@/lib/supabase/storage-helpers';

// Eliminar archivo
await deleteFile('tenant/academy/folder/file.jpg');
```

---

## ✅ Checklist de Uso

- [x] Bucket `uploads` creado
- [x] Políticas RLS configuradas
- [x] Endpoint `/api/upload` funcionando
- [x] Helpers de Storage disponibles
- [x] Validaciones implementadas
- [x] Estructura de carpetas definida

---

## 🎉 ¡Listo para Usar!

Storage está completamente configurado y funcionando. Puedes empezar a subir archivos inmediatamente usando el endpoint `/api/upload` o los helpers de Storage.

