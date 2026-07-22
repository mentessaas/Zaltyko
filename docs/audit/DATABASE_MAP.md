# Mapa de base de datos

## Inventario

- 88 módulos en `src/db/schema`; 82 contienen `pgTable`; 34 declaraciones de `pgEnum`.
- 6 migraciones Drizzle y 40 SQL versionados de Supabase pasan el verificador de integridad. El ledger remoto contiene 40 filas; las migraciones Día 2 y Día 3 se aplicaron transaccionalmente el 2026-07-21.
- 69 tablas tenant-scoped están declaradas con RLS según `pnpm validate:rls`.
- El lote aplicado habilita RLS en diez catálogos deportivos globales; el proyecto remoto reporta 234 policies públicas y 119 tablas públicas con RLS. `__drizzle_migrations` es la única tabla pública sin RLS aprobada porque no forma parte de Data API.

## Dominios

| Dominio | Tablas/módulos principales | Relaciones clave |
|---|---|---|
| Identidad y tenancy | profiles, academies, memberships, invitations, academy-link-requests, academy-roles, role-members, permissions | usuario → perfil → tenant; membership/role por academia |
| Operación deportiva | athletes, guardians, guardian-athletes, family-contacts, coaches, groups, classes, enrollments, sessions, attendance, assessments, sport-config, federative-licenses | academia → grupo/clase → sesión; atleta ↔ grupo/tutor; evaluación → atleta/aparato |
| Billing | plans, subscriptions, trials, billing-items/invoices/events, charges, receipts, discounts, scholarships, stripe-accounts, family-stripe-customers, payment-attempts, refunds | tenant/academia → cargos; familia → customer Stripe; cargo → intent/intento/reembolso |
| Comunicación | announcements, academy/direct messages, conversations, message-history/templates/groups, notifications, push | academia/participantes → conversación/mensaje/notificación |
| Público/crecimiento | events, marketplace, empleo, leads, growth, interviews, support, audit/event logs | recursos públicos con ownership opcional y trazabilidad |

## Migraciones y ledger

`pnpm db:migrate` está bloqueado para remoto; el flujo sancionado para Supabase es dry-run `db:migrate:ledger`, revisión humana y `--apply`, que registra SHA-256 transaccionalmente. La validación actual confirma integridad de archivos, no equivalencia completa schema↔producción ni calidad semántica de cada policy.

## RLS y accesos

Hay dos caminos:

1. Drizzle/`pg` servidor: conexión privilegiada; debe filtrar `tenantId`/`academyId` explícitamente.
2. Supabase browser client: Data API bajo JWT; RLS decide qué filas puede ver/escribir el usuario.

`supabase/rls-consolidated.sql` usa con frecuencia `tenant_id = get_current_tenant()`. Esto aísla academias entre tenants, pero no separa necesariamente owner/coach/familia/atleta dentro del tenant.

## Hallazgos

| ID | Archivo/símbolo | Problema y evidencia | Severidad | Riesgo | Recomendación | Responsable |
|---|---|---|---|---|---|---|
| DB-001 | `supabase/rls-consolidated.sql:24-109` | Helpers `SECURITY DEFINER` viven en `public`, usan `search_path=public` y no se encontró revocación explícita de `EXECUTE`. | Alta | Superficie de escalada/invocación no intencional si cambian cuerpos u objetos resolubles. | Mover helpers a schema privado, calificar objetos y revocar/grantar execute explícitamente. | Sol |
| DB-002 | `supabase/rls-consolidated.sql`; policy de `plans` | Policy usa `auth.role()` en vez de roles `TO authenticated`. | Media | Semántica obsoleta y migraciones futuras frágiles. | Reescribir policies con `TO authenticated` y condiciones de fila explícitas. | Sol |
| DB-003 | `src/db/index.ts:43-45` | TLS acepta certificados no confiables. | Alta | MITM sobre credenciales y datos sensibles. | Validar CA Supabase mediante bundle confiable y fallar cerrado. | Sol |
| DB-004 | `src/db/index.ts:28-39` | Pool máximo por defecto reducido a 5 por instancia y configurable. | Media | Agotamiento del pooler bajo scale-out si se eleva sin métricas reales. | Dimensionar contra límites reales de Supavisor/Vercel y conservar la monitorización de saturación. | Sol |
| DB-005 | `scripts/validate-rls.ts`; SQL RLS | El validador acredita existencia/cobertura, no least privilege por rol. | Alta | Falsa confianza: una policy tenant-wide puede exponer datos de menores a familias/atletas. | Añadir tests SQL con JWT owner/coach/parent/athlete y casos negativos fila/operación. | Sol |

## Estado Día 2

- DB-001: **parcial**. Diez helpers privados endurecidos; cuatro wrappers públicos compatibles permanecen hasta migrar las policies históricas restantes.
- DB-002: **cerrado en migración aplicada**. `plans_read` usa `TO authenticated`; no hay `auth.role()` en SQL aplicable nuevo.
- DB-003: **cerrado en código**. Runtime y ledger remoto requieren CA y `rejectUnauthorized:true`.
- DB-004: **mitigado**. Presupuesto por instancia baja de 50 a 5, configurable; capacidad global pendiente de métricas Supavisor/Vercel.
- DB-005: **parcial**. Matriz PostgreSQL real verde para dominios core y catálogos globales (26 tablas/9 escenarios); quedan lotes tenant-wide y PostgREST local.

`supabase db push --linked --dry-run` se ejecutó el 2026-07-21 y propuso el lote histórico completo. No se usó para aplicar cambios: el ledger propio fue la autoridad y aplicó solo Día 2/Día 3. La verificación posterior devuelve `40 migraciones verificadas; no hay pendientes`.

Inventario/CRUD completo: `docs/audit/RLS_SEMANTIC_MATRIX.md`.
