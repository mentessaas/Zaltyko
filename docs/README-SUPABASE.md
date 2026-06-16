# 🚀 Configuración Completa de Supabase

Esta guía te ayudará a configurar completamente Supabase para Zaltyko SaaS.

## ⚡ Configuración Rápida (5 minutos)

### Paso 1: Ejecutar Scripts SQL Iniciales

1. Ve a tu **Supabase Dashboard** → **SQL Editor**
2. Ejecuta los scripts en este orden:

   **a) Storage Setup:**
   - Abre `supabase/storage-setup.sql`
   - Copia y pega el contenido
   - Ejecuta

   **b) Storage Policies:**
   - Ya ejecutado automáticamente ✅

### Paso 2: Ejecutar Migraciones de Drizzle

```bash
pnpm db:migrate
```

### Paso 3: Configuración Post-Migración

**Opción A: Usando Supabase Dashboard (Recomendado)**
1. Ve a **Supabase Dashboard** → **SQL Editor**
2. Abre `supabase/post-migration-setup.sql`
3. Copia y pega el contenido
4. Ejecuta

**Opción B: Usando Supabase CLI**
```bash
./scripts/run-post-migration-setup.sh
```

Este script configura:
- ✅ Realtime para notificaciones
- ✅ Políticas RLS para todas las nuevas tablas
- ✅ Funciones y triggers

### Paso 4: Verificar Configuración

Visita: `http://localhost:3000/api/admin/verify-supabase` (como admin)

O ejecuta en SQL Editor:

```sql
-- Verificar Storage
SELECT * FROM storage.buckets WHERE id = 'uploads';

-- Verificar Realtime
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'notifications';

-- Verificar Políticas
SELECT tablename, COUNT(*) as policies 
FROM pg_policies 
WHERE schemaname = 'public' 
GROUP BY tablename;
```

## 📦 Qué se Configura

### 1. Storage (Uploads)
- ✅ Bucket `uploads` creado
- ✅ Políticas RLS para usuarios autenticados
- ✅ Límite de 5MB por archivo
- ✅ Tipos permitidos: JPEG, PNG, GIF, WEBP

### 2. Realtime (Notificaciones)
- ✅ Realtime habilitado para tabla `notifications`
- ✅ Función de notificación opcional
- ✅ Trigger para nuevos inserts

### 3. RLS Policies
- ✅ Políticas para `notifications`
- ✅ Políticas para `email_logs`
- ✅ Políticas para `scholarships`
- ✅ Políticas para `discounts`
- ✅ Políticas para `receipts`
- ✅ Políticas para `event_invitations`
- ✅ Políticas para `notification_preferences`

## 🧪 Testing

### Probar Upload
```bash
curl -X POST http://localhost:3000/api/upload \
  -H "Cookie: your-session" \
  -F "file=@test.jpg" \
  -F "academyId=your-id" \
  -F "folder=coach-gallery"
```

### Probar Realtime
1. Abre la app en dos navegadores
2. Crea una notificación desde el backend
3. Debe aparecer en tiempo real

## 📚 Documentación Completa

Ver `docs/supabase-setup-guide.md` para documentación detallada.

## ✅ Checklist

- [ ] Script `storage-setup.sql` ejecutado
- [ ] Bucket `uploads` existe
- [ ] Migraciones de Drizzle ejecutadas (`pnpm db:migrate`)
- [ ] Script `post-migration-setup.sql` ejecutado
- [ ] Realtime habilitado para notifications
- [ ] Políticas RLS configuradas
- [ ] Upload probado
- [ ] Realtime probado

¡Listo! 🎉

## 📝 Notas Importantes

1. **Orden de ejecución:**
   - Primero: `storage-setup.sql` (ya ejecutado ✅)
   - Segundo: Migraciones de Drizzle (`pnpm db:migrate`)
   - Tercero: `post-migration-setup.sql` (configura Realtime y RLS)

2. **Si las tablas no existen:**
   - El script `post-migration-setup.sql` verificará automáticamente
   - Solo configurará lo que exista
   - Puedes ejecutarlo múltiples veces sin problemas

