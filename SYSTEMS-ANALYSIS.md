# SYSTEMS & PROCESSES ANALYSIS - Zaltyko SaaS

**Fecha de análisis:** 2026-03-26
**Stack:** Next.js 14, Supabase (PostgreSQL), Drizzle ORM, Tailwind CSS, Vercel
**Tipo:** SaaS B2B Freemium multi-tenant

---

## SYSTEMS SCORE: 52/100

| Área | Score | Comentario |
|------|-------|-----------|
| Arquitectura & Tech Debt | 60/100 | Buena base, pero con inconsistencias y deuda acumulada |
| Completitud API | 58/100 | CRUD funcional pero con brechas y naming inconsistente |
| Data Layer | 72/100 | Schema rico, índices buenos, pero falta RLS verificado |
| Auth & Authorization | 68/100 | Supabase Auth + custom wrappers, roles definidos |
| CI/CD & Deployment | 35/100 | Sin workflows de GitHub, deploy manual a Vercel |
| Observabilidad | 55/100 | Logger + Sentry, métricas en memoria (no persisted) |
| Developer Experience | 48/100 | TypeScript + linting, pero sin tests y poca doc interna |
| **TOTAL** | **52/100** | MVP sólido, necesita inversión en proceso y calidad |

---

## 1. ARCHITECTURE & TECHNICAL DEBT

### 1.1 Estado Actual

**Patrones positivos:**
- Drizzle ORM con schema typed en `src/db/schema/` (70+ tablas)
- Middleware de auth centralizado: `withTenant()` y `withSuperAdmin()` en `src/lib/authz.ts`
- Manejo de errores centralizado en `src/lib/api-error-handler.ts`
- Logger estructurado con integración Sentry en `src/lib/logger.ts`
- Rate limiting via Vercel KV (`src/lib/rate-limit.ts`)
- Validación de variables de entorno con Zod (`src/lib/env.ts`)
- Plan limits bien implementados (`src/lib/limits.ts`)

**Patrones negativos:**

| Patrón | Ubicación | Descripción |
|--------|----------|-------------|
| Export duplicado en index | `src/db/schema/index.ts:16,50-51` | `academy-messages` y `academy-geo-groups` exportados dos veces |
| PUT y PATCH duplicados | `src/app/api/athletes/[athleteId]/route.ts` | PUT y PATCH hacen casi lo mismo (validación similar, lógica duplicada) |
| Uso de `console.log` en APIs | `src/app/api/classes/[classId]/route.ts:169,182,216,372,380,394,402,427,444,450` | 10+ `console.log` en el endpoint de classes PUT en lugar de usar el logger |
| Error handler inconsistente | Múltiples endpoints | Algunos usan `handleApiError()`, otros `console.error` directo |
| Métricas en memoria | `src/lib/metrics.ts` | Se resetean en cada cold start de serverless, inútiles para trend analysis |
| DB transaction fallback frágil | `src/lib/db-transactions.ts` | El mock de transacción para tests puede silently fallar en producción |

### 1.2 Missing Abstractions

1. **No existe un generador de endpoints CRUD estándar** — cada endpoint reimplementa auth, validación, error handling
2. **No hay un schema de respuesta estándar** — algunos endpoints retornan `{ ok: true }`, otros `{ ok: true, id }`, otros el objeto completo
3. **No hay un sistema de feature flags** — el feature flag `DISABLE_ONBOARDING_AUTOMATIONS` se lee directo de env
4. **No hay abstracción de auditoría** — `audit-logs.ts` existe pero no se usa consistentemente en endpoints

### 1.3 Tech Debt Inventory

| Prioridad | Item | Esfuerzo | Impacto |
|-----------|------|----------|---------|
| Alta | `console.log` en endpoints de classes PUT | 1h | Confianza, debugging |
| Alta | Métricas en memoria (se pierden en serverless) | 4h | Observabilidad real |
| Media | Duplicado de exports en schema/index.ts | 5min | Clarity |
| Media | PUT/PATCH duplicados en athletes | 3h | Mantenibilidad |
| Media | No se usa `auditLogs` en endpoints (excepto athletes) | 8h | Compliance y debugging |
| Baja | Feature flags en env en lugar de DB | 4h | Flexibilidad operativa |
| Baja | No hay abstracción de respuestas API | 6h | Consistencia |

---

## 2. API DESIGN & COMPLETENESS

### 2.1 Mapa Completo de Endpoints

#### Athletes
| Método | Ruta | Estado |
|--------|------|--------|
| GET | `/api/athletes` | ✅ Listado con filtros, paginación |
| POST | `/api/athletes` | ✅ Crear con límites de plan |
| GET | `/api/athletes/[id]` | ✅ Detail |
| PUT | `/api/athletes/[id]` | ✅ Update completo |
| PATCH | `/api/athletes/[id]` | ✅ Update parcial (casi igual a PUT) |
| DELETE | `/api/athletes/[id]` | ✅ Soft/Hard delete |
| POST | `/api/athletes/[id]/guardians` | ✅ |
| GET | `/api/athletes/[id]/assessments` | ✅ |
| POST | `/api/athletes/import` | ✅ CSV import |
| GET | `/api/athletes/[id]/attendance` | ✅ |

#### Classes
| Método | Ruta | Estado |
|--------|------|--------|
| GET | `/api/classes` | ✅ Listado |
| POST | `/api/classes` | ✅ Crear |
| GET | `/api/classes/[id]` | ✅ Detail |
| PUT | `/api/classes/[id]` | ✅ Update (bien implementado con transacciones) |
| DELETE | `/api/classes/[id]` | ✅ Con cascada de relaciones |
| POST | `/api/classes/[id]/athletes` | ✅ Agregar atletas |
| POST | `/api/classes/[id]/generate-sessions` | ✅ |
| POST | `/api/classes/[id]/exceptions` | ✅ |
| PUT | `/api/classes/[id]/recurring-settings` | ✅ |

#### Groups
| Método | Ruta | Estado |
|--------|------|--------|
| GET | `/api/groups` | ✅ Listado |
| POST | `/api/groups` | ✅ Crear |
| GET | `/api/groups/[id]` | ✅ Detail |
| PATCH | `/api/groups/[id]` | ✅ Update (falta PUT) |
| DELETE | `/api/groups/[id]` | ✅ |
| POST | `/api/groups/[id]/athletes` | ✅ |

#### Coaches
| Método | Ruta | Estado |
|--------|------|--------|
| GET | `/api/coaches` | ✅ Listado |
| POST | `/api/coaches` | ✅ Crear |
| GET | `/api/coaches/[id]` | ✅ Detail |
| PUT | `/api/coaches/[id]` | ✅ Update |
| DELETE | `/api/coaches/[id]` | ✅ |
| GET | `/api/coaches/[id]/assignments` | ✅ |
| GET | `/api/coaches/[id]/public` | ✅ Perfil público |

#### Attendance
| Método | Ruta | Estado |
|--------|------|--------|
| GET | `/api/attendance` | ✅ |
| POST | `/api/attendance` | ✅ Registrar |
| PATCH | `/api/attendance/[id]` | ✅ Actualizar |

#### Billing
| Método | Ruta | Estado |
|--------|------|--------|
| GET | `/api/billing/invoices` | ✅ |
| GET | `/api/billing/invoices/[id]` | ✅ |
| POST | `/api/billing/sync` | ✅ Sync manual |
| GET | `/api/charges` | ✅ Listado |
| POST | `/api/charges/generate-monthly` | ✅ |
| GET | `/api/discounts` | ✅ |
| POST | `/api/discounts/apply` | ✅ |
| POST | `/api/discounts/validate` | ✅ |

#### Dashboard
| Método | Ruta | Estado |
|--------|------|--------|
| GET | `/api/dashboard/[academyId]` | ✅ Dashboard principal |
| GET | `/api/dashboard/[academyId]/analytics` | ✅ |
| GET | `/api/dashboard/[academyId]/analytics/full` | ✅ |
| GET | `/api/dashboard/[academyId]/financial-metrics` | ✅ |

#### Events
| Método | Ruta | Estado |
|--------|------|--------|
| GET | `/api/events` | ✅ |
| POST | `/api/events` | ✅ Crear |
| GET | `/api/events/[id]` | ✅ Detail |
| PUT | `/api/events/[id]` | ✅ Update |
| DELETE | `/api/events/[id]` | ✅ |
| GET | `/api/events/[id]/registrations` | ✅ |
| GET | `/api/events/[id]/payments` | ✅ |

#### Notifications
| Método | Ruta | Estado |
|--------|------|--------|
| GET | `/api/notifications` | ✅ |
| POST | `/api/notifications/send` | ✅ |
| PATCH | `/api/notifications/[id]` | ✅ Read |
| PUT | `/api/notifications/read-all` | ✅ |
| GET | `/api/notifications/unread-count` | ✅ |

#### AI Features
| Método | Ruta | Estado |
|--------|------|--------|
| POST | `/api/ai/attendance/analyze-risk` | ✅ |
| POST | `/api/ai/attendance/predict-absence` | ✅ |
| POST | `/api/ai/communication/generate-progress-update` | ✅ |
| POST | `/api/ai/billing/generate-reminder` | ✅ |

#### Super Admin
| Método | Ruta | Estado |
|--------|------|--------|
| GET | `/api/super-admin/academies` | ✅ |
| POST | `/api/super-admin/academies` | ✅ |
| GET | `/api/super-admin/academies/[id]` | ✅ |
| PUT | `/api/super-admin/academies/[id]` | ✅ |
| GET | `/api/super-admin/users` | ✅ |
| GET | `/api/super-admin/logs` | ✅ |
| GET | `/api/super-admin/metrics` | ✅ |

#### Cron Jobs
| Método | Ruta | Estado |
|--------|------|--------|
| POST | `/api/cron/class-reminders` | ✅ |
| POST | `/api/cron/daily-alerts` | ✅ |
| POST | `/api/alerts/class-reminders` | ✅ |

#### Webhooks
| Método | Ruta | Estado |
|--------|------|--------|
| POST | `/api/stripe/webhook` | ✅ |

### 2.2 Brechas de API Identificadas

| Recurso | CRUD | Faltante |
|---------|------|----------|
| Groups | 4/5 | No GET /api/groups/[id] endpoint |
| Assessments | 1/4 | No PUT/DELETE, no bulk create |
| Scholarships | 1/3 | No update ni delete |
| Notifications preferences | 0/2 | GET/POST pero no PUT |
| Assessments (athlete-level) | 1/4 | GET existe, no PUT/DELETE/PATCH |
| Class sessions | 2/4 | GET/POST, falta PUT/DELETE |
| Class enrollments | 2/4 | GET/POST, falta PUT/DELETE |
| Reports (export) | 1/3 | Attendance export, falta financial y progress |
| Coach notes | 1/3 | GET/POST/PATCH, falta DELETE |
| Support tickets | 2/3 | GET/POST/PATCH, falta DELETE |

### 2.3 Inconsistencias de Naming

| Patrón | Ejemplo bueno | Ejemplo problemático |
|--------|--------------|---------------------|
| Estructura de respuesta | Athletes: `{ total, page, items }` | Dashboard: `{ items }` varies |
| Naming de rutas | `/api/athletes/[id]/route.ts` | `/api/academies/route.ts` inconsistente |
| Verbos HTTP | Athletes usa PUT y PATCH | Groups solo usa PATCH |
| Errores | `{ error: "CODE" }` | Algunos tienen `message`, otros no |

### 2.4 Calidad de Respuestas

- **Validación:** Buena - Zod en todos los endpoints principales
- **Status codes:** Buenos - 200, 201, 400, 401, 403, 404, 409, 500
- **Manejo de errores:** Inconsistente - algunos endpointsusan `handleApiError()`, otros捕获 excepciones manualmente
- **Errores 500:** En desarrollo incluyen stack trace (correcto), en producción lo ocultan (correcto)

---

## 3. DATA LAYER

### 3.1 Modelo de Datos - Tablas Principales

```
profiles (users)
  └── memberships → academies (many-to-many via memberships)
  └── academies (one-to-many)
        └── athletes
        └── groups → groupAthletes → athletes (many-to-many)
        └── classes → classSessions → attendanceRecords
        └── coaches → classCoachAssignments
        └── events → eventRegistrations
        └── charges → billingItems
        └── scholarships
        └── discounts
        └── notifications
        └── supportTickets
        └── evaluations/assessments
        └── billingInvoices
        └── eventLogs
        └── academyMessages
        └── coaches (public profiles)
        └── classEnrollments (extra classes)
        └── classExceptions
        └── classWaitingList
        └── eventRegistrations
        └── eventInvitations
        └── scheduledReports
        └── pushSubscriptions
        └── pushTokens
        └── contactMessages
        └── employment/job listings
        └── marketplace listings
        └── advertising zones
        └── userPreferences
        └── billingEvents
        └── emailLogs
        └── onboardingStates/checklist
        └── attendanceAlerts
        └── coachNotes
        └── guardianAthletes
        └── academyGeoGroups
        └── skillCatalog
        └── authUsers (shadow table)
        └── subscriptions
        └── plans
        └── invitations
        └── scholarships
        └── auditLogs
```

### 3.2 Missing Tables

| Tabla necesaria | Urgencia | Notas |
|-----------------|----------|-------|
| `notification_preferences` (tipo granular) | Alta | Solo existe `user_preferences` genérico |
| `payment_methods` (persistir métodos de pago) | Alta | Solo en memory/state de Stripe |
| `webhook_logs` (audit de webhooks) | Media | No hay logging de eventos de Stripe |
| `api_keys` (para integración externa) | Media | No hay sistema de API keys |
| `announcements` (comunicados a tenants) | Baja | No hay tabla para announcements |
| `activity_feed` (feed de actividad) | Baja | Para dashboard social |

### 3.3 Índices - Análisis

**Buenos:**
- Cada tabla tiene `tenantId` con índice
- Índices compuestos para queries frecuentes: `athletes_tenant_academy_idx`, `charges_academy_period_idx`
- Unique index en `attendance_records_session_athlete_uq` previene duplicados

**Faltantes o subóptimos:**
- `athletes.dob` no tiene índice (usado en age filters en GET /api/athletes)
- `charges.status` no tiene índice específico para queries de overdue
- `class_sessions.sessionDate` no tiene índice propio (solo `classDateIdx` compuesto)
- No hay índice para `profiles.userId` (tabla tiene userId único, pero no índice explícito más allá de PK)

### 3.4 Row Level Security (RLS)

**Hallazgo:** No se encontró archivo de migración RLS ni policies explícitas en el codebase. El sistema depende de:
1. Verificación manual en endpoints: `verifyClassAccess()`, `verifyAthleteAccess()`, etc.
2. Filtro por `tenantId` en cada query SQL

**Riesgo:** Si un developer olvida agregar el filtro `tenantId` en una query, potencialmente expone datos cross-tenant.

**Veredicto:** RLS a nivel de aplicación existe pero NO a nivel de base de datos. Esto es una vulnerabilidad crítica que debería resolverse.

---

## 4. AUTHENTICATION & AUTHORIZATION

### 4.1 Sistema de Auth

- **Provider:** Supabase Auth (`@supabase/ssr`)
- **Middleware:** `src/lib/supabase/middleware.ts` — valida sesión en cada request
- **Wrappers:** `withTenant()` y `withSuperAdmin()` para endpoints API
- **Resolvers:** `resolveUserId()`, `getTenantId()`, `resolveTenantWithUpdate()`

### 4.2 Modelo de Roles

```
super_admin  → Acceso total a todos los tenants
admin        → Admin de academia, acceso limitado
owner        → Propietario de academia
coach        → Entrenador, acceso a athletes y classes asignadas
athlete      → Acceso propio
parent       → Acceso a athletes asociados (tutores)
```

**Problemas encontrados:**
- `src/lib/roles.ts` solo tiene labels, no permisos por rol
- No hay un sistema de permisos granular (RBAC fino)
- El rol "viewer" existe en `membershipRoleEnum` pero no se usa en `src/lib/permissions.ts`
- La verificación de permisos es manual en cada endpoint (ej: `src/app/api/groups/[groupId]/route.ts` hace hardcoded `role === "super_admin" || role === "admin" || role === "owner"`)

### 4.3 Multi-Tenancy

- Cada tabla tiene `tenantId` como foreign key hacia `profiles.tenantId`
- `withTenant()` extrae tenantId del perfil del usuario
- `activeAcademyId` permite switch entre academias de un mismo tenant
- No hay validación de que `profile.tenantId === academy.tenantId` en todos los endpoints

### 4.4 Security Assessment

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Contraseñas | ✅ | Supabase Auth maneja hashing |
| Rate limiting | ✅ | Vercel KV con sliding window |
| Input validation | ✅ | Zod en endpoints principales |
| SQL Injection | ✅ | Drizzle ORM parameterized queries |
| XSS | ✅ | React escapa por defecto |
| CSRF | ✅ | SameSite cookies via Supabase |
| CORS | ⚠️ | No configurado explícitamente |
| RLS en DB | ❌ | No hay policies RLS en la DB |
| Tenant isolation | ⚠️ | Aplicación filtra, DB no |
| Secrets en código | ✅ | dotenv con validación Zod |
| API keys management | ❌ | No existe sistema de API keys |
| Audit trail | ⚠️ | Tabla existe pero uso inconsistente |

---

## 5. CI/CD & DEPLOYMENT

### 5.1 Estado Actual

| Aspecto | Estado |
|---------|--------|
| GitHub Actions | ❌ No existe |
| GitLab CI | ❌ No existe |
| Vercel CI | ⚠️ Build automático en push (implied) |
| Preview deployments | ⚠️ Probablemente automático por Vercel |
| Environment promotion | ⚠️ Solo vercel environments (preview/production) |

### 5.2 Scripts Disponibles (package.json)

```json
"test": "vitest",
"test:coverage": "vitest --coverage",
"lint": "eslint .",
"lint:fix": "eslint . --fix",
"format": "prettier . --write",
"format:check": "prettier . --check",
"typecheck": "tsc --noEmit",
"db:migrate": "drizzle-kit push",
"validate:rls": "tsx scripts/validate-rls.ts"
```

**Problemas:**
- Tests configurados con Vitest pero NO hay archivos de test en `src/`
- No hay script de CI que corra lint + typecheck + tests
- No hay script de deployment estructurado
- No hay validación de RLS corriendo en CI (script existe pero no en pipeline)
- No hay smoke tests automatizados

### 5.3 Proceso de Deployment Actual

1. `git push origin main`
2. Vercel detecta push, inicia build
3. `npm run build` → `next build`
4. Vercel despliega a preview o production

**Riesgos:**
- No hay validación pre-deploy (lint, typecheck, tests)
- No hay rollback automatizado
- No hay canary deployments
- No hay feature flags para control de rollout

---

## 6. OBSERVABILITY

### 6.1 Logging

**Implementado:**
- Logger estructurado en `src/lib/logger.ts`
- Integración con Sentry (`@sentry/nextjs`)
- Niveles: DEBUG, INFO, WARN, ERROR
- Métodos especiales: `apiError()`, `dbOperation()`, `externalService()`

**Problemas:**
- En desarrollo solo `DEBUG` usa `console.debug` — `info`, `warn`, `error` siempre imprimen
- Sentry solo se inicializa si hay DSN — sin DSN en desarrollo silencioso
- No hay correlación de request IDs entre logs

### 6.2 Métricas

**Implementado:**
- Endpoint `/api/metrics` con tracking en memoria
- Métricas de: requests, errors, response times (p95, p99), DB operations
- Uptime tracking

**Problemas críticos:**
- **Métricas en memoria = se pierden en cada cold start de serverless**
- No hay persistencia a DB o servicio externo
- `/api/metrics/reset` es público en desarrollo (no auth)
- No hay dashboards de visualización
- No hay alerting configurado

### 6.3 Health Checks

- No hay endpoint de health check dedicado
- El endpoint `/api/metrics` puede servir como health check informal

### 6.4 Tracing

- Sentry proporciona tracing básico de errores
- No hay OpenTelemetry ni distributed tracing
- No hay correlación de logs por request ID

### 6.5 Alerting

- Sentry tiene alertas de errores configurables (pero no verificado si están activas)
- No hay alertas de: latency, error rate, RPS
- No hay alertas de negocio: failed payments, plan limit breaches

---

## 7. DEVELOPER EXPERIENCE

### 7.1 Code Quality

| Aspecto | Estado |
|---------|--------|
| TypeScript | ✅ Full coverage |
| ESLint | ✅ Configurado |
| Prettier | ✅ Configurado |
| Drizzle ORM typing | ✅ Strong |
| Zod validation | ✅ Consistent |
| Naming conventions | ⚠️ Inconsistente en APIs |

### 7.2 Testing

| Aspecto | Estado |
|---------|--------|
| Test framework | ✅ Vitest |
| Test files | ❌ Ninguno en `src/` |
| Coverage | ❌ 0% |
| Integration tests | ❌ No |
| E2E tests | ❌ No |
| API tests | ❌ No |

### 7.3 Documentación

| Aspecto | Estado |
|---------|--------|
| README.md | ⚠️ Básico |
| CLAUDE.md | ✅ Detallado con convenciones |
| API docs | ✅ Swagger endpoint `/api/docs` |
| Inline comments | ⚠️ Solo en secciones complejas |
| Architecture docs | ❌ No existe |
| Onboarding guide | ❌ No existe |

### 7.4 Code Patterns - Análisis de Consistencia

**Buenos patrones:**
- Uso de `withTransaction()` para operaciones atómicas
- `handleApiError()` centraliza manejo de errores
- `assertWithinPlanLimits()` para límites de recursos
- Zod schemas para validación de entrada

**Patrones problemáticos:**
- Endpoint `PUT /api/classes/[id]` tiene 50+ líneas de logging con `console.log` en lugar del logger
- Algunos endpoints retornan 404 para "no access" en lugar de 403
- No hay estándar de paginación (athletes usa cursor/page, otros no)
- No hay estándar de filtering (cada endpoint implementa el suyo)

---

## TOP 5 FIXES TÉCNICOS CON PRIORIDAD

### 1. Implementar RLS Policies en PostgreSQL (CRÍTICO)
**Esfuerzo:** 8-12h | **Impacto:** Seguridad multi-tenant
- Crear migrations con `CREATE POLICY` para cada tabla
- Implementar RLS en: athletes, classes, groups, coaches, charges, billing
- Agregar `SECURITY DEFINER` functions para admin operations
- Correr `npm run validate:rls` en CI

### 2. Métricas Persistentes (ALTA)
**Esfuerzo:** 4-6h | **Impacto:** Observabilidad real
- Persistir métricas a Supabase en lugar de memoria
- Crear tabla `app_metrics` con INSERT only
- Agregar endpoint `/api/health` con checks de DB
- Configurar dashboards en Sentry

### 3. Pipeline de CI/CD con GitHub Actions (ALTA)
**Esfuerzo:** 6-8h | **Impacto:** Quality gate, deployment confidence
```yaml
# .github/workflows/ci.yml
- Run: npm run typecheck
- Run: npm run lint
- Run: npm run test
- Run: npm run validate:rls
- Run: npm run build
```

### 4. Sistema de Permisos Basado en RBAC (MEDIA)
**Esfuerzo:** 10-15h | **Impacto:** Seguridad, mantenibilidad
- Crear `permissions` table con acciones por rol
- Implementar `can(action, resource, context)` helper
- Reemplazar checks hardcoded de roles
- Documentar matriz de permisos

### 5. Feature Flags desde Base de Datos (MEDIA)
**Esfuerzo:** 4-6h | **Impacto:** Flexibilidad operativa
- Crear `feature_flags` table
- Implementar `isFeatureEnabled(flag: string, tenantId: string)` helper
- Migrar `DISABLE_ONBOARDING_AUTOMATIONS` a DB
- Permitir toggling sin redeploy

---

## TOP 5 QUICK WINS DE DEVELOPER EXPERIENCE

### 1. Agregar Tests de API para Endpoints Críticos (1-2 días)
**Impacto:** Confianza en refactoring, bug detection

Priorizar:
- Athletes CRUD (patrón para todos los demás)
- Auth flow (login, logout, withTenant)
- Billing webhooks

### 2. Reemplazar console.log por logger en Classes PUT (30 min)
**Impacto:** Consistencia de logging, debugging en producción

Ubicación: `src/app/api/classes/[classId]/route.ts:169,182,216,etc.`

### 3. Generador de Endpoint CRUD Estándar (4-6h)
**Impacto:** Productividad, consistencia

Crear template o script que genere:
- Schema Zod
- GET, POST, PUT, DELETE, PATCH según necesidad
- Uso correcto de withTenant, handleApiError
- Tests boilerplate

### 4. Documentación de API con OpenAPI (2-3h)
**Impacto:** DX para integraciones

- Ya existe `/api/docs` con swagger
- Agregar annotations JSDoc a endpoints
- Publicar OpenAPI spec para integraciones externas

### 5. Script de Onboarding para Nuevos Developers (2h)
**Impacto:** Time-to-productivity para nuevos miembros

```
1. Clone repo
2. cp .env.example .env.local
3. npm install
4. npm run db:migrate
5. npm run dev
```

---

## ANEXO: SCHEMA EXPORT DUPLICADO

```typescript
// src/db/schema/index.ts líneas 16 y 50-51
export * from "./academy-messages";   // línea 15
export * from "./academy-geo-groups"; // línea 16

// ... 35 líneas después ...

export * from "./academy-messages";   // línea 50 (DUPLICADO)
export * from "./academy-geo-groups"; // línea 51 (DUPLICADO)
```

No causa errores pero genera warnings de TypeScript y confusión.

---

## ANEXO: ENDPOINTS QUE USAN console.log DIRECTO

| Archivo | Líneas |
|---------|--------|
| `src/app/api/classes/[classId]/route.ts` | 169, 182, 216, 225, 289, 323, 341, 343, 372, 380, 394, 402, 427, 444, 450 |
| `src/app/api/athletes/[athleteId]/route.ts` | Ninguno (usa logger) |
| `src/app/api/classes/route.ts` | Ninguno |

---

## ANEXO: TABLAS SIN ÍNDICE EN tenantId

Verificado: todas las tablas del schema tienen `tenantId` con índice compuesto o dedicado. ✅

---

*Documento generado automáticamente. Actualizar tras cada release mayor.*
