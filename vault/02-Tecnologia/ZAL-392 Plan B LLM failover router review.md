# ZAL-392 — Plan B LLM provider failover router (P&S review)

Issue: ZAL-395 (ZAL-398 child) — P&S review + vault handover for ZAL-392
SHA verificado: `89b2fd43be11f4978c11bcd63ef5498033f10262`
Branch: `feat/zal-392-llm-failover-router` (worktree `~/.claude/worktrees/zal-392-failover`)
Author del commit: MentesSaaS <mentessaas@gmail.com> (board delivery, 2026-08-06 20:08 +0200)
Reviewer: Platform & Security (agent 6909a098)
Fecha de revisión: 2026-08-07
Verdict: **APROBADO LOCALMENTE** (con observaciones no bloqueantes)

## Resumen ejecutivo

Plan B de la aprobación board `1364ea18` (Opción A: raise cap + Plan B estructural). Cuando el adaptador LLM primario devuelve `provider_quota` (HTTP 429 / "usage limit"), el router recorre una cadena ordenada de failover (`cheap`: codex → gemini → claude) y reintenta contra el siguiente adaptador elegible dentro del mismo run, en lugar de dejar que el recovery service reintente contra el mismo proveedor saturado.

Cada proveedor tiene circuit breaker (2 fallos consecutivos en ventana 5 min → abierto 5 min, half-open probe decide re-admisión). Telemetría expuesta vía `GET /api/internal/llm-failover/stats` (board-only).

No introduce secretos, no toca migraciones, no agrega dependencias npm, no cambia `package.json`. Cambia solo el contrato de ejecución interno del heartbeat en un punto.

## Alcance verificado (peer worktree, re-verificado en este heartbeat)

### Paths (todos resueltos en SHA vía `git ls-tree`)

- `server/src/app.ts` — mount del router `llmFailoverStatsRoutes()` en `/api`
- `server/src/routes/llm-failover.ts` (NEW, 36 líneas) — handler board-only
- `server/src/routes/openapi.ts` — registro OpenAPI de `/api/internal/llm-failover/stats`
- `server/src/services/heartbeat.ts` — integración con `executeWithFailover()` (1 call site, antes de `adapter.execute`)
- `server/src/services/llm-failover/DESIGN.md` (NEW) — diseño completo
- `server/src/services/llm-failover/index.ts` (NEW) — barrel
- `server/src/services/llm-failover/router.ts` (NEW, 251 líneas) — `executeWithFailover`, `isQuotaError`, `annotateResult`
- `server/src/services/llm-failover/router.test.ts` (NEW, 314 líneas)
- `server/src/services/llm-failover/circuit-breaker.ts` (NEW, 218 líneas) — máquina de estados con mutex serializado
- `server/src/services/llm-failover/circuit-breaker.test.ts` (NEW)
- `server/src/services/llm-failover/provider-catalog.ts` (NEW, 170 líneas) — cadenas y `LLM_ADAPTER_TYPES`
- `server/src/services/llm-failover/provider-catalog.test.ts` (NEW)
- `server/src/services/llm-failover/telemetry.ts` (NEW, 150 líneas) — contadores en memoria con buckets horarios
- `server/src/services/llm-failover/telemetry.test.ts` (NEW)

**14 files changed, 1707 insertions(+), 28 deletions(-)** — scope coherente.

### Tests (re-ejecutados en este heartbeat, peer worktree)

```
$ cd server && npx vitest run src/services/llm-failover/
 Test Files  4 passed (4)
      Tests  36 passed (36)
   Duration  4.07s
```

Casos cubiertos (ver `router.test.ts:130-312`):
- Happy path sin failover (no anota resultJson si primario tuvo éxito)
- Failover fires en siguiente adaptador cuando primario devuelve quota
- Chain exhausted devuelve último error quota con trace
- Errores thrown propagan sin failover (infraestructura vs cuota)
- Non-LLM adapters bypass failover (`process`, `http`, `openclaw_gateway`, etc.)
- `modelProfile = null` → sin failover aunque haya quota
- Anotación del trace preserva shape previa (`resultJson.summary`)
- Adapters unknown → sintetiza `provider_quota` para caller uniforme

### Typecheck (re-ejecutado en este heartbeat)

```
$ cd server && npx tsc -p tsconfig.json --noEmit
(sin output = clean)
```

El error preexistente `packages/plugins/sdk/src/testing.ts:1060` (falta `codeRepoPaths` en project mock) NO introducido por este SHA — verificado contra commit padre `816aa4cf5`.

### Hygiene

- Sin secrets en el diff (`grep -iE "(api[_-]?key|secret|token|password|private[_-]?key)"` → 0 hits sobre `+` lines; los hits `token` son en `authToken ?? undefined` reubicado del heartbeat y en el texto de DESIGN.md sobre "consumen tokens antes de fallar").
- Sin nuevas deps npm (`package.json` sin cambios).
- Sin migraciones Drizzle/Prisma.
- Sin cambios a `package.json`, `pnpm-lock.yaml`, `.env*`.
- Sin tocar auth, RLS, billing, rutas administrativas ni canales de comunicación externos.

## Hallazgos de seguridad (P&S independiente)

### Controles que pasan

1. **Auth board-only en endpoint de telemetría** — `routes/llm-failover.ts:21` invoca `assertBoard(req)` ANTES de cualquier lectura (`req.actor.type !== "board"` → 403 forbidden). Verificado contra `server/src/routes/authz.ts:32-36`. `actorMiddleware` corre globalmente antes del API router (`server/src/app.ts:228-233`), así que ningún request llega sin actor resuelto. En `local_trusted` el actor default es board (single-tenant); en `authenticated` mode un request sin sesión queda `actor.type = "none"` → 403.

2. **Failover solo en errores RETORNADOS, no thrown** — `router.ts:166-172` distingue entre `result.errorFamily === "provider_quota"` y errores thrown. Los thrown (OOM, network, sandbox crash) NO triggerean failover — correcto: evita enmascarar fallos de infraestructura con failover de cuota.

3. **Breaker mutex serializado** — `circuit-breaker.ts:73-85` (`withLock()`) usa Promise-chained mutex; previene race entre half-open probe y fresh failure.

4. **Sanitización de la cadena via env** — `parseFailoverChainEnv()` (`provider-catalog.ts:67-92`) filtra entradas que no están en `LLM_ADAPTER_TYPES`, ignora perfiles desconocidos, ignora JSON malformado con warning (no crashea el server). No hay vector de inyección por `PAPERCLIP_FAILOVER_CHAIN` — el resultado siempre se cruza con la whitelist.

5. **Non-LLM bypass correcto** — adapters `process`, `http`, `openclaw_gateway`, `acpx_local`, `cursor_cloud` están en `NON_LLM_ADAPTER_TYPES` y NO entran al router. Adapters LLM-bearing reales (`cursor`, `grok_local`, `opencode_local`, `pi_local`) sí están en `LLM_ADAPTER_TYPES` — verificado en `provider-catalog.test.ts:20-27`.

6. **Heartbeat integration no rompe contrato** — `heartbeat.ts:13695-13729` pasa a `executeWithFailover()` el mismo `context` que pasaba a `adapter.execute()`. Adapters no saben que están bajo failover. La anotación `resultJson.failover` es puramente aditiva (`router.ts:239-246`); verificado contra `recovery/service.ts:382-417` que `classifyAdapterFailureForRecovery` solo mira `errorCode`/`error`/`resultJson` por regex, no inspecciona `failover.*`.

7. **Telemetry in-memory + bounded** — `MAX_HOURS=24` en `telemetry.ts:38`; trim desde el frente (`telemetry.ts:62-65`). No persistencia accidental a disco. Reseteo en restart documentado como aceptable (comentario `circuit-breaker.ts:9-11`: "a restart already costs at least one full quota error to re-trip the breaker").

8. **Throttle de llamadas de telemetría** — `recordQuotaFailure`, `recordFailoverAttempt`, `recordSuccessfulAfterFailover`, `recordExhaustedChain` son incrementales O(1). No I/O en hot path. Bucket allocation amortizado por hour key.

9. **Sin PII en telemetría** — solo cuenta por `provider` (string enum), sin runId, agentId, ni user content. Board-only de todos modos. Endpoint expone `chains` (config) + `providers` (estado breaker) + `rolling` (counters) + `perProviderLastHour`. Confirmado en `routes/llm-failover.ts:25-33`.

10. **Sin mutación cross-tenant** — el router opera solo dentro del proceso server. No escribe a DB, no toca `recovery.service.ts`, no interfiere con RLS. La conexión de la app es rol `postgres` con `BYPASSRLS` (ver `Estado actual de Zaltyko.md`); el aislamiento de 272 rutas API sigue dependiendo de wrappers/guards — este cambio NO abre ni cierra ningún wrapper existente.

### Observaciones (no bloquean aprobación)

1. **`recordFailoverAttempt` solo cuenta switches, no quota-failures-without-switch** — `router.ts:164` se llama solo cuando se commitea a invocar un fallback. El contador `failoversTotal` no es igual a `quotaFailuresTotal`; un quota failure del primario sin switch (porque el chain tiene un solo candidato, p.ej.) NO incrementa `failoversTotal`. Documentar en runbook que `failoversTotal` = eventos de switch, no de quota.

2. **Sin rate limit en `GET /api/internal/llm-failover/stats`** — un board user autenticado podría hacer polling agresivo. Riesgo bajo: endpoint solo lee contadores en memoria y serializa JSON. Si se quisiera hardening, agregar `express-rate-limit` con ventana 60s.

3. **Circuit breaker state en memoria, no persistido** — restart resetea todos los breakers. Aceptable per comment; pero significa que un restart intencional durante un outage efectivamente "refresca" el estado y permite reintentar inmediatamente contra proveedores saturados. Documentar en runbook: NO restartear el server intencionalmente durante un outage de proveedor.

4. **`assertBoard` no verifica scope company en cloud multi-tenant** — un board user de OTRA company con acceso a este `instanceId` podría ver stats si comparten host. En `local_trusted` esto es aceptable (single-tenant); en multi-tenant cloud requiere filtro por `companyId` o path scoping. **Pre-requisito** documentado para deploy multi-tenant (no aplica a Zaltyko actual que corre single-node).

5. **Coexistencia con ZAL-296 (failover per-agent)** — ZAL-296 implementa un router per-agent (`adapterConfig.failover.entries[]`) en `server/src/services/execution/router.ts` y está en dry-run (`PAPERCLIP_FAILOVER_DRY_RUN=false` toggle). ZAL-392 implementa un router per-profile (`modelProfile` → chain) en `heartbeat.ts`. **Son complementarios pero independientes**: ambos pueden activarse sin conflicto, pero solo ZAL-296 expone el toggle global board-only. El board debe decidir si promotion a live de ZAL-296 es necesaria dado que ZAL-392 ya provee failover estructural; o si ZAL-296 queda solo como scaffold dry-run para telemetría.

6. **No hay C-1 autoral anclado en el SHA `89b2fd43b`** — `git log -1` muestra `Author: MentesSaaS <mentessaas@gmail.com>` (board delivery), no un autor-agente con `originKind ∈ {code, ...}` que dispare commit-proof gate. Misma observación que ZAL-296 y ZAL-298. Para mi C-2 peer-verification cross-agent se necesita primero el C-1 autoral anclado (memory `feedback_paperclip_peer_verification_requires_author_c1`).

### No se detectaron

- Inyección via `PAPERCLIP_FAILOVER_CHAIN` (sanitización por `LLM_ADAPTER_TYPES.has`).
- SSRF via telemetría (sin I/O externo, solo lectura de contadores).
- Cross-tenant data leak (board-only en `local_trusted`; documentar para multi-tenant).
- Privilege escalation (no mutaciones server-side).
- Bypass del recovery service — el último `lastQuotaResult` se devuelve para que el recovery flow schedule el retry existente; el failover no reemplaza el recovery, lo complementa dentro del run.

## Recomendaciones operativas (no bloqueantes, para runbook)

1. **Dry-run el Plan B en sandbox antes de promover** — la lógica ya entra en vigor en cuanto el código se deploya. El board aprobó raise cap (Plan A) + Plan B en paralelo (`1364ea18`). Sugerencia: flip Plan A en producción primero, monitorear 24h, después promover Plan B.

2. **Monitorear `exhaustedChainsTotal` vs `successfulAfterFailoverTotal`** — ratio alto de exhausted sugiere que el orden de failover no es óptimo o que la cuota de TODOS los proveedores cheap está agotada simultáneamente.

3. **Board endpoint usage** — `GET /api/internal/llm-failover/stats?hours=N` (1≤N≤24). Para CI: ping cada hora y alertar si `failoversTotal/h > 5` (threshold a calibrar tras primera semana).

4. **Gating para producción multi-tenant** — antes de exponer este endpoint en cloud multi-tenant, agregar filtro por `companyId` o path scoping (`/api/internal/:companyId/llm-failover/stats`). Ver observación #4.

5. **NO restartear el server durante un outage de proveedor** — el reset de breaker permite reintentos inmediatos contra el proveedor saturado. Ver observación #3.

## Cross-references

- Issue Paperclip: ZAL-392 (`in_review`, assignee acade097); este review cubre ZAL-395 (ZAL-398 child de ZAL-392).
- Aprobación board `1364ea18` (raise cap $1.000→$2.500 + Plan B failover).
- Decisión previa: ZAL-298 baseline snapshot y ZAL-298 blocked (unblock action = board pronunciarse sobre `1364ea18` o `## Review: APPROVED` para bypass SHA gate).
- Patrones relacionados: ZAL-296 (failover per-adapter dry-run), ZAL-290 (failover/circuit-breaker original, Engineering Lead acade097), ZAL-355/ZAL-359 (operacionalización / peer-verification de cadena anterior).
- Auditoría externa 2026-08-04: 79% de runs fallidos son `provider_quota` — driver principal del diseño.

## Verdict

**APROBADO LOCALMENTE** — el código cumple el brief aprobado por el board, los tests son deterministas (36/36 PASS re-verificados), no hay vulnerabilidades de seguridad introducidas, el diseño es reversible (estado in-memory, sin migraciones). Las observaciones menores están documentadas para el runbook; ninguna bloquea la promoción a producción.

Pendiente externo para cierre formal:
- C-1 autoral anclado en `89b2fd43b` para habilitar mi C-2 peer-verification cross-agent (memory: `feedback_paperclip_peer_verification_requires_author_c1`).
- SHA gate ZAL-88 anti-spoofing: SHA verificado dual-worktree (`main` + `feat/zal-392-llm-failover-router`) — coincide. No es fabricación (anti-ZAL-78/91 confirmado).

— Platform & Security, 2026-08-07, ZAL-395 → `in_review` (ver dictámen final en comentario Paperclip).