# Matriz ejecutable de autorización API — Día 3

## Fuente de verdad y reproducción

`pnpm exec tsx scripts/audit-api-routes.ts --json` inspecciona los 294 Route Handlers y emite, por archivo y método: categoría de identidad, capability, Zod o validación equivalente, rate limit, academia, resource scope, service role, `tenantId` de cliente, clasificación de datos y contrato de denegación. `pnpm audit:api-routes:strict` falla ante mutaciones sin categoría, capabilities ausentes en dominios sensibles o un `tenantId` de cliente no limitado explícitamente a super-admin.

Snapshot final actualizado: 294 handlers; 204 tenant, 39 bearer, 16 públicos, 12 super-admin, 10 deprecated, 7 cron, 4 webhooks y 2 dev. Hay 196 handlers mutantes, 193 cubiertos por rate limit, 171 archivos con al menos una capability, 177 con Zod/validación equivalente, 255 con respuesta estándar, 257 con error estándar, 150 con evidencia de scope de academia, 5 con service role y **0** recursos dinámicos pendientes de revisión manual. El único `tenantId` aceptado desde body está limitado al flujo legacy de super-admin en `/api/admin/users`; `/api/athletes` ya no acepta override de tenant.

## Precedencia y matriz de roles

| Rol efectivo | Capabilities | Scope adicional obligatorio |
|---|---|---|
| `super_admin` | global, solo tras identidad verificada | contrato super-admin; nunca `user_metadata`, header o rol enviado por cliente |
| owner de academia | todas, solo en la academia realmente poseída o membership `owner` | tenant y academia; el perfil global `owner` no concede otra academia |
| coach baseline | `athletes:read/update`, `classes:read/schedule`, `reports:read`, `events:read`, `communications:read/send` | clase/sesión/atleta asignado cuando aplica; sin billing/settings |
| viewer baseline | ninguna capability administrativa | solo endpoints propios que declaren scope self/participant |
| parent | `communications:read/send` | hijos mediante `guardian_athletes`; nunca billing global ni otros menores |
| athlete | `communications:read/send` | perfil/datos propios; sin scope financiero familiar |
| custom role | únicamente grants del rol activo y vigente | no amplía tenant, academia ni resource scope; expirado/inactivo falla cerrado |

## Inventario de capabilities

El JSON ejecutable contiene la lista exacta de métodos y rutas consumidoras por capability. Resumen de consumidores registrados:

| Dominio | Capabilities | Baseline adicional a owner | Métodos/rutas consumidoras |
|---|---|---|---:|
| atletas | `read`, `create`, `update`, `delete` | coach: `read/update` | 46 |
| clases | `read`, `create`, `update`, `delete`, `schedule` | coach: `read/schedule` | 29 |
| billing | `read`, `create`, `update`, `payments`, `reports` | ninguno | 65 |
| coaches | `read`, `create`, `update`, `delete` | ninguno | 9 |
| reports | `read`, `create`, `export` | coach: `read` | 27 |
| settings | `read`, `write`, `users` | ninguno | 24 |
| events | `read`, `create`, `update`, `delete` | coach: `read` | 22 |
| communications | `read`, `send`, `templates` | coach y portal limitado: `read/send` | 46 |

`billing:invoices` y `settings:branding` existen en el enum pero no tienen consumidor registrado; no conceden acceso por sí mismos. Toda denegación de capability devuelve 403. Los recursos cruzados deben devolver 403 o 404 sin revelar existencia.

## Correcciones Día 3 y estado

- Se registraron capabilities antes ausentes para academias, diagnósticos, gastos, notas, pagos, dashboards, analytics, contact messages, link requests, licencias, resultados, uploads y WhatsApp; se completaron `DELETE` de evaluaciones/mensajes y mutaciones de reportes programados.
- Las conversaciones familiares usan `communications:send`, no una capability de creación de atleta/grupo.
- `verifyCoachClassScope` y `verifyCoachAthleteScope` ya no consideran `profile.role=owner/admin` como ownership; consultan ownership/membership de la academia y después exigen asignación a coach.
- Se corrigió el orden tenant/academia en tres llamadas a `verifyGroupAccess` de cobros y resumen de grupo.
- Los vídeos de evaluación validan IDs con Zod, enlazan academia↔evaluación, aplican scope de atleta/asignación y usan respuestas estándar.
- Se añadió `authorizeAcademyCapability`, `authorizeClassResource` y `authorizeAthleteResource`; las rutas sensibles resuelven primero el recurso real y luego comprueban tenant, academia, capability y asignación/ownership.
- Documentos de atleta, billing items, enrollments/waiting list, sesiones/excepciones, notas, cargos, coaches, descuentos/becas, invitaciones, actividad y comunicación quedaron cerrados con scope explícito. Las excepciones `self`, guardian y super-admin están anotadas en el inventario.
- `message_templates`, `message_groups` y `scheduled_notifications` incorporan `academy_id`; colecciones y IDs dinámicos se filtran por academia. La migración aditiva `20260716214500_day3_communication_academy_scope.sql` reescribe RLS y solo hace backfill inequívoco para tenants con una academia. Está versionada, revisada y **no aplicada**.

## Evidencia y cierre previo a Día 4

La selección focalizada incluye owner A/B, coach asignado/no asignado, cambio de tenant, atleta de otra academia, baseline/custom role, bearer, familia y billing. El antiguo harness histórico fue actualizado e incorporado al gate normal: pasan **86 archivos y 618/618 tests**, también bajo `pnpm test:security`, sin exclusiones Vitest ni skips en esos suites. Se cubren envelopes actuales, billing deprecated 410, Stripe, tenancy y runtime TSX; ROLE-003 queda cerrado en el alcance automatizado.

Durante la integración se corrigieron dos defectos reales: los handlers con rate limit conservan ahora el `context.params` de Next.js, y la selección de límites usa el prefijo más específico (`/api/athletes/import` ya no hereda el límite general de `/api/athletes`). ROUTE-004 y MT-004 permanecen cerrados: `resourceScopeManualReview=0`, `risky=[]` y `semanticRisks=[]`.
