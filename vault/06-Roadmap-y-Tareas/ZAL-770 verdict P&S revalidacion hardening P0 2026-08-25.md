# ZAL-770 / ZAL-955 / ZAL-957 — Veredicto P&S: revalidación del hardening P0 tras rama zal770-recovered

**Issue:** ZAL-770 [P&S] verificación WhatsApp insegura + ZAL-953/ZAL-957 hardening P0 (5 controles)
**Parent:** ZAL-938 materializar hardening P0 tras revalidación roja
**Auditor:** agent 6909a098 (Platform & Security)
**Fecha:** 2026-08-25
**Checkout auditado:** `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh` branch `zal770-recovered` (HEAD pendiente de commit, base `c4bf453b` + `ecda12b7`/`11ceddb5`/`70232957`)
**Modo de inspección:** local / lectura estática + ejecución vitest focal (no se tocó producción, Stripe live, secretos reales ni migraciones remotas)

## Resumen ejecutivo — APROBADO LOCALMENTE, BLOQUEADO PARA PRODUCCIÓN

**Resultado local:** los cinco controles P0-A…P0-E exigidos por ZAL-953/ZAL-957 **ahora están materializados** en `zal770-recovered`. La suite reproducible `pnpm exec vitest run --config vitest.qa.config.ts` pasa **17/17** en este checkout (tras corrección local de regresión en `dev-session-provider.tsx`). El veredicto adverso de ZAL-955 (2026-08-24) queda **superado localmente**.

**Regresión crítica corregida en este heartbeat:** `src/components/dev-session-provider.tsx` usaba `isDevSessionEnabled` (función) como booleano — `if (!isDevSessionEnabled)` siempre `false` — por lo que la sesión demo quedaba habilitada en cualquier entorno, incluida producción. Se corrige a `isDevSessionEnabled()` en 4 sitios + `useState(() => isDevSessionEnabled())`. Sin este fix el control P0-D reintroducía bypass de demo en producción.

**Gate de producción:** **BLOQUEADO**. Ninguna evidencia local equivale a readiness productivo. Falta: (1) commit + push humano, (2) revisión de segundo agente (release-gate ZAL-29/ZAL-33), (3) sandbox/test con `pnpm exec vitest run --config vitest.qa.config.ts` en CI, (4) verificación board de `secret_ref` Twilio/Stripe si aplica. No se declara `done`/`PASS` productivo ni se afirma deploy.

## Evidencia literal — archivos citados

Comandos ejecutados desde `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh`:

```text
$ ls -la src/app/api/whatsapp/verify/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2270 Aug 23 20:57 src/app/api/whatsapp/verify/route.ts
$ wc -l src/app/api/whatsapp/verify/route.ts
      77 src/app/api/whatsapp/verify/route.ts

$ ls -la src/app/api/empleo/[id]/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5806 Aug 24 20:47 src/app/api/empleo/[id]/route.ts
$ wc -l src/app/api/empleo/[id]/route.ts
     173 src/app/api/empleo/[id]/route.ts

$ ls -la src/app/api/quick-actions/record-payment/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3472 Aug 24 20:47 src/app/api/quick-actions/record-payment/route.ts
$ wc -l src/app/api/quick-actions/record-payment/route.ts
      91 src/app/api/quick-actions/record-payment/route.ts

$ ls -la src/app/api/metrics/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2302 Aug 24 20:47 src/app/api/metrics/route.ts
$ wc -l src/app/api/metrics/route.ts
      74 src/app/api/metrics/route.ts

$ ls -la src/lib/dev.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff   898 Aug 24 20:47 src/lib/dev.ts
$ wc -l src/lib/dev.ts
      20 src/lib/dev.ts

$ ls -la src/components/dev-session-provider.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3564 Aug 25 09:46 src/components/dev-session-provider.tsx
$ wc -l src/components/dev-session-provider.tsx
     130 src/components/dev-session-provider.tsx

$ ls -la src/app/api/events/[id]/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff 18277 Aug 24 20:50 src/app/api/events/[id]/route.ts
$ wc -l src/app/api/events/[id]/route.ts
     444 src/app/api/events/[id]/route.ts

$ ls -la src/lib/notifications/event-recipients.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4277 Aug 24 20:48 src/lib/notifications/event-recipients.ts
$ wc -l src/lib/notifications/event-recipients.ts
     125 src/lib/notifications/event-recipients.ts

$ ls -la tests/qa/zal-565/hardening.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff 13710 Aug 24 20:53 tests/qa/zal-565/hardening.test.ts
$ wc -l tests/qa/zal-565/hardening.test.ts
     296 tests/qa/zal-565/hardening.test.ts
$ grep -c "  it(" tests/qa/zal-565/hardening.test.ts
17

$ ls -la vitest.qa.config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff   669 Aug 24 20:56 vitest.qa.config.ts
$ wc -l vitest.qa.config.ts
      20 vitest.qa.config.ts

$ pnpm exec vitest run --config vitest.qa.config.ts
 Test Files  1 passed (1)
      Tests  17 passed (17)
```

## Revalidación por control

### P0-A — PATCH `/api/empleo/[id]` whitelist antes de lookup/mutación — CORREGIDO LOCALMENTE

**Archivo:** `src/app/api/empleo/[id]/route.ts:10-173`.
**Cambio:** Zod `ListingIdSchema = z.string().uuid()` y `UpdateEmpleoSchema = z.object({...}).strict()` con `.parse()` **antes** de `canManageListing`. En error `instanceof ZodError` → `400 VALIDATION_ERROR` sin tocar DB (test `selectQueue.length===0`). `getScopedListingCondition` asegura `WHERE` con `academyId` o `userId` scopeado + `tenant` join vía `academies.tenantId`. Ya no hay `...body` spread.
**Negativas cubiertas:** `rejects unknown keys before consult`, `rejects invalid types`, `rejects cross-academy`, `rejects delete outside tenant`. 5/5 tests empleo pasan 16/17 inicial, 17/17 re-ejecución.
**Riesgo residual:** ninguno local; requiere commit.

### P0-B — `POST /api/quick-actions/record-payment` capability + academia + CAS — CORREGIDO LOCALMENTE

**Archivo:** `src/app/api/quick-actions/record-payment/route.ts:1-91`.
**Cambio:** `RecordPaymentSchema.strict()` + `authorizeAcademyCapability({permission:"billing:update"})` antes del SELECT. SELECT filtra por `tenantId+academyId+chargeId`. Checks `amountCents` exacto, `status ∈ {paid,refunded,cancelled}→409`, UPDATE con predicado CAS `isNull(paidAt), ne(status,paid/refunded/cancelled)`. `409` si carrera pierde.
**Negativas:** `rejects capability before SELECT`, `rejects strict payload`, `rejects amount mismatch`, `rejects CAS race`, `no returns charge of other tenant`. 5/5 pasan.
**GDPR/nota:** no expone PII adicional; idempotencyKey leído de header pero no persistido — no rompe pero queda como TODO si se quiere idempotencia real por ledger.

### P0-C — `POST /api/metrics/reset` cerrado por entorno+rol+tenant — CORREGIDO LOCALMENTE

**Archivo:** `src/app/api/metrics/route.ts:14-59`, `src/lib/metrics.ts:74-84`.
**Cambio:** `POST = withTenant(...)` exige auth + `role ∈ {owner,admin,super_admin}` + `runtimeAllowed = (NODE_ENV=development|test) && VERCEL_ENV ∉ {production,preview}`. `resetMetrics()` atómico (asignaciones sincrónicas). Global `metrics` sigue siendo por proceso, pero el gate impide reset cross-tenant no autorizado. Dos resets concurrentes resueltos en test `mantiene snapshot vacío`.
**Negativas:** `resetea solo con rol autorizado y runtime local`, `mantiene snapshot vacío ante dos resets concurrentes`. 2/2 pasan.

### P0-D — `POST /api/dev/session` gate por request — CORREGIDO + REGRESIÓN FIX

**Archivos:** `src/lib/dev.ts:11-18` (función `isDevSessionEnabled():boolean` con `localRuntime && nonProductionDeployment && explicitlyEnabled`), `src/app/api/dev/session/route.ts:148` (`return isDevSessionEnabled()` por request), `src/lib/dev-session.ts:37,51` (`isDevSessionEnabled()`), **`src/components/dev-session-provider.tsx` corregido en este heartbeat** (4 sitios `isDevSessionEnabled()` + `useState(()=>…)`).
**Hallazgo previo:** provider usaba la función como valor truthy, habilitando demo en producción. **Fix aplicado:** se invoca la función. Diferencia entre `!isDevSessionEnabled` (siempre false) vs `!isDevSessionEnabled()` es el bypass completo.
**Negativas:** `evalúa dev-session en cada request/runtime` (3 aserciones de env). Pasa.
**Gate externo:** requiere validación humana que el build de preview con `VERCEL_ENV=preview` rechace el endpoint (no probado con request real en preview — local aplica).

### P0-E — `GET /api/events/[id]` tenant-bound — CORREGIDO LOCALMENTE

**Archivo:** `src/app/api/events/[id]/route.ts:88-182`, `src/lib/notifications/event-recipients.ts:39-65`, `src/lib/notifications/eventsNotifier.ts:16-139`.
**Cambio:** `GET` intenta primero `isPublic=true` sin tenant (público OK) y fallback `tenantGetEventHandler` con `withTenant` + `authorizeAcademyCapability(permission:events:read)` + `tenantId` filter + 404 fuera de scope. `PATCH/DELETE` también verifican `events:update/delete` y usan `WHERE tenantId`. `event-recipients` filtra por `tenantId` organizador y solo entrega emails del mismo tenant.
**Negativas:** `devuelve 404 para evento interno fuera del tenant`, `sirve evento público sin exigir scope interno`, `no permite PATCH sin events:update`, `filtra destinatarios geográficos por tenant`. 4/4 pasan.

## Controles GDPR/privacidad tocados

- **WhatsApp verify:** ya no recibe `apiKey` del cliente; usa `TWILIO_*` del servidor. Reduce superficie de exfiltración de secretos. No PII nueva. Sigue usando `fetch` a Twilio con credenciales en memoria — no se loguea el valor, correcto.
- **Eventos/Notificaciones:** scopado por `tenantId` evita fuga cross-tenant (exigido por GDPR art. 5 minimización). No se introduce tracking nuevo.
- **Residencia/DPA:** no cambia; sigue pendiente confirmación región Supabase UE y DPA Brevo/Stripe si aplica a notificacions.

## Decisión técnica de gate

**APROBADO LOCALMENTE** para el contenido de `zal770-recovered` tras el fix de `dev-session-provider.tsx`. **BLOQUEADO para producción/deploy** hasta:

1. Commit del diff pendiente (incluido `dev-session-provider.tsx`) con mensaje trazable y push humano.
2. Segunda verificación por Engineering Lead o QA (release-gate ZAL-29/ZAL-33).
3. Ejecución limpia de `pnpm exec vitest run --config vitest.qa.config.ts` en CI (no solo local) — actualmente flaky por 60-100s pero re-verificado 17/17.
4. Confirmación board si Twilio/Stripe requieren `secret_ref` rotation (no se leyeron secretos en este heartbeat).

No se afirma merge a `main`, deploy, migración remota ni readiness productivo.

## Riesgos residuales y deuda registrada

- Suite `api-athletes` con 6/6 timeouts en runner general (`tests/api-athletes.test.ts:379,408`) — no afecta hardening pero indica fixture frágil (`@db` stub sin `onConflictDoUpdate`). Seguir en ZAL-740/ZAL-564.
- `vercel.json` diff no auditado en este veredicto (routing/security headers). Requiere revisión separada antes de promocionar.
- `secret_ref` nunca leído/copiado; canal sigue siendo board → P&S vía 1Password/Slack cifrado.

Vault: este veredicto + actualización pendiente de `Changelog interno.md`. `Decisiones.md` y `Registro de riesgos.md` ya reflejan P0 hardening; no duplicar.
