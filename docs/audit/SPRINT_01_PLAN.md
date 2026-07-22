# Sprint 01 — hardening de siete días

## Objetivo

Llegar a una decisión go/no-go basada en cierre de los P0 y P1 que bloquean producción. La auditoría no implementa estas tareas; este documento es el plan ejecutable.

## Día 1 — auth, sesiones y aislamiento

- Sol: corregir AUTH-001 con deny-by-default y matriz baseline.
- Sol/Terra: fixtures owner, coach, viewer/parent, athlete y super_admin; negativas por API.
- Entregable: PR pequeño con tests antes/después y sin cambios de producto.
- Aceptación: viewer/parent/athlete reciben 403 en APIs administrativas; owner permitido solo en su academia; academia B denegada.
- Riesgo: bloquear flows legítimos de coach; mitigar declarando capabilities explícitas.

## Día 2 — RLS, DB y migraciones

- Sol: mapear grants browser y policies por guardian/self/coach; cerrar MT-002/003.
- Sol: habilitar CA DB y dimensionar pool; preparar SQL versionado, sin aplicar a producción hasta revisión.
- Aceptación: pruebas con JWT reales demuestran 0 filas cruzadas y operaciones denegadas; `validate:rls` y ledger verdes.
- Riesgo: policy demasiado restrictiva; probar happy paths de cada rol.
- Ejecución 2026-07-16: migración versionada sin aplicar, PostgreSQL efímero con rollback verde, TLS/pool/build endurecidos. Cierre parcial: quedan policies tenant-wide secundarias y prueba PostgREST local.

## Día 3 — permisos y rutas sensibles

- Sol/Terra: cruzar 294 handlers con permission registry, método y resource scope.
- Priorizar atletas, familias, clases/asistencia, evaluaciones, mensajes, billing y super-admin.
- Aceptación: matriz automatizada y auditor estático/ejecutable; ninguna mutación sensible depende solo de membership/UI.
- Ejecución 2026-07-16: inventario enriquecido de 294 rutas, matriz de capabilities y cero scopes dinámicos manuales. ROLE-003 también queda cerrado: suites API/Stripe/tenancy/TSX reparadas e integradas, 86 archivos y 618/618 tests tanto en gate normal como de seguridad. La semántica Día 2 + Día 3 pasa en PostgreSQL efímero con rollback. Listo para iniciar Día 4, sin autorización implícita para producción.

## Día 4 — transacciones externas

- Sol: Stripe Connect, webhooks, cron, invitaciones y email en sandbox.
- Ejecución 2026-07-16: hardening local de aislamiento/idempotencia Connect, refunds serializados, claims atómicos de invitación/vínculo, leases de cron, readiness y fail-closed de email/KV. La matriz externa de Stripe test mode, entrega Brevo y paridad Vercel no se ejecutó por falta de autorización/secretos; producción sigue no-go.
- Cierre técnico 2026-07-18: gate completo verde (293 APIs, RLS 69/69, migraciones 6+40, 640/640 tests y build de 219 páginas). `/help` ya no tiene bucle y el alias `/evaluations` redirige a `/assessments` en Chromium, Firefox y WebKit, 3/3 sin retries. Es seguro iniciar Día 5 local; producción sigue no-go porque la prueba con `next start` confirmó 429 fail-closed mientras Vercel KV no esté configurado y faltan las validaciones externas.
- Probar firma, replay, idempotencia, SCA/rechazo/reembolso, token expirado/usado y readiness de env.
- Aceptación: ningún secreto ausente degrada silenciosamente; no se realizan cargos live.

## Día 5 — rutas, responsive y accesibilidad

- Terra decide/implementa contrato de `/`; Luna corrige overflow y valida navegación/estados por rol.
- Viewports 320, 375, 768 y 1440; teclado, foco, reflow 400%, nombres/errores y targets.
- Aceptación: sin scroll horizontal, canonical coherente, axe sin violaciones bloqueantes y checklist manual firmado.

### Cierre de auditoría Día 5 (2026-07-21)

- Verificado local compilado y read-only con navegador integrado: `/` → `/es/gimnasia-artistica`, 320×812, 375×812, 768×812 y 1440×900 sin overflow (`scrollWidth === innerWidth`), tarjetas reflowan correctamente.
- Evidencia nueva enlazada en `UI_UX_AUDIT.md`; no se conserva captura de login porque autofill local expuso datos en la primera toma y la evidencia fue sobrescrita sin valores.
- Bloqueos explícitos: faltan sesiones autenticadas por rol y axe/Playwright autorizado. No se declara conformidad WCAG completa ni se cierra UI-003/A11Y-001.

### Cierre de auditoría Día 6 (2026-07-21)

- `pnpm verify:production` PASS: API 293, RLS 69/69, migraciones 6+40, typecheck, lint, 90 archivos/640 tests y build 219 páginas.
- Runtime fijado: Node 20 en CI y `.nvmrc`, `engines` Node `>=20 <23` y pnpm `9.15.3`.
- Supply chain: `pnpm audit` inicialmente encontró CVE-2026-59877 en `protobufjs@7.6.4`; override actualizado a `^7.6.5`, lockfile regenerado y auditoría posterior en cero.
- Pendiente: SBOM/policy formal en CI. Es deuda P2, no un falso cierre de los bloqueos de producción externos.

## Día 6 — estabilización y CI/CD

> Actualización 2026-07-22: el conteo operativo actual del auditor es 294 handlers. El resultado histórico de 640 tests se conserva como evidencia de ese snapshot; el CI de `8ca1c701` falló por un test de permisos obsoleto y `00a4c3ce` lo actualiza.

- Terra/Sol: mantener Vitest 643/643, fijar Node, build reproducible, scanner de dependencias mantenido y paridad de variables.
- Ejecutar secuencialmente lint, typecheck, tests, build, API auditor, RLS semántica y migraciones.
- Aceptación: pipeline reproducible dos veces desde checkout limpio.

## Día 7 — regresión y go/no-go

- Repetir flujos críticos con cinco roles; revisar riesgos residuales y rollback.
- Actualizar los 13 docs y vault con estado real; no cerrar hallazgos por intención.
- Aceptación: P0=0, P1 bloqueantes=0, evidencia enlazada y decisión go/no-go registrada.

### Resultado Día 7 (2026-07-21)

- Regresión local completa verde: 91 archivos/643 tests, `verify:production` PASS (incluye env/dependency gates), auditor API sin riesgos, RLS semántica estática PASS, migraciones 6+40 y build 219 páginas.
- Smoke UI read-only público verde en 320/375/768/1440 px; no se ejecutaron acciones de escritura ni Playwright/axe adicionales.
- **Decisión: NO-GO producción.** RLS Día 2/3 ya está promovido por ledger (40/40). KV, Brevo, WAF y sesiones/axe por rol ya tienen evidencia; la rotación Stripe con 2FA quedó cerrada y persisten el redeploy/entrega firmada end-to-end del webhook, el scanner antimalware y las alertas gestionadas de Vercel (Hobby). `verify:production` pasa, con una vulnerabilidad baja y una moderada transitivas no bloqueantes.

### Reconciliación posterior — 2026-07-22

- Se añadió monitorización propia con GitHub Actions y `/api/health`; el primer spot-check productivo devolvió HTTP 200 y PostgreSQL en 29,43 ms.
- El advisory de `protobufjs` se corrigió en `main` con 7.6.5. Dependabot todavía conserva el alert abierto hasta su siguiente reescaneo.
- El primer CI posterior al arreglo de dependencias detectó un test de permisos desactualizado; `00a4c3ce` lo alinea con `permission-policy.ts` y queda pendiente únicamente la confirmación del workflow.
- El árbol local sigue dirty por trabajo paralelo y no es una base de release reproducible hasta separar esos cambios.

### Correcciones locales posteriores

- `next-auth` retirado; Supabase Auth/`INTERNAL_AUTH_SECRET` es el contrato operativo.
- Uploads endurecidos con firma binaria y límites centralizados.
- CI añade `pnpm audit:env`, `pnpm audit:dependencies --prod` y SBOM CycloneDX.

## Orden operativo resumido

1. Críticos de permisos/sesión/aislamiento.
2. RLS, conexión privilegiada y datos.
3. Matriz de roles y APIs.
4. Cobros/webhooks/cron/invitaciones.
5. Rutas/UI/responsive/a11y.
6. Tests/setup/CI/supply chain.
7. Regresión, riesgos residuales y go/no-go.

## Definition of Done

- Cada hallazgo cerrado cita commit, prueba y evidencia; owner distinto valida.
- No hay secretos en logs/docs ni cambios de migración sin ledger/review.
- Pruebas negativas cubren tenant B y recurso de otro usuario dentro del mismo tenant.
- Producción solo recibe cambios tras sandbox, rollback ensayado y aprobación explícita.
