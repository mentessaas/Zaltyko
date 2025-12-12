# Guía de Configuración de Supabase

Esta guía te ayudará a configurar completamente Supabase para el proyecto Zaltyko SaaS.

## 📋 Requisitos Previos

- Proyecto de Supabase creado
- Acceso al Dashboard de Supabase
- Variables de entorno configuradas:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

## 🚀 Configuración Rápida

### Opción 1: Usando Supabase Dashboard (Recomendado)

1. **Ve a tu proyecto en Supabase Dashboard**
2. **Navega a SQL Editor**
3. **Ejecuta los scripts en este orden:**

   a. **Storage Setup:**
   ```sql
   -- Copia y pega el contenido de supabase/storage-setup.sql
   ```

   b. **Realtime Setup:**
   ```sql
   -- Copia y pega el contenido de supabase/realtime-setup.sql
   ```

   c. **RLS Policies:**
   ```sql
   -- Copia y pega el contenido de supabase/rls-policies.sql
   ```

### Opción 2: Usando Supabase CLI

```bash
# Asegúrate de tener Supabase CLI instalado
npm install -g supabase

# Ejecuta el script de configuración
chmod +x scripts/setup-supabase.sh
./scripts/setup-supabase.sh
```

## 📦 1. Configuración de Storage

### Crear Bucket Manualmente (Alternativa)

Si prefieres crear el bucket desde el Dashboard:

1. Ve a **Storage** → **Buckets**
2. Click en **New bucket**
3. Configuración:
   - **Name**: `uploads`
   - **Public bucket**: ❌ No (privado)
   - **File size limit**: `5242880` (5MB)
   - **Allowed MIME types**: `image/jpeg, image/png, image/gif, image/webp`

### Verificar Storage

Después de ejecutar `storage-setup.sql`, verifica:

```sql
-- Verificar que el bucket existe
SELECT * FROM storage.buckets WHERE id = 'uploads';

-- Verificar políticas
SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
```

## 🔔 2. Configuración de Realtime

### Habilitar Realtime para Notificaciones

El script `realtime-setup.sql` hace lo siguiente:

1. Agrega la tabla `notifications` a la publicación Realtime
2. Crea una función de notificación opcional
3. Crea un trigger para notificar nuevos inserts

### Verificar Realtime

```sql
-- Verificar que Realtime está habilitado
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'notifications';
```

### Habilitar Realtime desde Dashboard (Alternativa)

1. Ve a **Database** → **Replication**
2. Busca la tabla `notifications`
3. Activa el toggle para habilitar Realtime

## 🔒 3. Políticas RLS

### Políticas Implementadas

El script `rls-policies.sql` configura políticas para:

- ✅ **notifications** - Usuarios ven solo sus notificaciones
- ✅ **email_logs** - Usuarios ven logs de su tenant
- ✅ **scholarships** - Admins gestionan becas
- ✅ **discounts** - Admins gestionan descuentos
- ✅ **receipts** - Usuarios ven recibos de su tenant
- ✅ **event_invitations** - Usuarios gestionan invitaciones
- ✅ **notification_preferences** - Usuarios gestionan sus preferencias

### Verificar Políticas

```sql
-- Ver todas las políticas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

## 🧪 4. Testing

### Probar Storage

```bash
# Usar curl o Postman
curl -X POST http://localhost:3000/api/upload \
  -H "Cookie: your-session-cookie" \
  -F "file=@test-image.jpg" \
  -F "academyId=your-academy-id" \
  -F "folder=coach-gallery"
```

### Probar Realtime

1. Abre la aplicación en dos navegadores
2. Crea una notificación desde el backend
3. Verifica que aparece en tiempo real en el otro navegador

### Probar Notificaciones

```sql
-- Insertar una notificación de prueba
INSERT INTO notifications (tenant_id, user_id, type, title, message)
VALUES (
  'your-tenant-id',
  'your-user-id',
  'test',
  'Notificación de Prueba',
  'Esta es una notificación de prueba'
);
```

## 🔍 5. Verificación Completa

Ejecuta este script para verificar toda la configuración:

```sql
-- Verificar Storage
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'uploads')
    THEN '✅ Bucket uploads existe'
    ELSE '❌ Bucket uploads NO existe'
  END as storage_status;

-- Verificar Realtime
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'notifications'
    )
    THEN '✅ Realtime habilitado para notifications'
    ELSE '❌ Realtime NO habilitado'
  END as realtime_status;

-- Verificar Políticas
SELECT 
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('notifications', 'email_logs', 'scholarships', 'discounts', 'receipts')
GROUP BY tablename
ORDER BY tablename;
```

## 🐛 Troubleshooting

### Error: "bucket uploads does not exist"

**Solución:**
1. Verifica que ejecutaste `storage-setup.sql`
2. O crea el bucket manualmente desde el Dashboard
3. Verifica que tienes permisos de administrador

### Error: "relation notifications does not exist"

**Solución:**
1. Ejecuta primero las migraciones de Drizzle:
   ```bash
   pnpm db:migrate
   ```
2. Luego ejecuta los scripts de Supabase

### Realtime no funciona

**Solución:**
1. Verifica que Realtime está habilitado en el Dashboard
2. Verifica que la tabla está en la publicación:
   ```sql
   SELECT * FROM pg_publication_tables WHERE tablename = 'notifications';
   ```
3. Verifica que el cliente Supabase está configurado correctamente

### Políticas RLS bloquean operaciones

**Solución:**
1. Verifica que el usuario está autenticado
2. Verifica que el `tenant_id` coincide
3. Revisa los logs en Supabase Dashboard → Logs

## 📚 Recursos Adicionales

- [Documentación de Supabase Storage](https://supabase.com/docs/guides/storage)
- [Documentación de Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Documentación de RLS](https://supabase.com/docs/guides/auth/row-level-security)

## ✅ Checklist de Configuración

- [ ] Bucket `uploads` creado
- [ ] Políticas RLS de Storage configuradas
- [ ] Realtime habilitado para `notifications`
- [ ] Políticas RLS de tablas configuradas
- [ ] Storage probado con upload
- [ ] Realtime probado con notificaciones
- [ ] Variables de entorno configuradas
- [ ] Migraciones aplicadas

¡Listo! Tu Supabase está completamente configurado. 🎉

