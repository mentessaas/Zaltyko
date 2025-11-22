# Arquitectura y Decisiones Técnicas

Este documento describe la arquitectura del sistema GymnaSaaS y las decisiones técnicas tomadas.

## Arquitectura General

### Stack Tecnológico

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Backend**: Next.js API Routes (Serverless)
- **Base de Datos**: PostgreSQL (Supabase)
- **ORM**: Drizzle ORM
- **Autenticación**: Supabase Auth
- **Pagos**: Stripe
- **Email**: Mailgun
- **Estilos**: Tailwind CSS
- **UI Components**: shadcn/ui

### Patrón de Arquitectura

El sistema sigue una arquitectura **multi-tenant SaaS** con:

1. **Separación por Tenant**: Cada cliente tiene su propio `tenantId`
2. **Row-Level Security (RLS)**: Políticas de seguridad a nivel de base de datos
3. **API Routes**: Endpoints RESTful en Next.js
4. **Server Components**: Renderizado en servidor cuando es posible
5. **Client Components**: Interactividad en el cliente cuando es necesario

## Decisiones de Diseño

### Multi-Tenancy

**Decisión**: Usar tenant ID en cada tabla en lugar de esquemas separados.

**Razón**:
- Más fácil de mantener y escalar
- Permite compartir recursos eficientemente
- Simplifica migraciones y backups

**Implementación**:
- Cada tabla tiene un campo `tenantId`
- RLS policies filtran por `tenantId`
- Middleware `withTenant` valida tenant en cada request

### Autenticación y Autorización

**Decisión**: Usar Supabase Auth con cookies de sesión.

**Razón**:
- Integración nativa con Supabase
- Manejo automático de refresh tokens
- Seguridad robusta out-of-the-box

**Implementación**:
- Cookies HTTP-only para tokens
- Middleware `withTenant` para validación
- Roles: `super_admin`, `admin`, `owner`, `coach`, `athlete`, `parent`

### Base de Datos

**Decisión**: PostgreSQL con Drizzle ORM.

**Razón**:
- Type-safety completo
- Migraciones versionadas
- Queries SQL optimizadas
- Soporte completo de PostgreSQL

**Esquema Principal**:
- `profiles`: Usuarios del sistema
- `academies`: Academias de gimnasia
- `athletes`: Atletas
- `coaches`: Entrenadores
- `classes`: Clases de entrenamiento
- `class_sessions`: Sesiones individuales
- `subscriptions`: Suscripciones de planes
- `billing_invoices`: Facturas

### Pagos

**Decisión**: Stripe para procesamiento de pagos.

**Razón**:
- Estándar de la industria
- Webhooks confiables
- Portal de facturación incluido
- Soporte internacional

**Flujo**:
1. Usuario selecciona plan
2. Se crea sesión de checkout en Stripe
3. Usuario completa pago
4. Webhook actualiza suscripción en DB
5. Límites del plan se aplican automáticamente

### Notificaciones en Tiempo Real

**Decisión**: Supabase Realtime para notificaciones.

**Razón**:
- Integración nativa con Supabase
- Escalable y confiable
- Filtrado por RLS automático

**Implementación**:
- Hook `useRealtimeNotifications`
- Provider `RealtimeNotificationsProvider`
- Escucha cambios en tablas críticas

## Patrones de Código

### API Routes

Todas las rutas API siguen este patrón:

```typescript
export const METHOD = withTenant(async (request, context) => {
  // 1. Validar input
  const body = Schema.parse(await request.json());
  
  // 2. Verificar permisos
  if (!hasPermission(context.profile)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  
  // 3. Ejecutar lógica
  const result = await performOperation(body, context);
  
  // 4. Retornar respuesta
  return NextResponse.json(result);
});
```

### Componentes

**Server Components** (por defecto):
- Acceso directo a base de datos
- Sin JavaScript en el cliente
- Mejor rendimiento inicial

**Client Components** (`"use client"`):
- Interactividad (onClick, useState, etc.)
- Hooks personalizados
- Formularios complejos

### Manejo de Estado

**Server State**: 
- Datos de la base de datos
- Fetch en Server Components
- Refresh con `router.refresh()`

**Client State**:
- Estado de UI (modales, formularios)
- `useState` para estado local
- Optimistic updates cuando es apropiado

### Optimizaciones

**Queries**:
- Usar joins en lugar de N+1 queries
- Índices en campos frecuentemente consultados
- Paginación para listas grandes

**Componentes**:
- `useMemo` para cálculos pesados
- `useCallback` para funciones pasadas como props
- `React.memo` para componentes pesados

**Imágenes**:
- `next/image` para optimización automática
- Lazy loading por defecto
- Formatos modernos (WebP)

## Seguridad

### Row-Level Security (RLS)

Todas las tablas tienen políticas RLS activadas para garantizar el aislamiento multi-tenant. Las políticas se definen en `supabase/rls.sql` y se aplican directamente en la base de datos.

#### Estrategia RLS

**Principio fundamental**: Cada usuario solo puede acceder a datos de su propio `tenant_id`, excepto los roles administrativos (`admin` y `super_admin`) que tienen acceso global controlado.

#### Funciones Helper

El sistema utiliza funciones helper definidas en `supabase/rls.sql`:

- **`get_current_tenant()`**: Retorna el `tenant_id` del usuario autenticado desde `profiles.tenant_id` donde `profiles.user_id = auth.uid()`
- **`is_admin()`**: Verifica si el usuario tiene rol `admin` o `super_admin`
- **`is_super_admin()`**: Verifica si el usuario tiene rol `super_admin`
- **`academy_in_current_tenant(target uuid)`**: Valida que una academia pertenece al tenant actual

#### Patrón de Políticas

Todas las tablas core del MVP siguen este patrón:

```sql
-- SELECT: Admins o usuarios del mismo tenant
CREATE POLICY "table_select" ON table_name
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

-- INSERT/UPDATE/DELETE: Admins o usuarios del mismo tenant
CREATE POLICY "table_modify" ON table_name
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );
```

#### Tablas con RLS Activado

Todas las tablas multi-tenant tienen RLS activado:
- `academies`, `profiles`, `athletes`, `coaches`, `classes`, `class_sessions`
- `attendance_records`, `groups`, `group_athletes`, `events`
- `family_contacts`, `guardians`, `guardian_athletes`
- `athlete_assessments`, `assessment_scores`, `coach_notes`
- `memberships`, `subscriptions`, `invitations`
- `class_coach_assignments`, `billing_invoices`, `billing_events`
- `audit_logs`, `skill_catalog`

#### Casos Especiales

**`plans`**: 
- Lectura pública para usuarios autenticados
- Modificación solo por admins

**`profiles`**:
- Los usuarios pueden ver su propio perfil (`user_id = auth.uid()`)
- Los usuarios pueden ver perfiles de su mismo tenant
- Los usuarios pueden actualizar solo su propio perfil
- Los admins pueden gestionar todos los perfiles

**`subscriptions` y `memberships`**:
- Usan `academy_in_current_tenant()` para validar que la academia pertenece al tenant

**`billing_events`**:
- Solo accesible por `super_admin`

#### Determinación de Tenant ID

El `tenant_id` se determina desde el perfil del usuario autenticado:

1. Supabase Auth proporciona `auth.uid()` (el ID del usuario en Supabase Auth)
2. La función `get_current_tenant()` busca en `profiles` el registro donde `user_id = auth.uid()`
3. Retorna `profiles.tenant_id` de ese registro

Este `tenant_id` se usa en todas las políticas RLS para filtrar datos.

#### Bypass para Administradores

Los roles `admin` y `super_admin` tienen bypass en las políticas RLS mediante `is_admin()`. Esto permite:
- Acceso global a datos para operaciones de soporte
- Gestión centralizada de academias
- Auditoría y reporting global

**Importante**: El código de aplicación también valida permisos mediante `withTenant()` y `withSuperAdmin()` para doble capa de seguridad.

### Validación

- **Input**: Zod schemas en todos los endpoints
- **Output**: TypeScript types estrictos
- **Sanitización**: Drizzle ORM previene SQL injection

### Autenticación

- Cookies HTTP-only
- Refresh tokens automáticos
- Sesiones expiran después de inactividad

## Escalabilidad

### Base de Datos

- Índices en campos frecuentemente consultados
- Particionamiento por tenant (futuro)
- Read replicas para queries pesadas (futuro)

### API

- Serverless functions escalan automáticamente
- Rate limiting (pendiente)
- Caching con Redis (futuro)

### Frontend

- Code splitting automático
- Lazy loading de rutas
- Optimización de imágenes

## Monitoreo y Logs

### Logs

- Console logs en desarrollo
- Supabase logs para queries
- Error tracking (pendiente: Sentry)

### Métricas

- Super Admin dashboard con métricas globales
- Logs de auditoría en `audit_logs` table
- Eventos de facturación en `billing_events`

## Migraciones Futuras

### Corto Plazo

- Rate limiting en API
- Caching de queries frecuentes
- Optimización de imágenes

### Mediano Plazo

- Read replicas para reporting
- CDN para assets estáticos
- Background jobs para tareas pesadas

### Largo Plazo

- Microservicios para funciones específicas
- Event sourcing para auditoría completa
- GraphQL API (opcional)

## Consideraciones de Rendimiento

### Queries Optimizadas

- Evitar N+1 queries usando joins
- Índices en foreign keys y campos de filtro
- Paginación para listas grandes

### Caching

- Cache de planes (cambian raramente)
- Cache de permisos de usuario
- Cache de métricas del dashboard

### Optimizaciones del Cliente

- Code splitting por ruta
- Lazy loading de componentes pesados
- Memoización de cálculos costosos

## Testing

### Estrategia

- **Unit Tests**: Funciones puras y utilidades
- **Integration Tests**: API endpoints
- **E2E Tests**: Flujos críticos completos

### Cobertura Objetivo

- 80%+ para código crítico
- 60%+ para código general
- Tests para todos los endpoints públicos

## Documentación

- API: `docs/api-documentation.md`
- Desarrollo: `docs/development-guide.md`
- Realtime: `docs/realtime-setup.md`
- Base de datos: `docs/database.md`

## Recursos

- [Next.js App Router](https://nextjs.org/docs/app)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Supabase Docs](https://supabase.com/docs)
- [Stripe Docs](https://stripe.com/docs)

