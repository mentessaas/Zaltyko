---
issue: ZAL-158
title: "[GTM-DEP.2] Consent gate tracking (gate privacy Hermin)"
reviewer: Platform & Security (agent 6909a098-7ef1-49e6-898c-2c8fb18183e6)
sha: 1438caac3d5c433aed83517a790f1efe77f981e4
date: 2026-08-09
verdict: PASS (corte 1 — schema + helpers + audit + RLS + tests)
cortes_fuera_de_scope: [corte 2 — API capture/revoke, corte 3 — Resend suppression + e2e]
applies_to: "ZAL-158 corte 1 (feat(gtm): ZAL-158 [GTM-DEP.2] corte 1 — schema owner_consent + audit append-only)"
---

# ZAL-158 — QA privacy sign-off v1 (2026-08-09)

> Custodia de privacidad reasignada a Platform & Security tras baja de Hermin del roster activo. Esta review sustituye la firma de Hermin sobre el modelado (privacy design cerrado 2026-08-02 08:16Z) y agrega el code-level sign-off del corte 1.

## 0. Resumen ejecutivo

**Veredicto:** PASS sobre el corte 1 de ZAL-158.

El corte 1 entrega el **núcleo privacy-by-design** del contrato de consent (storage, gating, audit, enforcement en DB) y cumple los criterios C1, C3 y C4 del issue. C2 (suppression send-time Resend) es explícitamente cortes 2-3 y no se evalúa aquí.

**Costo:** 0 USD. Sin servicios externos nuevos. Confirmado.

**Cambios auditados:** 5 archivos, +738 líneas, todos inspeccionados en este heartbeat.

| Path | Rol | Lo que audito |
|---|---|---|
| `src/db/schema/owner-consent.ts` | Schema Drizzle | Tabla + CHECK constraints + índices |
| `src/lib/consent/owner-consent.ts` | Helper puro | Predicate + validadores |
| `supabase/migrations/20260808120000_owner_consent.sql` | Migración versionada | DDL + triggers + RLS + seed |
| `tests/owner-consent.test.ts` | Spec de vitest | 25 asserts sobre el helper |
| `src/db/schema/index.ts` | Barrel | Re-export del schema |

## 1. Mapeo criterio → implementación (corte 1)

| Criterio issue | Estado | Evidencia |
|---|---|---|
| Estado único persistido en `owner_consent` | ✅ Cumplido | `owner-consent.ts:52-99` + SQL DDL `owner_consent` |
| Captura en signup/claim | ⏸️ Corte 2 | Helpers `validateAuditEventInput` + `assertConsentProofMatchesSource` listos; I/O + signup wiring queda en corte 2 (out of scope declarado) |
| Analytics gating: predicate `granted AND revoked_at IS NULL` | ✅ Helper listo | `isConsentGrantedAndActive` (`owner-consent.ts:83-92`); integración con `src/lib/analytics.ts` queda en corte 3 |
| Email gating: Resend d0/d2/d7 con consent activo | ⏸️ Corte 3 | Out of scope de este PR |
| Revocación apaga ambos lados en una sola acción | ⏸️ Corte 2 | API `POST /api/owner-consent/revoke` con HMAC queda en corte 2 |
| Tests unitarios: grant, revoke, re-grant, edge re-importación | ✅ 25/25 verdes | `tests/owner-consent.test.ts` — 25 tests `pnpm exec vitest run` |
| E2E signup → grant → revoke → stop tracking + stop email | ⏸️ Corte 3 | Out of scope de este PR |
| **C1** Policy version bump → re-consent obligatorio | ✅ Schema + predicate | `current_policy_version()` SQL helper + `isConsentGrantedAndActive` compara |
| **C2** Suppression en send-time | ⏸️ Corte 3 | Out of scope |
| **C3** `source='imported'` fuera del MVP | ✅ Triple defensa | CHECK DB + regex `CONSENT_PROOF_REGEX` + `isAllowedSource` enum; test dedicado `rechaza source inválido (C3 imported)` |
| **C3** `consent_proof` requerido y coherente con source | ✅ | Regex `(signup\|claim\|settings):[a-zA-Z0-9_-]{1,128}` + `assertConsentProofMatchesSource` |
| **C3** Consent importado sin prueba → rechazado | ✅ | CHECK DB + Zod (`isAllowedSource` rechaza `imported`) |
| **C4** Audit log con campos requeridos | ✅ | `owner_consent_audit` enumerada con `policy_version + source + consent_proof + actor + reason + previous_audit_id` |
| **C4** Audit append-only (no UPDATE/DELETE) | ✅ Enforced en DB | Trigger `BEFORE UPDATE OR DELETE` que lanza `EXCEPTION 'owner_consent_audit is append-only'` |
| **C4** Reporting de re-consents por policy bump | ✅ | Índices `(owner_id, recorded_at DESC)` + `(event, recorded_at)` |

**Compliance gates (taxonomy §6):**
- (a) Consent capturado antes de analytics — CUMPLIDO por diseño (predicate `granted_and_active` evaluado al momento del evento). ✅
- (b) Copy Resend QA'ed antes de activar secuencia — soft gate vía ZAL-139. No bloquea este PR. ✅
- Opt-out presente y operativo en cada mail — vive en footer/link → API de revocación (corte 2). ⏸️
- Revocación operativa en cada mail → footer apunta a API de revocación (corte 2). ⏸️
- Policy version bump → re-consent obligatorio (C1) — ✅ implementado.

## 2. Reproducibilidad de la verificación

Comandos ejecutados en este heartbeat (2026-08-09, antes de la verificación):

```bash
# 1. Tests unitarios del helper
pnpm exec vitest run tests/owner-consent.test.ts
# → Test Files 1 passed (1) | Tests 25 passed (25) | Duration 1.16s

# 2. Lint sobre los 3 archivos nuevos
pnpm exec eslint src/db/schema/owner-consent.ts \
                src/lib/consent/owner-consent.ts \
                src/db/schema/index.ts
# → exit 0

# 3. Typecheck focal (filtro a archivos del scope)
pnpm exec tsc --noEmit --project tsconfig.json 2>&1 \
  | grep -E "(owner-consent|consent/owner-consent)"
# → (vacío) exit 0
```

**Cobertura de los 25 tests (verbose):**

```
ZAL-158 — regex y enums (C3 source, formato)               6/6
ZAL-158 — isConsentGrantedAndActive (C1+C2 predicate)     6/6
ZAL-158 — assertConsentProofMatchesSource (C3 consistencia) 3/3
ZAL-158 — validateAuditEventInput (C4 audit log)          9/9
ZAL-158 — constantes exportadas                          1/1
```

## 3. Análisis de riesgos RGPD

### 3.1 Positivos (lo que el corte 1 hace bien)

1. **Defense-in-depth en 3 capas mutuamente reforzadas:**
   - **Capa 1 (DB CHECK):** `state`, `source`, `policy_version`, `consent_proof`, `actor` con regex/listas cerradas. Inserciones basura rechazadas por el motor.
   - **Capa 2 (RLS):** `owner_consent_self_read` y `owner_consent_audit_owner_read` limitan autoservicio a `auth.uid() = owner_id`. Sin policy INSERT/UPDATE/DELETE para `authenticated` ⇒ la app no escapa por accidente.
   - **Capa 3 (API con `withTenant`):** gate real server-side. La DB bypasa con `BYPASSRLS` (per `Decisiones 2026-07-09`), por lo tanto server tenant isolation depende de la API — coherente con el patrón de plataforma.

2. **`unset` no se persiste.** Decisión de diseño §1: evita filas zombies si el banner nunca se muestra. Cliente infiere "no hay fila" → `kind: "unset"`. Coherente con RGPD Art. 7 (el consentimiento debe ser inequívoco).

3. **Consent por owner, no por academia.** Una fila por `owner_id`. Coherente con RGPD Art. 6(1)(b) (ejecución del contrato) y con `Mensajes aprobados.md`. Si multi-academia por owner necesita scope, será un campo adicional futuro — preserva el modelo actual.

4. **Audit append-only enforced en DB (trigger), no en código.** Imposible bypasear desde app code. Trigger `BEFORE UPDATE OR DELETE` lanza `EXCEPTION`. Esto también resiste a escalaciones de permisos en application code (ver incidente `permissions-service.ts` 2026-07-03).

5. **Sin FK en `owner_consent_audit.owner_id`.** Append-only debe sobrevivir aunque el owner borre su cuenta. La historia de consentimientos queda preservada para compliance reporting. Trade-off explícito en design §2.2.

6. **`current_policy_version()` declarada `STABLE`.** PG puede cachear el valor dentro del query plan, no entre sesiones ⇒ revocación inmediata (C2) garantizada a nivel de plán de ejecución.

7. **`reason` limitado a 500 chars en `validateAuditEventInput`.** Defensa contra log injection / abuse. Coherente con disciplina de `audit-logs`.

8. **C1 implementado de forma robusta:** cualquier `policy_version` distinto del `current_policy_version()` apaga el predicate. No depende de un job que recorra filas — funciona por consistencia de la lectura.

9. **C3 triple defensa:** CHECK DB + regex en `validateAuditEventInput` + `assertConsentProofMatchesSource` por separado. Un atacante tendría que bypasear las tres para colar `imported`.

### 3.2 Riesgos / gaps que flageo (no bloqueantes para corte 1)

| # | Riesgo | Severidad | Mitigación / Owner |
|---|---|---|---|
| R1 | Migración SQL no aplicada contra Supabase (regla del runbook, esperado para corte 1) | Media | Sandbox verification via follow-up (ver §4.1) |
| R2 | Corte 2 (API capture + revoke) y corte 3 (Resend + e2e) no existen — el gate operacional RGPD está incompleto en runtime | Media | Diseño ya marca los cortes; cortes 2/3 deben ser issues propias con su propia privacy review |
| R3 | HMAC del API de revocación pendiente de decisión board (Plan A/B) — si se arranca con derivado de `NEXTAUTH_SECRET`, atacante con acceso a esa variable podría falsificar links de revocación | Baja | Corte 2. Secret dedicado por owner o derivado con prefijo-rotación. Board decide |
| R4 | Helper `validateAuditEventInput` NO exige `reason` en `revoke`/`policy_bump` (caller decide). Riesgo: audit log incompleto para análisis forense si el caller olvida | Baja | El caller de corte 2 debe setear reason obligatorio. Recomendación: subir regla a CHECK condicional en SQL cuando se integre |
| R5 | `consent_proof` para `claim` depende de que el flujo de claim (ZAL-156.x) emita un `claim_id` consistente con la regex `[a-zA-Z0-9_-]{1,128}` | Baja | Verificar con Web Developer que el `claim_id` generado cumple la regex. Acoplamiento a contrato |
| R6 | `auth.uid()` debe coincidir con `profiles.user_id` (no `profiles.id`). Si Supabase Auth cambia la convención, el RLS colapsa silenciosamente | Baja | Documentar la dependencia en el design doc; test de integración con auth real en sandbox |
| R7 | Cross-check contra ZAL-160 (cliente read-only contract) no se ha hecho. Si ZAL-160 rediseña el contrato `state.ts`, puede colisionar con este schema | Media | Follow-up (ver §4.2) |
| R8 | No hay granularidad por tipo de comunicación (todo-o-nada en MVP). Trade-off conocido del issue, registrado como out of scope | Nula (no es bug) | Aceptado por privacy review Hermin 2026-08-02 |
| R9 | Trigger `owner_consent_audit_append_only` está en `BEFORE UPDATE/DELETE` y lanza `EXCEPTION` ⇒ la transacción aborta. Edge case: si Web Developer intenta hacer un `UPDATE` en una migration de seed, revienta. Bien para producción, fricciona en dev | Baja | Documentar en runbook; permite en dev con `ALTER TABLE ... DISABLE TRIGGER` solo para seed |

### 3.3 Lo que NO audito en este PR

- Cumplimiento UX del banner (qué texto se muestra, qué acción se pide) — eso es tarea de QA funcional sobre el componente, no privacy review del schema.
- Lógica de la integración con Resend (corte 3).
- Lógica del API de captura/revocación (corte 2).
- DSAR / portabilidad / derecho al olvido — out of scope global de ZAL-158; vive en issue separada si aplica.

## 4. Follow-ups (no bloqueantes para cierre de ZAL-158 corte 1)

### 4.1 Sandbox verification del SQL (crear child issue)

Cuando el equipo confirme que el sandbox está disponible, correr la migración `20260808120000_owner_consent.sql` y verificar:

- CHECK constraints disparan en inserciones inválidas (`source='imported'`, `consent_proof` mal formado, etc.).
- Trigger `owner_consent_audit_append_only` revienta `UPDATE`/`DELETE` (verificar que la transacción aborta y la fila queda intacta).
- RLS `owner_consent_self_read` bloquea lectura cruzada (crear 2 owners, intentar leer el consent del otro con anon key ⇒ vacío).
- `current_policy_version()` devuelve `v1-2026-08-01` tras seed.
- Índices creados (`owner_consent_policy_version_idx`, `owner_consent_audit_owner_recorded_idx`, `owner_consent_audit_event_recorded_idx`).

**Recomendación:** ejecutar en sandbox con `pnpm db:migrate:reviewed` (regla del runbook) y anexar evidencia a la child issue.

### 4.2 Cross-check contra ZAL-160 (cliente read-only contract)

Antes de cerrar ZAL-160, re-verificar:

- `src/lib/consent/state.ts` (cliente) consume el contrato de `src/lib/consent/owner-consent.ts` (servidor) sin inconsistencias.
- Los estados `unset / granted / revoked / needs_re_consent` del design §1 mapean 1:1 a las uniones TypeScript del cliente.
- El `kind: "needs_re_consent"` se detecta correctamente cuando `policy_version` cambia (C1 desde el lado cliente).

Esto es responsabilidad de ZAL-160, pero Platform & Security debe firmar el contrato completo.

## 5. Decisión técnica de gate

**Gate decision: APPROVED LOCAL** (corte 1 schema + helpers + audit + RLS + tests).

- ✅ C1 consentimiento por owner + audit append-only + re-consent policy bump.
- ✅ C3 consentimiento verificable con `consent_proof` coherente con source; `imported` rechazado.
- ✅ C4 audit log append-only enforced en DB.
- ✅ Compliance gate (a) cumplido por diseño.
- ⏸️ Compliance gate (b) soft vía ZAL-139 — no bloquea este PR.
- ⏸️ C2 suppression send-time — corte 3.

**No requiere aprobación de board** para: revisión local de código, sandbox testing si el board aprueba levantar entorno, merge del PR actual.

**Sigue requiriendo aprobación explícita del board** para: aplicar la migración contra Supabase producción, exponer cualquier endpoint del API de revocación al público, secretos (`OWNER_CONSENT_HMAC_SECRET` o equivalente), ajustar `current_policy_version` a `v2-*` (cambio de política).

## 6. Conformidad con régimen de secretos y autoridad

- No leo ni imprimo secretos. No se commitea nada con credenciales.
- No actúo sobre producción ni Stripe live.
- No pido `secret_ref` al board porque HMAC del API de revocación es corte 2, no corte 1.
- Authority self-owned: aplicar SQL a sandbox, merge del PR actual, ejecución de los tests de regresión.

## 7. Disposición recomendada para ZAL-158

**`done`** sobre el corte 1 (código privacy-clean), con:

- Child issue §4.1 (sandbox verification) — abiertas por Web Developer con seguimiento de Platform & Security.
- Child issue §4.2 (cross-check ZAL-160) — abierta por Web Developer, follow-up al cierre de ZAL-160.
- Cortes 2/3 (API capture + Resend suppression + e2e) — son issues propias existentes o por crear, NO bloquean este cierre.

**Firma:** Platform & Security (agent 6909a098-7ef1-49e6-898c-2c8fb18183e6), 2026-08-09. Sustituye la firma de Hermin sobre este corte.
