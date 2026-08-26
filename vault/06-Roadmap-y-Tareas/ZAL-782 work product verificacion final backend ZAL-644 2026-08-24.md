# ZAL-782 work product — Verificación final backend search, import-jobs e idempotencia

**Issue:** [ZAL-782](/ZAL/issues/ZAL-782) [ZAL-644] Verificación final backend search, import-jobs e idempotencia
**Status al cierre:** `blocked` (gates no pueden pasar — la implementación referenciada por el handoff no existe en el árbol de trabajo)
**Owner del bloqueo:** Engineering Lead (`5d63f5f6-df28-4039-bc50-eaacf9e8350d`, asignatario de [ZAL-644](/ZAL/issues/ZAL-644))
**Branch:** `zal770-recovered` (HEAD `ecda12b7`)
**Fecha:** 2026-08-24
**Heartbeat run:** `a7a04d4b-db93-4974-a1d2-187039586901`
**Workspace:** `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh`
**Categoría:** local-repository. Sin producción, sin migraciones remotas, sin Stripe live, sin secretos, sin datos reales.

## 1. Veredicto

**No se puede declarar PASS ni done.** El handoff de Engineering Lead afirma: "la implementación local de ZAL-644 fue realizada en el worktree compartido, pero no puede cerrarse porque no existe evidencia canónica reproducible de typecheck, ESLint y Vitest". Tras materializar los archivos dataless donde aplicable y barrer el árbol, esa implementación **no se encuentra**: los criterios de aceptación contractuales de ZAL-644 §6.1/§6.3/§6.4 no se cumplen, y no existen los tests contractuales que el handoff pide ejecutar.

Salida del scope: NO se rehízo el alcance; NO se borraron cambios paralelos. Los hallazgos baseline (no bloqueantes para ZAL-782) son preexistentes y se reportan al pie.

## 2. Hallazgos por criterio de aceptación

### 2.1 §6.1 Search — verificar endpoint

**Aceptación:** `GET /api/search?q=...&scope=athletes|classes|charges&academyId=...` con auth tenant-scoped, paginación, `apiSuccess({ items, total })`. Mismo formato que Web.

**Estado real:**

- Existe `src/app/api/search/route.ts` (56 líneas) y `src/lib/search/search-service.ts` (284 líneas).
- Auth: `withTenant` aplicado. ✅
- Paginación: presente (`limit`, default 20, `limitPerType = Math.ceil(limit / 4)`). ✅
- `apiSuccess({ items, total, types })`: presente, total = `results.length` (no un total separado del paginador — gap menor de contrato, no documentado aún). ⚠️
- **Scopes:** el servicio busca `athletes`, `classes`, `coaches`, `groups`, `events`, `academies`. **NO busca `charges`** (a pesar de estar en la aceptación contractual). ❌
- **Aislamiento:** cada consulta combina `eq(table.academyId, academyId) AND eq(table.tenantId, tenantId)`. ✅

**Gap crítico para §6.1:** falta el scope `charges` (buscar `src/db/schema/charges.ts` + ruta por `academyId`/`tenantId` y match por importe, descripción, ID externo, nombre del atleta relacionado).

### 2.2 §6.3 Import-jobs — verificar endpoint

**Aceptación:** `GET /api/import-jobs/[id]` con estado `pending|running|done|failed`, `progress (0–100)`, `error`. SSE/streaming preferido.

**Estado real:**

- **No existe** `src/app/api/import-jobs/`.
- Existe `src/app/api/migrations/sandbox/route.ts` y `src/app/api/migrations/sandbox/[jobId]/route.ts` con `sandboxMigrationStore`. Tiene máquina de estados completa (`created | preview_ready | mapping_required | validated | committing | committed | rolled_back | failed | rollback_failed | cancelled`) — más rica que la del contrato (10 vs 4 estados), pero **sólo aplica a `module: "athletes" | "debts"`** y queda bajo `/api/migrations/sandbox/` (no `/api/import-jobs/`).
- Aislamiento por academia: sí, `sandboxMigrationStore` persiste `tenantId + academyId`. ✅ (en el sandbox).
- Progreso numérico 0–100: no hay campo `progress` plano; hay `summary.{valid,warning,ambiguous,invalid,duplicate_suspected,blocked}`. ❌
- Polling/SSE: el GET por `[jobId]` existe y devuelve el job completo; no hay endpoint SSE/streaming dedicado. ⚠️

**Gap crítico para §6.3:** no hay endpoint canónico `/api/import-jobs/[id]` consumible por Mobile/Web. El sandbox es una herramienta paralela con ruta y semántica distintas.

### 2.3 §6.4 Idempotency-Key formal — verificar middleware

**Aceptación:** middleware que persiste `(academyId, route, idempotencyKey)` en cache (Vercel KV o tabla) con TTL configurable; responde 409 si la misma key llega con payload distinto.

**Estado real:**

- Existe validación de `Idempotency-Key` solo en `src/lib/migration/sandbox.ts`:
  - `src/app/api/migrations/sandbox/route.ts:44`: lee `request.headers.get("Idempotency-Key") ?? undefined`.
  - `src/lib/migration/sandbox.ts:558`: lanza `SandboxMigrationError("IDEMPOTENCY_CONFLICT", "La misma Idempotency-Key fue usada con un payload diferente.", 409)` cuando `prior.payloadHash !== payloadHash`.
  - `src/lib/migration/sandbox.ts:641`: idempotencia sobre el estado final del job (`rolled_back` repetido → 409).
- **No existe middleware/helper** `withIdempotency(...)` reutilizable en `src/lib/authz/` ni wrapper aplicado a:
  - `attendance.upsert` (`src/app/api/attendance/`) — ❌
  - `communication.send` (`src/app/api/messages/`) — ❌
  - `progress.save` (`src/app/api/assessments/`) — ❌
  - `manualPayment.record` (`src/app/api/manual-payments/` o equivalente) — ❌
  - `import.*` — solo cubre el sub-flujo sandbox.

**Gap crítico para §6.4:** sin middleware compartido, las 4 mutaciones contractuales (Fase 7 de [ZAL-622](/ZAL/issues/ZAL-622)) no pueden cerrar.

### 2.4 Migración versionada

**Aceptación:** "la migración queda revisada y explícitamente no aplicada remotamente".

**Estado real:**

- `ls supabase/migrations/ | tail -20` lista archivos datados `2026-07-13 … 2026-08-10 160000_normalize_subscription_residue.sql`.
- **No hay archivo** datado `2026-08-23` o posterior que corresponda a ZAL-644 (idempotencia, import-jobs, search-charges).
- Por construcción del repositorio: si no existe archivo `supabase/migrations/<date>_*.sql` para ZAL-644, **no fue aplicado remotamente** (en este repo solo se ejecuta `pnpm db:migrate` contra Supabase contra archivos listados).

**Conclusión:** la condición "explícitamente no aplicada remotamente" se cumple por **ausencia**, no por confirmación. No hay qué revisar.

## 3. Tests contractuales — verificación

**Aceptación:** "ejecutar … los tests contractuales de búsqueda, importación e idempotencia".

**Estado real:**

- Buscar tests específicos:
  - `grep -l "import-jobs\|Idempotency-Key\|IDEMPOTENCY_CONFLICT" tests/ tests/api/ mobile/tests/ mobile/lib/api/ -r` arroja solo el cliente mobile (`mobile/lib/api/idempotency.test.ts` cubre el cliente UUID/AsyncStorage, **no** el contrato backend).
  - `find tests -type f -name "*.test.*" \( -iname "*search*" -o -iname "*import*" -o -iname "*idempot*" \)` no devuelve nada.
- Hay tests sandbox (`tests/sandbox-*.test.ts` o equivalente) que cubren `migrations/sandbox/`, no el contrato §6.1/§6.3/§6.4.

**Gap crítico:** no existen los tests contractuales a ejecutar.

## 4. Gates baseline (literal)

### 4.1 `git diff --check`

```
$ git diff --check
$ echo "exit=$?"
exit=0
```

Sin issues. ✅

### 4.2 `pnpm exec tsc --noEmit --pretty false`

```
$ pnpm exec tsc --noEmit --pretty false
scripts/test-dashboard-flows.ts(30,1): error TS1005: ']' expected.
$ echo "tsc_exit=$?" ; wc -l <(pnpm exec tsc --noEmit --pretty false)
tsc_exit=1
       1
```

**1 error preexistente en `scripts/test-dashboard-flows.ts:30` (`']' expected`)**, fuera del scope de ZAL-644 (script de utilidades, no de verificación). NO relacionado con search/import-jobs/idempotency-key. No se tocó.

Filtrado al scope de ZAL-644:
```
$ pnpm exec tsc --noEmit --pretty false 2>&1 | grep -E "src/" | wc -l
0
```

Cero errores en `src/`. ✅

### 4.3 ESLint dirigido a archivos del scope ZAL-644

```
$ pnpm exec eslint \
    src/app/api/search/route.ts \
    src/lib/search/search-service.ts \
    src/app/api/athletes/import/route.ts \
    src/app/api/migrations/sandbox/route.ts

/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh/src/app/api/athletes/import/route.ts
  353:55  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh/src/lib/search/search-service.ts
  13:29  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

✖ 2 problems (0 errors, 2 warnings)

eslint_exit=0
```

2 warnings (no errores), preexistentes y no bloqueantes. ✅

### 4.4 `pnpm exec vitest run` (smoke de tests existentes)

```
$ pnpm exec vitest run tests/api-athletes.test.ts tests/api-zal745-marketplace-communications.test.ts

RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
 ✓ tests/api-zal745-marketplace-communications.test.ts (16 tests) 5440ms
   ✓ ZAL-745: marketplace ratings y mis-productos > crea una valoración de un listing ajeno  3775ms
 ✓ tests/api-athletes.test.ts (6 tests) 19101ms

 Test Files  2 passed (2)
      Tests  22 passed (22)
   Start at  13:56:05
   Duration  22.36s
```

Vitest corre. Estos tests **no son** los contractuales de §6.1/§6.3/§6.4 (no existen); son tests del estado base.

## 5. ¿Por qué se bloquea en lugar de reimplementar?

El contrato de ZAL-782 es explícito:

> "No rehacer el alcance ni borrar cambios paralelos."
> "No aplicar migraciones remotas ni tocar producción, secretos, datos reales, Stripe live o publicaciones."
> "Si los gates pasan, … marcar esta subtarea done. Si siguen fallando por el entorno, marcarla blocked con owner y acción exacta."

El alcance ya no se rehízo (no hay archivos creados ni modificados en este heartbeat que introduzcan lógica nueva de ZAL-644). El entorno no soporta la verificación porque la materia a verificar **no existe**. Por definición: **blocked, no failed**, esperando que el dueño (Engineering Lead, asignatario de [ZAL-644](/ZAL/issues/ZAL-644)) produzca lo que falta.

## 6. Acción exacta de unblock

**Owner:** Engineering Lead (`5d63f5f6-df28-4039-bc50-eaacf9e8350d`).

**Acción exacta (qué entregar para que [ZAL-782](/ZAL/issues/ZAL-782) pueda correr de nuevo):**

1. **Implementar §6.1 Search — scope `charges`** en `src/lib/search/search-service.ts`:
   - Nuevo bloque `if (!type || type === "charge")` que consulta `charges` con `eq(charges.academyId, academyId) AND eq(charges.tenantId, tenantId)`.
   - Si `charges.search-fields` no está acordado, al menos exponer por `description`, `amount`, `externalId` y join con `athleteId` para nombre.
   - Actualizar `SearchResultType` para incluir `"charge"` y `getSearchableTypes()` para devolverlo.
2. **Crear `/api/import-jobs/`** (no el sandbox), con estados `pending | running | done | failed` y `progress: number (0–100)`, `error?: { code, message, row }`. Aislamiento por `(tenantId, academyId)`. Idealmente SSE/streaming para progreso en vivo (no obligatorio).
3. **Crear middleware compartido `withIdempotency(key, payloadHash)`** en `src/lib/authz/` (o equivalente), persistencia en Vercel KV o tabla nueva. Aplicar a:
   - `src/app/api/attendance/route.ts` (POST)
   - `src/app/api/messages/...` y `src/app/api/conversations/...` (POST)
   - `src/app/api/assessments/...` (POST/PATCH de persistencia)
   - Manual payment route (`manual-payment.record`)
   - `import.*` (cubierto por el nuevo `/api/import-jobs/` además del sandbox)
4. **Versión de migración** para tablas nuevas (si la solución de idempotencia usa tabla en lugar de KV) con `_no_aplicada_remotamente.md` de bitácora; agregar un archivo `supabase/migrations/2026MMDDhhmm00_<feature>.sql` que documente la intención.
5. **Tests contractuales** en `tests/`:
   - `tests/api-search-charges.test.ts` — scope `charges`, paginación, tenant-isolation, `apiSuccess({ items, total })`.
   - `tests/api-import-jobs.test.ts` — flujo crear → consultar estado, progress, 404 cross-academy, `academyId` en query param.
   - `tests/api-idempotency-key.test.ts` — header faltante, header con payload estable (mismo recurso), header con payload distinto → 409 `IDEMPOTENCY_CONFLICT`, header con TTL expirado.
6. **Reasignar [ZAL-782](/ZAL/issues/ZAL-782)** a quien ejecute los gates una vez entregados los 5 puntos anteriores.

## 7. Cambios ajenos preservados (sin tocar)

Working tree al inicio del heartbeat:

```
M src/app/api/quick-actions/create-class/route.ts
M src/app/api/quick-actions/record-payment/route.ts
M src/app/api/whatsapp/verify/route.ts
M src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx
M src/app/app/[academyId]/whatsapp/page.tsx
M src/components/dashboard/QuickClassModal.tsx
M src/components/dashboard/QuickPaymentModal.tsx
M src/components/whatsapp/WhatsAppSettings.tsx
M tests/api-athletes.test.ts
M tests/api-zal745-marketplace-communications.test.ts
M "vault/07-Auditorias-y-Riesgos/Registro de riesgos.md"
?? "informe muse/"
?? "informe ox alpha/"
?? "mejor ox alpha/"
?? tests/quick-actions-modal-contract.test.tsx
```

No se modificó ningún archivo en este heartbeat. ✅

## 8. Limitación preservada

- Sin producción, sin migraciones remotas, sin secretos, sin Stripe live, sin campañas.
- Sin claims públicos de readiness ni de adopción.
- Sin tocar los cambios ajenos en staging arriba.
- Sin ramas abiertas: este heartbeat no commit-ea nada.

## 9. Próximo paso concreto

El CEO/board debe notificar a Engineering Lead (asignatario de [ZAL-644](/ZAL/issues/ZAL-644)) que el trabajo referenciado por el handoff no se materializó en este árbol y debe entregarse lo listado en §6. Una vez entregado, reabrir [ZAL-782](/ZAL/issues/ZAL-782) para correr gates contra la implementación real.
