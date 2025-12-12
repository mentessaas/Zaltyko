# Configuración de Supabase Realtime

Para habilitar las notificaciones en tiempo real, necesitas configurar Realtime en Supabase para las tablas relevantes.

## Pasos para habilitar Realtime

### 1. Habilitar Realtime en Supabase Dashboard

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **Database** → **Replication**
3. Habilita la replicación para las siguientes tablas:
   - `profiles`
   - `subscriptions`
   - `academies`
   - `classes`
   - `class_sessions` (opcional, para notificaciones de sesiones)
   - `billing_invoices` (para notificaciones de facturación)

### 2. Configurar políticas RLS para Realtime

Las políticas RLS deben permitir que los usuarios vean sus propios datos en tiempo real.

#### Para la tabla `profiles`:

```sql
-- Permitir a los usuarios ver sus propios perfiles en tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
```

#### Para la tabla `subscriptions`:

```sql
-- Permitir a los usuarios ver sus propias suscripciones en tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE subscriptions;
```

#### Para la tabla `academies`:

```sql
-- Permitir ver academias en tiempo real (filtrado por RLS)
ALTER PUBLICATION supabase_realtime ADD TABLE academies;
```

#### Para la tabla `classes`:

```sql
-- Permitir ver clases en tiempo real (filtrado por RLS)
ALTER PUBLICATION supabase_realtime ADD TABLE classes;
```

#### Para la tabla `billing_invoices`:

```sql
-- Permitir ver facturas en tiempo real (filtrado por RLS)
ALTER PUBLICATION supabase_realtime ADD TABLE billing_invoices;
```

**Nota importante**: Las políticas RLS deben permitir que los usuarios vean solo sus propias facturas. Asegúrate de tener políticas como:

```sql
-- Ejemplo de política RLS para billing_invoices
CREATE POLICY "Users can view their own invoices"
ON billing_invoices
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
  )
);
```

### 3. Verificar configuración

Puedes verificar que Realtime está habilitado ejecutando:

```sql
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

Deberías ver todas las tablas habilitadas en la lista.

### 4. Configuración de variables de entorno

Asegúrate de que tus variables de entorno estén configuradas:

```env
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

### 5. Habilitar Realtime en el código

El hook `useRealtimeNotifications` ya está configurado para usar estas tablas. Solo necesitas asegurarte de que:

1. El componente `RealtimeNotificationsProvider` esté incluido en tu layout
2. El `userId` se pase correctamente al provider

### Notas importantes

- **RLS es crítico**: Asegúrate de que tus políticas RLS permitan que los usuarios lean sus propios datos
- **Rendimiento**: Realtime puede consumir recursos. Considera deshabilitarlo en desarrollo si no lo necesitas
- **Seguridad**: Nunca expongas datos sensibles a través de Realtime sin las políticas RLS adecuadas
- **Filtros**: El hook filtra automáticamente las notificaciones por `userId` cuando está disponible

### Deshabilitar Realtime (opcional)

Si necesitas deshabilitar Realtime temporalmente:

```tsx
<RealtimeNotificationsProvider userId={profile.userId} enabled={false} />
```

### Troubleshooting

Si las notificaciones no funcionan:

1. Verifica que Realtime esté habilitado en Supabase Dashboard
2. Verifica las políticas RLS en la consola de Supabase
3. Revisa la consola del navegador para errores de conexión
4. Asegúrate de que el `userId` se esté pasando correctamente al provider
5. Verifica que las tablas estén en la publicación `supabase_realtime`:

```sql
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

### Eventos soportados

El sistema de notificaciones en tiempo real soporta los siguientes eventos:

- **Profiles**: Suspensión/reactivación de usuarios
- **Subscriptions**: Cambios de plan, estados de suscripción
- **Academies**: Creación y actualización de academias
- **Classes**: Creación de clases
- **Sessions**: (Próximamente) Creación de sesiones de clase
- **Billing Invoices**: Creación de nuevas facturas (requiere Realtime habilitado en `billing_invoices`)

### Configuración específica para facturación

Para que las notificaciones de facturación funcionen correctamente:

1. **Habilita Realtime** para la tabla `billing_invoices` en Supabase Dashboard
2. **Configura políticas RLS** que permitan a los usuarios ver sus propias facturas basándose en `tenant_id`
3. **Pasa `tenantId` al provider** - El `RealtimeNotificationsProvider` ahora requiere tanto `userId` como `tenantId` para filtrar correctamente las facturas

El hook automáticamente:
- Escucha eventos `INSERT` en `billing_invoices`
- Filtra por `tenant_id` para mostrar solo facturas del tenant del usuario actual
- Muestra una notificación toast con el monto de la factura (en euros, convertido de centavos)
- Incluye el `academyId` en la notificación para referencia

**Nota**: La tabla `billing_invoices` no tiene un campo `user_id` directo, por lo que el filtro se realiza por `tenant_id`. Asegúrate de que las políticas RLS permitan que los usuarios vean facturas de su tenant.
