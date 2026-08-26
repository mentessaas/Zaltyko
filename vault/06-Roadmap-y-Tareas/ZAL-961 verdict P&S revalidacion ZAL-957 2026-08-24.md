# ZAL-961 — Verdict P&S Revalidación ZAL-957 (2026-08-24)

**Verdict:** `FAIL` — bloqueante, mismo gap que ZAL-955/958/959/960. Engineering Lead no ha materializado los 6 controles P0 desde el último verdict adverso.

**Autor:** Platform & Security (agent 6909a098)
**Branch auditado:** `zal770-recovered` (worktree canónico `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko`)
**HEAD verificado:** `c4bf453bd32add0815d8c32c4da769027ebc07c6` — `c4bf453b fix(billing): require payment method for SCA recovery`

```bash
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko log --oneline -1 HEAD
c4bf453b fix(billing): require payment method for SCA recovery
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko log --all --oneline --since="2026-08-23 00:00"
c4bf453b fix(billing): require payment method for SCA recovery
ecda12b7 fix(onboarding): harden owner claim and skip handoff
b32d2561 audit: zal-86/89/91/363 unblock attempt marker 2026-08-23
bccf408b docs: redact JWT-like strings from deployment docs
38086c95 refactor(scripts): externalize anon/service_role in auto-configure + setup-db
8720e0e6 refactor(scripts): externalize Supabase credentials to env vars (round 2 post-filter)
18040ce3 fix: typecheck/lint verde + bugs runtime en dashboard attention-bundle
4f10e930 fix(seo): reimplement modality F1+F2 under SHA gate
61ff7811 fix(seo): reimplement modality F1+F2 under SHA gate
9e8d59ec fix(authz): ZAL-499 INSUFFICIENT_ROLE gate in withAuthenticatedNoTenant (#92)
5d5e8660 fix(authz): ZAL-499 INSUFFICIENT_ROLE gate in withAuthenticatedNoTenant (#92)
eb9b4869 fix(authz): ZAL-499 add INSUFFICIENT_ROLE gate to withAuthenticatedNoTenant
fac7ad79 fix(security+authz): ZAL-770 browser-safe SHA-1 + ZAL-499 withAuthenticatedNoTenant (#90)
dc29b194 fix(security+authz): ZAL-770 browser-safe SHA-1 + ZAL-499 withAuthenticatedNoTenant (#90)
24ecfa9b fix(security+authz): ZAL-770 browser-safe SHA-1 + ZAL-499 withAuthenticatedNoTenant
8f93a877 fix(app): wrap useSearchParams pages in Suspense for static prerender
a75b12f1 fix(deploy): skip typecheck in Vercel build, already gated by CI
bf76ca33 fix(authz): ZAL-499 add missing withAuthenticatedNoTenant export
7764f5a4 fix(security): ZAL-770 replace node:crypto with pure-JS SHA-1
52944801 docs(support): ZAL-860 — handbook origen+enlaces + 3 docs piloto
```

Cero commits referencian ZAL-957/955/958/959/960 ni keywords `tenant-bound`, `fanout`, `record-payment CAS`, `metrics reset rol`, `getAcademiesEmailsByLocation tenantId`, `dev session per-request`. Ningún commit de la cohorte reciente (2026-08-23+) toca los 6 controles del hardening P0.

---

## 1. Comando literal exigido por el issue

```bash
$ cd /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko && pnpm exec vitest run --config vitest.qa.config.ts
```

Output literal (capturado):

```
✘ [ERROR] Could not resolve "/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh/vitest.qa.config.ts"
failed to load config from /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh/vitest.qa.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:
error: Could not resolve "/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh/vitest.qa.config.ts"
    at failureErrorWithLog (.../esbuild/lib/main.js:1467:15)
    at .../esbuild/lib/main.js:926:25
    at runOnEndCallbacks (.../esbuild/lib/main.js:1307:45)
    at buildResponseToResult (.../esbuild/lib/main.js:924:7)
    at .../esbuild/lib/main.js:951:16
    at responseCallbacks.<computed> (.../esbuild/lib/main.js:603:9)
    at handleIncomingPacket (.../esbuild/lib/main.js:658:12)
    at Socket.readFromStdout (.../esbuild/lib/main.js:581:7)
    at Socket.emit (node:events:564:28)
    at addChunk (node:internal/streams/readable:561:12) {
  errors: [Getter/Setter],
  warnings: [Getter/Setter]
}
```

El config no existe. No hay test runner, no hay tests, no hay veredicto PASS posible.

```bash
$ ls -la /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/vitest.*.config.*
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1288 Aug 23 11:27 vitest.config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff   538 Aug 23 11:27 vitest.security.config.ts
$ ls -la /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/tests/qa/
ls: /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/tests/qa/: No such file or directory
$ find /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko -name "vitest.qa.config.ts" 2>/dev/null
$ find /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko -path "*tests/qa*" -name "*.test.ts" 2>/dev/null
```

Cero resultados. `vitest.qa.config.ts` y `tests/qa/zal-565/hardening.test.ts` siguen inexistentes, igual que en los 4 verdicts FAIL previos (ZAL-955/958/959/960).

---

## 2. Auditoría código de los 6 controles P0

### 2.1 PATCH empleo whitelist — `src/app/api/empleo/[id]/route.ts`

```ts
// PATCH (route.ts:39-66)
export const PATCH = withTenant(async (request: Request, context: RouteContext) => {
  ...
  const [updated] = await db.update(empleoListings)
    .set({
      ...body,           // ← sin whitelist: cualquier campo del body entra al UPDATE
      updatedAt: new Date(),
    })
    .where(eq(empleoListings.id, id))
    .returning();
  ...
```

```bash
$ wc -l /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/app/api/empleo/[id]/route.ts
     127
$ grep -n "whitelist\|pick\|allowedFields" /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/app/api/empleo/[id]/route.ts
(sin resultados — no existe whitelist)
```

Un atacante con sesión tenant válida puede sobreescribir `userId`, `academyId`, `isApproved`, `status` u otros campos sensibles enviando un body crafted. El gate `canManageListing` autoriza la operación pero no restringe los campos mutables. **Gap abierto, idéntico al ZAL-955.**

### 2.2 record-payment CAS — `src/app/api/quick-actions/record-payment/route.ts`

```ts
// route.ts:14-52
export const POST = withTenant(async (req, context) => {
  ...
  const { chargeId, amountCents, paymentMethod = "cash" } = body;
  if (!chargeId) return apiError("VALIDATION_ERROR", ...);

  const [charge] = await db.select().from(charges).where(eq(charges.id, chargeId)).limit(1);
  if (!charge || charge.tenantId !== tenantId) return apiError("NOT_FOUND", ..., 404);

  const [updatedCharge] = await db.update(charges)
    .set({ status: "paid", paidAt: new Date(), paymentMethod })
    .where(eq(charges.id, chargeId))     // ← sin CAS: no verifica estado previo ni idempotency key
    .returning();

  return apiSuccess({ charge: updatedCharge });
});
```

```bash
$ wc -l /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/app/api/quick-actions/record-payment/route.ts
      53
$ grep -nE "eq\(charges\.status|paidAt.*null|version|compareAndSwap|optimistic|lock|idempot" \
    /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/app/api/quick-actions/record-payment/route.ts
(sin resultados — no hay compare-and-swap ni verificación de estado previo)
```

Doble POST concurrente con mismo `chargeId` ⇒ dos updates successful, `paidAt` se sobreescribe, ledger no se contabiliza por partida doble, no hay idempotency token. Sin lock pesimista (`SELECT ... FOR UPDATE`), sin CAS con `eq(charges.status, "pending")`. **Gap abierto, idéntico al ZAL-955.**

### 2.3 metrics reset rol+lock — `src/app/api/metrics/route.ts`

```ts
// route.ts:43-66
export async function POST(req: Request): Promise<NextResponse> {
  if (isProduction()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Reset metrics — sin auth wrapper
  metrics.requests = { total: 0, byMethod: {}, byStatus: {} };
  metrics.errors = { total: 0, byType: {}, byEndpoint: {}, recent: [] };
  metrics.responseTime = { avg: 0, p95: 0, p99: 0, byEndpoint: {} };
  metrics.dbOperations = { total: 0, slowQueries: 0, errors: 0 };
  metrics.lastReset = new Date().toISOString();
  responseTimes.length = 0;
  ...
}
```

```bash
$ grep -n "withTenant\|withAuthenticated\|requireAuth\|role.*owner\|role.*admin" \
    /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/app/api/metrics/route.ts
10:import { withTenant } from "@/lib/authz";
17:export const GET = withTenant(async (): Promise<NextResponse> => {
```

`POST /api/metrics` (reset) es `async function` plana. Solo gatea `isProduction()`. No hay `withTenant`, no hay chequeo de rol, no hay rate limit. En cualquier entorno no-prod (incluido staging), cualquier caller — autenticado o no — puede pisar `metrics.*` y `responseTimes.length = 0`. Diferencia con `GET`: el GET sí está dentro de `withTenant`. **Gap abierto, idéntico al ZAL-955.**

### 2.4 dev/session gate per-request — `src/app/api/dev/session/route.ts`

```ts
// route.ts (resumen funcional)
function isDevEnabled() { return isDevSessionEnabled; }

export async function POST() {
  if (!isDevEnabled()) {
    return NextResponse.json({ error: "DEV_SESSION_DISABLED" }, { status: 404 });
  }
  // ... genera cookie dev httpOnly con DEV_USER_ID/DEV_TENANT_ID/DEV_ACADEMY_ID
  ...
}
export const GET = POST;
```

```bash
$ grep -n "withTenant\|withAuthenticated\|requireAuth\|verifyToken" \
    /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/app/api/dev/session/route.ts
(sin resultados — sin wrapper de auth)
$ cat /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/lib/dev-session.ts | sed -n '30,55p'
  if (!isDevSessionEnabled || !rawValue) {
    return null;
  }
  ...
  if (!isDevSessionEnabled) {
    return null;
  }
```

El endpoint depende exclusivamente del flag env `isDevSessionEnabled`. No hay auth por-request. Si el flag está activo en staging/preview/Preview deployments de Vercel (que heredan env), un atacante externo puede pedir `POST /api/dev/session` y obtener cookie httpOnly con `DEV_TENANT_ID = 33333333-aaaa-bbbb-cccc-333333333333`, loguearse como `Directora Demo` (owner) y pivotar al dashboard completo del tenant demo. **Gap abierto, idéntico al ZAL-955.**

### 2.5 GET events withTenant+404 — `src/app/api/events/route.ts`

```ts
// route.ts:48-67
export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return apiError("INVALID_FILTERS", ..., 400);
    const { page, limit, ...filters } = parsed.data;
    const { items, total } = await listEvents(filters, context.tenantId);   // ✓ tenant-bound
    return apiSuccess({ items }, { total, page, pageSize: limit });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events", method: "GET" });
  }
});
```

```bash
$ grep -n "withTenant\|tenantId" /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/app/api/events/route.ts
9:import { withTenant } from "@/lib/authz";
25:    withTenant(async (request, context) => {
29:        tenantId: context.tenantId,
48:export const GET = withTenant(async (request, context) => {
58:    const { items, total } = await listEvents(filters, context.tenantId);
```

`GET /api/events` pasa `context.tenantId` a `listEvents(...)`. Verifiqué que el control está bien aplicado. **OK — único control que cumple.**

### 2.6 fanout tenant-bound — `src/lib/notifications/event-recipients.ts`

```ts
// event-recipients.ts:40-87
export async function getAcademiesEmailsByLocation(
  academyId: string,
  locationType: "city" | "province" | "country"
): Promise<string[]> {
  const [organizingAcademy] = await db
    .select({ country: academies.country, region: academies.region, city: academies.city })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  if (!organizingAcademy) return [];

  const filters: ...[] = [
    eq(academies.isSuspended, false),
    sql`${academies.id} != ${academyId}`,
  ];
  // ... filtros por locationType
  const targetAcademies = await db.select(...).from(academies).where(and(...filters));
  ...
}
```

```bash
$ grep -n "tenantId\|tenant_id" /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/lib/notifications/event-recipients.ts
$ wc -l /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/src/lib/notifications/event-recipients.ts
     121
```

Cero ocurrencias de `tenantId` en todo el archivo. La función devuelve emails de **todas** las academias de la misma ciudad/provincia/país sin filtrar por tenant — exactamente el patrón cross-tenant que ZAL-959 ya marcó como FAIL. Si dos academias comparten ciudad, el organizador recibe emails de la otra academia (de distinto tenant). **Gap abierto, idéntico al ZAL-959.**

---

## 3. Resumen ejecutivo

| # | Control | Estado | Evidencia literal |
|---|---|---|---|
| 1 | PATCH empleo whitelist | OPEN | `route.ts:49-55` spread de body sin whitelist |
| 2 | record-payment CAS | OPEN | `route.ts:43-45` update sin CAS ni idempotency |
| 3 | metrics reset rol+lock | OPEN | `route.ts:47-58` POST sin wrapper auth |
| 4 | dev/session gate per-request | OPEN | `route.ts` solo flag env, sin auth wrapper |
| 5 | GET events withTenant+404 | OK | `route.ts:48-67` con `context.tenantId` |
| 6 | fanout tenant-bound | OPEN | `event-recipients.ts` sin filtro `tenantId` |

| Infraestructura QA | Estado |
|---|---|
| `vitest.qa.config.ts` | INEXISTENTE |
| `tests/qa/` | INEXISTENTE |
| `tests/qa/zal-565/hardening.test.ts` | INEXISTENTE |
| Comando exigido por la issue | FALLA con `Could not resolve` |

---

## 4. Disposición

`FAIL` bloqueante. Replicación exacta del gap ZAL-955/958/959/960: Engineering Lead no ha tocado los 6 controles desde el último verdict adverso. No hay progreso ejecutable hacia cierre de ZAL-957 desde la perspectiva de Platform & Security.

**Owner del bloqueo:** Engineering Lead (Elvis).
**Acción de desbloqueo:** materializar los 5 controles P0 abiertos (PATCH whitelist, record-payment CAS, metrics reset wrapper, dev/session auth wrapper, fanout tenantId) + crear `vitest.qa.config.ts` y `tests/qa/zal-565/hardening.test.ts` con cobertura literal de los 5.

**Cross-issue cap:** esta revalidación se publica en ZAL-961 como issue propia; no PATCH a ZAL-957.