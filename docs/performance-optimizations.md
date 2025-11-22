# Optimizaciones de Rendimiento

Este documento describe las optimizaciones de rendimiento implementadas y recomendaciones para el futuro.

## Optimizaciones Implementadas

### 1. Queries de Base de Datos

#### Eliminación de N+1 Queries

**Problema**: Algunos endpoints hacían queries separadas y luego filtraban en memoria, causando múltiples round-trips a la base de datos.

**Solución**: Usar LEFT JOINs y agregación en una sola query.

**Ejemplos optimizados**:
- `/api/classes` con `includeAssignments=true`
- `/api/coaches` con `includeAssignments=true`

**Antes**:
```typescript
// Query 1: Obtener clases
const classes = await db.select().from(classes);

// Query 2: Obtener assignments
const assignments = await db.select().from(classCoachAssignments);

// Filtrar en memoria (N+1)
const grouped = classes.map(c => ({
  ...c,
  coaches: assignments.filter(a => a.classId === c.id)
}));
```

**Después**:
```typescript
// Una sola query con LEFT JOIN
const rows = await db
  .select({ ...classes, ...coaches })
  .from(classes)
  .leftJoin(classCoachAssignments, ...)
  .leftJoin(coaches, ...);

// Agrupar en memoria (sin queries adicionales)
const grouped = rows.reduce((acc, row) => {
  // Agrupar por clase
}, []);
```

#### Índices de Base de Datos

**Índices aplicados vía migración `0017_performance_indexes.sql`**:

Los siguientes índices han sido aplicados para optimizar las queries más frecuentes del MVP:

**Perfiles**:
- `profiles_tenant_role_idx` - Búsquedas por tenant y rol (ya existía en Drizzle)
- `profiles_user_id_idx` - Búsquedas por user_id
- `profiles_can_login_idx` - Filtros de usuarios sin acceso

**Atletas**:
- `athletes_tenant_academy_idx` - Listado por academia (ya existía en Drizzle)
- `athletes_status_idx` - Filtros por estado (active, inactive, etc.)
- `athletes_level_idx` - Filtros por nivel
- `athletes_group_id_idx` - Búsquedas por grupo
- `athletes_dob_idx` - Búsquedas por fecha de nacimiento

**Sesiones de Clase**:
- `class_sessions_class_date_idx` - Calendario por clase y fecha (ya existía en Drizzle)
- `class_sessions_date_idx` - Búsquedas por fecha
- `class_sessions_coach_date_idx` - Sesiones por entrenador y fecha

**Asistencia**:
- `attendance_records_session_athlete_uq` - Unique constraint (ya existía en Drizzle)
- `attendance_records_session_idx` - Por sesión (ya existía en Drizzle)
- `attendance_records_athlete_idx` - Historial por atleta

**Suscripciones**:
- `subscriptions_user_id_idx` - Por usuario (ya existía en Drizzle)
- `subscriptions_user_status_idx` - Suscripciones activas por usuario
- `subscriptions_plan_status_idx` - Por plan y estado

**Evaluaciones**:
- `athlete_assessments_athlete_date_idx` - Evaluaciones por atleta y fecha
- `athlete_assessments_academy_date_idx` - Evaluaciones por academia y fecha

**Otros**:
- `coach_notes_academy_idx` - Notas por academia
- `memberships_academy_role_idx` - Miembros por academia y rol
- `billing_invoices_academy_status_idx` - Facturas por academia y estado

**Índices críticos para el MVP** (ya aplicados):
- Listado de atletas: `athletes(tenant_id, academy_id)` ✓
- Calendario de clases: `class_sessions(class_id, session_date)` ✓
- Asistencia por sesión: `attendance_records(session_id, athlete_id)` ✓
- Conteo de atletas para límites: `athletes(tenant_id, academy_id)` ✓

### 2. Optimizaciones de React

#### Memoización de Componentes

**Componentes optimizados**:
- `SuperAdminUsersTable`: Usa `useMemo` para cálculos de filtros
- `AthletesTableView`: Estado local optimizado con `useEffect`
- `CoachAssignmentsPanel`: `useMemo` para filtrado de entrenadores

**Ejemplo**:
```typescript
const filteredItems = useMemo(() => {
  if (!filter.trim()) return items;
  return items.filter(item => 
    item.name.toLowerCase().includes(filter.toLowerCase())
  );
}, [items, filter]);
```

#### Callbacks Memoizados

**Uso de `useCallback`**:
- Handlers de eventos que se pasan como props
- Funciones en dependencias de `useEffect`

**Ejemplo**:
```typescript
const handleUpdate = useCallback(async (id: string, data: any) => {
  // Lógica de actualización
}, [dependencies]);
```

### 3. Optimizaciones del Cliente

#### Code Splitting

Next.js automáticamente hace code splitting por ruta. Para optimizar más:

```typescript
// Lazy load de componentes pesados
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <LoadingSpinner />,
  ssr: false // Si no necesita SSR
});
```

#### Optimización de Imágenes

- Usar `next/image` para todas las imágenes
- Lazy loading automático
- Formatos modernos (WebP, AVIF)

#### Optimistic Updates

Implementado en:
- `SuperAdminUsersTable`: Actualización de roles y suspensión
- `SuperAdminAcademiesTable`: Suspensión y eliminación
- `AthletesTableView`: Edición y eliminación de atletas

**Beneficios**:
- UI más responsiva
- Mejor experiencia de usuario
- Rollback automático en caso de error

### 4. Caching

#### Cache de Planes

Los planes cambian raramente, se pueden cachear:

```typescript
// En /api/billing/plans
export const revalidate = 3600; // 1 hora
```

#### Cache de Queries Frecuentes

Para queries que no cambian frecuentemente:

```typescript
// En Server Components
export const revalidate = 60; // 1 minuto
```

### 5. Optimizaciones de Red

#### Paginación

Endpoints que retornan listas grandes deberían implementar paginación:

```typescript
const limit = 50;
const offset = (page - 1) * limit;

const items = await db
  .select()
  .from(table)
  .limit(limit)
  .offset(offset);
```

#### Compresión

Next.js comprime automáticamente las respuestas con gzip.

## Métricas de Rendimiento

### Objetivos

- **Time to First Byte (TTFB)**: < 200ms
- **First Contentful Paint (FCP)**: < 1.5s
- **Largest Contentful Paint (LCP)**: < 2.5s
- **Time to Interactive (TTI)**: < 3.5s

### Herramientas

- **Lighthouse**: Para métricas de rendimiento web
- **React DevTools Profiler**: Para identificar componentes lentos
- **Supabase Dashboard**: Para analizar queries lentas

## Optimizaciones Futuras

### Corto Plazo

1. **Implementar paginación** en endpoints de listas
2. **Agregar índices** en campos frecuentemente consultados
3. **Cachear planes** con `revalidate`
4. **Lazy load** de componentes pesados del dashboard

### Mediano Plazo

1. **Redis cache** para queries frecuentes
2. **CDN** para assets estáticos
3. **Database connection pooling** optimizado
4. **Background jobs** para tareas pesadas

### Largo Plazo

1. **Read replicas** para reporting
2. **GraphQL** para queries optimizadas
3. **Service Workers** para cache offline
4. **Edge functions** para lógica cerca del usuario

## Checklist de Optimización

Antes de hacer deploy, verifica:

- [ ] Queries no tienen N+1 problems
- [ ] Índices en campos de filtro frecuentes
- [ ] Componentes pesados usan `useMemo`/`useCallback`
- [ ] Imágenes usan `next/image`
- [ ] Code splitting en rutas grandes
- [ ] Paginación en listas grandes
- [ ] Optimistic updates donde apropiado
- [ ] Cache headers configurados
- [ ] Bundle size optimizado
- [ ] Lighthouse score > 90

## Debugging de Rendimiento

### Identificar Queries Lentas

```sql
-- En Supabase Dashboard → Database → Query Performance
SELECT * FROM pg_stat_statements 
ORDER BY total_time DESC 
LIMIT 10;
```

### Profiling de Componentes

1. Abre React DevTools
2. Ve a la pestaña "Profiler"
3. Graba una interacción
4. Identifica componentes con renderizado lento
5. Agrega `React.memo` o `useMemo` donde sea necesario

### Análisis de Bundle

```bash
pnpm build
# Revisa .next/analyze para ver el tamaño del bundle
```

## Recursos

- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [React Performance](https://react.dev/learn/render-and-commit)
- [PostgreSQL Performance](https://www.postgresql.org/docs/current/performance-tips.html)
- [Web Vitals](https://web.dev/vitals/)

