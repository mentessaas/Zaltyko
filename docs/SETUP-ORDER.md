# 📋 Orden de Configuración de Supabase

Este documento explica el orden correcto para configurar Supabase completamente.

## 🔄 Flujo de Configuración

```
1. Storage Setup (✅ Ya ejecutado)
   ↓
2. Migraciones de Drizzle
   ↓
3. Post-Migration Setup
   ↓
4. Verificación
```

## 📝 Pasos Detallados

### Paso 1: Storage Setup ✅ (Ya Completado)

**Estado:** ✅ Ejecutado automáticamente

**Qué se configuró:**
- Bucket `uploads` creado
- 5 políticas RLS para Storage
- Límites y validaciones

**Archivo:** `supabase/storage-setup.sql`

### Paso 2: Migraciones de Drizzle

**Comando:**
```bash
pnpm db:migrate
```

**Qué hace:**
- Crea las tablas nuevas en la base de datos
- Tablas que se crearán:
  - `notifications`
  - `email_logs`
  - `scholarships`
  - `discounts`
  - `receipts`
  - `event_invitations`
  - `notification_preferences`

**Importante:** Este paso es necesario antes de continuar.

### Paso 3: Post-Migration Setup

**Opción A: Supabase Dashboard (Recomendado)**

1. Ve a **Supabase Dashboard** → **SQL Editor**
2. Abre `supabase/post-migration-setup.sql`
3. Copia y pega todo el contenido
4. Ejecuta

**Opción B: Supabase CLI**

```bash
./scripts/run-post-migration-setup.sh
```

**Qué configura:**
- ✅ Realtime para tabla `notifications`
- ✅ Función `notify_new_notification()`
- ✅ Trigger `on_notification_insert`
- ✅ Políticas RLS para `notifications` (4 políticas)
- ✅ Políticas RLS para `email_logs` (2 políticas)
- ✅ Políticas RLS para `scholarships` (2 políticas)
- ✅ Políticas RLS para `discounts` (2 políticas)
- ✅ Políticas RLS para `receipts` (2 políticas)
- ✅ Políticas RLS para `event_invitations` (2 políticas)
- ✅ Políticas RLS para `notification_preferences` (1 política)

**Características:**
- ✅ Verifica si las tablas existen antes de configurar
- ✅ Puede ejecutarse múltiples veces sin problemas
- ✅ Muestra mensajes informativos de lo que se configuró

### Paso 4: Verificación

**Opción A: Endpoint API**

```bash
curl http://localhost:3000/api/admin/verify-supabase \
  -H "Cookie: session=..."
```

**Opción B: SQL Directo**

Ejecuta en Supabase Dashboard → SQL Editor:

```sql
-- Verificar Storage
SELECT * FROM storage.buckets WHERE id = 'uploads';

-- Verificar Realtime
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'notifications';

-- Verificar Políticas RLS
SELECT tablename, COUNT(*) as policies 
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('notifications', 'email_logs', 'scholarships', 'discounts', 'receipts', 'event_invitations', 'notification_preferences')
GROUP BY tablename
ORDER BY tablename;
```

## 🎯 Resumen Rápido

```bash
# 1. Storage ya está configurado ✅

# 2. Ejecutar migraciones
pnpm db:migrate

# 3. Configurar Realtime y RLS
# Opción A: Dashboard → SQL Editor → post-migration-setup.sql
# Opción B:
./scripts/run-post-migration-setup.sh

# 4. Verificar
# Visita: http://localhost:3000/api/admin/verify-supabase
```

## ⚠️ Troubleshooting

### Error: "relation notifications does not exist"

**Solución:** Ejecuta primero las migraciones de Drizzle:
```bash
pnpm db:migrate
```

### Error: "duplicate_object" al habilitar Realtime

**Solución:** Es normal, significa que ya estaba habilitado. El script maneja este error automáticamente.

### Las políticas RLS no se crean

**Solución:** 
1. Verifica que las tablas existen
2. Ejecuta el script `post-migration-setup.sql` nuevamente
3. Revisa los mensajes NOTICE en el SQL Editor

## ✅ Estado Final Esperado

- ✅ Bucket `uploads` existe
- ✅ 5 políticas de Storage configuradas
- ✅ Realtime habilitado para `notifications`
- ✅ Función y trigger de notificaciones creados
- ✅ 15+ políticas RLS configuradas
- ✅ Todas las tablas nuevas tienen políticas RLS

¡Todo listo! 🎉

