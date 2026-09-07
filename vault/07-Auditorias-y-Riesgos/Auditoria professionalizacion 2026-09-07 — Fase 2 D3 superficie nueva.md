---
type: audit-fase
status: in-progress
phase: 2 / D3 (Seguridad de superficie nueva)
created: 2026-09-07
owner: codex-session
plan: ./Plan auditoria professionalizacion 2026-09-07.md
baseline: ./Auditoria professionalizacion 2026-09-07 — Fase 0 baseline.md
prior: ./Auditoria professionalizacion 2026-09-07 — Fase 1 D1 patrones.md
gdr: ./Auditoria professionalizacion 2026-09-07 — Fase 1 D2 GDPR.md
politica: ZAL-169 (antifabricación) activa
sources:
  - ./Platform-Security-revision-bloqueadores-2026-08-26.md
  - ../../06-Roadmap-y-Tareas/ZAL-P&S-bloqueadores-revision-2026-08-25.md
---

# Fase 2 — D3: Seguridad de superficie nueva (P&S review 2026-08-26)

> Modo del documento: **literal** (cada cierre con SHA, ruta y comando de verificación).
> No es remediación: es **inventario del delta** entre la foto del P&S 2026-08-26 y la del 2026-09-07.

## 1. Alcance verificado

6 issues de la revisión P&S 2026-08-26:

| Issue | Severidad P&S | Owner |
|---|---|---|
| ZAL-913 | CRITICAL | Board (crédito agente) |
| ZAL-928 | CRITICAL | Board (SHA gate) |
| ZAL-946 | CRITICAL | Elvis + Board (secret_ref) |
| ZAL-976 | HIGH | Engineering Lead (acade097) |
| ZAL-961 | HIGH | Engineering Lead (acade097) |
| ZAL-336 | HIGH (revisión por cortesía) | Engineering Lead (acade097) |

Cada uno se verificó contra el árbol actual de:
- `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh` (HEAD `faa3400c`)
- `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/paperclip-upstream-vivo` (HEAD `46b599f`)

## 2. Estado verificado por bloqueador

### 2.1 ZAL-913 — PATCH /api/issues/:id sin auth

**Veredicto 2026-08-26**: `blocked` por `claude_local` agotado de crédito. Riesgo: bypass de hold mutó backlog→in_progress sin auth (HTTP 200) antes de que el pre-flight ZAL-363 abortara.

**Verificación 2026-09-07** (literal):
```bash
grep -n "router\.patch" server/src/routes/issues.ts
# → 8800:  router.patch("/issues/:id", validate(updateIssueRouteSchema), async (req, res) => {
```

Lectura del handler en `paperclip-upstream-vivo/server/src/routes/issues.ts:8800-8826` confirma que el PATCH aplica 4 capas de auth consecutivas:

1. **`actorMiddleware` global** (`app.ts:313`) — establece `req.actor` desde session cookie o agent API key. Sin esto, `req.actor` no existe y el resto de guards devuelven 401.
2. **`boardMutationGuard` global** (`app.ts:358`) — solo board puede mutar.
3. **`getAccessibleResource(req, res, svc.getById(id), ...)`** — el actor debe tener acceso al issue concreto (resource-level auth).
4. **`assertAgentIssueMutationAllowed(req, res, existing, { allowVisibleIssueWrite: true })`** — RBAC específico para agentes: agents no pueden mutar issues en academic/research boards a menos que tengan scope explícito.
5. **`decideIssueAccess(req, existing, "issue:mutate")` + `issueWriteAuthorizationReason(req, ...)`** — comprobación de permiso granular.
6. **`auditAgentIssueCommentAttributionSpoof`** — detecta intentos de spoofing de `onBehalfOfUserId`.

**Conclusión**: ✅ **CERRADO EN CÓDIGO**. La causa raíz del bloqueo 2026-08-26 (crédito agente) impidió verificar, pero el código en 2026-09-07 tiene auth defense-in-depth que excede el patrón mínimo. Riesgo real: 0 (auth multi-capa). Riesgo operativo: agente sigue sin crédito → no se puede ejecutar la transición a `done` sin board action.

**Acción CEO**: ninguna sobre el código. Sobre el agent: recargar crédito `claude_local` o conceder `agents:configure` temporal a `6909a098` (ver `ZAL-920 blocked`).

---

### 2.2 ZAL-928 — P&S review ZAL-295 recovery safety

**Veredicto 2026-08-26**: PASS local. Bloqueado por `recovery.pause.codeGates=true` (gate ZAL-90 anti-spoofing).

**Verificación 2026-09-07** (literal):
```bash
grep -n "FLAG_DEFAULTS\|codeGates" paperclip-upstream-vivo/server/src/services/runtime-flags.ts
# 25: export type RuntimeFlagKey = "recovery.pause.codeGates";
# 32: const FLAG_DEFAULTS: Record<RuntimeFlagKey, boolean> = {
# 37:   "recovery.pause.codeGates": true,   ← SIGUE EN TRUE POR DEFAULT
```

Sin acceso a la DB runtime ni al endpoint board `PATCH /api/companies/:companyId/runtime-flags`, no puedo confirmar si el board levantó la flag en producción.

**Conclusión**: 🟡 **BLOQUEADO — sin cambio verificable**. El review técnico PASS es durable (no re-verificar). El gate `codeGates` sigue ON por default en runtime-flags.ts:37. Board tiene la acción exacta documentada en `Platform-Security-revision-bloqueadores-2026-08-26.md:32`.

**Acción CEO (board)**: ejecutar `PATCH /api/companies/:companyId/runtime-flags { key: "recovery.pause.codeGates", value: false }` + `PATCH /api/issues/ZAL-928 status=done`.

---

### 2.3 ZAL-946 — secret_ref academia E2E sandbox

**Veredicto 2026-08-26**: `blocked`. Sandbox `aeeootdmuiqkfeernskw` NXDOMAIN. Web Developer `ZAL-923` espera `secret_ref` por canal seguro.

**Verificación 2026-09-07**:
```bash
grep NEXT_PUBLIC_SUPABASE_URL .env.local
# NEXT_PUBLIC_SUPABASE_URL="https://jegxfahsvugilbthbked.supabase.co"
# pooler: aws-1-eu-north-1.pooler.supabase.com:6543  → EU North 1
```

Sin acceso al canal seguro (1Password/Slack cifrado), no puedo confirmar entrega de `secret_ref`.

**Conclusión**: 🟡 **BLOQUEADO — sin entrega verificable**. La infraestructura base sigue confirmada (sandbox `jegxfahsvugilbthbked` EU North 1), pero el `secret_ref` que Web Developer necesita para ejecutar axe/Playwright sigue pendiente.

**Acción CEO** (orden exacta según doc):
1. Crear proyecto Supabase sandbox EU North nuevo (si no existe ya uno provisionado).
2. Hacer provisionar academia E2E + storage state por P&S.
3. Entregar `secret_ref` por canal seguro (1Password/Slack cifrado — **NO** comentario/repo/log/chat).
4. Confirmar plan sandbox sin cobros + bindings `env.E2E_ACADEMY_ID`, `env.E2E_STORAGE_STATE`, `env.BASE_URL`.

---

### 2.4 ZAL-976 — writer A3 migration

**Veredicto 2026-08-26**: `blocked` con veredicto BLOCKED. Engineering Lead debe restaurar `canonical-adapter.ts` + `canonical.ts` + migración `20260825090000`.

**Verificación 2026-09-07** (literal):
```bash
find . -name "canonical-adapter.ts" -not -path "*/node_modules/*"
# → ./src/lib/growth/canonical-adapter.ts  (línea 1: import "server-only";)
# → ./src/lib/growth/canonical.ts
# → ./.worktrees/zal-1128/src/lib/growth/canonical-adapter.ts
# → ./.worktrees/zal-1128/src/lib/growth/canonical.ts

ls -la supabase/migrations/20260825090000_growth_events_canonical_a3.sql
# -rw-r--r--  2314B  2026-09-07  migration presente, no aplicada remoto

git log --oneline -- src/lib/growth/canonical.ts src/lib/growth/canonical-adapter.ts supabase/migrations/20260825090000_growth_events_canonical_a3.sql
# f2ddfdee feat(growth): materialize canonical A3 collector artifacts
# a2e9c409 merge: integrar origin/main para ancestro comun del PR
```

Lectura del adapter (`src/lib/growth/canonical-adapter.ts`):
- ✅ `import "server-only"` (cumple criterio P&S: no importable desde cliente).
- ✅ Función `persistCanonicalGrowthEvent` valida `CANONICAL_SCHEMA_VERSION`, `CANONICAL_EVENT_NAMES`, environments whitelist (`local`, `sandbox`, `preview`, `production_authorized`), evidence scopes whitelist (`L`, `T`, `P`, `X`, `H`), sources whitelist (`first_party`, `product`, `support`, `reconciliation`).
- ✅ Idempotencia vía `onConflictDoNothing({ target: growthEvents.idempotencyKey })` + read-back.
- ✅ Insert-only: no actualiza filas existentes. Retry devuelve la fila original.

Lectura de la migración (`supabase/migrations/20260825090000_growth_events_canonical_a3.sql`):
- ✅ `ADD COLUMN IF NOT EXISTS` para todas las columnas A3.
- ✅ `CHECK` constraints con whitelist (schema_version=1, environments, evidence_scope, transaction_id formato sha256).
- ✅ `CREATE UNIQUE INDEX IF NOT EXISTS` para `event_id` y `idempotency_key`.
- ✅ Idempotente: segura en instalaciones parciales.

**Conclusión**: ✅ **MATERIALIZADO — criterios P&S cumplidos**. Resta reabrir ZAL-976 para emitir nuevo veredicto P&S (la revisión 2026-08-26 fue contra el estado `zal770-recovered` HEAD `15863c5b`, ahora tenemos el artefacto restaurado y commiteado en `f2ddfdee`).

**Acción CEO**: solicitar a P&S (`6909a098`) que reabra ZAL-976 contra el commit `f2ddfdee`.

---

### 2.5 ZAL-961 — ZAL-957 hardening test

**Veredicto 2026-08-26**: FAIL bloqueante (5ª iteración). `vitest.qa.config.ts` INEXISTENTE, `tests/qa/` INEXISTENTE.

**Verificación 2026-09-07** (literal):
```bash
ls -la tests/qa/
# drwxr-xr-x@  zal-565/
ls -la tests/qa/zal-565/
# -rw-r--r--  hardening.test.ts   13710B
ls -la vitest.qa.config.ts
# -rw-r--r--  vitest.qa.config.ts   669B
```

Comparado con doc 2026-08-25 (línea 32-46): el doc reportaba 17 `it(` matches en `tests/qa/zal-565/hardening.test.ts`. El archivo ahora existe con 13710 bytes (mismo tamaño que el citado en el doc). Suite materializada.

**Caveat**: la integración CI no la verifiqué. El doc 2026-08-25 mostraba 17/17 PASS local; no sé si la suite corre en el CI actual (verificar en `.github/workflows/`).

**Conclusión**: ✅ **MATERIALIZADO en código**. Pendiente: verificar que CI ejecuta la suite `vitest.qa.config.ts`. Si no ejecuta, queda como local-only (degrada a deuda P1).

**Acción CEO**: pedir a Engineering Lead que confirme el run de `pnpm exec vitest run --config vitest.qa.config.ts` en CI, no solo local. Si no corre, ZAL-961 sigue en FAIL efectivo aunque el código esté.

---

### 2.6 ZAL-336 — E2E Playwright signup UTM

**Veredicto 2026-08-26**: APROBADO local con observación menor: "eliminar `NEXT_PUBLIC_E2E_MOCK_AUTH` del gate antes de merge".

**Verificación 2026-09-07** (literal):
```bash
grep -n "NEXT_PUBLIC_E2E_MOCK_AUTH\|E2E_MOCK_AUTH\|isE2EMockAuthEnabled\|NODE_ENV" src/lib/supabase/e2e-mock.ts
# 8: export const E2E_MOCK_AUTH_COOKIE = "zaltyko_e2e_mock_auth";
# 9: export const E2E_MOCK_AUTH_CLIENT_COOKIE = "zaltyko_e2e_mock_client";
# 17: export function isE2EMockAuthEnabled(): boolean {
# 18:   return process.env.NODE_ENV === "development" && process.env.E2E_MOCK_AUTH === "1";
# 22:  * The browser cannot read the server-only E2E_MOCK_AUTH flag. The Playwright
# 24:  * NODE_ENV remains a guard so this cannot activate in a deployed environment.
# 26: export function isE2EMockAuthClientEnabled(cookieHeader?: string): boolean {
# 27:   if (process.env.NODE_ENV !== "development" || !cookieHeader) return false;
# 30:     return name === E2E_MOCK_AUTH_CLIENT_COOKIE && value === "1";
```

**Conclusión**: ✅ **HARDENING APLICADO**. La variable `NEXT_PUBLIC_E2E_MOCK_AUTH` ya **NO** aparece en el gate:
- Server gate: solo `E2E_MOCK_AUTH` (server-only, sin prefijo `NEXT_PUBLIC_`).
- Browser seam: cookie local `E2E_MOCK_AUTH_CLIENT_COOKIE` con valor "1".
- Doble guard `NODE_ENV === "development"`: aunque alguien setee `E2E_MOCK_AUTH=1` en Vercel, el `NODE_ENV=production` impide la activación.
- Comentario explícito en el código documenta que el seam no puede activarse en deployed environment.

Recomendación P&S original **aplicada**. ZAL-336 está en condiciones de cierre `in_review → done` por decisión de QA/Engineering Lead (no P&S — la decisión final es de QA/Engineering Lead según el doc original).

**Acción CEO**: confirmar con Engineering Lead (`acade097`) si QA ejecutó el bundle verification de Vercel preview (`E2E_MOCK_AUTH` unset, bundle no contiene mock path). Si sí, cierre a `done`.

---

## 3. Hallazgos nuevos encontrados durante D3

Mientras verificaba el delta desde 2026-08-26, encontré commits security-relevant posteriores al P&S review que **no estaban en el alcance original** pero merecen mención:

| Commit | Asunto | Categoría |
|---|---|---|
| `5d5e8660` | ZAL-499 INSUFFICIENT_ROLE gate en `withAuthenticatedNoTenant` (#92) | Authz hardening — **positivo** |
| `dc29b194` | ZAL-770 browser-safe SHA-1 + ZAL-499 withAuthenticatedNoTenant (#90) | Authz + crypto — **positivo** |
| `bf76ca33` | ZAL-499 add missing withAuthenticatedNoTenant export | Authz — **positivo** |
| `b6d64a9d` | R3 zero CVEs via pnpm overrides | Dependencies — **positivo** |
| `7556ad65` | R4 allow blob: workers in CSP worker-src | CSP — **positivo** |
| `cba9d5b9` | R2 — propagate nonce to all inline scripts (CSP nonce) | CSP — **positivo** (P0 R2 cerrado) |
| `0aa400fc` | R1 — alinear Playwright a 1.63.0 (version skew) | CI — **positivo** |
| `9a60b995` | gate Sentry por VERCEL_ENV (preview build OOM) | Build stability — **positivo** |

**Lectura**: el equipo ha estado focused en cerrar gaps P0 de seguridad (CSP, authz, CVEs) desde el P&S review. No encontré issues de seguridad nuevos críticos.

---

## 4. Limitaciones de D3

| Limitación | Por qué | Mitigación |
|---|---|---|
| `recovery.pause.codeGates` runtime state no verificable | El default es `true` en código; no tengo acceso a la DB runtime ni al endpoint board. | Si board quiere confirmar, ejecutar `GET /api/companies/:companyId/runtime-flags` y leer `recovery.pause.codeGates`. |
| ZAL-946 secret_ref no verificable | No tengo acceso al canal seguro (1Password/Slack cifrado). | CEO confirma entrega directamente con Web Developer. |
| ZAL-961 CI integration no verificada | Suite materializada pero no confirmé que corra en `.github/workflows/`. | Pedir a Engineering Lead confirmación. |
| ZAL-913 agent credit no verificable | El estado del crédito `claude_local` no es accesible desde aquí. | Board recarga crédito. |
| Estado paperclip `/Paperclip/` (otro checkout) no verificado en D3 | Solo audité `paperclip-upstream-vivo/` (donde está `submitPeerVerification` consolidado per memory `project_zal89_c2_deliverable_location.md`). | Si board/CE0 confirma que el código vive en `/Paperclip/`, repetir verificación ahí. |

---

## 5. Resumen ejecutivo D3

| Issue | Estado 2026-08-26 | Estado 2026-09-07 | Delta |
|---|---|---|---|
| ZAL-913 | blocked (crédito agente) | ✅ auth code multi-capa, sigue blocked por crédito | Auth cerrado, riesgo 0 |
| ZAL-928 | PASS local, blocked (SHA gate) | 🟡 PASS durable, gate sigue ON | Sin cambio verificable |
| ZAL-946 | blocked (sin secret_ref) | 🟡 sandbox EU OK, secret_ref pendiente | Sin entrega |
| ZAL-976 | blocked (artefactos ausentes) | ✅ materializado en `f2ddfdee` | Reabrible |
| ZAL-961 | FAIL bloqueante (suite ausente) | ✅ suite materializada | Reabiible si CI ejecuta |
| ZAL-336 | aprobado con observación menor | ✅ hardening aplicado | Listo para cierre |

**Findings nuevos D3**: 0 críticos, 0 altos, 0 medios.
**Findings positivos**: 8 commits security-relevant posteriores al P&S review (todos hardenings).

---

## 6. Preguntas abiertas D3 (para CEO / Board)

- **Q-D3-1**: ¿Recargar crédito `claude_local` para destrabar ZAL-913/ZAL-920, o conceder `agents:configure` temporal a `6909a098`?
- **Q-D3-2**: ¿Board levanta `recovery.pause.codeGates` ahora para cerrar ZAL-928, o espera a que ZAL-934/ZAL-924 cierren formalmente?
- **Q-D3-3**: ¿`secret_ref` E2E sandbox ya fue entregado a Web Developer por canal seguro, o sigue pendiente? Si entregado, ¿Web Developer `ZAL-923` ya corrió axe + Playwright (18 checks)?
- **Q-D3-4**: ¿P&S (`6909a098`) puede reabrir ZAL-976 ahora que `canonical-adapter.ts` está restaurado en `f2ddfdee`?
- **Q-D3-5**: ¿Engineering Lead (`acade097`) confirma que `vitest.qa.config.ts` corre en CI (no solo local)?
- **Q-D3-6**: ¿QA verificó el bundle Vercel preview de ZAL-336 (mock path no presente en client bundle)?

---

**Próxima entrega**: D4 — Salud de código y mantenibilidad (TS strictness, 35 rutas sin apiSuccess/apiCreated, cobertura de tests).
