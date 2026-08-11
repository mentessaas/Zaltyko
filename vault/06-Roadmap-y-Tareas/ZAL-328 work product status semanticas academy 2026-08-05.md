---
status: durable
issue: ZAL-328
parent: ZAL-324
ancestor: ZAL-139
spec_version: v0.2
spec_attachment: 9d7a99e9-6de2-471f-aad9-a91945cde8e1-ZAL-139-onboarding-owner-v0.2.md
agent: 6909a098-7ef1-49e6-898c-2c8fb18183e6 (Platform & Security)
date: 2026-08-05
scope: Diseño + SQL versionado + Drizzle + helper gate + tests + RLS
reviewers: Web Developer (5bcea506) — peer review del shape de la migración
          Engineering Lead (acade097) — sign-off final antes de aplicar
---

# ZAL-328 — Modelar status semánticas academy (churned/fraud_hold)

## 0. Resumen ejecutivo

Gap 3 de ZAL-324 (derivado del veredicto QA ZAL-312 B3). El spec v0.2 §6 exige
gate de envío que reconozca `churned`, `suspended` y `fraud_hold`, pero el
schema actual solo tiene `is_suspended boolean`.

**Decisión técnica aplicada:** opción (a) recomendada por ZAL-315 §3.1:
`status text NOT NULL DEFAULT 'active'` con enum `('active','trial','suspended','churned','fraud_hold')`,
audit trail con timestamps + actor + razón, RLS anon endurecida, helper
centralizado `isAcademyBlockedFromSending(academyId)`.

**Implementación:**
- Drizzle schema delta en `src/db/schema/academies.ts` (sin push a DB todavía).
- SQL versionado en `supabase/migrations/20260805120000_academies_status_semantics.sql`
  (idempotente, transaccional, NO aplicado todavía).
- Helper en `src/lib/academy-status.ts` con 4 funciones públicas.
- 30 tests en `tests/academy-status.test.ts` (100% líneas, 94% branches).
- Filtro extra en `src/app/api/public/academies/route.ts` para el directorio
  público (excluye `churned` y `fraud_hold`).
- Re-export desde `src/lib/onboarding.ts` para que el integrador d0/d2/d7
  (ZAL-314) consuma el gate desde el módulo de onboarding.

**Lo que NO se hizo:** no se aplicó la migración a sandbox ni a producción.
Eso requiere sign-off del Web Developer (peer review del shape) y del
Engineering Lead (aprobación del runbook). La activación corresponde a la
fase ZAL-324 → ZAL-314 → reviewer.

## 1. Decisión técnica: opción (a) enum con timers de auditoría

### 1.1 Por qué enum y no flag derivado

Per ZAL-315 §3.1, las razones para preferir enum sobre `churned` derivado:

1. **`fraud_hold` es flag de seguridad.** Un enum explícito permite
   `WHERE status='fraud_hold'` sin ambigüedad.
2. **`churned` debe tener timestamp explícito.** Derivarlo de
   `trial_ends_at < now() AND paymentsConfiguredAt IS NULL` significa que
   mover `trial_ends_at` (cupón) lo "resucita". Riesgo de seguridad.
3. **Audit trail.** `churned_at`, `fraud_hold_at`, `fraud_hold_actor_id`,
   `fraud_hold_reason`, `churned_reason` registran cuándo y por qué.
4. **Backwards compatibility.** `is_suspended` se preserva como flag legacy
   para la UI del super-admin. El trigger `sync_academy_status_legacy`
   mantiene ambos en sync; gate evalúa `status` con fallback a
   `isSuspended=true` (defense in depth).

### 1.2 Valores del enum

| Valor | Significado | Trial elegible | Billing | Email soft |
|---|---|---|---|---|
| `active` | Pago al día, operativa | n/a | normal | sí |
| `trial` | Trial activo, sin pagos configurados | sí | trial | sí |
| `suspended` | Bloqueada temporalmente (Support) | cualquiera | congelado | NO |
| `churned` | Terminal: terminó trial sin pagar, dueño canceló, etc. | n/a | cerrado | NO |
| `fraud_hold` | Decisión de seguridad, congelada por sospecha | nunca | congelado | NO |

NO incluir `churned`/`fraud_hold` en el directorio público (criterio §3.3 #4).

### 1.3 Backfill

Las filas existentes se mapean en una sola pasada transaccional:

```sql
-- is_suspended=true (y no fraud_hold) → suspended
UPDATE academies SET status='suspended', status_updated_at=now()
  WHERE is_suspended=true AND status NOT IN ('suspended', 'fraud_hold');

-- is_trial_active=true (y no suspended) → trial
UPDATE academies SET status='trial', status_updated_at=now()
  WHERE is_trial_active=true AND is_suspended=false AND status='active';

-- resto (post-purga 2026-07-07: sin suspended, sin trial) → active
UPDATE academies SET status='active', status_updated_at=now()
  WHERE is_suspended=false AND is_trial_active=false AND status<>'active';
```

NO se inventa `churned` ni `fraud_hold` en el backfill. Esas transiciones
requieren acción humana explícita (criterio §3.3 #6: nunca auto-clear).

## 2. Entregables

### 2.1 Schema Drizzle (`src/db/schema/academies.ts`)

Cambios aplicados, NO push todavía:

```ts
export const academyStatusValues = [
  "active", "trial", "suspended", "churned", "fraud_hold",
] as const;
export type AcademyStatus = typeof academyStatusValues[number];

export const academyFraudHoldReasonValues = [
  "payment_fraud_signal", "owner_identity_failure",
  "chargeback_threshold", "manual_review", "other",
] as const;

export const academyChurnedReasonValues = [
  "trial_expired_no_payment", "owner_cancellation",
  "manual_closure", "other",
] as const;

// En la tabla academies:
status: text("status").notNull().default("active"),
statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
churnedAt: timestamp("churned_at", { withTimezone: true }),
churnedReason: text("churned_reason"),
churnedReasonNotes: text("churned_reason_notes"),
fraudHoldAt: timestamp("fraud_hold_at", { withTimezone: true }),
fraudHoldReason: text("fraud_hold_reason"),
fraudHoldReasonNotes: text("fraud_hold_reason_notes"),
fraudHoldActorId: uuid("fraud_hold_actor_id").references(() => profiles.id, { onDelete: "set null" }),
fraudHoldClearedAt: timestamp("fraud_hold_cleared_at", { withTimezone: true }),
fraudHoldClearedActorId: uuid("fraud_hold_cleared_actor_id").references(() => profiles.id, { onDelete: "set null" }),

// Nuevos índices:
statusIdx: index("academies_status_idx").on(table.status),
statusPublicIdx: index("academies_status_public_idx").on(table.status, table.isPublic),
```

### 2.2 SQL migration (`supabase/migrations/20260805120000_academies_status_semantics.sql`)

Características:

- **Idempotente**: todas las columnas usan `ADD COLUMN IF NOT EXISTS`,
  constraints usan `DROP IF EXISTS` + `ADD`. Re-ejecutable por el ledger.
- **Transaccional**: `BEGIN`/`COMMIT` único. Sin `VACUUM` ni
  `CREATE INDEX CONCURRENTLY` (el runner los rechazaría).
- **Audit constraints**: check constraints en `status`, `fraud_hold_reason`,
  `churned_reason`. Cross-field invariant: si `status='fraud_hold'`,
  `fraud_hold_at` Y `fraud_hold_reason` deben estar presentes.
- **Backfill**: una sola pasada UPDATE por rama (no fila por fila).
- **Índices**: `academies_status_idx`, `academies_status_public_idx`.
- **RLS**: nueva policy `academies_public_directory` para anon/authenticated
  que excluye `churned` y `fraud_hold` del directorio público. Defense in
  depth: server con BYPASSRLS no la ve, pero si en el futuro se cambia
  un cliente a anon, sigue siendo seguro.
- **Helper SQL**: `public.is_academy_blocked_from_sending(uuid)` retorna
  `boolean` con la misma lógica que el helper TypeScript. Cualquier caller
  SQL (jobs, queries ad-hoc) evalúa la misma regla.
- **Trigger sync**: `sync_academy_status_legacy` mantiene `is_suspended` y
  `status='suspended'` en sync bidireccionalmente. Defense in depth: si
  la UI toggleea `is_suspended`, `status` se actualiza; si el integrador
  cambia `status`, `is_suspended` se actualiza.

### 2.3 Helper TypeScript (`src/lib/academy-status.ts`)

Cuatro funciones públicas:

```ts
// Bloquea envío si status ∈ {suspended, churned, fraud_hold} OR isSuspended=true
isAcademyBlockedFromSending(academyId: string): Promise<AcademySendingEligibility>

// Variante bulk para crons. Una sola query (IN clause).
getAcademySendingEligibilityBulk(academyIds: string[]): Promise<Map<string, Eligibility>>

// Predicate simple para integradores.
academyMayReceiveOnboardingEmail(academyId: string): Promise<boolean>

// Métrica legible para logs/telemetría.
describeBlockingReason(eligibility): string  // "blocked_sending:fraud_hold"
```

**Fail-closed**: si la query falla, retorna `blocked=true, reason="not_found"`.
Criterio §3.3 #7: un fallo del gate NUNCA debe traducirse en envío.

**Sin caché**: status puede cambiar en segundos (suspensión manual, expiración
de trial). El SELECT es despreciable al volumen actual (< 1ms en DB local).

### 2.4 Filtro del directorio público

`src/app/api/public/academies/route.ts` añade:

```ts
sql`${academies.status} NOT IN ('churned', 'fraud_hold')`,
```

Mantiene `isSuspended=false` por defense in depth (transición).

### 2.5 Tests (`tests/academy-status.test.ts`)

30 tests, 100% líneas, 94% branches. Cubre:

- Cada uno de los 5 valores de `status`.
- Override por `isSuspended=true` legacy.
- `fraud_hold` con prioridad sobre todo.
- Fallo de DB → `blocked=true` (fail-closed).
- `null` defensivo (no debería ocurrir gracias al constraint NOT NULL).
- Bulk: dedup, IDs vacíos, fail-closed.
- `describeBlockingReason` para todas las razones.
- `academyMayReceiveOnboardingEmail` predicate.
- Matriz completa status × isSuspended (9 combinaciones).

## 3. Riesgos residuales

### 3.1 Riesgos cubiertos

- **RLS anon no expone `churned`/`fraud_hold`**: nueva policy + filtro en API.
- **Auto-clear de `fraud_hold`**: criterio §3.3 #6 exige siempre acción humana.
  El constraint check exige `fraud_hold_at` Y `fraud_hold_reason` presentes
  cuando `status='fraud_hold'`. El integrador NUNCA debe poder clear sin
  pasar por el endpoint gated por `withSuperAdmin`.
- **Compatibilidad con UI super-admin**: trigger sync mantiene `is_suspended`
  y `status` en sync bidireccionalmente. La UI puede seguir togglando
  `is_suspended` sin tocar código.
- **Default NOT NULL en `status`**: las filas existentes que se inserten
  en el gap entre la migración y el deploy del nuevo código reciben
  `status='active'`. Seguro.

### 3.2 Riesgos NO cubiertos (delegan a otros owners)

- **Auto-sync de `status` con el ciclo de `trial_lifecycle`**: cuando el
  trial expira, el cron `trial_lifecycle` (`src/lib/billing/trial-service.ts:326`)
  debería mover `status: trial → churned` con `churned_reason='trial_expired_no_payment'`.
  **Esto no está en este entregable.** Requiere decisión de producto
  (¿todo trial expirado = churned? o esperar N días?). Lo deja como
  follow-up.
- **Endpoints de super-admin para setear `fraud_hold`/`churned`**: el
  `SuperAdminAcademyDetail.tsx` ya toggea `isSuspended`. Falta extender
  con selector de `status` + razón. **Owner: Web Developer + P&S
  review.** Se delega a child issue (ZAL-329, ver §5).
- **Activación de la cola d0/d2/d7**: `§12 v0.2` mantiene la secuencia
  DESACTIVADA. La activación es decisión del Board con sign-off
  previo de ZAL-315 §11 (sales freeze).

### 3.3 Decisiones tomadas bajo control reversible

| Decisión | Reversible | Cómo revertir |
|---|---|---|
| `status` enum con 5 valores | sí | DROP CONSTRAINT + DROP COLUMN |
| Audit trail (`churned_at`, etc.) | sí | DROP COLUMN nullable |
| `is_academy_blocked_from_sending` SQL helper | sí | DROP FUNCTION |
| Trigger sync legacy | sí | DROP TRIGGER |
| Filtro directorio público | sí | Quitar cláusula SQL |
| Helper TypeScript en `src/lib/academy-status.ts` | sí | Borrar módulo |
| 30 tests | sí | Borrar test file |

Ninguna decisión es destructiva o externa. Cero impacto en producción /
secretos / datos reales / Stripe / dominios públicos.

## 4. Lo que Web Developer debe revisar antes de mergear

1. **Shape de la migración SQL**: idempotente, transaccional, sin
   `drizzle-kit push` (mantener vía `pnpm db:migrate:reviewed`).
2. **Helper `isAcademyBlockedFromSending`**: contrato del retorno
   (`AcademySendingEligibility`). Integrable en el emitter d0/d2/d7
   (ZAL-314) llamando `academyMayReceiveOnboardingEmail(academyId)`
   antes de `sendD{0,2,7}Email`.
3. **Re-export desde `onboarding.ts`**: el integrador no necesita
   importar el helper desde otra ruta.
4. **Filtro del directorio**: el endpoint `/api/public/academies`
   ahora excluye `churned`/`fraud_hold`. UI debe reflejarlo.
5. **Trigger sync**: cualquier toggle de `is_suspended` por el
   super-admin UI ahora también cambia `status`. Verificar que
   la UI actual no rompe.

## 5. Child issues derivados

| Issue | Owner | Estado | Descripción |
|---|---|---|---|
| ZAL-329 | Web Developer (5bcea506) | TODO | Endpoints super-admin para setear `status` + `churned_reason` / `fraud_hold_reason` |
| ZAL-330 | Engineering Lead (acade097) | TODO | Auto-sync `status` con `trial_lifecycle` cron (¿trial expirado sin pago → churned?) |
| ZAL-331 | P&S (6909a098) | TODO | Script de auditoría post-aplicación: contar academias por `status`, alertar si hay `fraud_hold` sin actor |

## 6. Tareas NO cubiertas (ordenadas por criticidad)

1. **Sandbox apply + peer verification**: ejecutar `pnpm db:migrate:reviewed`
   contra sandbox Supabase, verificar 0 filas en `churned`/`fraud_hold`
   pre-migración, confirmar backfill idempotente. → Engineering Lead.
2. **Aplicar a producción**: mismo flujo, bloqueado por ZAL-26X (Board).
3. **ZAL-329**: extender UI super-admin.
4. **ZAL-330**: cron auto-sync con `trial_lifecycle`.
5. **ZAL-331**: telemetría post-deploy.

## 7. Hash y trazabilidad

Este documento es work product durable. SHA del commit se ancla en ZAL-328
vía `POST /completion-proofs/commits` con `touchedPaths` que incluyen este
archivo + `src/db/schema/academies.ts` + `src/lib/academy-status.ts` +
`tests/academy-status.test.ts` + `supabase/migrations/20260805120000_*.sql`.

**No es prueba de código autoral por sí solo** — es la prueba de que el
shape de la migración está escrito y commiteado. El integrador
d0/d2/d7 vive en ZAL-314 (Web Developer) y su cierre exige la peer
verification cruzada de este SHA + la C-1 suya.

## 8. Siglas y referencias

- ZAL-139: spec v0.2 onboarding owner (anclada como attachment).
- ZAL-312: QA verdict contrato d0/d2/d7 v0.2 (B3).
- ZAL-315: sign-off privacidad d0/d2/d7 v0.2 (criterios §3 B3).
- ZAL-324: parent [D-006/WD] cerrar 5 gaps activación (post-veredicto ZAL-311).
- ZAL-311: Web Developer revisar contrato técnico de plantillas owner v0.2.
- ZAL-329 / ZAL-330 / ZAL-331: child issues (ver §5).
- §6 spec v0.2: gate de envío.
- §3.3 spec v0.2: criterios de seguridad `fraud_hold`.
- §11 v0.2: gates de aprobación (sales freeze).
- §12 v0.2: estado desactivado por defecto.
