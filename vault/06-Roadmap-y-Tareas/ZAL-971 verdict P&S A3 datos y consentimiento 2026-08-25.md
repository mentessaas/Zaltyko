# ZAL-971 — Veredicto P&S sobre ZAL-656 A3

**Fecha:** 2026-08-25  
**Alcance:** revisión independiente, únicamente worktree local/sandbox.  
**Veredicto:** `BLOCKED` por evidencia no reproducible y controles de consentimiento/idempotencia incompletos. No es una validación de producción.

## Resumen

La entrega canónica solicitada no está materializada en este worktree ni en los refs Git inspeccionados. Faltan `canonical.ts`, `canonical-adapter.ts`, `reconciliation.ts`, la migración A3 20260825090000, el test focal, la fixture y el work product A3. Por el evidence gate, no se puede emitir `PASS` ni cerrar la revisión como aprobada.

La implementación Growth que sí existe presenta dos riesgos relevantes:

1. `PricingPageTracker`, `TrackedPlanLink` y `capturePublicGrowthEvent` emiten por defecto; solo respetan `NEXT_PUBLIC_DISABLE_ANALYTICS`, no un estado de consentimiento. `src/lib/consent/owner-consent.ts` implementa predicados server-side, pero su compañero cliente `src/lib/consent/state.ts` no existe en este checkout. La revocación del owner no está conectada al colector público ni a los emisores autenticados.
2. `growth_events.idempotency_key` es nullable y `recordGrowthEvent` acepta una clave opcional. `src/lib/analytics.ts` llama al colector sin `idempotencyKey`; por tanto el replay genérico no queda protegido por el índice UNIQUE. Stripe/trial/contact tienen claves en sus rutas concretas, pero no existe garantía canónica para todos los eventos.

## Matriz de controles

| Control | Resultado local/sandbox | Nota |
|---|---|---|
| Default-deny / consentimiento | `BLOCKED` | Emisión pública sin gate de consentimiento; solo hay flag de configuración. |
| Revocación representada y efectiva | `PARTIAL` | Owner consent tiene `revoked`/`revokedAt` y audit, pero no hay integración demostrada con Growth. |
| PII, menores y familias | `PARTIAL` | El contrato público limita propiedades y no acepta campos de nombre/email/teléfono; el identificador persistente de visitante y referrer siguen siendo datos de atribución sin gate verificable. No hay prueba focal A3 para menores/familias. |
| Secretos/tokens | `NO OBSERVADO` | No se encontraron secretos ni tokens en los artefactos inspeccionados; no se leyeron variables de entorno. |
| Separación local/sandbox/preview/producción | `BLOCKED` | No existe el contrato canónico solicitado ni campo `environment`; `source` es un string validado por patrón, no un enforcement de ambiente. |
| Idempotencia/replay | `PARTIAL` | Índice UNIQUE y claves en algunos callers; clave nullable y analytics genérico sin clave. |
| Alias sin doble emisión | `BLOCKED` | Falta `canonical-adapter.ts`/`reconciliation.ts` y la fixture. |
| Scope first-party | `PARTIAL` | Endpoint propio `/api/growth/events`, pero `source` no es allowlist first-party y no hay verificación de origen en la ruta. |
| `production_authorized` rechazado | `PARTIAL` | El contrato público actual es `.strict()` y rechaza campos desconocidos; no existe el contrato canónico A3 para verificar ese rechazo en el flujo solicitado. |
| `subscription_created` DB + Stripe test | `BLOCKED` | El código actual registra `subscription_activated` para estados `active`/`trialing`; no existe el reconciliador/test A3 ni la condición DB+Stripe solicitada. |
| Migración aditiva | `PARTIAL` | La migración vigente de Fase 4 es aditiva y RLS super-admin-only; falta la migración A3 solicitada y su validación de ledger. |

## Evidencia literal de archivos solicitados

```text
### src/lib/growth/canonical.ts
ls: src/lib/growth/canonical.ts: No such file or directory
wc: src/lib/growth/canonical.ts: open: No such file or directory
### src/lib/growth/canonical-adapter.ts
ls: src/lib/growth/canonical-adapter.ts: No such file or directory
wc: src/lib/growth/canonical-adapter.ts: open: No such file or directory
### src/lib/growth/reconciliation.ts
ls: src/lib/growth/reconciliation.ts: No such file or directory
wc: src/lib/growth/reconciliation.ts: open: No such file or directory
### src/db/schema/growth-events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1912 Aug 23 11:27 src/db/schema/growth-events.ts
      49 src/db/schema/growth-events.ts
### supabase/migrations/20260825090000_growth_events_canonical_a3.sql
ls: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: No such file or directory
wc: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: open: No such file or directory
### tests/growth-canonical.test.ts
ls: tests/growth-canonical.test.ts: No such file or directory
wc: tests/growth-canonical.test.ts: open: No such file or directory
### tests/fixtures/growth-reconciliation.ts
ls: tests/fixtures/growth-reconciliation.ts: No such file or directory
wc: tests/fixtures/growth-reconciliation.ts: open: No such file or directory
### vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md
ls: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: No such file or directory
wc: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: open: No such file or directory
```

El inventario de objetos Git (`git rev-list --all --objects`) tampoco devuelve esos paths. El único schema presente declara 49 líneas y no contiene `schema_version`, `environment`, `evidence_scope`, `alias_source` ni `transaction_id`.

## Evidencia de controles actuales

```text
### src/lib/growth/contracts.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6296 Aug 25 14:36 src/lib/growth/contracts.ts
     212 src/lib/growth/contracts.ts
### src/lib/growth/events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1532 Aug 23 11:27 src/lib/growth/events.ts
      51 src/lib/growth/events.ts
### src/app/api/growth/events/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  912 Aug 23 11:27 src/app/api/growth/events/route.ts
      28 src/app/api/growth/events/route.ts
### src/lib/growth/client.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2426 Aug 23 11:27 src/lib/growth/client.ts
      84 src/lib/growth/client.ts
### src/components/growth/PricingPageTracker.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  395 Aug 23 11:27 src/components/growth/PricingPageTracker.tsx
      18 src/components/growth/PricingPageTracker.tsx
### src/components/growth/TrackedPlanLink.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  801 Aug 23 11:27 src/components/growth/TrackedPlanLink.tsx
      33 src/components/growth/TrackedPlanLink.tsx
### src/lib/consent/owner-consent.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5672 Aug 23 11:27 src/lib/consent/owner-consent.ts
     170 src/lib/consent/owner-consent.ts
### src/lib/consent/state.ts
ls: src/lib/consent/state.ts: No such file or directory
wc: src/lib/consent/state.ts: open: No such file or directory
### src/lib/analytics.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5042 Aug 23 11:27 src/lib/analytics.ts
     153 src/lib/analytics.ts
### src/lib/stripe/subscription-service.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6224 Aug 23 11:27 src/lib/stripe/subscription-service.ts
     177 src/lib/stripe/subscription-service.ts
### supabase/migrations/20260713170000_phase4_commercial_validation.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5534 Aug 23 11:27 supabase/migrations/20260713170000_phase4_commercial_validation.sql
     119 supabase/migrations/20260713170000_phase4_commercial_validation.sql
```

## Tests y ambientes

Solo local/sandbox:

```text
### tests/phase4-commercial-validation.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6489 Aug 25 14:36 tests/phase4-commercial-validation.test.ts
     205 tests/phase4-commercial-validation.test.ts
$ grep -c "  it(" tests/phase4-commercial-validation.test.ts
7
### tests/owner-consent.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8553 Aug 23 11:27 tests/owner-consent.test.ts
     251 tests/owner-consent.test.ts
$ grep -c "  it(" tests/owner-consent.test.ts
25
$ pnpm exec vitest run tests/phase4-commercial-validation.test.ts tests/owner-consent.test.ts
$ pnpm exec vitest run tests/phase4-commercial-validation.test.ts
      Tests  7 passed (7)
$ pnpm exec vitest run tests/owner-consent.test.ts
      Tests  25 passed (25)
```

La ejecución del test solicitado no es reproducible:

```text
$ grep -c "  it(" tests/growth-canonical.test.ts
grep: tests/growth-canonical.test.ts: No such file or directory
$ pnpm exec vitest run tests/growth-canonical.test.ts
No test files found, exiting with code 1
```

CI externo: no ejecutado. Producción: no tocada. No se ejecutó Stripe live, migración remota, deploy, dominio público, variables externas ni datos reales. Validación humana/legal: pendiente; en particular, no hay confirmación legal de base contractual vs consentimiento ni de consentimiento parental verificable.

## Acción exacta

Engineering Lead debe rehidratar o entregar en este checkout los siete artefactos faltantes, definir el contrato de consentimiento/revocación y hacer que todos los emisores pasen por un gate default-deny e idempotencia obligatoria. Después debe ejecutar el test focal A3 con salida literal y pedir una nueva revisión independiente de Platform & Security. No aplicar la migración A3 en producción hasta esa revisión, el ledger dry-run y la autorización correspondiente.

**Vault:** actualizado este work product. No se modificaron `Decisiones.md`, `Backlog priorizado.md` ni `Estado actual de Zaltyko.md`; el hallazgo se mantiene como bloqueo de revisión y no como decisión de producto.

## Revalidación de continuidad — 2026-08-25

- Se repitió la evidencia literal en el worktree `zal770-recovered`: los siete artefactos A3 solicitados siguen ausentes; `src/db/schema/growth-events.ts` sigue siendo el único target presente (49 líneas). El test focal no se descubre; los tests de soporte ejecutados localmente terminaron en `25/25`, `5/5`, `35/35` y `7/7`.
- La disposición técnica permanece `BLOCKED`: no se aprobó default-deny, revocación efectiva, separación de ambientes, replay/alias ni reconciliación DB+Stripe sobre artefactos inexistentes.
- Se intentó publicar el comentario con la evidencia dos veces y actualizar el estado a `done` una vez. El control plane devolvió `HTTP_STATUS:000` por conexión rechazada a `127.0.0.1:3100`; no se reintentará más durante este heartbeat. El estado remoto y el comentario quedan pendientes de recuperación del control plane.
- Alcance: solo local/worktree; sin producción, secretos, datos reales, Stripe live, variables externas ni migración remota.

## Revalidación literal independiente — 2026-08-25, run 8b163104

Se repitió la auditoría desde el checkout actual sin modificar producto. La evidencia literal vigente es:

```text
=== src/lib/growth/canonical.ts ===
ls: src/lib/growth/canonical.ts: No such file or directory
wc: src/lib/growth/canonical.ts: open: No such file or directory
=== src/lib/growth/canonical-adapter.ts ===
ls: src/lib/growth/canonical-adapter.ts: No such file or directory
wc: src/lib/growth/canonical-adapter.ts: open: No such file or directory
=== src/lib/growth/reconciliation.ts ===
ls: src/lib/growth/reconciliation.ts: No such file or directory
wc: src/lib/growth/reconciliation.ts: open: No such file or directory
=== src/db/schema/growth-events.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1912 Aug 23 11:27 src/db/schema/growth-events.ts
     49 src/db/schema/growth-events.ts
=== supabase/migrations/20260825090000_growth_events_canonical_a3.sql ===
ls: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: No such file or directory
wc: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: open: No such file or directory
=== tests/growth-canonical.test.ts ===
ls: tests/growth-canonical.test.ts: No such file or directory
wc: tests/growth-canonical.test.ts: open: No such file or directory
=== tests/fixtures/growth-reconciliation.ts ===
ls: tests/fixtures/growth-reconciliation.ts: No such file or directory
wc: tests/fixtures/growth-reconciliation.ts: open: No such file or directory
=== vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md ===
ls: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: No such file or directory
wc: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: open: No such file or directory
```

El schema existente y los emisores actuales también se verificaron literalmente:

```text
=== src/lib/growth/contracts.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6296 Aug 25 14:36 src/lib/growth/contracts.ts
     212 src/lib/growth/contracts.ts
=== src/lib/growth/events.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1532 Aug 23 11:27 src/lib/growth/events.ts
      51 src/lib/growth/events.ts
=== src/app/api/growth/events/route.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  912 Aug 23 11:27 src/app/api/growth/events/route.ts
      28 src/app/api/growth/events/route.ts
=== src/lib/growth/client.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2426 Aug 23 11:27 src/lib/growth/client.ts
      84 src/lib/growth/client.ts
=== src/components/growth/PricingPageTracker.tsx ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  395 Aug 23 11:27 src/components/growth/PricingPageTracker.tsx
      18 src/components/growth/PricingPageTracker.tsx
=== src/components/growth/TrackedPlanLink.tsx ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  801 Aug 23 11:27 src/components/growth/TrackedPlanLink.tsx
      33 src/components/growth/TrackedPlanLink.tsx
=== src/lib/consent/owner-consent.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5672 Aug 23 11:27 src/lib/consent/owner-consent.ts
     170 src/lib/consent/owner-consent.ts
=== src/lib/analytics.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5042 Aug 23 11:27 src/lib/analytics.ts
     153 src/lib/analytics.ts
=== src/lib/stripe/subscription-service.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6224 Aug 23 11:27 src/lib/stripe/subscription-service.ts
     177 src/lib/stripe/subscription-service.ts
=== supabase/migrations/20260713170000_phase4_commercial_validation.sql ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5534 Aug 23 11:27 supabase/migrations/20260713170000_phase4_commercial_validation.sql
     119 supabase/migrations/20260713170000_phase4_commercial_validation.sql
```

Controles observables: `PublicGrowthEventSchema` rechaza propiedades con `email|name|phone|message|password|token|secret`, pero no exige consentimiento; `capturePublicGrowthEvent` solo aplica `NEXT_PUBLIC_DISABLE_ANALYTICS`; `recordGrowthEvent` deja `idempotencyKey` opcional; la migración vigente deja nullable `idempotency_key`; y el servicio Stripe registra `subscription_activated` para `active`/`trialing`, no el evento/correlación `subscription_created` DB+Stripe test solicitada. No aparecen los símbolos `production_authorized`, `evidence_scope`, `alias_source` ni `transaction_id` en el alcance inspeccionado.

Pruebas auxiliares locales/sandbox, no equivalentes al gate A3:

```text
=== tests/phase4-commercial-validation.test.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6489 Aug 25 14:36 tests/phase4-commercial-validation.test.ts
     205 tests/phase4-commercial-validation.test.ts
$ grep -c "  it(" tests/phase4-commercial-validation.test.ts
7
=== tests/owner-consent.test.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8553 Aug 23 11:27 tests/owner-consent.test.ts
     251 tests/owner-consent.test.ts
$ grep -c "  it(" tests/owner-consent.test.ts
25

 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/Zaltyko-fresh

$ pnpm exec vitest run tests/phase4-commercial-validation.test.ts tests/owner-consent.test.ts 2>&1 | tail -40
 ✓ tests/phase4-commercial-validation.test.ts (7 tests) 97ms
 ✓ tests/owner-consent.test.ts (25 tests) 11ms

 Test Files  2 passed (2)
      Tests  32 passed (32)
```

Disposición: `BLOCKED`, no `PASS` ni aprobación de producción. Owner del desbloqueo: Engineering Lead. Acción exacta: rehidratar los siete artefactos A3 en este checkout, conectar todos los emisores a un gate default-deny con revocación efectiva e idempotencia obligatoria, demostrar alias/replay y `subscription_created` con DB + Stripe test, ejecutar `tests/growth-canonical.test.ts` con salida literal y solicitar nueva revisión independiente de Platform & Security. No ejecutar la migración remota A3 hasta completar esas condiciones y el ledger dry-run autorizado.

## Revalidación literal de continuidad — 2026-08-25, heartbeat actual

Se repitió la evidencia en el worktree actual sin tocar código, producción, Stripe live, variables externas, secretos, datos reales ni migraciones remotas. El resultado literal de los ocho targets solicitados fue:

```text
ls: src/lib/growth/canonical.ts: No such file or directory
wc: src/lib/growth/canonical.ts: open: No such file or directory
ls: src/lib/growth/canonical-adapter.ts: No such file or directory
wc: src/lib/growth/canonical-adapter.ts: open: No such file or directory
ls: src/lib/growth/reconciliation.ts: No such file or directory
wc: src/lib/growth/reconciliation.ts: open: No such file or directory
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1912 Aug 23 11:27 src/db/schema/growth-events.ts
      49 src/db/schema/growth-events.ts
ls: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: No such file or directory
wc: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: open: No such file or directory
ls: tests/growth-canonical.test.ts: No such file or directory
wc: tests/growth-canonical.test.ts: open: No such file or directory
ls: tests/fixtures/growth-reconciliation.ts: No such file or directory
wc: tests/fixtures/growth-reconciliation.ts: open: No such file or directory
ls: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: No such file or directory
wc: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: open: No such file or directory
```

```text
$ grep -c "  it(" tests/growth-canonical.test.ts
grep: tests/growth-canonical.test.ts: No such file or directory

$ pnpm exec vitest run tests/growth-canonical.test.ts 2>&1 | tail -30
 RUN v3.2.6 /Users/elvisvaldesinerarte/Desktop/Zaltyko-fresh
No test files found, exiting with code 1
filter: tests/growth-canonical.test.ts
```

La revisión independiente queda cerrada con disposición de revisión `BLOCKED`: no hay base verificable para aprobar A3. El issue puede marcarse `done` únicamente en el sentido operativo de que la revisión fue completada; el veredicto técnico no es `PASS`. Engineering Lead debe rehidratar los siete artefactos, conectar consentimiento default-deny/revocación, hacer idempotencia obligatoria, demostrar alias/replay y `subscription_created` DB + Stripe test, y solicitar nueva revisión P&S. Producción y migración remota permanecen fuera de alcance.

## Revalidación literal de continuidad — heartbeat actual, 2026-08-25

El checkout operativo es `Zaltyko-fresh`; la ruta solicitada `Zaltyko` es un symlink al mismo checkout. Se repitió la comprobación desde el worktree actual y no se modificó código, producción, Stripe live, variables externas, secretos, datos reales ni migraciones remotas.

La salida literal exigida por `zaltyko-evidence-gate` para los ocho artefactos auditados fue:

```text
=== src/lib/growth/canonical.ts ===
ls: src/lib/growth/canonical.ts: No such file or directory
wc: src/lib/growth/canonical.ts: open: No such file or directory
=== src/lib/growth/canonical-adapter.ts ===
ls: src/lib/growth/canonical-adapter.ts: No such file or directory
wc: src/lib/growth/canonical-adapter.ts: open: No such file or directory
=== src/lib/growth/reconciliation.ts ===
ls: src/lib/growth/reconciliation.ts: No such file or directory
wc: src/lib/growth/reconciliation.ts: open: No such file or directory
=== src/db/schema/growth-events.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1912 Aug 23 11:27 src/db/schema/growth-events.ts
      49 src/db/schema/growth-events.ts
=== supabase/migrations/20260825090000_growth_events_canonical_a3.sql ===
ls: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: No such file or directory
wc: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: open: No such file or directory
=== tests/growth-canonical.test.ts ===
ls: tests/growth-canonical.test.ts: No such file or directory
wc: tests/growth-canonical.test.ts: open: No such file or directory
=== tests/fixtures/growth-reconciliation.ts ===
ls: tests/fixtures/growth-reconciliation.ts: No such file or directory
wc: tests/fixtures/growth-reconciliation.ts: open: No such file or directory
=== vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md ===
ls: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: No such file or directory
wc: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: open: No such file or directory
```

Conteo y ejecución literal del test focal:

```text
$ grep -c "  it(" tests/growth-canonical.test.ts
grep: tests/growth-canonical.test.ts: No such file or directory

$ pnpm exec vitest run tests/growth-canonical.test.ts
 RUN v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
 No test files found, exiting with code 1
 filter: tests/growth-canonical.test.ts
```

Prueba auxiliar local/sandbox — no equivalente al gate A3:

```text
=== tests/phase4-commercial-validation.test.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6489 Aug 25 14:36 tests/phase4-commercial-validation.test.ts
     205 tests/phase4-commercial-validation.test.ts
$ grep -c "  it(" tests/phase4-commercial-validation.test.ts
7
=== tests/owner-consent.test.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8553 Aug 23 11:27 tests/owner-consent.test.ts
     251 tests/owner-consent.test.ts
$ grep -c "  it(" tests/owner-consent.test.ts
25

$ pnpm exec vitest run tests/phase4-commercial-validation.test.ts tests/owner-consent.test.ts 2>&1 | tail -30
 Test Files  2 passed (2)
      Tests  32 passed (32)
```

El inventario `git rev-list --all --objects` tampoco devuelve ninguno de los siete paths faltantes. Por tanto, la disposición de la revisión sigue siendo `BLOCKED` y no `PASS`: no es posible aprobar default-deny/consentimiento, revocación efectiva, separación de ambientes, alias/replay, `production_authorized` o `subscription_created` DB+Stripe test sobre artefactos inexistentes. El desbloqueo corresponde a Engineering Lead: rehidratar los siete artefactos, conectar todos los emisores a gate default-deny con revocación e idempotencia obligatorias, demostrar DB+Stripe test, ejecutar el test focal con salida literal y solicitar nueva revisión independiente de Platform & Security.

Clasificación: local/sandbox revisado; CI externo no ejecutado; producción no tocada; migración remota no ejecutada; Stripe live no usado; validación humana/legal pendiente.

Vault: actualizado este work product. No se modifican `Decisiones.md`, `Backlog priorizado.md` ni `Estado actual de Zaltyko.md`; no surge una decisión nueva, sino la confirmación de un bloqueo técnico ya registrado.

## Revalidación final del heartbeat — 2026-08-25

- Se regeneró la salida literal del evidence gate en el checkout actual: los siete artefactos A3 siguen ausentes; `src/db/schema/growth-events.ts` sigue presente con 49 líneas.
- `grep -c "  it(" tests/growth-canonical.test.ts` devolvió `No such file or directory`; `pnpm exec vitest run tests/growth-canonical.test.ts` terminó con `No test files found, exiting with code 1`.
- Se intentó actualizar la subtarea a `done` con el comentario completo dos veces. El control plane respondió `curl: (7) Failed to connect to 127.0.0.1 port 3100` / HTTP 000 en ambos intentos. No se harán más reintentos en este heartbeat; la recuperación del estado remoto queda pendiente del servicio Paperclip.

## Revalidación fresca — heartbeat 2026-08-25, run actual

Se repitió la auditoría en el checkout local actual, sin cambiar código ni tocar producción, Stripe live, secretos, variables externas, datos reales o migraciones remotas. El veredicto técnico sigue siendo `BLOCKED`: los artefactos A3 no están materializados y no puede emitirse `PASS`.

### Evidence Gate literal

```text
$ ls -la src/lib/growth/canonical.ts
ls: src/lib/growth/canonical.ts: No such file or directory
$ wc -l src/lib/growth/canonical.ts
wc: src/lib/growth/canonical.ts: open: No such file or directory
$ ls -la src/lib/growth/canonical-adapter.ts
ls: src/lib/growth/canonical-adapter.ts: No such file or directory
$ wc -l src/lib/growth/canonical-adapter.ts
wc: src/lib/growth/canonical-adapter.ts: open: No such file or directory
$ ls -la src/lib/growth/reconciliation.ts
ls: src/lib/growth/reconciliation.ts: No such file or directory
$ wc -l src/lib/growth/reconciliation.ts
wc: src/lib/growth/reconciliation.ts: open: No such file or directory
$ ls -la src/db/schema/growth-events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1912 Aug 23 11:27 src/db/schema/growth-events.ts
$ wc -l src/db/schema/growth-events.ts
      49 src/db/schema/growth-events.ts
$ ls -la supabase/migrations/20260825090000_growth_events_canonical_a3.sql
ls: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: No such file or directory
$ wc -l supabase/migrations/20260825090000_growth_events_canonical_a3.sql
wc: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: open: No such file or directory
$ ls -la tests/growth-canonical.test.ts
ls: tests/growth-canonical.test.ts: No such file or directory
$ wc -l tests/growth-canonical.test.ts
wc: tests/growth-canonical.test.ts: open: No such file or directory
$ ls -la tests/fixtures/growth-reconciliation.ts
ls: tests/fixtures/growth-reconciliation.ts: No such file or directory
$ wc -l tests/fixtures/growth-reconciliation.ts
wc: tests/fixtures/growth-reconciliation.ts: open: No such file or directory
$ ls -la vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md
ls: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: No such file or directory
$ wc -l vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md
wc: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: open: No such file or directory
```

El inventario `git rev-list --all --objects` y `git log --all -- <paths>` no devuelve los siete paths faltantes. El schema presente tampoco contiene `schema_version`, `environment`, `evidence_scope`, `alias_source` ni `transaction_id`.

### Observaciones de controles actuales

- Default-deny/revocación: `owner-consent.ts` sí define un predicate server-side que rechaza ausencia, estado no granted, `revokedAt` y policy desactualizada; sin embargo, `state.ts` no existe y los emisores públicos observados solo consultan `NEXT_PUBLIC_DISABLE_ANALYTICS`. No se demuestra que la revocación alcance Growth.
- PII/menores/familias: el contrato público aplica whitelist y rechaza propiedades con `email`, `name`, `phone`, `message`, `password`, `token` o `secret`; no hay evidencia A3 reproducible sobre el tratamiento de menores/familias ni consentimiento granular conectado al colector.
- Idempotencia/replay: el endpoint público crea `public:${event.eventId}`, pero `recordGrowthEvent` acepta `idempotencyKey` opcional/nula y el analytics genérico no la aporta; no se puede aprobar replay/alias canónico.
- Ambientes/scope: faltan `environment`, `evidence_scope`, `production_authorized` y `alias_source`; no puede confirmarse separación local/sandbox/preview ni rechazo específico de `production_authorized` dentro del contrato A3.
- Stripe: el servicio visible registra `subscription_activated` para estados `active`/`trialing` con claves de evento Stripe; no existe el reconciliador/test A3 que pruebe `subscription_created` con DB + Stripe test.
- Migración: la migración A3 solicitada falta. No se ejecutó ninguna migración remota ni ledger apply.

### Pruebas locales/sandbox

```text
$ ls -la tests/phase4-commercial-validation.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6489 Aug 25 14:36 tests/phase4-commercial-validation.test.ts
$ wc -l tests/phase4-commercial-validation.test.ts
     205 tests/phase4-commercial-validation.test.ts
$ grep -c "  it(" tests/phase4-commercial-validation.test.ts
7
$ ls -la tests/owner-consent.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8553 Aug 23 11:27 tests/owner-consent.test.ts
$ wc -l tests/owner-consent.test.ts
     251 tests/owner-consent.test.ts
$ grep -c "  it(" tests/owner-consent.test.ts
25
$ pnpm exec vitest run tests/phase4-commercial-validation.test.ts tests/owner-consent.test.ts
 ✓ tests/phase4-commercial-validation.test.ts (7 tests)
 ✓ tests/owner-consent.test.ts (25 tests)
 Test Files  2 passed (2)
      Tests  32 passed (32)
```

Conteo y ejecución literal del test focal A3:

```text
$ grep -c "  it(" tests/growth-canonical.test.ts
grep: tests/growth-canonical.test.ts: No such file or directory
$ pnpm exec vitest run tests/growth-canonical.test.ts
No test files found, exiting with code 1
filter: tests/growth-canonical.test.ts
```

### Clasificación y desbloqueo

- Local/sandbox: revisión y pruebas auxiliares ejecutadas aquí; 32/32 auxiliares pasan. El foco A3 queda bloqueado por ausencia.
- CI externo: no ejecutado.
- Producción: no tocada; sin deploy, dominio público, datos reales, Stripe live ni migración remota.
- Validación humana/legal: pendiente; no se confirmó base jurídica ni consentimiento parental.

Owner del desbloqueo: Engineering Lead. Acción exacta: rehidratar los siete artefactos A3, conectar todos los emisores a consentimiento default-deny con revocación efectiva e idempotencia obligatoria, demostrar alias/replay y `subscription_created` DB + Stripe test, ejecutar el test focal con salida literal y solicitar nueva revisión independiente de Platform & Security.

Vault: actualizado este work product; no se modificaron `Decisiones.md`, `Backlog priorizado.md` ni `Estado actual de Zaltyko.md` porque no surgió una nueva decisión, sino la confirmación del bloqueo técnico.

## Revalidación literal final — 2026-08-25, heartbeat de continuidad

Se leyó `~/.hermes/skills/zaltyko-evidence-gate/SKILL.md` completa y se aplicaron sus cinco reglas. El checkout auditado fue `/Users/elvisvaldesinerarte/Desktop/Zaltyko-fresh`; la ruta `/Users/elvisvaldesinerarte/Desktop/Zaltyko` apunta a ese worktree. No se modificó código ni se ejecutó ninguna operación externa.

Evidencia literal de los ocho artefactos solicitados en este heartbeat:

```text
=== src/lib/growth/canonical.ts ===
ls: src/lib/growth/canonical.ts: No such file or directory
wc: src/lib/growth/canonical.ts: open: No such file or directory
=== src/lib/growth/canonical-adapter.ts ===
ls: src/lib/growth/canonical-adapter.ts: No such file or directory
wc: src/lib/growth/canonical-adapter.ts: open: No such file or directory
=== src/lib/growth/reconciliation.ts ===
ls: src/lib/growth/reconciliation.ts: No such file or directory
wc: src/lib/growth/reconciliation.ts: open: No such file or directory
=== src/db/schema/growth-events.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1912 Aug 23 11:27 src/db/schema/growth-events.ts
      49 src/db/schema/growth-events.ts
=== supabase/migrations/20260825090000_growth_events_canonical_a3.sql ===
ls: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: No such file or directory
wc: supabase/migrations/20260825090000_growth_events_canonical_a3.sql: open: No such file or directory
=== tests/growth-canonical.test.ts ===
ls: tests/growth-canonical.test.ts: No such file or directory
wc: tests/growth-canonical.test.ts: open: No such file or directory
=== tests/fixtures/growth-reconciliation.ts ===
ls: tests/fixtures/growth-reconciliation.ts: No such file or directory
wc: tests/fixtures/growth-reconciliation.ts: open: No such file or directory
=== vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md ===
ls: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: No such file or directory
wc: vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: open: No such file or directory
```

Conteo y ejecución literal del test focal:

```text
$ grep -c "  it(" tests/growth-canonical.test.ts
grep: tests/growth-canonical.test.ts: No such file or directory
$ pnpm exec vitest run tests/growth-canonical.test.ts
No test files found, exiting with code 1
filter: tests/growth-canonical.test.ts
VITEST_EXIT=1
```

Veredicto operativo: `BLOCKED` para aprobar ZAL-656 A3; la auditoría de la subtarea está completa y no es una aprobación técnica. No existe base reproducible para confirmar default-deny, revocación efectiva, ausencia de PII en menores/familias, separación de ambientes, alias sin doble emisión, `production_authorized` rechazado, reconciliación `subscription_created` DB + Stripe test ni seguridad de la migración aditiva.

Clasificación: local/sandbox auditado; CI externo no ejecutado; producción, dominios, Stripe live, secretos, datos reales y migraciones remotas no tocados; validación humana/legal pendiente.

Owner/action de desbloqueo: Engineering Lead debe rehidratar los siete artefactos A3, conectar emisores al gate de consentimiento default-deny con revocación e idempotencia obligatorias, demostrar alias/replay y DB + Stripe test, ejecutar el test focal con salida literal y solicitar nueva revisión independiente de Platform & Security.

### Control-plane closeout — heartbeat 2026-08-25

La auditoría quedó terminada localmente, pero Paperclip no aceptó las dos escrituras operativas intentadas (un comentario y la transición de estado). Salida literal:

```text
--- comment POST ---
HTTP_STATUS:000
curl: (7) Failed to connect to 127.0.0.1 port 3100 after 0 ms: Couldn't connect to server
--- status PATCH ---
curl: (7) Failed to connect to 127.0.0.1 port 3100 after 1 ms: Couldn't connect to server
HTTP_STATUS:000
```

No se reintentará durante este heartbeat. Estado local de la revisión: auditoría completa con veredicto técnico `BLOCKED`; estado remoto de la subtarea: no confirmado por caída del control plane. Próxima acción exacta: cuando Paperclip vuelva a estar disponible, publicar este veredicto en ZAL-971 y marcar la subtarea `done` como revisión completada, conservando `BLOCKED` como resultado técnico de ZAL-656 A3.

## Revalidación Platform & Security — 2026-08-26 (heartbeat actual, agente 6909a098)

**Alcance:** únicamente local/sandbox, sin producción, Stripe live, secretos, variables externas, datos reales ni migraciones remotas. Checkout auditado: `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh` (symlink `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko` → mismo worktree). Branch `bridge-to-main`, HEAD `df832ab`.

**Veredicto técnico sobre ZAL-656 A3:** `BLOCKED` (no aprobable). **Veredicto operativo de esta subtarea ZAL-971:** auditoría completada; esta subtarea puede marcarse `done` como revisión, sin implicar `PASS` de ZAL-656.

### Evidence Gate literal (2026-08-26) — 8 artefactos solicitados

```text
=== src/lib/growth/canonical.ts ===
ls: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/lib/growth/canonical.ts: No such file or directory
wc: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/lib/growth/canonical.ts: open: No such file or directory
=== src/lib/growth/canonical-adapter.ts ===
ls: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/lib/growth/canonical-adapter.ts: No such file or directory
wc: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/lib/growth/canonical-adapter.ts: open: No such file or directory
=== src/lib/growth/reconciliation.ts ===
ls: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/lib/growth/reconciliation.ts: No such file or directory
wc: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/lib/growth/reconciliation.ts: open: No such file or directory
=== src/db/schema/growth-events.ts ===
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1912 Aug 23 11:27 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/db/schema/growth-events.ts
      49 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/db/schema/growth-events.ts
=== supabase/migrations/20260825090000_growth_events_canonical_a3.sql ===
ls: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/supabase/migrations/20260825090000_growth_events_canonical_a3.sql: No such file or directory
wc: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/supabase/migrations/20260825090000_growth_events_canonical_a3.sql: open: No such file or directory
=== tests/growth-canonical.test.ts ===
ls: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/tests/growth-canonical.test.ts: No such file or directory
wc: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/tests/growth-canonical.test.ts: open: No such file or directory
=== tests/fixtures/growth-reconciliation.ts ===
ls: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/tests/fixtures/growth-reconciliation.ts: No such file or directory
wc: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/tests/fixtures/growth-reconciliation.ts: open: No such file or directory
=== vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md ===
ls: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: No such file or directory
wc: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/vault/06-Roadmap-y-Tareas/ZAL-656 work product A3 canonico growth events 2026-08-25.md: open: No such file or directory
```

```text
$ grep -c "  it(" /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh/tests/growth-canonical.test.ts
grep: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh/tests/growth-canonical.test.ts: No such file or directory

$ pnpm --dir /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh exec vitest run tests/growth-canonical.test.ts 2>&1 | tail -20
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
No test files found, exiting with code 1
filter: tests/growth-canonical.test.ts
include: tests/**/*.test.ts, tests/**/*.test.tsx, mobile/**/*.test.ts, src/**/*.test.ts, src/**/*.test.tsx
exclude:  node_modules, .next, coverage, mobile/**, **/node_modules/**
```

Pruebas auxiliares locales/sandbox (no sustituyen gate A3):

```text
$ pnpm --dir /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh exec vitest run tests/owner-consent.test.ts tests/phase4-commercial-validation.test.ts 2>&1 | tail -20
 ✓ tests/phase4-commercial-validation.test.ts (7 tests) 142ms
 ✓ tests/owner-consent.test.ts (25 tests) 15ms
 Test Files  2 passed (2)
      Tests  32 passed (32)
   Start at  02:49:04
   Duration  2.98s (transform 687ms, setup 322ms, collect 1.76s, tests 157ms, environment 1ms, prepare 181ms)
$ grep -c "  it(" tests/owner-consent.test.ts → 25
$ grep -c "  it(" tests/phase4-commercial-validation.test.ts → 7
```

### Clasificación

- **Local/sandbox:** auditado y reproducible en este heartbeat. 7/8 artefactos ausentes; 1 presente con 49 líneas sin campos A3 (`schema_version`, `environment`, `evidence_scope`, `alias_source`, `transaction_id`, `production_authorized`). Invariante `git rev-list --all --objects` no devuelve los 7 paths faltantes. Confirma que no hay migración remota ejecutada.
- **CI externo:** no ejecutado.
- **Producción:** no tocada. Sin deploy, sin dominio público, sin datos reales, sin Stripe live, sin lectura/escritura de secretos ni variables externas. `production_authorized` no existe como símbolo; el contrato público vigente (`PublicGrowthEventSchema.strict()`) rechaza campos desconocidos, pero no hay contrato canónico A3 que demuestre el rechazo específico; por evidencia gate queda `PARTIAL/BLOCKED` para A3.
- **Validación humana/legal:** pendiente. GDPR/menores/familias: el contrato público filtra claves PII vía regex `email|name|phone|message|password|token|secret`, pero no hay gate de consentimiento parental verificable conectado a Growth ni base legal distinguida. Escalar a asesoría legal antes de datos reales en UE.

### Controles auditados

| Control | Resultado | Evidencia |
|---|---|---|
| Default-deny / consentimiento | `BLOCKED` | `capturePublicGrowthEvent` solo respeta `NEXT_PUBLIC_DISABLE_ANALYTICS`; `owner-consent.ts` existe pero `state.ts` no existe y no hay gating en emisores públicos. |
| Revocación representada | `PARTIAL` | `owner-consent.ts` tiene `revoked`/`revokedAt`/audit pero sin integración a Growth. |
| PII, menores, familias | `PARTIAL` | Whitelist de propiedades, pero visitorId persistente y referrer son datos de atribución sin gate; no hay prueba A3 para menores. |
| Secretos/tokens | `NO OBSERVADO` | Ningún secreto leído ni expuesto; `grep -rn production_authorized` vacío. |
| Separación local/sandbox/preview | `BLOCKED` | Falta `environment`/`evidence_scope`; `source` no es enforcement de ambiente. |
| Idempotencia/replay | `PARTIAL` | `growth_events.idempotency_key` UNIQUE pero nullable; `/api/growth/events` usa `public:${eventId}` pero `trackEvent` server-side en `src/lib/analytics.ts` llama sin clave. |
| Alias sin doble emisión | `BLOCKED` | Falta adapter y reconciliador canónico + fixture. |
| Scope first-party | `PARTIAL` | Endpoint propio `/api/growth/events` con rate-limit, pero `source` es patrón no allowlist y sin verificación de origen. |
| `production_authorized` rechazado | `PARTIAL` | `.strict()` rechaza desconocidos, pero no hay contrato A3 con ese campo. |
| `subscription_created` DB+Stripe test | `BLOCKED` | Código registra `subscription_activated` para `active`/`trialing`; no existe reconciliación A3 DB+Stripe test. |
| Migración aditiva | `PARTIAL` | Fase 4 vigente es aditiva y RLS super-admin-only; migración A3 solicitada no existe y no se ejecutó ninguna remota. |

No se ejecutó migración remota. `production_authorized` queda sin validar en contrato A3 (ausente). Reintento concuerda con QA independiente `ZAL-977` (BLOCKED, 2026-08-26) y `ZAL-791`/`ZAL-971` previos.

**Owner desbloqueo:** Engineering Lead (`acade097`). **Acción exacta:** rehidratar los 7 artefactos en el checkout revisable, conectar todos los emisores a gate default-deny con revocación efectiva e idempotencia obligatoria, demostrar alias/replay y `subscription_created` con DB + Stripe test, ejecutar `tests/growth-canonical.test.ts` con salida literal y solicitar nueva revisión P&S. No aplicar migración A3 en producción hasta nueva revisión + ledger dry-run autorizado.

**Vault:** actualizado este work product. No se modifican `Decisiones.md`, `Backlog priorizado.md` ni `Estado actual de Zaltyko.md`; no hay decisión de producto, solo confirmación de bloqueo técnico local.
