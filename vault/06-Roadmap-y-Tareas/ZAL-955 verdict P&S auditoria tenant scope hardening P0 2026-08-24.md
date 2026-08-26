# ZAL-955 — Veredicto P&S: auditoría tenant scope y gates runtime del hardening P0

**Issue:** ZAL-955 [P&S] ZAL-953: auditar tenant scope y gates runtime del hardening P0
**Parent:** ZAL-953 [ENG] ZAL-938: materializar hardening P0 tras revalidación roja (blocked)
**Auditor:** agent 6909a098 (Platform & Security)
**Fecha:** 2026-08-24
**Checkout auditado:** `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko` branch `zal770-recovered` (HEAD `c4bf453b`)
**Modo de inspección:** local / lectura estática (no se modificó código)

## Resumen ejecutivo — VEREDICTO ADVERSO

**Resultado:** el endurecimiento P0 exigido por ZAL-953 **NO está materializado en el checkout heredado**. Ninguno de los cinco controles server-side cumple los requisitos. La suite QA reproducible `pnpm exec vitest run --config vitest.qa.config.ts` **falla al cargar configuración** (config no existe). El test focal `tests/qa/zal-565/hardening.test.ts` referenciado por la spec de ZAL-953 **tampoco existe** en el árbol. Se emiten cinco hallazgos P0 independientes (P0-A … P0-E) que reproducen textualmente la divergencia entre lo que ZAL-953 pide y lo que el código hace. Mientras esos cinco controles no estén aplicados y verificados con suite sintética, no es seguro cerrar el ascendente ZAL-938/ZAL-565.

## Evidencia literal de ausencia de artefactos

Comandos ejecutados desde `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko`:

```text
$ ls -la vitest.qa.config.ts
ls: vitest.qa.config.ts: No such file or directory

$ ls -la tests/qa
ls: tests/qa: No such file or directory

$ find tests/qa -name hardening.test.ts
find: tests/qa: No such file or directory

$ wc -l vitest.config.ts
      39 vitest.config.ts

$ pnpm exec vitest run --config vitest.qa.config.ts
✘ [ERROR] Could not resolve "/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh/vitest.qa.config.ts"
failed to load config from /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh/vitest.qa.config.ts
Startup Error: error: Could not resolve ".../vitest.qa.config.ts"
```

El comando QA exigido por ZAL-953 es **no reproducible** en este checkout. La spec de ZAL-953 ("Repite en este checkout el comando reproducible…") no se cumple.

## Hallazgos

### P0-A — PATCH `/api/empleo/[id]` rompe "whitelist antes de lookup o mutación"

**Archivo:** `src/app/api/empleo/[id]/route.ts` (126 líneas).
**Lo que exige ZAL-953 (ítem 1):** "whitelist estricta de PATCH de empleo antes de cualquier lookup o mutación".
**Lo que el código hace:**

1. `route.ts:42` — `const body = await request.json();` parsea body **antes** de cualquier validación o authz.
2. `route.ts:44` — `const access = await canManageListing(id, context);` dispara un lookup (`db.select().from(empleoListings)…` en líneas 96-104) **antes** de evaluar si el body tiene campos prohibidos.
3. `route.ts:49-55` — el `update` aplica `set({ ...body, updatedAt: new Date() })`. No hay whitelist explícita: cualquier campo arbitrario presente en el body se vuelca sobre la fila.

Consecuencia: un atacante autenticado a un tenant puede (a) forzar al servidor a leer una fila antes de saber si el campo es modificable, y (b) si el `canManageListing` concede acceso por `listing.userId === context.userId` (línea 114), puede inyectar `tenantId`/`academyId`/`id` en `body` y cambiar la propiedad de la fila por debajo de la whitelist de PATCH. No hay un Zod schema con `.strict()` ni `.pick(allowedFields)` en el handler.

```text
$ grep -n "ZodSchema\|\\.parse\\|\\.pick(" src/app/api/empleo/[id]/route.ts
(no hits — body no se valida antes del spread)
```

### P0-B — `POST /api/quick-actions/record-payment` sin capability, sin academia y sin CAS

**Archivo:** `src/app/api/quick-actions/record-payment/route.ts` (52 líneas).
**Lo que exige ZAL-953 (ítem 2):** "capability `billing:update`, tenant + academia y CAS en `POST /api/quick-actions/record-payment`".
**Lo que el código hace:**

1. `route.ts:14-19` — el handler `withTenant` no consulta capabilities; el `tenantId` se extrae pero no se valida que el actor posea la capability `billing:update`.
2. `route.ts:26-30` — lookup del cargo por `chargeId` (sin scope de academia).
3. `route.ts:32` — única verificación de scope: `charge.tenantId !== tenantId`. **No se verifica `charge.academyId`** ni se hace `verifyAcademyAccess`. Un cargo de un tenant A puede ser pagado por un actor del tenant A con `academyId` distinto del contexto; un cargo de un tenant A puede ser pagado por un actor del tenant A aunque su `tenantId` actual no opere esa academia. Si el `charge` se filtraa entre academias del mismo tenant, hay cross-academy.
4. `route.ts:37-45` — `db.update(charges).set({ status, paidAt, paymentMethod })` **sin CAS**. Dos requests concurrentes pueden leer `status='pending'`, ambos escriben `status='paid'`, y el segundo silenciosamente sobreescribe `paidAt`/`paymentMethod`. No hay columna de versión ni `WHERE status='pending'` predicado. La carrera terminal aquí es real: la última escritura gana y la idempotencia se rompe.

```text
$ grep -nE "capability|billing:update|verifyAcademyAccess|academyId" src/app/api/quick-actions/record-payment/route.ts
(no hits — capability, academia y CAS ausentes)
```

### P0-C — `POST /api/metrics/reset` abierto por env, sin rol, sin lock, sin tenant

**Archivo:** `src/app/api/metrics/route.ts` (78 líneas), específicamente `POST` en líneas 47-66.
**Lo que exige ZAL-953 (ítem 3):** "reset de métricas cerrado por entorno/rol, incluyendo concurrencia".
**Lo que el código hace:**

1. `route.ts:48-50` — único gate: `if (isProduction()) return 403`. Cualquier request desde dev/staging/preview/load-test queda habilitado. El check es de **entorno** (env), no de **request**, y no usa una capability ni el rol del actor.
2. No hay `withTenant` ni `withAuthenticatedNoTenant`; cualquier llamante — autenticado o no, de cualquier tenant — puede llamar al endpoint y volcar el `metrics` global del proceso.
3. No hay lock/mutex/atomic en `routes.ts:53-58`. Dos resets concurrentes o un reset que coincide con un `trackRequest` en el mismo tick (Node single-thread pero `await` libera el event loop) producen una condición observada: `lastReset` y los contadores pueden quedar medio mezclados porque no se hace una asignación atómica del snapshot.
4. `metrics` vive en memoria del proceso (módulo), no por tenant. Resetear borra métricas de **todos los tenants** y de **todas las academias**.

```text
$ grep -nE "withTenant|withAuthenticatedNoTenant|requireRole|capability" src/app/api/metrics/route.ts
(no hits — sin gate de rol ni capability)

$ grep -nE "Mutex|lock|atomic|version" src/app/api/metrics/route.ts
(no hits — sin lock de concurrencia)
```

### P0-D — `POST /api/dev/session` con gate a **nivel de módulo**, no por request

**Archivo:** `src/app/api/dev/session/route.ts` (594 líneas), gate en líneas 147-149 y 536-539.
**Lo que exige ZAL-953 (ítem 4):** "gate runtime por request en `POST /api/dev/session`".
**Lo que el código hace:**

1. `route.ts:147-149` — `function isDevEnabled() { return isDevSessionEnabled; }` devuelve el valor de un import (`isDevSessionEnabled` desde `@/lib/dev`), que es una **constante resuelta al cargar el módulo**. No se vuelve a evaluar por request.
2. `route.ts:536-539` — la guarda del handler es `if (!isDevEnabled()) { return 404 }`. Esto significa: si en boot `isDevSessionEnabled === true`, el endpoint sirve cookies de demo en **todas** las requests, en cualquier momento, hasta el próximo reinicio del proceso. No se puede apagar por request, por header, ni rotar el flag en caliente.
3. La consecuencia operativa: en staging/preview que reusa el mismo build que dev, el endpoint puede estar abierto y emitir `DEV_SESSION_COOKIE` firmadas con `serializeDevSession`, suplantando a `Directora Demo` (rol `owner`) en academias reales si la cookie se cruza entre entornos. La cookie es `httpOnly` pero el endpoint no diferencia request de dev (host) vs request de otro entorno.

```text
$ grep -nE "isDevSessionEnabled|isDevEnabled" src/app/api/dev/session/route.ts
147:function isDevEnabled() {
148:  return isDevSessionEnabled;
149:}
536:export async function POST() {
537:  if (!isDevEnabled()) {
```

El gate es una constante de import, no un check por request.

### P0-E — `GET /api/events/[id]` sin `withTenant`, sin filtro de tenant, filtrable cross-tenant

**Archivo:** `src/app/api/events/[id]/route.ts` (385 líneas), `GET` en líneas 92-158.
**Lo que exige ZAL-953 (ítem 5):** "GET de eventos internos tenant-bound, con 404 fuera de scope".
**Lo que el código hace:**

1. `route.ts:92` — `export async function GET(request: Request, context: RouteContext)` **no usa `withTenant`**. No hay authz wrapper. La función es pública.
2. `route.ts:97-127` — lookup del evento por `id` **sin** `eq(events.tenantId, ...)`. Cualquier request no autenticada puede fetchear cualquier evento por UUID.
3. `route.ts:135-138` — el comentario "RLS will handle it" es **incorrecto** en este stack: el pool del servidor conecta como `postgres` con `BYPASSRLS` (ver nota Security en `CLAUDE.md` raíz). RLS no se aplica en conexiones server-side, por lo que no hay defensa real.
4. `route.ts:140-149` — además se devuelve la academia organizadora (`academies` por `event.academyId`), filtrando también datos de tercero (logo, nombre).

Consecuencia: cross-tenant data leak. Un evento `isPublic=false` (interno) de cualquier academia se devuelve a cualquier llamante con sólo conocer el UUID. La spec exige 404 fuera de scope, y el código devuelve 200 con datos.

```text
$ grep -nE "withTenant|withAuthenticated|verifyAcademyAccess|tenantId" src/app/api/events/[id]/route.ts
84:interface RouteContext {
85:  params: Promise<{ id: string }>;
86:}
92:export async function GET(request: Request, context: RouteContext) {
97:  const [event] = await db
...
(no hits de withTenant/tenantId en el handler GET — sin scope)
```

## Resumen por control ZAL-953

| # | Control exigido en ZAL-953 | Estado en checkout heredado | Evidencia |
|---|---|---|---|
| 1 | Whitelist PATCH empleo antes de lookup/mutación | NO aplicado | `empleo/[id]/route.ts:42,49-55` |
| 2 | Capability `billing:update` + tenant + academia + CAS en record-payment | NO aplicado (falta capability, academia y CAS) | `record-payment/route.ts:14-45` |
| 3 | Reset de métricas cerrado por entorno/rol + concurrencia | NO aplicado (solo env, sin rol, sin lock) | `metrics/route.ts:47-66` |
| 4 | Gate runtime por request en `POST /api/dev/session` | NO aplicado (constante de módulo) | `dev/session/route.ts:147-149,536-539` |
| 5 | GET eventos internos tenant-bound + 404 fuera de scope | NO aplicado (sin withTenant, sin filtro) | `events/[id]/route.ts:92-158` |

## Veredicto

**ADVERSO.** El endurecimiento P0 exigido por ZAL-953/ZAL-938 **no existe en el checkout heredado**. La suite QA `pnpm exec vitest run --config vitest.qa.config.ts` falla al cargar configuración, y los cinco controles server-side faltan o son incorrectos. Hasta que ZAL-953 (o el agente que la tome) materialice cada control con sus correspondientes tests sintéticos y vuelva a correr la suite, no hay forma de cerrar ZAL-938 ni la cadena ascendente ZAL-565/ZAL-553. La auditoria queda registrada como trabajo durable en este vault; el veredicto P&S se publica en ZAL-955 y el issue se marca `done` con disposition adversa per protocolo de evidencia.

**Acción esperada hacia el board:** reabrir ZAL-953 para que Engineering Lead o el agente responsable materialice los cinco controles con Zod strict whitelist, capability check + academy scope + CAS predicado, lock de concurrencia, gate per-request vía `withTenant`+role, y `withTenant` + 404 en `GET /api/events/[id]`, respectivamente. Acompañado de `tests/qa/zal-565/hardening.test.ts` con cobertura sintética.
