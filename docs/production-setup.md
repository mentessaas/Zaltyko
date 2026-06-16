# Configuración para Producción

Esta guía detalla los pasos necesarios para configurar el proyecto en producción.

## 1. Dependencias Instaladas

Las siguientes dependencias ya están instaladas:
- ✅ `jspdf` y `jspdf-autotable` - Para generación de PDFs

## 2. Configuración de Supabase Storage

### Crear bucket de Storage

1. Ve a tu proyecto de Supabase Dashboard
2. Navega a **Storage** → **Buckets**
3. Crea un nuevo bucket llamado `uploads` con las siguientes configuraciones:
   - **Public bucket**: No (privado)
   - **File size limit**: 5MB
   - **Allowed MIME types**: `image/jpeg, image/png, image/gif, image/webp`

### Configurar políticas RLS para Storage

Ejecuta el siguiente SQL en el SQL Editor de Supabase:

```sql
-- Política para permitir uploads autenticados
CREATE POLICY "Users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'uploads');

-- Política para permitir lectura de archivos propios
CREATE POLICY "Users can read their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'uploads');
```

## 3. Configuración de Vercel Cron

### Variables de Entorno

Agrega la siguiente variable de entorno en Vercel:

```
CRON_SECRET=tu_secreto_aleatorio_aqui
```

**Importante**: Genera un secreto seguro usando:
```bash
openssl rand -base64 32
```

### Configuración de Cron Jobs

El archivo `vercel.json` ya está configurado con los siguientes cron jobs:

1. **Recordatorios de Clases** (`/api/cron/class-reminders`)
   - Ejecuta diariamente a las 8:00 AM
   - Envía recordatorios 24 horas antes de las clases

2. **Alertas Diarias** (`/api/cron/daily-alerts`)
   - Ejecuta diariamente a las 9:00 AM
   - Genera alertas de capacidad, pagos y asistencia

### Verificar Cron Jobs en Vercel

1. Ve a tu proyecto en Vercel Dashboard
2. Navega a **Settings** → **Cron Jobs**
3. Verifica que los cron jobs estén activos
4. Los cron jobs se activarán automáticamente después del primer deploy

## 4. Configuración de Supabase Realtime

### Habilitar Realtime para Notificaciones

1. Ve a tu proyecto de Supabase Dashboard
2. Navega a **Database** → **Replication**
3. Habilita la replicación para la tabla `notifications`

O ejecuta el siguiente SQL:

```sql
-- Habilitar Realtime para la tabla notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

### Configurar en el código

El componente `NotificationBell` ya está configurado para usar Realtime. Solo necesitas asegurarte de que:

1. El usuario esté autenticado
2. `userId` y `tenantId` estén disponibles en el contexto del componente

## 5. Mejoras de Plantillas de Email

Las plantillas de email han sido mejoradas con:

- ✅ Diseño responsivo
- ✅ Colores diferenciados por tipo de notificación
- ✅ Estructura HTML semántica
- ✅ Botones de acción cuando aplica

### Personalizar Plantillas

Las plantillas están en `src/lib/email/templates/`:

- `welcome-email.tsx` - Email de bienvenida
- `attendance-reminder.tsx` - Recordatorio de asistencia
- `payment-reminder.tsx` - Recordatorio de pago
- `event-invitation.tsx` - Invitación a eventos
- `class-cancellation.tsx` - Cancelación de clases

Puedes personalizar:
- Colores (cambiar los valores hex en `background-color`)
- Logo (agregar imagen en el header)
- Texto y contenido
- Estilos CSS inline

## 6. Verificación de Funcionalidades

### Checklist de Producción

- [ ] Supabase Storage configurado con bucket `uploads`
- [ ] Políticas RLS configuradas para Storage
- [ ] Variable `CRON_SECRET` configurada en Vercel
- [ ] Cron jobs verificados en Vercel Dashboard
- [ ] Realtime habilitado para tabla `notifications`
- [ ] Plantillas de email personalizadas (opcional)
- [ ] Variables de entorno configuradas en producción
- [ ] Migraciones de base de datos aplicadas

## 7. Testing

### Probar Upload de Archivos

```bash
# Usar curl o Postman para probar
curl -X POST http://localhost:3000/api/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test-image.jpg" \
  -F "academyId=YOUR_ACADEMY_ID" \
  -F "folder=coach-gallery"
```

### Probar Cron Jobs Localmente

Los cron jobs pueden probarse manualmente:

```bash
curl -X GET http://localhost:3000/api/cron/class-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Probar Notificaciones Realtime

1. Abre la aplicación en dos navegadores diferentes
2. Crea una notificación desde el backend
3. Verifica que aparezca en tiempo real en el otro navegador

## 8. Monitoreo

### Logs de Vercel

Monitorea los logs de los cron jobs en:
- Vercel Dashboard → **Deployments** → **Functions** → **Cron Jobs**

### Logs de Supabase

Monitorea los logs de Storage y Realtime en:
- Supabase Dashboard → **Logs**

## 9. Troubleshooting

### PDFs no se generan

- Verifica que `jspdf` y `jspdf-autotable` estén instalados
- Revisa los logs del servidor para errores

### Uploads fallan

- Verifica que el bucket `uploads` exista en Supabase
- Verifica las políticas RLS de Storage
- Revisa que `SUPABASE_SERVICE_ROLE_KEY` esté configurada

### Cron jobs no se ejecutan

- Verifica que `vercel.json` esté en la raíz del proyecto
- Verifica que `CRON_SECRET` esté configurada
- Revisa los logs en Vercel Dashboard

### Notificaciones Realtime no funcionan

- Verifica que Realtime esté habilitado para la tabla `notifications`
- Verifica que el usuario esté autenticado
- Revisa la consola del navegador para errores

## 10. Próximos Pasos

1. Personalizar plantillas de email con logo y colores de marca
2. Configurar dominio personalizado para emails
3. Implementar sistema de retry para emails fallidos
4. Agregar analytics para tracking de emails
5. Configurar webhooks para eventos importantes

